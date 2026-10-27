import { describe, expect, it, vi } from "vitest";
import { loadConfig, logConfigWarnings, logGuardState } from "../../src/config.js";
import { maxBodyBytes } from "../../src/constants.js";

describe("loadConfig", () => {
  it("loads minimal valid config from env", () => {
    const cfg = loadConfig({ SNIPEIT_API_TOKEN: "tok123" } as NodeJS.ProcessEnv);
    expect(cfg.apiToken).toBe("tok123");
    expect(cfg.apiBase).toBe("https://snipe-it.example.com/api/v1");
    expect(cfg.confirmWrites).toBe(true); // safe default: write guard is on unless explicitly disabled
    expect(cfg.timeoutMs).toBe(30_000);
    expect(cfg.logLevel).toBe("info");
    expect(cfg.maxResultBytes).toBe(1_048_576);
  });

  it("parses SNIPEIT_MAX_RESULT_BYTES (optional, minimum 65536)", () => {
    const ok = loadConfig({
      SNIPEIT_API_TOKEN: "t",
      SNIPEIT_MAX_RESULT_BYTES: " 2097152 ",
    } as NodeJS.ProcessEnv);
    expect(ok.maxResultBytes).toBe(2_097_152);
    expect(
      loadConfig({ SNIPEIT_API_TOKEN: "t", SNIPEIT_MAX_RESULT_BYTES: "65536" } as NodeJS.ProcessEnv)
        .maxResultBytes,
    ).toBe(65_536);
    expect(
      loadConfig({ SNIPEIT_API_TOKEN: "t", SNIPEIT_MAX_RESULT_BYTES: "" } as NodeJS.ProcessEnv)
        .maxResultBytes,
    ).toBe(1_048_576);
    for (const bad of ["65535", "0", "-1", "abc", "1.5", "1e400"]) {
      expect(() =>
        loadConfig({ SNIPEIT_API_TOKEN: "t", SNIPEIT_MAX_RESULT_BYTES: bad } as NodeJS.ProcessEnv),
      ).toThrow(/SNIPEIT_MAX_RESULT_BYTES/);
    }
  });

  it("throws when SNIPEIT_API_TOKEN missing", () => {
    expect(() => loadConfig({} as NodeJS.ProcessEnv)).toThrow(/SNIPEIT_API_TOKEN/);
  });

  it("throws when SNIPEIT_API_TOKEN is whitespace only", () => {
    expect(() => loadConfig({ SNIPEIT_API_TOKEN: "   " } as NodeJS.ProcessEnv)).toThrow(/SNIPEIT_API_TOKEN/);
  });

  it("SNIPEIT_CONFIRM_WRITES: only false|0|no|off (trimmed, any case) disable the guard", () => {
    for (const v of ["false", "0", "no", "off", " OFF ", "False", "NO"]) {
      const cfg = loadConfig({ SNIPEIT_API_TOKEN: "t", SNIPEIT_CONFIRM_WRITES: v } as NodeJS.ProcessEnv);
      expect(cfg.confirmWrites).toBe(false);
      expect(cfg.confirmWritesWarning).toBeUndefined();
    }
  });

  it("SNIPEIT_CONFIRM_WRITES: recognised truthy values keep the guard on without warning", () => {
    for (const v of ["true", "1", "yes", "on", "TRUE", " Yes "]) {
      const cfg = loadConfig({ SNIPEIT_API_TOKEN: "t", SNIPEIT_CONFIRM_WRITES: v } as NodeJS.ProcessEnv);
      expect(cfg.confirmWrites).toBe(true);
      expect(cfg.confirmWritesWarning).toBeUndefined();
    }
    expect(loadConfig({ SNIPEIT_API_TOKEN: "t" } as NodeJS.ProcessEnv).confirmWritesWarning).toBeUndefined();
  });

  it("SNIPEIT_CONFIRM_WRITES fails closed: empty or unrecognised values keep the guard on and carry a warning", () => {
    for (const v of ["", "   ", "ture", "enabled", "y", '"false"', "nope"]) {
      const cfg = loadConfig({ SNIPEIT_API_TOKEN: "t", SNIPEIT_CONFIRM_WRITES: v } as NodeJS.ProcessEnv);
      expect(cfg.confirmWrites).toBe(true);
      expect(cfg.confirmWritesWarning).toMatch(/SNIPEIT_CONFIRM_WRITES/);
    }
  });

  it("logGuardState logs the effective guard state once at info and the warning at warn", () => {
    const lines: string[] = [];
    const logger = {
      debug: () => {},
      info: (m: string) => lines.push(`info ${m}`),
      warn: (m: string) => lines.push(`warn ${m}`),
      error: () => {},
    };
    logGuardState(
      loadConfig({ SNIPEIT_API_TOKEN: "t", SNIPEIT_CONFIRM_WRITES: "ture" } as NodeJS.ProcessEnv),
      logger,
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^warn .*SNIPEIT_CONFIRM_WRITES/);
    expect(lines[1]).toMatch(/^info write guard: on/);
    lines.length = 0;
    logGuardState(
      loadConfig({ SNIPEIT_API_TOKEN: "t", SNIPEIT_CONFIRM_WRITES: "off" } as NodeJS.ProcessEnv),
      logger,
    );
    expect(lines).toEqual([expect.stringMatching(/^info write guard: off/)]);
  });

  it("throws when SNIPEIT_TIMEOUT_MS is not a positive number", () => {
    expect(() =>
      loadConfig({ SNIPEIT_API_TOKEN: "t", SNIPEIT_TIMEOUT_MS: "abc" } as NodeJS.ProcessEnv),
    ).toThrow(/SNIPEIT_TIMEOUT_MS/);
    expect(() =>
      loadConfig({ SNIPEIT_API_TOKEN: "t", SNIPEIT_TIMEOUT_MS: "-1" } as NodeJS.ProcessEnv),
    ).toThrow(/SNIPEIT_TIMEOUT_MS/);
  });

  it("throws on invalid log level", () => {
    expect(() =>
      loadConfig({ SNIPEIT_API_TOKEN: "t", SNIPEIT_LOG_LEVEL: "verbose" } as NodeJS.ProcessEnv),
    ).toThrow(/SNIPEIT_LOG_LEVEL/);
  });

  it("bounds one response body at max(4 x result cap, 16 MiB)", () => {
    expect(maxBodyBytes(1_048_576)).toBe(16 * 1_048_576);
    expect(maxBodyBytes(8 * 1_048_576)).toBe(32 * 1_048_576);
  });
});

describe("startup warnings instead of rejections (sec-input-6, run-2026-10-27-5)", () => {
  const base = { SNIPEIT_API_TOKEN: "t" };
  const warningsFor = (env: Record<string, string>) =>
    loadConfig({ ...base, ...env } as NodeJS.ProcessEnv).warnings.join("\n");

  it("a plain https base produces no warning", () => {
    expect(
      loadConfig({ ...base, SNIPEIT_API_BASE: "https://assets.example.org/api/v1" } as NodeJS.ProcessEnv)
        .warnings,
    ).toEqual([]);
  });

  it("the placeholder default is accepted but named", () => {
    expect(warningsFor({})).toMatch(/SNIPEIT_API_BASE is not set/);
  });

  it("http to a remote host is accepted with a cleartext warning; loopback http stays quiet", () => {
    const cfg = loadConfig({
      ...base,
      SNIPEIT_API_BASE: "http://assets.example.org/api/v1",
    } as NodeJS.ProcessEnv);
    expect(cfg.apiBase).toBe("http://assets.example.org/api/v1");
    expect(cfg.warnings.join("\n")).toMatch(/cleartext/);
    expect(warningsFor({ SNIPEIT_API_BASE: "http://127.0.0.1:8000/api/v1" })).toBe("");
    expect(warningsFor({ SNIPEIT_API_BASE: "http://localhost/api/v1" })).toBe("");
  });

  it("odd bases (other schemes, userinfo, query, fragment) start with a warning, never echoing credentials", () => {
    expect(warningsFor({ SNIPEIT_API_BASE: "ftp://assets.example.org/api/v1" })).toMatch(/scheme/);
    const userinfo = warningsFor({ SNIPEIT_API_BASE: "https://admin:hunter2@assets.example.org/api/v1" });
    expect(userinfo).toMatch(/credentials/);
    expect(userinfo).not.toContain("hunter2");
    expect(warningsFor({ SNIPEIT_API_BASE: "https://assets.example.org/api/v1?x=1" })).toMatch(
      /query or fragment/,
    );
    expect(warningsFor({ SNIPEIT_API_BASE: "https://assets.example.org/api/v1#x" })).toMatch(
      /query or fragment/,
    );
  });

  it("SNIPEIT_MAX_RESULT_BYTES near the 10 MiB client buffer is accepted with a warning", () => {
    expect(
      warningsFor({
        SNIPEIT_API_BASE: "https://a.example/api/v1",
        SNIPEIT_MAX_RESULT_BYTES: String(8 * 1_048_576),
      }),
    ).toBe("");
    const w = warningsFor({
      SNIPEIT_API_BASE: "https://a.example/api/v1",
      SNIPEIT_MAX_RESULT_BYTES: String(8 * 1_048_576 + 1),
    });
    expect(w).toMatch(/SNIPEIT_MAX_RESULT_BYTES/);
    expect(w).toMatch(/10 MiB/);
  });

  it("logConfigWarnings writes each warning once at warn", () => {
    const warn = vi.fn();
    logConfigWarnings(
      loadConfig({ ...base, SNIPEIT_API_BASE: "http://assets.example.org/api/v1" } as NodeJS.ProcessEnv),
      { warn },
    );
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("SNIPEIT_TIMEOUT_MS (docs-13)", () => {
  it("a non-integer or unsafe value fails with the documented message, not a raw ZodError", () => {
    for (const bad of ["1.5", "1e20", "0"]) {
      expect(() =>
        loadConfig({ SNIPEIT_API_TOKEN: "t", SNIPEIT_TIMEOUT_MS: bad } as NodeJS.ProcessEnv),
      ).toThrow(/^Invalid config for SNIPEIT_TIMEOUT_MS: expected a positive integer/);
    }
    expect(
      loadConfig({ SNIPEIT_API_TOKEN: "t", SNIPEIT_TIMEOUT_MS: " 2500 " } as NodeJS.ProcessEnv).timeoutMs,
    ).toBe(2500);
  });
});
