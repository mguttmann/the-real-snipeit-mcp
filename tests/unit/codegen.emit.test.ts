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
  requestBody: { required: true, schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
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
});
