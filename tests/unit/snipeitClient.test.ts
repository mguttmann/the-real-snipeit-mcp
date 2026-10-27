import { describe, expect, it, vi } from "vitest";
import { SnipeitClient } from "../../src/client/snipeitClient.js";
import { SnipeitApiError } from "../../src/client/errors.js";
import { createLogger } from "../../src/utils/logger.js";
import { startLoopback, drain } from "./_loopback.js";

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
    const f = mockFetch(
      async () =>
        new Response('{"status":"success","payload":{"ok":true}}', {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const c = new SnipeitClient(cfg, createLogger("error"), { fetch: f });
    await c.request("GET", "/users/me");
    const init = f.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer tok");
    expect(headers["Accept"]).toBe("application/json");
  });

  it("unwraps payload from {status:success,payload:…}", async () => {
    const f = mockFetch(
      async () =>
        new Response('{"status":"success","messages":"ok","payload":{"id":42}}', {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const c = new SnipeitClient(cfg, createLogger("error"), { fetch: f });
    const res = await c.request<{ id: number }>("GET", "/hardware/42");
    expect(res.data).toEqual({ id: 42 });
  });

  it("throws SnipeitApiError when body is {status:error} despite HTTP 200", async () => {
    const body = JSON.stringify({ status: "error", messages: { name: ["required"] }, payload: null });
    const f = mockFetch(
      async () => new Response(body, { status: 200, headers: { "content-type": "application/json" } }),
    );
    const c = new SnipeitClient(cfg, createLogger("error"), { fetch: f });
    await expect(c.request("POST", "/hardware", { body: {} })).rejects.toBeInstanceOf(SnipeitApiError);
    await expect(c.request("POST", "/hardware", { body: {} })).rejects.toThrow(/name: required/);
  });

  it("passes through array bodies (no status envelope)", async () => {
    const arr = [{ id: 1 }, { id: 2 }];
    const f = mockFetch(
      async () =>
        new Response(JSON.stringify(arr), { status: 200, headers: { "content-type": "application/json" } }),
    );
    const c = new SnipeitClient(cfg, createLogger("error"), { fetch: f });
    const res = await c.request("GET", "/categories");
    expect(res.data).toEqual(arr);
  });

  it("returns pagination hint for {total, rows} envelopes after unwrap", async () => {
    const env = { status: "success", messages: "", payload: { total: 100, rows: new Array(50).fill({}) } };
    const f = mockFetch(
      async () =>
        new Response(JSON.stringify(env), { status: 200, headers: { "content-type": "application/json" } }),
    );
    const c = new SnipeitClient(cfg, createLogger("error"), { fetch: f });
    const res = await c.request("GET", "/hardware", { query: { limit: 50, offset: 0 } });
    expect(res.pagination?.hasMore).toBe(true);
    expect(res.pagination?.nextOffset).toBe(50);
  });

  it("throws SnipeitApiError on HTTP 4xx", async () => {
    const f = mockFetch(
      async () =>
        new Response('{"message":"not found"}', {
          status: 404,
          headers: { "content-type": "application/json" },
        }),
    );
    const c = new SnipeitClient(cfg, createLogger("error"), { fetch: f });
    await expect(c.request("GET", "/hardware/9999")).rejects.toBeInstanceOf(SnipeitApiError);
  });

  it("serializes JSON body and sets Content-Type", async () => {
    let captured: RequestInit | undefined;
    const f = mockFetch(async ({ init }) => {
      captured = init;
      return new Response('{"status":"success","payload":{}}', {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const c = new SnipeitClient(cfg, createLogger("error"), { fetch: f });
    await c.request("POST", "/hardware", { body: { name: "x" } });
    expect(captured?.body).toBe('{"name":"x"}');
    expect((captured?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("appends query parameters, skipping undefined/null", async () => {
    const f = mockFetch(
      async () =>
        new Response('{"status":"success","payload":[]}', {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const c = new SnipeitClient(cfg, createLogger("error"), { fetch: f });
    await c.request("GET", "/hardware", { query: { limit: 10, offset: 5, search: undefined } });
    const url = String(f.mock.calls[0]?.[0]);
    expect(url).toContain("limit=10");
    expect(url).toContain("offset=5");
    expect(url).not.toContain("search=");
  });

  it("pins requests to SNIPEIT_API_BASE: rejects host/scheme/path escapes without sending anything", async () => {
    const f = mockFetch(
      async () =>
        new Response('{"status":"success","payload":{}}', {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const c = new SnipeitClient(cfg, createLogger("error"), { fetch: f });
    const attacks = [
      "https://evil.example/steal", // absolute URL → other host
      "//evil.example/steal", // protocol-relative
      "///evil.example/steal", // extra-slash protocol-relative
      "/\\\\evil.example/steal", // backslash variant (WHATWG treats \\ as /)
      "http:/evil.example/steal", // scheme change
      "../../admin/login", // path traversal out of /api/v1
      "/../secret", // absolute traversal
      "%2e%2e/%2e%2e/admin", // percent-encoded traversal
    ];
    for (const path of attacks) {
      await expect(c.request("GET", path)).rejects.toThrow(/refusing request/);
    }
    expect(f).not.toHaveBeenCalled();
  });

  it("still resolves benign relative paths under the base", async () => {
    const f = mockFetch(
      async () =>
        new Response('{"status":"success","payload":{}}', {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const c = new SnipeitClient(cfg, createLogger("error"), { fetch: f });
    await c.request("GET", "/hardware/42");
    await c.request("GET", "hardware/42");
    expect(String(f.mock.calls[0]?.[0])).toBe("https://assets.example.com/api/v1/hardware/42");
    expect(String(f.mock.calls[1]?.[0])).toBe("https://assets.example.com/api/v1/hardware/42");
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

describe("SnipeitClient retry policy for network errors", () => {
  const noSleep = async () => undefined;
  const fetchFailed = (cause?: unknown) =>
    Object.assign(new TypeError("fetch failed"), cause ? { cause } : {});

  it("does not replay a POST after a network error (exactly one attempt)", async () => {
    const f = vi.fn().mockRejectedValue(fetchFailed({ code: "ECONNRESET" }));
    const c = new SnipeitClient(cfg, createLogger("error"), { fetch: f, sleep: noSleep });
    await expect(c.request("POST", "/hardware/1/checkout", { body: { assigned_user: 1 } })).rejects.toThrow(
      /fetch failed/,
    );
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("does not replay a PATCH after a plain 'fetch failed'", async () => {
    const f = vi.fn().mockRejectedValue(fetchFailed());
    const c = new SnipeitClient(cfg, createLogger("error"), { fetch: f, sleep: noSleep });
    await expect(c.request("PATCH", "/hardware/1", { body: { name: "x" } })).rejects.toThrow(/fetch failed/);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("retries a GET after a network error", async () => {
    const f = vi.fn().mockRejectedValue(fetchFailed({ code: "ECONNRESET" }));
    const c = new SnipeitClient(cfg, createLogger("error"), { fetch: f, sleep: noSleep });
    await expect(c.request("GET", "/hardware")).rejects.toThrow(/fetch failed/);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("retries a POST when the connection was refused (nothing was sent)", async () => {
    const f = vi.fn().mockRejectedValue(fetchFailed({ code: "ECONNREFUSED" }));
    const c = new SnipeitClient(cfg, createLogger("error"), { fetch: f, sleep: noSleep });
    await expect(c.request("POST", "/hardware", { body: {} })).rejects.toThrow(/fetch failed/);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("loopback: a server that reads the POST body and drops the socket sees the POST once", async () => {
    let hits = 0;
    const srv = await startLoopback(async (req, res) => {
      await drain(req);
      hits++;
      res.socket?.destroy();
    });
    try {
      const c = new SnipeitClient({ ...cfg, apiBase: srv.base }, createLogger("error"), { sleep: noSleep });
      await expect(
        c.request("POST", "/hardware/1/checkout", { body: { assigned_user: 1 } }),
      ).rejects.toThrow();
      expect(hits).toBe(1);
    } finally {
      await srv.close();
    }
  });
});

describe("SnipeitClient timeout covers the body read", () => {
  it("loopback: headers arrive but the body never ends -> statusCode-0 timeout error", async () => {
    let hits = 0;
    const srv = await startLoopback((_req, res) => {
      hits++;
      res.writeHead(200, { "content-type": "application/json" });
      res.write('{"total":1,"rows":[');
    });
    try {
      const c = new SnipeitClient({ ...cfg, apiBase: srv.base, timeoutMs: 300 }, createLogger("error"));
      const started = Date.now();
      const err = await c.request("GET", "/hardware").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(SnipeitApiError);
      expect((err as SnipeitApiError).statusCode).toBe(0);
      expect((err as SnipeitApiError).message).toMatch(/timeout 300ms/);
      expect(Date.now() - started).toBeLessThan(3000);
      expect(hits).toBe(1);
    } finally {
      await srv.close();
    }
  });

  it("mock fetch: a body stream that ignores the abort signal still times out", async () => {
    const f = vi.fn().mockImplementation(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('{"total":1,'));
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    const c = new SnipeitClient({ ...cfg, timeoutMs: 200 }, createLogger("error"), { fetch: f });
    const err = await c.request("GET", "/hardware").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SnipeitApiError);
    expect((err as SnipeitApiError).statusCode).toBe(0);
    expect((err as SnipeitApiError).message).toMatch(/timeout 200ms/);
  });
});

describe("SnipeitClient refuses redirects", () => {
  for (const status of [301, 302, 307]) {
    for (const method of ["GET", "POST"] as const) {
      it(`${method} answered with ${status} -> SnipeitApiError naming status and Location, fetch called once`, async () => {
        const f = mockFetch(
          async () => new Response(null, { status, headers: { location: "https://other.example/steal" } }),
        );
        const c = new SnipeitClient(cfg, createLogger("error"), { fetch: f, sleep: async () => undefined });
        const err = await c
          .request(method, "/hardware", method === "POST" ? { body: { name: "x" } } : {})
          .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(SnipeitApiError);
        expect((err as SnipeitApiError).statusCode).toBe(status);
        expect((err as SnipeitApiError).message).toContain(String(status));
        expect((err as SnipeitApiError).message).toContain("https://other.example/steal");
        expect(f).toHaveBeenCalledTimes(1);
        expect((f.mock.calls[0]?.[1] as RequestInit).redirect).toBe("manual");
      });
    }
  }

  it("loopback: a same-origin 302 for a POST is not followed (no second request)", async () => {
    const seen: string[] = [];
    const srv = await startLoopback(async (req, res) => {
      await drain(req);
      seen.push(`${req.method} ${req.url}`);
      if (req.url?.startsWith("/api/v1/")) {
        res.writeHead(302, { location: "/admin/outside" });
        res.end();
      } else {
        res.writeHead(200, { "content-type": "application/json" });
        res.end('{"total":0,"rows":[]}');
      }
    });
    try {
      const c = new SnipeitClient({ ...cfg, apiBase: srv.base }, createLogger("error"), {
        sleep: async () => undefined,
      });
      const err = await c.request("POST", "/hardware", { body: { name: "x" } }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(SnipeitApiError);
      expect((err as SnipeitApiError).message).toMatch(/302.*\/admin\/outside/);
      expect(seen).toEqual(["POST /api/v1/hardware"]);
    } finally {
      await srv.close();
    }
  });
});

/** A pull-based stream yielding `chunks` chunks of `chunkSize` bytes (Infinity = never ends). */
function chunkStream(chunkSize: number, chunks: number, fill = 0x50) {
  let pulled = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled >= chunks) {
        controller.close();
        return;
      }
      pulled++;
      controller.enqueue(new Uint8Array(chunkSize).fill(fill));
    },
  });
  return { stream, pulled: () => pulled };
}

describe("SnipeitClient binary responses", () => {
  it("returns metadata instead of decoding an application/zip body", async () => {
    const zip = new Uint8Array(3000);
    zip.set([0x50, 0x4b, 0x03, 0x04]);
    for (let i = 4; i < zip.length; i++) zip[i] = (i * 37) % 256;
    const f = mockFetch(
      async () =>
        new Response(zip, {
          status: 200,
          headers: {
            "content-type": "application/zip",
            "content-disposition": 'attachment; filename="snipe-it-backup.zip"',
          },
        }),
    );
    const c = new SnipeitClient(cfg, createLogger("error"), { fetch: f });
    const res = await c.request<Record<string, unknown>>("GET", "/settings/backups/download/x.zip");
    expect(res.data).toMatchObject({
      binary: true,
      content_type: "application/zip",
      size_bytes: 3000,
      filename: "snipe-it-backup.zip",
    });
    expect(typeof res.data.note).toBe("string");
    expect(JSON.stringify(res.data)).not.toContain("PK");
    expect(res.pagination).toBeUndefined();
  });

  for (const ct of ["application/octet-stream", "image/png", "application/pdf"]) {
    it(`treats ${ct} as binary`, async () => {
      const f = mockFetch(
        async () =>
          new Response(new Uint8Array([1, 2, 3, 255]), { status: 200, headers: { "content-type": ct } }),
      );
      const c = new SnipeitClient(cfg, createLogger("error"), { fetch: f });
      const res = await c.request<Record<string, unknown>>("GET", "/hardware/1/files/2");
      expect(res.data).toMatchObject({ binary: true, content_type: ct, size_bytes: 4, filename: null });
    });
  }

  it("decodes an RFC 5987 filename* parameter", async () => {
    const f = mockFetch(
      async () =>
        new Response(new Uint8Array(1), {
          status: 200,
          headers: {
            "content-type": "application/pdf",
            "content-disposition": "attachment; filename*=UTF-8''r%C3%A9sum%C3%A9.pdf",
          },
        }),
    );
    const c = new SnipeitClient(cfg, createLogger("error"), { fetch: f });
    const res = await c.request<Record<string, unknown>>("GET", "/x");
    expect(res.data.filename).toBe("résumé.pdf");
  });

  it("keeps text/* and JSON responses as before", async () => {
    const f = mockFetch(async ({ url }) =>
      url.endsWith("/txt")
        ? new Response("hello", { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } })
        : new Response('{"id":1}', {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8" },
          }),
    );
    const c = new SnipeitClient(cfg, createLogger("error"), { fetch: f });
    expect((await c.request("GET", "/txt")).data).toBe("hello");
    expect((await c.request("GET", "/json")).data).toEqual({ id: 1 });
  });

  it("stops counting a huge binary body at the body cap and reports a lower bound", async () => {
    const { stream, pulled } = chunkStream(1_048_576, Infinity);
    const f = mockFetch(
      async () => new Response(stream, { status: 200, headers: { "content-type": "application/zip" } }),
    );
    const c = new SnipeitClient({ ...cfg, maxResultBytes: 65_536 }, createLogger("error"), { fetch: f });
    const res = await c.request<Record<string, unknown>>("GET", "/settings/backups/download/big.zip");
    expect(res.data).toMatchObject({ binary: true, size_exact: false });
    expect(res.data.size_bytes as number).toBeGreaterThan(16 * 1_048_576);
    expect(pulled()).toBeLessThan(20);
  });
});

describe("SnipeitClient body size bound", () => {
  it("rejects a JSON body larger than the hard body cap without buffering it all", async () => {
    const { stream, pulled } = chunkStream(1_048_576, Infinity, 0x20);
    const f = mockFetch(
      async () => new Response(stream, { status: 200, headers: { "content-type": "application/json" } }),
    );
    const c = new SnipeitClient({ ...cfg, maxResultBytes: 65_536 }, createLogger("error"), { fetch: f });
    const err = await c.request("GET", "/hardware").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SnipeitApiError);
    expect((err as SnipeitApiError).code).toBe("RESPONSE_TOO_LARGE");
    expect((err as SnipeitApiError).message).toMatch(/16777216 bytes/);
    expect(pulled()).toBeLessThan(20);
  });

  it("keeps a bounded prefix of an oversized error body", async () => {
    const { stream } = chunkStream(1_048_576, Infinity, 0x41);
    const f = mockFetch(
      async () => new Response(stream, { status: 500, headers: { "content-type": "text/html" } }),
    );
    const c = new SnipeitClient({ ...cfg, maxResultBytes: 65_536 }, createLogger("error"), {
      fetch: f,
      sleep: async () => undefined,
    });
    const err = await c.request("POST", "/hardware", { body: {} }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SnipeitApiError);
    expect((err as SnipeitApiError).statusCode).toBe(500);
  });
});
