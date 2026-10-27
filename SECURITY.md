# Security Policy

## Reporting a vulnerability

If you find a security issue, **please do not open a public GitHub issue.**

Use [GitHub Private Vulnerability Reporting](https://github.com/mguttmann/the-real-snipeit-mcp/security/advisories/new) for this repository (Security > Report a vulnerability). Include the affected version, the configuration (which `SNIPEIT_*` variables are set, never their secret values), steps to reproduce and the impact you see. Never include a real API token.

This project is maintained on a best-effort basis by one maintainer. Reports are acknowledged as soon as possible, with no guaranteed response time; security fixes take priority over all other work. A confirmed issue is fixed in a patch release of the latest minor version, and the advisory is published together with that release.

## Scope

This is an MCP server that wraps the Snipe-IT REST API. Relevant security concerns include:

- **Token handling**: `SNIPEIT_API_TOKEN` must only be read from environment variables, never logged or persisted to disk. The logger and every error text returned to the model redact Bearer tokens, JWTs, `Authorization` headers of any scheme, secret-named JSON fields and query parameters (`api_token`, `password`, `secret`, `token`, `api_key`) and URL userinfo.
- **Status-envelope handling**: Snipe-IT returns HTTP 200 for many failures with `{"status":"error",…}`. The client detects this and throws; a regression that re-treats it as success would be a critical issue.
- **Write-safety gate**: unless `SNIPEIT_CONFIRM_WRITES` is explicitly `false`, `0`, `no` or `off`, every destructive tool must return a preview instead of executing when called without `confirm: "YES"`. An unset, empty or mistyped value must keep the gate on. `confirm` is set by the model: the gate catches a model that forgets it, not a prompt injection in Snipe-IT data that adds it, so it is not a human-approval control. Human approval belongs to the MCP host or gateway; `SNIPEIT_READ_ONLY=true` refuses every write on the server side, and `SNIPEIT_REQUIRE_PREVIEW=true` makes every write go through a preview first.
- **Origin pinning**: every request, including `snipeit_raw_request`, must stay on the `SNIPEIT_API_BASE` origin and path prefix, and redirects must never be followed; the bearer token must never reach another host.
- **Redaction**: write previews must scrub fields matching `password|secret|token|api[_-]?key`.

## Data sent to the model provider

Tool results go to the MCP client and, through it, to the model provider the client uses. They carry Snipe-IT data as the API returns it, including personal data of users: names, user names, e-mail addresses, employee numbers, phone numbers and addresses (for example `assigned_to` on assets). Set `SNIPEIT_REDACT_PII=true` to replace those fields with `(redacted)` in every tool result; asset, model and location names stay. Logs contain no personal data at the default level `info`; at `debug` the request line includes the URL with its query (for example a search term).

## Out of scope

- Vulnerabilities in Snipe-IT itself: report to [the Snipe-IT project](https://github.com/snipe/snipe-it/security).
- Vulnerabilities in dependencies: report them upstream. Dependabot (`.github/dependabot.yml`) proposes updates weekly, and CI fails on high or critical advisories in runtime dependencies (`npm audit --omit=dev --audit-level=high`). Open a private advisory here if a dependency issue affects this server and is not yet fixed.
- Vulnerabilities in the Model Context Protocol SDK: report to [the MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).

## Supported versions

Only the latest minor release (the `version` in `package.json` on `main`) receives security fixes; fixes ship as patch releases. Versions 0.1.7 and older can send the API token to a host other than `SNIPEIT_API_BASE` (see `CHANGELOG.md`, 0.2.0); upgrade. Supported Node.js versions: 22.12 or newer (`engines` in `package.json`).

## Verifying a release

Releases are built and published only by the release workflow (`.github/workflows/release.yml`) from a version tag on `main`, with npm trusted publishing. `npm audit signatures` checks the registry signatures and provenance attestations of an install; `npm view the-real-snipeit-mcp@<version> dist.attestations` shows the provenance of one version, and the tarball's SHA-256 equals the line in the GitHub release's `SHA256SUMS`.

## Disclosure

Once a fix is released, the advisory will be published with credit unless you request anonymity.
