/**
 * Protocol negotiation over the real stdio wiring (startStdio with an in-memory transport
 * instead of the process pipes).
 *
 * The production gateway (a Python MCP client) negotiates up to 2026-07-28; older
 * clients send 2025-11-25 or 2025-06-18. The 2025-era handshake is driven with raw JSON-RPC
 * so the requested protocolVersion is exactly what a real client sends. A client pinned to
 * 2026-07-28 (server/discover, per-request envelope) is served by the same entry. Every
 * revision must list the full production tool set (tests/fixtures/tool-contract.json).
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { Client, InMemoryTransport as ClientInMemoryTransport } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { startStdio } from "../../src/stdio.js";
import { loadConfig } from "../../src/config.js";
import { MAX_TOOL_INPUT_ELEMENTS } from "../../src/server.js";

type Msg = { id?: number; result?: Record<string, unknown>; error?: { code: number; message: string } };

const fixtureNames = (
  JSON.parse(readFileSync(new URL("../fixtures/tool-contract.json", import.meta.url), "utf8")) as {
    tools: Array<{ name: string }>;
  }
).tools.map((t) => t.name);

const cfg = loadConfig({
  SNIPEIT_API_TOKEN: "protocol-test",
  SNIPEIT_API_BASE: "https://snipeit.invalid/api/v1",
  SNIPEIT_LOG_LEVEL: "error",
});

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function legacyHandshake(protocolVersion: string): Promise<{ init: Msg; list: Msg }> {
  const [clientTx, serverTx] = InMemoryTransport.createLinkedPair();
  const handle = startStdio({ config: cfg, transport: serverTx });
  closers.push(() => handle.close());
  const waiting = new Map<number, (m: Msg) => void>();
  clientTx.onmessage = (m) => {
    const msg = m as Msg;
    if (typeof msg.id === "number") waiting.get(msg.id)?.(msg);
  };
  await clientTx.start();
  const send = (id: number, method: string, params: Record<string, unknown>): Promise<Msg> =>
    new Promise((resolve) => {
      waiting.set(id, resolve);
      void clientTx.send({ jsonrpc: "2.0", id, method, params });
    });
  const init = await send(1, "initialize", {
    protocolVersion,
    capabilities: {},
    clientInfo: { name: "protocol-test", version: "0.0.0" },
  });
  await clientTx.send({ jsonrpc: "2.0", method: "notifications/initialized" });
  const list = await send(2, "tools/list", {});
  return { init, list };
}

async function modernClient(): Promise<Client> {
  const [clientTx, serverTx] = ClientInMemoryTransport.createLinkedPair();
  const handle = startStdio({ config: cfg, transport: serverTx as never });
  const client = new Client(
    { name: "modern-test", version: "0.0.0" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
  await client.connect(clientTx);
  closers.push(async () => {
    await client.close();
    await handle.close();
  });
  return client;
}

describe("2025-era initialize keeps the client's revision", () => {
  for (const version of ["2025-06-18", "2025-11-25"]) {
    it(`accepts ${version} and lists every production tool`, async () => {
      const { init, list } = await legacyHandshake(version);
      expect(init.error).toBeUndefined();
      expect(init.result?.protocolVersion).toBe(version);
      expect(list.error).toBeUndefined();
      const names = new Set((list.result?.tools as Array<{ name: string }>).map((t) => t.name));
      expect(fixtureNames.filter((n) => !names.has(n))).toEqual([]);
    });
  }
});

describe("protocol revision 2026-07-28", () => {
  it("serves every production tool to a client pinned to 2026-07-28", async () => {
    const client = await modernClient();
    const names = new Set((await client.listTools()).tools.map((t) => t.name));
    expect(names.size).toBeGreaterThanOrEqual(fixtureNames.length);
    expect(fixtureNames.filter((n) => !names.has(n))).toEqual([]);
  });

  it("runs a guarded write as a preview without contacting Snipe-IT", async () => {
    const client = await modernClient();
    const r = await client.callTool({
      name: "snipeit_raw_request",
      arguments: { method: "DELETE", path: "/hardware/1" },
    });
    expect(r.isError ?? false).toBe(false);
    const text = (r.content as Array<{ type: string; text: string }>)[0]!.text;
    expect(text).toContain("confirm");
  });
});

describe("tool input size cap (GHSA-46jr-4wx8-v453)", () => {
  it("rejects arguments with more elements than MAX_TOOL_INPUT_ELEMENTS", async () => {
    const client = await modernClient();
    const big = Array.from({ length: MAX_TOOL_INPUT_ELEMENTS + 1 }, () => 0);
    const r = await client
      .callTool({
        name: "snipeit_raw_request",
        arguments: { method: "GET", path: "/hardware", query: { big } },
      })
      .then(
        (res) => ({ ok: true as const, res }),
        (err: unknown) => ({ ok: false as const, err }),
      );
    const message = r.ok
      ? (r.res.content as Array<{ text: string }>)[0]!.text
      : String((r.err as Error).message);
    expect(message).toContain("maximum of");
  });
});
