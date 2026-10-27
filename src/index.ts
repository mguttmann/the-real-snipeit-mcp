#!/usr/bin/env node
import { loadDotenv } from "./env.js";
import { startStdio } from "./stdio.js";

try {
  const dotenv = loadDotenv();
  startStdio({ dotenv });
} catch (err) {
  process.stderr.write(`fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
}
