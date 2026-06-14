import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseOpenapi, type CatalogEntry } from "./parseOpenapi.js";
import { emitToolFile } from "./emit.js";
import type { DocSchema } from "./schemaToZod.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPEC_PATH = resolve(__dirname, "../../vendor/snipe-it-rest-api.json");
const OUT_DIR = resolve(__dirname, "../tools/generated");

async function run(): Promise<void> {
  const raw = readFileSync(SPEC_PATH, "utf8");
  const spec = JSON.parse(raw) as { paths: Record<string, unknown>; components?: { schemas?: Record<string, DocSchema> } };
  const refs: Record<string, DocSchema> = spec.components?.schemas ?? {};
  const entries = parseOpenapi(spec as Parameters<typeof parseOpenapi>[0]);

  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const successes: string[] = [];
  const failures: { entry: CatalogEntry; reason: string }[] = [];
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
        // If still a duplicate (very unlikely), skip
        if (seenNames.has(entry.toolName)) {
          throw new Error(`still duplicate after suffix: ${entry.toolName}`);
        }
      }
      seenNames.add(entry.toolName);

      const source = emitToolFile(entry, refs);
      writeFileSync(resolve(OUT_DIR, `${entry.toolName}.ts`), source, "utf8");
      indexImports.push(`import { register as register_${entry.toolName} } from "./${entry.toolName}.js";`);
      successes.push(entry.toolName);
    } catch (err) {
      failures.push({ entry, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  const indexSource = `// AUTO-GENERATED. Do not edit by hand.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../server.js";
${indexImports.join("\n")}

export function registerGeneratedTools(server: McpServer, ctx: ServerContext): void {
${successes.map((n) => `  register_${n}(server, ctx);`).join("\n")}
}
`;
  writeFileSync(resolve(OUT_DIR, "index.ts"), indexSource, "utf8");

  process.stderr.write(`Codegen complete: ${successes.length} ok, ${failures.length} failed\n`);
  for (const f of failures) {
    process.stderr.write(`  FAIL ${f.entry.toolName} (${f.entry.method} ${f.entry.path}): ${f.reason}\n`);
  }
  if (failures.length > 0) process.exitCode = 1;
}

run().catch((err) => {
  process.stderr.write(`codegen failed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
