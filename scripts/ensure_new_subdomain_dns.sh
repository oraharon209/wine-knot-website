#!/usr/bin/env bash
# Create/update Cloudflare A record new.<zone> → this instance's public IP (proxied),
# and keep SSL mode "full" so the self-signed origin cert works (not Full Strict).
# Runs on the EC2 origin (IAM can read /wine-knot/cloudflare_api_token).
set -euo pipefail

ZONE_NAME="${1:-wineknot.co.il}"
RECORD_NAME="new.${ZONE_NAME}"
AWS_REGION="${AWS_REGION:-eu-north-1}"
PROJECT="${PROJECT_NAME:-wine-knot}"

TOKEN="${CF_API_TOKEN:-${CLOUDFLARE_API_TOKEN:-}}"
if [ -z "$TOKEN" ]; then
  TOKEN="$(aws ssm get-parameter --region "$AWS_REGION" --name "/${PROJECT}/cloudflare_api_token" \
    --with-decryption --query 'Parameter.Value' --output text)"
fi
if [ -z "$TOKEN" ] || [ "$TOKEN" = "None" ]; then
  echo "No Cloudflare API token (SSM /${PROJECT}/cloudflare_api_token)" >&2
  exit 1
fi

public_ip() {
  local imds_token ip
  imds_token="$(curl -fsS -X PUT "http://169.254.169.254/latest/api/token" \
    -H "X-aws-ec2-metadata-token-ttl-seconds: 60" 2>/dev/null || true)"
  if [ -n "$imds_token" ]; then
    ip="$(curl -fsS -H "X-aws-ec2-metadata-token: $imds_token" \
      http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || true)"
  fi
  if [ -z "${ip:-}" ]; then
    ip="$(curl -fsS https://ifconfig.me/ip 2>/dev/null || true)"
  fi
  echo "$ip"
}

IP="$(public_ip)"
if [ -z "$IP" ]; then
  echo "Could not determine public IP" >&2
  exit 1
fi

export TOKEN ZONE_NAME RECORD_NAME IP
python3 - <<'PY'
import json, os, urllib.request, urllib.error, urllib.parse

token = os.environ["TOKEN"]
zone_name = os.environ["ZONE_NAME"]
record_name = os.environ["RECORD_NAME"]
ip = os.environ["IP"]

def cf(method, path, body=None):
    req = urllib.request.Request(
        "https://api.cloudflare.com/client/v4" + path,
        data=None if body is None else json.dumps(body).encode(),
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", "replace")
        raise SystemExit(f"Cloudflare API {method} {path} failed ({e.code}): {err}") from e

zones = cf("GET", "/zones?" + urllib.parse.urlencode({"name": zone_name}))
if not zones.get("success") or not zones.get("result"):
    raise SystemExit(f"Zone not found: {zone_name} ({zones})")
zone_id = zones["result"][0]["id"]

records = cf(
    "GET",
    f"/zones/{zone_id}/dns_records?" + urllib.parse.urlencode({"name": record_name, "type": "A"}),
)
existing = records.get("result") or []
payload = {
    "type": "A",
    "name": "new",
    "content": ip,
    "proxied": True,
    "ttl": 1,
}
if existing:
    rec_id = existing[0]["id"]
    result = cf("PUT", f"/zones/{zone_id}/dns_records/{rec_id}", payload)
    action = "updated"
else:
    result = cf("POST", f"/zones/{zone_id}/dns_records", payload)
    action = "created"

if not result.get("success"):
    raise SystemExit(f"DNS {action} failed: {result}")
rec = result["result"]
print(f"Cloudflare A {action}: {rec.get('name')} → {rec.get('content')} proxied={rec.get('proxied')}")

# Self-signed origin cert requires SSL mode "full" (not "strict").
for setting, value in (("ssl", "full"), ("always_use_https", "on")):
    try:
        out = cf("PATCH", f"/zones/{zone_id}/settings/{setting}", {"value": value})
        if out.get("success"):
            print(f"Cloudflare setting {setting}={value}")
        else:
            print(f"Cloudflare setting {setting} skipped: {out}")
    except SystemExit as e:
        print(f"Cloudflare setting {setting} skipped: {e}")
PY
