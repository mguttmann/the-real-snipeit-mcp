// AUTO-GENERATED from /accessories/{id} (accessoriesid-2). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { runGuarded, confirmShape } from "../destructiveGuard.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_accessoriesid_2",
    {
      title: "/accessories/:id",
      description: "/accessories/:id — generated from Snipe-IT OpenAPI accessoriesid-2",
      inputSchema: {id: z.number().int(), body: z.object({name: z.string().optional(),qty: z.number().int().optional(),order_number: z.string().optional(),purchase_cost: z.number().optional(),purchase_date: z.string().optional(),model_number: z.string().optional(),category_id: z.number().int().optional(),company_id: z.number().int().optional(),location_id: z.number().int().optional(),manufacturer_id: z.number().int().optional(),supplier_id: z.number().int().optional()}).optional(), ...confirmShape},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      return runGuarded(ctx.cfg, a, { toolName: "snipeit_gen_accessoriesid_2", method: "PATCH", url: `/accessories/${encodeURIComponent(String(a.id))}`, body: a.body }, async () => {
        try {
          const res = await ctx.client.request("PATCH", `/accessories/${encodeURIComponent(String(a.id))}`, { body: a.body, query: undefined as Record<string, unknown> | undefined });
          return jsonResult(res.data);
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      });
    },
  );
}
