/**
 * Release, npm trusted publishing and MCP Registry rules, read with a YAML parser from the
 * real workflow files, plus the registry metadata (server.json, glama.json) against
 * package.json. The text-level release rules live in releaseChain.test.ts.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = new URL("../../", import.meta.url);
const read = (rel: string) => readFileSync(new URL(rel, root), "utf8");

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
  "working-directory"?: string;
}
interface Job {
  needs?: string | string[];
  if?: string;
  uses?: string;
  permissions?: Record<string, string>;
  env?: Record<string, string>;
  steps?: Step[];
  with?: Record<string, unknown>;
}
interface Workflow {
  on: Record<string, unknown>;
  permissions?: Record<string, string>;
  jobs: Record<string, Job>;
}

const workflow = (file: string) => parse(read(`.github/workflows/${file}`)) as Workflow;
const needs = (job: Job) => (Array.isArray(job.needs) ? job.needs : job.needs ? [job.needs] : []);
const stepIndex = (job: Job, pred: (s: Step) => boolean) => (job.steps ?? []).findIndex(pred);

const pkg = JSON.parse(read("package.json")) as {
  name: string;
  version: string;
  mcpName?: string;
  bin?: Record<string, string>;
  files: string[];
  engines?: { node?: string };
  publishConfig?: { access?: string; provenance?: boolean };
  repository?: { url?: string };
};

const release = workflow("release.yml");
const registry = workflow("mcp-registry.yml");

describe("release.yml triggers", () => {
  it("runs only when a v*.*.* tag is pushed", () => {
    expect(Object.keys(release.on)).toEqual(["push"]);
    const push = release.on.push as Record<string, unknown>;
    expect(Object.keys(push)).toEqual(["tags"]);
    expect(push.tags).toEqual(["v*.*.*"]);
  });

  it("has no pull_request, branch push or other trigger", () => {
    const on = release.on as Record<string, unknown>;
    for (const t of ["pull_request", "pull_request_target", "workflow_dispatch", "schedule", "release"]) {
      expect(on[t], t).toBeUndefined();
    }
    expect((on.push as Record<string, unknown>).branches).toBeUndefined();
    expect((on.push as Record<string, unknown>)["branches-ignore"]).toBeUndefined();
  });

  it("defaults to read-only permissions", () => {
    expect(release.permissions).toEqual({ contents: "read" });
  });
});

describe("release.yml npm-publish job", () => {
  const job = release.jobs["npm-publish"]!;
  const steps = job.steps ?? [];
  const publishAt = stepIndex(job, (s) => /\bnpm publish\b/.test(s.run ?? ""));
  const publishLine = (steps[publishAt]?.run ?? "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith("npm publish"));

  it("exists, holds id-token: write and nothing broader", () => {
    expect(job).toBeDefined();
    expect(job.permissions).toEqual({ contents: "read", "id-token": "write" });
  });

  it("is gated by the NPM_PUBLISH_ENABLED repository variable", () => {
    expect(job.if).toBe("${{ vars.NPM_PUBLISH_ENABLED == 'true' }}");
  });

  it("publishes the packed tarball through a ./ path, with provenance and public access", () => {
    expect(publishLine).toBeDefined();
    const args = publishLine!.split(/\s+/);
    // Without ./ npm reads release/x.tgz as a GitHub owner/repo shorthand.
    expect(args[2]).toBe("./release/the-real-snipeit-mcp-*.tgz");
    expect(args[2]!.startsWith("./")).toBe(true);
    expect(
      publishLine!.startsWith(
        "npm publish ./release/the-real-snipeit-mcp-*.tgz --provenance --access public",
      ),
    ).toBe(true);
    expect(args).toContain("--provenance");
  });

  it("uses no npm token (trusted publishing only)", () => {
    expect(JSON.stringify(job)).not.toMatch(/NODE_AUTH_TOKEN|NPM_TOKEN|secrets\./);
  });

  it("checks the downloaded tarball against SHA256SUMS before publishing", () => {
    const download = stepIndex(job, (s) => (s.uses ?? "").startsWith("actions/download-artifact@"));
    const check = stepIndex(job, (s) => /sha256sum --check --strict/.test(s.run ?? ""));
    expect(download).toBeGreaterThanOrEqual(0);
    expect(check).toBeGreaterThan(download);
    expect(publishAt).toBeGreaterThan(check);
    expect(steps[check]!.run).toContain("SHA256SUMS");
    expect(steps[check]!.run).toContain(".tgz");
  });

  it("refuses an npm older than 11.5.1 before publishing", () => {
    const at = stepIndex(job, (s) => /11\.5\.1/.test(s.name ?? ""));
    expect(at).toBeGreaterThanOrEqual(0);
    expect(at).toBeLessThan(publishAt);
    const run = steps[at]!.run!;
    expect(run).toContain('"$(npm --version)"');
    const script = /node -e "([\s\S]*?)" "\$\(npm --version\)"/.exec(run)?.[1];
    expect(script).toBeDefined();
    const ok = (v: string) => {
      try {
        execFileSync(process.execPath, ["-e", script!, v], { stdio: "pipe" });
        return true;
      } catch {
        return false;
      }
    };
    expect(ok("10.9.2")).toBe(false);
    expect(ok("11.5.0")).toBe(false);
    expect(ok("11.4.9")).toBe(false);
    expect(ok("11.5.1")).toBe(true);
    expect(ok("11.6.0")).toBe(true);
    expect(ok("12.0.0")).toBe(true);
  });

  it("runs no checkout and no install while it holds id-token: write", () => {
    for (const s of steps) {
      expect(s.uses ?? "").not.toMatch(/^actions\/checkout@/);
      expect(s.run ?? "").not.toMatch(/npm (ci|install)\b/);
    }
  });
});

describe("release.yml mcp-registry job", () => {
  const job = release.jobs["mcp-registry"]!;

  it("runs after npm-publish, for stable versions only, through mcp-registry.yml", () => {
    expect(job).toBeDefined();
    expect(needs(job)).toContain("npm-publish");
    expect(job.uses).toBe("./.github/workflows/mcp-registry.yml");
    expect(job.if).toContain("needs.verify.outputs.prerelease != 'true'");
    expect(job.permissions).toEqual({ contents: "read", "id-token": "write" });
    expect(job.with?.tag).toBe("${{ github.ref_name }}");
  });

  it("does not run when npm-publish was skipped or failed (there is nothing else to list)", () => {
    // No always(), !cancelled() or result checks: the implicit success() requires npm-publish to succeed.
    expect(job.if ?? "").not.toMatch(/always\(\)|cancelled\(\)|\.result/);
  });
});

describe("mcp-registry.yml", () => {
  const job = registry.jobs.publish!;
  const runs = (job.steps ?? []).map((s) => s.run ?? "").join("\n");

  it("is a reusable workflow (and can be started by hand for an existing tag)", () => {
    expect(Object.keys(registry.on).sort()).toEqual(["workflow_call", "workflow_dispatch"]);
    expect(registry.permissions).toEqual({ contents: "read" });
  });

  it("logs in with GitHub OIDC, no secret", () => {
    expect(job.permissions).toEqual({ contents: "read", "id-token": "write" });
    expect(runs).toContain("./mcp-publisher login github-oidc");
    expect(JSON.stringify(registry)).not.toMatch(/secrets\./);
  });

  it("installs mcp-publisher at a pinned version and verifies its SHA-256", () => {
    expect(job.env?.MCP_PUBLISHER_VERSION).toMatch(/^v\d+\.\d+\.\d+$/);
    expect(job.env?.MCP_PUBLISHER_SHA256).toMatch(/^[0-9a-f]{64}$/);
    const install =
      /curl [\s\S]*?\$\{MCP_PUBLISHER_VERSION\}[\s\S]*?sha256sum --check --strict[\s\S]*?tar -xzf/.test(runs);
    expect(install).toBe(true);
  });

  it("publishes server.json only after npm serves the version with the right mcpName", () => {
    const steps = job.steps ?? [];
    const npmCheck = stepIndex(job, (s) => /registry\.npmjs\.org/.test(s.run ?? ""));
    const publish = stepIndex(job, (s) => /\.\/mcp-publisher publish server\.json/.test(s.run ?? ""));
    expect(npmCheck).toBeGreaterThanOrEqual(0);
    expect(publish).toBeGreaterThan(npmCheck);
    expect(steps[npmCheck]!.run).toContain("mcpName");
  });
});

describe("every action is pinned by commit SHA", () => {
  for (const file of ["release.yml", "ci.yml", "mcp-registry.yml"]) {
    it(file, () => {
      const wf = workflow(file);
      for (const [id, job] of Object.entries(wf.jobs)) {
        for (const s of job.steps ?? []) {
          if (s.uses) expect(s.uses, `${file} ${id}`).toMatch(/@[0-9a-f]{40}$/);
        }
        if (job.uses) expect(job.uses, `${file} ${id}`).toMatch(/^\.\/\.github\/workflows\/[a-z-]+\.yml$/);
      }
    });
  }
});

describe("package.json publishing fields", () => {
  it("names the public repository, the MCP Registry name, bin, engines and publishConfig", () => {
    expect(pkg.repository?.url).toBe("git+https://github.com/mguttmann/the-real-snipeit-mcp.git");
    expect(pkg.mcpName).toBe("io.github.mguttmann/the-real-snipeit-mcp");
    expect(pkg.bin).toEqual({ "the-real-snipeit-mcp": "dist/index.js" });
    expect(pkg.engines?.node).toBe(">=22.12");
    expect(pkg.publishConfig).toEqual({ access: "public", provenance: true });
  });

  it("ships the license notice with the package", () => {
    for (const f of ["dist", "README.md", "LICENSE", "NOTICE", "CHANGELOG.md", ".env.example"]) {
      expect(pkg.files, f).toContain(f);
    }
    expect(existsSync(new URL("NOTICE", root))).toBe(true);
  });
});

describe("server.json (MCP Registry)", () => {
  const server = JSON.parse(read("server.json")) as {
    $schema: string;
    name: string;
    version: string;
    description: string;
    repository: { url: string; source: string };
    packages: {
      registryType: string;
      identifier: string;
      version: string;
      transport: { type: string };
      environmentVariables: {
        name: string;
        isRequired?: boolean;
        isSecret?: boolean;
        default?: string;
        description: string;
      }[];
    }[];
  };
  const npm = server.packages?.[0]!;
  const vars = new Map((npm?.environmentVariables ?? []).map((v) => [v.name, v]));

  it("matches package.json name, mcpName and version", () => {
    expect(server.$schema).toMatch(
      /^https:\/\/static\.modelcontextprotocol\.io\/schemas\/[\d-]+\/server\.schema\.json$/,
    );
    expect(server.name).toBe(pkg.mcpName);
    expect(server.version).toBe(pkg.version);
    expect(server.packages).toHaveLength(1);
    expect(npm.version).toBe(pkg.version);
    expect(npm.identifier).toBe(pkg.name);
    expect(npm.registryType).toBe("npm");
    expect(npm.transport).toEqual({ type: "stdio" });
    expect(server.repository).toEqual({
      url: "https://github.com/mguttmann/the-real-snipeit-mcp",
      source: "github",
    });
    // The registry limits the description to 100 characters.
    expect(server.description.length).toBeLessThanOrEqual(100);
  });

  it("lists every variable src/config.ts reads, with the defaults of .env.example", () => {
    const configSrc = read("src/config.ts");
    const read_ = [...new Set([...configSrc.matchAll(/env\.(SNIPEIT_[A-Z_]+)/g)].map((m) => m[1]!))];
    expect([...vars.keys()].sort()).toEqual(read_.sort());
    expect(vars.get("SNIPEIT_API_BASE")).toMatchObject({ isRequired: true });
    expect(vars.get("SNIPEIT_API_TOKEN")).toMatchObject({ isRequired: true, isSecret: true });
    const env = read(".env.example");
    for (const [name, v] of vars) {
      expect(v.description.length, name).toBeGreaterThan(0);
      if (name === "SNIPEIT_API_BASE" || name === "SNIPEIT_API_TOKEN") continue;
      expect(v.isRequired, name).toBe(false);
      const example = new RegExp(`^${name}=(.*)$`, "m").exec(env)?.[1];
      expect(v.default, name).toBe(example);
    }
  });
});

describe("glama.json", () => {
  it("names the maintainer", () => {
    expect(JSON.parse(read("glama.json"))).toEqual({
      $schema: "https://glama.ai/mcp/schemas/server.json",
      maintainers: ["mguttmann"],
    });
  });
});

describe("docs name the real CI checks and Node lines", () => {
  const ci = workflow("ci.yml") as Workflow & {
    jobs: Record<string, Job & { name?: string; strategy?: { matrix?: { node?: string[] } } }>;
  };
  const checks = Object.entries(ci.jobs).flatMap(([id, job]) => {
    const name = job.name ?? id;
    const nodes = job.strategy?.matrix?.node;
    return nodes ? nodes.map((n) => name.replace("${{ matrix.node }}", n)) : [name];
  });

  it("every CI check is a required check of the main ruleset in repo-settings.md", () => {
    const settings = read("docs/maintainers/repo-settings.md");
    expect(checks.length).toBeGreaterThan(0);
    for (const c of checks) {
      expect(settings, c).toContain(`- \`${c}\``);
      expect(settings, c).toContain(`{ "context": "${c}" }`);
    }
  });

  it("README names the Node lines CI tests", () => {
    const nodes = ci.jobs.test?.strategy?.matrix?.node ?? [];
    expect(nodes.length).toBeGreaterThan(0);
    const list = `${nodes.slice(0, -1).join(", ")} and ${nodes.at(-1)}`;
    expect(read("README.md")).toContain(`CI tests Node ${list}`);
  });
});
