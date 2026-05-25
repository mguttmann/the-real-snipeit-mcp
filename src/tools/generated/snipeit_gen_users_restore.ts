// AUTO-GENERATED from /users/{id}/restore (users-restore). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { runGuarded, confirmShape } from "../destructiveGuard.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_users_restore",
    {
      title: "/users/:id/restore",
      description: "/users/:id/restore — generated from Snipe-IT OpenAPI users-restore",
      inputSchema: {id: z.number().int().describe("User ID of a deleted user"), ...confirmShape},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (a) => {
      return runGuarded(ctx.cfg, a, { toolName: "snipeit_gen_users_restore", method: "POST", url: `/users/${encodeURIComponent(String(a.id))}/restore`, body: undefined }, async () => {
        try {
          const res = await ctx.client.request("POST", `/users/${encodeURIComponent(String(a.id))}/restore`, { body: undefined, query: undefined as Record<string, unknown> | undefined });
          return jsonResult(res.data);
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      });
    },
  );
}
