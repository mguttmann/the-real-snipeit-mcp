#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
URL="https://snipe-it.readme.io/openapi/snipe-it-rest-api.json"
OUT="${ROOT}/vendor/snipe-it-rest-api.json"

echo "→ fetching ${URL}"
curl -fsSL --connect-timeout 15 --max-time 90 "${URL}" -o "${OUT}.tmp"

# Sanity check
node -e "const s=require('fs').readFileSync('${OUT}.tmp','utf8'); const o=JSON.parse(s); if(!o.paths) throw new Error('missing paths'); console.log('paths:', Object.keys(o.paths).length);"

mv "${OUT}.tmp" "${OUT}"
echo "✓ wrote ${OUT}"
