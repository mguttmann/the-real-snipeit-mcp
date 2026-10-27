// AUTO-GENERATED from /licenses/{id}/seats/{seat_id} (put_licenses{id}seats{seat_id}). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { runGuarded, confirmShape } from "../destructiveGuard.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_put_licensesidseatsseat_id",
    {
      title: "PUT /licenses/{id}/seats/{seat_id}",
      description: "PUT /licenses/{id}/seats/{seat_id}: Update user or asset a license is checked-out to (Check-in/Check-out). Generated from Snipe-IT OpenAPI operation put_licenses{id}seats{seat_id}.",
      inputSchema: {id: z.number().int().describe("The id (not name) of the license."), seat_id: z.number().int().describe("The Seat ID (unique seat identifier) of the license seat that will be modified"), body: z.object({assigned_to: z.number().int().optional(),asset_id: z.number().int().optional(),note: z.string().optional()}).optional(), ...confirmShape},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      return runGuarded(ctx.cfg, a, { toolName: "snipeit_gen_put_licensesidseatsseat_id", method: "PUT", url: ctx.cfg.apiBase + `/licenses/${encodeURIComponent(String(a.id))}/seats/${encodeURIComponent(String(a.seat_id))}`, body: a.body }, async () => {
        try {
          const res = await ctx.client.request("PUT", `/licenses/${encodeURIComponent(String(a.id))}/seats/${encodeURIComponent(String(a.seat_id))}`, { body: a.body, query: undefined as Record<string, unknown> | undefined });
          return jsonResult(res.data, { write: true });
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      }, ctx.logger);
    },
  );
}
