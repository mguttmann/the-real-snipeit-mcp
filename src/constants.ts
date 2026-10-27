import { readFileSync } from "node:fs";

export const DEFAULT_API_BASE = "https://snipe-it.example.com/api/v1";
export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_LOG_LEVEL = "info" as const;

/** Default cap for one tool result (serialized JSON text), in bytes: 1 MiB. */
export const DEFAULT_MAX_RESULT_BYTES = 1_048_576;
/** Lowest accepted SNIPEIT_MAX_RESULT_BYTES: 64 KiB. */
export const MIN_MAX_RESULT_BYTES = 65_536;
/** SNIPEIT_MAX_RESULT_BYTES above this logs a startup warning (TS SDK clients read at most 10 MiB per message). */
export const MAX_RESULT_BYTES_WARN = 8 * 1_048_576;
/** Hard bound on one HTTP response body read: max(4 x result cap, this floor). */
export const MIN_MAX_BODY_BYTES = 16 * 1_048_576;

/** Upper bound on bytes buffered from a single response body for a given result cap. */
export function maxBodyBytes(maxResultBytes: number): number {
  return Math.max(4 * maxResultBytes, MIN_MAX_BODY_BYTES);
}

/**
 * Name and version come from package.json, the single version source (one level above
 * both src/ and dist/). `npm version` updates it together with the lockfile.
 */
const PACKAGE = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  name: string;
  version: string;
};
export const SERVER_NAME: string = PACKAGE.name;
export const SERVER_VERSION: string = PACKAGE.version;

export const PAGINATION = {
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 500,
  AUTO_PAGINATE_PAGE_SIZE: 200,
  AUTO_PAGINATE_MAX_ROWS: 10_000,
};

export const RETRY = {
  MAX_ATTEMPTS: 3,
  BACKOFF_MS: [1000, 2000, 4000] as const,
  RETRY_AFTER_CEILING_MS: 60_000,
};
