// AUTO-GENERATED from /hardware/{id}/licenses (hardwareidlicenses). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_hardwareidlicenses",
    {
      title: "/hardware/:id/licenses",
      description: "/hardware/:id/licenses — generated from Snipe-IT OpenAPI hardwareidlicenses",
      inputSchema: {id: z.number().int().describe("The id (not the asset tag) of the asset you'd like to query")},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      try {
        const res = await ctx.client.request("GET", `/hardware/${encodeURIComponent(String(a.id))}/licenses`, { body: undefined, query: undefined as Record<string, unknown> | undefined });
        return jsonResult(res.data, { pagination: res.pagination });
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }
    },
  );
}
