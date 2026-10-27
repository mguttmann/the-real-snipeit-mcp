// AUTO-GENERATED from /fieldsets/{id} (fieldsetsid-1). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { runGuarded, confirmShape } from "../destructiveGuard.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_fieldsetsid_1",
    {
      title: "PUT /fieldsets/{id}",
      description: "PUT /fieldsets/{id}: Update a Fieldset. Generated from Snipe-IT OpenAPI operation fieldsetsid-1.",
      inputSchema: {id: z.string().describe("Custom field ID"), body: z.object({name: z.string()}).optional(), ...confirmShape},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      return runGuarded(ctx.cfg, a, { toolName: "snipeit_gen_fieldsetsid_1", method: "PUT", url: ctx.cfg.apiBase + `/fieldsets/${encodeURIComponent(String(a.id))}`, body: a.body }, async () => {
        try {
          const res = await ctx.client.request("PUT", `/fieldsets/${encodeURIComponent(String(a.id))}`, { body: a.body, query: undefined as Record<string, unknown> | undefined });
          return jsonResult(res.data, { write: true });
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      }, ctx.logger);
    },
  );
}
