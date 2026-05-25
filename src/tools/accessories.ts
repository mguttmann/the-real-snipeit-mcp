import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server.js";
import { jsonResult, errorResult, callList, callWrite } from "./helpers.js";
import { confirmShape } from "./destructiveGuard.js";
import { SnipeitApiError } from "../client/errors.js";

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;
const writeOnce = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true } as const;

export function registerAccessoriesTools(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_list_accessories",
    {
      title: "List accessories",
      description: "GET /accessories — paginated list. Supports search and common filters.",
      inputSchema: {
        limit: z.number().int().positive().max(500).optional().describe("Page size (default 50, max 500)"),
        offset: z.number().int().nonnegative().optional(),
        search: z.string().optional(),
        category_id: z.number().int().optional(),
        manufacturer_id: z.number().int().optional(),
        company_id: z.number().int().optional(),
        location_id: z.number().int().optional(),
        all: z.boolean().optional().describe("If true, auto-paginate up to 10,000 rows"),
      },
      annotations: readOnly,
    },
    async (a) => {
      try {
        const out = await callList(ctx.client, "/accessories", a);
        return jsonResult(out.data, { pagination: out.pagination });
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }
    },
  );

  server.registerTool(
    "snipeit_checkout_accessory",
    {
      title: "Checkout accessory to a user",
      description:
        "POST /accessories/{id}/checkout — check an accessory out to a user. " +
        "Note: per Snipe-IT spec, the target user field is `assigned_user` (not `assigned_to`).",
      inputSchema: {
        id: z.number().int().positive(),
        assigned_user: z.number().int().describe("User ID to check the accessory out to"),
        note: z.string().optional(),
        checkout_qty: z.number().int().optional().describe("Quantity to check out (default 1)"),
        ...confirmShape,
      },
      annotations: writeOnce,
    },
    async (a) => {
      const { id, confirm: _c, ...rest } = a as Record<string, unknown> & { id: number };
      return callWrite(ctx, a, "snipeit_checkout_accessory", "POST", `/accessories/${id}/checkout`, rest);
    },
  );

  server.registerTool(
    "snipeit_checkin_accessory",
    {
      title: "Checkin accessory from a user",
      description:
        "POST /accessories/{id}/checkin — check an accessory back in. " +
        "Per Snipe-IT spec, the `id` here is the ID of the record in the accessories_users join table (the pivot/relationship ID), not the accessory ID.",
      inputSchema: {
        id: z.number().int().positive().describe("ID of the record in the accessories_users join table (pivot ID)"),
        note: z.string().optional(),
        ...confirmShape,
      },
      annotations: writeOnce,
    },
    async (a) => {
      const { id, confirm: _c, ...rest } = a as Record<string, unknown> & { id: number };
      return callWrite(ctx, a, "snipeit_checkin_accessory", "POST", `/accessories/${id}/checkin`, rest);
    },
  );
}
