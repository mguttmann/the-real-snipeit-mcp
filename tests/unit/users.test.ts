import { describe, expect, it, vi } from "vitest";
import { registerUsersTools } from "../../src/tools/users.js";
import { ctxMock, captureHandlers } from "./_helpers.js";
import type { ServerContext } from "../../src/server.js";

function setup() {
  const reqFn = vi.fn().mockResolvedValue({ data: { total: 0, rows: [] }, status: 200, headers: new Headers() });
  const ctx = ctxMock({ client: { request: reqFn } as unknown as ServerContext["client"] });
  const { server, handlers } = captureHandlers();
  registerUsersTools(server, ctx);
  return { reqFn, handlers };
}

describe("users wrappers", () => {
  it("list forwards query params", async () => {
    const { reqFn, handlers } = setup();
    await handlers["snipeit_list_users"]!({ limit: 10, search: "manuel" });
    expect(reqFn).toHaveBeenCalledWith("GET", "/users", expect.objectContaining({ query: expect.objectContaining({ limit: 10, search: "manuel" }) }));
  });

  it("get_user GETs by id", async () => {
    const { reqFn, handlers } = setup();
    await handlers["snipeit_get_user"]!({ id: 7 });
    expect(reqFn).toHaveBeenCalledWith("GET", "/users/7", expect.anything());
  });

  it("user_assets GETs nested path", async () => {
    const { reqFn, handlers } = setup();
    await handlers["snipeit_get_user_assets"]!({ id: 7 });
    expect(reqFn).toHaveBeenCalledWith("GET", "/users/7/assets", expect.anything());
  });

  it("user_accessories GETs nested path", async () => {
    const { reqFn, handlers } = setup();
    await handlers["snipeit_get_user_accessories"]!({ id: 7 });
    expect(reqFn).toHaveBeenCalledWith("GET", "/users/7/accessories", expect.anything());
  });

  it("user_licenses GETs nested path", async () => {
    const { reqFn, handlers } = setup();
    await handlers["snipeit_get_user_licenses"]!({ id: 7 });
    expect(reqFn).toHaveBeenCalledWith("GET", "/users/7/licenses", expect.anything());
  });
});
