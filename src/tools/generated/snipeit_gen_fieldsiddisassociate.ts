// AUTO-GENERATED from /fields/{id}/disassociate (fieldsiddisassociate). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { runGuarded, confirmShape } from "../destructiveGuard.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_fieldsiddisassociate",
    {
      title: "/fields/:id/disassociate",
      description: "/fields/:id/disassociate — generated from Snipe-IT OpenAPI fieldsiddisassociate",
      inputSchema: {id: z.string().describe("Custom field ID"), body: z.object({fieldset_id: z.number().int()}).optional(), ...confirmShape},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (a) => {
      return runGuarded(ctx.cfg, a, { toolName: "snipeit_gen_fieldsiddisassociate", method: "POST", url: `/fields/${encodeURIComponent(String(a.id))}/disassociate`, body: a.body }, async () => {
        try {
          const res = await ctx.client.request("POST", `/fields/${encodeURIComponent(String(a.id))}/disassociate`, { body: a.body, query: undefined as Record<string, unknown> | undefined });
          return jsonResult(res.data);
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      });
    },
  );
}
