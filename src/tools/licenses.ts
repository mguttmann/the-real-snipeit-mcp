import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server.js";
import { jsonResult, errorResult, callList, callJson, callWrite } from "./helpers.js";
import { confirmShape } from "./destructiveGuard.js";
import { SnipeitApiError } from "../client/errors.js";

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;
const writeIdempotent = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true } as const;

export function registerLicensesTools(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_list_licenses",
    {
      title: "List licenses",
      description: "GET /licenses — paginated list. Supports search and common filters.",
      inputSchema: {
        limit: z.number().int().positive().max(500).optional().describe("Page size (default 50, max 500)"),
        offset: z.number().int().nonnegative().optional(),
        search: z.string().optional(),
        company_id: z.number().int().optional(),
        manufacturer_id: z.number().int().optional(),
        supplier_id: z.number().int().optional(),
        category_id: z.number().int().optional(),
        depreciation_id: z.number().int().optional(),
        maintained: z.boolean().optional(),
        all: z.boolean().optional().describe("If true, auto-paginate up to 10,000 rows"),
      },
      annotations: readOnly,
    },
    async (a) => {
      try {
        const out = await callList(ctx.client, "/licenses", a);
        return jsonResult(out.data, { pagination: out.pagination });
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }
    },
  );

  server.registerTool(
    "snipeit_get_license_seats",
    {
      title: "Get seats for a license",
      description: "GET /licenses/{id}/seats — list all seats for a license.",
      inputSchema: {
        id: z.number().int().positive(),
        limit: z.number().int().positive().max(500).optional(),
        offset: z.number().int().nonnegative().optional(),
      },
      annotations: readOnly,
    },
    async (a) => callJson(ctx, "GET", `/licenses/${a.id}/seats`, { limit: a.limit, offset: a.offset }),
  );

  server.registerTool(
    "snipeit_checkout_license_seat",
    {
      title: "Checkout (assign) a license seat",
      description: "PUT /licenses/{license_id}/seats/{seat_id} — assign a seat to a user or asset.",
      inputSchema: {
        license_id: z.number().int().positive(),
        seat_id: z.number().int().positive(),
        assigned_to: z.number().int().optional().describe("User ID to assign this seat to"),
        asset_id: z.number().int().optional().describe("Asset ID to assign this seat to"),
        note: z.string().optional(),
        ...confirmShape,
      },
      annotations: writeIdempotent,
    },
    async (a) => {
      const { license_id, seat_id, confirm: _c, ...rest } = a as Record<string, unknown> & { license_id: number; seat_id: number };
      return callWrite(ctx, a, "snipeit_checkout_license_seat", "PUT", `/licenses/${license_id}/seats/${seat_id}`, rest);
    },
  );
}
