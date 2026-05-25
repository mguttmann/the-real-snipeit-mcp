# Changelog

## 0.1.5 — 2026-05-25

- Public release preparation: neutralized example domain in defaults (`https://snipe-it.example.com/api/v1`, RFC 2606 reserved).
- `package.json` polished for npm publish: `author`, `repository`, `homepage`, `bugs`, `keywords`, `publishConfig.access: public`.
- First npm release (`the-real-snipeit-mcp@0.1.5`).
- Repo switched from private to public.

## 0.1.4 — 2026-05-25

- Docs: README extended with full tool reference (39 hand-wrappers in tables, plus workflow recipes).
- Docs: new `ARCHITECTURE.md` (layer diagram, data flow, codegen pipeline, file map).
- Docs: new `CONTRIBUTING.md` (workflows for adding tools/resources/prompts, codegen regeneration, release process).
- Docs: JSDoc annotations on all exported functions across `client/`, `codegen/`, `tools/`, `config`, `logger`, `server`.
- Docs: expanded inline code-comment block at the Snipe-IT status-envelope check.

## 0.1.3 — 2026-05-25

- Test coverage: `callWrite` preview full-URL path, raw_request preview full-URL path, summary auto-pagination.
- `schemaToZod`: recursively flatten nested `allOf` via `$ref`.
- `snipeit_raw_request` preview now shows full URL (consistency with `callWrite`).

## 0.1.2 — 2026-05-25

- Extract shared `callJson`/`callWrite` helpers, remove duplication across 9 wrapper modules.
- `runGuarded` preview now shows full URL instead of bare path.
- `schemaToZod`: resolve `$ref` inside `allOf` parts before merging (was silent no-op).
- Drop unnecessary intermediate cast in `codegen/generate.ts`.
- Parallelize `snipeit://hardware/summary` per-label and per-category fan-out (was sequential).
- Auto-paginate status-labels and categories in summary instead of hardcoded `limit: 200`.
- `callList` preserves server-reported `total` when `all: true`.

## 0.1.1 — 2026-05-25

- feat(resources): `snipeit://hardware/summary` now includes `by_category` breakdown (spec §10).
- fix(resources): `snipeit://hardware/summary` wrapped in outer try/catch — network errors return `{error}` JSON instead of crashing.
- feat(tools): all 11 list tools now accept `all?: boolean` to auto-paginate up to 10,000 rows (spec §7); uses existing `autoPaginate` helper.
- refactor(client): fix readonly mutation bug — 429 retry-after now constructs a new `SnipeitApiError` instead of casting and mutating the `readonly details` field.
- test(client): new coverage for timeout/AbortError path (`statusCode: 0`).
- test(logger): new coverage for `"api_token":"…"` redaction pattern.

## 0.1.0 — 2026-05-25

- Initial release.
- Hand-wrappers for hardware (13), users (5), licenses (3), accessories (3), consumables (2), components (3), locations (2), status-labels (2), maintenances (2), bulk-checkout (1), identity (1).
- Auto-generated tools for all paths in the Snipe-IT OpenAPI 3.1 spec (~145 tools).
- `snipeit_raw_request` escape hatch.
- Resources: `snipeit://me`, `snipeit://settings`, `snipeit://hardware/summary`.
- Prompts: inventory-audit, user-onboarding, license-health.
- MCPB bundle.
