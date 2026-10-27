# Modernization design (2026-10-27)

## Goal

Audit and modernize the-real-snipeit-mcp so it lasts for years as a gateway backend.

The server runs in production behind a private MCP gateway that runs it from source. The gateway builds it with
`npm ci --no-audit --no-fund && npm run build` on Node 24, starts `node --env-file=<repo>/.env dist/index.js`
over stdio, prefixes tool names, aborts a deploy if the tool count drops by more than 20 % and logs
schema fingerprint changes. Its Python MCP client negotiates up to protocol 2026-07-28.

Baseline: branch `modernize/2026-10-27` = `main` (v0.1.7, 5f714a9) plus fce2c98, which ports the
production state by content. `src/` is byte-identical to production.

## Contract

- Every existing tool name stays.
- Required parameters and defaults stay, with one named exception: `snipeit_gen_hardwareidrestore`,
  `snipeit_gen_maintenances_copy` and `snipeit_gen_maintenances_copy_1` gain a required `id`
  (they could never work before, see decision 6).
- New tools are allowed.
- New environment variables are optional and have a safe default.
- A committed tool contract fixture, generated from the production `tools/list`, enforces this in tests.

## Done criteria

1. All decisions in "Fix now" below are implemented, each with a test written first.
2. The tool contract test passes: names, required arrays, defaults and annotations match the
   fixture, except the named change above; the tool count does not drop.
3. Lint, typecheck and unit tests are green; the full suite runs once per change.
4. Container proof: a clean `npm ci --no-audit --no-fund && npm run build` on Node 24 in a container,
   then `tools/list` and an `initialize` handshake over stdio against `dist/index.js` (no Snipe-IT call).
5. An independent review of the whole diff, with at most one follow-up round on changed lines.
6. Red team verdict JA before anything reaches `main`.
7. Audit report and backlog committed; every minor not fixed is listed in `docs/BACKLOG.md`.

## Decisions (condensed)

Target version 0.2.0: the SDK major and the Node floor raise are breaking for npm consumers.
The server version comes from `package.json` as the single source.

### Fix now

| # | Decision | Reason |
|---|----------|--------|
| 1 | Network errors are retried only for idempotent methods (GET, PUT, DELETE); POST and PATCH retry only connect-phase errors (`ECONNREFUSED`, `ENOTFOUND`, `EAI_AGAIN`) where nothing was sent. | A blind retry of a POST can create duplicate assets or checkouts. |
| 2 | The request timeout covers the whole attempt including the body read. | A slow body could otherwise hang a tool call forever. |
| 3 | Redirects are never followed (`redirect: 'manual'`); any 3xx becomes an error naming status and Location. | Following redirects can leak the API token and bypass the base URL pin. |
| 4 | Binary responses are not decoded; the tool returns metadata (content type, size, filename). | Decoded binary bloats the model context and is useless as text. |
| 5 | Result size cap via optional `SNIPEIT_MAX_RESULT_BYTES` (default 1 MiB, minimum 64 KiB); `all: true` pagination stops at the cap and reports `truncated`, `next_offset`, `total`; other oversized results are cut as valid JSON with a marker; a hard upper bound on body reads. | Unbounded results exhaust memory, the stdio line limit and the model context. |
| 6 | Codegen turns `:name` path segments into `{name}` with a synthesized required path parameter and fails if a raw placeholder survives. Exactly three tools gain a required `id`. | These three tools sent literal `:id` to the API and never worked. |
| 7 | Codegen emits zod 4 forms (`.guid()` instead of `.uuid()`, and the zod 4 forms of url, email, datetime, passthrough where the template uses them). | zod 4 `.uuid()` is strict and rejects ids Snipe-IT accepts; generated output should not change today. |
| 8 | The write guard fails closed: only `false`, `0`, `no`, `off` disable it; anything else keeps it on, with one warning for unrecognised values; the effective state is logged once at startup. | A typo must never silently enable writes. |
| 9 | `snipeit_bulk_checkout` honours cancellation between items and passes the signal to each request; one info log line per item without PII. | A cancelled bulk run must stop, and partial progress must be traceable. |
| 10 | `snipeit_create_maintenance` keeps `title` required and sends it as both `name` and `title`; the description is corrected (supplier_id required, enum value `PAT Test`). | Snipe-IT 8.x expects `name`; the contract keeps `title`. |
| 11 | The live integration test runs only with `SNIPEIT_LIVE_TESTS=1` and a token. | A plain `npm test` must never touch a real instance. |
| 12 | Tool contract test against a committed fixture from the production `tools/list`. | The gateway contract must be enforced by a test, not by memory. |
| 13 | Migrate to `@modelcontextprotocol/server` v2 (entry via `serveStdio` with legacy serving), modelled on action1-mcp; protocol tests for 2025-06-18, 2025-11-25 and 2026-07-28; set the tool input element limit if the SDK offers one; document the stdio line limits; document the expected schema fingerprint change in CHANGELOG and an ADR. | SDK v1 is end of line; the gateway client negotiates 2026-07-28. |
| 14 | Node floor `>=22.12`, `@types/node` ^22, CI matrix 22/24/26 with SHA-pinned actions, read-only permissions, and the full check chain including the contract test and `npm audit`. | Node 20 is end of life; production runs 24. |
| 15 | Remove the broken MCPB bundle again, as v0.1.7 did. | It does not build a working bundle and misleads users. |
| 16 | Release workflow modelled on action1-mcp (tag equals version on main, SBOM, checksums, provenance, GitHub release, npm publish gated by a repo variable and OIDC), triggered only by a pushed `v*` tag; Dependabot config; maintainer release doc. | Reproducible, attested releases without manual steps. |
| 17 | Version 0.2.0 in package and lockfile with a single version source; CHANGELOG in Keep a Changelog format, 0.1.6/0.1.7 entries restored, 0.2.0 lists every caller-visible change (security fixes from production, write guard default on, zod 4 schema drift, stdio line limit, new env var). | Callers must be able to see every behaviour change in one place. |
| 18 | Docs match code (README, ARCHITECTURE, CONTRIBUTING, SECURITY, `.env.example`, server instructions, wrong tool descriptions such as delete_hardware being a restorable soft delete); no fixed numbers no test holds; add AGENTS.md and CLAUDE.md. | Wrong docs cause wrong tool use by models and maintainers. |
| 19 | Audit report `docs/audit/2026-10-27-audit.md` with evidence, verdict and status per finding; every unfixed minor in `docs/BACKLOG.md`. | Findings must be traceable to a fix or a backlog line. |

### Not now (backlog)

Prompt-injection framing of tool output, PII masking, self-confirm binding or read-only mode,
preview accuracy, audit logging of writes, running checks in prebuild during the gateway build,
dotenv removal, rejecting http base URLs, an overall deadline and cancellation for all tools,
multipart uploads, the settings resource path, pagination default text, description wording of
generated tools, a codegen drift test (unless trivial) and an upstream spec refresh (a vendor call
and an owner decision).

Reason: none of these is a reproduced defect with user or operations impact in the current
deployment; each is recorded in `docs/BACKLOG.md` for the next run in its area.
