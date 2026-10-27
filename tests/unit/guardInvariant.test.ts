/**
 * Write guard invariant over every registered tool (tests-04): with the guard on (the
 * default) and no confirm, no tool sends anything but GET, every non-read-only tool
 * returns a preview, and every read-only tool sends only GET.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { buildServer } from "../../src/server.js";
import { loadConfig } from "../../src/config.js";

type Schema = {
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  anyOf?: Schema[];
  oneOf?: Schema[];
  items?: Schema;
  minItems?: number;
  minimum?: number;
  minLength?: number;
  properties?: Record<string, Schema>;
  required?: string[];
};

/** Smallest valid value for a JSON Schema: only required properties are filled. */
function sample(s: Schema | undefined): unknown {
  if (!s) return "x";
  if (s.const !== undefined) return s.const;
  if (s.enum?.length) return s.enum[0];
  const alt = s.anyOf ?? s.oneOf;
  if (alt?.length) return sample(alt[0]);
  const type = Array.isArray(s.type) ? s.type[0] : s.type;
  switch (type) {
    case "integer":
    case "number":
      return Math.max(1, s.minimum ?? 1);
    case "boolean":
      return true;
    case "array":
      return (s.minItems ?? 0) > 0 ? [sample(s.items)] : [];
    case "object": {
      const out: Record<string, unknown> = {};
      for (const k of s.required ?? []) out[k] = sample(s.properties?.[k]);
      return out;
    }
    default:
      return "x".repeat(Math.max(1, s.minLength ?? 1));
  }
}

interface ListedTool {
  name: string;
  inputSchema: Schema;
  annotations?: { readOnlyHint?: boolean };
}

let tools: ListedTool[] = [];
let client: Client;
const sent: { method: string; url: string }[] = [];

beforeAll(async () => {
  const { server, ctx } = buildServer(
    loadConfig({
      SNIPEIT_API_TOKEN: "t",
      SNIPEIT_API_BASE: "https://snipeit.invalid/api/v1",
      SNIPEIT_LOG_LEVEL: "error",
    }),
  );
  expect(ctx.cfg.confirmWrites).toBe(true);
  (ctx.client as unknown as { opts: { fetch: typeof fetch } }).opts.fetch = vi
    .fn()
    .mockImplementation(async (url: string, init: RequestInit) => {
      sent.push({ method: String(init.method), url });
      return new Response('{"total":0,"rows":[]}', {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await server.connect(s);
  client = new Client({ name: "guard-invariant", version: "0" });
  await client.connect(c);
  tools = (await client.listTools()).tools as ListedTool[];
});

async function callWithout(tool: ListedTool) {
  const args = sample({ ...tool.inputSchema, type: "object" }) as Record<string, unknown>;
  if (tool.name === "snipeit_raw_request") Object.assign(args, { method: "DELETE", path: "/hardware/1" });
  delete args.confirm;
  sent.length = 0;
  const res = (await client.callTool({ name: tool.name, arguments: args })) as {
    isError?: boolean;
    content: { text: string }[];
    _meta?: Record<string, unknown>;
  };
  return { res, sent: [...sent] };
}

describe("write guard invariant over all tools", () => {
  it("covers the whole tool list", () => {
    expect(tools.length).toBeGreaterThanOrEqual(183);
    expect(tools.filter((t) => t.annotations?.readOnlyHint !== true).length).toBeGreaterThan(100);
  });

  it("no non-read-only tool sends anything without confirm; each returns a preview", async () => {
    const offenders: string[] = [];
    for (const tool of tools.filter((t) => t.annotations?.readOnlyHint !== true)) {
      const { res, sent: requests } = await callWithout(tool);
      const preview = res._meta?.["snipeit/preview"] === true && !res.isError;
      if (requests.length > 0 || !preview)
        offenders.push(`${tool.name}: ${requests.length} request(s), ${res.content[0]?.text.slice(0, 120)}`);
    }
    expect(offenders).toEqual([]);
  });

  it("every read-only tool sends only GET", async () => {
    const offenders: string[] = [];
    for (const tool of tools.filter((t) => t.annotations?.readOnlyHint === true)) {
      const { res, sent: requests } = await callWithout(tool);
      if (res.isError || requests.length === 0)
        offenders.push(`${tool.name}: no request (${res.content[0]?.text.slice(0, 120)})`);
      for (const r of requests) if (r.method !== "GET") offenders.push(`${tool.name}: ${r.method} ${r.url}`);
    }
    expect(offenders).toEqual([]);
  });
});
