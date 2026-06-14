// AUTO-GENERATED from /components (components-1). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { runGuarded, confirmShape } from "../destructiveGuard.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_components_1",
    {
      title: "/components",
      description: "/components — generated from Snipe-IT OpenAPI components-1",
      inputSchema: {body: z.object({name: z.string(),qty: z.number().int(),category_id: z.number().int(),location_id: z.number().int().optional(),company_id: z.number().int().optional(),order_number: z.string().optional(),purchase_date: z.string().optional(),purchase_cost: z.number().optional(),min_amt: z.number().int().optional(),serial: z.string().optional(),model_number: z.string().optional()}).optional(), ...confirmShape},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (a) => {
      return runGuarded(ctx.cfg, a, { toolName: "snipeit_gen_components_1", method: "POST", url: `/components`, body: a.body }, async () => {
        try {
          const res = await ctx.client.request("POST", `/components`, { body: a.body, query: undefined as Record<string, unknown> | undefined });
          return jsonResult(res.data);
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      });
    },
  );
}
