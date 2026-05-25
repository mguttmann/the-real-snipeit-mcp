import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server.js";

export function registerIdentityResource(server: McpServer, ctx: ServerContext): void {
  server.registerResource(
    "snipeit-me",
    "snipeit://me",
    {
      title: "Current Snipe-IT user",
      description: "GET /users/me — current authenticated user. Useful for token validation.",
      mimeType: "application/json",
    },
    async (uri) => {
      const res = await ctx.client.request("GET", "/users/me");
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(res.data, null, 2) }] };
    },
  );
}
