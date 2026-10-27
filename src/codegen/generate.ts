/**
 * `npm run codegen`: regenerate src/tools/generated from vendor/snipe-it-rest-api.json.
 * The generation itself is pure (`generateAll.ts`); this script only writes the files.
 *
 * @module
 */
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateAll } from "./generateAll.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPEC_PATH = resolve(__dirname, "../../vendor/snipe-it-rest-api.json");
const OUT_DIR = resolve(__dirname, "../tools/generated");

function run(): void {
  const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8")) as Parameters<typeof generateAll>[0];
  const { files, failures } = generateAll(spec);

  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  for (const [name, source] of files) writeFileSync(resolve(OUT_DIR, name), source, "utf8");

  process.stderr.write(`Codegen complete: ${files.size - 1} ok, ${failures.length} failed\n`);
  for (const f of failures) {
    process.stderr.write(`  FAIL ${f.entry.toolName} (${f.entry.method} ${f.entry.path}): ${f.reason}\n`);
  }
  if (failures.length > 0) process.exitCode = 1;
}

try {
  run();
} catch (err) {
  process.stderr.write(`codegen failed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
}
