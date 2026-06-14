# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.7] — 2026-06-14

### Removed
- Trimmed to a minimal, lean public footprint: removed `ARCHITECTURE.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, the MCPB bundle (`mcpb/` + `scripts/build-mcpb.sh`), the auto-publish workflow (`.github/workflows/release.yml`), the feature-request issue template, and the PR template.
- Dropped redundant devDependencies (`@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser` — supplied transitively by `typescript-eslint`; `@vitest/coverage-v8`) and unused npm scripts (`build:mcpb`, `lint:fix`, `format:check`, `coverage`).

### Fixed
- `package-lock.json` root version synced to the release version (was stale at an older version).
- CHANGELOG footer links no longer point at unpushed historical tags.

## [0.1.6] — 2026-06-14

### Added
- README narrative hook, badges (npm, CI, license, Node, MCP), Quick-Start prerequisites.
- README warning that `SNIPEIT_API_BASE` default is an RFC 2606 placeholder.
- README note that `npm start` blocks on stdio (intentional, not a hang).
- `.github/workflows/ci.yml` — lint + typecheck + tests on Node 20 and 22.
- `.github/workflows/release.yml` — npm publish + GitHub Release on tag push (with tag-name validation against injection).
- `.github/ISSUE_TEMPLATE/{bug_report,feature_request,config}.yml` — structured issue intake.
- `.github/PULL_REQUEST_TEMPLATE.md` — PR checklist.
- `SECURITY.md` — private vulnerability reporting policy.
- `CODE_OF_CONDUCT.md` — Contributor Covenant 2.1.
- `prepublishOnly` script — guarantees the published tarball passed lint + typecheck + tests + build.

### Changed
- README first-touch experience rewritten: narrative > feature inventory.
- `.env.example` reformatted with grouped sections and inline explanations.
- CHANGELOG migrated to Keep a Changelog format.
- `package.json` keywords expanded with `claude-desktop`, `claude-code`.

### Fixed
- README tool count: `39 hand-wrappers` → `38 hand-wrappers` (matches actual count).
- `.gitignore` now covers multi-agent coordination directories (`.team-state/`, `.claude/local/`).

### Security
- `npm audit fix` — patched HIGH-severity `esbuild` CVE (GHSA-gv7w-rqvm-qjhr) via `vitest` dependency tree.
- Release workflow validates pushed tag matches `v<MAJOR>.<MINOR>.<PATCH>` before using it in shell arguments.

## [0.1.5] — 2026-05-25

### Added
- First npm release: `the-real-snipeit-mcp@0.1.5`.
- `package.json` polished for npm publish: `author`, `repository`, `homepage`, `bugs`, `keywords`, `publishConfig.access: public`.

### Changed
- Repo switched from private to public on GitHub.
- Default `SNIPEIT_API_BASE` neutralized to `https://snipe-it.example.com/api/v1` (RFC 2606 reserved).

## [0.1.4] — 2026-05-25

### Added
- `ARCHITECTURE.md` — layer diagram, data flow, codegen pipeline, file map.
- `CONTRIBUTING.md` — workflows for adding tools/resources/prompts, codegen regeneration, release process.
- README extended with full tool reference (hand-wrappers in tables, workflow recipes).
- JSDoc annotations on all exported functions across `client/`, `codegen/`, `tools/`, `config`, `logger`, `server`.
- Expanded inline code-comment block at the Snipe-IT status-envelope check.

## [0.1.3] — 2026-05-25

### Added
- Test coverage: `callWrite` preview full-URL path, `raw_request` preview full-URL path, summary auto-pagination.

### Changed
- `snipeit_raw_request` preview now shows full URL (consistency with `callWrite`).

### Fixed
- `schemaToZod`: recursively flatten nested `allOf` via `$ref`.

## [0.1.2] — 2026-05-25

### Added
- Auto-paginate `status-labels` and `categories` in `snipeit://hardware/summary` (was hardcoded `limit: 200`).
- `callList` preserves server-reported `total` when `all: true`.

### Changed
- Extracted shared `callJson` / `callWrite` helpers — removed duplication across 9 wrapper modules.
- `runGuarded` preview now shows full URL instead of bare path.
- Parallelized `snipeit://hardware/summary` per-label and per-category fan-out (was sequential).

### Fixed
- `schemaToZod`: resolve `$ref` inside `allOf` parts before merging (was a silent no-op).
- Dropped unnecessary intermediate cast in `codegen/generate.ts`.

## [0.1.1] — 2026-05-25

### Added
- `snipeit://hardware/summary` now includes `by_category` breakdown (spec §10).
- All 11 list tools accept `all?: boolean` to auto-paginate up to 10,000 rows (spec §7).
- Test coverage for timeout/AbortError path (`statusCode: 0`).
- Test coverage for `"api_token":"…"` redaction pattern.

### Fixed
- `snipeit://hardware/summary` wrapped in outer try/catch — network errors return `{error}` JSON instead of crashing the transport.
- 429 retry-after no longer mutates the `readonly details` field — constructs a new `SnipeitApiError` instead.

## [0.1.0] — 2026-05-25

### Added
- Initial release.
- 38 hand-wrapper tools: hardware (13), users (5), licenses (3), accessories (3), consumables (2), components (3), locations (2), status-labels (2), maintenances (2), bulk-checkout (1), identity (1), plus `snipeit_raw_request` escape hatch.
- ~145 auto-generated tools covering every operation in the Snipe-IT OpenAPI 3.1 spec.
- Resources: `snipeit://me`, `snipeit://settings`, `snipeit://hardware/summary`.
- Prompts: `inventory-audit`, `user-onboarding`, `license-health`.
- MCPB bundle for one-click Claude Desktop install.

[0.1.7]: https://github.com/mguttmann/the-real-snipeit-mcp/releases/tag/v0.1.7
