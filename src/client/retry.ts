/**
 * Retry logic for transient failures.
 *
 * Policy:
 * - HTTP 429: always retried, honoring `Retry-After` header (capped at 60s).
 * - HTTP 5xx (except 501): retried only when the request is idempotent.
 * - Network errors (ECONNRESET/ETIMEDOUT/ENOTFOUND/fetch failed): retried.
 * - Snipe-IT envelope-level `status:"error"`: NOT retried (it's a business error,
 *   not a transient one — retrying won't help).
 *
 * Backoff: exponential `[1s, 2s, 4s]`, capped at the last entry.
 *
 * @module
 */
import { SnipeitApiError } from "./errors.js";
import { RETRY } from "../constants.js";

export interface RetryOptions {
  maxAttempts: number;
  sleep?: (ms: number) => Promise<void>;
  idempotent?: boolean;
}

/** Return the backoff (ms) for the given attempt index, capped at the last schedule entry. */
export function computeBackoff(attempt: number): number {
  const sched = RETRY.BACKOFF_MS;
  const idx = Math.min(attempt, sched.length - 1);
  return sched[idx]!;
}

/**
 * Parse a `Retry-After` HTTP header into milliseconds.
 *
 * Accepts both numeric seconds (`"5"`) and HTTP-date (`"Wed, 21 Oct 2026 07:28:00 GMT"`).
 * Returns `null` for missing/garbage input. Capped at 60s to prevent unbounded waits.
 */
export function parseRetryAfter(header: string | undefined | null): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) {
    const ms = Number(trimmed) * 1000;
    return Math.min(ms, RETRY.RETRY_AFTER_CEILING_MS);
  }
  const date = Date.parse(trimmed);
  if (!Number.isNaN(date)) {
    const ms = Math.max(0, date - Date.now());
    return Math.min(ms, RETRY.RETRY_AFTER_CEILING_MS);
  }
  return null;
}

const DEFAULT_SLEEP = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Decide whether a given error is worth retrying.
 *
 * @param err - Caught error from a failed `fetch` call or `SnipeitClient.request`.
 * @param opts.idempotent - If true, 5xx are retried; otherwise 5xx are not retried.
 */
export function isRetriable(err: unknown, opts: { idempotent?: boolean } = {}): boolean {
  if (err instanceof SnipeitApiError) {
    if (err.statusCode === 429) return true;
    if (err.statusCode >= 500 && err.statusCode !== 501) return opts.idempotent === true;
    return false;
  }
  if (err instanceof Error) {
    return /ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch failed/i.test(err.message);
  }
  return false;
}

/**
 * Run `fn` with bounded retries. Re-throws the last error if `maxAttempts` is exhausted
 * or the error is not retriable. Honors `Retry-After` for 429 errors.
 *
 * @param fn - The async operation to retry.
 * @param opts.maxAttempts - Maximum number of attempts (including the first).
 * @param opts.idempotent - When true, 5xx errors are retried; otherwise only 429 and network errors.
 * @param opts.sleep - Override the default sleep implementation (used in tests to avoid real delays).
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const sleep = opts.sleep ?? DEFAULT_SLEEP;
  let lastErr: unknown;
  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === opts.maxAttempts - 1 || !isRetriable(err, { idempotent: opts.idempotent })) throw err;
      const retryAfter =
        err instanceof SnipeitApiError && err.statusCode === 429
          ? (err.details as { retryAfterMs?: number } | undefined)?.retryAfterMs
          : undefined;
      const delay = retryAfter ?? computeBackoff(attempt);
      await sleep(delay);
    }
  }
  throw lastErr;
}
