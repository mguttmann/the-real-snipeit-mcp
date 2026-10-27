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
      confirm: "YES",
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

  const items = [
    { asset_id: 1, checkout_to_type: "user", assigned_user: 5 },
    { asset_id: 2, checkout_to_type: "user", assigned_user: 5 },
    { asset_id: 3, checkout_to_type: "user", assigned_user: 5 },
  ];
  type Handler = (
    args: Record<string, unknown>,
    reqCtx?: { mcpReq: { signal: AbortSignal } },
  ) => Promise<unknown>;

  it("passes the request signal to the client and stops before the next item once aborted", async () => {
    const controller = new AbortController();
    const reqFn = vi.fn().mockImplementation(async () => {
      controller.abort();
      return { data: { ok: true }, status: 200, headers: new Headers() };
    });
    const ctx = ctxMock({ client: { request: reqFn } as unknown as ServerContext["client"] });
    const { server, handlers } = captureHandlers();
    registerBulkTools(server, ctx);
    const res = await (handlers["snipeit_bulk_checkout"] as Handler)(
      { confirm: "YES", items },
      { mcpReq: { signal: controller.signal } },
    );
    expect(reqFn).toHaveBeenCalledTimes(1);
    expect(reqFn.mock.calls[0]![2]).toMatchObject({ signal: controller.signal });
    const body = JSON.parse((res as { content: { text: string }[] }).content[0]!.text);
    expect(body.data.summary).toMatchObject({ total: 3, ok: 1, errors: 0, aborted: true, not_attempted: 2 });
    expect(body.data.results.map((r: { asset_id: number }) => r.asset_id)).toEqual([1]);
  });

  it("does not start any checkout when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const reqFn = vi.fn();
    const ctx = ctxMock({ client: { request: reqFn } as unknown as ServerContext["client"] });
    const { server, handlers } = captureHandlers();
    registerBulkTools(server, ctx);
    await (handlers["snipeit_bulk_checkout"] as Handler)(
      { confirm: "YES", items },
      { mcpReq: { signal: controller.signal } },
    );
    expect(reqFn).not.toHaveBeenCalled();
  });

  it("logs every executed item at info with asset_id and outcome, without the error message", async () => {
    const { SnipeitApiError } = await import("../../src/client/errors.js");
    const reqFn = vi.fn().mockImplementation(async (_m, path: string) => {
      if (path === "/hardware/2/checkout")
        throw new SnipeitApiError({ statusCode: 422, message: "assigned to Jane Doe" });
      return { data: { ok: true }, status: 200, headers: new Headers() };
    });
    const ctx = ctxMock({ client: { request: reqFn } as unknown as ServerContext["client"] });
    const { server, handlers } = captureHandlers();
    registerBulkTools(server, ctx);
    await handlers["snipeit_bulk_checkout"]!({ confirm: "YES", items });
    const info = ctx.logger.info as ReturnType<typeof vi.fn>;
    const itemLogs = info.mock.calls.filter((c) => String(c[0]).includes("bulk_checkout item"));
    expect(itemLogs.map((c) => c[1])).toEqual([
      { asset_id: 1, ok: true },
      { asset_id: 2, ok: false, status: 422 },
      { asset_id: 3, ok: true },
    ]);
    expect(JSON.stringify(info.mock.calls)).not.toContain("Jane");
  });

  it("a client-side cancel over MCP stops further checkouts", async () => {
    const { Client } = await import("@modelcontextprotocol/client");
    const { InMemoryTransport } = await import("@modelcontextprotocol/client");
    const { buildServer } = await import("../../src/server.js");
    const { loadConfig } = await import("../../src/config.js");
    const { server, ctx } = buildServer(
      loadConfig({
        SNIPEIT_API_TOKEN: "t",
        SNIPEIT_API_BASE: "https://snipeit.invalid/api/v1",
        SNIPEIT_CONFIRM_WRITES: "false",
        SNIPEIT_LOG_LEVEL: "error",
      }),
    );
    const controller = new AbortController();
    const spy = vi.spyOn(ctx.client, "request").mockImplementation(async (_m, _p, opts) => {
      controller.abort();
      // The request completes after 20 ms, or earlier when the cancellation reaches it.
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 20);
        opts?.signal?.addEventListener("abort", () => resolve());
      });
      return { data: {}, status: 200, headers: new Headers() } as never;
    });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const client = new Client({ name: "bulk-cancel-test", version: "0.0.0" });
    await client.connect(clientSide);
    await expect(
      client.callTool({ name: "snipeit_bulk_checkout", arguments: { items } }, { signal: controller.signal }),
    ).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 100));
    expect(spy).toHaveBeenCalledTimes(1);
    await client.close();
  });
});
