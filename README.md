# the-real-snipeit-mcp

An unofficial MCP server for the [Snipe-IT](https://snipeitapp.com) REST API: one generated tool for every operation in the vendored Snipe-IT OpenAPI 3.1 spec (read + write), hand-written wrappers for common workflows, stdio transport.

**Unofficial, not affiliated with Snipe-IT/Grokability.** This project is not affiliated with, endorsed by, sponsored by or supported by Grokability, Inc. or the Snipe-IT project. "Snipe-IT" is a trademark of its owner. The vendored API description and its license situation are described in [`NOTICE`](NOTICE).

**Three tool layers (183 tools):**
- **37 hand-wrappers** (`snipeit_*`): friendlier UX for common workflows
- **145 generated tools** (`snipeit_gen_*`): one per operation of the vendored spec (`vendor/snipe-it-rest-api.json`, Snipe-IT 8.2.0)
- **`snipeit_raw_request`**: escape hatch for any method and path under `SNIPEIT_API_BASE`

Plus **3 resources** and **3 prompts**. The counts are held by `tests/unit/docsFacts.test.ts`.

---

## Maintenance status

- Maintained on a best-effort basis by one maintainer ([@mguttmann](https://github.com/mguttmann)) in spare time. The author runs it in production behind a private MCP gateway. There is no support contract and no guaranteed response time.
- Security fixes take priority over features. Report vulnerabilities privately through GitHub Private Vulnerability Reporting, never in a public issue (see [`SECURITY.md`](SECURITY.md)).
- Dependency updates come from Dependabot; CI fails when a runtime dependency has a known high or critical advisory.
- Supported Node.js versions: 22.12 or newer (`engines` in `package.json`); CI tests Node 22, 24 and 26.
- Only the latest minor release gets fixes. Releases and their changes: [`CHANGELOG.md`](CHANGELOG.md).
- Issues and pull requests are welcome; see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Install

Requires Node.js 22.12 or newer. The server needs `SNIPEIT_API_BASE` (your instance, including `/api/v1`) and `SNIPEIT_API_TOKEN`; all other variables are optional (see [Configuration](#configuration)). Only the npm package `the-real-snipeit-mcp` and the MCP Registry name `io.github.mguttmann/the-real-snipeit-mcp` are this project.

### npx (any stdio MCP host)

`npx` fetches and runs the package; no clone or build is needed. Attach it to Claude Code (type the token in your shell, never into a chat):

```bash
claude mcp add snipeit \
  -e SNIPEIT_API_BASE=https://snipe-it.example.com/api/v1 \
  -e SNIPEIT_API_TOKEN=<token> \
  -- npx -y the-real-snipeit-mcp
```

Any other stdio host takes the same command in its JSON configuration (Claude Desktop: `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "snipeit": {
      "command": "npx",
      "args": ["-y", "the-real-snipeit-mcp"],
      "env": {
        "SNIPEIT_API_BASE": "https://snipe-it.example.com/api/v1",
        "SNIPEIT_API_TOKEN": "<token>"
      }
    }
  }
}
```

A configuration file with these values holds the token: keep it readable for your user only and out of version control. `the-real-snipeit-mcp@<version>` pins a version.

### Global install

```bash
npm install -g the-real-snipeit-mcp
```

The command is `the-real-snipeit-mcp`; use it as `"command"` in the host configuration above (without `args`).

### From source

```bash
git clone https://github.com/mguttmann/the-real-snipeit-mcp.git
cd the-real-snipeit-mcp
npm ci
cp .env.example .env
# edit .env: set SNIPEIT_API_BASE and SNIPEIT_API_TOKEN
npm run build        # prebuild runs lint, typecheck and the unit tests first
node --env-file=.env dist/index.js
```

`npm run inspector` opens the MCP Inspector against the built server.

### Pinned install for gateways and servers

For an unattended host, install an exact version from a committed lockfile, without install scripts and without dev dependencies, and check the registry signatures and provenance attestations:

```bash
mkdir snipeit-mcp && cd snipeit-mcp
npm init -y
npm install --save-exact --ignore-scripts the-real-snipeit-mcp@<version>   # once; commit package.json and package-lock.json
# on every deploy:
npm ci --omit=dev --ignore-scripts
npm audit signatures
node --env-file=/path/to/.env node_modules/the-real-snipeit-mcp/dist/index.js
```

Each release on [GitHub Releases](https://github.com/mguttmann/the-real-snipeit-mcp/releases) carries the npm tarball, a CycloneDX SBOM and `SHA256SUMS`; releases published by the release workflow carry an npm provenance statement and a GitHub build provenance attestation.

### MCP Registry and Glama

Each stable release is listed in the official [MCP Registry](https://registry.modelcontextprotocol.io) as `io.github.mguttmann/the-real-snipeit-mcp` (the npm package, with its environment variables). `glama.json` names the maintainer of the Glama listing.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `SNIPEIT_API_TOKEN` | (required) | Snipe-IT Personal API Token (JWT) |
| `SNIPEIT_API_BASE` | `https://snipe-it.example.com/api/v1` | API base URL. The default is an RFC 2606 placeholder; set your instance. The server starts with any valid URL but logs a warning when the placeholder is in use, when `http` goes to a non-loopback host (cleartext token), for other schemes, for credentials in the URL and for a query or fragment |
| `SNIPEIT_CONFIRM_WRITES` | `true` | If on (default), destructive tools require `confirm: "YES"`. Only `false`, `0`, `no` or `off` (any case) disable the guard; empty or unrecognised values keep it on and log a warning. The effective state is logged to stderr at startup |
| `SNIPEIT_TIMEOUT_MS` | `30000` | Timeout in ms per attempt (positive integer), covering the response headers and the full body read |
| `SNIPEIT_LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` |
| `SNIPEIT_MAX_RESULT_BYTES` | `1048576` (1 MiB) | Cap for one tool result (serialized JSON, bytes); minimum `65536`. Values above 8 MiB log a warning: TypeScript SDK clients read at most 10 MiB per message. Larger results are shortened to valid JSON with a truncation marker (see [Large and binary results](#large-and-binary-results)). One HTTP response body is never buffered beyond the larger of 16 MiB and 4 times this value. |
| `SNIPEIT_CALL_DEADLINE_MS` | `0` (none) | Overall deadline for one tool call in ms, across retries, backoffs and `all: true` pagination; `0` disables it. A call past the deadline ends with a `DEADLINE_EXCEEDED` tool error; `all: true` returns the rows collected so far with `truncated: true` and `next_offset` |
| `SNIPEIT_REDACT_PII` | `false` | Mask personal data in tool results with `(redacted)`: `email`, `employee_num(ber)`, `phone`, `mobile`, `address`, `address2`, `username`, `first_name`, `last_name` at any depth, and `name` of objects that describe a person. Asset, model and location names stay. Accepts `true`/`false` (also `1`/`0`, `yes`/`no`, `on`/`off`); an unrecognised value turns it on and logs a warning |
| `SNIPEIT_READ_ONLY` | `false` | Refuse every write at runtime with a `READ_ONLY` tool error; all tools stay registered and reads work. Same accepted values as `SNIPEIT_REDACT_PII`; an unrecognised value turns it on |
| `SNIPEIT_REQUIRE_PREVIEW` | `false` | While the write guard is on, `confirm: "YES"` executes only after a preview of the identical request in the last 10 minutes, once per preview. Off: `confirm: "YES"` executes in the first call. Same accepted values as `SNIPEIT_REDACT_PII` |

Variables come from the environment, from `node --env-file=<file>`, or from a `.env` in the working directory (or `DOTENV_CONFIG_PATH`), which never overrides a variable that is already set. The names (never the values) of the variables a `.env` added are logged to stderr at startup.

---

## Tool reference

### Hand-wrappers (37 tools)

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
| `snipeit_delete_hardware` | `DELETE /hardware/{id}` (soft delete; `snipeit_gen_hardwareidrestore` restores) | writeIdempotent |
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

#### Bulk (1)

| Tool | Behavior | Annotations |
|---|---|---|
| `snipeit_bulk_checkout` | Serially checks out up to 100 assets, returns a per-item success/error summary; on cancel it stops before the next item and reports `aborted` and `not_attempted`; logs each executed item (asset_id, outcome, HTTP status) to stderr | writeOnce |

**List tools** (`snipeit_list_*`) accept `limit?`, `offset?`, and `all?: boolean`. With `all: true`, the tool auto-paginates up to 10 000 rows or until the result would exceed `SNIPEIT_MAX_RESULT_BYTES`; in that case it returns the rows collected so far with `truncated: true`, `next_offset` and `total`, and you continue with `limit`/`offset`.

### Auto-generated tools (`snipeit_gen_*`)

Every operation (path and method) in the vendored Snipe-IT OpenAPI 3.1 spec is exposed as `snipeit_gen_<snake_operation_id>`. Each title is `METHOD /path`, and each description starts with `METHOD /path:` followed by the spec's description of the operation. The two file-upload operations (`POST /hardware/{id}/files`, `POST /models/{id}/files`) cannot upload: the vendored spec declares a JSON body, Snipe-IT expects multipart/form-data; their descriptions say so. Use these when the hand-wrapper layer doesn't cover what you need. GET tools have `readOnlyHint: true`; all other methods have `destructiveHint: true` and go through the write guard. Regenerate with `npm run codegen` after `npm run refresh-spec`.

### `snipeit_raw_request`

Escape hatch for anything else:
```ts
{ method: "PATCH", path: "/locations/4", body: { name: "HQ" } }
```
Its annotations are static (`destructiveHint: true`, `idempotentHint: false`) for every method. GET requests bypass the write guard; other methods honor `SNIPEIT_CONFIRM_WRITES`. The path must start with a single `/`; absolute URLs and paths that leave `SNIPEIT_API_BASE` are rejected.

---

## Resources

| URI | Description |
|---|---|
| `snipeit://me` | Current authenticated user (`GET /users/me`) |
| `snipeit://settings` | Server settings (`GET /settings`). This endpoint is not in the vendored 8.2.0 spec; when the instance does not serve it, the resource returns `{error, note}` instead of failing the read |
| `snipeit://hardware/summary` | `{total, by_status_label, by_category}`: aggregated counts, at most 6 count requests at a time. A count that failed (for example under API throttling) is `-1`, and the result then carries `partial: true` and `errors[]` |

## Prompts

| Prompt | Args | Purpose |
|---|---|---|
| `snipeit-inventory-audit` | none | Lists overdue/due audits + unassigned assets, then summarizes |
| `snipeit-user-onboarding` | `user_id`, optional `kit` | Suggests a checkout sequence for a new user |
| `snipeit-license-health` | none | Seat usage + licenses expiring within 90 days |

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

1. `snipeit_list_audit_overdue(all: true)`: full list, auto-paginated
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

The write guard is on by default: every tool with `destructiveHint: true` returns a **redacted preview** instead of executing; re-invoke it with `confirm: "YES"` to execute. The preview names the tool, the method, the URL, the query parameters and a redacted body (password/secret/token/api_key fields replaced with `(redacted)`); `snipeit_bulk_checkout` lists each concrete request. A preview is a normal result, not an error: its text has `status: "preview"` and its `_meta` carries `"snipeit/preview": true`, so a client can tell it from an executed write without parsing. Every write tool shows the full URL (`SNIPEIT_API_BASE` + path).

Only `SNIPEIT_CONFIRM_WRITES` set to `false`, `0`, `no` or `off` (trimmed, any case) disables the guard so write tools execute directly. Unset, `true`/`1`/`yes`/`on`, an empty value or anything else keeps it on; an empty or unrecognised value also logs a warning. The effective state is logged to stderr once at startup.

`confirm` is set by the model, so the guard catches a model that forgets it, not a prompt injection in Snipe-IT data that adds it; human approval has to come from the MCP host or gateway. Two optional switches tighten it on the server side:

- `SNIPEIT_READ_ONLY=true` refuses every write with a `READ_ONLY` tool error; all tools stay registered (the tool list does not change) and reads work, including `snipeit_raw_request` with GET.
- `SNIPEIT_REQUIRE_PREVIEW=true` (with the guard on) executes `confirm: "YES"` only after a preview of the identical request in the last 10 minutes, once per preview, so every write is previewed first.

Every preview, refusal and confirmed execution logs one info line (tool, method, URL), and every executed write request logs one info line with its HTTP status (no query, no body).

## Snipe-IT API quirk

Snipe-IT often returns **HTTP 200** with `{"status":"error","messages":…}` for validation errors. This server detects that envelope and surfaces the messages as a tool error (with `isError: true`), so callers never accidentally treat a Snipe-IT error as success. Successful envelopes (`{"status":"success","payload":…}`) are unwrapped automatically so tool data is the inner `payload`, not the outer wrapper.

## Large and binary results

- **Size cap.** Every tool result is limited to `SNIPEIT_MAX_RESULT_BYTES` (default 1 MiB). Lists (`{total, rows}`) keep the leading rows that fit and gain `truncated: true` and `next_offset`; the pagination hint is adjusted to match. Top-level arrays keep the leading items with a `truncated` object next to `data`. Any other oversized result is replaced by `{truncated: true, size_bytes, max_result_bytes, note}`. The output is always valid JSON, never a cut string.
- **Body read bound.** A single HTTP response body is read up to the larger of 16 MiB and 4 times `SNIPEIT_MAX_RESULT_BYTES`; a larger JSON or text body fails with a `RESPONSE_TOO_LARGE` tool error instead of being buffered.
- **Binary downloads.** Responses whose content type is not JSON, XML or `text/*` (for example backup zips, uploaded files, images, PDFs) are not decoded. The tool returns `{binary: true, content_type, size_bytes, size_exact, filename, note}`; download the file from Snipe-IT directly if you need its content.
- **Timeouts, retries, redirects.** `SNIPEIT_TIMEOUT_MS` covers each attempt including the body read. 429 is always retried; 5xx and network errors are retried only for idempotent methods (GET, PUT, DELETE); POST and PATCH are retried only when the connection was never established (`ECONNREFUSED`, `ENOTFOUND`, `EAI_AGAIN`), so a write is never sent twice. Redirects are never followed. A cancelled tool call (MCP cancellation or a closed client) aborts its HTTP request and any retry backoff at once; `SNIPEIT_CALL_DEADLINE_MS` optionally bounds a whole call.

---

## Develop

```bash
npm run dev               # tsx watch
npm test                  # unit; live tests only with SNIPEIT_LIVE_TESTS=1
npm run test:contract     # gateway tool contract + protocol revisions
npm run test:unit         # unit only (CI-safe)
SNIPEIT_LIVE_TESTS=1 npm run test:integration  # live; also needs SNIPEIT_API_TOKEN
npm run lint
npm run typecheck
npm run codegen           # regenerate src/tools/generated from vendor/snipe-it-rest-api.json
npm run refresh-spec      # pull latest OpenAPI spec from snipe-it.readme.io
npm run inspector         # MCP Inspector
```

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the layer diagram and data flow. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for adding hand-wrappers, regenerating the codegen layer, and debugging.

## Security

- API token is read from `SNIPEIT_API_TOKEN` env only. Never hard-coded. `.env` is git-ignored.
- Versions 0.1.7 and older can send the token to another host through `snipeit_raw_request` with an absolute URL; upgrade to 0.2.0 or newer (see `CHANGELOG.md`).
- The logger and every error text returned to the model redact known secret patterns (Bearer tokens, JWTs, `Authorization` headers of any scheme, `api_token`/`password`/`secret`/`token`/`api_key` fields and query parameters, URL userinfo).
- Tool results carry Snipe-IT data, including personal data of users (names, e-mail addresses, employee numbers), to the MCP client and its model provider. `SNIPEIT_REDACT_PII=true` masks those fields; see `SECURITY.md`.
- Every request is pinned to the `SNIPEIT_API_BASE` origin and path; redirects are never followed (any 3xx becomes a tool error naming the status and `Location`), so a misconfigured base URL (for example `http://` behind an HTTPS redirect) fails loudly instead of turning a write into a silent GET.
- All log output goes to `stderr` only; `stdout` is reserved for the MCP protocol.
- **If your token has ever been pasted into a chat or commit, rotate it.**

## License

MIT (see [`LICENSE`](LICENSE)). The vendored Snipe-IT API description is not covered by it; see [`NOTICE`](NOTICE).
