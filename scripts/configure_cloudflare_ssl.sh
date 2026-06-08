#!/usr/bin/env bash
# Set Cloudflare edge TLS to 1.2+ and enable HSTS (SSL Labs A / A+).
# Usage: CF_API_TOKEN=... ./scripts/configure_cloudflare_ssl.sh [zone_name]
set -euo pipefail

ZONE_NAME="${1:-wineknot.co.il}"
TOKEN="${CF_API_TOKEN:-${CLOUDFLARE_API_TOKEN:-}}"

if [[ -z "$TOKEN" ]]; then
  echo "Set CF_API_TOKEN or CLOUDFLARE_API_TOKEN" >&2
  exit 1
fi

ZONE_ID=$(curl -fsS -H "Authorization: Bearer $TOKEN" \
  "https://api.cloudflare.com/client/v4/zones?name=${ZONE_NAME}" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['result'][0]['id'])")

patch_setting() {
  local setting="$1"
  local value="$2"
  curl -fsS -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/settings/${setting}" \
    -d "{\"value\":${value}}" \
    | python3 -c "import json,sys; d=json.load(sys.stdin); exit(0 if d.get('success') else 1)" \
    || { echo "Failed: ${setting}" >&2; exit 1; }
  echo "OK: ${setting}"
}

patch_setting min_tls_version '"1.2"'
patch_setting tls_1_3 '"on"'
patch_setting always_use_https '"on"'
patch_setting security_header '{
  "strict_transport_security": {
    "enabled": true,
    "max_age": 31536000,
    "include_subdomains": true,
    "preload": true,
    "nosniff": true
  }
}'

echo "Cloudflare SSL settings updated for ${ZONE_NAME}"
