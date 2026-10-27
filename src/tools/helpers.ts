/**
 * Shared helpers for tool implementations.
 *
 * - {@link jsonResult} / {@link errorResult}: wrap data/error into MCP `CallToolResult` shape.
 * - {@link redactBody}: recursively redact secret-shaped fields before logging or previewing.
 * - {@link maskSecrets} / {@link maskResult}: opt-in redaction of Snipe-IT data in results
 *   (`SNIPEIT_REDACT_SECRETS`, `SNIPEIT_REDACT_PII`).
 * - {@link redactedPaths}: paths of the redaction placeholder in a write body (always refused).
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
let redactSecretValues = false;

/** Switch opt-in PII masking of tool results on or off (`SNIPEIT_REDACT_PII`). Called once by `buildServer`. */
export function setRedactPii(on: boolean): void {
  redactPii = on;
}

/** Switch opt-in secret masking of tool results on or off (`SNIPEIT_REDACT_SECRETS`). Called once by `buildServer`. */
export function setRedactSecrets(on: boolean): void {
  redactSecretValues = on;
}

/**
 * The value that replaces a secret in write previews and, with `SNIPEIT_REDACT_SECRETS`
 * or `SNIPEIT_REDACT_PII`, in results. Always the whole value. Write tools refuse a body
 * or query that contains it (see {@link redactedPaths} and `runGuarded`).
 */
export const REDACTED_PLACEHOLDER = "(redacted)";

/** Keys whose values are secrets wherever they appear (write previews; results with SNIPEIT_REDACT_SECRETS). */
export const SECRET_KEYS = /(password|secret|token|api[_-]?key)/i;

/**
 * Custom fields whose `value` is a secret, matched against the display name and the
 * database column (`_snipeit_<name>_<id>`). Deliberately broad: a harmless field whose
 * name contains one of these words (for example "Keyboard layout") is masked too.
 */
export const SECRET_CUSTOM_FIELD = /(passw|kennw|secret|token|key|recovery|bitlocker|pin|laps)/i;

/** Prefix of the database column of a Snipe-IT custom field. */
const CUSTOM_FIELD_COLUMN = /^_snipeit_/;

const hasValue = (v: unknown) => v !== null && v !== undefined && v !== "";

/** True for a key whose value is a secret: SECRET_KEYS, or a custom field column matching SECRET_CUSTOM_FIELD. */
function isSecretKey(k: string): boolean {
  return SECRET_KEYS.test(k) || (CUSTOM_FIELD_COLUMN.test(k) && SECRET_CUSTOM_FIELD.test(k));
}

const isObj = (x: unknown): x is Record<string, unknown> =>
  x !== null && typeof x === "object" && !Array.isArray(x);

/** True for a custom field display name, column or key that names a secret. */
const isSecretName = (n: unknown): boolean =>
  typeof n === "string" && (SECRET_CUSTOM_FIELD.test(n) || SECRET_KEYS.test(n));

/** True when one of the keys that identify a custom field in an object names a secret. */
function namesSecretField(entry: Record<string, unknown>, displayName?: string): boolean {
  return [displayName, entry.name, entry.label, entry.field, entry.db_column, entry.db_column_name].some(
    isSecretName,
  );
}

/** One custom field entry (`{field, value, ...}`): mask `value` when its name or column is secret. */
function maskCustomField(entry: Record<string, unknown>, displayName: string | undefined): unknown {
  const secret = namesSecretField(entry, displayName);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entry)) {
    out[k] = k === "value" && secret && hasValue(v) ? REDACTED_PLACEHOLDER : maskSecrets(v);
  }
  return out;
}

/** `custom_fields` in the object form (`{"<display name>": {field, value}}`) or as an array of entries. */
function maskCustomFields(v: unknown): unknown {
  if (Array.isArray(v)) return v.map((e) => (isObj(e) ? maskCustomField(e, undefined) : maskSecrets(e)));
  if (!isObj(v)) return maskSecrets(v);
  const out: Record<string, unknown> = {};
  for (const [name, entry] of Object.entries(v)) {
    if (isObj(entry)) out[name] = maskCustomField(entry, name);
    else out[name] = isSecretName(name) && hasValue(entry) ? REDACTED_PLACEHOLDER : maskSecrets(entry);
  }
  return out;
}

/**
 * `log_meta` of an action log row (`{"<display name or column>": {old, new}}` or a scalar):
 * for a secret name, `old` and `new` are each masked so the change itself stays visible.
 */
function maskLogMeta(v: unknown): unknown {
  if (!isObj(v)) return maskSecrets(v);
  const out: Record<string, unknown> = {};
  for (const [name, entry] of Object.entries(v)) {
    if (!isSecretName(name)) out[name] = maskSecrets(entry);
    else if (isObj(entry) && ("old" in entry || "new" in entry)) {
      const change: Record<string, unknown> = {};
      for (const [k, e] of Object.entries(entry))
        change[k] = (k === "old" || k === "new") && hasValue(e) ? REDACTED_PLACEHOLDER : maskSecrets(e);
      out[name] = change;
    } else out[name] = hasValue(entry) ? REDACTED_PLACEHOLDER : entry;
  }
  return out;
}

/**
 * Replace secrets in a Snipe-IT result with {@link REDACTED_PLACEHOLDER}
 * (`SNIPEIT_REDACT_SECRETS`): the value of every key matching {@link SECRET_KEYS} at any
 * depth, of every custom field column (`_snipeit_*`) matching {@link SECRET_CUSTOM_FIELD},
 * `value` of every `custom_fields` entry whose display name or column matches it,
 * `old` and `new` of every `log_meta` entry (action log, activity report) whose name
 * matches either rule, and `default_value` of every custom field definition whose name or
 * column matches (model `default_fieldset_values`, fieldset fields per model).
 * Null and empty values stay, so the result still shows that a field is unset.
 */
export function maskSecrets(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(maskSecrets);
  if (!isObj(input)) return input;
  const secretDefault = "default_value" in input && namesSecretField(input);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (k === "custom_fields") out[k] = maskCustomFields(v);
    else if (k === "log_meta") out[k] = maskLogMeta(v);
    else
      out[k] =
        (isSecretKey(k) || (k === "default_value" && secretDefault)) && hasValue(v)
          ? REDACTED_PLACEHOLDER
          : maskSecrets(v);
  }
  return out;
}

/** Apply the opt-in result masks (`SNIPEIT_REDACT_SECRETS`, `SNIPEIT_REDACT_PII`) to Snipe-IT data. */
export function maskResult(data: unknown): unknown {
  if (redactSecretValues) data = maskSecrets(data);
  if (redactPii) data = maskPii(data);
  return data;
}

/** A JSON string member in text: `"key": "value"` (escapes inside the value allowed). */
const JSON_STRING_MEMBER = /"([^"\\]+)"(\s*:\s*)"((?:[^"\\]|\\.)*)"/g;

/** With `SNIPEIT_REDACT_SECRETS` on: mask secret JSON members an error text echoes. */
function maskSecretText(text: string): string {
  if (!redactSecretValues) return text;
  return text.replace(JSON_STRING_MEMBER, (m, k: string, sep: string, v: string) =>
    isSecretKey(k) && v !== "" ? `"${k}"${sep}"${REDACTED_PLACEHOLDER}"` : m,
  );
}

const PLAIN_KEY = /^[A-Za-z_$][\w$]*$/;

/**
 * JSON paths (`body.custom_fields["BitLocker Key"].value`, `body.items[2].password`) of
 * every value in `input` that is exactly {@link REDACTED_PLACEHOLDER}, at any depth of
 * objects and arrays. Only paths are returned, never values.
 */
export function redactedPaths(input: unknown, path = "body"): string[] {
  if (input === REDACTED_PLACEHOLDER) return [path];
  if (Array.isArray(input)) return input.flatMap((v, i) => redactedPaths(v, `${path}[${i}]`));
  if (input && typeof input === "object")
    return Object.entries(input).flatMap(([k, v]) =>
      redactedPaths(v, PLAIN_KEY.test(k) ? `${path}.${k}` : `${path}[${JSON.stringify(k)}]`),
    );
  return [];
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
        ? REDACTED_PLACEHOLDER
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
  data = maskResult(data);
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
  const payload: { error: string; details?: unknown } = { error: maskSecretText(redactSecrets(message)) };
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

/**
 * Recursively walk an object/array and replace values whose keys match
 * {@link SECRET_KEYS} (case-insensitive) with {@link REDACTED_PLACEHOLDER}.
 * Used for write previews so the LLM cannot leak secrets through preview output.
 */
export function redactBody(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(redactBody);
  if (input && typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) {
      out[k] = SECRET_KEYS.test(k) ? REDACTED_PLACEHOLDER : redactBody(v);
    }
    return out;
  }
  return input;
}
