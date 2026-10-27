/**
 * Write guard additions: read-only switch, opt-in preview binding, machine-readable
 * preview marker, query and full URL in previews, audit lines, and the oversized-write
 * note (destructive-04, destructive-05, destructive-06, destructive-07, sec-output-03,
 * sec-output-08, redteam-2026-10-27-3, redteam-2026-10-27-6).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { runGuarded } from "../../src/tools/destructiveGuard.js";
import { jsonResult, setMaxResultBytes } from "../../src/tools/helpers.js";
import { buildServer } from "../../src/server.js";
import { loadConfig } from "../../src/config.js";
import { DEFAULT_MAX_RESULT_BYTES } from "../../src/constants.js";

afterEach(() => setMaxResultBytes(DEFAULT_MAX_RESULT_BYTES));

const ok = () => vi.fn().mockResolvedValue({ content: [{ type: "text", text: "done" }] });
const textOf = (r: { content: unknown[] }) => (r.content[0] as { text: string }).text;
const req = { toolName: "t", method: "DELETE" as const, url: "https://h/api/v1/x/1" };

describe("new switches", () => {
  const base = { SNIPEIT_API_TOKEN: "t" };
  it("SNIPEIT_READ_ONLY and SNIPEIT_REQUIRE_PREVIEW default to off", () => {
    const cfg = loadConfig(base);
    expect(cfg.readOnly).toBe(false);
    expect(cfg.requirePreview).toBe(false);
  });

  it("parse like the other switches; unrecognised values turn them on with a warning", () => {
    expect(loadConfig({ ...base, SNIPEIT_READ_ONLY: "true" }).readOnly).toBe(true);
    expect(loadConfig({ ...base, SNIPEIT_REQUIRE_PREVIEW: "1" }).requirePreview).toBe(true);
    const odd = loadConfig({ ...base, SNIPEIT_READ_ONLY: "ja" });
    expect(odd.readOnly).toBe(true);
    expect(odd.warnings.join(" ")).toMatch(/SNIPEIT_READ_ONLY/);
  });

  it("SNIPEIT_REQUIRE_PREVIEW with the guard off warns that it has no effect", () => {
    const cfg = loadConfig({ ...base, SNIPEIT_REQUIRE_PREVIEW: "true", SNIPEIT_CONFIRM_WRITES: "false" });
    expect(cfg.warnings.join(" ")).toMatch(/SNIPEIT_REQUIRE_PREVIEW.*no effect/);
  });
});

describe("SNIPEIT_READ_ONLY", () => {
  it("refuses every write with a tool error, also with confirm YES and with the guard off", async () => {
    for (const cfg of [
      { confirmWrites: true, readOnly: true },
      { confirmWrites: false, readOnly: true },
    ]) {
      for (const args of [{}, { confirm: "YES" as const }]) {
        const exec = ok();
        const res = await runGuarded(cfg, args, req, exec);
        expect(exec).not.toHaveBeenCalled();
        expect(res.isError).toBe(true);
        expect(textOf(res)).toMatch(/SNIPEIT_READ_ONLY/);
        expect(JSON.parse(textOf(res)).details.code).toBe("READ_ONLY");
      }
    }
  });

  it("keeps every tool registered and lets reads through", async () => {
    const { server, ctx } = buildServer(
      loadConfig({
        SNIPEIT_API_TOKEN: "t",
        SNIPEIT_API_BASE: "https://h.example/api/v1",
        SNIPEIT_READ_ONLY: "true",
        SNIPEIT_LOG_LEVEL: "error",
      }),
    );
    const spy = vi
      .spyOn(ctx.client, "request")
      .mockResolvedValue({ data: { id: 1 }, status: 200, headers: new Headers() } as never);
    const [c, s] = InMemoryTransport.createLinkedPair();
    await server.connect(s);
    const client = new Client({ name: "ro", version: "0" });
    await client.connect(c);
    expect((await client.listTools()).tools.length).toBeGreaterThanOrEqual(183);
    const read = (await client.callTool({ name: "snipeit_get_hardware_by_id", arguments: { id: 1 } })) as {
      isError?: boolean;
    };
    expect(read.isError).toBeFalsy();
    const write = (await client.callTool({
      name: "snipeit_delete_hardware",
      arguments: { id: 1, confirm: "YES" },
    })) as { isError?: boolean };
    expect(write.isError).toBe(true);
    const raw = (await client.callTool({
      name: "snipeit_raw_request",
      arguments: { method: "GET", path: "/hardware/1" },
    })) as { isError?: boolean };
    expect(raw.isError).toBeFalsy();
    expect(spy.mock.calls.map((call) => call[0])).toEqual(["GET", "GET"]);
    await client.close();
  });
});

describe("SNIPEIT_REQUIRE_PREVIEW (opt-in preview binding)", () => {
  it("off (default): confirm YES executes in the first call, as before", async () => {
    const exec = ok();
    await runGuarded({ confirmWrites: true }, { confirm: "YES" }, req, exec);
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it("on: confirm YES executes only after a preview of the identical request, once", async () => {
    const cfg = { confirmWrites: true, requirePreview: true };
    const exec = ok();
    const first = await runGuarded(cfg, { confirm: "YES" }, { ...req, body: { a: 1, b: 2 } }, exec);
    expect(exec).not.toHaveBeenCalled();
    expect(JSON.parse(textOf(first)).hint).toMatch(/SNIPEIT_REQUIRE_PREVIEW/);
    // Same request again, keys in another order: now it was previewed.
    await runGuarded(cfg, { confirm: "YES" }, { ...req, body: { b: 2, a: 1 } }, exec);
    expect(exec).toHaveBeenCalledTimes(1);
    // The preview is used up.
    await runGuarded(cfg, { confirm: "YES" }, { ...req, body: { a: 1, b: 2 } }, exec);
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it("on: a preview of a different request does not unlock this one", async () => {
    const cfg = { confirmWrites: true, requirePreview: true };
    const exec = ok();
    await runGuarded(cfg, {}, { ...req, url: "https://h/api/v1/x/2" }, exec);
    await runGuarded(cfg, { confirm: "YES" }, req, exec);
    expect(exec).not.toHaveBeenCalled();
  });

  it("previews are kept per server config, not shared between servers", async () => {
    const exec = ok();
    await runGuarded({ confirmWrites: true, requirePreview: true }, {}, req, exec);
    await runGuarded({ confirmWrites: true, requirePreview: true }, { confirm: "YES" }, req, exec);
    expect(exec).not.toHaveBeenCalled();
  });
});

describe("preview shape", () => {
  it("carries status preview in the text and _meta snipeit/preview, never isError", async () => {
    const res = await runGuarded(
      { confirmWrites: true },
      {},
      { ...req, query: { force: true, skip: undefined } },
      ok(),
    );
    expect(res.isError).toBeUndefined();
    expect(res._meta).toEqual({ "snipeit/preview": true });
    const body = JSON.parse(textOf(res));
    expect(body.status).toBe("preview");
    expect(body.preview.query).toEqual({ force: true });
    expect(body.hint).toMatch(/Nothing was changed/);
    expect(body.hint).toMatch(/SNIPEIT_CONFIRM_WRITES/);
    expect(body.hint).not.toMatch(/=true is set/);
  });

  it("redacts credentials in the preview URL", async () => {
    const res = await runGuarded(
      { confirmWrites: true },
      {},
      { ...req, url: "https://u:pw123@h/api/v1/x" },
      ok(),
    );
    expect(textOf(res)).not.toContain("pw123");
  });

  it("the preview marker reaches an MCP client", async () => {
    const { server } = buildServer(
      loadConfig({
        SNIPEIT_API_TOKEN: "t",
        SNIPEIT_API_BASE: "https://h.example/api/v1",
        SNIPEIT_LOG_LEVEL: "error",
      }),
    );
    const [c, s] = InMemoryTransport.createLinkedPair();
    await server.connect(s);
    const client = new Client({ name: "meta", version: "0" });
    await client.connect(c);
    const res = (await client.callTool({ name: "snipeit_delete_hardware", arguments: { id: 1 } })) as {
      _meta?: Record<string, unknown>;
    };
    expect(res._meta?.["snipeit/preview"]).toBe(true);
    await client.close();
  });

  it("a raw_request write preview redacts secret query parameters and shows the rest", async () => {
    const { server } = buildServer(
      loadConfig({
        SNIPEIT_API_TOKEN: "t",
        SNIPEIT_API_BASE: "https://h.example/api/v1",
        SNIPEIT_LOG_LEVEL: "error",
      }),
    );
    const [c, s] = InMemoryTransport.createLinkedPair();
    await server.connect(s);
    const client = new Client({ name: "rawq", version: "0" });
    await client.connect(c);
    const res = (await client.callTool({
      name: "snipeit_raw_request",
      arguments: { method: "DELETE", path: "/hardware/1", query: { api_token: "other-secret", force: "1" } },
    })) as { content: { text: string }[] };
    const text = res.content[0]!.text;
    expect(text).not.toContain("other-secret");
    expect(JSON.parse(text).preview.query).toEqual({ api_token: "(redacted)", force: "1" });
    await client.close();
  });

  it("snipeit_bulk_checkout previews each concrete request", async () => {
    const { server } = buildServer(
      loadConfig({
        SNIPEIT_API_TOKEN: "t",
        SNIPEIT_API_BASE: "https://h.example/api/v1",
        SNIPEIT_LOG_LEVEL: "error",
      }),
    );
    const [c, s] = InMemoryTransport.createLinkedPair();
    await server.connect(s);
    const client = new Client({ name: "bulkp", version: "0" });
    await client.connect(c);
    const res = (await client.callTool({
      name: "snipeit_bulk_checkout",
      arguments: { items: [{ asset_id: 5, checkout_to_type: "user", assigned_user: 9 }] },
    })) as { content: { text: string }[] };
    const preview = JSON.parse(res.content[0]!.text).preview;
    expect(preview.body).toEqual([
      {
        method: "POST",
        url: "https://h.example/api/v1/hardware/5/checkout",
        body: { checkout_to_type: "user", assigned_user: 9 },
      },
    ]);
    await client.close();
  });
});

describe("audit lines", () => {
  it("logs preview, refusal and confirmed execution at info with tool, method and URL", async () => {
    const info = vi.fn();
    const logger = { info };
    await runGuarded({ confirmWrites: true }, {}, req, ok(), logger);
    await runGuarded({ confirmWrites: true }, { confirm: "YES" }, req, ok(), logger);
    await runGuarded({ confirmWrites: true, readOnly: true }, { confirm: "YES" }, req, ok(), logger);
    const lines = info.mock.calls.map((c) => `${c[0]} ${JSON.stringify(c[1])}`);
    expect(lines[0]).toMatch(/write preview.*"tool":"t".*"method":"DELETE"/);
    expect(lines[1]).toMatch(/write confirmed/);
    expect(lines[2]).toMatch(/write refused/);
  });
});

describe("oversized write result (redteam-2026-10-27-6)", () => {
  it("tells the model the write ran and must not be repeated", () => {
    setMaxResultBytes(65_536);
    const big = { id: 1, notes: "x".repeat(100_000) };
    const text = textOf(jsonResult(big, { write: true }));
    expect(text).toMatch(/write was executed/i);
    expect(text).toMatch(/do not repeat/i);
    expect(textOf(jsonResult(big))).not.toMatch(/write was executed/i);
  });
});
