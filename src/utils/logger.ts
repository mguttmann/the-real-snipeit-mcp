/**
 * Stderr-only logger with secret redaction.
 *
 * Stdio MCP transport reserves `stdout` for the JSON-RPC protocol, so all log output
 * must go to `stderr`. Before emission, every line is run through {@link redactSecrets}
 * to scrub Bearer tokens, JWTs, `Authorization` headers, and `api_token` fields.
 *
 * @module
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(msg: string, ctx?: unknown): void;
  info(msg: string, ctx?: unknown): void;
  warn(msg: string, ctx?: unknown): void;
  error(msg: string, ctx?: unknown): void;
}

const SECRET_PATTERNS: { re: RegExp; replace: string }[] = [
  { re: /(SNIPEIT_API_TOKEN\s*=\s*)([^\s"&]+)/gi, replace: "$1***REDACTED***" },
  { re: /("Authorization"\s*:\s*")([^"]+)(")/gi, replace: "$1***REDACTED***$3" },
  { re: /("api_token"\s*:\s*")([^"]+)(")/gi, replace: "$1***REDACTED***$3" },
  { re: /(Bearer\s+)[A-Za-z0-9._-]+/g, replace: "$1***REDACTED***" },
  { re: /eyJ[A-Za-z0-9._-]{20,}/g, replace: "***REDACTED-JWT***" },
];

/**
 * Apply all secret-redaction patterns to a string and return the cleaned result.
 *
 * Patterns covered:
 * - `SNIPEIT_API_TOKEN=<value>` (env-file shape)
 * - `"Authorization": "<value>"` (HTTP header JSON)
 * - `"api_token": "<value>"` (Snipe-IT body field)
 * - `Bearer <token>` (Authorization scheme prefix)
 * - Bare JWT-shaped strings starting with `eyJ` (20+ char tail)
 *
 * Idempotent — safe to call multiple times.
 */
export function redactSecrets(input: string): string {
  let out = input;
  for (const { re, replace } of SECRET_PATTERNS) out = out.replace(re, replace);
  return out;
}

function format(level: LogLevel, msg: string, ctx?: unknown): string {
  const ts = new Date().toISOString();
  let line = `${ts} ${level} ${msg}`;
  if (ctx !== undefined) {
    let ctxStr: string;
    try {
      ctxStr = typeof ctx === "string" ? ctx : JSON.stringify(ctx);
    } catch {
      ctxStr = String(ctx);
    }
    line += ` ${ctxStr}`;
  }
  return redactSecrets(line) + "\n";
}

/**
 * Build a `Logger` instance that writes to `stderr` at or above the given level.
 * All output is passed through {@link redactSecrets} before being emitted.
 *
 * @param level - Minimum level to emit. Defaults to `"info"`. Set to `"debug"` to see every HTTP request.
 */
export function createLogger(level: LogLevel = "info"): Logger {
  const threshold = LEVEL_RANK[level];
  const emit = (lvl: LogLevel, msg: string, ctx?: unknown) => {
    if (LEVEL_RANK[lvl] < threshold) return;
    process.stderr.write(format(lvl, msg, ctx));
  };
  return {
    debug: (m, c) => emit("debug", m, c),
    info: (m, c) => emit("info", m, c),
    warn: (m, c) => emit("warn", m, c),
    error: (m, c) => emit("error", m, c),
  };
}
