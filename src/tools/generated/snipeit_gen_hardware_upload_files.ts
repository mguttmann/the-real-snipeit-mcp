// AUTO-GENERATED from /hardware/{id}/files (hardware-upload-files). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { runGuarded, confirmShape } from "../destructiveGuard.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_hardware_upload_files",
    {
      title: "POST /hardware/{id}/files",
      description: "POST /hardware/{id}/files: To upload multiple files to an asset, send `file` as an array, such as `file[]`. See below for details. Generated from Snipe-IT OpenAPI operation hardware-upload-files. File uploads do not work through this tool: Snipe-IT expects multipart/form-data and this tool sends JSON (the vendored spec declares JSON). Upload files in the Snipe-IT web UI.",
      inputSchema: {id: z.number().int().describe("ID of the asset to upload files to"), body: z.object({file: z.string(),notes: z.string().optional()}).optional(), ...confirmShape},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (a) => {
      return runGuarded(ctx.cfg, a, { toolName: "snipeit_gen_hardware_upload_files", method: "POST", url: ctx.cfg.apiBase + `/hardware/${encodeURIComponent(String(a.id))}/files`, body: a.body }, async () => {
        try {
          const res = await ctx.client.request("POST", `/hardware/${encodeURIComponent(String(a.id))}/files`, { body: a.body, query: undefined as Record<string, unknown> | undefined });
          return jsonResult(res.data, { write: true });
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      }, ctx.logger);
    },
  );
}
