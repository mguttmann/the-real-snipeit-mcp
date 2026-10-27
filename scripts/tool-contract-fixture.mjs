#!/usr/bin/env node
// Generate tests/fixtures/tool-contract.json from a tools/list JSON-RPC response of the
// production server: per tool the name, sorted required parameters, top-level defaults
// and annotations. Usage: node scripts/tool-contract-fixture.mjs <tools-list.json> > tests/fixtures/tool-contract.json
import { readFileSync } from "node:fs";

const src = process.argv[2];
if (!src) {
  process.stderr.write("usage: node scripts/tool-contract-fixture.mjs <tools-list.json>\n");
  process.exit(2);
}
const raw = JSON.parse(readFileSync(src, "utf8"));
const tools = raw.result?.tools ?? raw.tools;
if (!Array.isArray(tools)) {
  process.stderr.write("no tools array found (expected result.tools or tools)\n");
  process.exit(1);
}
const out = tools
  .map((t) => {
    const defaults = {};
    for (const [key, prop] of Object.entries(t.inputSchema?.properties ?? {})) {
      if (prop && typeof prop === "object" && "default" in prop) defaults[key] = prop.default;
    }
    return {
      name: t.name,
      required: [...(t.inputSchema?.required ?? [])].sort(),
      defaults,
      annotations: t.annotations ?? null,
    };
  })
  .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
process.stdout.write(JSON.stringify({ source: "production tools/list (private gateway build)", tools: out }, null, 2) + "\n");
