import type { McpServer } from "@modelcontextprotocol/server";
import type { ServerContext } from "../server.js";
import { maskResult } from "../tools/helpers.js";

/**
 * `snipeit://settings` reads GET /settings. The vendored Snipe-IT API spec has no such
 * endpoint (only /settings/backups), so on servers that do not serve it the resource
 * returns a JSON note with the error instead of failing the read. The URI stays so that
 * resources/list does not change.
 */
export function registerSettingsResource(server: McpServer, ctx: ServerContext): void {
  server.registerResource(
    "snipeit-settings",
    "snipeit://settings",
    {
      title: "Snipe-IT settings",
      description:
        "GET /settings: server configuration snapshot. Not part of the vendored Snipe-IT API spec; if the server does not serve it, the resource returns {error, note}.",
      mimeType: "application/json",
    },
    async (uri) => {
      let payload: unknown;
      try {
        payload = (await ctx.client.request("GET", "/settings")).data;
      } catch (err) {
        payload = {
          error: err instanceof Error ? err.message : String(err),
          note: "GET /settings is not part of the vendored Snipe-IT API spec (only /settings/backups is); this server may not serve it.",
        };
      }
      return {
        contents: [
          { uri: uri.href, mimeType: "application/json", text: JSON.stringify(maskResult(payload), null, 2) },
        ],
      };
    },
  );
}
