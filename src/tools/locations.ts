import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server.js";
import { jsonResult, errorResult, callList, callJson } from "./helpers.js";
import { SnipeitApiError } from "../client/errors.js";

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;

export function registerLocationsTools(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_list_locations",
    {
      title: "List locations",
      description: "GET /locations — paginated list. Supports search and optional parent_id filter.",
      inputSchema: {
        limit: z.number().int().positive().max(500).optional().describe("Page size (default 50, max 500)"),
        offset: z.number().int().nonnegative().optional(),
        search: z.string().optional(),
        parent_id: z.number().int().optional().describe("Filter by parent location ID"),
        all: z.boolean().optional().describe("If true, auto-paginate up to 10,000 rows"),
      },
      annotations: readOnly,
    },
    async (a) => {
      try {
        const out = await callList(ctx.client, "/locations", a);
        return jsonResult(out.data, { pagination: out.pagination });
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }
    },
  );

  server.registerTool(
    "snipeit_get_location",
    {
      title: "Get location by id",
      description: "GET /locations/{id} — retrieve a single location record.",
      inputSchema: {
        id: z.number().int().positive(),
      },
      annotations: readOnly,
    },
    async (a) => callJson(ctx, "GET", `/locations/${a.id}`),
  );
}
