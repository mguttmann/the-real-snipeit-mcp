/**
 * Central HTTP client for the Snipe-IT REST API.
 *
 * Handles Bearer auth, request timeouts, exponential retry, and the Snipe-IT
 * status-envelope quirk where HTTP 200 responses may still carry
 * `{"status":"error",...}` bodies. On success, the `payload` field is unwrapped
 * so callers see the inner data, never the envelope.
 *
 * @module
 */
import { SnipeitApiError, parseApiError, formatMessages } from "./errors.js";
import { withRetry, parseRetryAfter } from "./retry.js";
import { parsePaginationHint, type PaginationHint } from "./pagination.js";
import type { Config } from "../config.js";
import type { Logger } from "../utils/logger.js";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Options for a single HTTP request. All fields optional. */
export interface RequestOptions {
  /** JSON body for write methods. Will be serialized; `Content-Type: application/json` is set automatically. */
  body?: unknown;
  /** Query parameters. `undefined`/`null` values are skipped, others are coerced to string. */
  query?: Record<string, unknown>;
  /** Extra headers to merge on top of the defaults (Authorization, Accept). */
  headers?: Record<string, string>;
  /** Override the default idempotency inference (GET/PUT/DELETE default to true; POST/PATCH default to false). */
  idempotent?: boolean;
  /** Retry override. By default `maxAttempts: 3` and idempotency follows the method. */
  retry?: { maxAttempts?: number };
  /** Optional external AbortSignal — combined with the internal timeout signal. */
  signal?: AbortSignal;
}

/** Response wrapper. `data` is already unwrapped from the Snipe-IT envelope if one was present. */
export interface SnipeitResponse<T> {
  /** The unwrapped payload (envelope-aware) or raw body if no envelope. */
  data: T;
  /** HTTP status code (or 0 on timeout/abort). */
  status: number;
  /** Response headers. */
  headers: Headers;
  /** Set when the response was a `{total, rows}` listing — describes the current page and how to fetch the next. */
  pagination?: PaginationHint;
}

export interface SnipeitClientOptions {
  /** Override the global `fetch` (for testing or proxying). */
  fetch?: typeof globalThis.fetch;
}

/**
 * Snipe-IT REST API client.
 *
 * @example
 * ```ts
 * const client = new SnipeitClient(cfg, logger);
 * const me = await client.request<{ id: number; username: string }>("GET", "/users/me");
 * console.log(me.data.username);
 * ```
 */
export class SnipeitClient {
  constructor(
    private cfg: Config,
    private logger: Logger,
    private opts: SnipeitClientOptions = {},
  ) {}

  /**
   * Perform a single HTTP request against the Snipe-IT API.
   *
   * Always:
   * - Sends `Authorization: Bearer <token>` and `Accept: application/json`.
   * - Applies the request timeout from `cfg.timeoutMs` via AbortController.
   * - Retries 429 always (with `Retry-After`); 5xx only when idempotent; network errors once.
   * - Detects the Snipe-IT envelope (`{status: "error" | "success", payload, messages}`) and
   *   either throws `SnipeitApiError` or unwraps `payload` into `data`.
   * - Extracts a `PaginationHint` when the response is `{total, rows}`.
   *
   * @typeParam T - The expected unwrapped payload type.
   * @param method - HTTP method.
   * @param path - Path relative to `cfg.apiBase` (leading slash optional).
   * @param options - See {@link RequestOptions}.
   * @returns Resolved response; throws `SnipeitApiError` on failure (HTTP or envelope-level).
   *
   * @throws {SnipeitApiError} For non-2xx HTTP responses, status:"error" envelopes (even on HTTP 200),
   *                           timeouts (statusCode 0), and unrecoverable network failures.
   */
  async request<T = unknown>(
    method: HttpMethod,
    path: string,
    options: RequestOptions = {},
  ): Promise<SnipeitResponse<T>> {
    const url = this.buildUrl(path, options.query);
    const maxAttempts = options.retry?.maxAttempts ?? 3;
    const idempotent = options.idempotent ?? (method === "GET" || method === "PUT" || method === "DELETE");
    const reqOffset = Number(options.query?.offset ?? 0);
    const reqLimit = Number(options.query?.limit ?? 50);
    return withRetry(() => this.doRequest<T>(method, url, options, { offset: reqOffset, limit: reqLimit }), {
      maxAttempts,
      idempotent,
    });
  }

  private buildUrl(path: string, query?: RequestOptions["query"]): string {
    const base = this.cfg.apiBase.endsWith("/") ? this.cfg.apiBase : this.cfg.apiBase + "/";
    const cleaned = path.startsWith("/") ? path.slice(1) : path;
    const u = new URL(cleaned, base);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null) continue;
        u.searchParams.set(k, String(v));
      }
    }
    return u.toString();
  }

  private async doRequest<T>(
    method: HttpMethod,
    url: string,
    options: RequestOptions,
    pageReq: { offset: number; limit: number },
  ): Promise<SnipeitResponse<T>> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.cfg.apiToken}`,
      Accept: "application/json",
      ...(options.headers ?? {}),
    };
    let body: string | undefined;
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);
    if (options.signal) {
      if (options.signal.aborted) controller.abort();
      else options.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    const f = this.opts.fetch ?? globalThis.fetch;
    const started = Date.now();
    let res: Response;
    try {
      res = await f(url, { method, headers, body, signal: controller.signal });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        throw new SnipeitApiError({ statusCode: 0, message: `request to ${url} aborted (timeout ${this.cfg.timeoutMs}ms)` });
      }
      throw err;
    }
    clearTimeout(timer);

    // Log only method, URL, status, and elapsed ms — never body or token
    this.logger.debug(`${method} ${url} → ${res.status} (${Date.now() - started}ms)`);

    if (res.status === 204) {
      return { data: null as T, status: res.status, headers: res.headers };
    }

    const text = await res.text();

    // Non-2xx responses always throw — parse whatever error info is available
    if (!res.ok) {
      const err = parseApiError(text, res.status);
      if (res.status === 429) {
        const retryAfterMs = parseRetryAfter(res.headers.get("retry-after")) ?? undefined;
        throw new SnipeitApiError({
          statusCode: err.statusCode,
          message: err.message,
          code: err.code,
          details: { ...(err.details as object ?? {}), retryAfterMs },
        });
      }
      throw err;
    }

    // Parse JSON body when content-type indicates it
    const ct = res.headers.get("content-type") ?? "";
    let parsed: unknown = null;
    if (ct.includes("application/json") && text) {
      try { parsed = JSON.parse(text); } catch { parsed = text; }
    } else {
      parsed = text;
    }

    // ╔══════════════════════════════════════════════════════════════════════════╗
    // ║  CRITICAL: Snipe-IT status envelope check                                ║
    // ║                                                                          ║
    // ║  Snipe-IT returns HTTP 200 for many failures (validation errors,        ║
    // ║  "not found", failed checkouts, etc.). The body looks like:             ║
    // ║                                                                          ║
    // ║    { "status": "error", "messages": {…}, "payload": null }              ║
    // ║                                                                          ║
    // ║  Success looks like:                                                     ║
    // ║                                                                          ║
    // ║    { "status": "success", "messages": "...", "payload": {…} }           ║
    // ║                                                                          ║
    // ║  Without this check, an LLM caller would see {status:"error"} as a      ║
    // ║  successful tool result and act on garbage data. So we MUST throw on    ║
    // ║  status:"error" regardless of HTTP code, and we unwrap `payload` on     ║
    // ║  status:"success" so callers see the inner data, never the wrapper.    ║
    // ║                                                                          ║
    // ║  Array bodies and unenveloped responses pass through untouched.         ║
    // ╚══════════════════════════════════════════════════════════════════════════╝
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) && "status" in (parsed as object)) {
      const env = parsed as { status?: string; messages?: unknown; payload?: unknown };
      if (env.status === "error") {
        throw new SnipeitApiError({
          statusCode: res.status,
          message: formatMessages(env.messages) || `Snipe-IT returned status:error (HTTP ${res.status})`,
          details: env.messages,
        });
      }
      if (env.status === "success") {
        // Unwrap: callers see the inner payload, never the envelope
        parsed = env.payload ?? null;
      }
    }

    // After unwrap, check for pagination hint (sees inner {total, rows} not the outer envelope)
    const pagination = parsePaginationHint(parsed, pageReq) ?? undefined;
    return { data: parsed as T, status: res.status, headers: res.headers, pagination };
  }
}
