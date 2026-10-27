/**
 * Pure code generation: vendored OpenAPI spec in, file name to source out. `generate.ts`
 * writes the result to src/tools/generated; the drift test compares it with the
 * committed files without touching the disk.
 *
 * @module
 */
import { parseOpenapi, type CatalogEntry } from "./parseOpenapi.js";
import { emitToolFile } from "./emit.js";
import type { DocSchema } from "./schemaToZod.js";

export interface GenerateResult {
  /** File name (e.g. `snipeit_gen_hardware_list.ts`, `index.ts`) to source text. */
  files: Map<string, string>;
  /** Operations that could not be emitted, with the reason. */
  failures: { entry: CatalogEntry; reason: string }[];
}

export function generateAll(spec: {
  paths: Record<string, unknown>;
  components?: { schemas?: Record<string, DocSchema> };
}): GenerateResult {
  const refs: Record<string, DocSchema> = spec.components?.schemas ?? {};
  const entries = parseOpenapi(spec as Parameters<typeof parseOpenapi>[0]);
  const files = new Map<string, string>();
  const failures: GenerateResult["failures"] = [];
  const successes: string[] = [];
  const indexImports: string[] = [];
  const seenNames = new Set<string>();

  for (const entry of entries) {
    try {
      // Deduplicate toolNames: if the spec has duplicate operationIds (a spec bug),
      // append a suffix derived from the path to ensure uniqueness.
      if (seenNames.has(entry.toolName)) {
        const suffix = entry.path
          .split("/")
          .filter(Boolean)
          .map((s) => s.replace(/[^a-z0-9]/gi, "_").toLowerCase())
          .join("_")
          .replace(/_+/g, "_")
          .replace(/^_|_$/g, "");
        entry.toolName = `${entry.toolName}_${suffix}`;
        if (seenNames.has(entry.toolName)) {
          throw new Error(`still duplicate after suffix: ${entry.toolName}`);
        }
      }
      seenNames.add(entry.toolName);
      files.set(`${entry.toolName}.ts`, emitToolFile(entry, refs));
      indexImports.push(`import { register as register_${entry.toolName} } from "./${entry.toolName}.js";`);
      successes.push(entry.toolName);
    } catch (err) {
      failures.push({ entry, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  files.set(
    "index.ts",
    `// AUTO-GENERATED. Do not edit by hand.
import type { McpServer } from "@modelcontextprotocol/server";
import type { ServerContext } from "../../server.js";
${indexImports.join("\n")}

export function registerGeneratedTools(server: McpServer, ctx: ServerContext): void {
${successes.map((n) => `  register_${n}(server, ctx);`).join("\n")}
}
`,
  );
  return { files, failures };
}
