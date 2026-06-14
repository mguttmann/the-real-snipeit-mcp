// AUTO-GENERATED from /accessories (accessories-1). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { runGuarded, confirmShape } from "../destructiveGuard.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_accessories_1",
    {
      title: "/accessories",
      description: "/accessories — generated from Snipe-IT OpenAPI accessories-1",
      inputSchema: {body: z.object({name: z.string(),qty: z.number().int(),order_number: z.string().optional(),purchase_cost: z.number().optional(),purchase_date: z.string().optional(),model_number: z.string().optional(),category_id: z.number().int(),company_id: z.number().int().optional(),location_id: z.number().int().optional(),manufacturer_id: z.number().int().optional(),supplier_id: z.number().int().optional()}).optional(), ...confirmShape},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (a) => {
      return runGuarded(ctx.cfg, a, { toolName: "snipeit_gen_accessories_1", method: "POST", url: `/accessories`, body: a.body }, async () => {
        try {
          const res = await ctx.client.request("POST", `/accessories`, { body: a.body, query: undefined as Record<string, unknown> | undefined });
          return jsonResult(res.data);
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      });
    },
  );
}
