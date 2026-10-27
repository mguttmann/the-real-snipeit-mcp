# AGENTS.md

Guidance for coding agents (and humans) working in this repository. `CLAUDE.md` imports this file.

## What this is

An MCP server (stdio) for the Snipe-IT REST API: hand-written wrappers (`src/tools/*.ts`), one generated tool per operation of the vendored OpenAPI spec (`src/tools/generated/`, from `vendor/snipe-it-rest-api.json`), and `snipeit_raw_request`. Layering and data flow: `ARCHITECTURE.md`. Workflows for adding tools, resources and prompts: `CONTRIBUTING.md`. SDK and Node decisions: `docs/adr/0001-mcp-sdk-version.md`.

## Production and the gateway contract

- Production runs this repository from source behind a private MCP gateway: `npm ci --no-audit --no-fund && npm run build` on Node 24, then `node --env-file=<repo>/.env <repo>/dist/index.js` over stdio. Keep that path working: install and build must not need a Snipe-IT instance, network access other than the npm registry, or interactive input, and nothing may write to stdout except the MCP protocol (log to stderr through `src/utils/logger.ts`).
- The gateway prefixes tool names, aborts a deploy when the tool count drops by more than 20 % and logs schema fingerprint changes. Its `tools/list` is a hard contract:
  - every existing tool name stays;
  - required parameters and top-level defaults stay;
  - annotations stay;
  - new tools are allowed; new environment variables must be optional with a safe default.
- `tests/unit/toolContract.test.ts` enforces this against `tests/fixtures/tool-contract.json` (generated from the production `tools/list` with `scripts/tool-contract-fixture.mjs`). Change the fixture only together with a deliberate contract change that the CHANGELOG names. `tests/unit/protocolVersions.test.ts` lists every fixture tool over the stdio entry on protocol revisions 2025-06-18, 2025-11-25 and 2026-07-28.
- Description or schema wording changes are allowed but show up as fingerprint changes in the gateway log; list them in the CHANGELOG.

## Version lineage

- `package.json` is the single version source; `src/constants.ts` reads name and version from it, and `tests/unit/version.test.ts` checks the lockfile root and `serverInfo`.
- npm had 0.1.5 to 0.1.7 from `main`; production ran a 0.1.5 lineage with later security fixes (from commit 61608f0 on). 0.2.0 joins both lines. Every caller-visible change goes into `CHANGELOG.md` (Keep a Changelog).
- Releases happen only through a pushed `v*` tag on `main` (`.github/workflows/release.yml`, `docs/maintainers/release.md`). Agents never push, tag, publish or open pull requests without an explicit go from the owner.

## Commits

- Identity: `Manuel Guttmann <200590624+mguttmann@users.noreply.github.com>`. Never commit with a company mail address; set it per command if the global git identity differs:
  `git -c user.name="Manuel Guttmann" -c user.email="200590624+mguttmann@users.noreply.github.com" commit ...`
- Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `ci:`, `test:`, scopes like `fix(client):`), English, no em or en dashes in code, docs or commit messages.
- Write the test for the desired behaviour first, see it fail, then fix.

## Commands

```bash
npm ci
npm run lint && npm run typecheck && npx vitest run tests/unit   # before every commit
npm test                  # all tests; live tests only with SNIPEIT_LIVE_TESTS=1 and a token
npm run test:contract     # gateway tool contract + protocol revisions
npm run build             # prebuild runs lint, typecheck and unit tests first
npm run codegen           # regenerate src/tools/generated from vendor/snipe-it-rest-api.json
npm run refresh-spec      # download a new spec (vendor call: owner decision)
```

Never run the live integration tests (`SNIPEIT_LIVE_TESTS=1`) or any call against a real Snipe-IT instance without the owner's go. Test servers bind loopback on port 0.

## Regenerating the generated tools

`npm run codegen` rewrites `src/tools/generated/` from the vendored spec. After a template change in `src/codegen/`, only the files the change targets may differ (check `git diff --stat src/tools/generated`); the tool contract test must stay green. A spec refresh is an owner decision: it can rename operations and therefore tools.

## Docs

Docs state only facts the code holds. Tool counts, env defaults and the row cap in `README.md`, `ARCHITECTURE.md` and `.env.example` are checked by `tests/unit/docsFacts.test.ts`; update the docs in the same change as the code. The repository is public: never commit names of the private deployment (company, hosts, local paths, internal addresses, the gateway's client stack or production pins); `tests/unit/publicHygiene.test.ts` checks every git-tracked file against generic patterns plus the untracked local deny-list `.public-hygiene-denylist` (never commit deployment words, not even as a deny-list). Open minors live in `docs/BACKLOG.md` (read the lines of your area before you start and close what you touch); the 2026-10-27 audit with evidence and status per finding is `docs/audit/2026-10-27-audit.md`.
