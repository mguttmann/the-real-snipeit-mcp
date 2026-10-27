// AUTO-GENERATED from /components/{id}/assets (componentsidassets). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_componentsidassets",
    {
      title: "GET /components/{id}/assets",
      description: "GET /components/{id}/assets: Returns a list of which assets a component has been checked out to. Generated from Snipe-IT OpenAPI operation componentsidassets.",
      inputSchema: {id: z.number().int()},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      try {
        const res = await ctx.client.request("GET", `/components/${encodeURIComponent(String(a.id))}/assets`, { body: undefined, query: undefined as Record<string, unknown> | undefined });
        return jsonResult(res.data, { pagination: res.pagination });
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }
    },
  );
}
