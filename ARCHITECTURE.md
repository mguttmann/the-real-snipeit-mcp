# Architecture

> Layer diagram, data flow, and design rationale for the-real-snipeit-mcp.

## Goals

1. **Every API operation** of the vendored OpenAPI spec as a tool, generated instead of hand-written (`tests/unit/docsFacts.test.ts` checks one generated tool per operation).
2. **Friendly UX** for the most-used workflows (checkout, audit, hardware lookup, user assignments).
3. **Robust against Snipe-IT's HTTP-200-error-envelope quirk**: failures never silently look like success.
4. **Safe-by-default writes**: the confirmation gate for destructive operations is on unless `SNIPEIT_CONFIRM_WRITES` explicitly disables it.
5. **Stdio MCP transport** so the server runs as a local subprocess (Claude Desktop, an MCP gateway) without a network listener.

## Layer diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  MCP client (Claude Desktop, MCP Inspector, custom client)     │
└─────────────────────────────────────────────────────────────────┘
                              │ stdio
                              │ (JSON-RPC over stdin/stdout)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  src/index.ts          - entry, quiet .env load, startStdio    │
│  src/stdio.ts          - serveStdio: 2025 and 2026-07-28 eras  │
│  src/server.ts         - buildServer() registers everything    │
│                          and runs each handler in a call scope │
└─────────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┴────────────────┐
            ▼                                  ▼
┌──────────────────────┐         ┌──────────────────────────────┐
│   Tools (3 layers)   │         │  Resources + Prompts          │
├──────────────────────┤         ├──────────────────────────────┤
│ • snipeit_raw_request│         │ snipeit://me                 │
│ • snipeit_* (hand)   │         │ snipeit://settings           │
│ • snipeit_gen_*      │         │ snipeit://hardware/summary   │
│   (codegen)          │         │ snipeit-inventory-audit       │
│                      │         │ snipeit-user-onboarding       │
│                      │         │ snipeit-license-health        │
└──────────────────────┘         └──────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│  src/tools/helpers.ts                                           │
│  • callJson(ctx, GET, path, query?)                            │
│  • callWrite(ctx, args, toolName, method, path, body?)         │
│  • callList(client, path, args): supports all?: boolean,       │
│    stops at SNIPEIT_MAX_RESULT_BYTES (truncated, next_offset)  │
│  • jsonResult(data): caps every result at the same size,       │
│    always valid JSON                                           │
│  • runGuarded(...): gates writes unless the guard is disabled  │
└─────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│  src/client/snipeitClient.ts                                    │
│                                                                 │
│  1. Build URL (apiBase + path + query); refuse '.', '..' and   │
│     empty path segments (INVALID_PATH)                         │
│  2. Set headers: Authorization: Bearer <token>, Accept: JSON   │
│  3. Apply timeout via AbortController (whole attempt,          │
│     headers and body read) plus the call's cancel signal and   │
│     optional SNIPEIT_CALL_DEADLINE_MS (callScope.ts)           │
│  4. withRetry: 429 always; 5xx and network errors only if      │
│     idempotent; POST/PATCH only on connect-phase errors;       │
│     a cancelled call stops, also during the backoff            │
│  5. Any 3xx → throw SnipeitApiError (redirects never followed) │
│     Binary content type → count bytes, return metadata only    │
│     else read body, bounded by max(4 x result cap, 16 MiB)     │
│  6. !res.ok → throw SnipeitApiError (message redacted)         │
│  7. 🔑 ENVELOPE CHECK:                                         │
│     - {status: "error"}  → throw SnipeitApiError               │
│     - {status: "success"} → unwrap to payload, or {messages}   │
│       when there is no payload                                 │
│  8. Extract pagination hint from {total, rows} payload         │
│  9. Return { data, status, headers, pagination? }              │
│  10. Every write (non-GET) logs one info line: method, path,   │
│      status or error code                                      │
└─────────────────────────────────────────────────────────────────┘
            │
            ▼
            HTTPS to Snipe-IT (snipe-it.example.com)
```

## Module boundaries

| Module | Knows about | Does NOT know about |
|---|---|---|
| `src/client/` | HTTP, Snipe-IT envelope, retry, pagination | MCP, McpServer, tool annotations |
| `src/codegen/` | OpenAPI 3.1 JSON, Zod source code | runtime MCP behavior (writes files only) |
| `src/tools/` | McpServer, Zod schemas, `SnipeitClient` | spec internals, low-level HTTP |
| `src/resources/` | McpServer, `SnipeitClient` | tool schemas |
| `src/prompts/` | McpServer | data fetching (just text templates) |
| `src/utils/logger.ts` | `stderr`, redaction patterns | everything else (single-purpose) |

The strict layering means `client/` is **independently testable** (mock fetch, assert HTTP semantics) and `tools/` is the only McpServer-aware layer.

## The status-envelope check (the critical behavior)

Snipe-IT returns HTTP 200 even for many validation errors:

```json
{ "status": "error", "messages": { "name": ["required"] }, "payload": null }
```

Success envelopes look like:
```json
{ "status": "success", "messages": "Asset created.", "payload": { "id": 42, ... } }
```

In `src/client/snipeitClient.ts`, after `!res.ok` is past, the body is inspected:

```ts
if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && "status" in parsed) {
  const env = parsed as { status?: string; messages?: unknown; payload?: unknown };
  if (env.status === "error") {
    throw new SnipeitApiError({
      statusCode: res.status,
      message: formatMessages(env.messages) || `Snipe-IT returned status:error (HTTP ${res.status})`,
      details: env.messages,
    });
  }
  if (env.status === "success") {
    // callers see the inner payload, not the envelope; a success without payload keeps its message
    parsed = env.payload ?? (hasMessages ? { messages: env.messages } : null);
  }
}
```

This check is the single most important behavior. Without it, an LLM caller would see `{status: "error"}` as a successful tool result and act on garbage data.

Array bodies (e.g. `[ {...}, {...} ]` from some endpoints) are passed through untouched: they have no envelope.

## Pagination

Snipe-IT lists return `{total: N, rows: [...]}` with `limit`/`offset` query parameters. The client extracts a `PaginationHint`:

```ts
{ total, returned, offset, limit?, hasMore, nextOffset }
```

`limit` is present only when the caller sent one (the server's default page size is not known to the client).

Two consumer patterns:
- **Manual**: pass `limit`/`offset`, inspect `hasMore`/`nextOffset` in the response.
- **Auto**: pass `all: true` to a list tool; `callList` invokes the internal pagination loop (`pageLimit: 200`, capped at 10 000 rows) and returns the merged result with the server-reported `total` preserved. A first row that alone exceeds the result cap is skipped and named in `oversized_row: {offset, id}`, so following `next_offset` always moves forward.

## Codegen pipeline

```
vendor/snipe-it-rest-api.json (committed)
              │
              ▼  npm run codegen
              │
┌─────────────────────────────────┐
│  src/codegen/parseOpenapi.ts    │  → CatalogEntry[] (one per path × method)
│  src/codegen/schemaToZod.ts     │  → Zod source per JSON Schema
│  src/codegen/emit.ts            │  → TypeScript source per tool
│  src/codegen/generateAll.ts     │  → file name → source (pure)
│  src/codegen/generate.ts        │  → writes the files
└─────────────────────────────────┘
              │
              ▼
src/tools/generated/<toolname>.ts  (one per operation)
src/tools/generated/index.ts       (registerGeneratedTools)
```

Refresh the spec with `npm run refresh-spec` (curls `https://snipe-it.readme.io/openapi/snipe-it-rest-api.json`). Diff the result in git to see what Snipe-IT changed, then `npm run codegen` to regenerate. Any tool whose generation fails is logged to stderr and the other tools are still written; codegen then exits with `process.exitCode = 1`. A spec path written as `/hardware/:id/restore` is turned into `{id}` with a synthesized required path parameter; emitting fails if a `:name` segment or a stray brace survives. Each generated title is `METHOD /path`; each description is `METHOD /path: <spec description or summary>. Generated from Snipe-IT OpenAPI operation <id>.` `tests/unit/codegen.drift.test.ts` regenerates in memory and requires the committed files to match byte for byte.

## Write safety

Every destructive tool routes through `src/tools/destructiveGuard.ts`:

```ts
runGuarded(cfg, args, { toolName, method, url, query, body }, execute, logger)
```

- `SNIPEIT_READ_ONLY` on: the write is refused with an `isError` result (`details.code: "READ_ONLY"`); nothing is sent. All tools stay registered, so the tool list does not change.
- `SNIPEIT_CONFIRM_WRITES` set to `false`, `0`, `no` or `off` (trimmed, any case): `execute()` runs directly. Unset or `true`/`1`/`yes`/`on` keeps the guard on; an empty or unrecognised value keeps it on too and logs a warning (fail closed). `logGuardState` logs the effective state once at startup.
- Guard on: a write returns a **redacted preview** unless `args.confirm === "YES"`. With the opt-in `SNIPEIT_REQUIRE_PREVIEW`, `confirm: "YES"` executes only when the identical request (tool, method, URL, query, body; key order ignored) was previewed in the last 10 minutes, once per preview; the fingerprints live in memory per server config.

```json
{
  "status": "preview",
  "preview": {
    "tool": "snipeit_delete_hardware",
    "method": "DELETE",
    "url": "https://snipe-it.example.com/api/v1/hardware/42",
    "query": { ... only when sent, secret-named keys redacted ... },
    "body": { ... password/secret/token/api_key redacted ... }
  },
  "hint": "Nothing was changed. The write guard is on (SNIPEIT_CONFIRM_WRITES). Re-run the same call with `confirm: \"YES\"` to apply this change."
}
```

The result also carries `_meta: {"snipeit/preview": true}` and is not `isError`, so the model does not treat it as a failure and retry. Every write tool, hand-written or generated, puts the full URL (`apiBase + path`) into `url`; `snipeit_bulk_checkout` puts each concrete request into `body`. `confirm` is set by the model: the guard catches a model that forgets it, not a prompt injection that adds it.

## Logging

- All output goes to `stderr` (stdio MCP reserves `stdout` for the JSON-RPC protocol). `.env` loading (`src/env.ts`) cannot write to stdout either.
- `redactSecrets` runs on every log line and on every error text returned to the model (`SnipeitApiError`, `errorResult`): `SNIPEIT_API_TOKEN=...`, `Authorization` headers of any scheme (JSON or text), `Bearer <token>`, bare JWT-shaped strings (`eyJ...`), secret-named JSON fields (plain and escaped) and query parameters (`api_token`, `token`, `password`, `secret`, `api_key`), and URL userinfo.
- Body content is **never** logged. Request lines (debug) carry method, URL, status code and elapsed milliseconds. At info: one line per executed write request (method, URL path, status or error code; no query), one line per preview, refusal and confirmed execution (tool, method, URL), and `snipeit_bulk_checkout` logs one line per executed item (asset_id, ok, HTTP status).
- At startup: the effective write guard state, read-only and preview binding when on, every configuration warning (placeholder or odd `SNIPEIT_API_BASE`, a very large `SNIPEIT_MAX_RESULT_BYTES`, unrecognised switch values), and the names (never values) of the variables a `.env` added.

## File map

```
src/
  index.ts                # entry: loadDotenv(), then startStdio()
  env.ts                  # quiet .env loading; returns the names it added
  stdio.ts                # startStdio(): SDK v2 serveStdio, one shared context for all protocol eras
  server.ts               # createContext(), buildServer(): registers all layers
  config.ts               # Zod-validated env loading
  constants.ts            # SERVER_NAME/VERSION (read from package.json), defaults, RETRY/PAGINATION
  client/
    snipeitClient.ts      # central HTTP + envelope check
    errors.ts             # SnipeitApiError, formatMessages, parseApiError
    retry.ts              # withRetry (429/5xx/network), backoff
    pagination.ts         # parsePaginationHint, autoPaginate
    callScope.ts          # per-call cancel signal and SNIPEIT_CALL_DEADLINE_MS (AsyncLocalStorage)
  codegen/
    parseOpenapi.ts       # OpenAPI 3.1 → CatalogEntry[]
    schemaToZod.ts        # JSON Schema → Zod source
    emit.ts               # Tool file template
    generateAll.ts        # pure generation: spec -> file name -> source
    generate.ts           # CLI: writes generateAll() into src/tools/generated
  tools/
    helpers.ts            # callJson, callWrite, callList, jsonResult, errorResult, redactBody, maskPii
    destructiveGuard.ts   # runGuarded (read-only, guard, preview binding) + confirmShape
    rawRequest.ts         # snipeit_raw_request
    identity.ts           # snipeit_me
    hardware.ts           # hardware tools
    users.ts              # user tools
    licenses.ts           # license tools
    accessories.ts        # accessory tools
    consumables.ts        # consumable tools
    components.ts         # component tools
    locations.ts          # location tools
    statuslabels.ts       # status-label tools
    maintenances.ts       # maintenance tools
    bulk.ts               # snipeit_bulk_checkout
    generated/            # AUTO-GENERATED, one tool per spec operation
  resources/
    identity.ts           # snipeit://me
    settings.ts           # snipeit://settings
    summary.ts            # snipeit://hardware/summary
  prompts/
    inventoryAudit.ts     # snipeit-inventory-audit
    userOnboarding.ts     # snipeit-user-onboarding
    licenseHealth.ts      # snipeit-license-health
  utils/
    logger.ts             # createLogger, redactSecrets
tests/
  unit/                   # vitest, mocked
  unit/toolContract.test.ts # gateway tool contract against fixtures/tool-contract.json
  unit/protocolVersions.test.ts # stdio entry on protocol 2025-06-18, 2025-11-25, 2026-07-28
  unit/docsFacts.test.ts  # numbers and defaults in README/ARCHITECTURE/.env.example
  unit/releaseChain.test.ts # release workflow, CI, dependabot and packing rules
  unit/codegen.drift.test.ts # committed generated tools equal a fresh generation
  unit/guardInvariant.test.ts # no tool writes without confirm; read-only tools send only GET
  integration/live.test.ts # live tests, skipped unless SNIPEIT_LIVE_TESTS=1 and a token
  integration/liveGate.ts  # the opt-in gate for the live tests
  fixtures/mini-openapi.json
  fixtures/tool-contract.json # generated from the production tools/list
vendor/snipe-it-rest-api.json  # committed OpenAPI 3.1 spec
scripts/
  tool-contract-fixture.mjs # regenerates tests/fixtures/tool-contract.json
  refresh-spec.sh
  release-assets.sh       # npm pack + SBOM + SHA256SUMS (release workflow)
  release-sbom.mjs        # CycloneDX SBOM of the runtime tree
```

## Test boundaries

- **Unit (`tests/unit/`)**: vitest, mocked `fetch` or loopback servers on port 0. Each layer tested independently; the tool contract, protocol, docs-facts and release-chain tests run here too.
- **Integration (`tests/integration/`)**: live API calls. Skipped unless `SNIPEIT_LIVE_TESTS=1` is set in the real environment (not in `.env`) and `SNIPEIT_API_TOKEN` is set (environment or `.env`), so a plain `npm test` never reaches a real instance. They cover identity, hardware total, autoPaginate over users and one reversible category create then delete.
- **Codegen**: tested against `tests/fixtures/mini-openapi.json` (deterministic) AND against the real `vendor/snipe-it-rest-api.json` (smoke).

The integration tests intentionally include exactly **one** reversible write (`POST /categories` followed by `DELETE`) and never modifies existing inventory.
