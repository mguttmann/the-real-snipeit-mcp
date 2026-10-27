/**
 * Optional `.env` loading for standalone use.
 *
 * Production starts the server with `node --env-file=<repo>/.env`, which Node handles
 * itself. For standalone users the server still reads a `.env` from the working directory
 * (or `DOTENV_CONFIG_PATH`), as `import "dotenv/config"` did, without overriding variables
 * that are already set. Two differences: dotenv can never write to stdout (stdout carries
 * the stdio JSON-RPC stream; `DOTENV_CONFIG_DEBUG` and `DOTENV_CONFIG_QUIET` are ignored and
 * any dotenv message goes to stderr), and the names of the variables it added are returned
 * so the server logs them at startup instead of merging them in silently.
 *
 * @module
 */
import { resolve } from "node:path";
import { config } from "dotenv";

export interface DotenvResult {
  /** Absolute path of the file that was read (or would have been). */
  path: string;
  /** Names of the variables the file added; never values. */
  keys: string[];
}

/** Load `.env` (default: `DOTENV_CONFIG_PATH` or `./.env`) into `process.env` without touching stdout. */
export function loadDotenv(path?: string): DotenvResult {
  const file = resolve(path ?? process.env.DOTENV_CONFIG_PATH ?? ".env");
  const before = new Set(Object.keys(process.env));
  const log = console.log;
  // dotenv prints its warnings with console.log; send anything it says to stderr instead.
  console.log = (...args: unknown[]) => {
    process.stderr.write(args.map(String).join(" ") + "\n");
  };
  let parsed: Record<string, string> | undefined;
  try {
    const encoding = process.env.DOTENV_CONFIG_ENCODING as BufferEncoding | undefined;
    const override = /^(true|1|yes)$/i.test(process.env.DOTENV_CONFIG_OVERRIDE ?? "");
    parsed = config({
      path: file,
      quiet: true,
      debug: false,
      override,
      ...(encoding ? { encoding } : {}),
    }).parsed;
  } finally {
    console.log = log;
  }
  const keys = Object.keys(parsed ?? {}).filter((k) => !before.has(k));
  return { path: file, keys };
}
