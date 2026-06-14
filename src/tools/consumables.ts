import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server.js";
import { jsonResult, errorResult, callList, callWrite } from "./helpers.js";
import { confirmShape } from "./destructiveGuard.js";
import { SnipeitApiError } from "../client/errors.js";

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;
const writeOnce = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true } as const;

export function registerConsumablesTools(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_list_consumables",
    {
      title: "List consumables",
      description: "GET /consumables — paginated list. Supports search and common filters.",
      inputSchema: {
        limit: z.number().int().positive().max(500).optional().describe("Page size (default 50, max 500)"),
        offset: z.number().int().nonnegative().optional(),
        search: z.string().optional(),
        category_id: z.number().int().optional(),
        manufacturer_id: z.number().int().optional(),
        company_id: z.number().int().optional(),
        all: z.boolean().optional().describe("If true, auto-paginate up to 10,000 rows"),
      },
      annotations: readOnly,
    },
    async (a) => {
      try {
        const out = await callList(ctx.client, "/consumables", a);
        return jsonResult(out.data, { pagination: out.pagination });
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }
    },
  );

  server.registerTool(
    "snipeit_checkout_consumable",
    {
      title: "Checkout consumable to a user",
      description: "POST /consumables/{id}/checkout — check a consumable out to a user.",
      inputSchema: {
        id: z.number().int().positive(),
        assigned_to: z.number().int().describe("User ID to check the consumable out to"),
        note: z.string().optional(),
        checkout_qty: z.number().int().optional().describe("Quantity to check out"),
        ...confirmShape,
      },
      annotations: writeOnce,
    },
    async (a) => {
      const { id, confirm: _c, ...rest } = a as Record<string, unknown> & { id: number };
      return callWrite(ctx, a, "snipeit_checkout_consumable", "POST", `/consumables/${id}/checkout`, rest);
    },
  );
}
