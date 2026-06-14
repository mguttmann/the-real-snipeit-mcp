// AUTO-GENERATED from /accessories/{id} (accessoriesid-3). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { runGuarded, confirmShape } from "../destructiveGuard.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_accessoriesid_3",
    {
      title: "/accessories/:id",
      description: "/accessories/:id — generated from Snipe-IT OpenAPI accessoriesid-3",
      inputSchema: {id: z.number().int(), ...confirmShape},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      return runGuarded(ctx.cfg, a, { toolName: "snipeit_gen_accessoriesid_3", method: "DELETE", url: `/accessories/${encodeURIComponent(String(a.id))}`, body: undefined }, async () => {
        try {
          const res = await ctx.client.request("DELETE", `/accessories/${encodeURIComponent(String(a.id))}`, { body: undefined, query: undefined as Record<string, unknown> | undefined });
          return jsonResult(res.data);
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      });
    },
  );
}
