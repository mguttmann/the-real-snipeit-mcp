// AUTO-GENERATED from /fields/{id} (fieldsid-2). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { runGuarded, confirmShape } from "../destructiveGuard.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_fieldsid_2",
    {
      title: "/fields/:id",
      description: "/fields/:id — generated from Snipe-IT OpenAPI fieldsid-2",
      inputSchema: {id: z.string().describe("Custom field ID"), body: z.object({name: z.string().optional(),element: z.enum(["text","textarea","checkbox","radio","listbox"]).optional()}).optional(), ...confirmShape},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      return runGuarded(ctx.cfg, a, { toolName: "snipeit_gen_fieldsid_2", method: "PATCH", url: `/fields/${encodeURIComponent(String(a.id))}`, body: a.body }, async () => {
        try {
          const res = await ctx.client.request("PATCH", `/fields/${encodeURIComponent(String(a.id))}`, { body: a.body, query: undefined as Record<string, unknown> | undefined });
          return jsonResult(res.data);
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      });
    },
  );
}
