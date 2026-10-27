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
      confirm: "YES",
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
          name: "Fix power supply",
          title: "Fix power supply",
          start_date: "2024-06-01",
        }),
      }),
    );
  });

  it("create description matches the 8.2.0 spec (supplier_id required, enum 'PAT Test')", () => {
    const defs: Record<
      string,
      { description?: string; inputSchema?: Record<string, { description?: string }> }
    > = {};
    const server = {
      registerTool: (name: string, def: (typeof defs)[string]) => {
        defs[name] = def;
      },
    } as unknown as Parameters<typeof registerMaintenancesTools>[0];
    registerMaintenancesTools(server, ctxMock());
    const create = defs["snipeit_create_maintenance"]!;
    expect(create.description).toMatch(/supplier_id is required/);
    expect(create.description).not.toMatch(/supplier_id is optional/);
    expect(create.inputSchema!.asset_maintenance_type!.description).toContain("'PAT Test'");
    expect(JSON.stringify(defs)).not.toContain("PAT test");
  });
});
