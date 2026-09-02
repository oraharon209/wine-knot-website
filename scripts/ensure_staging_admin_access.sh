#!/usr/bin/env bash
# Ensure Cloudflare Access covers staging admin (page + API) on the same app as production,
# so one email OTP session works and the origin receives Cf-Access-Authenticated-User-Email.
# Runs on the EC2 origin (IAM can read /wine-knot/cloudflare_api_token).
set -euo pipefail

ZONE_NAME="${1:-wineknot.co.il}"
APP_NAME="${ACCESS_APP_NAME:-Wine Knot Admin}"
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

export TOKEN ZONE_NAME APP_NAME
python3 - <<'PY'
import json, os, urllib.request, urllib.error, urllib.parse

token = os.environ["TOKEN"]
zone_name = os.environ["ZONE_NAME"]
app_name = os.environ["APP_NAME"]
staging_host = f"new.{zone_name}"
required_uris = [
    f"{zone_name}/admin.html",
    f"{zone_name}/api/admin/*",
    f"{staging_host}/admin.html",
    f"{staging_host}/api/admin/*",
]

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
        with urllib.request.urlopen(req, timeout=45) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", "replace")
        raise SystemExit(f"Cloudflare API {method} {path} failed ({e.code}): {err}") from e

zones = cf("GET", "/zones?" + urllib.parse.urlencode({"name": zone_name}))
if not zones.get("success") or not zones.get("result"):
    raise SystemExit(f"Zone not found: {zone_name} ({zones})")
account_id = zones["result"][0]["account"]["id"]

apps = []
page = 1
while True:
    listing = cf(
        "GET",
        f"/accounts/{account_id}/access/apps?"
        + urllib.parse.urlencode({"page": page, "per_page": 50}),
    )
    if not listing.get("success"):
        raise SystemExit(f"List Access apps failed: {listing}")
    batch = listing.get("result") or []
    apps.extend(batch)
    result_info = listing.get("result_info") or {}
    total_pages = int(result_info.get("total_pages") or 1)
    if page >= total_pages or not batch:
        break
    page += 1

def app_uris(app):
    uris = set()
    for dest in app.get("destinations") or []:
        if isinstance(dest, dict) and dest.get("uri"):
            uris.add(dest["uri"])
    for domain in app.get("self_hosted_domains") or []:
        if isinstance(domain, str):
            uris.add(domain)
        elif isinstance(domain, dict) and domain.get("self_hosted_domain"):
            uris.add(domain["self_hosted_domain"])
    if app.get("domain"):
        uris.add(app["domain"])
    return uris

app = next((a for a in apps if a.get("name") == app_name), None)
if app is None:
    # Prefer the app that already protects production admin.
    app = next((a for a in apps if f"{zone_name}/admin.html" in app_uris(a)), None)
if app is None:
    raise SystemExit(
        f"Access application '{app_name}' not found. "
        "Apply terraform/access.tf (or create the Wine Knot Admin Access app), then re-run."
    )

app_id = app["id"]
detail = cf("GET", f"/accounts/{account_id}/access/apps/{app_id}")
if not detail.get("success"):
    raise SystemExit(f"Get Access app failed: {detail}")
current = detail["result"]
existing = app_uris(current)
missing = [u for u in required_uris if u not in existing]
if not missing:
    print(
        "Cloudflare Access already covers staging admin: "
        + ", ".join(required_uris[2:])
    )
    raise SystemExit(0)

destinations = []
seen = set()
for dest in current.get("destinations") or []:
    if not isinstance(dest, dict) or not dest.get("uri"):
        continue
    uri = dest["uri"]
    if uri in seen:
        continue
    seen.add(uri)
    destinations.append({"type": dest.get("type") or "public", "uri": uri})
for domain in current.get("self_hosted_domains") or []:
    uri = domain if isinstance(domain, str) else domain.get("self_hosted_domain")
    if not uri or uri in seen:
        continue
    seen.add(uri)
    destinations.append({"type": "public", "uri": uri})
if current.get("domain") and current["domain"] not in seen:
    seen.add(current["domain"])
    destinations.append({"type": "public", "uri": current["domain"]})
for uri in required_uris:
    if uri in seen:
        continue
    seen.add(uri)
    destinations.append({"type": "public", "uri": uri})

# Preserve writable fields; drop read-only / policy linkage noise.
skip = {
    "id",
    "uid",
    "created_at",
    "updated_at",
    "aud",
    "policies",
    "self_hosted_domains",  # destinations take precedence
}
payload = {k: v for k, v in current.items() if k not in skip and v is not None}
payload["type"] = payload.get("type") or "self_hosted"
payload["name"] = payload.get("name") or app_name
payload["domain"] = payload.get("domain") or required_uris[0]
payload["destinations"] = destinations
# Preemptively set CF_Authorization on both hostnames after one OTP.
payload["eager_redirect_cookie_setting"] = True

result = cf("PUT", f"/accounts/{account_id}/access/apps/{app_id}", payload)
if not result.get("success"):
    raise SystemExit(f"Update Access app failed: {result}")

updated = app_uris(result["result"])
for uri in required_uris:
    if uri not in updated:
        raise SystemExit(f"Access update did not stick for {uri}: {updated}")

print("Cloudflare Access updated for staging admin:")
for uri in missing:
    print(f"  + {uri}")
print(
    f"Open https://{staging_host}/admin.html and complete email OTP "
    "(same allowlist as production)."
)
PY
