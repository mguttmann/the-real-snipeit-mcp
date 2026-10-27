# Releasing (maintainers)

Releases are built and published by `.github/workflows/release.yml`. It runs only
when a tag matching `v*.*.*` is pushed; nothing else triggers it (no branch push, no
pull request, no manual dispatch). `tests/unit/releaseChain.test.ts` and
`tests/unit/releaseWorkflow.test.ts` hold these rules.

## What the workflow does

| Job | What it does |
|---|---|
| `verify` | Fails unless the tag equals `v` + the `package.json` version and the tag commit is on `main`. A version with a hyphen (`0.3.0-rc.1`) is a prerelease. |
| `ci` | Runs the whole CI workflow (`ci.yml`, via `workflow_call`) on the tag commit: Node 22, 24 and 26, lint, typecheck, unit tests, build, tool contract and protocol tests, `npm audit --omit=dev --audit-level=high`. |
| `build` | `npm ci --ignore-scripts`, then `scripts/release-assets.sh`: `npm pack` (the `prepack` script cleans `dist/` and builds; `prebuild` runs lint, typecheck and unit tests), a CycloneDX SBOM of the runtime dependency tree installed from the lockfile (`scripts/release-sbom.mjs`, timestamp = commit time), and `SHA256SUMS` over the tarball and the SBOM. |
| `github-release` | Build provenance attestation for the tarball and the SBOM (public repository only), then a GitHub release with the tarball, the SBOM and `SHA256SUMS`. An existing release is never overwritten. |
| `npm-publish` | Only if the repository variable `NPM_PUBLISH_ENABLED` is `true`. Checks that npm is 11.5.1 or newer, checks the tarball from the build job against `SHA256SUMS`, then runs `npm publish ./release/the-real-snipeit-mcp-*.tgz --provenance --access public` with npm trusted publishing (GitHub OIDC, no token). The leading `./` is required: without it npm reads `release/x.tgz` as a GitHub `owner/repo` shorthand. Prereleases go to the `next` dist-tag, others to `latest`. |
| `mcp-registry` | Stable versions only, and only after `npm-publish` succeeded. Runs `mcp-registry.yml`: waits until npm serves the version with `mcpName`, then publishes `server.json` to the MCP Registry with a pinned, checksum-verified `mcp-publisher` and GitHub OIDC. A version the registry already lists is skipped. |

`package.json` sets `publishConfig.provenance: true`, so a publish without an OIDC
identity (for example from a laptop) fails instead of producing an untraceable
package.

## One-time setup (owner)

Repository visibility, Actions permissions, code security, rulesets, the
npm trusted publisher, the `NPM_PUBLISH_ENABLED` variable, the MCP
Registry and Glama: `docs/maintainers/repo-settings.md`. Until the
variable is `true` the workflow creates the GitHub release but does not
publish to npm or the MCP Registry. Provenance attestations need a public
repository; the step is skipped while the repository is private.

## Cutting a release

1. On a branch: set the new version with
   `npm version <x.y.z> --no-git-tag-version` (updates `package.json` and the lockfile
   root), and set the same version in `server.json` (`version` and
   `packages[0].version`). The server reports this version in `serverInfo`; it is read from
   `package.json` at startup (`src/constants.ts`). `server.json` is the only other
   place, and `tests/unit/releaseWorkflow.test.ts` fails until it matches.
2. Move the `[Unreleased]` entries of `CHANGELOG.md` under a new
   `## [x.y.z] - YYYY-MM-DD` heading.
3. Run the checks: `npm run lint && npm run typecheck && npm test && npm run build && npm run test:contract`.
4. Merge into `main` (CI must be green there).
5. Tag the merge commit on `main` and push the tag:

   ```bash
   git tag -a vx.y.z -m "vx.y.z"
   git push origin vx.y.z
   ```

6. Watch the `Release` run. If `verify` fails, the tag does not match the version or
   is not on `main`: delete the tag (`git push origin :refs/tags/vx.y.z`), fix, retag.

## After a release

Check that the published package is the one the workflow built:

```bash
npm view the-real-snipeit-mcp dist-tags.latest            # the new version
npm view the-real-snipeit-mcp@x.y.z dist.attestations     # provenance present
gh release download vx.y.z -R mguttmann/the-real-snipeit-mcp --pattern SHA256SUMS -O -
npm pack the-real-snipeit-mcp@x.y.z && shasum -a 256 the-real-snipeit-mcp-x.y.z.tgz
```

The SHA-256 of the tarball npm serves must equal its line in the release's
`SHA256SUMS`. In the MCP Registry,
`https://registry.modelcontextprotocol.io/v0.1/servers/io.github.mguttmann%2Fthe-real-snipeit-mcp/versions/x.y.z`
returns the entry.

To try the asset build locally (no upload, no publish): `npm ci && bash scripts/release-assets.sh`,
then remove `release/`.

## Dependency updates

`.github/dependabot.yml` opens grouped pull requests against `main` every Monday for npm
(runtime and dev dependencies in separate groups, minor and patch) and GitHub Actions,
with a five-day cooldown for new versions. Majors of `@types/node` are ignored: it follows
the oldest supported Node line (22, `engines >=22.12`).
