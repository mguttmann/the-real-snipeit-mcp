// AUTO-GENERATED from /hardware/{id}/files (hardware-upload-files). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { runGuarded, confirmShape } from "../destructiveGuard.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_hardware_upload_files",
    {
      title: "/hardware/:id/files",
      description: "/hardware/:id/files — generated from Snipe-IT OpenAPI hardware-upload-files",
      inputSchema: {id: z.number().int().describe("ID of the asset to upload files to"), body: z.object({file: z.string(),notes: z.string().optional()}).optional(), ...confirmShape},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (a) => {
      return runGuarded(ctx.cfg, a, { toolName: "snipeit_gen_hardware_upload_files", method: "POST", url: `/hardware/${encodeURIComponent(String(a.id))}/files`, body: a.body }, async () => {
        try {
          const res = await ctx.client.request("POST", `/hardware/${encodeURIComponent(String(a.id))}/files`, { body: a.body, query: undefined as Record<string, unknown> | undefined });
          return jsonResult(res.data);
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      });
    },
  );
}
