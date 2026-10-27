/**
 * Opt-in secret redaction of tool results (SNIPEIT_REDACT_SECRETS) and the always-on refusal
 * of a write that carries the redaction placeholder (0.2.2).
 *
 * The end-to-end tests run the real server over an in-memory MCP transport against a
 * loopback Snipe-IT stub on port 0, so they cover the whole path a gateway sees.
 */
import { afterEach, beforeAll, afterAll, describe, expect, it } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { buildServer } from "../../src/server.js";
import { loadConfig } from "../../src/config.js";
import {
  REDACTED_PLACEHOLDER,
  SECRET_CUSTOM_FIELD,
  SECRET_KEYS,
  errorResult,
  maskSecrets,
  redactedPaths,
  setRedactSecrets,
} from "../../src/tools/helpers.js";
import { startLoopback } from "./_loopback.js";

const BITLOCKER = "142857-285714-428571-571428-714285-857142-000000-111111";
const ADMIN_PW = "Xq7!correct-horse-battery";
const MAC = "AA:BB:CC:DD:EE:01";

/** A Snipe-IT 8.x GET /hardware response with two secret custom fields and a harmless one. */
const hardwareList = {
  total: 1,
  rows: [
    {
      id: 101,
      name: "LT-0101",
      asset_tag: "A-0101",
      serial: "SN-5CD1234XYZ",
      model: { id: 4, name: "EliteBook 840 G8" },
      model_number: "840G8",
      status_label: { id: 2, name: "Ready to Deploy", status_type: "deployable", status_meta: "deployable" },
      category: { id: 2, name: "Laptops" },
      manufacturer: { id: 1, name: "HP" },
      location: { id: 3, name: "Head Office" },
      assigned_to: null,
      notes: "",
      custom_fields: {
        "BitLocker Recovery Key": {
          field: "_snipeit_bitlocker_recovery_key_5",
          value: BITLOCKER,
          field_format: "ANY",
          element: "text",
        },
        "Local Admin Password (IT-Admin)": {
          field: "_snipeit_local_admin_password_6",
          value: ADMIN_PW,
          field_format: "ANY",
          element: "text",
        },
        "MAC Address": {
          field: "_snipeit_mac_address_1",
          value: MAC,
          field_format: "regex:/^[a-fA-F0-9]{2}(:[a-fA-F0-9]{2}){5}$/",
          element: "text",
        },
      },
      available_actions: {
        checkout: true,
        checkin: true,
        clone: true,
        restore: false,
        update: true,
        delete: true,
      },
    },
  ],
};

const OLD_PW = "Old!pw-tango-4711";

/**
 * A Snipe-IT GET /reports/activity response: an asset update whose log_meta carries the
 * custom field changes keyed by display name (and, in current releases, by db column).
 */
const activityReport = {
  total: 1,
  rows: [
    {
      id: 9001,
      icon: "fa-solid fa-pen",
      item: { id: 101, name: "LT-0101", type: "asset", serial: "SN-5CD1234XYZ" },
      action_type: "update",
      admin: { id: 1, name: "Admin" },
      target: null,
      note: null,
      log_meta: {
        "BitLocker Recovery Key": { old: "", new: BITLOCKER },
        "Local Admin Password (IT-Admin)": { old: OLD_PW, new: ADMIN_PW },
        _snipeit_laps_password_7: { old: "laps-old", new: "laps-new" },
        "MAC Address": { old: null, new: MAC },
        name: { old: "LT-0100", new: "LT-0101" },
      },
      action_date: { datetime: "2026-10-27 10:00:00", formatted: "2026-10-27 10:00" },
    },
  ],
};

let srv: Awaited<ReturnType<typeof startLoopback>>;
const seen: { method: string; url: string }[] = [];

beforeAll(async () => {
  srv = await startLoopback((req, res) => {
    seen.push({ method: req.method ?? "", url: req.url ?? "" });
    req.on("data", () => undefined);
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      const url = req.url ?? "";
      if (req.method === "GET" && url.startsWith("/api/v1/hardware")) {
        res.end(JSON.stringify(hardwareList));
      } else if (req.method === "GET" && url.startsWith("/api/v1/reports/activity")) {
        res.end(JSON.stringify(activityReport));
      } else if (req.method === "GET" && url.startsWith("/api/v1/settings")) {
        res.end(JSON.stringify({ site_name: "Inventory", mail_password: "smtp-pw-1", ldap_pword: "x" }));
      } else if (req.method === "GET" && url.startsWith("/api/v1/users/me")) {
        res.end(JSON.stringify({ id: 1, name: "Admin", api_token: "leaked-token" }));
      } else if (req.method === "PATCH" && url.startsWith("/api/v1/hardware/101")) {
        // Snipe-IT echoes the model attributes, custom field columns included, on update.
        res.end(
          JSON.stringify({
            status: "success",
            messages: "Asset updated successfully.",
            payload: {
              id: 101,
              asset_tag: "A-0101",
              _snipeit_bitlocker_recovery_key_5: BITLOCKER,
              _snipeit_mac_address_1: MAC,
            },
          }),
        );
      } else {
        res.statusCode = 200;
        res.end(JSON.stringify({ status: "success", messages: "ok", payload: { id: 1 } }));
      }
    });
  });
});

afterAll(async () => {
  await srv.close();
});

afterEach(() => {
  setRedactSecrets(false);
  seen.length = 0;
});

async function connect(env: Record<string, string> = {}) {
  const cfg = loadConfig({
    SNIPEIT_API_TOKEN: "t",
    SNIPEIT_API_BASE: srv.base,
    SNIPEIT_LOG_LEVEL: "error",
    ...env,
  });
  const { server } = buildServer(cfg);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "secret-redaction-test", version: "0.0.0" });
  await client.connect(clientSide);
  return client;
}

type ToolRes = { content: { text: string }[]; isError?: boolean };
const call = async (client: Client, name: string, args: Record<string, unknown>) =>
  (await client.callTool({ name, arguments: args })) as ToolRes;
const parse = (r: ToolRes) => JSON.parse(r.content[0]!.text) as Record<string, unknown>;

type Row = (typeof hardwareList.rows)[number];
const fields = (r: ToolRes) => {
  const data = parse(r).data as { rows: Row[] };
  return data.rows[0]!.custom_fields;
};

describe("SNIPEIT_REDACT_SECRETS config", () => {
  it("is off by default and parses like the other switches", () => {
    const base = { SNIPEIT_API_TOKEN: "t" };
    expect(loadConfig(base).redactSecrets).toBe(false);
    expect(loadConfig({ ...base, SNIPEIT_REDACT_SECRETS: "true" }).redactSecrets).toBe(true);
    expect(loadConfig({ ...base, SNIPEIT_REDACT_SECRETS: "ON" }).redactSecrets).toBe(true);
    expect(loadConfig({ ...base, SNIPEIT_REDACT_SECRETS: "off" }).redactSecrets).toBe(false);
    expect(loadConfig({ ...base, SNIPEIT_REDACT_SECRETS: "" }).redactSecrets).toBe(false);
    const odd = loadConfig({ ...base, SNIPEIT_REDACT_SECRETS: "maybe" });
    expect(odd.redactSecrets).toBe(true);
    expect(odd.warnings.join(" ")).toMatch(/SNIPEIT_REDACT_SECRETS/);
  });
});

describe("snipeit_list_hardware with secret custom fields", () => {
  it("off (default): the values come back unchanged", async () => {
    const client = await connect();
    const r = await call(client, "snipeit_list_hardware", {});
    const cf = fields(r);
    expect(cf["BitLocker Recovery Key"].value).toBe(BITLOCKER);
    expect(cf["Local Admin Password (IT-Admin)"].value).toBe(ADMIN_PW);
    expect(cf["MAC Address"].value).toBe(MAC);
    await client.close();
  });

  it("on: both secret values are (redacted), the MAC address and the field metadata stay", async () => {
    const client = await connect({ SNIPEIT_REDACT_SECRETS: "true" });
    const r = await call(client, "snipeit_list_hardware", {});
    expect(r.content[0]!.text).not.toContain(BITLOCKER);
    expect(r.content[0]!.text).not.toContain(ADMIN_PW);
    const cf = fields(r);
    expect(cf["BitLocker Recovery Key"]).toEqual({
      field: "_snipeit_bitlocker_recovery_key_5",
      value: REDACTED_PLACEHOLDER,
      field_format: "ANY",
      element: "text",
    });
    expect(cf["Local Admin Password (IT-Admin)"]).toEqual({
      field: "_snipeit_local_admin_password_6",
      value: REDACTED_PLACEHOLDER,
      field_format: "ANY",
      element: "text",
    });
    expect(cf["MAC Address"].value).toBe(MAC);
    const row = (parse(r).data as { rows: Row[] }).rows[0]!;
    expect(row.name).toBe("LT-0101");
    expect(row.serial).toBe("SN-5CD1234XYZ");
    await client.close();
  });

  it("on: the generated GET and snipeit_raw_request GET are redacted too", async () => {
    const client = await connect({ SNIPEIT_REDACT_SECRETS: "1" });
    for (const [name, args] of [
      ["snipeit_raw_request", { method: "GET", path: "/hardware" }],
      ["snipeit_gen_hardware_list", {}],
    ] as const) {
      const r = await call(client, name, args);
      expect(r.isError, name).toBeFalsy();
      expect(r.content[0]!.text, name).not.toContain(BITLOCKER);
      expect(r.content[0]!.text, name).not.toContain(ADMIN_PW);
      expect(r.content[0]!.text, name).toContain(MAC);
    }
    await client.close();
  });

  it("on: a write response with the flat custom field column is redacted", async () => {
    const client = await connect({ SNIPEIT_REDACT_SECRETS: "true", SNIPEIT_CONFIRM_WRITES: "false" });
    const r = await call(client, "snipeit_update_hardware", { id: 101, body: { notes: "x" } });
    expect(r.isError).toBeFalsy();
    const data = parse(r).data as Record<string, unknown>;
    expect(data._snipeit_bitlocker_recovery_key_5).toBe(REDACTED_PLACEHOLDER);
    expect(data._snipeit_mac_address_1).toBe(MAC);
    await client.close();
  });

  it("on: resources are redacted (snipeit://settings, snipeit://me)", async () => {
    const client = await connect({ SNIPEIT_REDACT_SECRETS: "true" });
    const settings = await client.readResource({ uri: "snipeit://settings" });
    const s = JSON.parse((settings.contents[0] as { text: string }).text) as Record<string, unknown>;
    expect(s.mail_password).toBe(REDACTED_PLACEHOLDER);
    expect(s.site_name).toBe("Inventory");
    const me = await client.readResource({ uri: "snipeit://me" });
    expect((me.contents[0] as { text: string }).text).not.toContain("leaked-token");
    await client.close();
  });

  it("off: resources are unchanged", async () => {
    const client = await connect();
    const settings = await client.readResource({ uri: "snipeit://settings" });
    expect((settings.contents[0] as { text: string }).text).toContain("smtp-pw-1");
    await client.close();
  });
});

describe("activity report log_meta with secret custom field changes", () => {
  it("off (default): the old and new values come back unchanged", async () => {
    const client = await connect();
    const r = await call(client, "snipeit_gen_reportsactivity", {});
    expect(r.content[0]!.text).toContain(BITLOCKER);
    expect(r.content[0]!.text).toContain(OLD_PW);
    await client.close();
  });

  it("on: old and new of every secret field are (redacted), the change and other fields stay", async () => {
    const client = await connect({ SNIPEIT_REDACT_SECRETS: "true" });
    for (const [name, args] of [
      ["snipeit_gen_reportsactivity", {}],
      ["snipeit_raw_request", { method: "GET", path: "/reports/activity" }],
    ] as const) {
      const r = await call(client, name, args);
      expect(r.isError, name).toBeFalsy();
      const text = r.content[0]!.text;
      for (const secret of [BITLOCKER, ADMIN_PW, OLD_PW, "laps-old", "laps-new"])
        expect(text, `${name} ${secret}`).not.toContain(secret);
      const meta = (parse(r).data as { rows: { log_meta: Record<string, unknown> }[] }).rows[0]!.log_meta;
      expect(meta["BitLocker Recovery Key"], name).toEqual({ old: "", new: REDACTED_PLACEHOLDER });
      expect(meta["Local Admin Password (IT-Admin)"], name).toEqual({
        old: REDACTED_PLACEHOLDER,
        new: REDACTED_PLACEHOLDER,
      });
      expect(meta._snipeit_laps_password_7, name).toEqual({
        old: REDACTED_PLACEHOLDER,
        new: REDACTED_PLACEHOLDER,
      });
      expect(meta["MAC Address"], name).toEqual({ old: null, new: MAC });
      expect(meta.name, name).toEqual({ old: "LT-0100", new: "LT-0101" });
    }
    await client.close();
  });
});

describe("maskSecrets", () => {
  it("masks secret entries of log_meta at any depth, {old, new} and scalar", () => {
    expect(
      maskSecrets({
        payload: [{ log_meta: { "Wifi PIN": { old: "1111", new: "2222" }, Recovery: "r-1", notes: "n" } }],
      }),
    ).toEqual({
      payload: [
        {
          log_meta: {
            "Wifi PIN": { old: REDACTED_PLACEHOLDER, new: REDACTED_PLACEHOLDER },
            Recovery: REDACTED_PLACEHOLDER,
            notes: "n",
          },
        },
      ],
    });
  });

  it("masks default_value of secret custom fields (model defaults, fieldset fields per model)", () => {
    const out = maskSecrets({
      default_fieldset_values: [
        { name: "BitLocker Recovery Key", db_column_name: "_snipeit_b_5", default_value: "d-1" },
        { name: "MAC Address", db_column_name: "_snipeit_mac_address_1", default_value: MAC },
      ],
      rows: [{ id: 6, name: "Local Admin Password", type: "text", default_value: "d-2" }],
    }) as { default_fieldset_values: { default_value: string }[]; rows: { default_value: string }[] };
    expect(out.default_fieldset_values.map((f) => f.default_value)).toEqual([REDACTED_PLACEHOLDER, MAC]);
    expect(out.rows[0]!.default_value).toBe(REDACTED_PLACEHOLDER);
  });

  it("matches an array-form custom field entry by label too", () => {
    const out = maskSecrets({ custom_fields: [{ label: "LAPS", value: "l-1" }] }) as {
      custom_fields: { value: string }[];
    };
    expect(out.custom_fields[0]!.value).toBe(REDACTED_PLACEHOLDER);
  });

  it("masks secret-named keys at any depth, in arrays too; null and empty stay", () => {
    const input = {
      a: {
        b: [
          { password: "p1", api_key: "k1", nested: { client_secret: "s1", ok: "visible" } },
          { refresh_token: "t1", token: null, password: "" },
        ],
      },
      name: "LT-1",
    };
    expect(maskSecrets(input)).toEqual({
      a: {
        b: [
          {
            password: REDACTED_PLACEHOLDER,
            api_key: REDACTED_PLACEHOLDER,
            nested: { client_secret: REDACTED_PLACEHOLDER, ok: "visible" },
          },
          { refresh_token: REDACTED_PLACEHOLDER, token: null, password: "" },
        ],
      },
      name: "LT-1",
    });
  });

  it("matches the custom field display name or the db column, in object and array form", () => {
    const out = maskSecrets({
      custom_fields: [
        { name: "Wifi PIN", field: "_snipeit_wifi_pin_3", value: "1234" },
        { name: "Asset owner", field: "_snipeit_laps_account_8", value: "laps-1" },
        { name: "Cost center", field: "_snipeit_cost_center_9", value: "CC-1" },
      ],
      nested: { custom_fields: { "Kennwort Tresor": { field: "_snipeit_x_2", value: "geheim" } } },
    }) as {
      custom_fields: { value: string }[];
      nested: { custom_fields: Record<string, { value: string; field: string }> };
    };
    expect(out.custom_fields.map((f) => f.value)).toEqual([
      REDACTED_PLACEHOLDER,
      REDACTED_PLACEHOLDER,
      "CC-1",
    ]);
    expect(out.nested.custom_fields["Kennwort Tresor"]).toEqual({
      field: "_snipeit_x_2",
      value: REDACTED_PLACEHOLDER,
    });
  });

  it("keeps the rules in one exported place", () => {
    expect(SECRET_KEYS.test("api-key")).toBe(true);
    for (const n of ["BitLocker Recovery Key", "Local Admin Password (IT-Admin)", "LAPS", "Kennwort", "PIN"])
      expect(SECRET_CUSTOM_FIELD.test(n), n).toBe(true);
    expect(SECRET_CUSTOM_FIELD.test("MAC Address")).toBe(false);
  });

  it("errorResult masks echoed JSON secret fields when the switch is on", () => {
    const msg = `HTTP 500: {"_snipeit_bitlocker_recovery_key_5":"${BITLOCKER}","asset_tag":"A-1"}`;
    expect(errorResult(msg).content[0]).toMatchObject({ text: expect.stringContaining(BITLOCKER) });
    setRedactSecrets(true);
    const text = (errorResult(msg).content[0] as { text: string }).text;
    expect(text).not.toContain(BITLOCKER);
    expect(text).toContain("A-1");
  });
});

describe("a write body with the placeholder is refused before anything happens (always on)", () => {
  it("redactedPaths names every exact placeholder, in objects and arrays, with JSON paths", () => {
    expect(
      redactedPaths({
        custom_fields: { "BitLocker Key": { value: REDACTED_PLACEHOLDER } },
        items: [{}, { a: 1 }, { password: REDACTED_PLACEHOLDER }],
        note: "contains (redacted) inside a longer text",
      }),
    ).toEqual(['body.custom_fields["BitLocker Key"].value', "body.items[2].password"]);
  });

  const cases: [string, Record<string, unknown>, string[]][] = [
    [
      "snipeit_update_hardware",
      { id: 101, body: { _snipeit_bitlocker_recovery_key_5: REDACTED_PLACEHOLDER } },
      ["body._snipeit_bitlocker_recovery_key_5"],
    ],
    [
      "snipeit_gen_hardware_partial_update",
      { id: 101, body: { notes: REDACTED_PLACEHOLDER } },
      ["body.notes"],
    ],
    [
      "snipeit_raw_request",
      { method: "POST", path: "/hardware", body: [{ a: 1 }, { b: 2 }, { password: REDACTED_PLACEHOLDER }] },
      ["body[2].password"],
    ],
    [
      "snipeit_raw_request",
      { method: "PATCH", path: "/hardware/101", query: { token: REDACTED_PLACEHOLDER } },
      ["query.token"],
    ],
    [
      "snipeit_bulk_checkout",
      {
        items: [
          { asset_id: 1, checkout_to_type: "user", assigned_user: 3 },
          { asset_id: 2, checkout_to_type: "user", assigned_user: 3 },
          { asset_id: 3, checkout_to_type: "user", assigned_user: 3, note: REDACTED_PLACEHOLDER },
        ],
      },
      ["items[2].note"],
    ],
  ];

  for (const env of [
    { label: "guard on, no confirm (would preview)", env: {}, confirm: false },
    { label: "guard on, confirm YES", env: {}, confirm: true },
    { label: "guard off", env: { SNIPEIT_CONFIRM_WRITES: "false" }, confirm: false },
    { label: "read-only", env: { SNIPEIT_READ_ONLY: "true" }, confirm: true },
  ]) {
    for (const [tool, args, paths] of cases) {
      it(`${tool} ${paths.join(",")}: ${env.label}`, async () => {
        const client = await connect(env.env);
        const r = await call(client, tool, env.confirm ? { ...args, confirm: "YES" } : args);
        expect(r.isError).toBe(true);
        const body = parse(r) as { error: string; details: { code: string; paths: string[] } };
        expect(body.details.code).toBe("REDACTED_PLACEHOLDER");
        expect(body.details.paths).toEqual(paths);
        for (const p of paths) expect(body.error).toContain(p);
        expect(body.error).toMatch(/nothing was sent/i);
        expect(seen).toEqual([]);
        await client.close();
      });
    }
  }

  it("does not record a preview for SNIPEIT_REQUIRE_PREVIEW", async () => {
    const client = await connect({ SNIPEIT_REQUIRE_PREVIEW: "true" });
    const args = { id: 101, body: { _snipeit_bitlocker_recovery_key_5: REDACTED_PLACEHOLDER } };
    await call(client, "snipeit_update_hardware", args);
    const r = await call(client, "snipeit_update_hardware", { ...args, confirm: "YES" });
    expect(parse(r).details).toMatchObject({ code: "REDACTED_PLACEHOLDER" });
    expect(seen).toEqual([]);
    await client.close();
  });

  it("a placeholder inside a longer string, or a real value, is sent as before", async () => {
    const client = await connect({ SNIPEIT_CONFIRM_WRITES: "false" });
    const r = await call(client, "snipeit_update_hardware", {
      id: 101,
      body: { notes: "value was (redacted) in the export", _snipeit_bitlocker_recovery_key_5: "new-key" },
    });
    expect(r.isError).toBeFalsy();
    expect(seen).toHaveLength(1);
    await client.close();
  });

  it("a GET through snipeit_raw_request with the placeholder in the query is not refused", async () => {
    const client = await connect();
    const r = await call(client, "snipeit_raw_request", {
      method: "GET",
      path: "/hardware",
      query: { search: REDACTED_PLACEHOLDER },
    });
    expect(r.isError).toBeFalsy();
    expect(seen).toHaveLength(1);
    await client.close();
  });
});
