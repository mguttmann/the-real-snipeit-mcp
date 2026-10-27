import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ServerContext } from "../server.js";
import { jsonResult, errorResult, callList, callWrite } from "./helpers.js";
import { confirmShape } from "./destructiveGuard.js";
import { SnipeitApiError } from "../client/errors.js";

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;
const writeOnce = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
} as const;

export function registerMaintenancesTools(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_list_maintenances",
    {
      title: "List asset maintenances",
      description:
        "GET /maintenances: paginated list. Optionally filter by asset_id, supplier_id, or maintenance type.",
      inputSchema: {
        limit: z.number().int().positive().max(500).optional().describe("Page size (default 50, max 500)"),
        offset: z.number().int().nonnegative().optional(),
        asset_id: z.number().int().optional().describe("Filter by asset ID"),
        supplier_id: z
          .number()
          .int()
          .optional()
          .describe("Filter by supplier ID (not in the vendored API spec; server-side support unverified)"),
        asset_maintenance_type: z
          .string()
          .optional()
          .describe(
            "Filter by maintenance type (e.g. 'Maintenance', 'Repair', 'PAT Test') (not in the vendored API spec; server-side support unverified)",
          ),
        all: z
          .boolean()
          .optional()
          .describe(
            "If true, auto-paginate up to 10,000 rows or until the result size cap; if the cap is hit the result has truncated: true and next_offset to continue with limit/offset",
          ),
      },
      annotations: readOnly,
    },
    async (a) => {
      try {
        const out = await callList(ctx.client, "/maintenances", a);
        return jsonResult(out.data, { pagination: out.pagination });
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }
    },
  );

  server.registerTool(
    "snipeit_create_maintenance",
    {
      title: "Create asset maintenance",
      description:
        "POST /maintenances: schedule or record a maintenance event. " +
        "Required: asset_id, asset_maintenance_type, title, start_date (YYYY-MM-DD). " +
        "title is sent as both 'name' (Snipe-IT 8.x) and 'title' (older servers). " +
        "Note: supplier_id is required by the Snipe-IT 8.2.0 API; pass it unless your server accepts it missing.",
      inputSchema: {
        asset_id: z.number().int().positive().describe("ID of the asset being maintained"),
        supplier_id: z
          .number()
          .int()
          .optional()
          .describe("ID of the supplier carrying out the maintenance (required by the Snipe-IT 8.2.0 API)"),
        asset_maintenance_type: z
          .string()
          .describe(
            "Maintenance type, one of 'Maintenance', 'Repair', 'PAT Test', 'Upgrade', 'Hardware Support', 'Software Support'",
          ),
        title: z.string().min(1).describe("Short title / description of the maintenance event"),
        start_date: z.string().describe("Start date in YYYY-MM-DD format"),
        completion_date: z.string().optional().describe("Completion date in YYYY-MM-DD format"),
        cost: z.number().optional().describe("Cost of the maintenance"),
        notes: z.string().optional(),
        ...confirmShape,
      },
      annotations: writeOnce,
    },
    async (a) => {
      const { confirm: _c, ...rest } = a as Record<string, unknown>;
      // Snipe-IT 8.x validates 'name'; older servers read 'title'. Send both.
      const body = { ...rest, name: rest.title };
      return callWrite(ctx, a, "snipeit_create_maintenance", "POST", "/maintenances", body);
    },
  );
}
