import { describe, expect, it, vi } from "vitest";
import { parsePaginationHint, autoPaginate } from "../../src/client/pagination.js";

describe("parsePaginationHint", () => {
  it("detects {total, rows} envelope and computes hasMore", () => {
    const hint = parsePaginationHint({ total: 100, rows: new Array(50).fill({}) }, { limit: 50, offset: 0 });
    expect(hint?.hasMore).toBe(true);
    expect(hint?.nextOffset).toBe(50);
    expect(hint?.returned).toBe(50);
    expect(hint?.total).toBe(100);
  });

  it("returns hasMore=false on last page", () => {
    const hint = parsePaginationHint({ total: 25, rows: new Array(25).fill({}) }, { limit: 50, offset: 0 });
    expect(hint?.hasMore).toBe(false);
  });

  it("returns null for non-envelope shapes", () => {
    expect(parsePaginationHint({ foo: "bar" }, { limit: 50, offset: 0 })).toBeNull();
    expect(parsePaginationHint([1, 2, 3], { limit: 50, offset: 0 })).toBeNull();
    expect(parsePaginationHint(null, { limit: 50, offset: 0 })).toBeNull();
  });
});

describe("autoPaginate", () => {
  it("walks multiple pages and merges rows", async () => {
    const pages = [
      { total: 7, rows: [1, 2, 3] },
      { total: 7, rows: [4, 5, 6] },
      { total: 7, rows: [7] },
    ];
    let i = 0;
    const fetcher = vi.fn().mockImplementation(async (_opts: { limit: number; offset: number }) => pages[i++]);
    const out = await autoPaginate<number>(fetcher, { pageLimit: 3, maxRows: 100 });
    expect(out).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("respects maxRows cap", async () => {
    const fetcher = vi.fn().mockImplementation(async (_opts: { limit: number; offset: number }) => ({
      total: 1000,
      rows: new Array(100).fill(0),
    }));
    const out = await autoPaginate<number>(fetcher, { pageLimit: 100, maxRows: 250 });
    expect(out.length).toBe(250);
  });
});
