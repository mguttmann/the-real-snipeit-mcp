// AUTO-GENERATED from /hardware/{id}/files/{file_id} (hardwareidfilesfile_id). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_hardwareidfilesfile_id",
    {
      title: "/hardware/:id/files/:file_id",
      description: "/hardware/:id/files/:file_id — generated from Snipe-IT OpenAPI hardwareidfilesfile_id",
      inputSchema: {id: z.number().int().describe("ID of the asset the file is associated with"), file_id: z.number().int().describe("ID of the associated file you'd like to download")},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      try {
        const res = await ctx.client.request("GET", `/hardware/${encodeURIComponent(String(a.id))}/files/${encodeURIComponent(String(a.file_id))}`, { body: undefined, query: undefined as Record<string, unknown> | undefined });
        return jsonResult(res.data, { pagination: res.pagination });
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }
    },
  );
}
