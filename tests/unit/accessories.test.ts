import { describe, expect, it, vi } from "vitest";
import { registerAccessoriesTools } from "../../src/tools/accessories.js";
import { ctxMock, captureHandlers } from "./_helpers.js";
import type { ServerContext } from "../../src/server.js";

function setup() {
  const reqFn = vi.fn().mockResolvedValue({ data: { total: 0, rows: [] }, status: 200, headers: new Headers() });
  const ctx = ctxMock({ client: { request: reqFn } as unknown as ServerContext["client"] });
  const { server, handlers } = captureHandlers();
  registerAccessoriesTools(server, ctx);
  return { reqFn, handlers };
}

describe("accessories wrappers", () => {
  it("list forwards query params", async () => {
    const { reqFn, handlers } = setup();
    await handlers["snipeit_list_accessories"]!({ limit: 5, search: "cable" });
    expect(reqFn).toHaveBeenCalledWith("GET", "/accessories", expect.objectContaining({ query: expect.objectContaining({ limit: 5, search: "cable" }) }));
  });

  it("checkout POSTs with assigned_user in body", async () => {
    const { reqFn, handlers } = setup();
    await handlers["snipeit_checkout_accessory"]!({ id: 12, assigned_user: 3 });
    expect(reqFn).toHaveBeenCalledWith(
      "POST",
      "/accessories/12/checkout",
      expect.objectContaining({ body: expect.objectContaining({ assigned_user: 3 }) }),
    );
  });

  it("checkin POSTs to /accessories/{id}/checkin", async () => {
    const { reqFn, handlers } = setup();
    await handlers["snipeit_checkin_accessory"]!({ id: 55 });
    expect(reqFn).toHaveBeenCalledWith("POST", "/accessories/55/checkin", expect.anything());
  });
});
