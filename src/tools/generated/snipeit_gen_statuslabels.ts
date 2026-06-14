// AUTO-GENERATED from /statuslabels (statuslabels). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_statuslabels",
    {
      title: "/statuslabels",
      description: "/statuslabels — generated from Snipe-IT OpenAPI statuslabels",
      inputSchema: {name: z.string().optional(), limit: z.number().int().describe("Number of records to return").optional(), offset: z.number().int().describe("Offset to use when retrieving results (useful in pagination)").optional(), search: z.string().describe("String to search on").optional(), sort: z.string().describe("Field to order by").optional(), order: z.string().describe("Sort order (asc or desc)").optional(), status_type: z.enum(["deployable","undeployable","pending","archived"]).optional()},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      try {
        const res = await ctx.client.request("GET", `/statuslabels`, { body: undefined, query: {name: a.name, limit: a.limit, offset: a.offset, search: a.search, sort: a.sort, order: a.order, status_type: a.status_type} as Record<string, unknown> | undefined });
        return jsonResult(res.data, { pagination: res.pagination });
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }
    },
  );
}
