/**
 * Shared helpers for tool implementations.
 *
 * - {@link jsonResult} / {@link errorResult} — wrap data/error into MCP `CallToolResult` shape.
 * - {@link redactBody} — recursively redact secret-shaped fields before logging or previewing.
 * - {@link callJson} — perform a GET, convert errors to `errorResult`, attach pagination hint.
 * - {@link callWrite} — perform POST/PUT/PATCH/DELETE through `runGuarded` (confirm-write gate).
 * - {@link callList} — list-aware fetcher; with `all: true` auto-paginates up to 10 000 rows.
 *
 * @module
 */
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { type PaginationHint } from "../client/pagination.js";
import type { SnipeitClient } from "../client/snipeitClient.js";
import type { ServerContext } from "../server.js";
import { SnipeitApiError } from "../client/errors.js";
import { runGuarded } from "./destructiveGuard.js";

export interface ResultOptions {
  pagination?: PaginationHint | undefined;
}

/**
 * Wrap arbitrary JSON data as an MCP `CallToolResult`.
 * Optionally attaches a pagination hint so the LLM can decide whether to paginate further.
 */
export function jsonResult(data: unknown, opts: ResultOptions = {}): CallToolResult {
  const out: { data: unknown; pagination?: PaginationHint } = { data };
  if (opts.pagination) out.pagination = opts.pagination;
  return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
}

/**
 * Wrap an error message as an MCP `CallToolResult` with `isError: true`.
 * `details` is JSON-serialized into the body and typically contains `{ statusCode, code }`.
 */
export function errorResult(message: string, details?: unknown): CallToolResult {
  const payload: { error: string; details?: unknown } = { error: message };
  if (details !== undefined) payload.details = details;
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], isError: true };
}

/**
 * Fetches a Snipe-IT list endpoint. If `all === true`, walks all pages (capped at 10 000
 * rows) and preserves the server-reported total from the last page. Otherwise honors
 * limit/offset and returns one page with the pagination hint.
 */
export async function callList(
  client: SnipeitClient,
  path: string,
  args: { limit?: number; offset?: number; all?: boolean; [k: string]: unknown },
): Promise<{ data: { total: number; rows: unknown[] }; pagination?: PaginationHint }> {
  const { all, ...query } = args;
  if (all === true) {
    const rows: unknown[] = [];
    let lastTotal = 0;
    let offset = 0;
    const pageLimit = 200;
    const maxRows = 10_000;
    while (rows.length < maxRows) {
      const r = await client.request<{ total: number; rows: unknown[] }>("GET", path, {
        query: { ...query, limit: pageLimit, offset },
      });
      const page = r.data;
      lastTotal = page.total;
      const fetched = page.rows.length;
      if (fetched === 0) break;
      rows.push(...page.rows);
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
 * which returns a redacted preview (instead of executing) when `SNIPEIT_CONFIRM_WRITES=true`
 * and the caller did not pass `confirm: "YES"`. Otherwise executes and returns the result;
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
  return runGuarded(ctx.cfg, args, { toolName, method, url: ctx.cfg.apiBase + path, body }, async () => {
    try {
      const res = await ctx.client.request(method, path, { body });
      return jsonResult(res.data);
    } catch (err) {
      if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
      throw err;
    }
  });
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
