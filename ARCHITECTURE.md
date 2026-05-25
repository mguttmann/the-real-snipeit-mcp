# Architecture

> Layer diagram, data flow, and design rationale for the-real-snipeit-mcp.

## Goals

1. **100 % API coverage** without hand-writing 145 tools.
2. **Friendly UX** for the 30-40 most-used workflows (checkout, audit, hardware lookup, user assignments).
3. **Robust against Snipe-IT's HTTP-200-error-envelope quirk** — failures never silently look like success.
4. **Safe-by-default writes** — opt-in confirmation gate for destructive operations.
5. **Stdio MCP transport** so the server can be installed locally in Claude Desktop without a network listener.

## Layer diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  MCP client (Claude Desktop, MCP Inspector, custom client)     │
└─────────────────────────────────────────────────────────────────┘
                              │ stdio
                              │ (JSON-RPC over stdin/stdout)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  src/index.ts          — stdio entry, loads .env, connects     │
│  src/server.ts         — buildServer() registers everything    │
└─────────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┴────────────────┐
            ▼                                  ▼
┌──────────────────────┐         ┌──────────────────────────────┐
│   Tools (3 layers)   │         │  Resources + Prompts         │
├──────────────────────┤         ├──────────────────────────────┤
│ • snipeit_raw_request│         │ snipeit://me                 │
│ • snipeit_* (hand)   │         │ snipeit://settings           │
│ • snipeit_gen_*      │         │ snipeit://hardware/summary   │
│   (codegen)          │         │ snipeit-inventory-audit      │
│                      │         │ snipeit-user-onboarding      │
│                      │         │ snipeit-license-health       │
└──────────────────────┘         └──────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│  src/tools/helpers.ts                                           │
│  • callJson(ctx, GET, path, query?)                            │
│  • callWrite(ctx, args, toolName, method, path, body?)         │
│  • callList(client, path, args) — supports all?: boolean       │
│  • runGuarded(...)  — gates writes when CONFIRM_WRITES=true    │
└─────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│  src/client/snipeitClient.ts                                    │
│                                                                 │
│  1. Build URL (apiBase + path + query)                         │
│  2. Set headers: Authorization: Bearer <token>, Accept: JSON   │
│  3. Apply timeout via AbortController                          │
│  4. withRetry: 429 always, 5xx if idempotent, network retries  │
│  5. Read response body                                         │
│  6. !res.ok → throw SnipeitApiError                            │
│  7. 🔑 ENVELOPE CHECK:                                         │
│     - {status: "error"}  → throw SnipeitApiError               │
│     - {status: "success"} → unwrap to payload                  │
│  8. Extract pagination hint from {total, rows} payload         │
│  9. Return { data, status, headers, pagination? }              │
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
    parsed = env.payload ?? null;  // ← callers see the inner payload, not the envelope
  }
}
```

This check is the single most important behavior. Without it, an LLM caller would see `{status: "error"}` as a successful tool result and act on garbage data.

Array bodies (e.g. `[ {...}, {...} ]` from some endpoints) are passed through untouched — they have no envelope.

## Pagination

Snipe-IT lists return `{total: N, rows: [...]}` with `limit`/`offset` query parameters. The client extracts a `PaginationHint`:

```ts
{ total, returned, offset, limit, hasMore, nextOffset }
```

Two consumer patterns:
- **Manual**: pass `limit`/`offset`, inspect `hasMore`/`nextOffset` in the response.
- **Auto**: pass `all: true` to a list tool; `callList` invokes the internal pagination loop (`pageLimit: 200`, capped at 10 000 rows) and returns the merged result with the server-reported `total` preserved.

## Codegen pipeline

```
vendor/snipe-it-rest-api.json (committed, ~337 KB)
              │
              ▼  npm run codegen
              │
┌─────────────────────────────────┐
│  src/codegen/parseOpenapi.ts    │  → CatalogEntry[] (one per path × method)
│  src/codegen/schemaToZod.ts     │  → Zod source per JSON Schema
│  src/codegen/emit.ts            │  → TypeScript source per tool
│  src/codegen/generate.ts        │  → orchestrator
└─────────────────────────────────┘
              │
              ▼
src/tools/generated/<toolname>.ts  ×  ~145
src/tools/generated/index.ts       (registerGeneratedTools)
```

Refresh the spec with `npm run refresh-spec` (curls `https://snipe-it.readme.io/openapi/snipe-it-rest-api.json`). Diff the result in git to see what Snipe-IT changed, then `npm run codegen` to regenerate. Any tool whose generation fails is logged to stderr but does not abort the build (codegen runs with `process.exitCode = 1` on partial failure).

## Write safety

Every destructive tool routes through `src/tools/destructiveGuard.ts`:

```ts
runGuarded(cfg, args, { toolName, method, url, body }, execute)
```

Default `SNIPEIT_CONFIRM_WRITES=false` → `execute()` runs directly.
With `SNIPEIT_CONFIRM_WRITES=true` → returns a **redacted preview** unless `args.confirm === "YES"`:

```json
{
  "preview": {
    "tool": "snipeit_delete_hardware",
    "method": "DELETE",
    "url": "https://snipe-it.example.com/api/v1/hardware/42",
    "body": { ... password/secret/token/api_key redacted ... }
  },
  "hint": "SNIPEIT_CONFIRM_WRITES=true is set. Re-run with `confirm: \"YES\"` to apply this change."
}
```

## Logging

- All output goes to `stderr` (stdio MCP reserves `stdout` for the JSON-RPC protocol).
- Five secret patterns are redacted before any log line is emitted: `SNIPEIT_API_TOKEN=...`, `"Authorization":"..."`, `"api_token":"..."`, `Bearer <token>`, bare JWT-shaped strings (`eyJ...`).
- Body content is **never** logged. Only method, URL, status code, and elapsed milliseconds.

## MCPB bundle

`scripts/build-mcpb.sh` stages `dist/`, `package.json`, `README.md`, `LICENSE`, and `mcpb/manifest.json`, runs `npm install --omit=dev` in the staging dir, then zips the result as `the-real-snipeit-mcp-<version>.mcpb`. The manifest defines `user_config` fields so Claude Desktop can prompt for `SNIPEIT_API_TOKEN`, `SNIPEIT_API_BASE`, `SNIPEIT_CONFIRM_WRITES`, and `SNIPEIT_LOG_LEVEL` at install time.

## File map

```
src/
  index.ts                # stdio entry, dotenv/config, connect transport
  server.ts               # buildServer() — registers all layers
  config.ts               # Zod-validated env loading
  constants.ts            # SERVER_NAME/VERSION, defaults, RETRY/PAGINATION
  client/
    snipeitClient.ts      # central HTTP + envelope check
    errors.ts             # SnipeitApiError, formatMessages, parseApiError
    retry.ts              # withRetry (429/5xx/network), backoff
    pagination.ts         # parsePaginationHint, autoPaginate
  codegen/
    parseOpenapi.ts       # OpenAPI 3.1 → CatalogEntry[]
    schemaToZod.ts        # JSON Schema → Zod source
    emit.ts               # Tool file template
    generate.ts           # CLI orchestrator
  tools/
    helpers.ts            # callJson, callWrite, callList, jsonResult, errorResult, redactBody
    destructiveGuard.ts   # runGuarded + confirmShape
    rawRequest.ts         # snipeit_raw_request
    identity.ts           # snipeit_me
    hardware.ts           # 13 hardware tools
    users.ts              # 5 user tools
    licenses.ts           # 3 license tools
    accessories.ts        # 3 accessory tools
    consumables.ts        # 2 consumable tools
    components.ts         # 3 component tools
    locations.ts          # 2 location tools
    statuslabels.ts       # 2 status-label tools
    maintenances.ts       # 2 maintenance tools
    bulk.ts               # snipeit_bulk_checkout
    generated/            # AUTO-GENERATED, ~145 tools
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
  integration/live.test.ts # 4 live tests, auto-skip without .env
  fixtures/mini-openapi.json
vendor/snipe-it-rest-api.json  # committed OpenAPI 3.1 spec
scripts/
  build-mcpb.sh
  refresh-spec.sh
mcpb/manifest.json
```

## Test boundaries

- **Unit (`tests/unit/`)**: vitest, mocked `fetch`. Each layer tested independently. 116 tests.
- **Integration (`tests/integration/`)**: live API calls. Auto-skip without `SNIPEIT_API_TOKEN` in `.env`. 4 tests: identity, hardware total, autoPaginate over users, reversible category create→delete.
- **Codegen**: tested against `tests/fixtures/mini-openapi.json` (deterministic) AND against the real `vendor/snipe-it-rest-api.json` (smoke).

The integration tests intentionally include exactly **one** reversible write (`POST /categories` followed by `DELETE`) — never modifies existing inventory.
