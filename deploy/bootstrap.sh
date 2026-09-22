#!/usr/bin/env bash
# One-time setup for the EC2 instance (Ubuntu 26.04). Run once by hand over
# SSH the first time; after that, deploy/redeploy.sh (triggered via SSM from
# CI) is the only thing that touches the box.
set -euo pipefail

echo "==> Installing Docker Engine + Compose plugin"
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl jq unzip
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
  # x86_64 or aarch64 (Graviton) — the installer is arch-specific.
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o /tmp/awscliv2.zip
  (cd /tmp && unzip -q awscliv2.zip && sudo ./aws/install)
  rm -rf /tmp/awscliv2.zip /tmp/aws
fi

echo "==> Setting up /binxportal"
sudo mkdir -p /binxportal/deploy
sudo chown -R "$USER":"$USER" /binxportal

cat <<'MSG'

==> Bootstrap done. Next steps (one-time, by hand):

1. Copy docker-compose.prod.yml, deploy/Caddyfile, and deploy/redeploy.sh
   from the repo into /opt/binxportal (matching layout: Caddyfile under
   /opt/binxportal/deploy/).
2. Log out and back in (or `newgrp docker`) so the docker group membership
   takes effect.
3. `bash /binxportal/deploy/redeploy.sh` — that's the whole first
   deploy. No `.env` to hand-place: it fetches POSTGRES_PASSWORD,
   JWT_SECRET, and ANTHROPIC_API_KEY from Secrets Manager
   (`binxportal/app` — see infra/lib/secrets-stack.ts) and regenerates
   `.env` itself, every time, using the instance's own IAM role. That
   secret has to already exist with real values before this step — see
   DEVELOPER.md's "Environment variables" section for how to set/update
   it (`aws secretsmanager put-secret-value`, never by hand-editing a
   file on the box).

From then on, every push to master runs deploy/redeploy.sh on this box via
SSM automatically — see .github/workflows/deploy.yml.
MSG
