// AUTO-GENERATED from /categories (categories-2). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { runGuarded, confirmShape } from "../destructiveGuard.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_categories_2",
    {
      title: "/categories",
      description: "/categories — generated from Snipe-IT OpenAPI categories-2",
      inputSchema: {body: z.object({name: z.string(),category_type: z.enum(["asset","accessory","consumable","component","license"]),use_default_eula: z.boolean().optional(),require_acceptance: z.boolean().optional(),checkin_email: z.boolean().optional()}).optional(), ...confirmShape},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (a) => {
      return runGuarded(ctx.cfg, a, { toolName: "snipeit_gen_categories_2", method: "POST", url: `/categories`, body: a.body }, async () => {
        try {
          const res = await ctx.client.request("POST", `/categories`, { body: a.body, query: undefined as Record<string, unknown> | undefined });
          return jsonResult(res.data);
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      });
    },
  );
}
