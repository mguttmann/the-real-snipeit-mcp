/**
 * Destructive-write safety gate.
 *
 * When `SNIPEIT_CONFIRM_WRITES=true`, write tools return a redacted preview
 * (method, full URL, body with secrets scrubbed) instead of executing — callers
 * must re-invoke with `confirm: "YES"` to actually perform the change. When the
 * flag is off, writes execute directly.
 *
 * @module
 */
import { z } from "zod";
import { redactBody } from "./helpers.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Config } from "../config.js";

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
  url: string;
  body?: unknown;
  toolName?: string;
}

/**
 * Wrap a write operation so it can be gated by `SNIPEIT_CONFIRM_WRITES`.
 *
 * Behavior:
 * - `cfg.confirmWrites === false` (default) → `execute()` runs directly.
 * - `cfg.confirmWrites === true` AND `args.confirm === "YES"` → `execute()` runs.
 * - `cfg.confirmWrites === true` AND no `confirm` → returns a redacted preview
 *   (no execution) so the LLM can show the user what would happen and ask for explicit OK.
 *
 * The `url` in the preview is the full URL passed in `req.url` (use `apiBase + path`
 * at the call site so previews are unambiguous).
 */
export async function runGuarded(
  cfg: Pick<Config, "confirmWrites">,
  args: { confirm?: "YES" },
  req: WriteRequestDescription,
  execute: () => Promise<CallToolResult>,
): Promise<CallToolResult> {
  if (!cfg.confirmWrites) return execute();
  if (args.confirm === "YES") return execute();
  const payload = {
    preview: {
      tool: req.toolName,
      method: req.method,
      url: req.url,
      body: req.body !== undefined ? redactBody(req.body) : undefined,
    },
    hint: 'SNIPEIT_CONFIRM_WRITES=true is set. Re-run with `confirm: "YES"` to apply this change.',
  };
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}
