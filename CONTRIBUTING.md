# Contributing

> How to work in this codebase: add tools, run tests, regenerate codegen, debug, ship.

## Setup

```bash
git clone git@github.com:mguttmann/the-real-snipeit-mcp.git
cd the-real-snipeit-mcp
npm install
cp .env.example .env
# edit .env with your Snipe-IT API token (used only for integration tests + live debugging)
npm run build
npm test
```

## Day-to-day commands

| Task | Command |
|---|---|
| Dev mode (auto-restart) | `npm run dev` |
| Unit tests | `npm run test:unit` |
| Integration tests (live) | `npm run test:integration` |
| All tests | `npm test` |
| Lint | `npm run lint` |
| Type-check | `npm run typecheck` |
| Pre-commit gate | `npm run prebuild` (= lint + typecheck + test:unit) |
| Regenerate codegen | `npm run codegen` |
| Refresh OpenAPI spec | `npm run refresh-spec` |
| MCP Inspector | `npm run inspector` |
| Build MCPB bundle | `npm run build:mcpb` |

## Adding a hand-wrapper tool

Hand-wrappers live under `src/tools/<resource>.ts`. To add a new tool:

1. **Pick the right file.** If the new tool is hardware-related → `hardware.ts`. If it's a new resource, create `src/tools/<resource>.ts`.

2. **Follow the existing pattern.** Each module imports `callJson`/`callWrite` from `./helpers.js`. Use `callJson` for GETs, `callWrite` for write methods (it wraps `runGuarded` for the destructive-write gate). Example:

```ts
server.registerTool(
  "snipeit_get_X",
  {
    title: "Get X by id",
    description: "GET /X/{id}",
    inputSchema: { id: z.number().int().positive() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async (a) => callJson(ctx, "GET", `/X/${a.id}`),
);
```

3. **Register it.** Open `src/server.ts` and add a `register…Tools(server, ctx)` call in the registration order (raw_request → identity → hand-wrappers → generated → resources → prompts).

4. **Test it.** Add a test to `tests/unit/<resource>.test.ts` using the `ctxMock` + `captureHandlers` helpers from `tests/unit/_helpers.ts`. At minimum, assert that `client.request` was called with the right method and path.

5. **Annotations.** Use the right pair:
   - `readOnly` for GET
   - `writeOnce` for POST
   - `writeIdempotent` for PUT/DELETE
   - All include `openWorldHint: true` because we're hitting an external API.

6. **Run** `npm run prebuild` before committing.

## Regenerating the codegen layer

When Snipe-IT updates their API:

```bash
npm run refresh-spec          # downloads vendor/snipe-it-rest-api.json fresh
git diff vendor/snipe-it-rest-api.json  # inspect what changed
npm run codegen               # regenerates src/tools/generated/
npm run prebuild              # verify lint + typecheck + tests
git add vendor/ src/tools/generated/
git commit -m "chore: refresh OpenAPI spec + regenerate codegen"
```

If `npm run codegen` reports `N failed`, read the failure list on stderr. Common causes:
- A new schema shape in the OpenAPI spec that `schemaToZod` doesn't recognize → fall back is already `z.unknown()`, so this should never crash the build. If it does, fix `src/codegen/schemaToZod.ts`.
- Duplicate `operationId` in the spec → `src/codegen/generate.ts` has a dedup step. If two operations genuinely collide on the final tool name, add a path-suffix in the dedup.

## Adding a resource

Resources live under `src/resources/`. Pattern:

```ts
// src/resources/foo.ts
export function registerFooResource(server: McpServer, ctx: ServerContext): void {
  server.registerResource(
    "snipeit-foo",
    "snipeit://foo",
    { title: "...", description: "...", mimeType: "application/json" },
    async (uri) => {
      const res = await ctx.client.request("GET", "/foo");
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(res.data, null, 2) }] };
    },
  );
}
```

Then add it to `src/resources/index.ts`'s `registerResources()` function.

## Adding a prompt

Prompts live under `src/prompts/`. Prompts are pure templates — they do NOT call the API; they emit text that the LLM should follow:

```ts
server.registerPrompt(
  "snipeit-foo-workflow",
  {
    title: "...",
    description: "...",
    argsSchema: { user_id: z.string().describe("Snipe-IT user id") },
  },
  (args: { user_id: string }) => ({
    messages: [{ role: "user", content: { type: "text", text: `Steps for ${args.user_id}: ...` } }],
  }),
);
```

Then add to `src/prompts/index.ts`'s `registerPrompts()` function.

## Test pattern

Unit tests use vitest. The two key helpers (in `tests/unit/_helpers.ts`):

```ts
ctxMock(overrides?)      // returns a fake ServerContext with mocked client/logger
captureHandlers()        // returns { server, handlers } where server.registerTool captures handlers by name
```

Typical pattern:
```ts
import { describe, expect, it, vi } from "vitest";
import { registerFooTools } from "../../src/tools/foo.js";
import { ctxMock, captureHandlers } from "./_helpers.js";
import type { ServerContext } from "../../src/server.js";

describe("foo tools", () => {
  it("snipeit_list_foo forwards query", async () => {
    const reqFn = vi.fn().mockResolvedValue({ data: { total: 0, rows: [] }, status: 200, headers: new Headers() });
    const ctx = ctxMock({ client: { request: reqFn } as unknown as ServerContext["client"] });
    const { server, handlers } = captureHandlers();
    registerFooTools(server, ctx);
    await handlers["snipeit_list_foo"]!({ limit: 10 });
    expect(reqFn).toHaveBeenCalledWith("GET", "/foo", expect.objectContaining({ query: { limit: 10 } }));
  });
});
```

## Integration tests

Integration tests live in `tests/integration/live.test.ts`. They auto-skip without a real token in `.env`. Run manually:

```bash
npm run test:integration
```

The single reversible write test creates a category with a timestamped name (`mcp-test-<now>`) and deletes it in a `finally` block — even if an assertion fails. Never modify existing inventory in integration tests.

## Debugging

- **Inspector**: `npm run build && npm run inspector` opens the MCP Inspector. You can call any tool/resource/prompt manually.
- **Stderr logs**: set `SNIPEIT_LOG_LEVEL=debug` to see every HTTP request as `<METHOD> <URL> → <status> (<ms>ms)`. Bodies are NOT logged.
- **Token sanity check**: `npm start` and call `snipeit_me` via the inspector. If your token is invalid you'll get a `401` immediately.
- **Snipe-IT envelope visibility**: if a write returns `isError: true` with a message like `"name: required; asset_tag: must be unique"`, that's the `status:error` envelope getting surfaced as a tool error.

## Release process

1. Bump version in **three** places: `package.json`, `mcpb/manifest.json`, `src/constants.ts:SERVER_VERSION`.
2. Add a CHANGELOG entry.
3. `npm run prebuild` — must pass.
4. `npm run build:mcpb` — produces a `.mcpb` file at repo root (git-ignored).
5. Commit, push, tag:
   ```bash
   git commit -am "chore: bump version to 0.x.y + changelog"
   git push origin main
   git tag -a v0.x.y -m "v0.x.y — <summary>"
   git push origin v0.x.y
   ```

## Code style

- TypeScript strict mode. No `any` unless explicitly justified (lint warns).
- ESM modules everywhere (`.js` import extension required by NodeNext resolution).
- One responsibility per file. New file > 300 LOC is a smell.
- Tests live next to nothing — they live under `tests/unit/<feature>.test.ts` or `tests/integration/<feature>.test.ts`.
- Conventional Commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`, `perf:`. Use scopes like `feat(tools):`, `fix(codegen):`.

## Security

- **Never commit `.env`.** It's in `.gitignore` from line 1.
- **Never log tokens or bodies.** The logger redaction patterns catch the known shapes, but adding new logging should always exclude bodies.
- The token in `.env.example` is empty (`SNIPEIT_API_TOKEN=`). Keep it that way.
- If you suspect a token leaked into git history, **rotate it in Snipe-IT immediately** (User menu → Manage API Keys → Revoke).

## License

By contributing, you agree your contributions are MIT-licensed.
