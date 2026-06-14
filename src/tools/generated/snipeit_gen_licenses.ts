// AUTO-GENERATED from /licenses (licenses). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_licenses",
    {
      title: "/licenses",
      description: "/licenses — generated from Snipe-IT OpenAPI licenses",
      inputSchema: {name: z.string().optional(), product_key: z.string().optional(), limit: z.number().int().describe("Specify the number of results you wish to return").optional(), offset: z.number().int().describe("Offset to use").optional(), search: z.string().describe("A text string to search the assets data for").optional(), order_number: z.string().describe("Return only assets associated with a specific order number").optional(), sort: z.string().describe("Specify the column name you wish to sort by").optional(), order: z.string().describe("Specify the order (asc or desc) you wish to order by on your sort column").optional(), expand: z.string().describe("Whether to include detailed information on categories, etc (true) or just the text name (false)").optional(), purchase_order: z.string().optional(), license_name: z.string().describe("Name of the person on the license").optional(), license_email: z.string().describe("Email address associated with license").optional(), manufacturer_id: z.number().int().describe("Manufacturer ID").optional(), supplier_id: z.number().int().describe("Supplier ID").optional(), category_id: z.number().int().describe("Category ID").optional(), depreciation_id: z.number().int().describe("Depreciation ID").optional(), maintained: z.boolean().describe("true / false").optional(), deleted: z.string().describe("Set to true to return deleted licenses").optional()},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      try {
        const res = await ctx.client.request("GET", `/licenses`, { body: undefined, query: {name: a.name, product_key: a.product_key, limit: a.limit, offset: a.offset, search: a.search, order_number: a.order_number, sort: a.sort, order: a.order, expand: a.expand, purchase_order: a.purchase_order, license_name: a.license_name, license_email: a.license_email, manufacturer_id: a.manufacturer_id, supplier_id: a.supplier_id, category_id: a.category_id, depreciation_id: a.depreciation_id, maintained: a.maintained, deleted: a.deleted} as Record<string, unknown> | undefined });
        return jsonResult(res.data, { pagination: res.pagination });
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }
    },
  );
}
