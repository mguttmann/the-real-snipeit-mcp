// AUTO-GENERATED from /maintenances (maintenances). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_maintenances",
    {
      title: "/maintenances",
      description: "/maintenances — generated from Snipe-IT OpenAPI maintenances",
      inputSchema: {limit: z.number().int().describe("Number of results to return").optional(), offset: z.number().int().describe("Offset to use when retrieving results (useful in pagination)").optional(), search: z.string().describe("Search string").optional(), sort: z.string().describe("Field to order by").optional(), order: z.string().describe("Sort order (asc or desc)").optional(), asset_id: z.number().int().describe("Asset ID of the asset you'd like to return maintenances for").optional()},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      try {
        const res = await ctx.client.request("GET", `/maintenances`, { body: undefined, query: {limit: a.limit, offset: a.offset, search: a.search, sort: a.sort, order: a.order, asset_id: a.asset_id} as Record<string, unknown> | undefined });
        return jsonResult(res.data, { pagination: res.pagination });
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }
    },
  );
}
