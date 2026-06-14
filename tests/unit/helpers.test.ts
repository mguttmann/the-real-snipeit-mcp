import { describe, expect, it, vi } from "vitest";
import { jsonResult, errorResult, redactBody, callWrite } from "../../src/tools/helpers.js";
import type { ServerContext } from "../../src/server.js";

describe("jsonResult", () => {
  it("wraps data as text content", () => {
    const r = jsonResult({ a: 1 });
    expect(r.content[0]).toMatchObject({ type: "text" });
    expect(JSON.parse((r.content[0] as { text: string }).text)).toEqual({ data: { a: 1 } });
  });

  it("includes pagination when present", () => {
    const r = jsonResult([1], { pagination: { total: 10, returned: 1, offset: 0, limit: 1, hasMore: true, nextOffset: 1 } });
    const body = JSON.parse((r.content[0] as { text: string }).text);
    expect(body.pagination.hasMore).toBe(true);
  });
});

describe("errorResult", () => {
  it("sets isError true and includes message", () => {
    const r = errorResult("nope", { statusCode: 422 });
    expect(r.isError).toBe(true);
    const body = JSON.parse((r.content[0] as { text: string }).text);
    expect(body.error).toBe("nope");
    expect(body.details.statusCode).toBe(422);
  });
});

describe("redactBody", () => {
  it("redacts password/secret/token/api_key fields recursively", () => {
    const input = { name: "x", password: "p", nested: { api_token: "t", arr: [{ secret: "s" }] } };
    const out = redactBody(input) as Record<string, unknown>;
    expect(out.password).toBe("(redacted)");
    expect((out.nested as Record<string, unknown>).api_token).toBe("(redacted)");
    expect((((out.nested as Record<string, unknown>).arr as Array<Record<string, unknown>>)[0]).secret).toBe("(redacted)");
    expect(out.name).toBe("x");
  });
});

describe("callWrite preview", () => {
  it("preview shows full URL (apiBase + path) when SNIPEIT_CONFIRM_WRITES=true", async () => {
    const ctx = {
      cfg: { confirmWrites: true, apiBase: "https://snipe.example/api/v1", apiToken: "t", logLevel: "error", timeoutMs: 1000 },
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      client: { request: vi.fn() },
    } as unknown as ServerContext;
    const res = await callWrite(ctx, {}, "test_tool", "DELETE", "/hardware/42");
    const body = JSON.parse((res.content[0] as { text: string }).text);
    expect(body.preview.url).toBe("https://snipe.example/api/v1/hardware/42");
    expect(body.preview.method).toBe("DELETE");
    expect(body.preview.tool).toBe("test_tool");
    expect(ctx.client.request).not.toHaveBeenCalled();
  });

  it("callWrite executes when SNIPEIT_CONFIRM_WRITES=false", async () => {
    const reqFn = vi.fn().mockResolvedValue({ data: { ok: true }, status: 200, headers: new Headers() });
    const ctx = {
      cfg: { confirmWrites: false, apiBase: "https://x", apiToken: "t", logLevel: "error", timeoutMs: 1000 },
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      client: { request: reqFn },
    } as unknown as ServerContext;
    await callWrite(ctx, {}, "test_tool", "POST", "/hardware", { name: "x" });
    expect(reqFn).toHaveBeenCalledWith("POST", "/hardware", { body: { name: "x" } });
  });
});
