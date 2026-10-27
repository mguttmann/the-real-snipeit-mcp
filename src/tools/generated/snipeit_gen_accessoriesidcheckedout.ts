// AUTO-GENERATED from /accessories/{id}/checkedout (accessoriesidcheckedout). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_accessoriesidcheckedout",
    {
      title: "GET /accessories/{id}/checkedout",
      description: "GET /accessories/{id}/checkedout: Show which users a specific accessory has been checked out to. Generated from Snipe-IT OpenAPI operation accessoriesidcheckedout.",
      inputSchema: {id: z.number().int(), limit: z.number().int().optional(), offset: z.number().int().optional()},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      try {
        const res = await ctx.client.request("GET", `/accessories/${encodeURIComponent(String(a.id))}/checkedout`, { body: undefined, query: {limit: a.limit, offset: a.offset} as Record<string, unknown> | undefined });
        return jsonResult(res.data, { pagination: res.pagination });
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }
    },
  );
}
