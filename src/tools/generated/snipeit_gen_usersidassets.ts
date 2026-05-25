// AUTO-GENERATED from /users/{id}/assets (usersidassets). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_usersidassets",
    {
      title: "/users/:id/assets",
      description: "/users/:id/assets — generated from Snipe-IT OpenAPI usersidassets",
      inputSchema: {id: z.number().int().describe("User id"), category_id: z.number().int().describe("Valid category ID to filter on within the user's assets").optional(), model_id: z.string().describe("Valid model ID to filter on user's assets").optional()},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      try {
        const res = await ctx.client.request("GET", `/users/${encodeURIComponent(String(a.id))}/assets`, { body: undefined, query: {category_id: a.category_id, model_id: a.model_id} as Record<string, unknown> | undefined });
        return jsonResult(res.data, { pagination: res.pagination });
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }
    },
  );
}
