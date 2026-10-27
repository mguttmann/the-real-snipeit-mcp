/**
 * Central HTTP client for the Snipe-IT REST API.
 *
 * Handles Bearer auth, request timeouts, exponential retry, refusal of redirects, and the Snipe-IT
 * status-envelope quirk where HTTP 200 responses may still carry
 * `{"status":"error",...}` bodies. On success, the `payload` field is unwrapped
 * so callers see the inner data, never the envelope.
 *
 * @module
 */
import { SnipeitApiError, parseApiError, formatMessages } from "./errors.js";
import { withRetry, parseRetryAfter } from "./retry.js";
import { parsePaginationHint, type PaginationHint } from "./pagination.js";
import { abortedByDeadline, anySignal, currentCallSignal } from "./callScope.js";
import type { Config } from "../config.js";
import { DEFAULT_MAX_RESULT_BYTES, maxBodyBytes } from "../constants.js";
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
  /** Optional external AbortSignal, combined with the internal timeout signal. */
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
  /** Set when the response was a `{total, rows}` listing: describes the current page and how to fetch the next. */
  pagination?: PaginationHint;
}

export interface SnipeitClientOptions {
  /** Override the global `fetch` (for testing or proxying). */
  fetch?: typeof globalThis.fetch;
  /** Override the retry backoff sleep (tests use a no-op to avoid real delays). */
  sleep?: (ms: number) => Promise<void>;
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
   * - Pins the request to `cfg.apiBase`: paths that resolve to another origin or escape
   *   the base path (absolute URLs, `//host`, scheme changes, `../`) throw before any
   *   request is sent; the bearer token never leaves the configured host.
   * - Sends `Authorization: Bearer <token>` and `Accept: application/json`.
   * - Never follows redirects: any 3xx throws `SnipeitApiError` naming the status and Location.
   * - Refuses `.` and `..` segments (also percent-encoded) and empty segments in `path`,
   *   so a path parameter cannot collapse the URL onto another endpoint.
   * - Applies the request timeout from `cfg.timeoutMs` via AbortController, and the cancel
   *   signal (`options.signal`, else the enclosing tool call's signal and deadline, see
   *   `callScope.ts`): a cancelled call stops at once, also during a retry backoff.
   * - Logs every executed write (non-GET) at info: method, URL path and status or error code.
   * - Retries (up to `retry.maxAttempts`, default 3 attempts in total) 429 always (with
   *   `Retry-After`); 5xx and network errors only when idempotent (GET/PUT/DELETE by default).
   *   POST/PATCH are retried after a network error only if the connection was never
   *   established (ECONNREFUSED, ENOTFOUND, EAI_AGAIN), so a write is never sent twice.
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
   * @throws {SnipeitApiError} For non-2xx HTTP responses (including refused 3xx redirects), status:"error" envelopes (even on HTTP 200),
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
    // The server's default page size is not known here: report limit only when it was sent.
    const rawLimit = options.query?.limit;
    const reqLimit = rawLimit === undefined || rawLimit === null ? undefined : Number(rawLimit);
    const signal = anySignal(options.signal, currentCallSignal());
    const opts = { ...options, signal };
    return withRetry(() => this.doRequest<T>(method, url, opts, { offset: reqOffset, limit: reqLimit }), {
      maxAttempts,
      idempotent,
      signal,
      ...(this.opts.sleep ? { sleep: this.opts.sleep } : {}),
    });
  }

  private buildUrl(path: string, query?: RequestOptions["query"]): string {
    const base = new URL(this.cfg.apiBase.endsWith("/") ? this.cfg.apiBase : this.cfg.apiBase + "/");
    const cleaned = path.startsWith("/") ? path.slice(1) : path;
    const bad = badSegment(cleaned);
    if (bad !== undefined) {
      throw new SnipeitApiError({
        statusCode: 0,
        code: "INVALID_PATH",
        message:
          `refusing request: path ${JSON.stringify(path)} has ${bad === "" ? "an empty segment" : `the segment ${JSON.stringify(bad)}`}, ` +
          `which would address a different endpoint; pass a real id or name`,
      });
    }
    const u = new URL(cleaned, base);
    // SSRF guard: the resolved URL must stay on the SNIPEIT_API_BASE origin and under
    // its path prefix. Rejects absolute URLs ("https://evil.example"), protocol-relative
    // paths ("//evil.example", "/\\evil.example"), scheme changes, and "../" traversal
    // (including percent-encoded dots) that would escape the base path.
    if (u.origin !== base.origin || !u.pathname.startsWith(base.pathname)) {
      throw new SnipeitApiError({
        statusCode: 0,
        message:
          `refusing request: path ${JSON.stringify(path)} resolves to ${u.origin}${u.pathname}, ` +
          `outside SNIPEIT_API_BASE (${base.origin}${base.pathname})`,
      });
    }
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
    pageReq: { offset: number; limit: number | undefined },
  ): Promise<SnipeitResponse<T>> {
    if (method === "GET") return this.attempt<T>(method, url, options, pageReq);
    // Audit line for every executed write: no query string, no body (they can carry personal data).
    const where = new URL(url).pathname;
    try {
      const res = await this.attempt<T>(method, url, options, pageReq);
      this.logger.info(`write ${method} ${where}`, { status: res.status });
      return res;
    } catch (err) {
      const e = err instanceof SnipeitApiError ? err : undefined;
      this.logger.info(`write ${method} ${where}`, {
        status: e?.statusCode ?? 0,
        ...(e?.code ? { code: e.code } : {}),
        ...(e ? {} : { error: "network" }),
      });
      throw err;
    }
  }

  private async attempt<T>(
    method: HttpMethod,
    url: string,
    options: RequestOptions,
    pageReq: { offset: number; limit: number | undefined },
  ): Promise<SnipeitResponse<T>> {
    // Defense-in-depth (buildUrl already pins): never attach the admin bearer
    // token to a request that would leave the SNIPEIT_API_BASE origin.
    const targetOrigin = new URL(url).origin;
    const baseOrigin = new URL(this.cfg.apiBase).origin;
    if (targetOrigin !== baseOrigin) {
      throw new SnipeitApiError({
        statusCode: 0,
        message: `refusing to send credentials to ${targetOrigin} (pinned to ${baseOrigin})`,
      });
    }
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

    if (options.signal?.aborted) throw callAbortedError(options.signal, url);
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.cfg.timeoutMs);
    if (options.signal) {
      if (options.signal.aborted) controller.abort();
      else options.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    const f = this.opts.fetch ?? globalThis.fetch;
    const started = Date.now();
    let res: Response;
    let text: string;
    // The timer stays armed until the body has been read: SNIPEIT_TIMEOUT_MS bounds the
    // whole attempt, not just the time to the response headers.
    try {
      // Redirects are never followed: a followed 301/302 turns a write into a GET that
      // reports success, and any redirect target escapes the SNIPEIT_API_BASE pin.
      res = await f(url, { method, headers, body, signal: controller.signal, redirect: "manual" });

      // Log only method, URL, status, and elapsed ms; never body or token
      this.logger.debug(`${method} ${url} → ${res.status} (${Date.now() - started}ms)`);

      if ((res.status >= 300 && res.status < 400) || res.type === "opaqueredirect") {
        void res.body?.cancel().catch(() => undefined);
        const location = (res.headers.get("location") ?? "(no Location header)").slice(0, 500);
        throw new SnipeitApiError({
          statusCode: res.status,
          message:
            `refusing to follow HTTP ${res.status} redirect from ${method} ${url} to ${location}; ` +
            `check SNIPEIT_API_BASE (scheme, host, trailing path)`,
          code: "REDIRECT_REFUSED",
        });
      }

      if (res.status === 204) {
        return { data: null as T, status: res.status, headers: res.headers };
      }

      const ct = res.headers.get("content-type") ?? "";
      const maxBytes = maxBodyBytes(this.cfg.maxResultBytes ?? DEFAULT_MAX_RESULT_BYTES);

      // Binary payloads (zip backups, uploaded files, images, PDFs) are never decoded into
      // the tool result: only their size is counted (bounded) and metadata is returned.
      if (res.ok && isBinaryContentType(ct)) {
        const body = await readBody(res, controller.signal, maxBytes, false);
        return { data: binaryMetadata(res, ct, body) as T, status: res.status, headers: res.headers };
      }

      const read = await readBody(res, controller.signal, maxBytes, true);
      if (read.overflow && res.ok) {
        throw new SnipeitApiError({
          statusCode: res.status,
          code: "RESPONSE_TOO_LARGE",
          message:
            `response body of ${method} ${url} exceeds ${maxBytes} bytes and was not read; ` +
            `narrow the request (smaller limit, filters, or a specific id)`,
        });
      }
      // Error bodies keep their first maxBytes only; parseApiError shows a short snippet anyway.
      text = new TextDecoder().decode(read.bytes);
    } catch (err) {
      if (controller.signal.aborted || (err instanceof Error && err.name === "AbortError")) {
        if (!timedOut && options.signal?.aborted) throw callAbortedError(options.signal, url);
        throw new SnipeitApiError({
          statusCode: 0,
          code: "TIMEOUT",
          message: `request to ${url} aborted (timeout ${this.cfg.timeoutMs}ms)`,
        });
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    // Non-2xx responses always throw; parse whatever error info is available
    if (!res.ok) {
      const err = parseApiError(text, res.status);
      if (res.status === 429) {
        const retryAfterMs = parseRetryAfter(res.headers.get("retry-after")) ?? undefined;
        throw new SnipeitApiError({
          statusCode: err.statusCode,
          message: err.message,
          code: err.code,
          details: { ...((err.details as object) ?? {}), retryAfterMs },
        });
      }
      throw err;
    }

    // Parse JSON body when content-type indicates it
    const ct = res.headers.get("content-type") ?? "";
    let parsed: unknown = null;
    if (ct.includes("application/json") && text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
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
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      "status" in (parsed as object)
    ) {
      const env = parsed as { status?: string; messages?: unknown; payload?: unknown };
      if (env.status === "error") {
        throw new SnipeitApiError({
          statusCode: res.status,
          message: formatMessages(env.messages) || `Snipe-IT returned status:error (HTTP ${res.status})`,
          details: env.messages,
        });
      }
      if (env.status === "success") {
        // Unwrap: callers see the inner payload, never the envelope. A success without a
        // payload (typical for deletes) keeps its message instead of turning into null.
        const hasMessages = env.messages !== undefined && env.messages !== null && env.messages !== "";
        parsed = env.payload ?? (hasMessages ? { messages: env.messages } : null);
      }
    }

    // After unwrap, check for pagination hint (sees inner {total, rows} not the outer envelope)
    const pagination = parsePaginationHint(parsed, pageReq) ?? undefined;
    return { data: parsed as T, status: res.status, headers: res.headers, pagination };
  }
}

/** Error for a call that was cancelled or ran past its overall deadline. */
function callAbortedError(signal: AbortSignal, url: string): SnipeitApiError {
  if (abortedByDeadline(signal)) {
    return new SnipeitApiError({
      statusCode: 0,
      code: "DEADLINE_EXCEEDED",
      message: `request to ${url} aborted: the call ran past SNIPEIT_CALL_DEADLINE_MS`,
    });
  }
  return new SnipeitApiError({
    statusCode: 0,
    code: "CANCELLED",
    message: `request to ${url} cancelled by the caller`,
  });
}

/**
 * First path segment that must not be sent: `.` or `..` (also percent-encoded) or an empty
 * segment (`a//b`, trailing `/`). Only the part before `?` or `#` is checked; the empty
 * path (the base itself) is allowed.
 */
function badSegment(path: string): string | undefined {
  const pathOnly = path.split(/[?#]/, 1)[0] ?? "";
  if (pathOnly === "") return undefined;
  for (const seg of pathOnly.split("/")) {
    if (seg === "") return "";
    let decoded = seg;
    try {
      decoded = decodeURIComponent(seg);
    } catch {
      // keep the raw segment
    }
    if (decoded === "." || decoded === "..") return seg;
  }
  return undefined;
}

function abortError(): Error {
  return Object.assign(new Error("body read aborted"), { name: "AbortError" });
}

interface BodyRead {
  /** The bytes kept (empty when `keep` was false). At most `maxBytes` long. */
  bytes: Uint8Array;
  /** Bytes received (a lower bound when `overflow` is true). */
  size: number;
  /** True when the body was longer than `maxBytes` and reading stopped early. */
  overflow: boolean;
}

/**
 * Read a response body with two bounds:
 * - time: rejects with an `AbortError` as soon as `signal` aborts, even if the underlying
 *   stream does not observe the signal itself;
 * - size: stops (and cancels the stream) once more than `maxBytes` arrived.
 * With `keep === false` the bytes are only counted, never buffered.
 */
async function readBody(
  res: Response,
  signal: AbortSignal,
  maxBytes: number,
  keep: boolean,
): Promise<BodyRead> {
  if (!res.body) return { bytes: new Uint8Array(0), size: 0, overflow: false };
  const reader = res.body.getReader();
  const aborted = new Promise<never>((_, reject) => {
    const onAbort = () => {
      // Reject first: cancel() settles a pending read() with done:true, which must not win.
      reject(abortError());
      void reader.cancel().catch(() => undefined);
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
  aborted.catch(() => undefined);
  const chunks: Uint8Array[] = [];
  let size = 0;
  let overflow = false;
  for (;;) {
    const { done, value } = await Promise.race([reader.read(), aborted]);
    if (signal.aborted) throw abortError();
    if (done) break;
    size += value.byteLength;
    if (keep) chunks.push(value);
    if (size > maxBytes) {
      overflow = true;
      void reader.cancel().catch(() => undefined);
      break;
    }
  }
  const kept = Math.min(
    maxBytes,
    chunks.reduce((n, c) => n + c.byteLength, 0),
  );
  const out = new Uint8Array(kept);
  let pos = 0;
  for (const c of chunks) {
    if (pos >= kept) break;
    const part = c.subarray(0, kept - pos);
    out.set(part, pos);
    pos += part.byteLength;
  }
  return { bytes: out, size, overflow };
}

/**
 * True for content types that must not be decoded as text: anything that is neither
 * JSON (`application/json`, `*+json`), XML, nor `text/*`. A missing content type is
 * treated as text (unchanged behaviour for header-less responses).
 */
export function isBinaryContentType(contentType: string): boolean {
  const mime = (contentType.split(";")[0] ?? "").trim().toLowerCase();
  if (!mime) return false;
  if (mime.startsWith("text/")) return false;
  if (mime === "application/json" || mime.endsWith("+json")) return false;
  if (mime === "application/xml" || mime.endsWith("+xml")) return false;
  if (mime === "application/javascript" || mime === "application/x-www-form-urlencoded") return false;
  return true;
}

/** Extract the file name from a Content-Disposition header (`filename*` wins over `filename`). */
export function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(header);
  if (star?.[2]) {
    try {
      return decodeURIComponent(star[2].trim()).slice(0, 255);
    } catch {
      // fall through to the plain parameter
    }
  }
  const plain = /filename\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^;]+))/i.exec(header);
  const name = plain?.[1]?.replace(/\\(.)/g, "$1") ?? plain?.[2]?.trim();
  return name ? name.slice(0, 255) : null;
}

function binaryMetadata(res: Response, contentType: string, body: BodyRead): Record<string, unknown> {
  const declared = Number(res.headers.get("content-length"));
  const sizeBytes =
    body.overflow && Number.isSafeInteger(declared) && declared > body.size ? declared : body.size;
  return {
    binary: true,
    content_type: contentType,
    size_bytes: sizeBytes,
    size_exact: !body.overflow || sizeBytes === declared,
    filename: parseContentDispositionFilename(res.headers.get("content-disposition")),
    note: body.overflow
      ? "Binary content is not returned through MCP. The body was larger than the read limit, so size_bytes is a lower bound unless size_exact is true."
      : "Binary content is not returned through MCP; download it from Snipe-IT directly if needed.",
  };
}
