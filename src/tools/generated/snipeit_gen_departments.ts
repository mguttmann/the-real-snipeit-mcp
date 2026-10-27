// AUTO-GENERATED from /departments (departments). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_departments",
    {
      title: "GET /departments",
      description: "GET /departments: List departments. Generated from Snipe-IT OpenAPI operation departments.",
      inputSchema: {name: z.string().optional(), company_id: z.number().int().optional(), manager_id: z.number().int().optional(), location_id: z.number().int().optional(), limit: z.number().int().describe("Page size (not declared in the spec for this operation, added by codegen)").optional(), offset: z.number().int().describe("Rows to skip (not declared in the spec for this operation, added by codegen)").optional(), search: z.string().describe("Text search (not declared in the spec for this operation, added by codegen)").optional(), sort: z.string().describe("Column to sort by (not declared in the spec for this operation, added by codegen)").optional(), order: z.enum(["asc","desc"]).describe("Sort order (not declared in the spec for this operation, added by codegen)").optional()},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      try {
        const res = await ctx.client.request("GET", `/departments`, { body: undefined, query: {name: a.name, company_id: a.company_id, manager_id: a.manager_id, location_id: a.location_id, limit: a.limit, offset: a.offset, search: a.search, sort: a.sort, order: a.order} as Record<string, unknown> | undefined });
        return jsonResult(res.data, { pagination: res.pagination });
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }
    },
  );
}
