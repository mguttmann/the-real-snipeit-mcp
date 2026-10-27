# ADR 0001: MCP TypeScript SDK v2 and Node runtime floor 22.12

- Status: accepted
- Date: 2026-10-27

## Context

Up to this change the server used `@modelcontextprotocol/sdk` 1.32.2 (range `^1.20.0`),
the v1 maintenance line. v1 negotiates at most protocol revision 2025-11-25 and does not
implement 2026-07-28 (`server/discover`, the per-request `_meta` envelope); its README
promises fixes only for about six months after the v2 release (2026-07-27). The
production client (a private MCP gateway that runs this server from source, with a Python
MCP client) negotiates up to 2026-07-28. With v1, a raw `initialize` asking for 2026-07-28 was answered with
2025-11-25 and `server/discover` returned -32601 (audit deps-sdk-01, build-compat-4).

The gateway treats `tools/list` as a hard contract: it prefixes tool names, aborts a
deploy if the tool count drops by more than 20 % and logs schema fingerprint changes.

`engines.node` was `>=20`. Node 20 is end of life since 2026-04-30, production runs Node
24, and CI tested only 20 and 22 (audit deps-sdk-05).

## Decision

### SDK v2

- Runtime dependency `@modelcontextprotocol/server` ^2.4.0 replaces
  `@modelcontextprotocol/sdk`; `@modelcontextprotocol/client` ^2.4.0 is a dev dependency
  for the protocol tests. `@modelcontextprotocol/node` is not needed (no HTTP transport).
- The entry is `startStdio` in `src/stdio.ts`:
  `serveStdio(factory, { legacy: "serve" })`. The client's opening message decides the
  era: an `initialize` request pins the connection to a 2025-era instance, served as the
  hand-wired `server.connect(new StdioServerTransport())` served it; a 2026-07-28 opening
  gets a modern instance. All instances come from `buildServer(ctx)` with one shared
  context (config, logger, one Snipe-IT client), created once by `createContext`.
- Migration work: import paths (`@modelcontextprotocol/server` for `McpServer` and
  `CallToolResult`, including the code generator template; the 145 generated files were
  regenerated with `npm run codegen` and differ only in that import line), and the tool
  handler context (`extra.signal` is now `ctx.mcpReq.signal`, used by
  `snipeit_bulk_checkout`).
- `maxToolInputElements` is set to `MAX_TOOL_INPUT_ELEMENTS` (100 000) in
  `src/server.ts`. The SDK enforces the GHSA-46jr-4wx8-v453 cap only when one is
  configured (audit deps-sdk-04). The largest legitimate input,
  `snipeit_bulk_checkout` with at most 100 items, stays far below it. A larger payload is
  rejected with InvalidParams before schema validation.

### Node floor

- `engines.node` is `>=22.12` in `package.json` and the lockfile root;
  `@types/node` follows the oldest supported line (^22).
- Runtime dependencies accept any Node >= 20, so 22.12 is not forced by them; it is the
  oldest 22 release the lockfile's dev toolchain supports (vite and rolldown declare
  `^20.19.0 || >=22.12.0`). One dev package, `eslint-visitor-keys` 5.0.1 (pulled in by
  `@typescript-eslint/visitor-keys`), declares `^22.13.0` on the 22 line, so linting
  needs 22.13 or newer there; the runtime floor is unaffected.
- CI (`.github/workflows/ci.yml`) runs Node 22, 24 and 26 with read-only permissions and
  actions pinned by commit SHA (same pins as action1-mcp): `npm ci`, lint, typecheck,
  unit tests, build, `npm run test:contract` (tool contract plus protocol revisions) and
  `npm audit --omit=dev --audit-level=high`.

## Stdio message size limits

- Inbound (client to server): the SDK's `StdioServerTransport` buffers at most 10 MiB
  (`STDIO_DEFAULT_MAX_BUFFER_SIZE = 10 * 1024 * 1024`) of unparsed input. A larger
  message raises "ReadBuffer exceeded maximum size" and closes the transport; the server
  process then exits (exit code 0, after a "stdio transport error" warning on stderr). `serveStdio` uses the default; it is not configurable through it.
- Outbound (server to client): the server writes without a limit. TypeScript SDK clients
  (v1 since 1.30.0 and v2) apply the same 10 MiB read buffer on their side; the audit
  reproduced a closed connection at 5000 rows before the result cap existed
  (sec-output-01). Tool results are bounded by `SNIPEIT_MAX_RESULT_BYTES` (default 1 MiB),
  which has a lower bound but no upper bound: a value near 10 MiB can exceed such a
  client's buffer. The limit of the Python `mcp` client used by the gateway was not
  checked (unverified).
- The v1 SDK introduced this 10 MiB limit without a CHANGELOG entry. It is present in
  1.30.0 and later and absent in 1.29.0 (checked with `npm pack` of 1.29.0, 1.30.0,
  1.31.0 and 1.32.0, `dist/esm/shared/stdio.js`). Production (lockfile 1.32.2) already
  ran with it; npm 0.1.7 locked 1.29.0, but npm installs of the package resolve `^1.20.0`
  to the newest 1.x.

## Consequences

- `tools/list` changes on every tool, and nothing else changes: each `inputSchema`
  declares `$schema: https://json-schema.org/draft/2020-12/schema` instead of
  `http://json-schema.org/draft-07/schema#`, and the v1-only field
  `execution: {"taskSupport": "forbidden"}` is gone. Names, descriptions, annotations,
  properties, required arrays and defaults are identical (`tests/unit/toolContract.test.ts`
  green; a stdio dump of all 183 tools before and after, compared with `$schema` and
  `execution` removed, shows no other difference). The gateway logs a fingerprint change
  for every tool once.
- `initialize` (serverInfo, capabilities, instructions), `resources/list`,
  `resources/templates/list` and `prompts/list` are unchanged for a 2025-11-25 client.
  (Later in 0.2.0, separate commits changed `serverInfo.version`, which now comes from
  `package.json`, and the instructions text; see `CHANGELOG.md`.)
- A raw `initialize` asking for 2026-07-28 is still answered with 2025-11-25 (normal
  downgrade); a client that opens with the 2026-07-28 handshake is served on 2026-07-28.
- Proof: `tests/unit/protocolVersions.test.ts` drives the real stdio wiring with raw
  `initialize` requests for 2025-06-18 and 2025-11-25 (same revision back, every fixture
  tool listed) and with a client pinned to 2026-07-28 (every fixture tool listed, a
  guarded write returns a preview, an oversized argument list is rejected). The gateway's
  Python client is not part of the test suite; the red team of 2026-10-27 reported a run of
  that Python client against this build (negotiated 2026-07-28, 183 tools listed,
  calls work).
- A consumer that still runs Node 20 stays on 0.1.x until it moves to Node 22.12 or newer.
