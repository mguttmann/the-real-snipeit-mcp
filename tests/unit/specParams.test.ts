/**
 * Hand-wrapper parameters against the vendored spec (correctness-4, correctness-9): the
 * spec filters and body fields are offered as optional parameters and forwarded; filters
 * the spec does not list say so; prompts steer to fields and filters that exist.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { buildServer } from "../../src/server.js";
import { loadConfig } from "../../src/config.js";

type Prop = { description?: string; type?: string };
let tools: Map<
  string,
  {
    inputSchema: {
      properties?: Record<string, Prop & { items?: { properties?: Record<string, Prop> } }>;
      required?: string[];
    };
  }
>;
let client: Client;
let request: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  const { server, ctx } = buildServer(
    loadConfig({
      SNIPEIT_API_TOKEN: "t",
      SNIPEIT_API_BASE: "https://h.example/api/v1",
      SNIPEIT_CONFIRM_WRITES: "false",
      SNIPEIT_LOG_LEVEL: "error",
    }),
  );
  request = vi.fn().mockResolvedValue({ data: { total: 0, rows: [] }, status: 200, headers: new Headers() });
  ctx.client.request = request as never;
  const [c, s] = InMemoryTransport.createLinkedPair();
  await server.connect(s);
  client = new Client({ name: "spec-params", version: "0" });
  await client.connect(c);
  tools = new Map((await client.listTools()).tools.map((t) => [t.name, t as never]));
});

const props = (tool: string) => tools.get(tool)!.inputSchema.properties ?? {};
async function call(name: string, args: Record<string, unknown>) {
  request.mockClear();
  await client.callTool({ name, arguments: args });
  return request.mock.calls[0] as [
    string,
    string,
    { query?: Record<string, unknown>; body?: Record<string, unknown> },
  ];
}

describe("checkout and checkin can set status_id (correctness-4)", () => {
  it("snipeit_checkout_hardware sends status_id", async () => {
    expect(props("snipeit_checkout_hardware")).toHaveProperty("status_id");
    const [, path, opts] = await call("snipeit_checkout_hardware", {
      id: 4,
      checkout_to_type: "user",
      assigned_user: 2,
      status_id: 3,
    });
    expect(path).toBe("/hardware/4/checkout");
    expect(opts.body).toMatchObject({ status_id: 3, assigned_user: 2 });
  });

  it("snipeit_checkin_hardware sends status_id and name", async () => {
    expect(props("snipeit_checkin_hardware")).toHaveProperty("status_id");
    expect(props("snipeit_checkin_hardware")).toHaveProperty("name");
    const [, , opts] = await call("snipeit_checkin_hardware", { id: 4, status_id: 1, name: "Spare" });
    expect(opts.body).toEqual({ status_id: 1, name: "Spare" });
  });

  it("snipeit_bulk_checkout items accept status_id, checkout_at and expected_checkin", async () => {
    const item = tools.get("snipeit_bulk_checkout")!.inputSchema.properties!.items!.items!.properties!;
    for (const k of ["status_id", "checkout_at", "expected_checkin"]) expect(item).toHaveProperty(k);
    const [, , opts] = await call("snipeit_bulk_checkout", {
      items: [
        {
          asset_id: 1,
          checkout_to_type: "user",
          assigned_user: 2,
          status_id: 3,
          expected_checkin: "2026-12-01",
        },
      ],
    });
    expect(opts.body).toMatchObject({ status_id: 3, expected_checkin: "2026-12-01" });
  });

  it("no new parameter is required", () => {
    expect(tools.get("snipeit_checkin_hardware")!.inputSchema.required).toEqual(["id"]);
  });
});

describe("spec filters on the hand tools (correctness-9)", () => {
  it("snipeit_list_hardware forwards status, assigned_to, order_number and filter", async () => {
    for (const k of ["status", "assigned_to", "order_number", "filter"])
      expect(props("snipeit_list_hardware")).toHaveProperty(k);
    const [, , opts] = await call("snipeit_list_hardware", {
      status: "RTD",
      assigned_to: 5,
      order_number: "PO-1",
      filter: '{"name":"x"}',
    });
    expect(opts.query).toMatchObject({
      status: "RTD",
      assigned_to: 5,
      order_number: "PO-1",
      filter: '{"name":"x"}',
    });
  });

  it("snipeit_search_hardware takes an offset", async () => {
    const [, , opts] = await call("snipeit_search_hardware", { query: "mac", limit: 10, offset: 20 });
    expect(opts.query).toMatchObject({ search: "mac", limit: 10, offset: 20 });
  });

  it("bytag and byserial forward deleted", async () => {
    for (const [tool, arg] of [
      ["snipeit_get_hardware_by_tag", "tag"],
      ["snipeit_get_hardware_by_serial", "serial"],
    ] as const) {
      const [, , opts] = await call(tool, { [arg]: "X1", deleted: true });
      expect(opts.query).toEqual({ deleted: true });
    }
  });

  it("snipeit_list_statuslabels forwards status_type", async () => {
    const [, , opts] = await call("snipeit_list_statuslabels", { status_type: "deployable" });
    expect(opts.query).toMatchObject({ status_type: "deployable" });
  });

  it("filters the spec does not list are marked as unverified", () => {
    const marked = (tool: string, key: string) =>
      expect(props(tool)[key]?.description ?? "", `${tool}.${key}`).toMatch(/not in the vendored API spec/);
    marked("snipeit_list_maintenances", "supplier_id");
    marked("snipeit_list_maintenances", "asset_maintenance_type");
    marked("snipeit_list_locations", "parent_id");
    for (const k of ["category_id", "manufacturer_id", "company_id", "location_id"])
      marked("snipeit_list_accessories", k);
  });
});

describe("prompts use fields and filters that exist", () => {
  it("no prompt names ready-to-deploy ids, seats_used, an 'unassigned' label or /kits/{id}", async () => {
    const texts: string[] = [];
    for (const name of ["snipeit-inventory-audit", "snipeit-license-health"]) {
      const p = await client.getPrompt({ name });
      texts.push(p.messages.map((m) => (m.content as { text: string }).text).join("\n"));
    }
    const onboarding = await client.getPrompt({
      name: "snipeit-user-onboarding",
      arguments: { user_id: "3", kit: "dev" },
    });
    texts.push(onboarding.messages.map((m) => (m.content as { text: string }).text).join("\n"));
    const all = texts.join("\n");
    expect(all).not.toMatch(/status_id=ready-to-deploy|seats_used|seats_total|'unassigned'|GET \/kits\/dev/);
    expect(all).toMatch(/status: "RTD"|status=RTD/);
  });
});

describe("generated collection GETs take list parameters (0.2.2)", () => {
  it("snipeit_gen_manufacturers offers and forwards limit, offset, search, sort and order", async () => {
    const p = props("snipeit_gen_manufacturers");
    for (const k of ["limit", "offset", "search", "sort", "order"]) expect(p).toHaveProperty(k);
    expect(tools.get("snipeit_gen_manufacturers")!.inputSchema.required ?? []).toEqual([]);
    const [method, path, opts] = await call("snipeit_gen_manufacturers", {
      limit: 5,
      offset: 10,
      search: "HP",
      sort: "name",
      order: "asc",
    });
    expect([method, path]).toEqual(["GET", "/manufacturers"]);
    expect(opts.query).toMatchObject({ limit: 5, offset: 10, search: "HP", sort: "name", order: "asc" });
  });
});
