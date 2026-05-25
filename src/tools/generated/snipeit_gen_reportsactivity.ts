// AUTO-GENERATED from /reports/activity (reportsactivity). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_reportsactivity",
    {
      title: "/reports/activity",
      description: "/reports/activity — generated from Snipe-IT OpenAPI reportsactivity",
      inputSchema: {limit: z.number().int().describe("Specify the number of results you wish to return. Defaults to 50, but we have it set to 2 by default so the API explorer doesn't scroll forever.").optional(), offset: z.number().int().describe("The offset from the start of results to use in order to page through the result set").optional(), search: z.string().describe("String to search on").optional(), target_type: z.string().describe("The type of target (entity something is checked out to) you're searching against. `App\\Models\\User`, etc. Required when passing target_id.").optional(), target_id: z.number().int().describe("The ID of the target you're querying against. Required if passing target_type").optional(), item_type: z.enum(["asset","accessory","consumable","component","license","user"]).describe("The type of item you're searching against. `App\\Models\\Asset`, etc. Required when passing item_id.").optional(), item_id: z.number().int().describe("The ID of the item you're querying against. Required if passing item_type").optional(), action_type: z.enum(["checkout","checkin from","update","create","delete","audit","uploaded","accepted","declined","requested"]).describe("The action type you'e querying against. Example values here are: \"add seats\", \"checkin from\", \"checkout\", \"update\"").optional(), order: z.enum(["asc","desc"]).describe("Ascending or descending order (defaults to desc if no value is given)").optional(), sort: z.enum(["id","created_at","target_id","user_id","accept_signature","action_type","note (defaults to desc if not value is given)"]).describe("What column the results should be sorted by (defaults to created_at date if no value is given)").optional()},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      try {
        const res = await ctx.client.request("GET", `/reports/activity`, { body: undefined, query: {limit: a.limit, offset: a.offset, search: a.search, target_type: a.target_type, target_id: a.target_id, item_type: a.item_type, item_id: a.item_id, action_type: a.action_type, order: a.order, sort: a.sort} as Record<string, unknown> | undefined });
        return jsonResult(res.data, { pagination: res.pagination });
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }
    },
  );
}
