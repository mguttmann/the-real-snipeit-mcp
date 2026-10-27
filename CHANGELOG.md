# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.1] - 2026-10-27

Closes the minors of the 2026-10-27 audit and modernization run (`docs/BACKLOG.md`, "Done 2026-10-27 (minors run)"). The gateway contract holds: every tool name, required parameter, top-level default and annotation is unchanged and the tool count stays 183 (`tests/unit/toolContract.test.ts`). With no new variable set, writes, the write guard and `confirm: "YES"` behave as in 0.2.0. It also prepares the repository to be public and the npm package to be published from GitHub Actions.

### Added
- New optional environment variables, all off by default:
  - `SNIPEIT_READ_ONLY` (default `false`): refuse every write at runtime with a `READ_ONLY` tool error; all tools stay registered and reads work.
  - `SNIPEIT_REQUIRE_PREVIEW` (default `false`): with the write guard on, `confirm: "YES"` executes only after a preview of the identical request in the last 10 minutes, once per preview. Off keeps `confirm: "YES"` working in the first call.
  - `SNIPEIT_REDACT_PII` (default `false`): mask personal data (`email`, `employee_num(ber)`, `phone`, `mobile`, `address`, `address2`, `username`, `first_name`, `last_name`, and `name` of person objects) in tool results.
  - `SNIPEIT_CALL_DEADLINE_MS` (default `0` = no deadline): overall deadline for one tool call across retries, backoffs and `all: true` pagination; a call past it ends with `DEADLINE_EXCEEDED`, `all: true` returns the rows so far with `truncated: true` and `next_offset`.
  - The three switches accept `true|1|yes|on` and `false|0|no|off`; an unrecognised value turns the switch on and logs a warning.
- Cancellation for every tool: an MCP cancellation (or a closed client) aborts the running HTTP request and any retry backoff at once.
- Optional parameters (from the vendored spec): `status_id` on `snipeit_checkout_hardware` and `snipeit_checkin_hardware`, `name` on `snipeit_checkin_hardware`, `status_id`, `checkout_at` and `expected_checkin` on the items of `snipeit_bulk_checkout`; `status`, `assigned_to`, `order_number` and `filter` on `snipeit_list_hardware`; `offset` on `snipeit_search_hardware`; `deleted` on `snipeit_get_hardware_by_tag` and `snipeit_get_hardware_by_serial`; `status_type` on `snipeit_list_statuslabels`.
- Write previews carry `status: "preview"` in the text and `_meta: {"snipeit/preview": true}`, and show the query parameters (secret-named keys redacted). They stay normal results, not `isError`.
- Info log lines: one per executed write request (method, URL path, status or error code; no query, no body), one per preview, refusal and confirmed execution (tool, method, URL), and at startup the names (never values) of the variables a `.env` added plus every configuration warning.
- `snipeit://hardware/summary` adds `partial: true` and `errors[]` when a count failed (the count stays `-1`).
- Release preparation for a public repository:
  - `NOTICE`: the project is unofficial and not affiliated with or endorsed by Grokability or Snipe-IT; the vendored API description `vendor/snipe-it-rest-api.json` comes from the Snipe-IT API documentation, states no license and is not covered by the MIT License; the generated tool descriptions derive from it. Shipped in the npm package.
  - `server.json` for the official MCP Registry (`io.github.mguttmann/the-real-snipeit-mcp`, npm package, stdio, every environment variable) and `mcpName` in `package.json`; `glama.json` names the Glama maintainer.
  - `.github/workflows/mcp-registry.yml`: lists each stable release in the MCP Registry after the npm publish (pinned, checksum-verified `mcp-publisher`, GitHub OIDC); `release.yml` calls it.
  - README: unofficial notice, maintenance status, install paths (npx, global, from source, pinned install for gateways with `npm audit signatures`); `SECURITY.md`: private vulnerability reporting, best-effort handling, release verification; `docs/maintainers/repo-settings.md`: the GitHub and npm settings the workflows assume.
  - `tests/unit/releaseWorkflow.test.ts` (workflows parsed as YAML, `server.json` and `glama.json` against `package.json`) and `tests/unit/publicHygiene.test.ts` (no private deployment details in tracked files).

### Changed
- Schema fingerprints (no contract change): the title and description of all 145 `snipeit_gen_*` tools (now `METHOD /path` and `METHOD /path: <spec description>. Generated from Snipe-IT OpenAPI operation <id>.`; the two file-upload tools add that uploads do not work through them); the descriptions of `snipeit_audit_hardware`, `snipeit_checkin_accessory`, `snipeit_checkin_component`, `snipeit_checkout_accessory`, `snipeit_checkout_component`, `snipeit_checkout_consumable`, `snipeit_checkout_license_seat`, `snipeit_create_hardware`, `snipeit_create_maintenance`, `snipeit_get_hardware_by_tag`, `snipeit_get_license_seats`, `snipeit_get_location`, `snipeit_get_statuslabel_assets`, `snipeit_get_user_assets`, `snipeit_list_accessories`, `snipeit_list_components`, `snipeit_list_consumables`, `snipeit_list_hardware`, `snipeit_list_licenses`, `snipeit_list_locations`, `snipeit_list_maintenances`, `snipeit_list_statuslabels`, `snipeit_list_users`, `snipeit_me`, `snipeit_raw_request` and `snipeit_update_hardware` (em dashes replaced); the input schemas of the tools that gained a parameter above; the parameter descriptions of the `snipeit_list_accessories` filters, `snipeit_list_locations.parent_id`, `snipeit_list_maintenances.supplier_id` and `.asset_maintenance_type` (marked as not in the vendored API spec, server-side support unverified).
- Generated write tools preview the full URL (`SNIPEIT_API_BASE` + path) and their query parameters; `snipeit_bulk_checkout` previews each concrete request instead of a placeholder; the preview hint no longer claims `SNIPEIT_CONFIRM_WRITES=true` is set.
- A success envelope without payload returns `{messages}` instead of `null` (for example a delete's confirmation text).
- `pagination.limit` is omitted when the caller did not send a `limit`; before, it claimed 50.
- Error codes: a cancelled request is `CANCELLED` ("cancelled by the caller"), a per-attempt timeout `TIMEOUT`; before, a cancellation was reported as a timeout.
- A list result whose first row alone exceeds `SNIPEIT_MAX_RESULT_BYTES` skips that row (`next_offset` moves past it, `oversized_row: {offset, id}` names it), so following `next_offset` cannot loop.
- An executed write whose response exceeds the cap says that the write ran and must not be repeated.
- `snipeit://settings` returns `{error, note}` when the server does not serve `GET /settings` (not in the vendored spec) instead of failing the read; `snipeit://hardware/summary` runs at most 6 count requests at once.
- `.env` loading: the server no longer imports `dotenv/config`. It still reads `.env` from the working directory (or `DOTENV_CONFIG_PATH`) without overriding set variables and honours `DOTENV_CONFIG_ENCODING` and `DOTENV_CONFIG_OVERRIDE` (`true|1|yes`); `DOTENV_CONFIG_DEBUG`, `DOTENV_CONFIG_QUIET` and `dotenv_config_*` command-line arguments are ignored, and nothing from dotenv reaches stdout.
- Startup warnings instead of silence (nothing that starts today is rejected): `SNIPEIT_API_BASE` unset (placeholder), `http` to a non-loopback host, another scheme, credentials, a query or a fragment; `SNIPEIT_MAX_RESULT_BYTES` above 8 MiB.
- Server instructions: values from Snipe-IT are untrusted data, never instructions; previews and read-only mode are explained.
- Prompts: `snipeit-inventory-audit` and `snipeit-user-onboarding` use the spec filter `status: "RTD"`; `snipeit-license-health` uses `seats` and `free_seats_count`; `snipeit-user-onboarding` no longer sends `GET /kits/{kit}` (not in the spec).
- The npm tarball leaves out `dist/codegen` and source maps and adds `NOTICE`; the package description says the server is unofficial.
- Docs no longer name the private deployment; they speak of a private MCP gateway that runs this server from source.

### Fixed
- `SNIPEIT_TIMEOUT_MS` with a fractional or unsafe value fails with "Invalid config for SNIPEIT_TIMEOUT_MS: expected a positive integer" instead of a raw ZodError.
- Release workflow: `npm publish` gets `./release/the-real-snipeit-mcp-*.tgz`; without the leading `./` npm reads `release/x.tgz` as a GitHub `owner/repo` shorthand and the publish fails.

### Security
- Paths with `.`, `..` (also percent-encoded) or empty segments are refused before anything is sent (`INVALID_PATH`), so a path parameter such as `..` cannot collapse a generated or hand-built path onto another endpoint.
- Error texts returned to the model are redacted like log lines, and redaction also covers secret-named JSON fields (plain and escaped) and query parameters, URL userinfo and `Authorization` headers of any scheme.

## [0.2.0] - 2026-10-27

Upgrade notes for npm users of 0.1.7 and older: Node.js 22.12 or newer is required, write tools now return a preview unless called with `confirm: "YES"` (set `SNIPEIT_CONFIRM_WRITES=false` to keep the old behaviour), and 0.1.7 and older can send the API token to a host other than `SNIPEIT_API_BASE` (see Security). A production build from source reported version 0.1.5 while already carrying the token pin, the write guard default, the spec token stripping and the zod upgrade; 0.2.0 joins that lineage and the npm lineage again.

### Security
- The API token never leaves `SNIPEIT_API_BASE`: every request is pinned to its origin and path prefix, and a path that resolves elsewhere (absolute URL, `//host`, `/\host`, scheme change, `../` including percent-encoded dots) is refused before any request is sent; the `Authorization` header is only attached on an origin match. In 0.1.7 and older, `snipeit_raw_request` with an absolute URL as `path` sent the bearer token to that host (audit release-public-01).
- Redirects are never followed (`redirect: "manual"`): any 3xx becomes a tool error naming the status and `Location`. Before, a write could be turned into a GET by a 301/302 and reported as success, and a redirect could leave the pinned base path.
- Non-idempotent writes are never replayed: network errors are retried only for GET, PUT and DELETE; POST and PATCH are retried only when the connection was never established (`ECONNREFUSED`, `ENOTFOUND`, `EAI_AGAIN`). Before, a dropped connection could execute a checkout or create up to three times.
- `SNIPEIT_CONFIRM_WRITES` is parsed fail-closed: only `false`, `0`, `no` or `off` (trimmed, any case) disable the write guard. An empty value or a typo keeps it on and logs one warning; the effective guard state is logged to stderr once at startup. Before, any value other than a recognised truthy one disabled the guard.
- `zod` `^3.24.1` -> `^4.6.7` (GHSA-mrhx-c7xc-m3w5: a very large array in tool input could exhaust memory during schema validation).
- One `tools/call` may carry at most 100000 array elements and object members in its arguments (`maxToolInputElements`, GHSA-46jr-4wx8-v453); larger payloads are rejected with InvalidParams before schema validation.
- `npm run refresh-spec` strips the readme.io explorer `Authorization` entries from the vendored OpenAPI spec, so no token is committed with it.

### Changed (breaking)
- Node.js 22.12 or newer is required (`engines` was `>=20`; Node 20 is end of life). A consumer on Node 20 stays on 0.1.x.
- `SNIPEIT_CONFIRM_WRITES` defaults to on: destructive tools return a redacted preview unless called with `confirm: "YES"`. Set `SNIPEIT_CONFIRM_WRITES=false` to execute writes directly as 0.1.7 did by default.
- MCP SDK v2: `@modelcontextprotocol/server` ^2.4.0 replaces `@modelcontextprotocol/sdk` 1.x (`docs/adr/0001-mcp-sdk-version.md`). Clients that send `initialize` (2025-11-25, 2025-06-18 and older) are served as before; clients that open with protocol revision 2026-07-28 are now served on that revision.
- `snipeit_gen_hardwareidrestore`, `snipeit_gen_maintenances_copy` and `snipeit_gen_maintenances_copy_1` take a new required `id`. The spec writes their paths as `/hardware/:id/restore` and `/maintenances/:id`; the generated tools sent a literal `:id` and could never address a record. The code generator now turns `:name` segments into path parameters and fails if a raw placeholder survives.

### Changed
- `tools/list` schemas changed on every tool. Names, annotations, properties, required parameters and defaults are unchanged except for the three tools above (`tests/unit/toolContract.test.ts`). Descriptions changed for `snipeit_delete_hardware`, `snipeit_create_maintenance` (and its `supplier_id` and `asset_maintenance_type` parameters), `snipeit_bulk_checkout`, the `all` parameter of the list tools and `snipeit_search_hardware` (result cap), `snipeit_list_maintenances.asset_maintenance_type`, and the `path` parameter of `snipeit_raw_request` (already in the production build). Schema changes on every tool:
  - zod 4: `additionalProperties: false` is no longer emitted, integer fields carry safe-integer `minimum`/`maximum` bounds, and `z.record` fields carry `propertyNames: {"type": "string"}`. Unknown argument keys are still stripped silently at runtime.
  - SDK v2: `inputSchema.$schema` is `https://json-schema.org/draft/2020-12/schema` (was draft-07), and the v1-only field `execution: {"taskSupport": "forbidden"}` is gone.
- Stdio message size: a single inbound message larger than 10 MiB closes the stdio transport and ends the server process. This limit came with SDK 1.30.0 without an SDK changelog entry and stays in v2. TypeScript SDK clients apply the same 10 MiB limit to the server's responses; keep `SNIPEIT_MAX_RESULT_BYTES` well below it.
- The server instructions (`initialize`) describe the fail-closed write guard, the result cap with `truncated`/`next_offset` and binary metadata results.
- `serverInfo.version` is read from `package.json`, the single version source (the production build had reported 0.1.5).
- The code generator emits zod 4 format schemas (`z.guid()` for `format: uuid`, `z.url()`, `z.email()`, `z.iso.datetime()`, `.loose()`); the vendored spec reaches none of them, so no generated tool changed.

### Added
- `SNIPEIT_MAX_RESULT_BYTES` (optional, default `1048576` = 1 MiB, minimum `65536`): cap for one tool result. List tools with `all: true` stop paginating at the cap and return the rows so far with `truncated: true`, `next_offset` and `total`; any other oversized result is shortened to valid JSON with a truncation marker. One HTTP response body is never buffered beyond the larger of 16 MiB and 4 times the cap (`RESPONSE_TOO_LARGE` error).
- Binary responses (content type not JSON, XML or `text/*`, for example backup zips, uploaded files, images, PDFs) are no longer decoded as text: the tool returns `{binary: true, content_type, size_bytes, size_exact, filename, note}`.
- `snipeit_bulk_checkout` honours cancellation: it stops before the next item, passes the cancel signal to each request, reports `aborted` and `not_attempted` in the summary, and logs each executed item (asset_id, outcome, HTTP status; no names) at info level.
- Release workflow on `v*` tags with SBOM, checksums, provenance attestation and gated npm trusted publishing (`docs/maintainers/release.md`); Dependabot configuration; tool contract and protocol revision tests (`npm run test:contract`). CI tests Node 22, 24 and 26 with SHA-pinned actions and runs `npm audit --omit=dev --audit-level=high`.

### Fixed
- `SNIPEIT_TIMEOUT_MS` covers the whole attempt including the body read; before, a stalled response body hung the call far beyond the timeout.
- `snipeit_create_maintenance` sends `title` as both `name` (required by Snipe-IT 8.x) and `title`; `title` stays the required input. Its description states that the 8.2.0 API requires `supplier_id` and spells the enum value `PAT Test`.
- `snipeit_delete_hardware` description: Snipe-IT soft-deletes assets, which `snipeit_gen_hardwareidrestore` restores; it said "Irreversible".
- Live integration tests run only with `SNIPEIT_LIVE_TESTS=1` in the real environment and a token; a plain `npm test` never reaches a Snipe-IT instance.

### Removed
- The MCPB bundle (`mcpb/`, `scripts/build-mcpb.sh`, `build:mcpb`) again, as in 0.1.7: its manifest was invalid and the bundle could not be installed.
- The `prepublishOnly` script of 0.1.6; `prepack` now cleans `dist/` and builds (the build runs lint, typecheck and unit tests first), and `publishConfig.provenance` makes a publish outside the release workflow fail.


## [0.1.7] - 2026-06-14

### Removed
- Trimmed to a minimal, lean public footprint: removed `ARCHITECTURE.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, the MCPB bundle (`mcpb/` + `scripts/build-mcpb.sh`), the auto-publish workflow (`.github/workflows/release.yml`), the feature-request issue template, and the PR template.
- Dropped redundant devDependencies (`@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser` - supplied transitively by `typescript-eslint`; `@vitest/coverage-v8`) and unused npm scripts (`build:mcpb`, `lint:fix`, `format:check`, `coverage`).

### Fixed
- `package-lock.json` root version synced to the release version (was stale at an older version).
- CHANGELOG footer links no longer point at unpushed historical tags.

## [0.1.6] - 2026-06-14

### Added
- README narrative hook, badges (npm, CI, license, Node, MCP), Quick-Start prerequisites.
- README warning that `SNIPEIT_API_BASE` default is an RFC 2606 placeholder.
- README note that `npm start` blocks on stdio (intentional, not a hang).
- `.github/workflows/ci.yml` - lint + typecheck + tests on Node 20 and 22.
- `.github/workflows/release.yml` - npm publish + GitHub Release on tag push (with tag-name validation against injection).
- `.github/ISSUE_TEMPLATE/{bug_report,feature_request,config}.yml` - structured issue intake.
- `.github/PULL_REQUEST_TEMPLATE.md` - PR checklist.
- `SECURITY.md` - private vulnerability reporting policy.
- `CODE_OF_CONDUCT.md` - Contributor Covenant 2.1.
- `prepublishOnly` script - guarantees the published tarball passed lint + typecheck + tests + build.

### Changed
- README first-touch experience rewritten: narrative > feature inventory.
- `.env.example` reformatted with grouped sections and inline explanations.
- CHANGELOG migrated to Keep a Changelog format.
- `package.json` keywords expanded with `claude-desktop`, `claude-code`.

### Fixed
- README tool count: `39 hand-wrappers` → `38 hand-wrappers` (matches actual count).
- `.gitignore` now covers multi-agent coordination directories (`.team-state/`, `.claude/local/`).

### Security
- `npm audit fix` - patched HIGH-severity `esbuild` CVE (GHSA-gv7w-rqvm-qjhr) via `vitest` dependency tree.
- Release workflow validates pushed tag matches `v<MAJOR>.<MINOR>.<PATCH>` before using it in shell arguments.

## [0.1.5] - 2026-05-25

### Added
- First npm release: `the-real-snipeit-mcp@0.1.5`.
- `package.json` polished for npm publish: `author`, `repository`, `homepage`, `bugs`, `keywords`, `publishConfig.access: public`.

### Changed
- Repo switched from private to public on GitHub. (Correction 2026-10-27: the repository was private again at the time of the 2026-10-27 audit, finding release-public-08.)
- Default `SNIPEIT_API_BASE` neutralized to `https://snipe-it.example.com/api/v1` (RFC 2606 reserved).

## [0.1.4] - 2026-05-25

### Added
- `ARCHITECTURE.md` - layer diagram, data flow, codegen pipeline, file map.
- `CONTRIBUTING.md` - workflows for adding tools/resources/prompts, codegen regeneration, release process.
- README extended with full tool reference (hand-wrappers in tables, workflow recipes).
- JSDoc annotations on all exported functions across `client/`, `codegen/`, `tools/`, `config`, `logger`, `server`.
- Expanded inline code-comment block at the Snipe-IT status-envelope check.

## [0.1.3] - 2026-05-25

### Added
- Test coverage: `callWrite` preview full-URL path, `raw_request` preview full-URL path, summary auto-pagination.

### Changed
- `snipeit_raw_request` preview now shows full URL (consistency with `callWrite`).

### Fixed
- `schemaToZod`: recursively flatten nested `allOf` via `$ref`.

## [0.1.2] - 2026-05-25

### Added
- Auto-paginate `status-labels` and `categories` in `snipeit://hardware/summary` (was hardcoded `limit: 200`).
- `callList` preserves server-reported `total` when `all: true`.

### Changed
- Extracted shared `callJson` / `callWrite` helpers - removed duplication across 9 wrapper modules.
- `runGuarded` preview now shows full URL instead of bare path.
- Parallelized `snipeit://hardware/summary` per-label and per-category fan-out (was sequential).

### Fixed
- `schemaToZod`: resolve `$ref` inside `allOf` parts before merging (was a silent no-op).
- Dropped unnecessary intermediate cast in `codegen/generate.ts`.

## [0.1.1] - 2026-05-25

### Added
- `snipeit://hardware/summary` now includes `by_category` breakdown (spec §10).
- All 11 list tools accept `all?: boolean` to auto-paginate up to 10,000 rows (spec §7).
- Test coverage for timeout/AbortError path (`statusCode: 0`).
- Test coverage for `"api_token":"…"` redaction pattern.

### Fixed
- `snipeit://hardware/summary` wrapped in outer try/catch - network errors return `{error}` JSON instead of crashing the transport.
- 429 retry-after no longer mutates the `readonly details` field - constructs a new `SnipeitApiError` instead.

## [0.1.0] - 2026-05-25

### Added
- Initial release.
- 38 hand-wrapper tools: hardware (13), users (5), licenses (3), accessories (3), consumables (2), components (3), locations (2), status-labels (2), maintenances (2), bulk-checkout (1), identity (1), plus `snipeit_raw_request` escape hatch.
- ~145 auto-generated tools covering every operation in the Snipe-IT OpenAPI 3.1 spec.
- Resources: `snipeit://me`, `snipeit://settings`, `snipeit://hardware/summary`.
- Prompts: `inventory-audit`, `user-onboarding`, `license-health`.
- MCPB bundle for one-click Claude Desktop install.

[0.2.1]: https://github.com/mguttmann/the-real-snipeit-mcp/releases/tag/v0.2.1
[0.2.0]: https://github.com/mguttmann/the-real-snipeit-mcp/releases/tag/v0.2.0
[0.1.7]: https://github.com/mguttmann/the-real-snipeit-mcp/releases/tag/v0.1.7
