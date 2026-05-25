import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";

describe("loadConfig", () => {
  it("loads minimal valid config from env", () => {
    const cfg = loadConfig({ SNIPEIT_API_TOKEN: "tok123" } as NodeJS.ProcessEnv);
    expect(cfg.apiToken).toBe("tok123");
    expect(cfg.apiBase).toBe("https://snipe-it.example.com/api/v1");
    expect(cfg.confirmWrites).toBe(false);
    expect(cfg.timeoutMs).toBe(30_000);
    expect(cfg.logLevel).toBe("info");
  });

  it("throws when SNIPEIT_API_TOKEN missing", () => {
    expect(() => loadConfig({} as NodeJS.ProcessEnv)).toThrow(/SNIPEIT_API_TOKEN/);
  });

  it("throws when SNIPEIT_API_TOKEN is whitespace only", () => {
    expect(() => loadConfig({ SNIPEIT_API_TOKEN: "   " } as NodeJS.ProcessEnv)).toThrow(/SNIPEIT_API_TOKEN/);
  });

  it("parses SNIPEIT_CONFIRM_WRITES as truthy strings", () => {
    for (const v of ["true", "1", "yes", "TRUE"]) {
      const cfg = loadConfig({ SNIPEIT_API_TOKEN: "t", SNIPEIT_CONFIRM_WRITES: v } as NodeJS.ProcessEnv);
      expect(cfg.confirmWrites).toBe(true);
    }
    for (const v of ["false", "0", "no", ""]) {
      const cfg = loadConfig({ SNIPEIT_API_TOKEN: "t", SNIPEIT_CONFIRM_WRITES: v } as NodeJS.ProcessEnv);
      expect(cfg.confirmWrites).toBe(false);
    }
  });

  it("throws when SNIPEIT_TIMEOUT_MS is not a positive number", () => {
    expect(() => loadConfig({ SNIPEIT_API_TOKEN: "t", SNIPEIT_TIMEOUT_MS: "abc" } as NodeJS.ProcessEnv)).toThrow(/SNIPEIT_TIMEOUT_MS/);
    expect(() => loadConfig({ SNIPEIT_API_TOKEN: "t", SNIPEIT_TIMEOUT_MS: "-1" } as NodeJS.ProcessEnv)).toThrow(/SNIPEIT_TIMEOUT_MS/);
  });

  it("throws on invalid log level", () => {
    expect(() => loadConfig({ SNIPEIT_API_TOKEN: "t", SNIPEIT_LOG_LEVEL: "verbose" } as NodeJS.ProcessEnv)).toThrow(/SNIPEIT_LOG_LEVEL/);
  });
});
