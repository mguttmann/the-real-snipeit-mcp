# Security Policy

## Reporting a vulnerability

If you find a security issue, **please do not open a public GitHub issue.**

Use [GitHub's private vulnerability reporting](https://github.com/mguttmann/the-real-snipeit-mcp/security/advisories/new) for this repository. You'll get an acknowledgement within 72 hours.

## Scope

This is an MCP server that wraps the Snipe-IT REST API. Relevant security concerns include:

- **Token handling**: `SNIPEIT_API_TOKEN` must only be read from environment variables, never logged or persisted to disk (the logger redacts Bearer tokens, JWTs, `api_token` fields, and `Authorization` headers before any output).
- **Status-envelope handling**: Snipe-IT returns HTTP 200 for many failures with `{"status":"error",…}`. The client detects this and throws — a regression that re-treats it as success would be a critical issue.
- **Write-safety gate**: `SNIPEIT_CONFIRM_WRITES=true` must reliably block destructive operations without an explicit `confirm: "YES"` argument.
- **Redaction**: write previews must scrub fields matching `password|secret|token|api[_-]?key`.

## Out of scope

- Vulnerabilities in Snipe-IT itself — report to [the Snipe-IT project](https://github.com/snipe/snipe-it/security).
- Vulnerabilities in dependencies — Dependabot alerts are enabled; consider opening a private advisory if you find one not yet flagged.
- Vulnerabilities in the Model Context Protocol SDK — report to [Anthropic's MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk).

## Supported versions

Only the latest minor release receives security fixes. We're on `0.1.x` — fixes ship as patch releases.

## Disclosure

Once a fix is released, the advisory will be published with credit unless you request anonymity.
