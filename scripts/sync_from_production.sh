#!/usr/bin/env bash
# Pull live admin catalog (DB + S3 images) into the local repo seed files.
#
# Prerequisites:
#   - AWS CLI configured (for S3 sync)
#   - SSH access to the production server (terraform output public_ip)
#   - Local Docker Compose stack running (mysql container)
#
# Usage:
#   ./scripts/sync_from_production.sh                    # SSH dump from production
#   ./scripts/sync_from_production.sh --via-ssm          # SSM dump (CI / no SSH)
#   ./scripts/sync_from_production.sh /path/to/dump.sql  # use existing dump
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE=(docker compose)
VIA_SSM=false
DUMP_FILE=""

if [ "${1:-}" = "--via-ssm" ]; then
  VIA_SSM=true
elif [ -n "${1:-}" ] && [ -f "${1:-}" ]; then
  DUMP_FILE="$1"
fi
SSH_HOST="${SSH_HOST:-}"
S3_BUCKET="${S3_BUCKET:-}"
AWS_REGION="${AWS_REGION:-eu-north-1}"

if [ -z "$SSH_HOST" ] && [ -f terraform/terraform.tfstate ]; then
  SSH_HOST="ubuntu@$(terraform -chdir=terraform output -raw public_ip 2>/dev/null || true)"
fi
if [ "$SSH_HOST" = "ubuntu@" ]; then
  SSH_HOST=""
fi

if [ -z "$S3_BUCKET" ] && [ -f terraform/terraform.tfstate ]; then
  S3_BUCKET="$(terraform -chdir=terraform output -raw s3_bucket 2>/dev/null || true)"
fi

if [ "$VIA_SSM" = true ]; then
  echo "Dumping production MySQL via SSM ..."
  DUMP_FILE="$("$ROOT/scripts/dump_production_via_ssm.sh" | tail -1)"
elif [ -z "$DUMP_FILE" ]; then
  if [ -z "$SSH_HOST" ]; then
    echo "Set SSH_HOST=ubuntu@<ip>, use --via-ssm, or pass /path/to/live-dump.sql"
    exit 1
  fi
  DUMP_FILE="$(mktemp /tmp/wineknot-live-XXXXXX.sql)"
  echo "Dumping production MySQL from $SSH_HOST ..."
  ssh "$SSH_HOST" 'bash -s' <<'REMOTE' > "$DUMP_FILE"
set -euo pipefail
cd /opt/wine-knot
ROOT_PASS=$(grep '^MYSQL_ROOT_PASSWORD=' .env | cut -d= -f2-)
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  exec -T mysql mysqldump -u root -p"$ROOT_PASS" \
  --no-tablespaces --single-transaction \
  wineknot categories wines recommended_wines
REMOTE
  echo "Saved dump to $DUMP_FILE"
fi

# shellcheck disable=SC1091
source .env 2>/dev/null || true
export MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-rootpass}"
DB_ROOT_PASSWORD="$MYSQL_ROOT_PASSWORD"
IMPORT_DB="${SYNC_IMPORT_DB:-wineknot_sync}"

if [ "$VIA_SSM" = true ]; then
  # CI runner: discard any stale compose volume so root password matches MYSQL_ROOT_PASSWORD
  "${COMPOSE[@]}" down -v 2>/dev/null || true
fi

echo "Starting local MySQL ..."
"${COMPOSE[@]}" up -d mysql
for _ in $(seq 1 60); do
  if "${COMPOSE[@]}" exec -T mysql mysql -u root -p"$DB_ROOT_PASSWORD" -e "SELECT 1" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
if ! "${COMPOSE[@]}" exec -T mysql mysql -u root -p"$DB_ROOT_PASSWORD" -e "SELECT 1" >/dev/null 2>&1; then
  echo "Local MySQL did not become ready" >&2
  exit 1
fi

echo "Importing dump into local database $IMPORT_DB ..."
"${COMPOSE[@]}" exec -T mysql mysql -u root -p"$DB_ROOT_PASSWORD" -e "DROP DATABASE IF EXISTS $IMPORT_DB; CREATE DATABASE $IMPORT_DB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
sed "s/\`wineknot\`/\`$IMPORT_DB\`/g; s/USE wineknot/USE $IMPORT_DB/I" "$DUMP_FILE" \
  | "${COMPOSE[@]}" exec -T mysql mysql -u root -p"$DB_ROOT_PASSWORD" "$IMPORT_DB"

echo "Exporting wines_data.json ..."
MYSQL_CID="$("${COMPOSE[@]}" ps -q mysql)"
DOCKER_NET="$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' "$MYSQL_CID")"
docker run --rm --network "$DOCKER_NET" \
  -v "$ROOT:/work" -w /work \
  -e DB_HOST=mysql \
  -e DB_USER=root \
  -e DB_PASSWORD="$DB_ROOT_PASSWORD" \
  -e DB_NAME="$IMPORT_DB" \
  python:3.12-slim \
  bash -lc 'pip install -q mysql-connector-python && python scripts/export_live_catalog.py wines_data.json'

if [ -n "$S3_BUCKET" ]; then
  echo "Syncing S3 images → frontend/public/images/wines/ ..."
  mkdir -p frontend/public/images/wines
  aws s3 sync "s3://$S3_BUCKET/wines/" frontend/public/images/wines/ --region "$AWS_REGION"
else
  echo "S3_BUCKET not set — skipping image sync (set S3_BUCKET or apply terraform for output)"
fi

echo "Rebuilding backend/config/init.sql ..."
if [ -x "$ROOT/.venv/bin/python" ]; then
  "$ROOT/.venv/bin/python" scripts/build_init_sql.py
else
  python3 scripts/build_init_sql.py
fi

echo ""
echo "Done. Review changes:"
echo "  git diff wines_data.json backend/config/init.sql frontend/public/images/wines/"
echo "Then commit when ready."
