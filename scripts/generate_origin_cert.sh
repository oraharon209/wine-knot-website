#!/bin/bash
# Self-signed origin cert — works with Cloudflare SSL mode "Full" (not Full Strict).
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)/nginx/ssl"
DOMAIN="${1:-wineknot.co.il}"
mkdir -p "$DIR"
openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout "$DIR/origin.key" \
  -out "$DIR/origin.crt" \
  -subj "/CN=$DOMAIN"
chmod 600 "$DIR/origin.key"
echo "Created $DIR/origin.crt and origin.key for $DOMAIN"
