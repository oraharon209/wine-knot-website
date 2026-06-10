#!/usr/bin/env bash
# Run on the production server after git pull (see .github/workflows/deploy.yml).
set -euo pipefail

APP_DIR="/opt/wine-knot"
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.production.yml)

cd "$APP_DIR"

if [ -f /usr/local/bin/wine-knot-refresh-secrets ]; then
  # Updates .env from SSM; ends with backend recreate.
  /usr/local/bin/wine-knot-refresh-secrets
fi

"${COMPOSE[@]}" up -d --build
docker image prune -f

echo "Deploy complete: $(git rev-parse --short HEAD)"
