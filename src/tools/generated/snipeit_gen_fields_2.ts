// AUTO-GENERATED from /fields (fields-2). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { runGuarded, confirmShape } from "../destructiveGuard.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_fields_2",
    {
      title: "/fields",
      description: "/fields — generated from Snipe-IT OpenAPI fields-2",
      inputSchema: {body: z.object({name: z.string(),element: z.enum(["text","textarea","checkbox","radio","listbox"]),field_values: z.string().optional(),show_in_email: z.boolean().optional(),format: z.string().optional(),field_encrypted: z.boolean().optional(),help_text: z.string().optional()}).optional(), ...confirmShape},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (a) => {
      return runGuarded(ctx.cfg, a, { toolName: "snipeit_gen_fields_2", method: "POST", url: `/fields`, body: a.body }, async () => {
        try {
          const res = await ctx.client.request("POST", `/fields`, { body: a.body, query: undefined as Record<string, unknown> | undefined });
          return jsonResult(res.data);
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      });
    },
  );
}
