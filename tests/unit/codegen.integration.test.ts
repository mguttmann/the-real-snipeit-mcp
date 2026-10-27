import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";
import { parseOpenapi } from "../../src/codegen/parseOpenapi.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(readFileSync(resolve(__dirname, "../../vendor/snipe-it-rest-api.json"), "utf8"));

describe("vendor spec parse smoke", () => {
  it("yields > 60 entries from the committed spec", () => {
    const entries = parseOpenapi(spec);
    expect(entries.length).toBeGreaterThan(60);
  });

  it("every entry has a usable toolName", () => {
    const entries = parseOpenapi(spec);
    for (const e of entries) {
      expect(e.toolName.startsWith("snipeit_gen_")).toBe(true);
      expect(e.toolName).toMatch(/^snipeit_gen_[a-z0-9_]+$/);
    }
  });

  it("every entry has a method and path", () => {
    const entries = parseOpenapi(spec);
    for (const e of entries) {
      expect(["GET", "POST", "PUT", "PATCH", "DELETE"]).toContain(e.method);
      expect(e.path.startsWith("/")).toBe(true);
    }
  });

  it("no generated tool sends a literal ':name' or unresolved '{' path segment", () => {
    const dir = resolve(__dirname, "../../src/tools/generated");
    const offenders: string[] = [];
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".ts"))) {
      const src = readFileSync(resolve(dir, f), "utf8");
      for (const m of src.matchAll(/request\("[A-Z]+", `([^`]*)`/g)) {
        const path = m[1]!.replace(/\$\{encodeURIComponent\(String\(a\.[A-Za-z_$][\w$]*\)\)\}/g, "X");
        if (/:[A-Za-z_]|[{}]/.test(path)) offenders.push(`${f}: ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
