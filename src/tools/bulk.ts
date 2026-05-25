import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server.js";
import { jsonResult } from "./helpers.js";
import { runGuarded, confirmShape } from "./destructiveGuard.js";
import { SnipeitApiError } from "../client/errors.js";

const writeOnce = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true } as const;

const itemShape = z.object({
  asset_id: z.number().int().positive(),
  checkout_to_type: z.enum(["user", "location", "asset"]),
  assigned_user: z.number().int().optional(),
  assigned_location: z.number().int().optional(),
  assigned_asset: z.number().int().optional(),
  note: z.string().optional(),
});

export function registerBulkTools(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_bulk_checkout",
    {
      title: "Bulk checkout assets",
      description:
        "Serially checks out multiple assets. Continues on per-item errors. Returns a result array with success/error for each item.",
      inputSchema: { items: z.array(itemShape).min(1).max(100), ...confirmShape },
      annotations: writeOnce,
    },
    async (a) => {
      return runGuarded(
        ctx.cfg,
        a,
        { toolName: "snipeit_bulk_checkout", method: "POST", url: "(multiple /hardware/{id}/checkout)", body: a.items },
        async () => {
          const results: Array<{ asset_id: number; ok: boolean; error?: string; data?: unknown }> = [];
          for (const item of a.items) {
            const { asset_id, ...rest } = item;
            try {
              const res = await ctx.client.request("POST", `/hardware/${asset_id}/checkout`, { body: rest });
              results.push({ asset_id, ok: true, data: res.data });
            } catch (err) {
              const msg = err instanceof SnipeitApiError ? err.message : err instanceof Error ? err.message : String(err);
              results.push({ asset_id, ok: false, error: msg });
            }
          }
          const summary = { total: results.length, ok: results.filter((r) => r.ok).length, errors: results.filter((r) => !r.ok).length };
          return jsonResult({ summary, results });
        },
      );
    },
  );
}
