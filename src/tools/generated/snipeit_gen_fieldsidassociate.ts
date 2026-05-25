// AUTO-GENERATED from /fields/{id}/associate (fieldsidassociate). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { runGuarded, confirmShape } from "../destructiveGuard.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_fieldsidassociate",
    {
      title: "/fields/:id/associate",
      description: "/fields/:id/associate — generated from Snipe-IT OpenAPI fieldsidassociate",
      inputSchema: {id: z.string().describe("Custom field ID"), body: z.object({fieldset_id: z.number().int()}).optional(), ...confirmShape},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (a) => {
      return runGuarded(ctx.cfg, a, { toolName: "snipeit_gen_fieldsidassociate", method: "POST", url: `/fields/${encodeURIComponent(String(a.id))}/associate`, body: a.body }, async () => {
        try {
          const res = await ctx.client.request("POST", `/fields/${encodeURIComponent(String(a.id))}/associate`, { body: a.body, query: undefined as Record<string, unknown> | undefined });
          return jsonResult(res.data);
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      });
    },
  );
}
