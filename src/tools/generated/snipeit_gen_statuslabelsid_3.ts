// AUTO-GENERATED from /statuslabels/{id} (statuslabelsid-3). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { runGuarded, confirmShape } from "../destructiveGuard.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_statuslabelsid_3",
    {
      title: "PATCH /statuslabels/{id}",
      description: "PATCH /statuslabels/{id}: Updates selected fields in a status label. Generated from Snipe-IT OpenAPI operation statuslabelsid-3.",
      inputSchema: {id: z.number().int(), body: z.object({name: z.string(),type: z.enum(["deployable","pending","archived","undeployable"]).optional(),notes: z.string().optional(),color: z.string().optional(),show_in_nav: z.boolean().optional(),default_label: z.boolean().optional()}).optional(), ...confirmShape},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      return runGuarded(ctx.cfg, a, { toolName: "snipeit_gen_statuslabelsid_3", method: "PATCH", url: ctx.cfg.apiBase + `/statuslabels/${encodeURIComponent(String(a.id))}`, body: a.body }, async () => {
        try {
          const res = await ctx.client.request("PATCH", `/statuslabels/${encodeURIComponent(String(a.id))}`, { body: a.body, query: undefined as Record<string, unknown> | undefined });
          return jsonResult(res.data, { write: true });
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      }, ctx.logger);
    },
  );
}
