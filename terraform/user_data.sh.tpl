#!/bin/bash
set -euo pipefail
exec > /var/log/wine-knot-bootstrap.log 2>&1

PROJECT="${project_name}"
REGION="${aws_region}"
APP_DIR="/opt/$PROJECT"
SSM_PREFIX="/$PROJECT"

log() { echo "[$(date -Is)] $*"; }

# --- Swap (helps on 1 GB instances) ---
if [ ! -f /swapfile ]; then
  log "Creating ${swap_size_gb}G swap"
  fallocate -l ${swap_size_gb}G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# --- AWS CLI v2 for SSM secrets ---
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq curl git unzip ca-certificates
curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
unzip -q /tmp/awscliv2.zip -d /tmp
/tmp/aws/install
rm -rf /tmp/aws /tmp/awscliv2.zip

ssm_get() {
  aws ssm get-parameter \
    --region "$REGION" \
    --name "$1" \
    --with-decryption \
    --query 'Parameter.Value' \
    --output text
}

log "Waiting for IAM role / SSM access..."
for i in $(seq 1 30); do
  if ssm_get "$SSM_PREFIX/admin_password" >/dev/null 2>&1; then
    break
  fi
  sleep 10
done

ADMIN_PASS=$(ssm_get "$SSM_PREFIX/admin_password")
DB_PASS=$(ssm_get "$SSM_PREFIX/db_password")
ROOT_PASS=$(ssm_get "$SSM_PREFIX/mysql_root_password")
CF_TOKEN=$(ssm_get "$SSM_PREFIX/cloudflare_api_token")

# --- Docker ---
if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable docker
  systemctl start docker
  usermod -aG docker ubuntu
fi

# --- App ---
mkdir -p "$APP_DIR"
chown ubuntu:ubuntu "$APP_DIR"
cd "$APP_DIR"

if [ ! -d .git ]; then
  log "Cloning ${git_repo_url}"
  sudo -u ubuntu git clone "${git_repo_url}" .
fi

cat > .env <<EOF
MYSQL_ROOT_PASSWORD=$ROOT_PASS
DB_USER=wineknot
DB_PASSWORD=$DB_PASS
DB_NAME=wineknot
HTTP_PORT=${http_port}
ADMIN_PASSWORD=$ADMIN_PASS
CLOUDFLARE_API_TOKEN=$CF_TOKEN
CLOUDFLARE_ZONE=${cloudflare_zone}
CLOUDFLARE_SUBDOMAIN=${cloudflare_subdomain}
CLOUDFLARE_PROXIED=${cloudflare_proxied}
IMAGE_STORAGE=s3
S3_BUCKET=${s3_bucket}
AWS_REGION=$REGION
S3_PUBLIC_BASE_URL=${s3_public_base_url}
CONTACT_PHONE=050-0000000
CONTACT_WHATSAPP=972500000000
CONTACT_EMAIL=info@wineknot.co.il
EOF
chmod 600 .env
chown ubuntu:ubuntu .env

if [ -d "$APP_DIR/frontend/public/images/wines" ]; then
  log "Syncing bundled wine images to S3"
  aws s3 sync "$APP_DIR/frontend/public/images/wines/" "s3://${s3_bucket}/wines/" || true
fi

# Re-fetch secrets script (for rotation without reprovisioning)
cat > /usr/local/bin/wine-knot-refresh-secrets <<SCRIPT
#!/bin/bash
set -euo pipefail
REGION="${aws_region}"
PROJECT="${project_name}"
APP_DIR="/opt/\$PROJECT"
SSM_PREFIX="/\$PROJECT"
ssm_get() {
  aws ssm get-parameter --region "\$REGION" --name "\$1" --with-decryption --query 'Parameter.Value' --output text
}
cd "\$APP_DIR"
ADMIN_PASS=\$(ssm_get "\$SSM_PREFIX/admin_password")
DB_PASS=\$(ssm_get "\$SSM_PREFIX/db_password")
ROOT_PASS=\$(ssm_get "\$SSM_PREFIX/mysql_root_password")
CF_TOKEN=\$(ssm_get "\$SSM_PREFIX/cloudflare_api_token")
cat > .env <<EOF
MYSQL_ROOT_PASSWORD=\$ROOT_PASS
DB_USER=wineknot
DB_PASSWORD=\$DB_PASS
DB_NAME=wineknot
HTTP_PORT=${http_port}
ADMIN_PASSWORD=\$ADMIN_PASS
CLOUDFLARE_API_TOKEN=\$CF_TOKEN
CLOUDFLARE_ZONE=${cloudflare_zone}
CLOUDFLARE_SUBDOMAIN=${cloudflare_subdomain}
CLOUDFLARE_PROXIED=${cloudflare_proxied}
IMAGE_STORAGE=s3
S3_BUCKET=${s3_bucket}
AWS_REGION=$REGION
S3_PUBLIC_BASE_URL=${s3_public_base_url}
CONTACT_PHONE=050-0000000
CONTACT_WHATSAPP=972500000000
CONTACT_EMAIL=info@wineknot.co.il
EOF
chmod 600 .env
chown ubuntu:ubuntu .env
docker compose --profile production up -d
SCRIPT
chmod 755 /usr/local/bin/wine-knot-refresh-secrets

log "Starting Docker Compose"
docker compose --profile production up -d --build

log "Bootstrap complete"
