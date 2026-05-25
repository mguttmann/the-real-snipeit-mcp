// AUTO-GENERATED from /suppliers (suppliers). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_suppliers",
    {
      title: "/suppliers",
      description: "/suppliers — generated from Snipe-IT OpenAPI suppliers",
      inputSchema: {name: z.string().optional(), address: z.string().optional(), address2: z.string().optional(), city: z.string().optional(), zip: z.string().optional(), country: z.string().optional(), fax: z.string().optional(), email: z.string().optional(), url: z.string().optional(), notes: z.string().optional()},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      try {
        const res = await ctx.client.request("GET", `/suppliers`, { body: undefined, query: {name: a.name, address: a.address, address2: a.address2, city: a.city, zip: a.zip, country: a.country, fax: a.fax, email: a.email, url: a.url, notes: a.notes} as Record<string, unknown> | undefined });
        return jsonResult(res.data, { pagination: res.pagination });
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }
    },
  );
}
