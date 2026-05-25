import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server.js";
import { jsonResult, errorResult, callList, callWrite } from "./helpers.js";
import { confirmShape } from "./destructiveGuard.js";
import { SnipeitApiError } from "../client/errors.js";

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;
const writeOnce = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true } as const;

export function registerComponentsTools(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_list_components",
    {
      title: "List components",
      description: "GET /components — paginated list. Supports search and common filters.",
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
        const out = await callList(ctx.client, "/components", a);
        return jsonResult(out.data, { pagination: out.pagination });
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }
    },
  );

  server.registerTool(
    "snipeit_checkout_component",
    {
      title: "Checkout component to an asset",
      description:
        "POST /components/{id}/checkout — check a quantity of a component out to an asset. " +
        "Per spec, `assigned_to` is the asset ID and `assigned_qty` is required.",
      inputSchema: {
        id: z.number().int().positive().describe("ID of the component to check out"),
        assigned_to: z.number().int().describe("Asset ID to check the component out to"),
        assigned_qty: z.number().int().positive().describe("Quantity of components to check out"),
        ...confirmShape,
      },
      annotations: writeOnce,
    },
    async (a) => {
      const { id, confirm: _c, ...rest } = a as Record<string, unknown> & { id: number };
      return callWrite(ctx, a, "snipeit_checkout_component", "POST", `/components/${id}/checkout`, rest);
    },
  );

  server.registerTool(
    "snipeit_checkin_component",
    {
      title: "Checkin component from an asset",
      description:
        "POST /components/{id}/checkin — check a quantity of a component back in. " +
        "Per spec, the `id` here is the record ID in the components_assets join table (the pivot/relationship ID), " +
        "and `checkin_qty` is required.",
      inputSchema: {
        id: z.number().int().positive().describe("ID of the record in the components_assets join table (pivot ID)"),
        checkin_qty: z.number().int().positive().describe("Quantity of components to check in"),
        ...confirmShape,
      },
      annotations: writeOnce,
    },
    async (a) => {
      const { id, confirm: _c, ...rest } = a as Record<string, unknown> & { id: number };
      return callWrite(ctx, a, "snipeit_checkin_component", "POST", `/components/${id}/checkin`, rest);
    },
  );
}
