// AUTO-GENERATED from /accessories/{id}/checkout (accessories-checkout). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { runGuarded, confirmShape } from "../destructiveGuard.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_accessories_checkout",
    {
      title: "POST /accessories/{id}/checkout",
      description: "POST /accessories/{id}/checkout: Check an accessory out to a user. Generated from Snipe-IT OpenAPI operation accessories-checkout.",
      inputSchema: {id: z.number().int(), limit: z.number().int().optional(), offset: z.string().optional(), body: z.object({assigned_user: z.number().int(),note: z.string().optional(),checkout_qty: z.number().int().optional()}).optional(), ...confirmShape},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (a) => {
      return runGuarded(ctx.cfg, a, { toolName: "snipeit_gen_accessories_checkout", method: "POST", url: ctx.cfg.apiBase + `/accessories/${encodeURIComponent(String(a.id))}/checkout`, query: {limit: a.limit, offset: a.offset}, body: a.body }, async () => {
        try {
          const res = await ctx.client.request("POST", `/accessories/${encodeURIComponent(String(a.id))}/checkout`, { body: a.body, query: {limit: a.limit, offset: a.offset} as Record<string, unknown> | undefined });
          return jsonResult(res.data, { write: true });
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      }, ctx.logger);
    },
  );
}
