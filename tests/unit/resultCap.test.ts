import { afterEach, describe, expect, it, vi } from "vitest";
import { callList, jsonResult, setMaxResultBytes } from "../../src/tools/helpers.js";
import { buildServer } from "../../src/server.js";
import type { SnipeitClient } from "../../src/client/snipeitClient.js";
import { DEFAULT_MAX_RESULT_BYTES } from "../../src/constants.js";

const MIB = 1_048_576;
const textOf = (r: { content: unknown[] }) => (r.content[0] as { text: string }).text;
const bytes = (s: string) => Buffer.byteLength(s, "utf8");

/** About 500 bytes per row once serialized, with non-ASCII to exercise byte (not char) counting. */
function fakeRow(i: number) {
  return {
    id: i,
    name: `Laptop ${i} Größe`,
    asset_tag: `JW-${String(i).padStart(6, "0")}`,
    notes: "x".repeat(380),
  };
}

/** A mock client serving a list endpoint with `total` rows in pages. */
function listClient(total: number) {
  const request = vi
    .fn()
    .mockImplementation(
      async (_m: string, _p: string, opts: { query: { limit: number; offset: number } }) => {
        const { limit, offset } = opts.query;
        const rows = [];
        for (let i = offset; i < Math.min(offset + limit, total); i++) rows.push(fakeRow(i));
        return { data: { total, rows }, status: 200, headers: new Headers() };
      },
    );
  return { client: { request } as unknown as SnipeitClient, request };
}

afterEach(() => setMaxResultBytes(DEFAULT_MAX_RESULT_BYTES));

describe("callList all:true respects SNIPEIT_MAX_RESULT_BYTES", () => {
  it("10000 rows: stops paginating at the cap, returns rows so far with truncated, next_offset, total", async () => {
    const { client, request } = listClient(10_000);
    const out = await callList(client, "/hardware", { all: true });
    const data = out.data as {
      total: number;
      rows: { id: number }[];
      truncated?: boolean;
      next_offset?: number;
    };
    expect(data.truncated).toBe(true);
    expect(data.total).toBe(10_000);
    expect(data.rows.length).toBeGreaterThan(0);
    expect(data.rows.length).toBeLessThan(10_000);
    expect(data.next_offset).toBe(data.rows.length);
    expect(data.rows.at(-1)?.id).toBe(data.rows.length - 1);
    // stopped early instead of walking all 50 pages
    expect(request.mock.calls.length).toBeLessThan(15);

    const text = textOf(jsonResult(out.data, { pagination: out.pagination }));
    expect(bytes(text)).toBeLessThanOrEqual(DEFAULT_MAX_RESULT_BYTES);
    const parsed = JSON.parse(text) as { data: typeof data };
    expect(parsed.data.truncated).toBe(true);
    expect(parsed.data.next_offset).toBe(parsed.data.rows.length);
    // the cap is used well, not just barely respected
    expect(bytes(text)).toBeGreaterThan(DEFAULT_MAX_RESULT_BYTES * 0.9);
  });

  it("a small list that fits keeps the old shape (no truncated field)", async () => {
    const { client } = listClient(300);
    const out = await callList(client, "/hardware", { all: true });
    expect(out.data).toEqual({ total: 300, rows: expect.any(Array) });
    expect(out.data.rows).toHaveLength(300);
    expect("truncated" in out.data).toBe(false);
  });

  it("honours a configured cap", async () => {
    setMaxResultBytes(65_536);
    const { client } = listClient(10_000);
    const out = await callList(client, "/hardware", { all: true });
    const text = textOf(jsonResult(out.data));
    expect(bytes(text)).toBeLessThanOrEqual(65_536);
    expect(JSON.parse(text).data.truncated).toBe(true);
  });
});

describe("jsonResult caps oversized results as valid JSON", () => {
  it("a single page {total, rows}: trims rows and fixes next_offset and the pagination hint", () => {
    setMaxResultBytes(65_536);
    const rows = Array.from({ length: 500 }, (_, i) => fakeRow(1000 + i));
    const r = jsonResult(
      { total: 5000, rows },
      {
        pagination: { total: 5000, returned: 500, offset: 1000, limit: 500, hasMore: true, nextOffset: 1500 },
      },
    );
    const text = textOf(r);
    expect(bytes(text)).toBeLessThanOrEqual(65_536);
    const parsed = JSON.parse(text);
    const kept = parsed.data.rows.length;
    expect(kept).toBeGreaterThan(0);
    expect(kept).toBeLessThan(500);
    expect(parsed.data.truncated).toBe(true);
    expect(parsed.data.next_offset).toBe(1000 + kept);
    expect(parsed.pagination).toMatchObject({ returned: kept, nextOffset: 1000 + kept, hasMore: true });
  });

  it("a top-level array: trims items and adds a truncation marker", () => {
    setMaxResultBytes(65_536);
    const arr = Array.from({ length: 1000 }, (_, i) => fakeRow(i));
    const text = textOf(jsonResult(arr));
    expect(bytes(text)).toBeLessThanOrEqual(65_536);
    const parsed = JSON.parse(text);
    expect(Array.isArray(parsed.data)).toBe(true);
    expect(parsed.truncated).toMatchObject({ returned: parsed.data.length, total_items: 1000 });
  });

  it("any other oversized value: replaced by a marker, never a sliced string", () => {
    setMaxResultBytes(65_536);
    const text = textOf(jsonResult({ blob: "y".repeat(200_000) }));
    expect(bytes(text)).toBeLessThanOrEqual(65_536);
    const parsed = JSON.parse(text);
    expect(parsed.data).toMatchObject({ truncated: true, max_result_bytes: 65_536 });
    expect(parsed.data.size_bytes).toBeGreaterThan(200_000);
    expect(text).not.toContain("yyyy");
  });

  it("results under the cap are unchanged", () => {
    const r = jsonResult({ id: 1 });
    expect(JSON.parse(textOf(r))).toEqual({ data: { id: 1 } });
  });
});

describe("buildServer wires the configured cap", () => {
  it("applies cfg.maxResultBytes to tool results", () => {
    buildServer({
      apiToken: "t",
      apiBase: "https://x.example/api/v1",
      confirmWrites: true,
      timeoutMs: 1000,
      logLevel: "error",
      maxResultBytes: 2 * MIB,
    });
    const text = textOf(jsonResult({ blob: "z".repeat(1_500_000) }));
    expect(JSON.parse(text).data.blob).toHaveLength(1_500_000);
  });
});

describe("a single row larger than the cap (run-2026-10-27-4)", () => {
  const huge = (id: number) => ({ id, notes: "x".repeat(80_000) });

  it("callList all:true moves past it: next_offset 1 and the row's offset and id, so following next_offset cannot loop", async () => {
    setMaxResultBytes(65_536);
    const request = vi.fn().mockResolvedValue({
      data: { total: 3, rows: [huge(7), { id: 8 }, { id: 9 }] },
      status: 200,
      headers: new Headers(),
    });
    const out = await callList({ request } as unknown as SnipeitClient, "/hardware", { all: true });
    expect(out.data.rows).toEqual([]);
    expect(out.data.truncated).toBe(true);
    expect(out.data.next_offset).toBe(1);
    expect((out.data as { oversized_row?: unknown }).oversized_row).toEqual({ offset: 0, id: 7 });
  });

  it("a single page whose first row does not fit points past it as well", () => {
    setMaxResultBytes(65_536);
    const text = textOf(
      jsonResult(
        { total: 50, rows: [huge(3), { id: 4 }] },
        {
          pagination: { total: 50, returned: 2, offset: 10, limit: 2, hasMore: true, nextOffset: 12 },
        },
      ),
    );
    const body = JSON.parse(text);
    expect(body.data.rows).toEqual([]);
    expect(body.data.next_offset).toBe(11);
    expect(body.data.oversized_row).toEqual({ offset: 10, id: 3 });
    expect(body.pagination.nextOffset).toBe(11);
    expect(bytes(text)).toBeLessThanOrEqual(65_536);
  });
});
