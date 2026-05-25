import { describe, expect, it } from "vitest";
import { SnipeitApiError, parseApiError, formatMessages } from "../../src/client/errors.js";

describe("formatMessages", () => {
  it("returns string messages verbatim", () => {
    expect(formatMessages("Asset created.")).toBe("Asset created.");
  });

  it("formats field-array shape", () => {
    expect(formatMessages({ name: ["required"], asset_tag: ["must be unique"] })).toBe(
      "asset_tag: must be unique; name: required",
    );
  });

  it("formats field-string shape", () => {
    expect(formatMessages({ name: "required" })).toBe("name: required");
  });

  it("falls back to JSON for unknown shapes", () => {
    expect(formatMessages([1, 2, 3])).toContain("[1,2,3]");
  });

  it("returns empty string for null/undefined", () => {
    expect(formatMessages(null)).toBe("");
    expect(formatMessages(undefined)).toBe("");
  });
});

describe("SnipeitApiError", () => {
  it("formats statusCode + message", () => {
    const e = new SnipeitApiError({ statusCode: 422, message: "validation failed" });
    expect(e.message).toContain("422");
    expect(e.message).toContain("validation failed");
    expect(e.statusCode).toBe(422);
  });
});

describe("parseApiError", () => {
  it("extracts messages from JSON body", () => {
    const body = JSON.stringify({ status: "error", messages: { name: ["required"] } });
    const e = parseApiError(body, 200);
    expect(e.message).toContain("name: required");
    expect(e.statusCode).toBe(200);
  });

  it("falls back to body snippet on non-JSON", () => {
    const e = parseApiError("plain text error", 500);
    expect(e.message).toContain("500");
    expect(e.message).toContain("plain text error");
  });
});
