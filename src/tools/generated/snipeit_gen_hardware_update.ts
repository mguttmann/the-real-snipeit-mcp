// AUTO-GENERATED from /hardware/{id} (hardware-update). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { runGuarded, confirmShape } from "../destructiveGuard.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_hardware_update",
    {
      title: "/hardware/:id",
      description: "/hardware/:id — generated from Snipe-IT OpenAPI hardware-update",
      inputSchema: {id: z.number().int().describe("The id of the asset you'd like to query"), body: z.object({asset_tag: z.string(),status_id: z.number().int(),model_id: z.number().int(),notes: z.string().optional(),last_checkout: z.string().optional(),assigned_user: z.number().int().optional(),assigned_location: z.number().int().optional(),assigned_asset: z.number().int().optional(),company_id: z.number().int().optional(),serial: z.string().optional(),order_number: z.string().optional(),warranty_months: z.number().int().optional(),purchase_cost: z.number().optional(),purchase_date: z.string().optional(),requestable: z.boolean().optional(),archived: z.boolean().optional(),rtd_location_id: z.number().int().optional(),name: z.string().optional(),location_id: z.number().int().optional(),image: z.string().optional(),byod: z.number().int().optional()}).optional(), ...confirmShape},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      return runGuarded(ctx.cfg, a, { toolName: "snipeit_gen_hardware_update", method: "PUT", url: `/hardware/${encodeURIComponent(String(a.id))}`, body: a.body }, async () => {
        try {
          const res = await ctx.client.request("PUT", `/hardware/${encodeURIComponent(String(a.id))}`, { body: a.body, query: undefined as Record<string, unknown> | undefined });
          return jsonResult(res.data);
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      });
    },
  );
}
