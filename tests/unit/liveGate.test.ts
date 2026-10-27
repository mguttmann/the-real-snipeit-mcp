import { describe, expect, it } from "vitest";
import { liveTestsEnabled } from "../integration/liveGate.js";

describe("live integration test gate", () => {
  it("stays off with only a token (plain npm test must never hit a real instance)", () => {
    expect(liveTestsEnabled({ SNIPEIT_API_TOKEN: "real-token" })).toBe(false);
  });

  it("stays off with the opt-in but without a token", () => {
    expect(liveTestsEnabled({ SNIPEIT_LIVE_TESTS: "1" })).toBe(false);
    expect(liveTestsEnabled({ SNIPEIT_LIVE_TESTS: "1", SNIPEIT_API_TOKEN: "  " })).toBe(false);
  });

  it("stays off for any opt-in value other than exactly 1", () => {
    for (const v of ["true", "yes", "0", "", " 1", "11"]) {
      expect(liveTestsEnabled({ SNIPEIT_LIVE_TESTS: v, SNIPEIT_API_TOKEN: "t" })).toBe(false);
    }
  });

  it("runs only with SNIPEIT_LIVE_TESTS=1 and a token", () => {
    expect(liveTestsEnabled({ SNIPEIT_LIVE_TESTS: "1", SNIPEIT_API_TOKEN: "t" })).toBe(true);
  });
});
