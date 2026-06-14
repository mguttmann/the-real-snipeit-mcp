import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server.js";
import { jsonResult, errorResult, callList, callJson } from "./helpers.js";
import { SnipeitApiError } from "../client/errors.js";

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;

export function registerStatusLabelsTools(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_list_statuslabels",
    {
      title: "List status labels",
      description: "GET /statuslabels — paginated list. Supports search.",
      inputSchema: {
        limit: z.number().int().positive().max(500).optional().describe("Page size (default 50, max 500)"),
        offset: z.number().int().nonnegative().optional(),
        search: z.string().optional(),
        all: z.boolean().optional().describe("If true, auto-paginate up to 10,000 rows"),
      },
      annotations: readOnly,
    },
    async (a) => {
      try {
        const out = await callList(ctx.client, "/statuslabels", a);
        return jsonResult(out.data, { pagination: out.pagination });
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }
    },
  );

  server.registerTool(
    "snipeit_get_statuslabel_assets",
    {
      title: "Get assets for a status label",
      description: "GET /statuslabels/{id}/assetlist — returns paginated assets that have this status label assigned.",
      inputSchema: {
        id: z.number().int().positive().describe("Status label ID"),
        limit: z.number().int().positive().max(500).optional(),
        offset: z.number().int().nonnegative().optional(),
      },
      annotations: readOnly,
    },
    async (a) => {
      const { id, ...query } = a;
      return callJson(ctx, "GET", `/statuslabels/${id}/assetlist`, query);
    },
  );
}
