// AUTO-GENERATED from /categories/{id} (categoriesid-3). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_categoriesid_3",
    {
      title: "/categories/:id",
      description: "/categories/:id — generated from Snipe-IT OpenAPI categoriesid-3",
      inputSchema: {id: z.number().int().describe("Category ID")},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      try {
        const res = await ctx.client.request("GET", `/categories/${encodeURIComponent(String(a.id))}`, { body: undefined, query: undefined as Record<string, unknown> | undefined });
        return jsonResult(res.data, { pagination: res.pagination });
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }
    },
  );
}
