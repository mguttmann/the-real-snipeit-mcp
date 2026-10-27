/**
 * Error paths through the tool layer (tests-06): every failure becomes an isError result
 * with the message and details.statusCode, for a hand-wrapper and a generated tool, and
 * the retry policy holds at the client (GET 5xx retried with backoff, POST 5xx not, 429
 * honours Retry-After).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { buildServer } from "../../src/server.js";
import { loadConfig } from "../../src/config.js";

type Reply = () => Promise<Response>;
const json =
  (body: unknown, status: number, headers: Record<string, string> = {}) =>
  () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json", ...headers },
      }),
    );
const text = (body: string, status: number) => () =>
  Promise.resolve(new Response(body, { status, headers: { "content-type": "text/html" } }));

let reply: Reply;
let fetchSpy: ReturnType<typeof vi.fn>;
let sleepSpy: ReturnType<typeof vi.fn>;
let client: Client;

beforeEach(async () => {
  const { server, ctx } = buildServer(
    loadConfig({
      SNIPEIT_API_TOKEN: "t",
      SNIPEIT_API_BASE: "https://snipeit.invalid/api/v1",
      SNIPEIT_LOG_LEVEL: "error",
      SNIPEIT_TIMEOUT_MS: "30",
    }),
  );
  fetchSpy = vi
    .fn()
    .mockImplementation((_url: string, init: RequestInit) =>
      reply === hang
        ? new Promise<Response>((_r, reject) =>
            init.signal?.addEventListener("abort", () =>
              reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
            ),
          )
        : reply(),
    );
  sleepSpy = vi.fn().mockResolvedValue(undefined);
  Object.assign((ctx.client as unknown as { opts: object }).opts, { fetch: fetchSpy, sleep: sleepSpy });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await server.connect(s);
  client = new Client({ name: "error-paths", version: "0" });
  await client.connect(c);
});

const hang: Reply = () => Promise.reject(new Error("unused"));

async function call(name: string, args: Record<string, unknown>) {
  const res = (await client.callTool({ name, arguments: args })) as {
    isError?: boolean;
    content: { text: string }[];
  };
  return {
    isError: res.isError,
    body: JSON.parse(res.content[0]!.text) as { error: string; details?: { statusCode?: number } },
  };
}

const readTools: [string, Record<string, unknown>][] = [
  ["snipeit_get_hardware_by_id", { id: 1 }],
  ["snipeit_gen_hardware_by_id", { id: 1 }],
];

describe.each(readTools)("%s error results", (tool, args) => {
  it("404 JSON -> isError with the message and statusCode 404, one request", async () => {
    reply = json({ messages: "Asset not found" }, 404);
    const r = await call(tool, args);
    expect(r.isError).toBe(true);
    expect(r.body.error).toMatch(/Asset not found/);
    expect(r.body.details?.statusCode).toBe(404);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("500 text on GET -> retried with 1 s and 2 s backoff, then isError with statusCode 500", async () => {
    reply = text("<html>boom</html>", 500);
    const r = await call(tool, args);
    expect(r.isError).toBe(true);
    expect(r.body.error).toMatch(/HTTP 500/);
    expect(r.body.details?.statusCode).toBe(500);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(sleepSpy.mock.calls.map((c) => c[0])).toEqual([1000, 2000]);
  });

  it("HTTP 200 with status:error -> isError, not retried", async () => {
    reply = json({ status: "error", messages: { asset_tag: ["taken"] }, payload: null }, 200);
    const r = await call(tool, args);
    expect(r.isError).toBe(true);
    expect(r.body.error).toMatch(/asset_tag: taken/);
    expect(r.body.details?.statusCode).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("429 with Retry-After -> waits the given time between attempts, then isError 429", async () => {
    reply = json({ messages: "Too Many Attempts." }, 429, { "retry-after": "7" });
    const r = await call(tool, args);
    expect(r.isError).toBe(true);
    expect(r.body.details?.statusCode).toBe(429);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(sleepSpy.mock.calls.map((c) => c[0])).toEqual([7000, 7000]);
  });

  it("timeout -> isError with statusCode 0, not retried", async () => {
    reply = hang;
    const r = await call(tool, args);
    expect(r.isError).toBe(true);
    expect(r.body.error).toMatch(/timeout 30ms/);
    expect(r.body.details?.statusCode).toBe(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("writes are never replayed on 5xx", () => {
  for (const [tool, args] of [
    ["snipeit_create_hardware", { body: { name: "x" }, confirm: "YES" }],
    ["snipeit_gen_hardware_create", { body: { asset_tag: "a", status_id: 1, model_id: 1 }, confirm: "YES" }],
  ] as const) {
    it(`${tool}: POST answered 502 -> one request, isError 502`, async () => {
      reply = text("bad gateway", 502);
      const r = await call(tool, args as unknown as Record<string, unknown>);
      expect(r.isError).toBe(true);
      expect(r.body.details?.statusCode).toBe(502);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect((fetchSpy.mock.calls[0]![1] as RequestInit).method).toBe("POST");
    });
  }
});
