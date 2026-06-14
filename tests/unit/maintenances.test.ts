import { describe, expect, it, vi } from "vitest";
import { registerMaintenancesTools } from "../../src/tools/maintenances.js";
import { ctxMock, captureHandlers } from "./_helpers.js";
import type { ServerContext } from "../../src/server.js";

function setup() {
  const reqFn = vi.fn().mockResolvedValue({ data: { id: 1 }, status: 200, headers: new Headers() });
  const ctx = ctxMock({ client: { request: reqFn } as unknown as ServerContext["client"] });
  const { server, handlers } = captureHandlers();
  registerMaintenancesTools(server, ctx);
  return { reqFn, handlers };
}

describe("maintenances wrappers", () => {
  it("list forwards query params to GET /maintenances", async () => {
    const { reqFn, handlers } = setup();
    await handlers["snipeit_list_maintenances"]!({ asset_id: 5, supplier_id: 2 });
    expect(reqFn).toHaveBeenCalledWith(
      "GET",
      "/maintenances",
      expect.objectContaining({ query: expect.objectContaining({ asset_id: 5, supplier_id: 2 }) }),
    );
  });

  it("create POSTs required fields to /maintenances", async () => {
    const { reqFn, handlers } = setup();
    await handlers["snipeit_create_maintenance"]!({
      asset_id: 10,
      asset_maintenance_type: "Repair",
      title: "Fix power supply",
      start_date: "2024-06-01",
    });
    expect(reqFn).toHaveBeenCalledWith(
      "POST",
      "/maintenances",
      expect.objectContaining({
        body: expect.objectContaining({
          asset_id: 10,
          asset_maintenance_type: "Repair",
          title: "Fix power supply",
          start_date: "2024-06-01",
        }),
      }),
    );
  });
});
