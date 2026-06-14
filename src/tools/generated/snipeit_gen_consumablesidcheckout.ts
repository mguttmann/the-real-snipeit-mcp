// AUTO-GENERATED from /consumables/{id}/checkout (consumablesidcheckout). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { runGuarded, confirmShape } from "../destructiveGuard.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_consumablesidcheckout",
    {
      title: "/consumables/:id/checkout",
      description: "/consumables/:id/checkout — generated from Snipe-IT OpenAPI consumablesidcheckout",
      inputSchema: {id: z.number().int(), body: z.object({assigned_to: z.number().int().optional(),checkout_qty: z.number().int().optional()}).optional(), ...confirmShape},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (a) => {
      return runGuarded(ctx.cfg, a, { toolName: "snipeit_gen_consumablesidcheckout", method: "POST", url: `/consumables/${encodeURIComponent(String(a.id))}/checkout`, body: a.body }, async () => {
        try {
          const res = await ctx.client.request("POST", `/consumables/${encodeURIComponent(String(a.id))}/checkout`, { body: a.body, query: undefined as Record<string, unknown> | undefined });
          return jsonResult(res.data);
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      });
    },
  );
}
