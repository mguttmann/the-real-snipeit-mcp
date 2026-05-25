import { describe, expect, it, vi } from "vitest";
import { registerLicensesTools } from "../../src/tools/licenses.js";
import { ctxMock, captureHandlers } from "./_helpers.js";
import type { ServerContext } from "../../src/server.js";

function setup() {
  const reqFn = vi.fn().mockResolvedValue({ data: { total: 0, rows: [] }, status: 200, headers: new Headers() });
  const ctx = ctxMock({ client: { request: reqFn } as unknown as ServerContext["client"] });
  const { server, handlers } = captureHandlers();
  registerLicensesTools(server, ctx);
  return { reqFn, handlers };
}

describe("licenses wrappers", () => {
  it("list forwards query params", async () => {
    const { reqFn, handlers } = setup();
    await handlers["snipeit_list_licenses"]!({ limit: 10, search: "office" });
    expect(reqFn).toHaveBeenCalledWith("GET", "/licenses", expect.objectContaining({ query: expect.objectContaining({ limit: 10, search: "office" }) }));
  });

  it("get_license_seats GETs nested seats path", async () => {
    const { reqFn, handlers } = setup();
    await handlers["snipeit_get_license_seats"]!({ id: 5 });
    expect(reqFn).toHaveBeenCalledWith("GET", "/licenses/5/seats", expect.anything());
  });

  it("checkout_license_seat PUTs with body containing assigned_to", async () => {
    const { reqFn, handlers } = setup();
    await handlers["snipeit_checkout_license_seat"]!({ license_id: 3, seat_id: 10, assigned_to: 7 });
    expect(reqFn).toHaveBeenCalledWith(
      "PUT",
      "/licenses/3/seats/10",
      expect.objectContaining({ body: expect.objectContaining({ assigned_to: 7 }) }),
    );
  });
});
