# Repository settings (maintainers)

The workflows in `.github/workflows/` assume the GitHub and npm settings
below. A workflow cannot set them itself; the repository owner applies
them once, in the web UI or with the `gh` calls shown. Order matters for
the first public release: sections 1 to 5 first, then section 6 (npm),
then a release tag, then sections 7 and 8.

`tests/unit/releaseWorkflow.test.ts` fails when a CI check name is not
listed in the `main` ruleset below.

## 1. Visibility

Settings > General > Danger Zone > Change visibility: **Public**. Before
that, check the history that becomes public (gitleaks over all
branches, no internal names or paths; see `docs/BACKLOG.md`, owner
decisions). Private vulnerability reporting, rulesets on the free plan,
CodeQL default setup, npm provenance and GitHub build provenance
attestations all need a public repository.

```bash
gh repo edit mguttmann/the-real-snipeit-mcp --visibility public --accept-visibility-change-consequences
```

## 2. Actions

Settings > Actions > General:

- **Workflow permissions**: *Read repository contents and packages
  permissions*. Every workflow declares its own minimal `permissions`;
  only the `github-release`, `npm-publish` and `mcp-registry` jobs of
  `release.yml` and the `publish` job of `mcp-registry.yml`
  (`id-token: write`, also when started by hand) ask for more.
- **Allow GitHub Actions to create and approve pull requests**: off.
- **Actions permissions**: allow actions created by GitHub (all actions
  in use are `actions/*`, pinned by commit SHA).
- **Fork pull request workflows**: require approval for all outside
  collaborators.

```bash
gh api -X PUT repos/mguttmann/the-real-snipeit-mcp/actions/permissions/workflow \
  -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false
```

## 3. Code security

Settings > Code security:

- **Private vulnerability reporting**: on (the channel `SECURITY.md`
  points to).
- **Dependabot alerts** and **Dependabot security updates**: on.
  Version updates are configured in `.github/dependabot.yml`.
- **Secret scanning** with **push protection**: on.
- **CodeQL**: default setup for JavaScript/TypeScript and GitHub
  Actions. After its first run, add its check to the `main` ruleset.

```bash
gh api -X PUT repos/mguttmann/the-real-snipeit-mcp/private-vulnerability-reporting
gh api -X PUT repos/mguttmann/the-real-snipeit-mcp/vulnerability-alerts
gh api -X PUT repos/mguttmann/the-real-snipeit-mcp/automated-security-fixes
gh api -X PATCH repos/mguttmann/the-real-snipeit-mcp --input - <<'EOF'
{ "security_and_analysis": {
    "secret_scanning": { "status": "enabled" },
    "secret_scanning_push_protection": { "status": "enabled" } } }
EOF
```

## 4. Ruleset for `main`

Settings > Rules > Rulesets > New branch ruleset.

- Name `main`, enforcement **Active**, target **Default branch**,
  bypass actor **Repository admin** (the single maintainer pushes
  directly; outside contributions go through pull requests and the
  required checks).
- **Restrict deletions** and **Block force pushes**.
- **Require a pull request before merging** (required approvals 0 while
  there is a single maintainer; raise it with a second one).
- **Require status checks to pass**, with **Require branches to be up to
  date before merging**. Required checks (job names of
  `.github/workflows/ci.yml`, GitHub Actions as the source):
  - `Lint + Typecheck + Test + Build (Node 22)`
  - `Lint + Typecheck + Test + Build (Node 24)`
  - `Lint + Typecheck + Test + Build (Node 26)`

The same checks run again on every release tag: `release.yml` calls
`ci.yml` on the tag commit and refuses a tag whose commit is not on
`main`.

```bash
gh api -X POST repos/mguttmann/the-real-snipeit-mcp/rulesets --input - <<'EOF'
{
  "name": "main",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [ { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" } ],
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "pull_request", "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false } },
    { "type": "required_status_checks", "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [
          { "context": "Lint + Typecheck + Test + Build (Node 22)" },
          { "context": "Lint + Typecheck + Test + Build (Node 24)" },
          { "context": "Lint + Typecheck + Test + Build (Node 26)" }
        ] } }
  ]
}
EOF
```

## 5. Ruleset for release tags

Settings > Rules > Rulesets > New tag ruleset: name `release-tags`,
enforcement **Active**, target pattern `v*`, bypass actor **Repository
admin**, rules **Restrict creations**, **Restrict updates**, **Restrict
deletions**. A published tag then cannot be moved to another commit.

```bash
gh api -X POST repos/mguttmann/the-real-snipeit-mcp/rulesets --input - <<'EOF'
{
  "name": "release-tags",
  "target": "tag",
  "enforcement": "active",
  "bypass_actors": [ { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" } ],
  "conditions": { "ref_name": { "include": ["refs/tags/v*"], "exclude": [] } },
  "rules": [ { "type": "creation" }, { "type": "update" }, { "type": "deletion" } ]
}
EOF
```

## 6. npm trusted publishing

The package `the-real-snipeit-mcp` already exists on npm (0.1.5 to 0.1.7,
published by hand without provenance), so no first manual publish is
needed. The `npm-publish` job of `release.yml` publishes only when both
of these are done:

1. **Trusted publisher.** On npmjs.com, package `the-real-snipeit-mcp` >
   Settings > Trusted publishing > GitHub Actions:
   - Organization or user: `mguttmann`
   - Repository: `the-real-snipeit-mcp`
   - Workflow filename: `release.yml`
   - Environment: empty (the `npm-publish` job declares none)

   The job needs no `NPM_TOKEN`; it checks that its npm is 11.5.1 or
   newer, which trusted publishing requires, and publishes
   `./release/the-real-snipeit-mcp-<version>.tgz` (the tarball of the
   GitHub release, checked against `SHA256SUMS`) with provenance.
2. **Switch on**, then release soon:

   ```bash
   gh variable set NPM_PUBLISH_ENABLED --body true -R mguttmann/the-real-snipeit-mcp
   ```

   Push the next release tag within about two days (see
   `docs/maintainers/release.md`), so the trusted publisher is proven by
   a real publish while the setup is fresh. The trusted publisher is
   validated only by that first workflow publish: check that the
   `npm-publish` job succeeds and that the version on npmjs.com shows a
   provenance statement. Afterwards, optionally disallow token-based
   publishing in the package settings so only the workflow can publish.

With the variable unset, `npm-publish` and `mcp-registry` are skipped and
the workflow only creates the GitHub release.

## 7. MCP Registry

`server.json` describes the server for the official MCP Registry
(`registry.modelcontextprotocol.io`) as
`io.github.mguttmann/the-real-snipeit-mcp`, with the npm package
`the-real-snipeit-mcp` as its only package. The `mcp-registry` job of
`release.yml` (stable tags only, after `npm-publish` succeeded) runs
`.github/workflows/mcp-registry.yml`, which can also be started by hand
for an existing tag (Actions > MCP Registry > Run workflow, input `tag`).
No repository setting and no secret is needed:

- Authentication is GitHub OIDC (`id-token: write`); the registry grants
  the namespace `io.github.<repository owner>/*`.
- The registry accepts the npm package only when npm serves that version
  with `mcpName` equal to the server name (`mcpName` in `package.json`).
  0.1.x on npm has no `mcpName`, so the first listable version is the
  first release from this workflow. The workflow waits for npm and fails
  if the version does not appear.
- A version the registry already lists is skipped, because registry
  versions are permanent.
- `mcp-publisher` is pinned by version and SHA-256 in the workflow
  (`MCP_PUBLISHER_VERSION`, `MCP_PUBLISHER_SHA256`, value from the
  registry release's `registry_<version>_checksums.txt`).

A listed version can be marked deprecated or deleted with
`mcp-publisher status` after a `mcp-publisher login github`; it cannot
be replaced.

## 8. Glama

Glama lists public MCP repositories on its own, at
`https://glama.ai/mcp/servers/mguttmann/the-real-snipeit-mcp` once it has
picked this one up. The `glama.json` in the repository root names the
GitHub users who may maintain that listing (`maintainers`); Glama reads
it only during its "Claim" flow, so after a change to the file the
maintainer claims again. Signed in on glama.ai with GitHub as a listed
maintainer, claim the listing on its page.

Glama's tool inspection runs the server in a container configured in the
listing's admin area (Node.js version, build steps, start command,
environment). The server answers `tools/list` without calling the
Snipe-IT API, so placeholders are enough (any `https://` URL for
`SNIPEIT_API_BASE`, any non-empty `SNIPEIT_API_TOKEN`); never enter a
real API token there.

## Check the result

```bash
gh repo view mguttmann/the-real-snipeit-mcp --json visibility
gh api repos/mguttmann/the-real-snipeit-mcp/rulesets
gh api repos/mguttmann/the-real-snipeit-mcp/actions/permissions/workflow
gh api repos/mguttmann/the-real-snipeit-mcp/private-vulnerability-reporting
gh api repos/mguttmann/the-real-snipeit-mcp/vulnerability-alerts   # 204 when on
gh variable list -R mguttmann/the-real-snipeit-mcp
```
