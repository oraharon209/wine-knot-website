#!/bin/bash
set -euo pipefail

# Install Docker and Docker Compose plugin on Amazon Linux 2023
dnf update -y
dnf install -y docker git
systemctl enable docker
systemctl start docker
usermod -aG docker ec2-user

mkdir -p /usr/local/lib/docker/cli-plugins
curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

mkdir -p /opt/${project_name}
chown ec2-user:ec2-user /opt/${project_name}

cat > /opt/${project_name}/DEPLOY.md <<'EOF'
# Deploy Wine Knot on this server

1. SSH in as ec2-user
2. Clone the repo:
     git clone https://github.com/YOUR_USER/wine-knot.git /opt/wine-knot
3. Copy and edit environment:
     cp .env.example .env
     # Set strong passwords, HTTP_PORT=${http_port}, Cloudflare vars if needed
4. Start the stack:
     docker compose up -d --build
     # Production with Cloudflare DDNS:
     docker compose --profile production up -d
5. Open http://<this-server-ip>:${http_port}
EOF
