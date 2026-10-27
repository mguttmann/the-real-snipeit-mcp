/**
 * Retry logic for transient failures.
 *
 * Policy:
 * - HTTP 429: always retried, honoring `Retry-After` header (capped at 60s).
 * - HTTP 5xx (except 501): retried only when the request is idempotent.
 * - Network errors (ECONNRESET/ETIMEDOUT/ENOTFOUND/fetch failed): retried only when the
 *   request is idempotent. Non-idempotent requests (POST/PATCH) are retried only on
 *   connect-phase errors where nothing was sent (`cause.code` ECONNREFUSED, ENOTFOUND,
 *   EAI_AGAIN); anything else may have reached the server and is never replayed.
 * - Snipe-IT envelope-level `status:"error"`: NOT retried (it's a business error,
 *   not a transient one; retrying won't help).
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
  /** Cancel signal: once aborted, no further attempt is made and a pending backoff ends at once. */
  signal?: AbortSignal | undefined;
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

/** Sleep that rejects as soon as `signal` aborts (and never starts when it already has). */
function abortableSleep(
  sleep: (ms: number) => Promise<void>,
  ms: number,
  signal: AbortSignal | undefined,
): Promise<void> {
  if (!signal) return sleep(ms);
  if (signal.aborted) return Promise.reject(new Error("aborted"));
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => reject(new Error("aborted"));
    signal.addEventListener("abort", onAbort, { once: true });
    sleep(ms).then(
      () => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      },
      (e: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

/** Error codes raised before any byte of the request reached the server. */
const CONNECT_PHASE_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"]);

function codeOf(x: unknown): string | undefined {
  if (x && typeof x === "object" && "code" in x && typeof (x as { code: unknown }).code === "string") {
    return (x as { code: string }).code;
  }
  return undefined;
}

/**
 * True when a network error happened while connecting, so the request was never sent.
 * Looks at `err.code` and `err.cause.code`; an `AggregateError` cause (several addresses
 * tried) counts only if every attempt failed with a connect-phase code.
 */
function isConnectPhaseError(err: Error): boolean {
  const cause = (err as { cause?: unknown }).cause;
  if (cause instanceof AggregateError && cause.errors.length > 0) {
    return cause.errors.every((e) => CONNECT_PHASE_CODES.has(codeOf(e) ?? ""));
  }
  const code = codeOf(cause) ?? codeOf(err);
  return code !== undefined && CONNECT_PHASE_CODES.has(code);
}

/**
 * Decide whether a given error is worth retrying.
 *
 * @param err - Caught error from a failed `fetch` call or `SnipeitClient.request`.
 * @param opts.idempotent - If true, 5xx and network errors are retried; otherwise only 429
 *                          and connect-phase network errors (nothing was sent) are retried.
 */
export function isRetriable(err: unknown, opts: { idempotent?: boolean } = {}): boolean {
  if (err instanceof SnipeitApiError) {
    if (err.statusCode === 429) return true;
    if (err.statusCode >= 500 && err.statusCode !== 501) return opts.idempotent === true;
    return false;
  }
  if (err instanceof Error) {
    if (isConnectPhaseError(err)) return true;
    return opts.idempotent === true && /ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch failed/i.test(err.message);
  }
  return false;
}

/**
 * Run `fn` with bounded retries. Re-throws the last error if `maxAttempts` is exhausted
 * or the error is not retriable. Honors `Retry-After` for 429 errors.
 *
 * @param fn - The async operation to retry.
 * @param opts.maxAttempts - Maximum number of attempts (including the first).
 * @param opts.idempotent - When true, 5xx and network errors are retried; otherwise only 429 and
 *                          connect-phase network errors (nothing was sent).
 * @param opts.signal - Cancel signal; stops retrying and ends a pending backoff.
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
      if (opts.signal?.aborted) throw err;
      const retryAfter =
        err instanceof SnipeitApiError && err.statusCode === 429
          ? (err.details as { retryAfterMs?: number } | undefined)?.retryAfterMs
          : undefined;
      const delay = retryAfter ?? computeBackoff(attempt);
      try {
        await abortableSleep(sleep, delay, opts.signal);
      } catch {
        // Cancelled or past the deadline during the backoff: report the last real error.
        throw err;
      }
    }
  }
  throw lastErr;
}
