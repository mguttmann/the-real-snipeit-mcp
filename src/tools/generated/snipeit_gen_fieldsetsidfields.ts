// AUTO-GENERATED from /fieldsets/{id}/fields (fieldsetsidfields). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_fieldsetsidfields",
    {
      title: "GET /fieldsets/{id}/fields",
      description: "GET /fieldsets/{id}/fields: Return list of associated fields within a fieldset. Generated from Snipe-IT OpenAPI operation fieldsetsidfields.",
      inputSchema: {id: z.number().int().describe("The ID number of the fieldset")},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      try {
        const res = await ctx.client.request("GET", `/fieldsets/${encodeURIComponent(String(a.id))}/fields`, { body: undefined, query: undefined as Record<string, unknown> | undefined });
        return jsonResult(res.data, { pagination: res.pagination });
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }
    },
  );
}
