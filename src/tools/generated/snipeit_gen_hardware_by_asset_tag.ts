// AUTO-GENERATED from /hardware/bytag/{asset_tag} (hardware-by-asset-tag). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_hardware_by_asset_tag",
    {
      title: "/hardware/bytag/:asset_tag",
      description: "/hardware/bytag/:asset_tag — generated from Snipe-IT OpenAPI hardware-by-asset-tag",
      inputSchema: {asset_tag: z.string().describe("The asset_tag (not the ID) of the asset you'd like to query"), deleted: z.boolean().describe("true | false to include deleted items in your results").optional()},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      try {
        const res = await ctx.client.request("GET", `/hardware/bytag/${encodeURIComponent(String(a.asset_tag))}`, { body: undefined, query: {deleted: a.deleted} as Record<string, unknown> | undefined });
        return jsonResult(res.data, { pagination: res.pagination });
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }
    },
  );
}
