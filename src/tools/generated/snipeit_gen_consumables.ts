// AUTO-GENERATED from /consumables (consumables). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_consumables",
    {
      title: "/consumables",
      description: "/consumables — generated from Snipe-IT OpenAPI consumables",
      inputSchema: {name: z.string().describe("Consumable name").optional(), limit: z.number().int().describe("Specify the number of results you wish to return").optional(), offset: z.number().int().describe("Offset to use").optional(), search: z.string().describe("A text string to search the assets data for").optional(), order_number: z.string().describe("Return only assets associated with a specific order number").optional(), sort: z.string().describe("Specify the column name you wish to sort by").optional(), order: z.string().describe("Specify the order (asc or desc) you wish to order by on your sort column").optional(), expand: z.string().describe("Whether to include detailed information on categories, etc (true) or just the text name (false)").optional(), category_id: z.number().int().describe("Category ID to filter by").optional(), company_id: z.number().int().describe("Company ID to filter by").optional(), manufacturer_id: z.number().int().describe("Manufacturer ID to filter by").optional()},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      try {
        const res = await ctx.client.request("GET", `/consumables`, { body: undefined, query: {name: a.name, limit: a.limit, offset: a.offset, search: a.search, order_number: a.order_number, sort: a.sort, order: a.order, expand: a.expand, category_id: a.category_id, company_id: a.company_id, manufacturer_id: a.manufacturer_id} as Record<string, unknown> | undefined });
        return jsonResult(res.data, { pagination: res.pagination });
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }
    },
  );
}
