#!/usr/bin/env bash
# Build the release assets into release/ (used by .github/workflows/release.yml):
#   the-real-snipeit-mcp-<version>.tgz      npm pack (prepack: clean + build,
#                                           and prebuild runs lint, typecheck, unit tests)
#   the-real-snipeit-mcp-<version>.cdx.json CycloneDX SBOM of the runtime tree
#                                           installed from the lockfile
#   SHA256SUMS                              over both files
# Needs a prior `npm ci` (dev dependencies for the build). The SBOM
# timestamp is SOURCE_DATE_EPOCH, by default the commit time of HEAD.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERSION="$(node -p "require('./package.json').version")"
NAME="$(node -p "require('./package.json').name")"
export SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-$(git log -1 --format=%ct)}"

# A fresh directory each run; never reuse old assets.
if [ -e release ]; then
  echo "error: release/ already exists; remove it first." >&2
  exit 1
fi
mkdir release

npm pack --pack-destination release

# Runtime tree for the SBOM, installed from the same lockfile.
STAGE="$(mktemp -d)"
trap 'rm -rf -- "$STAGE"' EXIT
cp package.json package-lock.json "$STAGE/"
(cd "$STAGE" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)
node -e "
const fs = require('fs');
const f = process.argv[1];
const pkg = JSON.parse(fs.readFileSync(f, 'utf8'));
delete pkg.devDependencies;
fs.writeFileSync(f, JSON.stringify(pkg, null, 2) + '\n');
" "$STAGE/package.json"
node scripts/release-sbom.mjs "$STAGE" library "release/${NAME}-${VERSION}.cdx.json"

cd release
sha256sum -- *.tgz *.cdx.json > SHA256SUMS 2>/dev/null || shasum -a 256 -- *.tgz *.cdx.json > SHA256SUMS
cat SHA256SUMS
