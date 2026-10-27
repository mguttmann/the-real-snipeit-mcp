/**
 * Facts the docs state, checked against the real server and the real files, so a number
 * or default in README.md, ARCHITECTURE.md or .env.example cannot drift silently
 * (audit docs-03, docs-07, docs-08).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { buildServer } from "../../src/server.js";
import { loadConfig } from "../../src/config.js";
import {
  DEFAULT_API_BASE,
  DEFAULT_LOG_LEVEL,
  DEFAULT_MAX_RESULT_BYTES,
  DEFAULT_TIMEOUT_MS,
  MIN_MAX_BODY_BYTES,
  MIN_MAX_RESULT_BYTES,
  PAGINATION,
} from "../../src/constants.js";

const root = new URL("../../", import.meta.url);
const read = (rel: string) => readFileSync(new URL(rel, root), "utf8");
const readme = read("README.md");
const architecture = read("ARCHITECTURE.md");
const envExample = read(".env.example");

const HTTP_METHODS = new Set(["get", "put", "post", "patch", "delete"]);

let tools: { name: string; description?: string }[] = [];
let resources: string[] = [];
let prompts: string[] = [];
let instructions = "";

beforeAll(async () => {
  const cfg = loadConfig({
    SNIPEIT_API_TOKEN: "docs-test",
    SNIPEIT_API_BASE: "https://snipeit.invalid/api/v1",
  });
  const { server } = buildServer(cfg);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "docs-facts-test", version: "0.0.0" });
  await client.connect(clientSide);
  tools = (await client.listTools()).tools;
  resources = (await client.listResources()).resources.map((r) => r.uri);
  prompts = (await client.listPrompts()).prompts.map((p) => p.name);
  instructions = client.getInstructions() ?? "";
  await client.close();
});

const generated = () => tools.filter((t) => t.name.startsWith("snipeit_gen_"));
const handWrappers = () =>
  tools.filter((t) => !t.name.startsWith("snipeit_gen_") && t.name !== "snipeit_raw_request");

/** Number in the first match of `re` (group 1) in `text`. */
function num(text: string, re: RegExp): number {
  const m = re.exec(text);
  expect(m, String(re)).not.toBeNull();
  return Number(m![1]!.replace(/[\s,_]/g, ""));
}

describe("README tool counts", () => {
  it("states the real number of tools per layer", () => {
    expect(num(readme, /\*\*Three tool layers \((\d+) tools\):\*\*/)).toBe(tools.length);
    expect(num(readme, /\*\*(\d+) hand-wrappers\*\*/)).toBe(handWrappers().length);
    expect(num(readme, /### Hand-wrappers \((\d+) tools\)/)).toBe(handWrappers().length);
    expect(num(readme, /\*\*(\d+) generated tools\*\*/)).toBe(generated().length);
    expect(num(readme, /\*\*(\d+) resources\*\*/)).toBe(resources.length);
    expect(num(readme, /\*\*(\d+) prompts\*\*/)).toBe(prompts.length);
  });

  it("generates exactly one tool per operation of the vendored spec, whose version the README names", () => {
    const spec = JSON.parse(read("vendor/snipe-it-rest-api.json")) as {
      info: { version: string };
      paths: Record<string, Record<string, unknown>>;
    };
    const ops = Object.values(spec.paths).flatMap((p) => Object.keys(p).filter((m) => HTTP_METHODS.has(m)));
    expect(generated().length).toBe(ops.length);
    expect(readme).toContain(`Snipe-IT ${spec.info.version}`);
  });

  it("lists every hand-wrapper in a table, and each section count matches its rows", () => {
    const section = readme.slice(
      readme.indexOf("### Hand-wrappers"),
      readme.indexOf("### Auto-generated tools"),
    );
    const rows = [...section.matchAll(/^\| `(snipeit_[a-z_]+)` \|/gm)].map((m) => m[1]!);
    expect(rows.sort()).toEqual(
      handWrappers()
        .map((t) => t.name)
        .sort(),
    );
    const heads = [...section.matchAll(/^#### .*\((\d+)\)\n([\s\S]*?)(?=^#### |$(?![\s\S]))/gm)];
    expect(heads.length).toBeGreaterThan(0);
    for (const h of heads) {
      const count = [...h[2]!.matchAll(/^\| `snipeit_[a-z_]+` \|/gm)].length;
      expect(count, h[0].split("\n")[0]).toBe(Number(h[1]));
    }
  });

  it("names every resource and prompt", () => {
    for (const r of resources) expect(readme).toContain(`\`${r}\``);
    for (const p of prompts) expect(readme).toContain(`\`${p}\``);
  });
});

describe("configuration docs", () => {
  const configSrc = read("src/config.ts");
  const envVars = [...new Set([...configSrc.matchAll(/env\.(SNIPEIT_[A-Z_]+)/g)].map((m) => m[1]!))];

  it("documents every env var read by src/config.ts in README and .env.example", () => {
    expect(envVars.length).toBeGreaterThan(0);
    for (const v of envVars) {
      expect(readme, v).toContain(`| \`${v}\` |`);
      expect(envExample, v).toMatch(new RegExp(`^#? ?${v}=`, "m"));
    }
  });

  it("README defaults match src/constants.ts", () => {
    const row = (v: string) => new RegExp(`^\\| \`${v}\` \\| ([^|]+) \\|`, "m").exec(readme)?.[1] ?? "";
    expect(row("SNIPEIT_API_BASE")).toContain(DEFAULT_API_BASE);
    expect(row("SNIPEIT_TIMEOUT_MS")).toContain(`\`${DEFAULT_TIMEOUT_MS}\``);
    expect(row("SNIPEIT_LOG_LEVEL")).toContain(`\`${DEFAULT_LOG_LEVEL}\``);
    expect(row("SNIPEIT_MAX_RESULT_BYTES")).toContain(`\`${DEFAULT_MAX_RESULT_BYTES}\``);
    expect(row("SNIPEIT_CONFIRM_WRITES")).toContain("`true`");
    expect(loadConfig({ SNIPEIT_API_TOKEN: "x" }).confirmWrites).toBe(true);
    expect(readme).toContain(`minimum \`${MIN_MAX_RESULT_BYTES}\``);
    expect(readme).toContain(`${MIN_MAX_BODY_BYTES / 1_048_576} MiB and 4 times`);
  });

  it(".env.example values are the defaults", () => {
    const val = (v: string) => new RegExp(`^${v}=(.*)$`, "m").exec(envExample)?.[1];
    expect(val("SNIPEIT_API_BASE")).toBe(DEFAULT_API_BASE);
    expect(val("SNIPEIT_TIMEOUT_MS")).toBe(String(DEFAULT_TIMEOUT_MS));
    expect(val("SNIPEIT_LOG_LEVEL")).toBe(DEFAULT_LOG_LEVEL);
    expect(val("SNIPEIT_MAX_RESULT_BYTES")).toBe(String(DEFAULT_MAX_RESULT_BYTES));
    expect(val("SNIPEIT_CONFIRM_WRITES")).toBe("true");
  });

  it("the all:true row cap in README and ARCHITECTURE matches the constant", () => {
    const cap = PAGINATION.AUTO_PAGINATE_MAX_ROWS.toLocaleString("en-US").replace(",", " ");
    expect(readme).toContain(`up to ${cap} rows`);
    expect(architecture).toContain(`capped at ${cap} rows`);
    expect(architecture).toContain(`pageLimit: ${PAGINATION.AUTO_PAGINATE_PAGE_SIZE}`);
  });
});

describe("no stale facts", () => {
  it("no doc mentions the removed MCPB bundle", () => {
    for (const f of [
      "README.md",
      "ARCHITECTURE.md",
      "CONTRIBUTING.md",
      "SECURITY.md",
      "AGENTS.md",
      "package.json",
    ]) {
      expect(read(f).toLowerCase(), f).not.toContain("mcpb");
    }
  });

  it("the write guard is never called opt-in", () => {
    for (const f of ["README.md", "ARCHITECTURE.md", "CONTRIBUTING.md", "SECURITY.md", "AGENTS.md"]) {
      expect(read(f), f).not.toMatch(/opt-in (confirmation|write|guard)/i);
    }
  });
});

describe("no em or en dashes (AGENTS.md, redteam-2026-10-27-2)", () => {
  const DASH = /[\u2013\u2014]/;

  it("in tool titles, descriptions and parameter descriptions", () => {
    const offenders = tools.filter((t) =>
      DASH.test(
        JSON.stringify({
          t: (t as { title?: string }).title,
          d: t.description,
          s: (t as { inputSchema?: unknown }).inputSchema,
        }),
      ),
    );
    expect(offenders.map((t) => t.name)).toEqual([]);
  });

  it("in source, tests and docs", () => {
    const files: string[] = [];
    const walk = (rel: string) => {
      for (const name of readdirSync(new URL(rel, root))) {
        const path = `${rel}${name}`;
        if (statSync(new URL(path, root)).isDirectory()) walk(`${path}/`);
        else if (/\.(ts|md|json|yml)$/.test(name)) files.push(path);
      }
    };
    for (const dir of ["src/", "tests/", "docs/", ".github/"]) walk(dir);
    files.push(
      "README.md",
      "ARCHITECTURE.md",
      "CONTRIBUTING.md",
      "SECURITY.md",
      "AGENTS.md",
      "CHANGELOG.md",
      ".env.example",
    );
    expect(files.filter((f) => DASH.test(read(f)))).toEqual([]);
  });
});

describe("server instructions", () => {
  it("describe the fail-closed write guard, the result cap and binary results", () => {
    expect(instructions).toContain("SNIPEIT_CONFIRM_WRITES");
    expect(instructions).toMatch(/false\|0\|no\|off/);
    expect(instructions).toContain('confirm: "YES"');
    expect(instructions).toContain("SNIPEIT_MAX_RESULT_BYTES");
    expect(instructions).toContain("truncated");
    expect(instructions).toContain("next_offset");
    expect(instructions).toContain("binary");
    expect(instructions).not.toMatch(/[\u2013\u2014]/);
  });
});
