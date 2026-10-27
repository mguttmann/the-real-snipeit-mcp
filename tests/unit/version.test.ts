/**
 * One version source: package.json. The lockfile root and the serverInfo the server
 * reports over MCP must match it (audit deps-sdk-06, docs-01, build-compat-7).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { buildServer } from "../../src/server.js";
import { loadConfig } from "../../src/config.js";
import { SERVER_NAME, SERVER_VERSION } from "../../src/constants.js";

const read = (rel: string) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const pkg = read("../../package.json") as { name: string; version: string };
const lock = read("../../package-lock.json") as {
  version: string;
  packages: Record<string, { version?: string }>;
};

describe("version", () => {
  it("lockfile root matches package.json", () => {
    expect(lock.version).toBe(pkg.version);
    expect(lock.packages[""]?.version).toBe(pkg.version);
  });

  it("SERVER_NAME and SERVER_VERSION come from package.json", () => {
    expect(SERVER_NAME).toBe(pkg.name);
    expect(SERVER_VERSION).toBe(pkg.version);
  });

  it("serverInfo over MCP reports the package version", async () => {
    const cfg = loadConfig({
      SNIPEIT_API_TOKEN: "version-test",
      SNIPEIT_API_BASE: "https://snipeit.invalid/api/v1",
    });
    const { server } = buildServer(cfg);
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const client = new Client({ name: "version-test", version: "0.0.0" });
    await client.connect(clientSide);
    try {
      expect(client.getServerVersion()).toMatchObject({ name: pkg.name, version: pkg.version });
    } finally {
      await client.close();
    }
  });
});
