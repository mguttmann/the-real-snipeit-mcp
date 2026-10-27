/**
 * Gateway tool contract.
 *
 * The production MCP gateway prefixes and caches our tool names and aborts a deploy
 * when the tool count drops. This test lists the tools of an in-process server over the
 * real MCP protocol and compares them with the committed fixture
 * tests/fixtures/tool-contract.json (generated from the production tools/list by
 * scripts/tool-contract-fixture.mjs). Every fixture tool must still exist with the same
 * required parameters, top-level defaults and annotations. New tools are allowed.
 */
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { describe, expect, it, beforeAll } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { buildServer } from "../../src/server.js";
import { loadConfig } from "../../src/config.js";

interface ContractTool {
  name: string;
  required: string[];
  defaults: Record<string, unknown>;
  annotations: Record<string, unknown> | null;
}

interface ListedTool {
  name: string;
  inputSchema: { required?: string[]; properties?: Record<string, { default?: unknown }> };
  annotations?: Record<string, unknown>;
}

const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/tool-contract.json", import.meta.url), "utf8"),
) as { tools: ContractTool[] };

function toContract(t: ListedTool): ContractTool {
  const defaults: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(t.inputSchema.properties ?? {})) {
    if (prop && typeof prop === "object" && "default" in prop) defaults[key] = prop.default;
  }
  return {
    name: t.name,
    required: [...(t.inputSchema.required ?? [])].sort(),
    defaults,
    annotations: t.annotations ?? null,
  };
}

describe("tool contract (gateway)", () => {
  let listed: Map<string, ContractTool>;

  beforeAll(async () => {
    const cfg = loadConfig({
      SNIPEIT_API_TOKEN: "contract-test",
      SNIPEIT_API_BASE: "https://snipeit.invalid/api/v1",
    });
    const { server } = buildServer(cfg);
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const client = new Client({ name: "tool-contract-test", version: "0.0.0" });
    await client.connect(clientSide);
    const { tools } = await client.listTools();
    listed = new Map((tools as ListedTool[]).map((t) => [t.name, toContract(t)]));
    await client.close();
  });

  it("fixture holds the production tool set", () => {
    expect(fixture.tools.length).toBeGreaterThanOrEqual(183);
  });

  it("does not drop below the production tool count", () => {
    expect(listed.size).toBeGreaterThanOrEqual(fixture.tools.length);
  });

  it("keeps every production tool name", () => {
    const missing = fixture.tools.map((t) => t.name).filter((n) => !listed.has(n));
    expect(missing).toEqual([]);
  });

  it("keeps required parameters, defaults and annotations per tool", () => {
    const drift = fixture.tools
      .filter((t) => listed.has(t.name))
      .map((t) => ({ expected: t, actual: listed.get(t.name)! }))
      .filter(({ expected, actual }) => !isDeepStrictEqual(expected, actual));
    expect(drift).toEqual([]);
  });
});
