// AUTO-GENERATED from /components/{id}/checkout (componentsidcheckout). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { runGuarded, confirmShape } from "../destructiveGuard.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_componentsidcheckout",
    {
      title: "POST /components/{id}/checkout",
      description: "POST /components/{id}/checkout: Check an accessory out to an asset. Generated from Snipe-IT OpenAPI operation componentsidcheckout.",
      inputSchema: {id: z.number().int().describe("ID of the component to check out"), body: z.object({assigned_to: z.number().int(),assigned_qty: z.number().int()}).optional(), ...confirmShape},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (a) => {
      return runGuarded(ctx.cfg, a, { toolName: "snipeit_gen_componentsidcheckout", method: "POST", url: ctx.cfg.apiBase + `/components/${encodeURIComponent(String(a.id))}/checkout`, body: a.body }, async () => {
        try {
          const res = await ctx.client.request("POST", `/components/${encodeURIComponent(String(a.id))}/checkout`, { body: a.body, query: undefined as Record<string, unknown> | undefined });
          return jsonResult(res.data, { write: true });
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      }, ctx.logger);
    },
  );
}
