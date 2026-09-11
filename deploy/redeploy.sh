#!/usr/bin/env bash
# Runs ON the EC2 instance, invoked remotely by GitHub Actions via
# `aws ssm send-command` (see .github/workflows/deploy.yml) — never over
# SSH. Pulls the freshly-pushed :latest images and recreates only the
# containers whose image actually changed; db/redis/caddy are untouched
# unless their own images changed.
#
# SAFETY: this must never become `down -v` / `down` — see the warning at the
# top of docker-compose.prod.yml. `up -d` after a `pull` is the whole deploy.
set -euo pipefail
cd /opt/binxportal

AWS_REGION=us-east-2
ECR_REGISTRY="574247905173.dkr.ecr.${AWS_REGION}.amazonaws.com"

# .env is regenerated on every deploy, not hand-placed — the real secrets
# (POSTGRES_PASSWORD, JWT_SECRET, ANTHROPIC_API_KEY) live in Secrets
# Manager (binxportal/app; see infra/lib/secrets-stack.ts), fetched here via
# the instance's own IAM role. API_IMAGE/WEB_IMAGE aren't secrets, so they're
# just computed below rather than stored anywhere.
umask 077
aws secretsmanager get-secret-value --secret-id binxportal/app --region "$AWS_REGION" \
  --query SecretString --output text \
  | jq -r 'to_entries[] | "\(.key)=\(.value)"' > .env
{
  echo "API_IMAGE=${ECR_REGISTRY}/binx-api:latest"
  echo "WEB_IMAGE=${ECR_REGISTRY}/binx-web:latest"
} >> .env

set -a
# shellcheck source=/dev/null
source .env
set +a

aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin "$ECR_REGISTRY"

docker compose -f docker-compose.prod.yml pull api web
docker compose -f docker-compose.prod.yml up -d --remove-orphans

echo "==> Pruning old, now-unused images (keeps the last few layers Docker's still using)"
docker image prune -af --filter "until=72h"

echo "==> Current state"
docker compose -f docker-compose.prod.yml ps
