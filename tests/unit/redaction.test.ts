/**
 * Redaction gaps (sec-output-06), secrets end to end (tests-10) and opt-in PII masking
 * (sec-output-07).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { redactSecrets, createLogger } from "../../src/utils/logger.js";
import { SnipeitApiError, parseApiError } from "../../src/client/errors.js";
import { SnipeitClient } from "../../src/client/snipeitClient.js";
import { errorResult, jsonResult, maskPii, setRedactPii } from "../../src/tools/helpers.js";
import { buildServer } from "../../src/server.js";
import { loadConfig } from "../../src/config.js";

const SENTINEL = "SENTINELtok3n9876";

afterEach(() => setRedactPii(false));

describe("redactSecrets covers the reported gaps", () => {
  const cases: [string, string][] = [
    ["api_token in a query string", `GET /hardware?limit=1&api_token=${SENTINEL}&x=1`],
    ["token in a query string", `https://h/api?token=${SENTINEL}`],
    ["URL userinfo", `https://admin:${SENTINEL}@snipe.example/api/v1`],
    ["URL userinfo without password", `https://${SENTINEL}@snipe.example/api/v1`],
    ["password JSON field", `{"password":"${SENTINEL}"}`],
    ["escaped JSON api_token", `{\\"api_token\\":\\"${SENTINEL}\\"}`],
    ["non-Bearer Authorization header", `Authorization: Token ${SENTINEL}`],
    ["Authorization header in a plain text echo", `authorization=Basic ${SENTINEL}`],
  ];
  for (const [name, input] of cases) {
    it(name, () => {
      const out = redactSecrets(input);
      expect(out).not.toContain(SENTINEL);
      expect(out).toContain("REDACTED");
      expect(redactSecrets(out)).toBe(out);
    });
  }

  it("leaves ordinary text alone", () => {
    const text = "name: The name field is required.; password: must be 8 characters";
    expect(redactSecrets(text)).toBe(text);
    expect(redactSecrets("https://snipe.example/api/v1/hardware?limit=5")).toBe(
      "https://snipe.example/api/v1/hardware?limit=5",
    );
  });
});

describe("error texts returned to the model are redacted", () => {
  it("SnipeitApiError redacts its message", () => {
    const e = new SnipeitApiError({
      statusCode: 502,
      message: `upstream echoed Authorization: Bearer ${SENTINEL}`,
    });
    expect(e.message).not.toContain(SENTINEL);
  });

  it("parseApiError redacts a non-JSON error body snippet", () => {
    const e = parseApiError(`<html>?api_token=${SENTINEL} Authorization: Bearer ${SENTINEL}</html>`, 502);
    expect(e.message).not.toContain(SENTINEL);
  });

  it("errorResult redacts the message it returns", () => {
    const r = errorResult(`proxy said https://u:${SENTINEL}@host/`);
    expect((r.content[0] as { text: string }).text).not.toContain(SENTINEL);
  });
});

describe("the token never reaches stderr or returned text (tests-10)", () => {
  it("success, 4xx echo, timeout and network error at log level debug", async () => {
    const writes: string[] = [];
    const spy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    const responses = [
      () =>
        Promise.resolve(
          new Response('{"ok":true}', { status: 200, headers: { "content-type": "application/json" } }),
        ),
      () => Promise.resolve(new Response(`denied for Authorization: Bearer ${SENTINEL}`, { status: 401 })),
      (init: RequestInit) =>
        new Promise<Response>((_r, reject) =>
          init.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          ),
        ),
      () => Promise.reject(new TypeError("fetch failed")),
    ];
    let i = 0;
    const f = vi.fn().mockImplementation((_url: string, init: RequestInit) => responses[i++]!(init));
    const cfg = {
      apiToken: SENTINEL,
      apiBase: "https://snipe.example/api/v1",
      confirmWrites: true,
      timeoutMs: 30,
      logLevel: "debug" as const,
    };
    const client = new SnipeitClient(cfg, createLogger("debug"), { fetch: f });
    const texts: string[] = [];
    try {
      await client.request("GET", "/hardware");
      for (const method of ["POST", "PATCH", "POST"] as const) {
        try {
          await client.request(method, "/hardware/1", { body: { a: 1 } });
        } catch (err) {
          texts.push(err instanceof Error ? err.message : String(err));
        }
      }
    } finally {
      spy.mockRestore();
    }
    expect(f).toHaveBeenCalledTimes(4);
    expect(texts).toHaveLength(3);
    expect(writes.join("")).not.toContain(SENTINEL);
    expect(texts.join("\n")).not.toContain(SENTINEL);
    // The token did travel in the header (the only place it belongs).
    const headers = (f.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${SENTINEL}`);
  });
});

describe("opt-in PII masking (SNIPEIT_REDACT_PII)", () => {
  const row = {
    id: 7,
    name: "MacBook Pro 16",
    asset_tag: "JW-1",
    assigned_to: {
      id: 3,
      type: "user",
      name: "Jane Doe",
      username: "jdoe",
      email: "jane@example.com",
      employee_number: "E-17",
    },
    notes: "fine",
  };

  it("is off by default and parses like the other switches", () => {
    const base = { SNIPEIT_API_TOKEN: "t" };
    expect(loadConfig(base).redactPii).toBe(false);
    expect(loadConfig({ ...base, SNIPEIT_REDACT_PII: "true" }).redactPii).toBe(true);
    expect(loadConfig({ ...base, SNIPEIT_REDACT_PII: "off" }).redactPii).toBe(false);
    const odd = loadConfig({ ...base, SNIPEIT_REDACT_PII: "maybe" });
    expect(odd.redactPii).toBe(true);
    expect(odd.warnings.join(" ")).toMatch(/SNIPEIT_REDACT_PII/);
  });

  it("masks personal fields and the name of person objects, not asset names", () => {
    const out = maskPii({ total: 1, rows: [row] }) as { rows: (typeof row)[] };
    const r = out.rows[0]!;
    expect(r.name).toBe("MacBook Pro 16");
    expect(r.asset_tag).toBe("JW-1");
    expect(r.assigned_to).toEqual({
      id: 3,
      type: "user",
      name: "(redacted)",
      username: "(redacted)",
      email: "(redacted)",
      employee_number: "(redacted)",
    });
  });

  it("jsonResult masks only when switched on", () => {
    expect(jsonResult(row).content[0]).toMatchObject({ text: expect.stringContaining("jane@example.com") });
    setRedactPii(true);
    const text = (jsonResult(row).content[0] as { text: string }).text;
    expect(text).not.toContain("jane@example.com");
    expect(text).not.toContain("Jane Doe");
    expect(text).toContain("MacBook Pro 16");
  });

  it("buildServer applies the switch to tool results", async () => {
    const { server, ctx } = buildServer(
      loadConfig({
        SNIPEIT_API_TOKEN: "t",
        SNIPEIT_API_BASE: "https://snipe.example/api/v1",
        SNIPEIT_REDACT_PII: "1",
        SNIPEIT_LOG_LEVEL: "error",
      }),
    );
    vi.spyOn(ctx.client, "request").mockResolvedValue({
      data: row,
      status: 200,
      headers: new Headers(),
    } as never);
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const client = new Client({ name: "pii-test", version: "0.0.0" });
    await client.connect(clientSide);
    const res = (await client.callTool({ name: "snipeit_get_hardware_by_id", arguments: { id: 7 } })) as {
      content: { text: string }[];
    };
    expect(res.content[0]!.text).not.toContain("jane@example.com");
    await client.close();
  });
});
