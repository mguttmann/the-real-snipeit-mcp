/**
 * Shared helpers for tool implementations.
 *
 * - {@link jsonResult} / {@link errorResult}: wrap data/error into MCP `CallToolResult` shape.
 * - {@link redactBody}: recursively redact secret-shaped fields before logging or previewing.
 * - {@link callJson}: perform a GET, convert errors to `errorResult`, attach pagination hint.
 * - {@link callWrite}: perform POST/PUT/PATCH/DELETE through `runGuarded` (confirm-write gate).
 * - {@link callList}: list-aware fetcher; with `all: true` auto-paginates up to 10 000 rows
 *   or until the result size cap is reached.
 * - {@link setMaxResultBytes}: set the per-result size cap (`SNIPEIT_MAX_RESULT_BYTES`).
 *
 * @module
 */
import type { CallToolResult } from "@modelcontextprotocol/server";
import { type PaginationHint } from "../client/pagination.js";
import type { SnipeitClient } from "../client/snipeitClient.js";
import type { ServerContext } from "../server.js";
import { SnipeitApiError } from "../client/errors.js";
import { runGuarded } from "./destructiveGuard.js";
import { DEFAULT_MAX_RESULT_BYTES, PAGINATION } from "../constants.js";
import { redactSecrets } from "../utils/logger.js";

let maxResultBytes = DEFAULT_MAX_RESULT_BYTES;
let redactPii = false;

/** Switch opt-in PII masking of tool results on or off (`SNIPEIT_REDACT_PII`). Called once by `buildServer`. */
export function setRedactPii(on: boolean): void {
  redactPii = on;
}

/** Keys whose values are personal data wherever they appear. */
const PII_KEYS = new Set([
  "email",
  "employee_num",
  "employee_number",
  "phone",
  "mobile",
  "address",
  "address2",
  "username",
  "first_name",
  "last_name",
]);
/** Keys that mark an object as a person, whose `name` is then masked too. */
const PERSON_KEYS = ["username", "first_name", "last_name", "email", "employee_num", "employee_number"];

/**
 * Replace personal data in a Snipe-IT result with `"(redacted)"`: the keys in `PII_KEYS`
 * at any depth, and `name` of objects that describe a person (`type: "user"` or any of
 * `PERSON_KEYS`). Asset, model and location names stay. Null and empty values stay.
 */
export function maskPii(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(maskPii);
  if (input === null || typeof input !== "object") return input;
  const obj = input as Record<string, unknown>;
  const person = obj.type === "user" || PERSON_KEYS.some((k) => k in obj);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const sensitive = PII_KEYS.has(k) || (person && k === "name");
    out[k] =
      sensitive && v !== null && v !== undefined && v !== "" && typeof v !== "object"
        ? "(redacted)"
        : maskPii(v);
  }
  return out;
}

/** Set the cap (bytes of serialized JSON text) for every tool result. Called once by `buildServer`. */
export function setMaxResultBytes(bytes: number): void {
  maxResultBytes = bytes;
}

/** Bytes kept free for the envelope around rows (`data`, `total`, `pagination`, markers). */
const ENVELOPE_RESERVE_BYTES = 4096;

const byteLen = (s: string): number => Buffer.byteLength(s, "utf8");
const serialize = (x: unknown): string => JSON.stringify(x, null, 2);

/**
 * Bytes one row adds to a `jsonResult` text when it sits in `data.rows` (three levels deep,
 * so every line gets six more spaces of indentation, plus the separating ",\n").
 */
function rowBytes(row: unknown): number {
  const s = serialize(row) ?? "null";
  let lines = 1;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) lines++;
  return byteLen(s) + 6 * lines + 2;
}

/** Largest k in [0, n] with fits(k) true, assuming fits is monotone (true for small k). */
function largestFitting(n: number, fits: (k: number) => boolean): number {
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(mid)) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Where a skipped oversized row sits: its offset and, if it has one, its id (fetch it by id instead). */
function oversizedRow(row: unknown, offset: number): { offset: number; id?: unknown } {
  const id = row && typeof row === "object" ? (row as { id?: unknown }).id : undefined;
  return id === undefined ? { offset } : { offset, id };
}

function isRowsObject(x: unknown): x is { rows: unknown[]; total?: unknown } & Record<string, unknown> {
  return (
    x !== null && typeof x === "object" && !Array.isArray(x) && Array.isArray((x as { rows?: unknown }).rows)
  );
}

/**
 * Shrink an oversized result so its text fits `maxResultBytes`, always as valid JSON:
 * - `{rows: [...]}` lists keep the leading rows that fit and gain `truncated: true` and
 *   `next_offset` (the pagination hint is adjusted to match);
 * - top-level arrays keep the leading items that fit, with a top-level `truncated` object;
 * - anything else is replaced by a `{truncated: true, size_bytes, max_result_bytes, note}` marker.
 */
function capResult(
  data: unknown,
  pagination: PaginationHint | undefined,
  fullBytes: number,
  write = false,
): string {
  const cap = maxResultBytes;
  const fits = (s: string) => byteLen(s) <= cap;

  if (isRowsObject(data)) {
    const base = pagination?.offset ?? 0;
    const build = (k: number) => {
      // A first row that alone exceeds the cap is skipped (named by offset and id), so a
      // caller that follows next_offset always moves forward.
      const skip = k === 0 && data.rows.length > 0 ? 1 : 0;
      const next = base + k + skip;
      const out: { data: unknown; pagination?: PaginationHint } = {
        data: {
          ...data,
          rows: data.rows.slice(0, k),
          truncated: true,
          next_offset: next,
          ...(skip ? { oversized_row: oversizedRow(data.rows[0], base) } : {}),
        },
      };
      if (pagination) {
        out.pagination = { ...pagination, returned: k, nextOffset: next, hasMore: next < pagination.total };
      }
      return serialize(out);
    };
    if (fits(build(0))) return build(largestFitting(data.rows.length, (k) => fits(build(k))));
  } else if (Array.isArray(data)) {
    const build = (k: number) =>
      serialize({
        data: data.slice(0, k),
        truncated: {
          returned: k,
          total_items: data.length,
          note: `Result exceeded SNIPEIT_MAX_RESULT_BYTES (${cap}); only the first ${k} items are shown.`,
        },
      });
    if (fits(build(0))) return build(largestFitting(data.length, (k) => fits(build(k))));
  }
  return serialize({
    data: {
      truncated: true,
      size_bytes: fullBytes,
      max_result_bytes: cap,
      note: write
        ? "The write was executed, but its response exceeded SNIPEIT_MAX_RESULT_BYTES and was not returned. " +
          "Do not repeat the request; read the record with a get tool to see the result."
        : "Result exceeded SNIPEIT_MAX_RESULT_BYTES and was not returned; narrow the request " +
          "(a specific id, filters, a smaller limit) or raise SNIPEIT_MAX_RESULT_BYTES.",
    },
  });
}

export interface ResultOptions {
  pagination?: PaginationHint | undefined;
  /** The result of an executed write: an oversized one must not invite a repeat. */
  write?: boolean;
}

/**
 * Wrap arbitrary JSON data as an MCP `CallToolResult`.
 * Optionally attaches a pagination hint so the LLM can decide whether to paginate further.
 * Results larger than `SNIPEIT_MAX_RESULT_BYTES` are shrunk to valid JSON with a
 * truncation marker (see {@link capResult}).
 */
export function jsonResult(data: unknown, opts: ResultOptions = {}): CallToolResult {
  if (redactPii) data = maskPii(data);
  const out: { data: unknown; pagination?: PaginationHint } = { data };
  if (opts.pagination) out.pagination = opts.pagination;
  let text = serialize(out);
  const size = byteLen(text);
  if (size > maxResultBytes) text = capResult(data, opts.pagination, size, opts.write === true);
  return { content: [{ type: "text", text }] };
}

/**
 * Wrap an error message as an MCP `CallToolResult` with `isError: true`.
 * `details` is JSON-serialized into the body and typically contains `{ statusCode, code }`.
 */
export function errorResult(message: string, details?: unknown): CallToolResult {
  const payload: { error: string; details?: unknown } = { error: redactSecrets(message) };
  if (details !== undefined) payload.details = details;
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], isError: true };
}

/**
 * Fetches a Snipe-IT list endpoint. If `all === true`, walks all pages from offset 0
 * (capped at 10 000 rows) and preserves the server-reported total from the last page.
 * It stops early once the serialized rows would exceed `SNIPEIT_MAX_RESULT_BYTES` and then
 * returns the rows so far plus `truncated: true` and `next_offset` (continue from there
 * with `limit`/`offset`). Otherwise honors limit/offset and returns one page with the
 * pagination hint.
 */
export async function callList(
  client: SnipeitClient,
  path: string,
  args: { limit?: number; offset?: number; all?: boolean; [k: string]: unknown },
): Promise<{
  data: {
    total: number;
    rows: unknown[];
    truncated?: true;
    next_offset?: number;
    oversized_row?: { offset: number; id?: unknown };
  };
  pagination?: PaginationHint;
}> {
  const { all, ...query } = args;
  if (all === true) {
    const rows: unknown[] = [];
    let lastTotal = 0;
    let offset = 0;
    const pageLimit = PAGINATION.AUTO_PAGINATE_PAGE_SIZE;
    const maxRows = PAGINATION.AUTO_PAGINATE_MAX_ROWS;
    const budget = maxResultBytes - ENVELOPE_RESERVE_BYTES;
    let used = 0;
    pages: while (rows.length < maxRows) {
      let r: Awaited<ReturnType<typeof client.request<{ total: number; rows: unknown[] }>>>;
      try {
        r = await client.request<{ total: number; rows: unknown[] }>("GET", path, {
          query: { ...query, limit: pageLimit, offset },
        });
      } catch (err) {
        // Past SNIPEIT_CALL_DEADLINE_MS with rows in hand: return them as a partial result.
        if (rows.length > 0 && err instanceof SnipeitApiError && err.code === "DEADLINE_EXCEEDED") {
          return { data: { total: lastTotal, rows, truncated: true, next_offset: rows.length } };
        }
        throw err;
      }
      const page = r.data;
      lastTotal = page.total;
      const fetched = page.rows.length;
      if (fetched === 0) break;
      for (const row of page.rows) {
        const b = rowBytes(row);
        if (used + b > budget) {
          if (rows.length === 0) {
            // The very first row alone exceeds the cap: skip it so next_offset moves on.
            return {
              data: {
                total: lastTotal,
                rows,
                truncated: true,
                next_offset: 1,
                oversized_row: oversizedRow(row, 0),
              },
            };
          }
          return { data: { total: lastTotal, rows, truncated: true, next_offset: rows.length } };
        }
        used += b;
        rows.push(row);
        if (rows.length >= maxRows) break pages;
      }
      offset += fetched;
      if (offset >= page.total) break;
    }
    return { data: { total: lastTotal, rows: rows.slice(0, maxRows) } };
  }
  const res = await client.request<{ total: number; rows: unknown[] }>("GET", path, { query });
  return { data: res.data, pagination: res.pagination };
}

/**
 * Convenience wrapper for read-only tool handlers. Calls `ctx.client.request("GET", path, …)`,
 * converts any `SnipeitApiError` to an `errorResult`, and attaches the pagination hint
 * automatically when the response was a `{total, rows}` list.
 */
export async function callJson(
  ctx: ServerContext,
  method: "GET",
  path: string,
  query?: Record<string, unknown>,
): Promise<CallToolResult> {
  try {
    const res = await ctx.client.request(method, path, { query });
    return jsonResult(res.data, { pagination: res.pagination });
  } catch (err) {
    if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
    throw err;
  }
}

/**
 * Convenience wrapper for write tool handlers. Routes the call through `runGuarded`,
 * which refuses the write under `SNIPEIT_READ_ONLY` and returns a redacted preview (instead
 * of executing) while the write guard is on and the caller did not pass `confirm: "YES"`. Otherwise executes and returns the result;
 * any `SnipeitApiError` is converted to an `errorResult` so the LLM gets a structured tool error.
 *
 * The `url` passed to the destructive guard is the **full** URL (`apiBase + path`) so previews
 * show exactly what would be hit.
 */
export async function callWrite(
  ctx: ServerContext,
  args: { confirm?: "YES" },
  toolName: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<CallToolResult> {
  return runGuarded(
    ctx.cfg,
    args,
    { toolName, method, url: ctx.cfg.apiBase + path, body },
    async () => {
      try {
        const res = await ctx.client.request(method, path, { body });
        return jsonResult(res.data, { write: true });
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }
    },
    ctx.logger,
  );
}

const SECRET_KEYS = /(password|secret|token|api[_-]?key)/i;

/**
 * Recursively walk an object/array and replace values whose keys match
 * `password|secret|token|api[_-]?key` (case-insensitive) with the literal `"(redacted)"`.
 * Used for write previews so the LLM cannot leak secrets through preview output.
 */
export function redactBody(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(redactBody);
  if (input && typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) {
      out[k] = SECRET_KEYS.test(k) ? "(redacted)" : redactBody(v);
    }
    return out;
  }
  return input;
}
