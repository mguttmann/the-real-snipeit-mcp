# the-real-snipeit-mcp

MCP server for the [Snipe-IT](https://snipeitapp.com) REST API. 100 % endpoint coverage (read + write), hand-written wrappers for common workflows, codegen from the official OpenAPI 3.1 spec, stdio transport.

**Three tool layers:**
- **39 hand-wrappers** (`snipeit_*`) — friendlier UX for common workflows
- **~145 auto-generated tools** (`snipeit_gen_*`) — 100 % endpoint coverage
- **`snipeit_raw_request`** — escape hatch for any method/path

Plus **3 resources**, **3 prompts**, and an MCPB bundle for one-click Claude Desktop install.

---

## Quick start

```bash
npm install
cp .env.example .env
# edit .env: set SNIPEIT_API_TOKEN
npm run build
npm start
```

Verify the connection with the MCP Inspector:
```bash
npm run inspector
```

## Configuration

| Variable | Default | Description |
|---|---|---|
| `SNIPEIT_API_TOKEN` | (required) | Snipe-IT Personal API Token (JWT) |
| `SNIPEIT_API_BASE` | `https://snipe-it.example.com/api/v1` | API base URL |
| `SNIPEIT_CONFIRM_WRITES` | `false` | If true, destructive tools require `confirm: "YES"` |
| `SNIPEIT_TIMEOUT_MS` | `30000` | Per-request timeout |
| `SNIPEIT_LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` |

## Claude Desktop config

```json
{
  "mcpServers": {
    "snipeit": {
      "command": "node",
      "args": [
        "--env-file=/absolute/path/to/the-real-snipeit-mcp/.env",
        "/absolute/path/to/the-real-snipeit-mcp/dist/index.js"
      ]
    }
  }
}
```

Or install via the MCPB bundle: `npm run build:mcpb` → install the `.mcpb` file in Claude Desktop.

---

## Tool reference

### Hand-wrappers (39 tools)

#### Identity (1)

| Tool | Endpoint | Annotations |
|---|---|---|
| `snipeit_me` | `GET /users/me` | readOnly |

#### Hardware / Assets (13)

| Tool | Endpoint | Annotations |
|---|---|---|
| `snipeit_list_hardware` | `GET /hardware` (paginated, common filters) | readOnly |
| `snipeit_search_hardware` | `GET /hardware?search={query}` (convenience) | readOnly |
| `snipeit_get_hardware_by_id` | `GET /hardware/{id}` | readOnly |
| `snipeit_get_hardware_by_tag` | `GET /hardware/bytag/{tag}` | readOnly |
| `snipeit_get_hardware_by_serial` | `GET /hardware/byserial/{serial}` | readOnly |
| `snipeit_create_hardware` | `POST /hardware` | writeOnce |
| `snipeit_update_hardware` | `PATCH /hardware/{id}` | writeIdempotent |
| `snipeit_delete_hardware` | `DELETE /hardware/{id}` | writeIdempotent |
| `snipeit_checkout_hardware` | `POST /hardware/{id}/checkout` (user/location/asset) | writeOnce |
| `snipeit_checkin_hardware` | `POST /hardware/{id}/checkin` | writeOnce |
| `snipeit_audit_hardware` | `POST /hardware/audit` | writeOnce |
| `snipeit_list_audit_due` | `GET /hardware/audit/due` | readOnly |
| `snipeit_list_audit_overdue` | `GET /hardware/audit/overdue` | readOnly |

#### Users (5)

| Tool | Endpoint | Annotations |
|---|---|---|
| `snipeit_list_users` | `GET /users` | readOnly |
| `snipeit_get_user` | `GET /users/{id}` | readOnly |
| `snipeit_get_user_assets` | `GET /users/{id}/assets` | readOnly |
| `snipeit_get_user_accessories` | `GET /users/{id}/accessories` | readOnly |
| `snipeit_get_user_licenses` | `GET /users/{id}/licenses` | readOnly |

#### Licenses (3)

| Tool | Endpoint | Annotations |
|---|---|---|
| `snipeit_list_licenses` | `GET /licenses` | readOnly |
| `snipeit_get_license_seats` | `GET /licenses/{id}/seats` | readOnly |
| `snipeit_checkout_license_seat` | `PUT /licenses/{license_id}/seats/{seat_id}` | writeIdempotent |

#### Accessories / Consumables / Components (8)

| Tool | Endpoint | Annotations |
|---|---|---|
| `snipeit_list_accessories` | `GET /accessories` | readOnly |
| `snipeit_checkout_accessory` | `POST /accessories/{id}/checkout` | writeOnce |
| `snipeit_checkin_accessory` | `POST /accessories/{id}/checkin` (pivot-id) | writeOnce |
| `snipeit_list_consumables` | `GET /consumables` | readOnly |
| `snipeit_checkout_consumable` | `POST /consumables/{id}/checkout` | writeOnce |
| `snipeit_list_components` | `GET /components` | readOnly |
| `snipeit_checkout_component` | `POST /components/{id}/checkout` (to asset) | writeOnce |
| `snipeit_checkin_component` | `POST /components/{id}/checkin` (pivot-id) | writeOnce |

#### Locations / Status-Labels / Maintenances (6)

| Tool | Endpoint | Annotations |
|---|---|---|
| `snipeit_list_locations` | `GET /locations` | readOnly |
| `snipeit_get_location` | `GET /locations/{id}` | readOnly |
| `snipeit_list_statuslabels` | `GET /statuslabels` | readOnly |
| `snipeit_get_statuslabel_assets` | `GET /statuslabels/{id}/assetlist` | readOnly |
| `snipeit_list_maintenances` | `GET /maintenances` | readOnly |
| `snipeit_create_maintenance` | `POST /maintenances` | writeOnce |

#### Bulk & Escape (2)

| Tool | Behavior | Annotations |
|---|---|---|
| `snipeit_bulk_checkout` | Serially checks out N assets, returns per-item success/error summary | writeOnce |
| `snipeit_raw_request` | Any method/path against `SNIPEIT_API_BASE` — escape hatch | writeOnce (writeIdempotent for GET) |

**List tools** (`snipeit_list_*`) accept `limit?`, `offset?`, and `all?: boolean`. With `all: true`, the tool auto-paginates up to 10 000 rows.

### Auto-generated tools (`snipeit_gen_*`)

All 77 paths × every method in the Snipe-IT OpenAPI 3.1 spec are exposed as `snipeit_gen_<snake_operation_id>` — roughly 145 tools. Use these when the hand-wrapper layer doesn't cover what you need. Read tools have `readOnlyHint: true`; writes have `destructiveHint: true`. Regenerate with `npm run codegen` after `npm run refresh-spec`.

### `snipeit_raw_request`

Escape hatch for anything else:
```ts
{ method: "PATCH", path: "/locations/4", body: { name: "HQ" } }
```
GET requests bypass the destructive-write guard; other methods honor `SNIPEIT_CONFIRM_WRITES`.

---

## Resources

| URI | Description |
|---|---|
| `snipeit://me` | Current authenticated user (`GET /users/me`) |
| `snipeit://settings` | Server settings (`GET /settings`) |
| `snipeit://hardware/summary` | `{total, by_status_label, by_category}` — aggregated counts |

## Prompts

| Prompt | Args | Purpose |
|---|---|---|
| `snipeit-inventory-audit` | – | Lists overdue/due audits + unassigned assets, then summarizes |
| `snipeit-user-onboarding` | `user_id`, optional `kit` | Suggests a checkout sequence for a new user |
| `snipeit-license-health` | – | Seat usage + licenses expiring within 90 days |

---

## Workflows / Recipes

### Onboard a new user with a laptop

1. Confirm the user: `snipeit_get_user(id: 42)`
2. Find an available laptop: `snipeit_list_hardware(category_id: 3, status_id: 5)` (ready-to-deploy)
3. Checkout: `snipeit_checkout_hardware(id: 100, checkout_to_type: "user", assigned_user: 42, note: "Onboarding 2026-05-25")`

### Bulk-checkout a kit to one user

```json
{
  "items": [
    { "asset_id": 100, "checkout_to_type": "user", "assigned_user": 42 },
    { "asset_id": 101, "checkout_to_type": "user", "assigned_user": 42 },
    { "asset_id": 102, "checkout_to_type": "user", "assigned_user": 42 }
  ]
}
```
Continues on per-item errors. Returns `{summary: {total, ok, errors}, results: [...]}`.

### Audit overdue cleanup

1. `snipeit_list_audit_overdue(all: true)` — full list, auto-paginated
2. For each: `snipeit_audit_hardware(asset_tag: "...", location_id: 1, next_audit_date: "2027-05-25")`

### Find an asset by tag or serial

- By asset tag: `snipeit_get_hardware_by_tag(tag: "A-42")` (handles URL encoding)
- By serial: `snipeit_get_hardware_by_serial(serial: "SN12345")`

### Discover what an LLM can do

Browse the MCP Inspector:
```bash
npm run build && npm run inspector
```

---

## Write safety

By default, destructive tools execute directly. Set `SNIPEIT_CONFIRM_WRITES=true` and any write tool returns a **redacted preview** instead — re-invoke with `confirm: "YES"` to actually execute. Preview includes the full URL (`apiBase + path`) and a redacted body (password/secret/token/api_key fields replaced with `(redacted)`).

## Snipe-IT API quirk

Snipe-IT often returns **HTTP 200** with `{"status":"error","messages":…}` for validation errors. This server detects that envelope and surfaces the messages as a tool error (with `isError: true`), so callers never accidentally treat a Snipe-IT error as success. Successful envelopes (`{"status":"success","payload":…}`) are unwrapped automatically so tool data is the inner `payload`, not the outer wrapper.

---

## Develop

```bash
npm run dev               # tsx watch
npm test                  # unit + integration if env present
npm run test:unit         # unit only (CI-safe)
npm run test:integration  # live; requires SNIPEIT_API_TOKEN in .env
npm run lint
npm run typecheck
npm run codegen           # regenerate src/tools/generated from vendor/snipe-it-rest-api.json
npm run refresh-spec      # pull latest OpenAPI spec from snipe-it.readme.io
npm run inspector         # MCP Inspector
npm run build:mcpb        # build .mcpb installable bundle
```

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the layer diagram and data flow. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for adding hand-wrappers, regenerating the codegen layer, and debugging.

## Security

- API token is read from `SNIPEIT_API_TOKEN` env only. Never hard-coded. `.env` is git-ignored.
- The logger redacts known secret patterns (Bearer tokens, JWTs, `api_token` fields, `Authorization` header) before any output.
- All MCP stdio output goes to `stderr` only — `stdout` is reserved for the protocol.
- **If your token has ever been pasted into a chat or commit, rotate it.**

## License

MIT.
