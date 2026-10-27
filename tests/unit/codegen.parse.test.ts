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
      paths: {
        "/widgets/{id}": {
          get: { parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }] },
        },
      },
    };
    const entries = parseOpenapi(spec);
    expect(entries[0]?.operationId).toMatch(/get/i);
    expect(entries[0]?.toolName).toMatch(/snipeit_gen_/);
  });

  it("normalises ':name' path segments to '{name}' and synthesizes required path params", () => {
    const spec = {
      openapi: "3.1.0",
      paths: {
        "/hardware/:id/restore": { post: { operationId: "hardwareidrestore" } },
        "/things/:slug": { get: { operationId: "thingShow" } },
      },
    };
    const entries = parseOpenapi(spec);
    const restore = entries.find((e) => e.operationId === "hardwareidrestore")!;
    expect(restore.path).toBe("/hardware/{id}/restore");
    expect(restore.toolName).toBe("snipeit_gen_hardwareidrestore");
    expect(restore.pathParams).toEqual([
      expect.objectContaining({ name: "id", in: "path", required: true, schema: { type: "integer" } }),
    ]);
    const thing = entries.find((e) => e.operationId === "thingShow")!;
    expect(thing.path).toBe("/things/{slug}");
    expect(thing.pathParams).toEqual([
      expect.objectContaining({ name: "slug", in: "path", required: true, schema: { type: "string" } }),
    ]);
  });

  it("does not synthesize a path param the spec already declares", () => {
    const spec = {
      openapi: "3.1.0",
      paths: {
        "/widgets/{id}": {
          get: {
            operationId: "w",
            parameters: [
              { name: "id", in: "path", required: true, schema: { type: "string" }, description: "d" },
            ],
          },
        },
      },
    };
    const [entry] = parseOpenapi(spec);
    expect(entry!.pathParams).toEqual([
      { name: "id", in: "path", required: true, schema: { type: "string" }, description: "d" },
    ]);
  });
});

describe("collection GETs get the list parameters the spec leaves out", () => {
  const LIST = ["limit", "offset", "search", "sort", "order"];
  const spec = {
    openapi: "3.1.0",
    paths: {
      "/manufacturers": {
        get: {
          operationId: "manufacturers",
          parameters: [{ name: "name", in: "query", schema: { type: "string" } }],
        },
        post: { operationId: "manufacturers-store" },
      },
      "/models": {
        get: {
          operationId: "models",
          parameters: [{ name: "limit", in: "query", schema: { type: "integer", default: 2 } }],
        },
      },
      "/manufacturers/{id}": {
        get: {
          operationId: "manufacturer-show",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        },
      },
      "/users/me": { get: { operationId: "usersme" } },
    },
  };
  const byName = (n: string) => parseOpenapi(spec).find((e) => e.toolName === n)!;

  it("adds limit, offset, search, sort and order, optional, after the declared ones", () => {
    const q = byName("snipeit_gen_manufacturers").queryParams;
    expect(q.map((p) => p.name)).toEqual(["name", ...LIST]);
    for (const p of q.slice(1)) {
      expect(p.required).toBe(false);
      expect(p.description).toMatch(/not declared in the spec for this operation/);
      expect((p.schema as { default?: unknown }).default).toBeUndefined();
    }
  });

  it("keeps a parameter the spec declares and adds only the missing ones", () => {
    const q = byName("snipeit_gen_models").queryParams;
    expect(q.map((p) => p.name)).toEqual(LIST);
    expect(q[0]!.schema).toEqual({ type: "integer", default: 2 });
  });

  it("leaves single-record GETs, /users/me and writes alone", () => {
    expect(byName("snipeit_gen_manufacturer_show").queryParams).toEqual([]);
    expect(byName("snipeit_gen_usersme").queryParams).toEqual([]);
    expect(byName("snipeit_gen_manufacturers_store").queryParams).toEqual([]);
  });
});
