import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Release and supply-chain rules that live in workflow files and package.json.
// The workflows are read as text; jobs are the two-space-indented keys under `jobs:`.

const root = new URL("../../", import.meta.url);
const read = (rel: string) => readFileSync(new URL(rel, root), "utf8");

/** `jobs:` of a workflow, keyed by job id, each with its raw text. */
function jobs(workflow: string): Map<string, string> {
  const body = workflow.slice(workflow.indexOf("\njobs:\n") + "\njobs:\n".length);
  const out = new Map<string, string>();
  const heads = [...body.matchAll(/^ {2}([a-z0-9-]+):\n/gm)];
  heads.forEach((m, i) => out.set(m[1]!, body.slice(m.index, heads[i + 1]?.index ?? body.length)));
  return out;
}

/** The top-level `on:` block of a workflow. */
function triggers(workflow: string): string {
  const start = workflow.indexOf("\non:\n");
  const end = workflow.indexOf("\npermissions:", start);
  return workflow.slice(start, end);
}

const pkg = JSON.parse(read("package.json")) as {
  version: string;
  name: string;
  publishConfig?: Record<string, unknown>;
  scripts: Record<string, string>;
  files: string[];
};

describe("release workflow (.github/workflows/release.yml)", () => {
  const release = read(".github/workflows/release.yml");
  const releaseJobs = jobs(release);

  it("runs only on a pushed v* tag", () => {
    const on = triggers(release);
    expect(on).toMatch(/\n {2}push:\n {4}tags:\n {6}- "v\*\.\*\.\*"\n/);
    for (const other of [
      "branches:",
      "pull_request",
      "workflow_dispatch",
      "schedule",
      "workflow_call",
      "release:",
    ]) {
      expect(on, other).not.toContain(other);
    }
  });

  it("defaults to read-only permissions", () => {
    expect(release).toMatch(/\npermissions:\n {2}contents: read\n/);
  });

  it("verifies tag == v + package version and that the tag commit is on main", () => {
    const verify = releaseJobs.get("verify");
    expect(verify).toBeDefined();
    expect(verify).toContain(`"$TAG" != "v$version"`);
    expect(verify).toContain("git merge-base --is-ancestor");
    expect(verify).toContain("origin/main");
  });

  it("reuses the whole CI workflow before building", () => {
    expect(releaseJobs.get("ci")).toContain("uses: ./.github/workflows/ci.yml");
    expect(releaseJobs.get("build")).toMatch(/needs: \[verify, ci\]/);
    expect(triggers(read(".github/workflows/ci.yml"))).toContain("workflow_call:");
  });

  it("builds the tarball, SBOM and checksums, attests them and creates the release", () => {
    expect(releaseJobs.get("build")).toContain("bash scripts/release-assets.sh");
    const gh = releaseJobs.get("github-release")!;
    expect(gh).toContain("actions/attest-build-provenance@");
    expect(gh).toContain("gh release create");
    expect(existsSync(new URL("scripts/release-assets.sh", root))).toBe(true);
    expect(existsSync(new URL("scripts/release-sbom.mjs", root))).toBe(true);
  });

  it("publishes to npm only behind NPM_PUBLISH_ENABLED, with OIDC and provenance", () => {
    const publish = releaseJobs.get("npm-publish")!;
    expect(publish).toContain("if: ${{ vars.NPM_PUBLISH_ENABLED == 'true' }}");
    expect(publish).toContain("id-token: write");
    expect(publish).toContain("--provenance");
    expect(publish).not.toMatch(/NODE_AUTH_TOKEN|NPM_TOKEN/);
    expect(pkg.publishConfig?.provenance).toBe(true);
  });

  it("pins every action by commit SHA", () => {
    for (const file of ["release.yml", "ci.yml", "mcp-registry.yml"]) {
      const uses = [...read(`.github/workflows/${file}`).matchAll(/uses: ([^\s]+)/g)].map((m) => m[1]!);
      for (const u of uses.filter((x) => !x.startsWith("./"))) {
        expect(u, `${file}: ${u}`).toMatch(/@[0-9a-f]{40}$/);
      }
    }
  });

  it("has no MCPB step (the MCP Registry lists the npm package only)", () => {
    expect(release.toLowerCase()).not.toContain("mcpb");
    expect(read(".github/workflows/mcp-registry.yml").toLowerCase()).not.toContain("mcpb");
  });
});

describe("dependabot (.github/dependabot.yml)", () => {
  const dep = read(".github/dependabot.yml");
  it("updates npm and github-actions weekly with a cooldown, ignoring @types/node majors", () => {
    expect(dep).toContain("package-ecosystem: npm");
    expect(dep).toContain("package-ecosystem: github-actions");
    expect(dep.match(/interval: weekly/g)?.length).toBe(2);
    expect(dep.match(/cooldown:/g)?.length).toBe(2);
    expect(dep).toMatch(
      /dependency-name: "@types\/node"\n\s+update-types: \["version-update:semver-major"\]/,
    );
  });
});

describe("packing", () => {
  it("prepack cleans dist and builds, so a tarball never ships stale files", () => {
    expect(pkg.scripts.prepack).toBe("npm run clean && npm run build");
    expect(pkg.scripts["build:mcpb"]).toBeUndefined();
  });

  it("the tarball leaves out the code generator and source maps the runtime does not need (run-2026-10-27-1)", () => {
    expect(pkg.files).toContain("dist");
    expect(pkg.files).toContain("!dist/codegen");
    expect(pkg.files).toContain("!dist/**/*.map");
  });
});

describe("CI (.github/workflows/ci.yml)", () => {
  const ci = read(".github/workflows/ci.yml");

  it("checks formatting (docs-10)", () => {
    expect(ci).toMatch(/run: npm run format:check/);
  });

  it("the codegen drift test is part of the unit tests CI runs (docs-10, tests-08)", () => {
    expect(ci).toMatch(/run: npm run test:unit/);
    expect(existsSync(new URL("tests/unit/codegen.drift.test.ts", root))).toBe(true);
  });
});
