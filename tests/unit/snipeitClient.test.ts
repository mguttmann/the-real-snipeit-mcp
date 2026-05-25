import { describe, expect, it, vi } from "vitest";
import { SnipeitClient } from "../../src/client/snipeitClient.js";
import { SnipeitApiError } from "../../src/client/errors.js";
import { createLogger } from "../../src/utils/logger.js";

const cfg = {
  apiToken: "tok",
  apiBase: "https://assets.example.com/api/v1",
  confirmWrites: false,
  timeoutMs: 1000,
  logLevel: "error" as const,
};

function mockFetch(impl: (req: { url: string; init: RequestInit }) => Promise<Response>) {
  return vi.fn().mockImplementation((url: string, init: RequestInit = {}) => impl({ url, init }));
}

describe("SnipeitClient.request", () => {
  it("sends Authorization: Bearer header and Accept: application/json", async () => {
    const f = mockFetch(async () =>
      new Response('{"status":"success","payload":{"ok":true}}', { status: 200, headers: { "content-type": "application/json" } }),
    );
    const c = new SnipeitClient(cfg, createLogger("error"), { fetch: f });
    await c.request("GET", "/users/me");
    const init = f.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer tok");
    expect(headers["Accept"]).toBe("application/json");
  });

  it("unwraps payload from {status:success,payload:…}", async () => {
    const f = mockFetch(async () =>
      new Response('{"status":"success","messages":"ok","payload":{"id":42}}', {
        status: 200, headers: { "content-type": "application/json" },
      }),
    );
    const c = new SnipeitClient(cfg, createLogger("error"), { fetch: f });
    const res = await c.request<{ id: number }>("GET", "/hardware/42");
    expect(res.data).toEqual({ id: 42 });
  });

  it("throws SnipeitApiError when body is {status:error} despite HTTP 200", async () => {
    const body = JSON.stringify({ status: "error", messages: { name: ["required"] }, payload: null });
    const f = mockFetch(async () =>
      new Response(body, { status: 200, headers: { "content-type": "application/json" } }),
    );
    const c = new SnipeitClient(cfg, createLogger("error"), { fetch: f });
    await expect(c.request("POST", "/hardware", { body: {} })).rejects.toBeInstanceOf(SnipeitApiError);
    await expect(c.request("POST", "/hardware", { body: {} })).rejects.toThrow(/name: required/);
  });

  it("passes through array bodies (no status envelope)", async () => {
    const arr = [{ id: 1 }, { id: 2 }];
    const f = mockFetch(async () =>
      new Response(JSON.stringify(arr), { status: 200, headers: { "content-type": "application/json" } }),
    );
    const c = new SnipeitClient(cfg, createLogger("error"), { fetch: f });
    const res = await c.request("GET", "/categories");
    expect(res.data).toEqual(arr);
  });

  it("returns pagination hint for {total, rows} envelopes after unwrap", async () => {
    const env = { status: "success", messages: "", payload: { total: 100, rows: new Array(50).fill({}) } };
    const f = mockFetch(async () =>
      new Response(JSON.stringify(env), { status: 200, headers: { "content-type": "application/json" } }),
    );
    const c = new SnipeitClient(cfg, createLogger("error"), { fetch: f });
    const res = await c.request("GET", "/hardware", { query: { limit: 50, offset: 0 } });
    expect(res.pagination?.hasMore).toBe(true);
    expect(res.pagination?.nextOffset).toBe(50);
  });

  it("throws SnipeitApiError on HTTP 4xx", async () => {
    const f = mockFetch(async () =>
      new Response('{"message":"not found"}', { status: 404, headers: { "content-type": "application/json" } }),
    );
    const c = new SnipeitClient(cfg, createLogger("error"), { fetch: f });
    await expect(c.request("GET", "/hardware/9999")).rejects.toBeInstanceOf(SnipeitApiError);
  });

  it("serializes JSON body and sets Content-Type", async () => {
    let captured: RequestInit | undefined;
    const f = mockFetch(async ({ init }) => {
      captured = init;
      return new Response('{"status":"success","payload":{}}', { status: 200, headers: { "content-type": "application/json" } });
    });
    const c = new SnipeitClient(cfg, createLogger("error"), { fetch: f });
    await c.request("POST", "/hardware", { body: { name: "x" } });
    expect(captured?.body).toBe('{"name":"x"}');
    expect((captured?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("appends query parameters, skipping undefined/null", async () => {
    const f = mockFetch(async () =>
      new Response('{"status":"success","payload":[]}', { status: 200, headers: { "content-type": "application/json" } }),
    );
    const c = new SnipeitClient(cfg, createLogger("error"), { fetch: f });
    await c.request("GET", "/hardware", { query: { limit: 10, offset: 5, search: undefined } });
    const url = String(f.mock.calls[0]?.[0]);
    expect(url).toContain("limit=10");
    expect(url).toContain("offset=5");
    expect(url).not.toContain("search=");
  });

  it("throws SnipeitApiError(statusCode:0) on fetch AbortError", async () => {
    const f = vi.fn().mockImplementation(async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    });
    const c = new SnipeitClient(cfg, createLogger("error"), { fetch: f });
    try {
      await c.request("GET", "/users/me");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(SnipeitApiError);
      expect((err as SnipeitApiError).statusCode).toBe(0);
      expect((err as SnipeitApiError).message).toMatch(/aborted/);
    }
  });
});
