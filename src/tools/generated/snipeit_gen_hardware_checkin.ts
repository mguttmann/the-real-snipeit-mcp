// AUTO-GENERATED from /hardware/{id}/checkin (hardware-checkin). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { runGuarded, confirmShape } from "../destructiveGuard.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_hardware_checkin",
    {
      title: "POST /hardware/{id}/checkin",
      description: "POST /hardware/{id}/checkin: Checkin an asset. Generated from Snipe-IT OpenAPI operation hardware-checkin.",
      inputSchema: {id: z.number().int().describe("The id (not the asset tag) of the asset you'd like to query"), body: z.object({status_id: z.number().int(),name: z.string().optional(),note: z.string().optional(),location_id: z.string().optional()}).optional(), ...confirmShape},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (a) => {
      return runGuarded(ctx.cfg, a, { toolName: "snipeit_gen_hardware_checkin", method: "POST", url: ctx.cfg.apiBase + `/hardware/${encodeURIComponent(String(a.id))}/checkin`, body: a.body }, async () => {
        try {
          const res = await ctx.client.request("POST", `/hardware/${encodeURIComponent(String(a.id))}/checkin`, { body: a.body, query: undefined as Record<string, unknown> | undefined });
          return jsonResult(res.data, { write: true });
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      }, ctx.logger);
    },
  );
}
