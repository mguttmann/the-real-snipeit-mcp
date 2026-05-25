import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server.js";
import { registerIdentityResource } from "./identity.js";
import { registerSettingsResource } from "./settings.js";
import { registerSummaryResource } from "./summary.js";

export function registerResources(server: McpServer, ctx: ServerContext): void {
  registerIdentityResource(server, ctx);
  registerSettingsResource(server, ctx);
  registerSummaryResource(server, ctx);
}
