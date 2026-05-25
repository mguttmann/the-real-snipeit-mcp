import { describe, expect, it, vi } from "vitest";
import { registerComponentsTools } from "../../src/tools/components.js";
import { ctxMock, captureHandlers } from "./_helpers.js";
import type { ServerContext } from "../../src/server.js";

function setup() {
  const reqFn = vi.fn().mockResolvedValue({ data: { total: 0, rows: [] }, status: 200, headers: new Headers() });
  const ctx = ctxMock({ client: { request: reqFn } as unknown as ServerContext["client"] });
  const { server, handlers } = captureHandlers();
  registerComponentsTools(server, ctx);
  return { reqFn, handlers };
}

describe("components wrappers", () => {
  it("list forwards query params", async () => {
    const { reqFn, handlers } = setup();
    await handlers["snipeit_list_components"]!({ limit: 15, search: "ram" });
    expect(reqFn).toHaveBeenCalledWith("GET", "/components", expect.objectContaining({ query: expect.objectContaining({ limit: 15, search: "ram" }) }));
  });

  it("checkout POSTs with assigned_to and assigned_qty in body", async () => {
    const { reqFn, handlers } = setup();
    await handlers["snipeit_checkout_component"]!({ id: 6, assigned_to: 99, assigned_qty: 2 });
    expect(reqFn).toHaveBeenCalledWith(
      "POST",
      "/components/6/checkout",
      expect.objectContaining({ body: expect.objectContaining({ assigned_to: 99, assigned_qty: 2 }) }),
    );
  });

  it("checkin POSTs to /components/{id}/checkin with checkin_qty in body", async () => {
    const { reqFn, handlers } = setup();
    await handlers["snipeit_checkin_component"]!({ id: 42, checkin_qty: 1 });
    expect(reqFn).toHaveBeenCalledWith(
      "POST",
      "/components/42/checkin",
      expect.objectContaining({ body: expect.objectContaining({ checkin_qty: 1 }) }),
    );
  });
});
