/**
 * Every tool call runs in a call scope: MCP cancellation reaches the HTTP request of any
 * tool, and the optional SNIPEIT_CALL_DEADLINE_MS bounds a whole call (sec-input-5).
 */
import { describe, expect, it, vi } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { buildServer } from "../../src/server.js";
import { loadConfig } from "../../src/config.js";
import { callList } from "../../src/tools/helpers.js";
import { runInCallScope } from "../../src/client/callScope.js";
import { SnipeitApiError } from "../../src/client/errors.js";
import type { SnipeitClient } from "../../src/client/snipeitClient.js";

const env = {
  SNIPEIT_API_TOKEN: "t",
  SNIPEIT_API_BASE: "https://snipeit.invalid/api/v1",
  SNIPEIT_LOG_LEVEL: "error",
};

async function connect(server: ReturnType<typeof buildServer>["server"]) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "call-scope-test", version: "0.0.0" });
  await client.connect(clientSide);
  return client;
}

describe("SNIPEIT_CALL_DEADLINE_MS", () => {
  it("is optional, defaults to 0 (no overall deadline) and must be a non-negative integer", () => {
    expect(loadConfig(env).callDeadlineMs).toBe(0);
    expect(loadConfig({ ...env, SNIPEIT_CALL_DEADLINE_MS: "120000" }).callDeadlineMs).toBe(120_000);
    expect(loadConfig({ ...env, SNIPEIT_CALL_DEADLINE_MS: "" }).callDeadlineMs).toBe(0);
    for (const bad of ["-1", "1.5", "abc", "1e400"]) {
      expect(() => loadConfig({ ...env, SNIPEIT_CALL_DEADLINE_MS: bad })).toThrow(
        /Invalid config for SNIPEIT_CALL_DEADLINE_MS/,
      );
    }
  });
});

describe("call scope wiring", () => {
  it("a client-side cancel aborts the HTTP request of an ordinary read tool", async () => {
    const { server, ctx } = buildServer(loadConfig(env));
    let seen: AbortSignal | undefined;
    const fetchSpy = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          seen = init.signal ?? undefined;
          init.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        }),
    );
    (ctx.client as unknown as { opts: { fetch: typeof fetch } }).opts.fetch = fetchSpy;
    const client = await connect(server);
    const controller = new AbortController();
    const call = client.callTool(
      { name: "snipeit_get_hardware_by_id", arguments: { id: 1 } },
      { signal: controller.signal },
    );
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    controller.abort();
    await expect(call).rejects.toThrow();
    await vi.waitFor(() => expect(seen?.aborted).toBe(true));
    await client.close();
  });

  it("the deadline ends a hanging call with a DEADLINE_EXCEEDED tool error", async () => {
    const { server, ctx } = buildServer(
      loadConfig({ ...env, SNIPEIT_CALL_DEADLINE_MS: "50", SNIPEIT_TIMEOUT_MS: "10000" }),
    );
    (ctx.client as unknown as { opts: { fetch: typeof fetch } }).opts.fetch = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        }),
    );
    const client = await connect(server);
    const res = (await client.callTool({ name: "snipeit_get_hardware_by_id", arguments: { id: 1 } })) as {
      isError?: boolean;
      content: { text: string }[];
    };
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toMatch(/SNIPEIT_CALL_DEADLINE_MS/);
    await client.close();
  });
});

describe("callList all:true and the deadline", () => {
  it("returns the rows fetched so far with truncated and next_offset when the deadline hits mid-way", async () => {
    let calls = 0;
    const request = vi
      .fn()
      .mockImplementation(async (_m: string, _p: string, opts: { query: { offset: number } }) => {
        calls++;
        if (calls === 3) {
          throw new SnipeitApiError({ statusCode: 0, code: "DEADLINE_EXCEEDED", message: "deadline" });
        }
        const rows = Array.from({ length: 200 }, (_, i) => ({ id: opts.query.offset + i }));
        return { data: { total: 1000, rows }, status: 200, headers: new Headers() };
      });
    const out = await callList({ request } as unknown as SnipeitClient, "/hardware", { all: true });
    expect(out.data.rows).toHaveLength(400);
    expect(out.data.truncated).toBe(true);
    expect(out.data.next_offset).toBe(400);
    expect(out.data.total).toBe(1000);
  });

  it("a deadline before the first page still surfaces as an error", async () => {
    const request = vi
      .fn()
      .mockRejectedValue(
        new SnipeitApiError({ statusCode: 0, code: "DEADLINE_EXCEEDED", message: "deadline" }),
      );
    await expect(
      callList({ request } as unknown as SnipeitClient, "/hardware", { all: true }),
    ).rejects.toThrow(/deadline/);
  });

  it("runInCallScope without a deadline or signal leaves requests unbounded", async () => {
    const fn = vi.fn().mockResolvedValue(1);
    await expect(runInCallScope({}, fn)).resolves.toBe(1);
  });
});
