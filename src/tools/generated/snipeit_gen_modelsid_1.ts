// AUTO-GENERATED from /models/{id} (modelsid-1). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { runGuarded, confirmShape } from "../destructiveGuard.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_modelsid_1",
    {
      title: "/models/:id",
      description: "/models/:id — generated from Snipe-IT OpenAPI modelsid-1",
      inputSchema: {id: z.number().int().describe("model id"), body: z.object({name: z.string(),model_number: z.string().optional(),category_id: z.number().int(),manufacturer_id: z.number().int().optional(),fieldset_id: z.number().int().optional(),eol: z.number().int().optional(),depreciation_id: z.number().int().optional(),notes: z.string().optional(),requestable: z.boolean().optional()}).optional(), ...confirmShape},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      return runGuarded(ctx.cfg, a, { toolName: "snipeit_gen_modelsid_1", method: "PUT", url: `/models/${encodeURIComponent(String(a.id))}`, body: a.body }, async () => {
        try {
          const res = await ctx.client.request("PUT", `/models/${encodeURIComponent(String(a.id))}`, { body: a.body, query: undefined as Record<string, unknown> | undefined });
          return jsonResult(res.data);
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      });
    },
  );
}
