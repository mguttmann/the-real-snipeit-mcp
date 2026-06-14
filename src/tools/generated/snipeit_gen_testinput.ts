// AUTO-GENERATED from /licenses (testinput). Do not edit by hand.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
import { jsonResult, errorResult } from "../helpers.js";
import { runGuarded, confirmShape } from "../destructiveGuard.js";
import { SnipeitApiError } from "../../client/errors.js";

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_gen_testinput",
    {
      title: "/licenses/",
      description: "/licenses/ — generated from Snipe-IT OpenAPI testinput",
      inputSchema: {body: z.object({name: z.string(),seats: z.number().int(),category_id: z.number().int(),company_id: z.number().int().optional(),expiration_date: z.string().optional(),license_email: z.string().optional(),license_name: z.string().optional(),serial: z.string().optional(),maintained: z.boolean().optional(),manufacturer_id: z.number().int().optional(),notes: z.string().optional(),order_number: z.string().optional(),purchase_cost: z.number().optional(),purchase_date: z.string().optional(),purchase_order: z.string().optional(),reassignable: z.boolean().optional(),supplier_id: z.number().int().optional(),termination_date: z.string().optional()}).optional(), ...confirmShape},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (a) => {
      return runGuarded(ctx.cfg, a, { toolName: "snipeit_gen_testinput", method: "POST", url: `/licenses`, body: a.body }, async () => {
        try {
          const res = await ctx.client.request("POST", `/licenses`, { body: a.body, query: undefined as Record<string, unknown> | undefined });
          return jsonResult(res.data);
        } catch (err) {
          if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
          throw err;
        }
      });
    },
  );
}
