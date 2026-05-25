// AUTO-GENERATED from /locations (locations). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_locations",
    {
      title: "/locations",
      description: "/locations — generated from Snipe-IT OpenAPI locations",
      inputSchema: {name: z.string().optional(), limit: z.number().int().describe("Number of results to return").optional(), offset: z.number().int().describe("Offset to use when retrieving results (useful in pagination)").optional(), search: z.string().describe("Search string").optional(), sort: z.string().describe("Field to order by").optional(), order: z.string().describe("Sort order (asc or desc)").optional(), address: z.string().optional(), address2: z.string().optional(), city: z.string().optional(), zip: z.string().optional(), country: z.string().optional()},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      try {
        const res = await ctx.client.request("GET", `/locations`, { body: undefined, query: {name: a.name, limit: a.limit, offset: a.offset, search: a.search, sort: a.sort, order: a.order, address: a.address, address2: a.address2, city: a.city, zip: a.zip, country: a.country} as Record<string, unknown> | undefined });
        return jsonResult(res.data, { pagination: res.pagination });
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }
    },
  );
}
