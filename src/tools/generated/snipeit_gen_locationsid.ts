// AUTO-GENERATED from /locations/{id} (locationsid). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { runGuarded, confirmShape } from "../destructiveGuard.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_locationsid",
    {
      title: "/locations/:id",
      description: "/locations/:id — generated from Snipe-IT OpenAPI locationsid",
      inputSchema: {id: z.number().int(), body: z.object({name: z.string().optional(),address: z.string().optional(),address2: z.string().optional(),city: z.string().optional(),state: z.string().optional(),country: z.string().optional(),zip: z.string().optional(),currency: z.string().optional(),ldap_ou: z.string().optional(),manager_id: z.number().int().optional(),parent_id: z.number().int().optional(),company_id: z.number().int().optional()}).optional(), ...confirmShape},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      return runGuarded(ctx.cfg, a, { toolName: "snipeit_gen_locationsid", method: "PATCH", url: `/locations/${encodeURIComponent(String(a.id))}`, body: a.body }, async () => {
        try {
          const res = await ctx.client.request("PATCH", `/locations/${encodeURIComponent(String(a.id))}`, { body: a.body, query: undefined as Record<string, unknown> | undefined });
          return jsonResult(res.data);
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      });
    },
  );
}
