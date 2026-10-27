/**
 * Stdio entry wiring.
 *
 * `serveStdio` decides the protocol era from the client's opening message: an
 * `initialize` request (2025-11-25, 2025-06-18 and older revisions) pins the connection to
 * a 2025-era instance served exactly like a hand-wired `server.connect`; a 2026-07-28
 * opening (`server/discover`, per-request envelope) gets a modern instance. Every instance
 * comes from the same factory and shares one context (config, logger, Snipe-IT client).
 *
 * Inbound stdio limit: the SDK's StdioServerTransport buffers at most 10 MiB
 * (STDIO_DEFAULT_MAX_BUFFER_SIZE) of unparsed input; a larger message closes the
 * transport. Outbound messages are not limited by the server; tool results are capped by
 * SNIPEIT_MAX_RESULT_BYTES instead.
 *
 * @module
 */
import { serveStdio, type StdioServerHandle } from "@modelcontextprotocol/server/stdio";
import type { Transport } from "@modelcontextprotocol/server";
import { buildServer, createContext } from "./server.js";
import { logConfigWarnings, logGuardState, type Config } from "./config.js";
import type { DotenvResult } from "./env.js";

export interface StartStdioOptions {
  /** Config to use instead of `loadConfig()` (tests). */
  config?: Config;
  /** Transport to use instead of the process pipes (tests). */
  transport?: Transport;
  /** What `loadDotenv` added, logged once at startup (names only). */
  dotenv?: DotenvResult;
}

/** Serve MCP over stdio (or over `options.transport`) for every supported protocol revision. */
export function startStdio(options: StartStdioOptions = {}): StdioServerHandle {
  const ctx = createContext(options.config);
  const handle = serveStdio(() => buildServer(ctx).server, {
    legacy: "serve",
    ...(options.transport ? { transport: options.transport } : {}),
    onerror: (error) => ctx.logger.warn("stdio transport error", { error: error.message }),
  });
  ctx.logger.info("snipeit-mcp connected (stdio)");
  if (options.dotenv && options.dotenv.keys.length > 0) {
    ctx.logger.info(`loaded ${options.dotenv.keys.length} variable(s) from ${options.dotenv.path}`, {
      keys: options.dotenv.keys,
    });
  }
  logConfigWarnings(ctx.cfg, ctx.logger);
  logGuardState(ctx.cfg, ctx.logger);
  return handle;
}
