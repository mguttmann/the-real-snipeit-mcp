// AUTO-GENERATED from /consumables/{id}/user (get_new-endpoint). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_get_new_endpoint_consumables_id_user",
    {
      title: "snipeit_gen_get_new_endpoint_consumables_id_user",
      description: "snipeit_gen_get_new_endpoint_consumables_id_user — generated from Snipe-IT OpenAPI get_new-endpoint",
      inputSchema: {id: z.string()},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      try {
        const res = await ctx.client.request("GET", `/consumables/${encodeURIComponent(String(a.id))}/user`, { body: undefined, query: undefined as Record<string, unknown> | undefined });
        return jsonResult(res.data, { pagination: res.pagination });
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }
    },
  );
}
