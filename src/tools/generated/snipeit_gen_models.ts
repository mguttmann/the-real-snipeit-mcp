// AUTO-GENERATED from /models (models). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_models",
    {
      title: "/models",
      description: "/models — generated from Snipe-IT OpenAPI models",
      inputSchema: {limit: z.number().int().describe("Number of records to return").optional(), offset: z.number().int().describe("Offset to use when retrieving results (useful in pagination)").optional(), search: z.string().describe("Search string").optional(), sort: z.string().describe("Field to order by").optional(), order: z.string().describe("Sort order (asc or desc)").optional(), name: z.string().describe("Name of the asset model").optional(), notes: z.string().describe("Model notes").optional(), model_number: z.string().describe("Model number").optional(), requestable: z.enum(["true","false"]).describe("Whether or not the model is requestable").optional(), category_id: z.number().int().describe("Filter by category ID").optional(), depreciation_id: z.number().int().describe("Filter by depreciation ID").optional()},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      try {
        const res = await ctx.client.request("GET", `/models`, { body: undefined, query: {limit: a.limit, offset: a.offset, search: a.search, sort: a.sort, order: a.order, name: a.name, notes: a.notes, model_number: a.model_number, requestable: a.requestable, category_id: a.category_id, depreciation_id: a.depreciation_id} as Record<string, unknown> | undefined });
        return jsonResult(res.data, { pagination: res.pagination });
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }
    },
  );
}
