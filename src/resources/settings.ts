import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server.js";

export function registerSettingsResource(server: McpServer, ctx: ServerContext): void {
  server.registerResource(
    "snipeit-settings",
    "snipeit://settings",
    {
      title: "Snipe-IT settings",
      description: "GET /settings — server configuration snapshot.",
      mimeType: "application/json",
    },
    async (uri) => {
      const res = await ctx.client.request("GET", "/settings");
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(res.data, null, 2) }] };
    },
  );
}
