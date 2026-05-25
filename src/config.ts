/**
 * Configuration loading from environment variables, validated via Zod.
 *
 * All Snipe-IT MCP runtime config flows through {@link loadConfig}. The single
 * required variable is `SNIPEIT_API_TOKEN`; everything else has documented defaults.
 *
 * @module
 */
import { z } from "zod";
import { DEFAULT_API_BASE, DEFAULT_TIMEOUT_MS, DEFAULT_LOG_LEVEL } from "./constants.js";

const truthy = new Set(["true", "1", "yes"]);
const parseBool = (v: string | undefined, dflt = false): boolean => {
  if (v === undefined) return dflt;
  return truthy.has(v.trim().toLowerCase());
};

const ConfigSchema = z.object({
  apiToken: z.string().min(1),
  apiBase: z.string().url().default(DEFAULT_API_BASE),
  confirmWrites: z.boolean().default(false),
  timeoutMs: z.number().int().positive().default(DEFAULT_TIMEOUT_MS),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default(DEFAULT_LOG_LEVEL),
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
 * - `SNIPEIT_API_BASE` (default `https://snipe-it.example.com/api/v1`)
 * - `SNIPEIT_CONFIRM_WRITES` (truthy: `true|1|yes`, case-insensitive)
 * - `SNIPEIT_TIMEOUT_MS` (positive integer)
 * - `SNIPEIT_LOG_LEVEL` (`debug|info|warn|error`)
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
    if (!Number.isFinite(n) || n <= 0)
      fieldError("SNIPEIT_TIMEOUT_MS", `expected positive number, got "${timeoutRaw}"`);
    timeoutMs = n;
  }

  const logLevel = (env.SNIPEIT_LOG_LEVEL ?? DEFAULT_LOG_LEVEL).trim();
  if (!["debug", "info", "warn", "error"].includes(logLevel))
    fieldError("SNIPEIT_LOG_LEVEL", `expected debug|info|warn|error, got "${logLevel}"`);

  const apiBase = env.SNIPEIT_API_BASE?.trim() || DEFAULT_API_BASE;

  return ConfigSchema.parse({
    apiToken,
    apiBase,
    confirmWrites: parseBool(env.SNIPEIT_CONFIRM_WRITES, false),
    timeoutMs,
    logLevel,
  });
}
