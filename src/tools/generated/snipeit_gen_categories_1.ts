// AUTO-GENERATED from /categories (categories-1). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_categories_1",
    {
      title: "/categories",
      description: "/categories — generated from Snipe-IT OpenAPI categories-1",
      inputSchema: {name: z.string().describe("Category name").optional(), limit: z.number().int().describe("Number of results to return").optional(), offset: z.number().int().describe("Offset number (useful in pagination)").optional(), search: z.string().describe("Search string").optional(), sort: z.string().optional(), order: z.string().describe("Sort order (asc or desc)").optional(), category_id: z.number().int().describe("ID number of the category you'd like to filter by").optional(), category_type: z.enum(["asset","accessory","consumable","component","license"]).describe("Type of category").optional(), use_default_eula: z.boolean().optional(), require_acceptance: z.boolean().optional(), checkin_email: z.boolean().optional()},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      try {
        const res = await ctx.client.request("GET", `/categories`, { body: undefined, query: {name: a.name, limit: a.limit, offset: a.offset, search: a.search, sort: a.sort, order: a.order, category_id: a.category_id, category_type: a.category_type, use_default_eula: a.use_default_eula, require_acceptance: a.require_acceptance, checkin_email: a.checkin_email} as Record<string, unknown> | undefined });
        return jsonResult(res.data, { pagination: res.pagination });
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }
    },
  );
}
