import { describe, expect, it, vi } from "vitest";
import { registerBulkTools } from "../../src/tools/bulk.js";
import { ctxMock, captureHandlers } from "./_helpers.js";
import type { ServerContext } from "../../src/server.js";

describe("snipeit_bulk_checkout", () => {
  it("runs N sequential checkouts and aggregates per-item status", async () => {
    const reqFn = vi.fn().mockImplementation(async (_m, path: string) => {
      if (path === "/hardware/2/checkout") {
        // simulate Snipe-IT error envelope being caught by SnipeitClient → SnipeitApiError
        const { SnipeitApiError } = await import("../../src/client/errors.js");
        throw new SnipeitApiError({ statusCode: 200, message: "already checked out" });
      }
      return { data: { ok: true }, status: 200, headers: new Headers() };
    });
    const ctx = ctxMock({ client: { request: reqFn } as unknown as ServerContext["client"] });
    const { server, handlers } = captureHandlers();
    registerBulkTools(server, ctx);
    const res = await handlers["snipeit_bulk_checkout"]!({
      items: [
        { asset_id: 1, checkout_to_type: "user", assigned_user: 5 },
        { asset_id: 2, checkout_to_type: "user", assigned_user: 5 },
        { asset_id: 3, checkout_to_type: "user", assigned_user: 5 },
      ],
    });
    const body = JSON.parse((res as { content: { text: string }[] }).content[0]!.text);
    expect(body.data.results.length).toBe(3);
    expect(body.data.summary.total).toBe(3);
    expect(body.data.summary.errors).toBe(1);
    expect(body.data.summary.ok).toBe(2);
    expect(reqFn).toHaveBeenCalledTimes(3);
  });
});
