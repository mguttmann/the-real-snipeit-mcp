import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server.js";
import { jsonResult, errorResult, callList, callJson } from "./helpers.js";
import { SnipeitApiError } from "../client/errors.js";

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;

export function registerUsersTools(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_list_users",
    {
      title: "List users",
      description: "GET /users — paginated list. Supports search and common filters.",
      inputSchema: {
        limit: z.number().int().positive().max(500).optional().describe("Page size (default 50, max 500)"),
        offset: z.number().int().nonnegative().optional(),
        search: z.string().optional(),
        group_id: z.number().int().optional(),
        company_id: z.number().int().optional(),
        department_id: z.number().int().optional(),
        location_id: z.number().int().optional(),
        deleted: z.boolean().optional(),
        all: z.boolean().optional().describe("If true, auto-paginate up to 10,000 rows"),
      },
      annotations: readOnly,
    },
    async (a) => {
      try {
        const out = await callList(ctx.client, "/users", a);
        return jsonResult(out.data, { pagination: out.pagination });
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }
    },
  );

  server.registerTool(
    "snipeit_get_user",
    {
      title: "Get user by id",
      description: "GET /users/{id}",
      inputSchema: { id: z.number().int().positive() },
      annotations: readOnly,
    },
    async (a) => callJson(ctx, "GET", `/users/${a.id}`),
  );

  server.registerTool(
    "snipeit_get_user_assets",
    {
      title: "Get assets checked out to a user",
      description: "GET /users/{id}/assets — list hardware checked out to this user.",
      inputSchema: {
        id: z.number().int().positive(),
        limit: z.number().int().positive().max(500).optional(),
        offset: z.number().int().nonnegative().optional(),
      },
      annotations: readOnly,
    },
    async (a) => callJson(ctx, "GET", `/users/${a.id}/assets`, { limit: a.limit, offset: a.offset }),
  );

  server.registerTool(
    "snipeit_get_user_accessories",
    {
      title: "Get accessories checked out to a user",
      description: "GET /users/{id}/accessories",
      inputSchema: { id: z.number().int().positive() },
      annotations: readOnly,
    },
    async (a) => callJson(ctx, "GET", `/users/${a.id}/accessories`),
  );

  server.registerTool(
    "snipeit_get_user_licenses",
    {
      title: "Get licenses assigned to a user",
      description: "GET /users/{id}/licenses",
      inputSchema: { id: z.number().int().positive() },
      annotations: readOnly,
    },
    async (a) => callJson(ctx, "GET", `/users/${a.id}/licenses`),
  );
}
