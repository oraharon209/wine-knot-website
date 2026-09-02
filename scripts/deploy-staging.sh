#!/usr/bin/env bash
# Publish the redesign frontend to new.wineknot.co.il without leaving production on this branch.
# Production git HEAD stays on main; nginx/compose dual-host files are overlaid from STAGING_REF.
set -euo pipefail

APP_DIR="/opt/wine-knot"
STAGING_REF="${STAGING_REF:-origin/cursor/wine-knot-redesign-67b4}"
ZONE_NAME="${CLOUDFLARE_ZONE:-wineknot.co.il}"
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.production.yml)
GIT_USER="${SUDO_USER:-ubuntu}"

cd "$APP_DIR"

run_git() {
  sudo -u "$GIT_USER" git -C "$APP_DIR" "$@"
}

run_git fetch origin

# Allow STAGING_REF as branch name or origin/branch
if [[ "$STAGING_REF" != origin/* ]] && [[ "$STAGING_REF" != */* ]]; then
  STAGING_REF="origin/${STAGING_REF}"
fi

if ! run_git rev-parse --verify "$STAGING_REF" >/dev/null 2>&1; then
  echo "Unknown staging ref: $STAGING_REF" >&2
  exit 1
fi

echo "$STAGING_REF" > "$APP_DIR/.staging-ref"
chown "$GIT_USER:$GIT_USER" "$APP_DIR/.staging-ref"

echo "Overlaying nginx/compose from $STAGING_REF (HEAD stays $(run_git rev-parse --abbrev-ref HEAD))"
run_git checkout "$STAGING_REF" -- \
  nginx \
  docker-compose.yml \
  docker-compose.production.yml \
  scripts/generate_origin_cert.sh \
  scripts/ensure_new_subdomain_dns.sh \
  scripts/ensure_staging_admin_access.sh \
  scripts/deploy-staging.sh \
  scripts/deploy.sh

# Sync into the existing bind-mount directory. Never rm/replace frontend-staging/public
# while nginx has it mounted — that leaves the container on a deleted inode (empty 403).
mkdir -p frontend-staging/public
STAGE_TMP="$(mktemp -d /tmp/wk-staging.XXXXXX)"
trap 'rm -rf "$STAGE_TMP"' EXIT
run_git archive "$STAGING_REF" frontend/public | tar -x -C "$STAGE_TMP"
if [ ! -f "$STAGE_TMP/frontend/public/index.html" ]; then
  echo "git archive missing frontend/public/index.html from $STAGING_REF" >&2
  exit 1
fi
rsync -a --delete --exclude 'images/wines/' "$STAGE_TMP/frontend/public/" frontend-staging/public/
# Wine photos live on production / S3; copy so staging HTML can resolve local fallbacks.
if [ -d frontend/public/images/wines ]; then
  mkdir -p frontend-staging/public/images/wines
  rsync -a frontend/public/images/wines/ frontend-staging/public/images/wines/ 2>/dev/null || true
fi
if [ ! -f frontend-staging/public/index.html ]; then
  echo "frontend-staging/public/index.html missing after rsync" >&2
  exit 1
fi
chown -R "$GIT_USER:$GIT_USER" frontend-staging
echo "Staging files: $(find frontend-staging/public -type f | wc -l) files (index.html ok)"

if [ -x "$APP_DIR/scripts/ensure_new_subdomain_dns.sh" ]; then
  echo "Ensuring Cloudflare DNS for new.${ZONE_NAME}"
  bash "$APP_DIR/scripts/ensure_new_subdomain_dns.sh" "$ZONE_NAME" || echo "DNS ensure failed (token/API); terraform apply can create the record"
fi

if [ -x "$APP_DIR/scripts/ensure_staging_admin_access.sh" ]; then
  echo "Ensuring Cloudflare Access covers https://new.${ZONE_NAME}/admin.html and /api/admin/*"
  bash "$APP_DIR/scripts/ensure_staging_admin_access.sh" "$ZONE_NAME" \
    || echo "Access ensure failed (token needs Access: Apps and Policies Edit, or run terraform apply for access.tf)"
fi

CERT="$APP_DIR/nginx/ssl/origin.crt"
if [ ! -f "$CERT" ] || ! openssl x509 -in "$CERT" -noout -text 2>/dev/null | grep -q "new.${ZONE_NAME}"; then
  echo "Regenerating origin certificate with SAN new.${ZONE_NAME}"
  bash "$APP_DIR/scripts/generate_origin_cert.sh" "$ZONE_NAME"
fi

if [ -f /usr/local/bin/wine-knot-refresh-secrets ]; then
  /usr/local/bin/wine-knot-refresh-secrets || true
fi

# Keep existing CORS and append staging origin if missing
if [ -f .env ] && ! grep -q "https://new.${ZONE_NAME}" .env; then
  sed -i "s|^CORS_ORIGINS=\\(.*\\)|CORS_ORIGINS=\\1,https://new.${ZONE_NAME}|" .env || true
fi

# Force-recreate nginx so bind mounts re-attach to the current directory inode.
"${COMPOSE[@]}" up -d --build --force-recreate nginx backend
docker image prune -f

echo "Verifying origin vhosts (loopback, bypasses Cloudflare)"
sleep 2
APEX_CODE="$(curl -sk -o /dev/null -w '%{http_code}' -H "Host: ${ZONE_NAME}" https://127.0.0.1/ || true)"
NEW_CODE="$(curl -sk -o /dev/null -w '%{http_code}' -H "Host: new.${ZONE_NAME}" https://127.0.0.1/ || true)"
NEW_TITLE="$(curl -sk -H "Host: new.${ZONE_NAME}" https://127.0.0.1/ | tr '\n' ' ' | sed -n 's/.*<title>\([^<]*\)<.*/\1/p' | head -c 120 || true)"
echo "Origin HTTPS apex Host=${ZONE_NAME} → HTTP ${APEX_CODE}"
echo "Origin HTTPS new  Host=new.${ZONE_NAME} → HTTP ${NEW_CODE} title=${NEW_TITLE}"
if [ "$NEW_CODE" != "200" ]; then
  echo "Staging origin check failed for new.${ZONE_NAME}" >&2
  "${COMPOSE[@]}" ps || true
  docker logs --tail 80 "$("${COMPOSE[@]}" ps -q nginx)" || true
  exit 1
fi
if ! echo "$NEW_TITLE" | grep -q 'דורון\|Wine Knot'; then
  echo "Warning: unexpected staging title: ${NEW_TITLE}" >&2
fi

echo "Staging published from $STAGING_REF → https://new.${ZONE_NAME}"
echo "Apex still serves $(run_git rev-parse --short HEAD) ($(run_git rev-parse --abbrev-ref HEAD))"
