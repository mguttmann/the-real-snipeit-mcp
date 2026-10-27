// AUTO-GENERATED from /hardware/audit (hardwareaudit). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { runGuarded, confirmShape } from "../destructiveGuard.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_hardwareaudit",
    {
      title: "POST /hardware/audit",
      description: "POST /hardware/audit: Mark an asset as audited. Generated from Snipe-IT OpenAPI operation hardwareaudit.",
      inputSchema: {body: z.object({asset_tag: z.string(),location_id: z.number().int().optional(),next_audit_date: z.string().optional()}).optional(), ...confirmShape},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (a) => {
      return runGuarded(ctx.cfg, a, { toolName: "snipeit_gen_hardwareaudit", method: "POST", url: ctx.cfg.apiBase + `/hardware/audit`, body: a.body }, async () => {
        try {
          const res = await ctx.client.request("POST", `/hardware/audit`, { body: a.body, query: undefined as Record<string, unknown> | undefined });
          return jsonResult(res.data, { write: true });
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      }, ctx.logger);
    },
  );
}
