/**
 * Convert a JSON Schema (subset used by Snipe-IT's OpenAPI 3.1 spec) into
 * Zod source code as a string. The output is then inlined into generated tool
 * files to construct typed `inputSchema` definitions.
 *
 * Supports: primitives, enums, arrays, objects (with required), oneOf/anyOf/allOf,
 * `$ref` resolution with cycle protection, and `additionalProperties: true → passthrough()`.
 * Falls back to `z.unknown()` for any shape it doesn't recognize.
 *
 * @module
 */
export type DocSchema = Record<string, unknown>;

/**
 * Convert a JSON Schema fragment into Zod source code as a string.
 *
 * @param schema - The JSON Schema fragment to translate. `undefined` or empty → `"z.unknown()"`.
 * @param refs - Map from schema name (e.g. `"Asset"`) to the corresponding schema, used to resolve `$ref`.
 * @param visited - Internal set of already-resolved refs (cycle protection); callers should not pass it.
 * @returns A Zod expression as a string, e.g. `"z.object({id: z.number().int(), name: z.string().optional()})"`.
 */
export function schemaToZod(
  schema: DocSchema | undefined,
  refs: Record<string, DocSchema> = {},
  visited: Set<string> = new Set(),
): string {
  try {
    if (!schema || typeof schema !== "object" || Object.keys(schema).length === 0) return "z.unknown()";

    if (typeof schema.$ref === "string") {
      const name = (schema.$ref as string).split("/").pop()!;
      if (visited.has(name)) return "z.lazy(() => z.unknown())";
      if (refs[name]) {
        const next = new Set(visited);
        next.add(name);
        return schemaToZod(refs[name], refs, next);
      }
      return "z.unknown()";
    }

    if (Array.isArray(schema.oneOf) || Array.isArray(schema.anyOf)) {
      const arr = (schema.oneOf ?? schema.anyOf) as DocSchema[];
      const parts = arr.map((s) => schemaToZod(s, refs, visited));
      return `z.union([${parts.join(",")}])`;
    }

    if (Array.isArray(schema.allOf)) {
      const merged: DocSchema = { type: "object", properties: {}, required: [] };
      const flatten = (parts: DocSchema[], localVisited: Set<string>): void => {
        for (const partRaw of parts) {
          let part = partRaw;
          if (typeof part?.$ref === "string") {
            const name = (part.$ref as string).split("/").pop()!;
            if (localVisited.has(name)) continue;
            if (!refs[name]) continue;
            const nextVisited = new Set(localVisited);
            nextVisited.add(name);
            // Recursively flatten the resolved schema's own allOf if present
            if (Array.isArray((refs[name] as DocSchema).allOf)) {
              flatten((refs[name] as DocSchema).allOf as DocSchema[], nextVisited);
              part = { ...refs[name] };
              delete (part as DocSchema).allOf;  // we just consumed it
            } else {
              part = refs[name];
            }
          } else if (Array.isArray(part.allOf)) {
            flatten(part.allOf as DocSchema[], localVisited);
            continue;
          }
          if (part.properties) Object.assign(merged.properties as object, part.properties as object);
          if (Array.isArray(part.required)) (merged.required as string[]).push(...(part.required as string[]));
        }
      };
      flatten(schema.allOf as DocSchema[], visited);
      return schemaToZod(merged, refs, visited);
    }

    const t = schema.type;

    if (Array.isArray(schema.enum)) {
      const vals = (schema.enum as unknown[]).filter((v) => typeof v === "string") as string[];
      if (vals.length) return `z.enum([${vals.map((v) => JSON.stringify(v)).join(",")}])`;
    }

    if (t === "string") {
      let out = "z.string()";
      if (typeof schema.minLength === "number") out += `.min(${schema.minLength})`;
      if (typeof schema.maxLength === "number") out += `.max(${schema.maxLength})`;
      if (schema.format === "uuid") out += ".uuid()";
      if (schema.format === "uri" || schema.format === "url") out += ".url()";
      if (schema.format === "email") out += ".email()";
      if (schema.format === "date-time") out += ".datetime()";
      return out;
    }
    if (t === "integer" || t === "number") {
      let out = "z.number()";
      if (t === "integer") out += ".int()";
      if (typeof schema.minimum === "number") out += `.min(${schema.minimum})`;
      if (typeof schema.maximum === "number") out += `.max(${schema.maximum})`;
      return out;
    }
    if (t === "boolean") return "z.boolean()";
    if (t === "array") {
      const items = schema.items as DocSchema | undefined;
      return `z.array(${schemaToZod(items, refs, visited)})`;
    }
    if (t === "object") {
      const props = (schema.properties ?? {}) as Record<string, DocSchema>;
      const required = new Set((schema.required as string[]) ?? []);
      const lines: string[] = [];
      for (const [k, v] of Object.entries(props)) {
        const base = schemaToZod(v, refs, visited);
        const safe = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
        lines.push(`${safe}: ${base}${required.has(k) ? "" : ".optional()"}`);
      }
      if (schema.additionalProperties === true && lines.length === 0) return "z.record(z.string(), z.unknown())";
      const passthrough = schema.additionalProperties === true ? ".passthrough()" : "";
      return `z.object({${lines.join(",")}})${passthrough}`;
    }

    return "z.unknown()";
  } catch {
    return "z.unknown()";
  }
}
