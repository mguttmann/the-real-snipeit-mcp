import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server.js";
import { jsonResult, errorResult, callList, callJson, callWrite } from "./helpers.js";
import { confirmShape } from "./destructiveGuard.js";
import { SnipeitApiError } from "../client/errors.js";

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;
const writeOnce = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true } as const;
const writeIdempotent = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true } as const;

const listShape = {
  limit: z.number().int().positive().max(500).optional().describe("Page size (default 50, max 500)"),
  offset: z.number().int().nonnegative().optional(),
  search: z.string().optional(),
  status_id: z.number().int().optional(),
  category_id: z.number().int().optional(),
  model_id: z.number().int().optional(),
  manufacturer_id: z.number().int().optional(),
  location_id: z.number().int().optional(),
  company_id: z.number().int().optional(),
  order: z.enum(["asc", "desc"]).optional(),
  sort: z.string().optional(),
  all: z.boolean().optional().describe("If true, auto-paginate up to 10,000 rows"),
};

export function registerHardwareTools(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_list_hardware",
    { title: "List hardware (assets)", description: "GET /hardware — paginated. Supports search and common filters.", inputSchema: listShape, annotations: readOnly },
    async (a) => {
      try {
        const out = await callList(ctx.client, "/hardware", a);
        return jsonResult(out.data, { pagination: out.pagination });
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }
    },
  );

  server.registerTool(
    "snipeit_search_hardware",
    { title: "Search hardware by free text", description: "Convenience: GET /hardware?search={query}.", inputSchema: { query: z.string().min(1), limit: z.number().int().positive().max(500).optional(), all: z.boolean().optional().describe("If true, auto-paginate up to 10,000 rows") }, annotations: readOnly },
    async (a) => {
      try {
        const out = await callList(ctx.client, "/hardware", { search: a.query, limit: a.limit, all: a.all });
        return jsonResult(out.data, { pagination: out.pagination });
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }
    },
  );

  server.registerTool(
    "snipeit_get_hardware_by_id",
    { title: "Get hardware by id", description: "GET /hardware/{id}", inputSchema: { id: z.number().int().positive() }, annotations: readOnly },
    async (a) => callJson(ctx, "GET", `/hardware/${a.id}`),
  );

  server.registerTool(
    "snipeit_get_hardware_by_tag",
    { title: "Get hardware by asset tag", description: "GET /hardware/bytag/{tag} — tag is URL-encoded automatically.", inputSchema: { tag: z.string().min(1) }, annotations: readOnly },
    async (a) => callJson(ctx, "GET", `/hardware/bytag/${encodeURIComponent(a.tag)}`),
  );

  server.registerTool(
    "snipeit_get_hardware_by_serial",
    { title: "Get hardware by serial", description: "GET /hardware/byserial/{serial}", inputSchema: { serial: z.string().min(1) }, annotations: readOnly },
    async (a) => callJson(ctx, "GET", `/hardware/byserial/${encodeURIComponent(a.serial)}`),
  );

  server.registerTool(
    "snipeit_create_hardware",
    { title: "Create hardware", description: "POST /hardware — required: asset_tag, status_id, model_id (per Snipe-IT spec).", inputSchema: { body: z.record(z.string(), z.unknown()), ...confirmShape }, annotations: writeOnce },
    async (a) => callWrite(ctx, a, "snipeit_create_hardware", "POST", "/hardware", a.body),
  );

  server.registerTool(
    "snipeit_update_hardware",
    { title: "Update hardware (partial)", description: "PATCH /hardware/{id} — partial update.", inputSchema: { id: z.number().int().positive(), body: z.record(z.string(), z.unknown()), ...confirmShape }, annotations: writeIdempotent },
    async (a) => callWrite(ctx, a, "snipeit_update_hardware", "PATCH", `/hardware/${a.id}`, a.body),
  );

  server.registerTool(
    "snipeit_delete_hardware",
    { title: "Delete hardware", description: "DELETE /hardware/{id} — destroys the asset and its history. Irreversible.", inputSchema: { id: z.number().int().positive(), ...confirmShape }, annotations: writeIdempotent },
    async (a) => callWrite(ctx, a, "snipeit_delete_hardware", "DELETE", `/hardware/${a.id}`),
  );

  server.registerTool(
    "snipeit_checkout_hardware",
    {
      title: "Checkout hardware to user / location / asset",
      description: "POST /hardware/{id}/checkout. Provide checkout_to_type plus the matching target id.",
      inputSchema: {
        id: z.number().int().positive(),
        checkout_to_type: z.enum(["user", "location", "asset"]),
        assigned_user: z.number().int().optional(),
        assigned_location: z.number().int().optional(),
        assigned_asset: z.number().int().optional(),
        checkout_at: z.string().optional().describe("ISO date (YYYY-MM-DD)"),
        expected_checkin: z.string().optional(),
        note: z.string().optional(),
        name: z.string().optional(),
        ...confirmShape,
      },
      annotations: writeOnce,
    },
    async (a) => {
      const { id, confirm: _c, ...rest } = a as Record<string, unknown> & { id: number };
      return callWrite(ctx, a, "snipeit_checkout_hardware", "POST", `/hardware/${id}/checkout`, rest);
    },
  );

  server.registerTool(
    "snipeit_checkin_hardware",
    { title: "Checkin hardware", description: "POST /hardware/{id}/checkin", inputSchema: { id: z.number().int().positive(), note: z.string().optional(), location_id: z.number().int().optional(), ...confirmShape }, annotations: writeOnce },
    async (a) => {
      const { id, confirm: _c, ...rest } = a as Record<string, unknown> & { id: number };
      return callWrite(ctx, a, "snipeit_checkin_hardware", "POST", `/hardware/${id}/checkin`, rest);
    },
  );

  server.registerTool(
    "snipeit_audit_hardware",
    { title: "Audit hardware", description: "POST /hardware/audit — marks an asset as audited at a location.", inputSchema: { asset_tag: z.string().min(1), location_id: z.number().int().optional(), next_audit_date: z.string().optional(), note: z.string().optional(), ...confirmShape }, annotations: writeOnce },
    async (a) => {
      const { confirm: _c, ...rest } = a as Record<string, unknown>;
      return callWrite(ctx, a, "snipeit_audit_hardware", "POST", `/hardware/audit`, rest);
    },
  );

  server.registerTool(
    "snipeit_list_audit_due",
    { title: "List audits due", description: "GET /hardware/audit/due", inputSchema: { limit: z.number().int().positive().max(500).optional(), offset: z.number().int().nonnegative().optional(), all: z.boolean().optional().describe("If true, auto-paginate up to 10,000 rows") }, annotations: readOnly },
    async (a) => {
      try {
        const out = await callList(ctx.client, "/hardware/audit/due", a);
        return jsonResult(out.data, { pagination: out.pagination });
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }
    },
  );

  server.registerTool(
    "snipeit_list_audit_overdue",
    { title: "List audits overdue", description: "GET /hardware/audit/overdue", inputSchema: { limit: z.number().int().positive().max(500).optional(), offset: z.number().int().nonnegative().optional(), all: z.boolean().optional().describe("If true, auto-paginate up to 10,000 rows") }, annotations: readOnly },
    async (a) => {
      try {
        const out = await callList(ctx.client, "/hardware/audit/overdue", a);
        return jsonResult(out.data, { pagination: out.pagination });
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }
    },
  );
}
