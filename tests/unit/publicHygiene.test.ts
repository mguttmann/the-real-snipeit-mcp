/**
 * The repository is public: no git-tracked file may name a private deployment (company,
 * hosts, local paths, internal addresses, private pins). Generic patterns live here.
 * Deployment-specific words must never be committed, not even as a deny-list, so they
 * come from the untracked file `.public-hygiene-denylist` (one case-insensitive regular
 * expression per line, `#` starts a comment; ignored by git). Maintainers keep that file
 * locally; CI checks the generic patterns only.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
const SELF = "tests/unit/publicHygiene.test.ts";
const LOCAL_DENYLIST = new URL(".public-hygiene-denylist", root);

const GENERIC: { what: string; re: RegExp }[] = [
  { what: "local home path", re: /\/Users\/[A-Za-z]/ },
  { what: "private IPv4 192.168.0.0/16", re: /\b192\.168\.\d{1,3}\.\d{1,3}\b/ },
  { what: "private IPv4 10.0.0.0/8", re: /\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/ },
  { what: "private IPv4 172.16.0.0/12", re: /\b172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}\b/ },
];

function localDeny(): { what: string; re: RegExp }[] {
  if (!existsSync(LOCAL_DENYLIST)) return [];
  return readFileSync(LOCAL_DENYLIST, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l, i) => ({ what: `local deny-list entry ${i + 1}`, re: new RegExp(l, "im") }));
}

const DENY = [...GENERIC, ...localDeny()];

const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
  .split("\0")
  .filter((f) => f && f !== SELF);

describe("public hygiene of git-tracked files", () => {
  it("finds tracked files and keeps the local deny-list untracked", () => {
    expect(tracked.length).toBeGreaterThan(0);
    expect(tracked).toContain("package.json");
    expect(tracked).not.toContain(".public-hygiene-denylist");
  });

  it("no tracked file contains a deny-listed internal detail", () => {
    const hits: string[] = [];
    for (const file of tracked) {
      let text: string;
      try {
        text = readFileSync(new URL(file, root), "utf8");
      } catch {
        continue; // deleted in the working tree but still in the index
      }
      for (const { what, re } of DENY) {
        const m = re.exec(text);
        if (m) {
          const line = text.slice(0, m.index).split("\n").length;
          hits.push(`${file}:${line} ${what}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it("each generic pattern still matches what it is meant to catch", () => {
    const samples: Record<string, string> = {
      "local home path": "/Users/someone/Projekte",
      "private IPv4 192.168.0.0/16": "192.168.1.20",
      "private IPv4 10.0.0.0/8": "10.0.12.4",
      "private IPv4 172.16.0.0/12": "172.20.1.1",
    };
    for (const { what, re } of GENERIC) {
      expect(re.test(samples[what]!), what).toBe(true);
    }
    // API paths and version numbers are not hits.
    for (const ok of ['GET "/users/me"', "node 22.12", "version 10.9.2"]) {
      expect(
        GENERIC.filter(({ re }) => re.test(ok)).map((d) => d.what),
        ok,
      ).toEqual([]);
    }
  });
});
