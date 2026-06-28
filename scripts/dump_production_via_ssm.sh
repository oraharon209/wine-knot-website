#!/usr/bin/env bash
# Dump production catalog tables to S3 via SSM, then download locally.
# Used by GitHub Actions (no SSH). Server uploads to s3://<bucket>/_sync/catalog-latest.sql
#
# Env: EC2_INSTANCE_ID, S3_BUCKET, AWS_REGION (default eu-north-1)
# Prints local dump path on stdout (last line).
set -euo pipefail

INSTANCE_ID="${EC2_INSTANCE_ID:-}"
S3_BUCKET="${S3_BUCKET:-}"
AWS_REGION="${AWS_REGION:-eu-north-1}"
S3_KEY="_sync/catalog-latest.sql"
OUT_FILE="${1:-/tmp/wineknot-catalog-latest.sql}"

if [ -z "$INSTANCE_ID" ] || [ -z "$S3_BUCKET" ]; then
  echo "Set EC2_INSTANCE_ID and S3_BUCKET" >&2
  exit 1
fi

REMOTE=$(cat <<'SCRIPT'
bash -lc 'set -euo pipefail
cd /opt/wine-knot
ROOT_PASS=$(grep ^MYSQL_ROOT_PASSWORD= .env | cut -d= -f2-)
BUCKET=$(grep ^S3_BUCKET= .env | cut -d= -f2-)
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  exec -T mysql mysqldump -u root -p"$ROOT_PASS" \
  --no-tablespaces --single-transaction \
  wineknot categories wines recommended_wines \
  | aws s3 cp - "s3://${BUCKET}/_sync/catalog-latest.sql"
echo "Uploaded catalog dump to S3"'
SCRIPT
)

COMMAND_ID=$(aws ssm send-command \
  --region "$AWS_REGION" \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --comment "Wine Knot catalog dump for repo sync" \
  --parameters "$(jq -n --arg cmd "$REMOTE" '{commands: [$cmd]}')" \
  --query "Command.CommandId" \
  --output text)

echo "SSM dump command: $COMMAND_ID" >&2

for _ in $(seq 1 60); do
  STATUS=$(aws ssm get-command-invocation \
    --region "$AWS_REGION" \
    --command-id "$COMMAND_ID" \
    --instance-id "$INSTANCE_ID" \
    --query "Status" \
    --output text 2>/dev/null || echo "Pending")

  case "$STATUS" in
    Success)
      aws ssm get-command-invocation \
        --region "$AWS_REGION" \
        --command-id "$COMMAND_ID" \
        --instance-id "$INSTANCE_ID" \
        --query "StandardOutputContent" \
        --output text >&2
      break
      ;;
    Failed|Cancelled|TimedOut)
      aws ssm get-command-invocation \
        --region "$AWS_REGION" \
        --command-id "$COMMAND_ID" \
        --instance-id "$INSTANCE_ID" >&2
      exit 1
      ;;
    *)
      sleep 10
      ;;
  esac
done

if [ "$STATUS" != "Success" ]; then
  echo "SSM dump timed out" >&2
  exit 1
fi

aws s3 cp "s3://$S3_BUCKET/$S3_KEY" "$OUT_FILE" --region "$AWS_REGION" --only-show-errors >&2
echo "$OUT_FILE"
