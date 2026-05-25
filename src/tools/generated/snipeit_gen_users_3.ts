// AUTO-GENERATED from /users/{id} (users-3). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { runGuarded, confirmShape } from "../destructiveGuard.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_users_3",
    {
      title: "/users/:id",
      description: "/users/:id — generated from Snipe-IT OpenAPI users-3",
      inputSchema: {id: z.string().describe("User ID"), body: z.object({first_name: z.string().optional(),last_name: z.string().optional(),username: z.string().optional(),password: z.string().optional(),email: z.string().optional(),permissions: z.string().optional(),activated: z.boolean().optional(),phone: z.string().optional(),jobtitle: z.string().optional(),manager_id: z.number().int().optional(),employee_num: z.string().optional(),notes: z.string().optional(),company_id: z.number().int().optional(),two_factor_enrolled: z.boolean().optional(),two_factor_optin: z.boolean().optional(),department_id: z.number().int().optional(),location_id: z.number().int().optional(),remote: z.boolean().optional(),groups: z.number().int().optional(),vip: z.number().int().optional(),start_date: z.string().optional(),end_date: z.string().optional(),avatar: z.string().optional()}).optional(), ...confirmShape},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (a) => {
      return runGuarded(ctx.cfg, a, { toolName: "snipeit_gen_users_3", method: "PATCH", url: `/users/${encodeURIComponent(String(a.id))}`, body: a.body }, async () => {
        try {
          const res = await ctx.client.request("PATCH", `/users/${encodeURIComponent(String(a.id))}`, { body: a.body, query: undefined as Record<string, unknown> | undefined });
          return jsonResult(res.data);
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      });
    },
  );
}
