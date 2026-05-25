// AUTO-GENERATED from /accessories/{id}/checkout (accessories-checkout). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { runGuarded, confirmShape } from "../destructiveGuard.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_accessories_checkout",
    {
      title: "/accessories/:id/checkout",
      description: "/accessories/:id/checkout — generated from Snipe-IT OpenAPI accessories-checkout",
      inputSchema: {id: z.number().int(), limit: z.number().int().optional(), offset: z.string().optional(), body: z.object({assigned_user: z.number().int(),note: z.string().optional(),checkout_qty: z.number().int().optional()}).optional(), ...confirmShape},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (a) => {
      return runGuarded(ctx.cfg, a, { toolName: "snipeit_gen_accessories_checkout", method: "POST", url: `/accessories/${encodeURIComponent(String(a.id))}/checkout`, body: a.body }, async () => {
        try {
          const res = await ctx.client.request("POST", `/accessories/${encodeURIComponent(String(a.id))}/checkout`, { body: a.body, query: {limit: a.limit, offset: a.offset} as Record<string, unknown> | undefined });
          return jsonResult(res.data);
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      });
    },
  );
}
