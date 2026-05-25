import { describe, expect, it, vi } from "vitest";
import { withRetry, isRetriable, parseRetryAfter, computeBackoff } from "../../src/client/retry.js";
import { SnipeitApiError } from "../../src/client/errors.js";

describe("computeBackoff", () => {
  it("uses schedule and caps at last entry", () => {
    expect(computeBackoff(0)).toBe(1000);
    expect(computeBackoff(1)).toBe(2000);
    expect(computeBackoff(2)).toBe(4000);
    expect(computeBackoff(99)).toBe(4000);
  });
});

describe("parseRetryAfter", () => {
  it("parses numeric seconds", () => {
    expect(parseRetryAfter("5")).toBe(5000);
  });
  it("parses HTTP date header", () => {
    const future = new Date(Date.now() + 3000).toUTCString();
    const ms = parseRetryAfter(future);
    expect(ms).toBeGreaterThanOrEqual(2000);
    expect(ms).toBeLessThanOrEqual(4000);
  });
  it("caps at 60s", () => {
    expect(parseRetryAfter("9999")).toBe(60_000);
  });
  it("returns null for missing/garbage", () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("nope")).toBeNull();
  });
});

describe("isRetriable", () => {
  it("retries 429 always", () => {
    expect(isRetriable(new SnipeitApiError({ statusCode: 429, message: "" }))).toBe(true);
    expect(isRetriable(new SnipeitApiError({ statusCode: 429, message: "" }), { idempotent: false })).toBe(true);
  });
  it("retries 5xx only when idempotent", () => {
    const err = new SnipeitApiError({ statusCode: 503, message: "" });
    expect(isRetriable(err, { idempotent: true })).toBe(true);
    expect(isRetriable(err, { idempotent: false })).toBe(false);
  });
  it("does not retry 4xx (other than 429)", () => {
    expect(isRetriable(new SnipeitApiError({ statusCode: 404, message: "" }), { idempotent: true })).toBe(false);
  });
  it("retries network failures", () => {
    expect(isRetriable(new Error("ECONNRESET"))).toBe(true);
    expect(isRetriable(new Error("fetch failed"))).toBe(true);
  });
});

describe("withRetry", () => {
  it("returns on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const out = await withRetry(fn, { maxAttempts: 3, sleep: async () => undefined });
    expect(out).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries 429 then succeeds", async () => {
    let n = 0;
    const fn = vi.fn().mockImplementation(async () => {
      if (n++ === 0) throw new SnipeitApiError({ statusCode: 429, message: "rate" });
      return "ok";
    });
    const out = await withRetry(fn, { maxAttempts: 3, sleep: async () => undefined });
    expect(out).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("gives up after maxAttempts and re-throws", async () => {
    const fn = vi.fn().mockRejectedValue(new SnipeitApiError({ statusCode: 429, message: "rate" }));
    await expect(withRetry(fn, { maxAttempts: 2, sleep: async () => undefined })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
