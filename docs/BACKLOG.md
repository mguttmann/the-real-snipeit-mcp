# Backlog

Open minors and info findings, one line each: audit id, where (file:line at the audited revision `fce2c98` unless noted), what. Every run in an area reads its lines first and closes what it touches. Source: `docs/audit/2026-10-27-audit.md`.

## From the 2026-10-27 audit

None open.

## From the 2026-10-27 modernization run

None open.

## From the 2026-10-27 minors run

- `minors-2026-10-27-1` (minor) `src/tools/destructiveGuard.ts` (`confirmShape`): the `confirm` parameter description says "Required when SNIPEIT_CONFIRM_WRITES=true" although the guard is also on when the variable is unset. Changing it moves the schema fingerprint of every write tool; do it with the next announced description change.
- `minors-2026-10-27-2` (minor) `SECURITY.md:21`, `src/client/snipeitClient.ts` (`doRequest`): SECURITY.md says logs hold no personal data at `info`, but the client audit line `write METHOD <pathname>` logs the URL path of every write, and a `snipeit_raw_request` write path can carry arbitrary segments such as a tag, serial or name. Either log only the path template or soften the sentence.
- `minors-2026-10-27-3` (minor) `README.md:42`, `SECURITY.md:21`: `SNIPEIT_REDACT_PII` is documented as masking personal data "in every tool result", but `maskPii` runs only in `jsonResult`; it does not cover `errorResult` texts (Snipe-IT messages can name users), write previews or resources such as `snipeit://me`. The docs should name that scope.
- `minors-2026-10-27-4` (minor) `ARCHITECTURE.md`, `src/tools/destructiveGuard.ts` (`runGuarded`): under `SNIPEIT_REQUIRE_PREVIEW`, a `confirm: "YES"` call with no prior preview records the fingerprint itself (`remember()` runs on that path too), so an identical second `confirm: "YES"` call executes. This matches the documented "once per preview", but a model that blindly retries with YES gets through without a separate unconfirmed call; worth a sentence in ARCHITECTURE.md.
- `minors-2026-10-27-5` (minor) `src/client/snipeitClient.ts` (`attempt`, `doRequest`): when the signal is already aborted, `attempt` throws CANCELLED or DEADLINE_EXCEEDED before any fetch, but `doRequest` still logs `write POST /path status 0 code CANCELLED`, so the audit line does not show whether the request was sent.
- `minors-2026-10-27-6` (info) `src/tools/helpers.ts` (`callWrite`), generated write tools: `errorResult` details carry only `{statusCode}`; the new codes INVALID_PATH, CANCELLED, TIMEOUT and DEADLINE_EXCEEDED reach the caller only in the message text, while `snipeit_raw_request` also sets `details.code`. Existing pattern, no regression.
- `minors-2026-10-27-7` (minor) `src/utils/logger.ts`: the new Authorization redaction pattern also blanks harmless upstream text such as "Authorization: Unauthenticated." in error messages returned to the model. Cosmetic.
- `redteam-2026-10-27b-1` (minor) `src/client/snipeitClient.ts:447-461` (badSegment): a trailing slash (`/hardware/`) is now refused as INVALID_PATH before any request; 0.2.0 sent it. Consider stripping one trailing slash and keep refusing empty middle segments.
- `redteam-2026-10-27b-2` (minor) `tests/unit/transport.test.ts:120-122`: asserts elapsed real time `toBeLessThan(800)`; runs in the gateway prebuild and could flake on a loaded host. Switch to fake timers.

## From the 2026-10-27 release preparation

- `release-review-2026-10-27-1` (minor) `tests/unit/publicHygiene.test.ts`: the deny-list is public itself and spells out some of the private details the scrub removed elsewhere (a gateway product name, the production Node pin and a production commit). Replace them with looser patterns or drop the pin and the commit, so the test does not re-leak what it guards.
- `release-review-2026-10-27-2` (minor) `docs/audit/2026-10-27-audit.md` (build-compat): still names the auditor's local VM and the gateway's build architecture; borderline for a public repository, reword to neutral terms.
- `release-review-2026-10-27-3` (minor) `tests/fixtures/tool-contract.json`: only the `source` label changed in the scrub, no tool is affected; AGENTS.md ties fixture changes to a deliberate contract change, and the CHANGELOG names the scrub only in general terms. Name the label change in the CHANGELOG or relax the AGENTS.md rule for metadata.
- `release-review-2026-10-27-4` (minor) `AGENTS.md`, `docs/audit/2026-10-27-audit.md`: they cite commit 61608f0, which exists only on stale remote branches, not on `main`; once those branches are deleted (see `release-prep-2026-10-27-1`), readers cannot find it. Describe the change instead of the commit, or name the 0.2.0 release.
- `release-review-2026-10-27-5` (minor) `.github/workflows/release.yml` (npm-publish job): the npm >= 11.5.1 step only checks the version and does not install a newer npm; a prerelease version string parses to NaN and passes. Not reachable with setup-node on Node 24; harden the comparison when the step is touched next.

## Done 2026-10-27 (minors run)

One line per item that was open in "From the 2026-10-27 audit" and "From the 2026-10-27 modernization run": state, commit or reason. Items that need the owner moved to "Owner decisions" below. Commits are on branch `minors/2026-10-27` (0.2.1).

- `build-compat-1` CLOSED: kept on purpose: the prebuild checks are the deploy safety gate of the gateway build (owner guardrail); CI runs the same checks plus formatting.
- `build-compat-2` FIXED in 7da9ca6: .env is loaded with dotenv quiet and debug off, dotenv output goes to stderr; DOTENV_CONFIG_DEBUG or a stray DOTENV_KEY cannot reach stdout.
- `build-compat-3` FIXED in 7da9ca6: a .env in the working directory is still read (compatible) but the names of the variables it added are logged at startup.
- `build-compat-5` CLOSED: warning only: esbuild is a dev tool and the build is plain tsc; an npm allowScripts setting that cannot be verified on the gateway's npm would put more risk into the install path than the warning carries.
- `build-compat-6` CLOSED: CI runs npm ci, lint, format, typecheck, unit tests, build and the contract tests on GitHub's ubuntu-latest (x86_64) runners for Node 22, 24 and 26.
- `correctness-4` FIXED in 0610ba7: status_id on checkout, checkin and bulk items, name on checkin, checkout_at and expected_checkin on bulk items, all optional.
- `correctness-5` CLOSED: not fixable without changing the input schema: the multipart layout Snipe-IT expects (file or file[] form fields) is not in the vendored spec, which declares JSON, and cannot be verified without a live call; a guessed encoding would turn a clear failure into a silent wrong upload. The two tool descriptions now say uploads do not work through them (0610ba7).
- `correctness-7` FIXED in d564626: snipeit://settings keeps its URI and returns {error, note} when the server does not serve GET /settings.
- `correctness-8` FIXED in 387bddb: pagination.limit is omitted when the caller sent no limit; the request still omits it.
- `correctness-9` FIXED in 0610ba7: spec filters added as optional parameters, unlisted filters marked unverified, prompts use status RTD, seats/free_seats_count and no /kits/{id}.
- `correctness-10` FIXED in 387bddb, 0610ba7: success without payload returns {messages}; generated previews show the full URL.
- `deps-sdk-08` CLOSED: dotenv stays on ^16 for standalone .env users (owner guardrail); since 7da9ca6 it is called with quiet and debug off and its output goes to stderr, so a later major cannot write to stdout.
- `destructive-04` FIXED in 6be9f95: opt-in SNIPEIT_REQUIRE_PREVIEW binds confirm to a preview of the identical request; opt-in SNIPEIT_READ_ONLY refuses writes at runtime; confirm YES works as before by default.
- `destructive-05` FIXED in 0610ba7, 6be9f95: generated previews show SNIPEIT_API_BASE + path and their query parameters; bulk previews list each concrete request.
- `destructive-06` FIXED in 6be9f95: previews carry status preview and _meta snipeit/preview, still not isError.
- `destructive-07` FIXED in 387bddb, 6be9f95: info line per executed write request (method, path, status) and per preview, refusal and confirmed execution.
- `docs-04` FIXED in 0610ba7: generated titles are METHOD /path, descriptions start with METHOD /path and use the spec description.
- `docs-05` FIXED in 0610ba7: every write tool previews the full URL; README and ARCHITECTURE say so.
- `docs-10` FIXED in f371f99, 6155f66, 0610ba7: prettier applied, CI runs format:check, the codegen drift test runs with the unit tests.
- `docs-13` FIXED in 7da9ca6: SNIPEIT_TIMEOUT_MS must be a positive safe integer and fails with the documented message.
- `sec-input-5` FIXED in 387bddb: MCP cancellation reaches every tool's request and retry backoff; optional SNIPEIT_CALL_DEADLINE_MS (default 0 = none, today's behaviour) bounds a whole call and all:true returns a partial result.
- `sec-input-6` FIXED in 7da9ca6: placeholder, http to a non-loopback host, other schemes, credentials, query or fragment give a startup warning, never a rejection (gateway contract); credentials are redacted in previews and errors.
- `sec-input-7` FIXED in 387bddb: '.', '..' (also percent-encoded) and empty path segments are refused before sending (INVALID_PATH).
- `sec-input-8` CLOSED: by design: snipeit_raw_request is the escape hatch to any API route inside the pinned base; %2f/%5c are decoded on the trusted Snipe-IT host and give no access beyond that; dot segments, also encoded, are refused since 387bddb.
- `sec-output-03` FIXED in 6be9f95: server instructions say Snipe-IT values are data, never instructions; opt-in SNIPEIT_READ_ONLY.
- `sec-output-04` FIXED in d564626: at most 6 count requests at once; failed counts add partial: true and errors[].
- `sec-output-05` CLOSED: SDK default: serveStdio offers no buffer option, and a custom transport with a larger maxBufferSize only moves the limit and costs memory; a request size limit belongs in the gateway; documented in ADR 0001 and the 0.2.0 CHANGELOG.
- `sec-output-06` FIXED in 0ed1f96: patterns for secret-named JSON fields (plain and escaped) and query parameters, URL userinfo, Authorization of any scheme; error texts returned to the model are redacted.
- `sec-output-07` FIXED in 0ed1f96: opt-in SNIPEIT_REDACT_PII masks personal data in tool results; SECURITY.md documents the data flow to the model provider.
- `sec-output-08` FIXED in 6be9f95: raw_request previews show the query, secret-named keys redacted.
- `tests-04` FIXED in c6e4eb2: guard invariant over every registered tool; ctxMock defaults to the guard on.
- `tests-06` FIXED in c6e4eb2: error paths through a hand-wrapper and a generated tool; GET 5xx backoff, 429 Retry-After, POST 5xx sent once.
- `tests-07` CLOSED: already fixed: the callList cap is tested since 3559b5d; autoPaginate is not dead code (the summary resource uses it, verifier correction) and has its own tests; the misleading test name was corrected in c6e4eb2.
- `tests-08` FIXED in 0610ba7: pure generateAll() and a drift test that compares it byte for byte with src/tools/generated.
- `tests-10` FIXED in 0ed1f96: a sentinel token never appears in stderr or returned error text at log level debug across success, 4xx echo, timeout and network error; raw_request preview query redaction tested in 6be9f95.
- `run-2026-10-27-1` FIXED in 6155f66: files leaves out dist/codegen and source maps; npm pack --dry-run lists none.
- `run-2026-10-27-2` CLOSED: done: actionlint 1.7.12 (rhysd/actionlint image) reports 0 errors for ci.yml and release.yml, also after the CI change in 6155f66.
- `run-2026-10-27-3` FIXED in 387bddb: a cancellation is reported as CANCELLED, a timeout as TIMEOUT.
- `run-2026-10-27-4` FIXED in 0610ba7: a first row larger than the cap is skipped with oversized_row {offset, id}, so next_offset always moves forward.
- `run-2026-10-27-5` FIXED in 7da9ca6: values above 8 MiB give a startup warning (no ceiling, so no working setting is rejected).
- `redteam-2026-10-27-1` FIXED in a73a58c: ADR 0001 names the red team's run of the gateway's Python MCP client as the source.
- `redteam-2026-10-27-2` FIXED in 0610ba7: no em or en dash in source, generated descriptions, tests or docs; docsFacts holds it.
- `redteam-2026-10-27-3` FIXED in 6be9f95: the hint says the guard is on, not that the variable is set to true.
- `redteam-2026-10-27-4` FIXED in a73a58c: SECURITY.md names the version in package.json on main instead of a fixed number.
- `redteam-2026-10-27-5` FIXED in 387bddb: callList uses the PAGINATION constants.
- `redteam-2026-10-27-6` FIXED in 6be9f95: an oversized result of an executed write says the write ran and must not be repeated.

## Owner decisions (not backlog work)

- `release-public-01`: fixed in code since 61608f0 (part of 0.2.0); publishing 0.2.0 and deprecating <=0.1.7 on npm: owner decision.
- `release-public-02`: owner decision (npm account e-mail).
- `release-public-05`: owner decision (history rewrite or fresh public repo, token revocation).
- `release-public-06`: fixed in c445a9d (dependabot.yml); closing the stale Dependabot pull requests: owner decision.
- `release-public-08`: owner decision (repository visibility); CHANGELOG statement corrected. Steps for visibility, rulesets, npm trusted publisher, `NPM_PUBLISH_ENABLED`, MCP Registry and Glama: `docs/maintainers/repo-settings.md`.
- `release-prep-2026-10-27-1`: the tree is clean (`tests/unit/publicHygiene.test.ts` with the local deny-list), but the git history of `main` and of the remote branches still contains the company name, a local home path and, on one remote branch, a commit authored with the company mail address; all of it becomes public with the repository. Owner decision, together with `release-public-05`: rewrite the history or publish a fresh repository from a squashed tree, and delete the stale remote branches before switching to public.
- `run-2026-10-27-6`: before deploying 0.2.x, read SNIPEIT_CONFIRM_WRITES in the gateway's real .env on the gateway host. Recommendation: leave it unset or set `true`; after the deploy, the stderr startup line `write guard: on|off` shows the effective state, and an unrecognised value logs a warning.
- `redteam-2026-10-27-7`: before the deploy, check on the gateway host that SNIPEIT_API_BASE answers without a redirect (a GET of <base>/hardware?limit=1 with the token must return 200, not 3xx). Recommendation: set the final https URL including /api/v1 without a trailing slash.
