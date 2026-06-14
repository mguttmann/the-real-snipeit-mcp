import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
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
});
