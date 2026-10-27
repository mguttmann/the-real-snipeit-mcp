import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ServerContext } from "../server.js";
import { jsonResult } from "./helpers.js";
import { runGuarded, confirmShape } from "./destructiveGuard.js";
import { SnipeitApiError } from "../client/errors.js";

const writeOnce = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
} as const;

const itemShape = z.object({
  asset_id: z.number().int().positive(),
  checkout_to_type: z.enum(["user", "location", "asset"]),
  assigned_user: z.number().int().optional(),
  assigned_location: z.number().int().optional(),
  assigned_asset: z.number().int().optional(),
  status_id: z.number().int().optional(),
  checkout_at: z.string().optional(),
  expected_checkin: z.string().optional(),
  note: z.string().optional(),
});

export function registerBulkTools(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_bulk_checkout",
    {
      title: "Bulk checkout assets",
      description:
        "Serially checks out multiple assets. Continues on per-item errors. Returns a result array with success/error for each item. Stops before the next item when the request is cancelled; the summary then reports aborted and not_attempted.",
      inputSchema: { items: z.array(itemShape).min(1).max(100), ...confirmShape },
      annotations: writeOnce,
    },
    async (a, reqCtx) => {
      const signal = reqCtx?.mcpReq?.signal;
      return runGuarded(
        ctx.cfg,
        a,
        {
          toolName: "snipeit_bulk_checkout",
          method: "POST",
          url: `(one POST per item, ${a.items.length} in total; see body)`,
          checked: { items: a.items },
          // The concrete requests, in order, exactly as they will be sent.
          body: a.items.map(({ asset_id, ...rest }) => ({
            method: "POST",
            url: `${ctx.cfg.apiBase}/hardware/${asset_id}/checkout`,
            body: rest,
          })),
        },
        async () => {
          const results: Array<{ asset_id: number; ok: boolean; error?: string; data?: unknown }> = [];
          for (const item of a.items) {
            // Cancellation or gateway timeout: stop before the next write, keep what ran.
            if (signal?.aborted) break;
            const { asset_id, ...rest } = item;
            try {
              const res = await ctx.client.request("POST", `/hardware/${asset_id}/checkout`, {
                body: rest,
                signal,
              });
              results.push({ asset_id, ok: true, data: res.data });
              ctx.logger.info("bulk_checkout item", { asset_id, ok: true });
            } catch (err) {
              const msg =
                err instanceof SnipeitApiError
                  ? err.message
                  : err instanceof Error
                    ? err.message
                    : String(err);
              results.push({ asset_id, ok: false, error: msg });
              // No error text in the log: Snipe-IT messages can carry user names.
              ctx.logger.info("bulk_checkout item", {
                asset_id,
                ok: false,
                ...(err instanceof SnipeitApiError ? { status: err.statusCode } : {}),
              });
            }
          }
          const ok = results.filter((r) => r.ok).length;
          const summary: Record<string, unknown> = { total: a.items.length, ok, errors: results.length - ok };
          if (results.length < a.items.length) {
            summary.aborted = true;
            summary.not_attempted = a.items.length - results.length;
            ctx.logger.info("bulk_checkout aborted", {
              executed: results.length,
              not_attempted: summary.not_attempted,
            });
          }
          return jsonResult({ summary, results }, { write: true });
        },
        ctx.logger,
      );
    },
  );
}
