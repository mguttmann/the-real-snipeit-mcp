/**
 * Destructive-write safety gate.
 *
 * Every write tool runs through {@link runGuarded}:
 * - a body or query with a value that is exactly the redaction placeholder `(redacted)`
 *   is refused first (`REDACTED_PLACEHOLDER`), whatever the switches say; nothing is
 *   previewed or sent. A record read with `SNIPEIT_REDACT_SECRETS` (or copied from a
 *   preview) and written back unchanged would otherwise overwrite the real secret.
 * - `SNIPEIT_READ_ONLY` on: the write is refused with a tool error (`READ_ONLY`); nothing
 *   is sent. Tools stay registered so the gateway's tool list does not change.
 * - write guard on (`SNIPEIT_CONFIRM_WRITES`, the default): a call without
 *   `confirm: "YES"` returns a redacted preview (method, full URL, query, body) and sends
 *   nothing; with `confirm: "YES"` it executes. With the opt-in `SNIPEIT_REQUIRE_PREVIEW`,
 *   `confirm: "YES"` executes only after a preview of the identical request in the last
 *   10 minutes (one execution per preview).
 * - write guard off: writes execute directly.
 *
 * `confirm` is set by the model, so the guard catches a model that forgets it, not a
 * prompt injection that adds it; human approval must come from the MCP host or gateway.
 *
 * @module
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { errorResult, redactBody, redactedPaths, REDACTED_PLACEHOLDER } from "./helpers.js";
import type { CallToolResult } from "@modelcontextprotocol/server";
import type { Config } from "../config.js";
import type { Logger } from "../utils/logger.js";
import { redactSecrets } from "../utils/logger.js";

/**
 * Shape fragment to merge into write-tool `inputSchema` definitions.
 * Use as `{ ...yourFields, ...confirmShape }`.
 */
export const confirmShape = {
  confirm: z
    .literal("YES")
    .optional()
    .describe('Required when SNIPEIT_CONFIRM_WRITES=true. Exact string "YES" to apply this write.'),
};

export interface WriteRequestDescription {
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  /** Full URL (`apiBase + path`), or a short label when one call sends several requests. */
  url: string;
  /** Query parameters sent with the request (undefined entries are dropped in the preview). */
  query?: Record<string, unknown> | undefined;
  body?: unknown;
  toolName?: string;
  /**
   * Values checked for the redaction placeholder, keyed by the root of the reported path.
   * Default `{ body, query }`; a tool whose body is not the caller's input names the input.
   */
  checked?: Record<string, unknown>;
}

/** Guard switches; fields other than `confirmWrites` are optional so callers can pass any config. */
export type GuardConfig = Pick<Config, "confirmWrites"> &
  Partial<Pick<Config, "readOnly" | "requirePreview">>;

/** How long a preview unlocks the identical confirmed request under SNIPEIT_REQUIRE_PREVIEW. */
export const PREVIEW_TTL_MS = 10 * 60_000;
const MAX_PENDING_PREVIEWS = 500;

/** Previewed request fingerprints per server config (expiry timestamps). */
const pending = new WeakMap<object, Map<string, number>>();

function stable(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(stable);
  if (x && typeof x === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(x).sort()) {
      const v = (x as Record<string, unknown>)[k];
      if (v !== undefined) out[k] = stable(v);
    }
    return out;
  }
  return x;
}

function fingerprint(req: WriteRequestDescription): string {
  const key = JSON.stringify(
    stable({ t: req.toolName, m: req.method, u: req.url, q: req.query, b: req.body }),
  );
  return createHash("sha256").update(key).digest("hex");
}

function remember(cfg: object, fp: string): void {
  let map = pending.get(cfg);
  if (!map) pending.set(cfg, (map = new Map()));
  const now = Date.now();
  for (const [k, exp] of map) if (exp <= now) map.delete(k);
  map.delete(fp);
  map.set(fp, now + PREVIEW_TTL_MS);
  while (map.size > MAX_PENDING_PREVIEWS) map.delete(map.keys().next().value as string);
}

function consume(cfg: object, fp: string): boolean {
  const map = pending.get(cfg);
  const exp = map?.get(fp);
  if (exp === undefined) return false;
  map!.delete(fp);
  return exp > Date.now();
}

function definedEntries(query: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!query) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null) out[k] = v;
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Wrap a write operation so it is gated by `SNIPEIT_READ_ONLY`, `SNIPEIT_CONFIRM_WRITES`
 * and `SNIPEIT_REQUIRE_PREVIEW` (see the module comment).
 *
 * A preview is a normal result (not `isError`, so the model does not retry it) whose text
 * has `status: "preview"` and whose `_meta` has `"snipeit/preview": true`. Pass the full
 * URL (`apiBase + path`) and the query in `req`, so the preview names exactly what runs.
 *
 * @param logger - Receives one info line per preview, refusal and confirmed execution
 *                 (tool, method, URL; no body, no query).
 */
export async function runGuarded(
  cfg: GuardConfig,
  args: { confirm?: "YES" },
  req: WriteRequestDescription,
  execute: () => Promise<CallToolResult>,
  logger?: Pick<Logger, "info">,
): Promise<CallToolResult> {
  const url = redactSecrets(req.url);
  const audit = (event: string) =>
    logger?.info(`write ${event}`, { tool: req.toolName, method: req.method, url: url.split("?")[0] });

  const checked = req.checked ?? { body: req.body, query: req.query };
  const placeholders = Object.entries(checked).flatMap(([root, v]) => redactedPaths(v, root));
  if (placeholders.length > 0) {
    audit("refused (redaction placeholder)");
    return errorResult(
      `${req.toolName ?? "this tool"} refused: ${placeholders.join(", ")} ${placeholders.length === 1 ? "is" : "are"} "${REDACTED_PLACEHOLDER}", ` +
        "the placeholder of a redacted value (write preview, SNIPEIT_REDACT_SECRETS or SNIPEIT_REDACT_PII), and would overwrite the real value. " +
        "Nothing was sent. Set the real value or omit the field.",
      { code: "REDACTED_PLACEHOLDER", paths: placeholders },
    );
  }
  if (cfg.readOnly) {
    audit("refused (SNIPEIT_READ_ONLY)");
    return errorResult(
      `write refused: SNIPEIT_READ_ONLY is on, so ${req.toolName ?? "this tool"} cannot send ${req.method}; nothing was sent`,
      { code: "READ_ONLY" },
    );
  }
  if (!cfg.confirmWrites) return execute();

  const fp = cfg.requirePreview ? fingerprint(req) : "";
  if (args.confirm === "YES" && (!cfg.requirePreview || consume(cfg, fp))) {
    audit("confirmed");
    return execute();
  }
  if (cfg.requirePreview) remember(cfg, fp);
  audit("preview");

  const query = definedEntries(req.query);
  const payload = {
    status: "preview",
    preview: {
      tool: req.toolName,
      method: req.method,
      url,
      ...(query ? { query: redactBody(query) } : {}),
      body: req.body !== undefined ? redactBody(req.body) : undefined,
    },
    hint:
      args.confirm === "YES"
        ? "Nothing was changed. SNIPEIT_REQUIRE_PREVIEW is on and this exact request was not previewed in the last 10 minutes (or its preview was used). " +
          'Show this preview to the user; re-run the same call with `confirm: "YES"` to apply it.'
        : 'Nothing was changed. The write guard is on (SNIPEIT_CONFIRM_WRITES). Re-run the same call with `confirm: "YES"` to apply this change.',
  };
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    _meta: { "snipeit/preview": true },
  };
}
