// AUTO-GENERATED from /hardware/byserial/{serial} (hardware-by-serial). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_hardware_by_serial",
    {
      title: "/hardware/byserial/:serial",
      description: "/hardware/byserial/:serial — generated from Snipe-IT OpenAPI hardware-by-serial",
      inputSchema: {serial: z.string().describe("The serial number (not the ID) of the asset you'd like to query"), deleted: z.boolean().describe("true | false to include deleted items in your results").optional()},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      try {
        const res = await ctx.client.request("GET", `/hardware/byserial/${encodeURIComponent(String(a.serial))}`, { body: undefined, query: {deleted: a.deleted} as Record<string, unknown> | undefined });
        return jsonResult(res.data, { pagination: res.pagination });
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }
    },
  );
}
