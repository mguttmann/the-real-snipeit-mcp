// AUTO-GENERATED from /hardware/{id}/checkout (hardware-checkout). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { runGuarded, confirmShape } from "../destructiveGuard.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_hardware_checkout",
    {
      title: "/hardware/:id/checkout",
      description: "/hardware/:id/checkout — generated from Snipe-IT OpenAPI hardware-checkout",
      inputSchema: {id: z.number().int().describe("The id (not the asset tag) of the asset you'd like to query"), body: z.object({status_id: z.number().int(),checkout_to_type: z.enum(["asset","location","user"]),assigned_user: z.number().int().optional(),assigned_asset: z.number().int().optional(),assigned_location: z.number().int().optional(),expected_checkin: z.string().optional(),checkout_at: z.string().optional(),name: z.string().optional(),note: z.string().optional()}).optional(), ...confirmShape},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (a) => {
      return runGuarded(ctx.cfg, a, { toolName: "snipeit_gen_hardware_checkout", method: "POST", url: `/hardware/${encodeURIComponent(String(a.id))}/checkout`, body: a.body }, async () => {
        try {
          const res = await ctx.client.request("POST", `/hardware/${encodeURIComponent(String(a.id))}/checkout`, { body: a.body, query: undefined as Record<string, unknown> | undefined });
          return jsonResult(res.data);
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      });
    },
  );
}
