/**
 * .env loading stays compatible (a .env in the working directory is still read) but can
 * never write to stdout, which carries the stdio JSON-RPC stream (build-compat-2), and
 * reports which variables it added (build-compat-3).
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadDotenv } from "../../src/env.js";

const touched = [
  "DOTENV_CONFIG_DEBUG",
  "DOTENV_CONFIG_QUIET",
  "DOTENV_KEY",
  "SNIPEIT_ENVTEST_NEW",
  "SNIPEIT_ENVTEST_SET",
];
afterEach(() => {
  for (const k of touched) delete process.env[k];
  vi.restoreAllMocks();
});

function envFile(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "snipeit-env-"));
  const path = join(dir, ".env");
  writeFileSync(path, content);
  return path;
}

describe("loadDotenv", () => {
  it("adds missing variables, keeps existing ones and returns only the added names", () => {
    process.env.SNIPEIT_ENVTEST_SET = "from-env";
    const path = envFile("SNIPEIT_ENVTEST_NEW=1\nSNIPEIT_ENVTEST_SET=from-file\n");
    const res = loadDotenv(path);
    expect(res).toEqual({ path, keys: ["SNIPEIT_ENVTEST_NEW"] });
    expect(process.env.SNIPEIT_ENVTEST_NEW).toBe("1");
    expect(process.env.SNIPEIT_ENVTEST_SET).toBe("from-env");
  });

  it("writes nothing to stdout even with DOTENV_CONFIG_DEBUG, DOTENV_CONFIG_QUIET=false or a stray DOTENV_KEY", () => {
    process.env.DOTENV_CONFIG_DEBUG = "true";
    process.env.DOTENV_CONFIG_QUIET = "false";
    process.env.DOTENV_KEY = "dotenv://:key_1234@dotenvx.com/vault/.env.vault?environment=production";
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    loadDotenv(envFile("SNIPEIT_ENVTEST_NEW=1\n"));
    loadDotenv(join(tmpdir(), "does-not-exist", ".env"));
    expect(out).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it("a missing file adds nothing", () => {
    expect(loadDotenv(join(tmpdir(), "does-not-exist", ".env")).keys).toEqual([]);
  });
});
