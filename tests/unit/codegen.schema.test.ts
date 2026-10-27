import { describe, expect, it } from "vitest";
import { z } from "zod";
import { schemaToZod } from "../../src/codegen/schemaToZod.js";

describe("schemaToZod", () => {
  it("primitives", () => {
    expect(schemaToZod({ type: "string" })).toBe("z.string()");
    expect(schemaToZod({ type: "integer" })).toBe("z.number().int()");
    expect(schemaToZod({ type: "number" })).toBe("z.number()");
    expect(schemaToZod({ type: "boolean" })).toBe("z.boolean()");
  });

  it("string with constraints", () => {
    expect(schemaToZod({ type: "string", minLength: 2, maxLength: 5 })).toContain(".min(2).max(5)");
  });

  it("string formats use the zod 4 top-level forms", () => {
    expect(schemaToZod({ type: "string", format: "uuid" })).toBe("z.guid()");
    expect(schemaToZod({ type: "string", format: "uri" })).toBe("z.url()");
    expect(schemaToZod({ type: "string", format: "url", maxLength: 9 })).toBe("z.url().max(9)");
    expect(schemaToZod({ type: "string", format: "email" })).toBe("z.email()");
    expect(schemaToZod({ type: "string", format: "date-time" })).toBe("z.iso.datetime()");
  });

  it("format uuid accepts non-RFC GUIDs that z.uuid() rejects", () => {
    const schema = new Function("z", `return ${schemaToZod({ type: "string", format: "uuid" })};`)(
      z,
    ) as z.ZodType;
    expect(schema.safeParse("00000000-0000-0000-0000-000000000001").success).toBe(true);
    expect(schema.safeParse("not-a-guid").success).toBe(false);
  });

  it("generated format expressions evaluate with zod 4", () => {
    for (const format of ["uri", "email", "date-time"]) {
      const src = schemaToZod({ type: "string", format, minLength: 1 });
      expect(() => new Function("z", `return ${src};`)(z)).not.toThrow();
    }
  });

  it("enum of strings", () => {
    expect(schemaToZod({ type: "string", enum: ["a", "b"] })).toBe('z.enum(["a","b"])');
  });

  it("array of items", () => {
    expect(schemaToZod({ type: "array", items: { type: "string" } })).toBe("z.array(z.string())");
  });

  it("object with required", () => {
    const out = schemaToZod({
      type: "object",
      properties: { a: { type: "string" }, b: { type: "number" } },
      required: ["a"],
    });
    expect(out).toContain("a: z.string()");
    expect(out).toContain("b: z.number().optional()");
  });

  it("oneOf as union", () => {
    expect(schemaToZod({ oneOf: [{ type: "string" }, { type: "number" }] })).toBe(
      "z.union([z.string(),z.number()])",
    );
  });

  it("allOf merge", () => {
    const out = schemaToZod({
      allOf: [
        { type: "object", properties: { a: { type: "string" } }, required: ["a"] },
        { type: "object", properties: { b: { type: "number" } } },
      ],
    });
    expect(out).toContain("a: z.string()");
    expect(out).toContain("b: z.number().optional()");
  });

  it("$ref resolves through components.schemas with cycle protection", () => {
    const refs = {
      Node: {
        type: "object",
        properties: { name: { type: "string" }, child: { $ref: "#/components/schemas/Node" } },
      },
    };
    const out = schemaToZod({ $ref: "#/components/schemas/Node" }, refs);
    expect(out).toContain("name: z.string()");
    expect(out).toContain("child:");
  });

  it("allOf with $ref parts merges resolved properties", () => {
    const refs = {
      Base: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
    };
    const out = schemaToZod(
      {
        allOf: [
          { $ref: "#/components/schemas/Base" },
          { type: "object", properties: { name: { type: "string" } } },
        ],
      },
      refs,
    );
    expect(out).toContain("id: z.number().int()");
    expect(out).toContain("name: z.string().optional()");
  });

  it("allOf with $ref to nested allOf flattens all properties", () => {
    const refs = {
      Base: { allOf: [{ type: "object", properties: { id: { type: "integer" } }, required: ["id"] }] },
    };
    const out = schemaToZod(
      {
        allOf: [
          { $ref: "#/components/schemas/Base" },
          { type: "object", properties: { name: { type: "string" } } },
        ],
      },
      refs,
    );
    expect(out).toContain("id: z.number().int()");
    expect(out).toContain("name: z.string().optional()");
  });

  it("falls back to z.unknown() for unknown shapes", () => {
    expect(schemaToZod(undefined)).toBe("z.unknown()");
    expect(schemaToZod({})).toBe("z.unknown()");
  });

  it("additionalProperties: true => loose()", () => {
    const out = schemaToZod({
      type: "object",
      properties: { a: { type: "string" } },
      additionalProperties: true,
    });
    expect(out).toContain(".loose()");
    expect(out).not.toContain(".passthrough()");
  });
});
