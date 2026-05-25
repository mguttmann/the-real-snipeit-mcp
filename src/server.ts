/**
 * Build the MCP server instance and register every tool, resource, and prompt.
 *
 * The registration order matters: `snipeit_raw_request` is registered first as
 * a stable escape hatch, then hand-wrappers (which provide friendlier UX for
 * common workflows), then the auto-generated `snipeit_gen_*` layer, then
 * resources, then prompts.
 *
 * @module
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SnipeitClient } from "./client/snipeitClient.js";
import { loadConfig, type Config } from "./config.js";
import { createLogger, type Logger } from "./utils/logger.js";
import { SERVER_NAME, SERVER_VERSION } from "./constants.js";
import { registerRawRequestTool } from "./tools/rawRequest.js";
import { registerIdentityTools } from "./tools/identity.js";
import { registerHardwareTools } from "./tools/hardware.js";
import { registerUsersTools } from "./tools/users.js";
import { registerLicensesTools } from "./tools/licenses.js";
import { registerAccessoriesTools } from "./tools/accessories.js";
import { registerConsumablesTools } from "./tools/consumables.js";
import { registerComponentsTools } from "./tools/components.js";
import { registerLocationsTools } from "./tools/locations.js";
import { registerStatusLabelsTools } from "./tools/statuslabels.js";
import { registerMaintenancesTools } from "./tools/maintenances.js";
import { registerBulkTools } from "./tools/bulk.js";
import { registerGeneratedTools } from "./tools/generated/index.js";
import { registerResources } from "./resources/index.js";
import { registerPrompts } from "./prompts/index.js";

/**
 * Shared per-server context passed to every tool/resource registration.
 * Tools should never read process.env or instantiate clients directly — they take
 * everything they need from this object.
 */
export interface ServerContext {
  cfg: Config;
  logger: Logger;
  client: SnipeitClient;
}

/**
 * Construct a fully-wired `McpServer` plus its `ServerContext`.
 *
 * @param overrideCfg - Optional config override (for tests). Defaults to `loadConfig()`,
 *                      which reads from `process.env`.
 * @returns `{ server, ctx }` — pass the server to a transport (e.g. `StdioServerTransport`)
 *          and call `await server.connect(transport)` to start serving.
 */
export function buildServer(overrideCfg?: Config): { server: McpServer; ctx: ServerContext } {
  const cfg = overrideCfg ?? loadConfig();
  const logger = createLogger(cfg.logLevel);
  const client = new SnipeitClient(cfg, logger);
  const ctx: ServerContext = { cfg, logger, client };

  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions: [
        "## Snipe-IT MCP",
        "Access to the Snipe-IT REST API (read + write).",
        "Three tool layers (all callable):",
        "- `snipeit_*` — hand-wrappers with friendlier UX for common workflows (hardware, users, licenses, checkout/checkin, audits).",
        "- `snipeit_gen_*` — auto-generated from the OpenAPI spec, 100% endpoint coverage.",
        "- `snipeit_raw_request` — escape hatch for any method/path.",
        "## Write safety",
        "- Tools that modify state are marked `destructiveHint: true`.",
        "- If `SNIPEIT_CONFIRM_WRITES=true` is set, destructive tools return a preview unless called with `confirm: \"YES\"`.",
        "## Errors",
        "- Snipe-IT may return HTTP 200 with `{\"status\":\"error\"}`. The server detects this and surfaces the messages as a tool error.",
      ].join("\n"),
    },
  );

  registerRawRequestTool(server, ctx);
  registerIdentityTools(server, ctx);
  registerHardwareTools(server, ctx);
  registerUsersTools(server, ctx);
  registerLicensesTools(server, ctx);
  registerAccessoriesTools(server, ctx);
  registerConsumablesTools(server, ctx);
  registerComponentsTools(server, ctx);
  registerLocationsTools(server, ctx);
  registerStatusLabelsTools(server, ctx);
  registerMaintenancesTools(server, ctx);
  registerBulkTools(server, ctx);
  registerGeneratedTools(server, ctx);
  registerResources(server, ctx);
  registerPrompts(server);
  return { server, ctx };
}
