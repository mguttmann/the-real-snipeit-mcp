// AUTO-GENERATED from /hardware (hardware-list). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_hardware_list",
    {
      title: "/hardware",
      description: "/hardware — generated from Snipe-IT OpenAPI hardware-list",
      inputSchema: {limit: z.number().int().describe("Specify the number of results you wish to return. Defaults to 50, but we have it set to 2 by default so the API explorer doesn't scroll forever.").optional(), offset: z.number().int().describe("Offset to use").optional(), search: z.string().describe("A text string to search the assets data for").optional(), order_number: z.string().describe("Return only assets associated with a specific order number").optional(), sort: z.string().describe("Specify the column name you wish to sort by").optional(), order: z.string().describe("Specify the order (asc or desc) you wish to order by on your sort column").optional(), model_id: z.number().int().describe("Optionally restrict asset results to this asset model ID").optional(), category_id: z.number().int().describe("Optionally restrict asset results to this status label ID").optional(), manufacturer_id: z.number().int().describe("Optionally restrict asset results to this asset model ID").optional(), company_id: z.number().int().describe("Optionally restrict asset results to this company ID").optional(), location_id: z.number().int().describe("Optionally restrict asset results to this location ID").optional(), status: z.string().describe("Optionally restrict asset results to one of these status types: RTD, Deployed, Undeployable, Deleted, Archived, Requestable").optional(), status_id: z.number().int().describe("Optionally restrict asset results to this status label ID").optional(), assigned_to: z.number().int().optional(), assigned_type: z.enum(["App\\Models\\Asset","App\\Models\\Accessory","App\\Models\\User"]).optional(), filter: z.string().describe("Key value pair of the field you want to search on and the value, for example: `{\"name\":\"hello\",\"asset_tag\":\"12345\"}`").optional()},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      try {
        const res = await ctx.client.request("GET", `/hardware`, { body: undefined, query: {limit: a.limit, offset: a.offset, search: a.search, order_number: a.order_number, sort: a.sort, order: a.order, model_id: a.model_id, category_id: a.category_id, manufacturer_id: a.manufacturer_id, company_id: a.company_id, location_id: a.location_id, status: a.status, status_id: a.status_id, assigned_to: a.assigned_to, assigned_type: a.assigned_type, filter: a.filter} as Record<string, unknown> | undefined });
        return jsonResult(res.data, { pagination: res.pagination });
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }
    },
  );
}
