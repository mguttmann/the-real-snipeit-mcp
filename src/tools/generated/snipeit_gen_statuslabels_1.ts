// AUTO-GENERATED from /statuslabels (statuslabels-1). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { runGuarded, confirmShape } from "../destructiveGuard.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_statuslabels_1",
    {
      title: "/statuslabels",
      description: "/statuslabels — generated from Snipe-IT OpenAPI statuslabels-1",
      inputSchema: {body: z.object({name: z.string(),type: z.enum(["deployable","pending","archived","undeployable"]),notes: z.string().optional(),color: z.string().optional(),show_in_nav: z.boolean().optional(),default_label: z.boolean().optional()}).optional(), ...confirmShape},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (a) => {
      return runGuarded(ctx.cfg, a, { toolName: "snipeit_gen_statuslabels_1", method: "POST", url: `/statuslabels`, body: a.body }, async () => {
        try {
          const res = await ctx.client.request("POST", `/statuslabels`, { body: a.body, query: undefined as Record<string, unknown> | undefined });
          return jsonResult(res.data);
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      });
    },
  );
}
