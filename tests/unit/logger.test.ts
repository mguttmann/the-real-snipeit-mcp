import { describe, expect, it, vi } from "vitest";
import { createLogger, redactSecrets } from "../../src/utils/logger.js";

describe("redactSecrets", () => {
  it("redacts SNIPEIT_API_TOKEN=… patterns", () => {
    expect(redactSecrets("SNIPEIT_API_TOKEN=abc.def-ghi")).toContain("***REDACTED***");
  });

  it('redacts "Authorization": "Bearer …"', () => {
    const line = '"Authorization":"Bearer eyJhbGciOi.abc-DEF_42"';
    expect(redactSecrets(line)).toContain("***REDACTED***");
    expect(redactSecrets(line)).not.toContain("eyJhbGciOi.abc-DEF_42");
  });

  it("redacts bare JWT-shaped tokens", () => {
    const jwt = "eyJ" + "a".repeat(40) + ".b.c";
    expect(redactSecrets(`token=${jwt}`)).not.toContain(jwt);
  });

  it('redacts "api_token": "…" fields', () => {
    expect(redactSecrets('"api_token":"abc-123.def"')).toContain("***REDACTED***");
    expect(redactSecrets('"api_token":"abc-123.def"')).not.toContain("abc-123.def");
  });
});

describe("createLogger", () => {
  it("writes to stderr at the configured level", () => {
    const writeSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const log = createLogger("warn");
    log.debug("no");
    log.info("no");
    log.warn("yes");
    log.error("yes");
    const calls = writeSpy.mock.calls.map((c) => String(c[0]));
    writeSpy.mockRestore();
    expect(calls.some((l) => l.includes("yes") && l.includes("warn"))).toBe(true);
    expect(calls.some((l) => l.includes("yes") && l.includes("error"))).toBe(true);
    expect(calls.some((l) => l.includes("no"))).toBe(false);
  });
});
