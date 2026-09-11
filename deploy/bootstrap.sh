#!/usr/bin/env bash
# One-time setup for the EC2 instance (Ubuntu 26.04). Run once by hand over
# SSH the first time; after that, deploy/redeploy.sh (triggered via SSM from
# CI) is the only thing that touches the box.
set -euo pipefail

echo "==> Installing Docker Engine + Compose plugin"
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "==> Letting the current user run docker without sudo"
sudo usermod -aG docker "$USER"

echo "==> Installing the AWS CLI (for 'aws ecr get-login-password')"
if ! command -v aws >/dev/null 2>&1; then
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
  (cd /tmp && unzip -q awscliv2.zip && sudo ./aws/install)
  rm -rf /tmp/awscliv2.zip /tmp/aws
fi

echo "==> Setting up /opt/binxportal"
sudo mkdir -p /opt/binxportal/deploy
sudo chown -R "$USER":"$USER" /opt/binxportal

cat <<'MSG'

==> Bootstrap done. Next steps (one-time, by hand):

1. Copy docker-compose.prod.yml, deploy/Caddyfile, and deploy/redeploy.sh
   from the repo into /opt/binxportal (matching layout: Caddyfile under
   /opt/binxportal/deploy/).
2. Copy .env.prod.example to /opt/binxportal/.env and fill in real values
   (POSTGRES_PASSWORD, JWT_SECRET, ANTHROPIC_API_KEY, the two ECR image
   URIs — see infra CDK output for the exact repo URIs).
3. Log out and back in (or `newgrp docker`) so the docker group membership
   takes effect.
4. `cd /opt/binxportal && aws ecr get-login-password --region us-east-2 | \
     docker login --username AWS --password-stdin <account>.dkr.ecr.us-east-2.amazonaws.com`
5. `docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d`

From then on, every push to master runs deploy/redeploy.sh on this box via
SSM automatically — see .github/workflows/deploy.yml.
MSG
