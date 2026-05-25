import { describe, expect, it, vi } from "vitest";
import { registerResources } from "../../src/resources/index.js";
import { ctxMock } from "./_helpers.js";
import type { ServerContext } from "../../src/server.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function captureResource() {
  const handlers: Record<
    string,
    (uri: URL) => Promise<{ contents: { uri: string; mimeType: string; text: string }[] }>
  > = {};
  const server = {
    registerResource: (
      _name: string,
      uri: string,
      _config: unknown,
      handler: (uri: URL) => Promise<{ contents: { uri: string; mimeType: string; text: string }[] }>,
    ) => {
      handlers[uri] = handler;
    },
  } as unknown as McpServer;
  return { server, handlers };
}

describe("resources", () => {
  it("registers three resources by URI", () => {
    const seen: string[] = [];
    const server = {
      registerResource: (_name: string, uri: string) => {
        seen.push(uri);
      },
    } as unknown as McpServer;
    registerResources(server, ctxMock());
    expect(seen).toEqual(["snipeit://me", "snipeit://settings", "snipeit://hardware/summary"]);
  });

  it("snipeit://hardware/summary includes by_category alongside by_status_label", async () => {
    const reqFn = vi.fn().mockImplementation(
      async (_method: string, path: string, opts?: { query?: Record<string, unknown> }) => {
        if (path === "/hardware" && opts?.query?.category_id !== undefined) {
          // per-category count call
          return { data: { total: 5, rows: [{}] }, status: 200, headers: new Headers() };
        }
        if (path === "/hardware") {
          // initial total call
          return { data: { total: 42, rows: [] }, status: 200, headers: new Headers() };
        }
        if (path === "/statuslabels") {
          return {
            data: { total: 2, rows: [{ id: 1, name: "Ready" }, { id: 2, name: "Deployed" }] },
            status: 200,
            headers: new Headers(),
          };
        }
        if (path.startsWith("/statuslabels/")) {
          return { data: { total: 10, rows: [{}] }, status: 200, headers: new Headers() };
        }
        if (path === "/categories") {
          return {
            data: { total: 2, rows: [{ id: 11, name: "Laptops" }, { id: 12, name: "Phones" }] },
            status: 200,
            headers: new Headers(),
          };
        }
        return { data: { total: 0, rows: [] }, status: 200, headers: new Headers() };
      },
    );
    const ctx = ctxMock({ client: { request: reqFn } as unknown as ServerContext["client"] });
    const { server, handlers } = captureResource();
    registerResources(server, ctx);
    const result = await handlers["snipeit://hardware/summary"]!(new URL("snipeit://hardware/summary"));
    const payload = JSON.parse(result.contents[0]!.text);

    expect(payload.total).toBe(42);

    expect(Array.isArray(payload.by_status_label)).toBe(true);
    expect(payload.by_status_label).toHaveLength(2);
    expect(payload.by_status_label[0]).toMatchObject({ id: 1, name: "Ready" });

    expect(Array.isArray(payload.by_category)).toBe(true);
    expect(payload.by_category).toHaveLength(2);
    expect(payload.by_category[0]).toMatchObject({ id: 11, name: "Laptops" });
  });

  it("snipeit://hardware/summary auto-paginates large status-label lists", async () => {
    const reqFn = vi.fn().mockImplementation(async (_m: string, path: string, opts?: { query?: { offset?: number } }) => {
      if (path === "/hardware" && !opts?.query?.category_id) {
        return { data: { total: 0, rows: [] }, status: 200, headers: new Headers() };
      }
      if (path === "/statuslabels") {
        const offset = opts?.query?.offset ?? 0;
        if (offset === 0) {
          return { data: { total: 250, rows: Array.from({ length: 200 }, (_, i) => ({ id: i + 1, name: `L${i+1}` })) }, status: 200, headers: new Headers() };
        }
        return { data: { total: 250, rows: Array.from({ length: 50 }, (_, i) => ({ id: 201 + i, name: `L${201+i}` })) }, status: 200, headers: new Headers() };
      }
      if (path.startsWith("/statuslabels/")) {
        return { data: { total: 1, rows: [{}] }, status: 200, headers: new Headers() };
      }
      if (path === "/categories") {
        return { data: { total: 0, rows: [] }, status: 200, headers: new Headers() };
      }
      return { data: { total: 0, rows: [] }, status: 200, headers: new Headers() };
    });
    const ctx = ctxMock({ client: { request: reqFn } as unknown as ServerContext["client"] });
    const { server, handlers } = captureResource();
    registerResources(server, ctx);
    const result = await handlers["snipeit://hardware/summary"]!(new URL("snipeit://hardware/summary"));
    const payload = JSON.parse(result.contents[0]!.text);
    // /statuslabels was called at least twice for pagination
    const statusLabelListCalls = reqFn.mock.calls.filter((c) => c[1] === "/statuslabels").length;
    expect(statusLabelListCalls).toBeGreaterThanOrEqual(2);
    expect(payload.by_status_label.length).toBe(250);
  });

  it("snipeit://hardware/summary returns {error: …} JSON if an initial call fails (outer try/catch)", async () => {
    const reqFn = vi.fn().mockRejectedValue(new Error("network down"));
    const ctx = ctxMock({ client: { request: reqFn } as unknown as ServerContext["client"] });
    const { server, handlers } = captureResource();
    registerResources(server, ctx);
    // Must not throw — outer catch should turn the error into a JSON payload
    const result = await handlers["snipeit://hardware/summary"]!(new URL("snipeit://hardware/summary"));
    const payload = JSON.parse(result.contents[0]!.text);
    expect(payload.error).toBeDefined();
    expect(payload.error).toMatch(/network down/);
  });
});
