#!/usr/bin/env bash
# Run on the production server after git pull (see .github/workflows/deploy.yml).
set -euo pipefail

APP_DIR="/opt/wine-knot"
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.production.yml)
GIT_USER="${SUDO_USER:-ubuntu}"

cd "$APP_DIR"

# Re-apply dual-host nginx/compose from the last staging ref so a main deploy
# does not take down new.wineknot.co.il.
if [ -f "$APP_DIR/.staging-ref" ]; then
  STAGING_REF="$(tr -d '[:space:]' < "$APP_DIR/.staging-ref")"
  if [ -n "$STAGING_REF" ]; then
    echo "Re-applying staging overlay from $STAGING_REF"
    sudo -u "$GIT_USER" git -C "$APP_DIR" fetch origin || true
    sudo -u "$GIT_USER" git -C "$APP_DIR" checkout "$STAGING_REF" -- \
      nginx \
      docker-compose.yml \
      docker-compose.production.yml \
      scripts/generate_origin_cert.sh || true
  fi
fi

if [ -f /usr/local/bin/wine-knot-refresh-secrets ]; then
  # Updates .env from SSM; ends with backend recreate.
  /usr/local/bin/wine-knot-refresh-secrets
fi

if [ -f .env ] && ! grep -q 'https://new.wineknot.co.il' .env; then
  sed -i 's|^CORS_ORIGINS=\(.*\)|CORS_ORIGINS=\1,https://new.wineknot.co.il|' .env || true
fi

set -a
# shellcheck disable=SC1091
[ -f .env ] && . ./.env
set +a

PULL_OK=0
if [[ "${DOCKER_IMAGE_BACKEND:-}" == */* ]]; then
  echo "Pulling backend image ${DOCKER_IMAGE_BACKEND}"
  if "${COMPOSE[@]}" pull backend; then
    PULL_OK=1
  else
    echo "Docker Hub pull failed — building on the server"
  fi
fi

if [ "$PULL_OK" = 1 ]; then
  "${COMPOSE[@]}" up -d
else
  "${COMPOSE[@]}" up -d --build
fi
docker image prune -f

echo "Deploy complete: $(git rev-parse --short HEAD)"
