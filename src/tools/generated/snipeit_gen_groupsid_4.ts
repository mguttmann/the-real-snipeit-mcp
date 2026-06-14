// AUTO-GENERATED from /groups/{id} (groupsid-4). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { runGuarded, confirmShape } from "../destructiveGuard.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_groupsid_4",
    {
      title: "/groups/:id",
      description: "/groups/:id — generated from Snipe-IT OpenAPI groupsid-4",
      inputSchema: {id: z.number().int().describe("Group ID"), body: z.object({name: z.string(),permissions: z.string().optional()}).optional(), ...confirmShape},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      return runGuarded(ctx.cfg, a, { toolName: "snipeit_gen_groupsid_4", method: "PATCH", url: `/groups/${encodeURIComponent(String(a.id))}`, body: a.body }, async () => {
        try {
          const res = await ctx.client.request("PATCH", `/groups/${encodeURIComponent(String(a.id))}`, { body: a.body, query: undefined as Record<string, unknown> | undefined });
          return jsonResult(res.data);
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      });
    },
  );
}
