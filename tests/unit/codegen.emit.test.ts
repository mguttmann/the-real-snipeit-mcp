import { describe, expect, it } from "vitest";
import { emitToolFile } from "../../src/codegen/emit.js";
import type { CatalogEntry } from "../../src/codegen/parseOpenapi.js";

const getEntry: CatalogEntry = {
  toolName: "snipeit_gen_hardware_show",
  operationId: "hardwareShow",
  method: "GET",
  path: "/hardware/{id}",
  pathParams: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
  queryParams: [],
  summary: "Get hardware by id",
};

const postEntry: CatalogEntry = {
  toolName: "snipeit_gen_hardware_store",
  operationId: "hardwareStore",
  method: "POST",
  path: "/hardware",
  pathParams: [],
  queryParams: [],
  requestBody: {
    required: true,
    schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
  },
  summary: "Create hardware",
};

const deleteEntry: CatalogEntry = {
  toolName: "snipeit_gen_hardware_destroy",
  operationId: "hardwareDestroy",
  method: "DELETE",
  path: "/hardware/{id}",
  pathParams: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
  queryParams: [],
  summary: "Delete hardware",
};

describe("emitToolFile", () => {
  it("GET: read-only annotations, no body, no confirm", () => {
    const src = emitToolFile(getEntry, {});
    expect(src).toContain("readOnlyHint: true");
    expect(src).toContain("destructiveHint: false");
    expect(src).toContain("snipeit_gen_hardware_show");
    expect(src).toContain('"GET"');
    expect(src).toContain("${encodeURIComponent(String(a.id))}");
    expect(src).not.toContain("runGuarded");
  });

  it("POST: write annotations, wraps body, includes runGuarded", () => {
    const src = emitToolFile(postEntry, {});
    expect(src).toContain("destructiveHint: true");
    expect(src).toContain("idempotentHint: false");
    expect(src).toContain("body:");
    expect(src).toContain("runGuarded");
    expect(src).toContain("confirmShape");
  });

  it("DELETE: idempotent destructive", () => {
    const src = emitToolFile(deleteEntry, {});
    expect(src).toContain("destructiveHint: true");
    expect(src).toContain("idempotentHint: true");
    expect(src).toContain('"DELETE"');
  });

  it("fails when the request path keeps a ':name' segment", () => {
    const entry: CatalogEntry = { ...postEntry, path: "/hardware/:id/restore" };
    expect(() => emitToolFile(entry, {})).toThrow(/unresolved path/);
  });

  it("fails when a '{name}' placeholder has no path param", () => {
    const entry: CatalogEntry = { ...getEntry, pathParams: [] };
    expect(() => emitToolFile(entry, {})).toThrow(/no path param/);
  });
});

describe("emitToolFile descriptions and previews (docs-04, destructive-05, correctness-5, redteam-2026-10-27-2)", () => {
  const described: CatalogEntry = {
    ...deleteEntry,
    summary: "/hardware/{id}",
    description: "Deletes an asset \u2014 soft delete.",
    queryParams: [{ name: "force", in: "query", required: false, schema: { type: "boolean" } }],
  };

  it("titles and descriptions name the method and path, prefer the spec description, and carry no em or en dash", () => {
    const src = emitToolFile(described, {});
    expect(src).toContain('title: "DELETE /hardware/{id}"');
    expect(src).toContain(
      'description: "DELETE /hardware/{id}: Deletes an asset - soft delete. Generated from Snipe-IT OpenAPI operation hardwareDestroy."',
    );
    expect(src).not.toMatch(/[\u2013\u2014]/);
  });

  it("falls back to the summary when it is more than the path, and to method and path alone", () => {
    expect(emitToolFile(getEntry, {})).toContain(
      'description: "GET /hardware/{id}: Get hardware by id. Generated from',
    );
    expect(emitToolFile({ ...getEntry, summary: undefined }, {})).toContain(
      'description: "GET /hardware/{id}. Generated from',
    );
  });

  it("write previews show SNIPEIT_API_BASE + path and the query, pass the logger and mark the result as a write", () => {
    const src = emitToolFile(described, {});
    expect(src).toContain("url: ctx.cfg.apiBase + `/hardware/${encodeURIComponent(String(a.id))}`");
    expect(src).toContain("query: {force: a.force}");
    expect(src).toContain("jsonResult(res.data, { write: true })");
    expect(src).toContain("ctx.logger");
  });

  it("file-upload operations say that uploads do not work through the tool", () => {
    const upload: CatalogEntry = {
      ...postEntry,
      requestBody: {
        required: true,
        schema: { type: "object", properties: { file: { type: "string", format: "binary" } } },
      },
    };
    expect(emitToolFile(upload, {})).toMatch(/multipart\/form-data/);
    expect(emitToolFile(postEntry, {})).not.toMatch(/multipart/);
  });
});
