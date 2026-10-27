// AUTO-GENERATED from /hardware/{id}/restore (hardwareidrestore). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { runGuarded, confirmShape } from "../destructiveGuard.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_hardwareidrestore",
    {
      title: "POST /hardware/{id}/restore",
      description: "POST /hardware/{id}/restore: Restore a deleted asset. Generated from Snipe-IT OpenAPI operation hardwareidrestore.",
      inputSchema: {id: z.number().int().describe("Path parameter 'id' (not declared in the spec, synthesized by codegen)"), ...confirmShape},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (a) => {
      return runGuarded(ctx.cfg, a, { toolName: "snipeit_gen_hardwareidrestore", method: "POST", url: ctx.cfg.apiBase + `/hardware/${encodeURIComponent(String(a.id))}/restore`, body: undefined }, async () => {
        try {
          const res = await ctx.client.request("POST", `/hardware/${encodeURIComponent(String(a.id))}/restore`, { body: undefined, query: undefined as Record<string, unknown> | undefined });
          return jsonResult(res.data, { write: true });
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      }, ctx.logger);
    },
  );
}
