import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server.js";
import { jsonResult, errorResult } from "./helpers.js";
import { SnipeitApiError } from "../client/errors.js";

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;

export function registerIdentityTools(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "snipeit_me",
    {
      title: "Who am I",
      description: "GET /users/me — returns the current authenticated user. Use to verify token + base URL.",
      inputSchema: {},
      annotations: readOnly,
    },
    async () => {
      try {
        const res = await ctx.client.request("GET", "/users/me", {});
        return jsonResult(res.data);
      } catch (err) {
        if (err instanceof SnipeitApiError) return errorResult(err.message, { statusCode: err.statusCode });
        throw err;
      }
    },
  );
}
