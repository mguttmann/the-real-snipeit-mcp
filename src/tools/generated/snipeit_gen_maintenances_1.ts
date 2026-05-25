// AUTO-GENERATED from /maintenances (maintenances-1). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { runGuarded, confirmShape } from "../destructiveGuard.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_maintenances_1",
    {
      title: "/maintenances",
      description: "/maintenances — generated from Snipe-IT OpenAPI maintenances-1",
      inputSchema: {body: z.object({name: z.string(),asset_id: z.number().int(),supplier_id: z.number().int(),is_warranty: z.boolean().optional(),cost: z.number().optional(),notes: z.string().optional(),asset_maintenance_type: z.enum(["Maintenance","Repair","PAT Test","Upgrade","Hardware Support","Software Support"]),start_date: z.string(),completion_date: z.string().optional()}).optional(), ...confirmShape},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (a) => {
      return runGuarded(ctx.cfg, a, { toolName: "snipeit_gen_maintenances_1", method: "POST", url: `/maintenances`, body: a.body }, async () => {
        try {
          const res = await ctx.client.request("POST", `/maintenances`, { body: a.body, query: undefined as Record<string, unknown> | undefined });
          return jsonResult(res.data);
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      });
    },
  );
}
