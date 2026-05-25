import { describe, expect, it, vi } from "vitest";
import { registerConsumablesTools } from "../../src/tools/consumables.js";
import { ctxMock, captureHandlers } from "./_helpers.js";
import type { ServerContext } from "../../src/server.js";

function setup() {
  const reqFn = vi.fn().mockResolvedValue({ data: { total: 0, rows: [] }, status: 200, headers: new Headers() });
  const ctx = ctxMock({ client: { request: reqFn } as unknown as ServerContext["client"] });
  const { server, handlers } = captureHandlers();
  registerConsumablesTools(server, ctx);
  return { reqFn, handlers };
}

describe("consumables wrappers", () => {
  it("list forwards query params", async () => {
    const { reqFn, handlers } = setup();
    await handlers["snipeit_list_consumables"]!({ limit: 20, search: "toner" });
    expect(reqFn).toHaveBeenCalledWith("GET", "/consumables", expect.objectContaining({ query: expect.objectContaining({ limit: 20, search: "toner" }) }));
  });

  it("checkout POSTs with assigned_to in body", async () => {
    const { reqFn, handlers } = setup();
    await handlers["snipeit_checkout_consumable"]!({ id: 8, assigned_to: 4 });
    expect(reqFn).toHaveBeenCalledWith(
      "POST",
      "/consumables/8/checkout",
      expect.objectContaining({ body: expect.objectContaining({ assigned_to: 4 }) }),
    );
  });
});
