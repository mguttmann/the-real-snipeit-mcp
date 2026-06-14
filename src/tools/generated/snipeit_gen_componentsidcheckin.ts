// AUTO-GENERATED from /components/{id}/checkin (componentsidcheckin). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { runGuarded, confirmShape } from "../destructiveGuard.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_componentsidcheckin",
    {
      title: "/components/:id/checkin",
      description: "/components/:id/checkin — generated from Snipe-IT OpenAPI componentsidcheckin",
      inputSchema: {id: z.number().int().describe("ID of the record in the components_assets *join* record"), body: z.object({checkin_qty: z.number().int()}).optional(), ...confirmShape},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (a) => {
      return runGuarded(ctx.cfg, a, { toolName: "snipeit_gen_componentsidcheckin", method: "POST", url: `/components/${encodeURIComponent(String(a.id))}/checkin`, body: a.body }, async () => {
        try {
          const res = await ctx.client.request("POST", `/components/${encodeURIComponent(String(a.id))}/checkin`, { body: a.body, query: undefined as Record<string, unknown> | undefined });
          return jsonResult(res.data);
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      });
    },
  );
}
