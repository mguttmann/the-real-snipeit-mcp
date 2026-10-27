// AUTO-GENERATED from /components/{id} (componentsid-1). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { runGuarded, confirmShape } from "../destructiveGuard.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_componentsid_1",
    {
      title: "PUT /components/{id}",
      description: "PUT /components/{id}: Updates a component. Generated from Snipe-IT OpenAPI operation componentsid-1.",
      inputSchema: {id: z.number().int(), body: z.object({name: z.string(),qty: z.number().int(),category_id: z.number().int(),location_id: z.number().int().optional(),company_id: z.number().int().optional(),order_number: z.string().optional(),purchase_date: z.string().optional(),purchase_cost: z.number().optional(),min_amt: z.number().int().optional(),serial: z.string().optional()}).optional(), ...confirmShape},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      return runGuarded(ctx.cfg, a, { toolName: "snipeit_gen_componentsid_1", method: "PUT", url: ctx.cfg.apiBase + `/components/${encodeURIComponent(String(a.id))}`, body: a.body }, async () => {
        try {
          const res = await ctx.client.request("PUT", `/components/${encodeURIComponent(String(a.id))}`, { body: a.body, query: undefined as Record<string, unknown> | undefined });
          return jsonResult(res.data, { write: true });
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      }, ctx.logger);
    },
  );
}
