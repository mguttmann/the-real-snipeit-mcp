// AUTO-GENERATED from /maintenances/{id} (maintenances-copy). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { runGuarded, confirmShape } from "../destructiveGuard.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_maintenances_copy",
    {
      title: "PUT /maintenances/{id}",
      description: "PUT /maintenances/{id}: Update selected fields in an existing maintenance. Generated from Snipe-IT OpenAPI operation maintenances-copy.",
      inputSchema: {id: z.number().int().describe("Path parameter 'id' (not declared in the spec, synthesized by codegen)"), body: z.object({name: z.string(),asset_id: z.number().int(),supplier_id: z.number().int(),is_warranty: z.boolean().optional(),cost: z.number().optional(),notes: z.string().optional(),asset_maintenance_type: z.enum(["Maintenance","Repair","PAT Test","Upgrade","Hardware Support","Software Support"]),start_date: z.string(),completion_date: z.string().optional()}).optional(), ...confirmShape},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      return runGuarded(ctx.cfg, a, { toolName: "snipeit_gen_maintenances_copy", method: "PUT", url: ctx.cfg.apiBase + `/maintenances/${encodeURIComponent(String(a.id))}`, body: a.body }, async () => {
        try {
          const res = await ctx.client.request("PUT", `/maintenances/${encodeURIComponent(String(a.id))}`, { body: a.body, query: undefined as Record<string, unknown> | undefined });
          return jsonResult(res.data, { write: true });
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      }, ctx.logger);
    },
  );
}
