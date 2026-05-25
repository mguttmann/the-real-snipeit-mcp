// AUTO-GENERATED from /departments (departments). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_departments",
    {
      title: "/departments",
      description: "/departments — generated from Snipe-IT OpenAPI departments",
      inputSchema: {name: z.string().optional(), company_id: z.number().int().optional(), manager_id: z.number().int().optional(), location_id: z.number().int().optional()},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      try {
        const res = await ctx.client.request("GET", `/departments`, { body: undefined, query: {name: a.name, company_id: a.company_id, manager_id: a.manager_id, location_id: a.location_id} as Record<string, unknown> | undefined });
        return jsonResult(res.data, { pagination: res.pagination });
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }
    },
  );
}
