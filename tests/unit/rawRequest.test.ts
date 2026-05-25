import { describe, expect, it, vi } from "vitest";
import { registerRawRequestTool } from "../../src/tools/rawRequest.js";
import type { ServerContext } from "../../src/server.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function ctxMock(extra?: Partial<ServerContext>): ServerContext {
  return {
    cfg: { confirmWrites: false, apiToken: "t", apiBase: "https://x", logLevel: "error", timeoutMs: 1000 } as ServerContext["cfg"],
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    client: { request: vi.fn() } as unknown as ServerContext["client"],
    ...extra,
  } as ServerContext;
}

function captureHandler() {
  const tools: Record<string, { handler: (args: Record<string, unknown>) => Promise<unknown> }> = {};
  const server = {
    registerTool: (name: string, _def: unknown, handler: (args: Record<string, unknown>) => Promise<unknown>) => {
      tools[name] = { handler };
    },
  } as unknown as McpServer;
  return { server, tools };
}

describe("snipeit_raw_request", () => {
  it("registers the tool", () => {
    const { server, tools } = captureHandler();
    registerRawRequestTool(server, ctxMock());
    expect(tools["snipeit_raw_request"]).toBeDefined();
  });

  it("forwards method/path/body/query to client.request", async () => {
    const reqFn = vi.fn().mockResolvedValue({ data: { ok: true }, status: 200, headers: new Headers() });
    const ctx = ctxMock({ client: { request: reqFn } as unknown as ServerContext["client"] });
    const { server, tools } = captureHandler();
    registerRawRequestTool(server, ctx);
    await tools["snipeit_raw_request"]!.handler({ method: "POST", path: "/hardware", body: { a: 1 }, query: { x: "y" } });
    expect(reqFn).toHaveBeenCalledWith("POST", "/hardware", expect.objectContaining({ body: { a: 1 }, query: { x: "y" } }));
  });

  it("snipeit_raw_request preview shows full URL when confirmWrites=true", async () => {
    const ctx = ctxMock({ cfg: { confirmWrites: true, apiBase: "https://snipe.example/api/v1", apiToken: "t", logLevel: "error", timeoutMs: 1000 } as ServerContext["cfg"] });
    const { server, tools } = captureHandler();
    registerRawRequestTool(server, ctx);
    const res = await tools["snipeit_raw_request"]!.handler({ method: "POST", path: "/hardware", body: { a: 1 } });
    const body = JSON.parse(((res as { content: { text: string }[] }).content[0]!).text);
    expect(body.preview.url).toBe("https://snipe.example/api/v1/hardware");
  });
});
