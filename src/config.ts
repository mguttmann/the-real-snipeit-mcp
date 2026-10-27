/**
 * Configuration loading from environment variables, validated via Zod.
 *
 * All Snipe-IT MCP runtime config flows through {@link loadConfig}. The single
 * required variable is `SNIPEIT_API_TOKEN`; everything else has documented defaults.
 *
 * @module
 */
import { z } from "zod";
import type { Logger } from "./utils/logger.js";
import {
  DEFAULT_API_BASE,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_LOG_LEVEL,
  DEFAULT_MAX_RESULT_BYTES,
  MIN_MAX_RESULT_BYTES,
  MAX_RESULT_BYTES_WARN,
} from "./constants.js";

const GUARD_OFF = new Set(["false", "0", "no", "off"]);
const GUARD_ON = new Set(["true", "1", "yes", "on"]);

/**
 * Parse `SNIPEIT_CONFIRM_WRITES` fail-closed: only `false|0|no|off` (trimmed, any case)
 * disable the write guard. Unset or a recognised truthy value keeps it on silently; an
 * empty or unrecognised value keeps it on and returns a warning for the operator.
 */
function parseConfirmWrites(raw: string | undefined): { enabled: boolean; warning?: string } {
  if (raw === undefined) return { enabled: true };
  const v = raw.trim().toLowerCase();
  if (GUARD_OFF.has(v)) return { enabled: false };
  if (GUARD_ON.has(v)) return { enabled: true };
  return {
    enabled: true,
    warning: `SNIPEIT_CONFIRM_WRITES=${JSON.stringify(raw.slice(0, 32))} is not recognised; the write guard stays on (use false|0|no|off to disable)`,
  };
}

/**
 * Parse an optional on/off switch that defaults to off. Unset or empty means off;
 * `true|1|yes|on` and `false|0|no|off` (trimmed, any case) are recognised; anything else
 * turns the switch ON (the safer side for every switch parsed here) and returns a warning.
 */
function parseSwitch(name: string, raw: string | undefined): { enabled: boolean; warning?: string } {
  const v = raw?.trim().toLowerCase() ?? "";
  if (v === "" || GUARD_OFF.has(v)) return { enabled: false };
  if (GUARD_ON.has(v)) return { enabled: true };
  return {
    enabled: true,
    warning: `${name}=${JSON.stringify((raw ?? "").slice(0, 32))} is not recognised; treated as on (use true|false)`,
  };
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Warnings for a SNIPEIT_API_BASE that starts but is unsafe or cannot work. Nothing is
 * rejected here (a deployment that starts today keeps starting); credentials are never
 * echoed. `undefined` means the variable is unset and the placeholder default is used.
 */
function apiBaseWarnings(raw: string | undefined): string[] {
  if (raw === undefined) {
    return [
      `SNIPEIT_API_BASE is not set; using the placeholder ${DEFAULT_API_BASE}, so every call fails until it is set`,
    ];
  }
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return []; // the schema below rejects it with "Invalid config"
  }
  const out: string[] = [];
  if (u.protocol === "http:") {
    if (!LOOPBACK_HOSTS.has(u.hostname) && !u.hostname.startsWith("127.")) {
      out.push(`SNIPEIT_API_BASE uses http to ${u.hostname}: the API token travels in cleartext; use https`);
    }
  } else if (u.protocol !== "https:") {
    out.push(`SNIPEIT_API_BASE uses the scheme ${u.protocol} which this client cannot call; use https`);
  }
  if (u.username || u.password) {
    out.push("SNIPEIT_API_BASE contains credentials (user:password@); requests with them fail, remove them");
  }
  if (u.search || u.hash) {
    out.push(
      "SNIPEIT_API_BASE has a query or fragment; requests will not reach the intended paths, remove it",
    );
  }
  return out;
}

const ConfigSchema = z.object({
  apiToken: z.string().min(1),
  apiBase: z.string().url().default(DEFAULT_API_BASE),
  confirmWrites: z.boolean().default(true),
  confirmWritesWarning: z.string().optional(),
  timeoutMs: z.number().int().positive().default(DEFAULT_TIMEOUT_MS),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default(DEFAULT_LOG_LEVEL),
  maxResultBytes: z.number().int().min(MIN_MAX_RESULT_BYTES).default(DEFAULT_MAX_RESULT_BYTES),
  callDeadlineMs: z.number().int().min(0).default(0),
  redactPii: z.boolean().default(false),
  readOnly: z.boolean().default(false),
  requirePreview: z.boolean().default(false),
  /** Startup warnings other than the write guard's (logged once by `logConfigWarnings`). */
  warnings: z.array(z.string()).default([]),
});

export type Config = z.infer<typeof ConfigSchema>;

function fieldError(field: string, msg: string): never {
  throw new Error(`Invalid config for ${field}: ${msg}`);
}

/**
 * Read, validate, and normalize the runtime configuration from process environment.
 *
 * Required: `SNIPEIT_API_TOKEN`. Throws `Error("Invalid config for SNIPEIT_API_TOKEN: ...")`
 * if missing or empty.
 *
 * Optional (with defaults):
 * - `SNIPEIT_API_BASE` (default `https://snipe-it.example.com/api/v1`; the default, http to a
 *   non-loopback host, other schemes, credentials, a query or a fragment add a warning)
 * - `SNIPEIT_CONFIRM_WRITES` (default on; only `false|0|no|off`, trimmed and case-insensitive, disable the
 *   write guard; empty or unrecognised values keep it on and set `confirmWritesWarning`)
 * - `SNIPEIT_TIMEOUT_MS` (positive integer, ms)
 * - `SNIPEIT_LOG_LEVEL` (`debug|info|warn|error`)
 * - `SNIPEIT_MAX_RESULT_BYTES` (integer >= 65536, default 1048576): cap for one tool result
 * - `SNIPEIT_CALL_DEADLINE_MS` (integer >= 0, default 0 = none): overall deadline for one
 *   tool call, across retries, backoffs and `all: true` pagination
 * - `SNIPEIT_REDACT_PII` (switch, default off): mask personal data in tool results
 * - `SNIPEIT_READ_ONLY` (switch, default off): refuse every write at runtime
 * - `SNIPEIT_REQUIRE_PREVIEW` (switch, default off): `confirm: "YES"` executes only after a
 *   preview of the identical request (needs the write guard on)
 *
 * @param env - Defaults to `process.env`; pass a custom object for testing.
 * @throws Error with a message starting with `Invalid config for <FIELD>` on any validation failure.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const apiToken = env.SNIPEIT_API_TOKEN?.trim();
  if (!apiToken) fieldError("SNIPEIT_API_TOKEN", "missing or empty");

  const timeoutRaw = env.SNIPEIT_TIMEOUT_MS?.trim();
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  if (timeoutRaw) {
    const n = Number(timeoutRaw);
    if (!Number.isSafeInteger(n) || n <= 0)
      fieldError("SNIPEIT_TIMEOUT_MS", `expected a positive integer (ms), got "${timeoutRaw}"`);
    timeoutMs = n;
  }

  const logLevel = (env.SNIPEIT_LOG_LEVEL ?? DEFAULT_LOG_LEVEL).trim();
  if (!["debug", "info", "warn", "error"].includes(logLevel))
    fieldError("SNIPEIT_LOG_LEVEL", `expected debug|info|warn|error, got "${logLevel}"`);

  const apiBase = env.SNIPEIT_API_BASE?.trim() || DEFAULT_API_BASE;
  const warnings: string[] = apiBaseWarnings(env.SNIPEIT_API_BASE?.trim() ? apiBase : undefined);

  const maxRaw = env.SNIPEIT_MAX_RESULT_BYTES?.trim();
  let maxResultBytes = DEFAULT_MAX_RESULT_BYTES;
  if (maxRaw) {
    const n = Number(maxRaw);
    if (!/^\d+$/.test(maxRaw) || !Number.isSafeInteger(n) || n < MIN_MAX_RESULT_BYTES)
      fieldError(
        "SNIPEIT_MAX_RESULT_BYTES",
        `expected an integer >= ${MIN_MAX_RESULT_BYTES}, got "${maxRaw}"`,
      );
    maxResultBytes = n;
  }

  const deadlineRaw = env.SNIPEIT_CALL_DEADLINE_MS?.trim();
  let callDeadlineMs = 0;
  if (deadlineRaw) {
    const n = Number(deadlineRaw);
    if (!/^\d+$/.test(deadlineRaw) || !Number.isSafeInteger(n))
      fieldError(
        "SNIPEIT_CALL_DEADLINE_MS",
        `expected an integer >= 0 (0 = no deadline), got "${deadlineRaw}"`,
      );
    callDeadlineMs = n;
  }

  if (maxResultBytes > MAX_RESULT_BYTES_WARN) {
    warnings.push(
      `SNIPEIT_MAX_RESULT_BYTES=${maxResultBytes} is close to or above the 10 MiB message limit of TypeScript SDK clients; ` +
        `such clients can drop large results (keep it at ${MAX_RESULT_BYTES_WARN} or below)`,
    );
  }

  const guard = parseConfirmWrites(env.SNIPEIT_CONFIRM_WRITES);
  const pii = parseSwitch("SNIPEIT_REDACT_PII", env.SNIPEIT_REDACT_PII);
  if (pii.warning) warnings.push(pii.warning);
  const readOnly = parseSwitch("SNIPEIT_READ_ONLY", env.SNIPEIT_READ_ONLY);
  if (readOnly.warning) warnings.push(readOnly.warning);
  const requirePreview = parseSwitch("SNIPEIT_REQUIRE_PREVIEW", env.SNIPEIT_REQUIRE_PREVIEW);
  if (requirePreview.warning) warnings.push(requirePreview.warning);
  if (requirePreview.enabled && !guard.enabled) {
    warnings.push(
      "SNIPEIT_REQUIRE_PREVIEW has no effect while SNIPEIT_CONFIRM_WRITES disables the write guard",
    );
  }

  return ConfigSchema.parse({
    apiToken,
    apiBase,
    confirmWrites: guard.enabled,
    confirmWritesWarning: guard.warning,
    timeoutMs,
    logLevel,
    maxResultBytes,
    callDeadlineMs,
    redactPii: pii.enabled,
    readOnly: readOnly.enabled,
    requirePreview: requirePreview.enabled,
    warnings,
  });
}

/**
 * Log the effective write guard state (info) and, if the env value was not recognised,
 * the parse warning (warn). Call once at process startup; all output goes to stderr.
 */
export function logGuardState(cfg: Config, logger: Pick<Logger, "info" | "warn">): void {
  if (cfg.confirmWritesWarning) logger.warn(cfg.confirmWritesWarning);
  if (cfg.readOnly) logger.info("read-only mode: on (SNIPEIT_READ_ONLY; every write tool is refused)");
  if (cfg.requirePreview && cfg.confirmWrites) {
    logger.info(
      'preview binding: on (SNIPEIT_REQUIRE_PREVIEW; confirm: "YES" needs a preview of the same request first)',
    );
  }
  logger.info(
    cfg.confirmWrites
      ? 'write guard: on (destructive tools need confirm: "YES")'
      : "write guard: off (SNIPEIT_CONFIRM_WRITES disables it; destructive tools execute directly)",
  );
}

/** Log every startup warning collected by `loadConfig` (other than the write guard's) at warn. */
export function logConfigWarnings(cfg: Config, logger: Pick<Logger, "warn">): void {
  for (const w of cfg.warnings ?? []) logger.warn(w);
}
