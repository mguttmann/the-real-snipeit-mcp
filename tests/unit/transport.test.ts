/**
 * Client transport behaviour added in the 2026-10-27 minors run: dot-segment refusal
 * (sec-input-7), cancellation and the optional overall deadline (sec-input-5,
 * run-2026-10-27-3), success messages without payload (correctness-10), the pagination
 * hint for an omitted limit (correctness-8) and the info audit line per executed write
 * (destructive-07).
 */
import { describe, expect, it, vi } from "vitest";
import { SnipeitClient } from "../../src/client/snipeitClient.js";
import { SnipeitApiError } from "../../src/client/errors.js";
import { runInCallScope } from "../../src/client/callScope.js";
import { createLogger, type Logger } from "../../src/utils/logger.js";

const cfg = {
  apiToken: "tok",
  apiBase: "https://assets.example.com/api/v1",
  confirmWrites: false,
  timeoutMs: 1000,
  logLevel: "error" as const,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function hangingFetch() {
  return vi.fn().mockImplementation(
    (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        );
      }),
  );
}

async function caught(p: Promise<unknown>): Promise<SnipeitApiError> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(SnipeitApiError);
    return err as SnipeitApiError;
  }
  throw new Error("expected a rejection");
}

describe("dot and empty path segments", () => {
  for (const path of [
    "/maintenances/..",
    "/maintenances/.",
    "/fields/../associate",
    "/hardware/%2e%2e",
    "/hardware/%2E",
    "/maintenances/",
    "/hardware//5",
  ]) {
    it(`refuses ${JSON.stringify(path)} before sending anything`, async () => {
      const f = vi.fn();
      const c = new SnipeitClient(cfg, createLogger("error"), { fetch: f });
      const err = await caught(c.request("DELETE", path));
      expect(err.code).toBe("INVALID_PATH");
      expect(err.statusCode).toBe(0);
      expect(f).not.toHaveBeenCalled();
    });
  }

  it("still accepts ordinary paths, encoded slashes and query strings", async () => {
    const f = vi.fn().mockImplementation(async () => json({ ok: true }));
    const c = new SnipeitClient(cfg, createLogger("error"), { fetch: f });
    await c.request("GET", "/hardware/bytag/a..b");
    await c.request("GET", "/hardware/bytag/..%2Fx");
    await c.request("GET", "/hardware?search=x");
    await c.request("GET", "/hardware/bytag/.hidden");
    expect(f).toHaveBeenCalledTimes(4);
  });
});

describe("cancellation and overall deadline", () => {
  it("a caller cancellation is reported as cancelled, not as a timeout", async () => {
    const ac = new AbortController();
    const c = new SnipeitClient(cfg, createLogger("error"), { fetch: hangingFetch() });
    const p = c.request("GET", "/hardware", { signal: ac.signal });
    setTimeout(() => ac.abort(), 10);
    const err = await caught(p);
    expect(err.code).toBe("CANCELLED");
    expect(err.message).toMatch(/cancelled/);
    expect(err.message).not.toMatch(/timeout/);
  });

  it("the per-attempt timeout keeps its own code and message", async () => {
    const c = new SnipeitClient({ ...cfg, timeoutMs: 20 }, createLogger("error"), { fetch: hangingFetch() });
    const err = await caught(c.request("GET", "/hardware"));
    expect(err.code).toBe("TIMEOUT");
    expect(err.message).toMatch(/timeout 20ms/);
  });

  it("uses the signal of the enclosing tool call when the caller passes none", async () => {
    const ac = new AbortController();
    ac.abort();
    const f = hangingFetch();
    const c = new SnipeitClient(cfg, createLogger("error"), { fetch: f });
    const err = await caught(runInCallScope({ signal: ac.signal }, () => c.request("GET", "/hardware")));
    expect(err.code).toBe("CANCELLED");
  });

  it("an overall deadline aborts the call with DEADLINE_EXCEEDED", async () => {
    const c = new SnipeitClient({ ...cfg, timeoutMs: 10_000 }, createLogger("error"), {
      fetch: hangingFetch(),
    });
    const err = await caught(runInCallScope({ deadlineMs: 30 }, () => c.request("GET", "/hardware")));
    expect(err.code).toBe("DEADLINE_EXCEEDED");
    expect(err.message).toMatch(/SNIPEIT_CALL_DEADLINE_MS/);
  });

  it("a retry backoff ends as soon as the call is cancelled", async () => {
    const f = vi.fn().mockImplementation(async () => new Response("down", { status: 503 }));
    const ac = new AbortController();
    const c = new SnipeitClient(cfg, createLogger("error"), { fetch: f });
    const started = Date.now();
    const p = c.request("GET", "/hardware", { signal: ac.signal });
    setTimeout(() => ac.abort(), 30);
    await expect(p).rejects.toBeInstanceOf(SnipeitApiError);
    expect(Date.now() - started).toBeLessThan(800);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("response shaping", () => {
  it("keeps the success message when the envelope has no payload", async () => {
    const f = vi
      .fn()
      .mockImplementation(async () => json({ status: "success", messages: "Deleted.", payload: null }));
    const c = new SnipeitClient(cfg, createLogger("error"), { fetch: f });
    const res = await c.request("DELETE", "/companies/3");
    expect(res.data).toEqual({ messages: "Deleted." });
  });

  it("still returns null for a success envelope with neither payload nor messages", async () => {
    const f = vi.fn().mockImplementation(async () => json({ status: "success" }));
    const c = new SnipeitClient(cfg, createLogger("error"), { fetch: f });
    expect((await c.request("DELETE", "/companies/3")).data).toBeNull();
  });

  it("omits pagination.limit when the caller did not send a limit", async () => {
    const f = vi.fn().mockImplementation(async () => json({ total: 120, rows: new Array(20).fill({}) }));
    const c = new SnipeitClient(cfg, createLogger("error"), { fetch: f });
    const res = await c.request("GET", "/hardware");
    expect(res.pagination).toEqual({ total: 120, returned: 20, offset: 0, hasMore: true, nextOffset: 20 });
    const withLimit = await c.request("GET", "/hardware", { query: { limit: 20 } });
    expect(withLimit.pagination?.limit).toBe(20);
  });
});

describe("write audit line", () => {
  function spyLogger(): Logger & { lines: string[] } {
    const lines: string[] = [];
    const push = (lvl: string) => (m: string, c?: unknown) =>
      lines.push(`${lvl} ${m} ${c === undefined ? "" : JSON.stringify(c)}`);
    return { lines, debug: push("debug"), info: push("info"), warn: push("warn"), error: push("error") };
  }

  it("logs every executed write at info with method, path and status, without query or body", async () => {
    const f = vi
      .fn()
      .mockImplementationOnce(async () => json({ status: "success", payload: { id: 1 } }))
      .mockImplementationOnce(async () => json({ messages: "nope" }, 422));
    const logger = spyLogger();
    const c = new SnipeitClient(cfg, logger, { fetch: f });
    await c.request("POST", "/hardware", {
      body: { name: "secret-name" },
      query: { q: "person@example.com" },
    });
    await expect(c.request("DELETE", "/hardware/7")).rejects.toBeInstanceOf(SnipeitApiError);
    const infos = logger.lines.filter((l) => l.startsWith("info "));
    expect(infos).toHaveLength(2);
    expect(infos[0]).toMatch(/write POST \/api\/v1\/hardware/);
    expect(infos[0]).toContain('"status":200');
    expect(infos[1]).toMatch(/write DELETE \/api\/v1\/hardware\/7/);
    expect(infos[1]).toContain('"status":422');
    expect(logger.lines.join("\n")).not.toContain("secret-name");
    expect(logger.lines.join("\n")).not.toContain("person@example.com");
  });

  it("does not log reads at info", async () => {
    const f = vi.fn().mockImplementation(async () => json({ ok: true }));
    const logger = spyLogger();
    await new SnipeitClient(cfg, logger, { fetch: f }).request("GET", "/hardware");
    expect(logger.lines.filter((l) => l.startsWith("info "))).toEqual([]);
  });

  it("logs a write that failed without an HTTP status", async () => {
    const logger = spyLogger();
    const c = new SnipeitClient({ ...cfg, timeoutMs: 20 }, logger, { fetch: hangingFetch() });
    await expect(c.request("PATCH", "/hardware/7", { body: {} })).rejects.toBeInstanceOf(SnipeitApiError);
    const infos = logger.lines.filter((l) => l.startsWith("info "));
    expect(infos).toHaveLength(1);
    expect(infos[0]).toMatch(/write PATCH \/api\/v1\/hardware\/7/);
    expect(infos[0]).toContain("TIMEOUT");
  });
});
