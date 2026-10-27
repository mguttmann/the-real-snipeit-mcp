// AUTO-GENERATED from /suppliers (suppliers). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_suppliers",
    {
      title: "GET /suppliers",
      description: "GET /suppliers. Generated from Snipe-IT OpenAPI operation suppliers.",
      inputSchema: {name: z.string().optional(), address: z.string().optional(), address2: z.string().optional(), city: z.string().optional(), zip: z.string().optional(), country: z.string().optional(), fax: z.string().optional(), email: z.string().optional(), url: z.string().optional(), notes: z.string().optional(), limit: z.number().int().describe("Page size (not declared in the spec for this operation, added by codegen)").optional(), offset: z.number().int().describe("Rows to skip (not declared in the spec for this operation, added by codegen)").optional(), search: z.string().describe("Text search (not declared in the spec for this operation, added by codegen)").optional(), sort: z.string().describe("Column to sort by (not declared in the spec for this operation, added by codegen)").optional(), order: z.enum(["asc","desc"]).describe("Sort order (not declared in the spec for this operation, added by codegen)").optional()},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      try {
        const res = await ctx.client.request("GET", `/suppliers`, { body: undefined, query: {name: a.name, address: a.address, address2: a.address2, city: a.city, zip: a.zip, country: a.country, fax: a.fax, email: a.email, url: a.url, notes: a.notes, limit: a.limit, offset: a.offset, search: a.search, sort: a.sort, order: a.order} as Record<string, unknown> | undefined });
        return jsonResult(res.data, { pagination: res.pagination });
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }
    },
  );
}
