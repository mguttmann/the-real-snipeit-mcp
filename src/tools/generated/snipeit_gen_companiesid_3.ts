// AUTO-GENERATED from /companies/{id} (companiesid-3). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { runGuarded, confirmShape } from "../destructiveGuard.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_companiesid_3",
    {
      title: "DELETE /companies/{id}",
      description: "DELETE /companies/{id}: Delete's a company. Generated from Snipe-IT OpenAPI operation companiesid-3.",
      inputSchema: {id: z.number().int().describe("company id"), ...confirmShape},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      return runGuarded(ctx.cfg, a, { toolName: "snipeit_gen_companiesid_3", method: "DELETE", url: ctx.cfg.apiBase + `/companies/${encodeURIComponent(String(a.id))}`, body: undefined }, async () => {
        try {
          const res = await ctx.client.request("DELETE", `/companies/${encodeURIComponent(String(a.id))}`, { body: undefined, query: undefined as Record<string, unknown> | undefined });
          return jsonResult(res.data, { write: true });
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      }, ctx.logger);
    },
  );
}
