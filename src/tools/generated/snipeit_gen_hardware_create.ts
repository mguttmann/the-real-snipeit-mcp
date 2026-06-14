// AUTO-GENERATED from /hardware (hardware-create). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { runGuarded, confirmShape } from "../destructiveGuard.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_hardware_create",
    {
      title: "/hardware",
      description: "/hardware — generated from Snipe-IT OpenAPI hardware-create",
      inputSchema: {body: z.object({asset_tag: z.string(),status_id: z.number().int(),model_id: z.number().int(),name: z.string().optional(),image: z.string().optional(),serial: z.string().optional(),purchase_date: z.string().optional(),purchase_cost: z.number().optional(),order_number: z.string().optional(),notes: z.string().optional(),archived: z.boolean().optional(),warranty_months: z.number().int().optional(),depreciate: z.boolean().optional(),supplier_id: z.number().int().optional(),requestable: z.boolean().optional(),rtd_location_id: z.number().int().optional(),last_audit_date: z.string().optional(),location_id: z.number().int().optional(),byod: z.boolean().optional()}).optional(), ...confirmShape},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (a) => {
      return runGuarded(ctx.cfg, a, { toolName: "snipeit_gen_hardware_create", method: "POST", url: `/hardware`, body: a.body }, async () => {
        try {
          const res = await ctx.client.request("POST", `/hardware`, { body: a.body, query: undefined as Record<string, unknown> | undefined });
          return jsonResult(res.data);
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      });
    },
  );
}
