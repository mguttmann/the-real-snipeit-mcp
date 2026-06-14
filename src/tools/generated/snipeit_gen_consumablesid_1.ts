// AUTO-GENERATED from /consumables/{id} (consumablesid-1). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { runGuarded, confirmShape } from "../destructiveGuard.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_consumablesid_1",
    {
      title: "/consumables/:id",
      description: "/consumables/:id — generated from Snipe-IT OpenAPI consumablesid-1",
      inputSchema: {id: z.number().int(), body: z.object({name: z.string(),qty: z.number().int(),category_id: z.number().int(),company_id: z.number().int().optional(),order_number: z.string().optional(),manufacturer_id: z.string().optional(),location_id: z.string().optional(),requestable: z.boolean().optional(),purchase_date: z.string().optional(),min_amt: z.number().int().optional(),model_number: z.string().optional(),item_no: z.string().optional()}).optional(), ...confirmShape},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      return runGuarded(ctx.cfg, a, { toolName: "snipeit_gen_consumablesid_1", method: "PATCH", url: `/consumables/${encodeURIComponent(String(a.id))}`, body: a.body }, async () => {
        try {
          const res = await ctx.client.request("PATCH", `/consumables/${encodeURIComponent(String(a.id))}`, { body: a.body, query: undefined as Record<string, unknown> | undefined });
          return jsonResult(res.data);
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      });
    },
  );
}
