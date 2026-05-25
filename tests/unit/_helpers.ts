import { vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../../src/server.js";

export function ctxMock(extra?: Partial<ServerContext>): ServerContext {
  return {
    cfg: { confirmWrites: false, apiToken: "t", apiBase: "https://x", logLevel: "error", timeoutMs: 1000 } as ServerContext["cfg"],
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    client: { request: vi.fn() } as unknown as ServerContext["client"],
    ...extra,
  } as ServerContext;
}

export function captureHandlers() {
  const handlers: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {};
  const server = {
    registerTool: (name: string, _def: unknown, h: typeof handlers[string]) => { handlers[name] = h; },
  } as unknown as McpServer;
  return { server, handlers };
}
