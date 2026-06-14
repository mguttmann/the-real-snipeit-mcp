// AUTO-GENERATED from /hardware/{id}/audit (post_audit{id}). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { runGuarded, confirmShape } from "../destructiveGuard.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_post_auditid",
    {
      title: "snipeit_gen_post_auditid",
      description: "snipeit_gen_post_auditid — generated from Snipe-IT OpenAPI post_audit{id}",
      inputSchema: {id: z.number().int(), location_id: z.number().int().optional(), note: z.string().optional(), update_location: z.boolean().describe("Optionally update the assets location through the audit.").optional(), ...confirmShape},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (a) => {
      return runGuarded(ctx.cfg, a, { toolName: "snipeit_gen_post_auditid", method: "POST", url: `/hardware/${encodeURIComponent(String(a.id))}/audit`, body: undefined }, async () => {
        try {
          const res = await ctx.client.request("POST", `/hardware/${encodeURIComponent(String(a.id))}/audit`, { body: undefined, query: {location_id: a.location_id, note: a.note, update_location: a.update_location} as Record<string, unknown> | undefined });
          return jsonResult(res.data);
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      });
    },
  );
}
