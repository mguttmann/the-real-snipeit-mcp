import { describe, expect, it, vi } from "vitest";
import { registerHardwareTools } from "../../src/tools/hardware.js";
import { ctxMock, captureHandlers } from "./_helpers.js";
import type { ServerContext } from "../../src/server.js";

function setup(reqImpl?: ReturnType<typeof vi.fn>) {
  const reqFn = reqImpl ?? vi.fn().mockResolvedValue({ data: { total: 0, rows: [] }, status: 200, headers: new Headers() });
  const ctx = ctxMock({ client: { request: reqFn } as unknown as ServerContext["client"] });
  const { server, handlers } = captureHandlers();
  registerHardwareTools(server, ctx);
  return { reqFn, ctx, handlers };
}

describe("snipeit_list_hardware", () => {
  it("forwards limit/offset/search/status_id query", async () => {
    const { reqFn, handlers } = setup();
    await handlers["snipeit_list_hardware"]!({ limit: 10, offset: 5, search: "lap", status_id: 2 });
    expect(reqFn).toHaveBeenCalledWith("GET", "/hardware", expect.objectContaining({ query: expect.objectContaining({ limit: 10, offset: 5, search: "lap", status_id: 2 }) }));
  });
});

describe("snipeit_get_hardware_by_tag", () => {
  it("URL-encodes the tag", async () => {
    const { reqFn, handlers } = setup();
    await handlers["snipeit_get_hardware_by_tag"]!({ tag: "A 42/B" });
    const path = (reqFn.mock.calls[0]?.[1]) as string;
    expect(path).toBe(`/hardware/bytag/${encodeURIComponent("A 42/B")}`);
  });
});

describe("snipeit_checkout_hardware", () => {
  it("forwards checkout_to_type and target id to POST /hardware/{id}/checkout", async () => {
    const { reqFn, handlers } = setup();
    await handlers["snipeit_checkout_hardware"]!({ id: 42, checkout_to_type: "user", assigned_user: 7, note: "n" });
    expect(reqFn).toHaveBeenCalledWith(
      "POST",
      "/hardware/42/checkout",
      expect.objectContaining({ body: expect.objectContaining({ checkout_to_type: "user", assigned_user: 7, note: "n" }) }),
    );
  });
});

describe("snipeit_delete_hardware", () => {
  it("calls DELETE /hardware/{id}", async () => {
    const { reqFn, handlers } = setup();
    await handlers["snipeit_delete_hardware"]!({ id: 9 });
    expect(reqFn).toHaveBeenCalledWith("DELETE", "/hardware/9", expect.anything());
  });
});

describe("snipeit_audit_hardware", () => {
  it("POSTs to /hardware/audit", async () => {
    const { reqFn, handlers } = setup();
    await handlers["snipeit_audit_hardware"]!({ asset_tag: "A-1", location_id: 3 });
    expect(reqFn).toHaveBeenCalledWith("POST", "/hardware/audit", expect.objectContaining({ body: { asset_tag: "A-1", location_id: 3 } }));
  });
});

describe("audit lists", () => {
  it("lists due", async () => {
    const { reqFn, handlers } = setup();
    await handlers["snipeit_list_audit_due"]!({});
    expect(reqFn).toHaveBeenCalledWith("GET", "/hardware/audit/due", expect.anything());
  });
  it("lists overdue", async () => {
    const { reqFn, handlers } = setup();
    await handlers["snipeit_list_audit_overdue"]!({});
    expect(reqFn).toHaveBeenCalledWith("GET", "/hardware/audit/overdue", expect.anything());
  });
});

describe("snipeit_list_hardware auto-paginate", () => {
  it("snipeit_list_hardware with all=true calls autoPaginate", async () => {
    let calls = 0;
    const reqFn = vi.fn().mockImplementation(async () => {
      calls++;
      if (calls === 1) return { data: { total: 3, rows: [1, 2] }, status: 200, headers: new Headers() };
      return { data: { total: 3, rows: [3] }, status: 200, headers: new Headers() };
    });
    const ctx = ctxMock({ client: { request: reqFn } as unknown as ServerContext["client"] });
    const { server, handlers } = captureHandlers();
    registerHardwareTools(server, ctx);
    const res = await handlers["snipeit_list_hardware"]!({ all: true });
    expect(reqFn.mock.calls.length).toBeGreaterThanOrEqual(2);
    const body = JSON.parse((res as { content: { text: string }[] }).content[0]!.text);
    expect(body.data.total).toBe(3);
    expect(body.data.rows.length).toBe(3);
  });
});
