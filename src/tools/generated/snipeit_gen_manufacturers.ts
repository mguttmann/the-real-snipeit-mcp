// AUTO-GENERATED from /manufacturers (manufacturers). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_manufacturers",
    {
      title: "/manufacturers",
      description: "/manufacturers — generated from Snipe-IT OpenAPI manufacturers",
      inputSchema: {name: z.string().describe("Name of the manufacturer").optional(), url: z.string().optional(), support_url: z.string().describe("Support URL").optional(), support_phone: z.string().describe("Support phone number").optional(), support_email: z.string().describe("Support email").optional()},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      try {
        const res = await ctx.client.request("GET", `/manufacturers`, { body: undefined, query: {name: a.name, url: a.url, support_url: a.support_url, support_phone: a.support_phone, support_email: a.support_email} as Record<string, unknown> | undefined });
        return jsonResult(res.data, { pagination: res.pagination });
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }
    },
  );
}
