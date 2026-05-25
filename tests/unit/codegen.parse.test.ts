import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseOpenapi } from "../../src/codegen/parseOpenapi.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const mini = JSON.parse(readFileSync(resolve(__dirname, "../fixtures/mini-openapi.json"), "utf8"));

describe("parseOpenapi", () => {
  it("extracts one CatalogEntry per (path, method)", () => {
    const entries = parseOpenapi(mini);
    expect(entries.length).toBe(4);
    const names = entries.map((e) => e.toolName).sort();
    expect(names).toEqual([
      "snipeit_gen_hardware_destroy",
      "snipeit_gen_hardware_list",
      "snipeit_gen_hardware_show",
      "snipeit_gen_hardware_store",
    ]);
  });

  it("separates path and query parameters", () => {
    const entry = parseOpenapi(mini).find((e) => e.toolName === "snipeit_gen_hardware_show");
    expect(entry).toBeDefined();
    expect(entry!.pathParams.map((p) => p.name)).toEqual(["id"]);
    expect(entry!.queryParams).toEqual([]);
    expect(entry!.method).toBe("GET");
    expect(entry!.path).toBe("/hardware/{id}");
  });

  it("captures requestBody schema for write methods", () => {
    const entry = parseOpenapi(mini).find((e) => e.toolName === "snipeit_gen_hardware_store");
    expect(entry?.requestBody).toBeDefined();
    expect(entry?.requestBody?.schema).toMatchObject({ type: "object" });
  });

  it("synthesizes an operationId when missing", () => {
    const spec = {
      openapi: "3.1.0",
      paths: { "/widgets/{id}": { "get": { parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }] } } },
    };
    const entries = parseOpenapi(spec);
    expect(entries[0]?.operationId).toMatch(/get/i);
    expect(entries[0]?.toolName).toMatch(/snipeit_gen_/);
  });
});
