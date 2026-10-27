// AUTO-GENERATED from /accessories/{id}/checkin (accessories-checkin). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { runGuarded, confirmShape } from "../destructiveGuard.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_accessories_checkin",
    {
      title: "POST /accessories/{id}/checkin",
      description: "POST /accessories/{id}/checkin: Checkin an accessory from a user. Generated from Snipe-IT OpenAPI operation accessories-checkin.",
      inputSchema: {id: z.number().int().describe("This is the ID of the accessory+user relationships in the accessories_users table"), ...confirmShape},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (a) => {
      return runGuarded(ctx.cfg, a, { toolName: "snipeit_gen_accessories_checkin", method: "POST", url: ctx.cfg.apiBase + `/accessories/${encodeURIComponent(String(a.id))}/checkin`, body: undefined }, async () => {
        try {
          const res = await ctx.client.request("POST", `/accessories/${encodeURIComponent(String(a.id))}/checkin`, { body: undefined, query: undefined as Record<string, unknown> | undefined });
          return jsonResult(res.data, { write: true });
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      }, ctx.logger);
    },
  );
}
