// AUTO-GENERATED from /licenses/{id}/seats/{seat_id} (licensesidseatsseat_id). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_licensesidseatsseat_id",
    {
      title: "GET /licenses/{id}/seats/{seat_id}",
      description: "GET /licenses/{id}/seats/{seat_id}: Get details for one specific unique Seat ID for a particular license. Generated from Snipe-IT OpenAPI operation licensesidseatsseat_id.",
      inputSchema: {id: z.number().int().describe("The id (not name) of the license."), seat_id: z.number().int().describe("The Unique Seat ID for this seat for this license")},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      try {
        const res = await ctx.client.request("GET", `/licenses/${encodeURIComponent(String(a.id))}/seats/${encodeURIComponent(String(a.seat_id))}`, { body: undefined, query: undefined as Record<string, unknown> | undefined });
        return jsonResult(res.data, { pagination: res.pagination });
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }
    },
  );
}
