import { describe, expect, it, vi } from "vitest";
import { registerIdentityTools } from "../../src/tools/identity.js";
import { ctxMock, captureHandlers } from "./_helpers.js";
import type { ServerContext } from "../../src/server.js";

describe("snipeit_me", () => {
  it("registers and calls GET /users/me", async () => {
    const reqFn = vi.fn().mockResolvedValue({ data: { id: 1, username: "manuel" }, status: 200, headers: new Headers() });
    const ctx = ctxMock({ client: { request: reqFn } as unknown as ServerContext["client"] });
    const { server, handlers } = captureHandlers();
    registerIdentityTools(server, ctx);
    expect(handlers["snipeit_me"]).toBeDefined();
    await handlers["snipeit_me"]!({});
    expect(reqFn).toHaveBeenCalledWith("GET", "/users/me", expect.anything());
  });
});
