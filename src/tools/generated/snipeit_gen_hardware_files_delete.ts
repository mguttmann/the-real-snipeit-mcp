// AUTO-GENERATED from /hardware/{id}/files/{file_id}/delete (hardware-files-delete). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { runGuarded, confirmShape } from "../destructiveGuard.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_hardware_files_delete",
    {
      title: "/hardware/:id/files/:file_id",
      description: "/hardware/:id/files/:file_id — generated from Snipe-IT OpenAPI hardware-files-delete",
      inputSchema: {id: z.number().int().describe("ID of the asset whose file you want to delete"), file_id: z.number().int().describe("ID of the specific file for that asset you wish to delete"), ...confirmShape},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      return runGuarded(ctx.cfg, a, { toolName: "snipeit_gen_hardware_files_delete", method: "DELETE", url: `/hardware/${encodeURIComponent(String(a.id))}/files/${encodeURIComponent(String(a.file_id))}/delete`, body: undefined }, async () => {
        try {
          const res = await ctx.client.request("DELETE", `/hardware/${encodeURIComponent(String(a.id))}/files/${encodeURIComponent(String(a.file_id))}/delete`, { body: undefined, query: undefined as Record<string, unknown> | undefined });
          return jsonResult(res.data);
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      });
    },
  );
}
