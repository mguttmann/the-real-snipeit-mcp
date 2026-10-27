#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
URL="https://snipe-it.readme.io/openapi/snipe-it-rest-api.json"
OUT="${ROOT}/vendor/snipe-it-rest-api.json"

echo "→ fetching ${URL}"
curl -fsSL --connect-timeout 15 --max-time 90 "${URL}" -o "${OUT}.tmp"

# Sanity check + hygiene: strip readme.io explorer Authorization headers so no
# token (dead or live) ever lands in vendor/ (see issue #41).
node -e "
const fs = require('fs');
const s = fs.readFileSync('${OUT}.tmp', 'utf8');
const o = JSON.parse(s);
if (!o.paths) throw new Error('missing paths');
if (o['x-readme'] && Array.isArray(o['x-readme'].headers)) {
  const before = o['x-readme'].headers.length;
  o['x-readme'].headers = o['x-readme'].headers.filter(
    (h) => String(h && h.key).toLowerCase() !== 'authorization',
  );
  const stripped = before - o['x-readme'].headers.length;
  if (stripped > 0) console.log('stripped', stripped, 'x-readme Authorization header(s)');
}
fs.writeFileSync('${OUT}.tmp', JSON.stringify(o));
console.log('paths:', Object.keys(o.paths).length);
"

mv "${OUT}.tmp" "${OUT}"
echo "✓ wrote ${OUT}"
