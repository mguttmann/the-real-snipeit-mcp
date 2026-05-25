// AUTO-GENERATED from /users (users). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_users",
    {
      title: "/users",
      description: "/users — generated from Snipe-IT OpenAPI users",
      inputSchema: {search: z.string().describe("String to search on").optional(), limit: z.number().int().describe("Number of records to return").optional(), offset: z.number().int().describe("Offset to use when retrieving results (useful in pagination)").optional(), sort: z.string().describe("Field to order by").optional(), order: z.string().describe("Sort order (asc or desc)").optional(), first_name: z.string().optional(), last_name: z.string().optional(), username: z.string().optional(), email: z.string().optional(), employee_num: z.string().optional(), state: z.string().optional(), zip: z.string().optional(), country: z.string().optional(), group_id: z.number().int().optional(), department_id: z.number().int().optional(), company_id: z.number().int().optional(), location_id: z.number().int().optional(), deleted: z.boolean().describe("Set this to \"true\" if you want to return only deleted users").optional(), all: z.boolean().describe("Set this to \"true\" if you want both deleted and active users").optional(), ldap_import: z.boolean().describe("Whether the user was imported/synched with LDAP - should be 0 or 1").optional(), assets_count: z.number().int().describe("Number of checked out assets").optional(), licenses_count: z.number().int().describe("Number of checked out licenses").optional(), accessories_count: z.number().int().describe("Number of checked out accessories").optional(), consumables_count: z.number().int().describe("Number of checked out consumables").optional(), remote: z.boolean().describe("Whether the user is marked as a remote worker or not (should be 0 or 1)").optional(), vip: z.boolean().describe("Whether or not the user is marked as a VIP (1 or 0 for true or false, respectively)").optional(), start_date: z.string().optional(), end_date: z.string().optional(), filter: z.string().describe("Key value pair of the field you want to search on and the value, for example: `{\"email\":\"info@example.com\"}\"`").optional()},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      try {
        const res = await ctx.client.request("GET", `/users`, { body: undefined, query: {search: a.search, limit: a.limit, offset: a.offset, sort: a.sort, order: a.order, first_name: a.first_name, last_name: a.last_name, username: a.username, email: a.email, employee_num: a.employee_num, state: a.state, zip: a.zip, country: a.country, group_id: a.group_id, department_id: a.department_id, company_id: a.company_id, location_id: a.location_id, deleted: a.deleted, all: a.all, ldap_import: a.ldap_import, assets_count: a.assets_count, licenses_count: a.licenses_count, accessories_count: a.accessories_count, consumables_count: a.consumables_count, remote: a.remote, vip: a.vip, start_date: a.start_date, end_date: a.end_date, filter: a.filter} as Record<string, unknown> | undefined });
        return jsonResult(res.data, { pagination: res.pagination });
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }
    },
  );
}
