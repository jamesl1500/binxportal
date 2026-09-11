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

# .env holds API_IMAGE/WEB_IMAGE (both point at the same ECR registry) plus
# the secrets docker-compose.prod.yml's own variable substitution needs —
# `docker compose` loads it automatically for that, but this script's own
# shell (for the `docker login` below) needs it loaded explicitly too.
set -a
# shellcheck source=/dev/null
source .env
set +a

aws ecr get-login-password --region us-east-2 | \
  docker login --username AWS --password-stdin "$(cut -d/ -f1 <<< "${API_IMAGE:?set in .env}")"

docker compose -f docker-compose.prod.yml pull api web
docker compose -f docker-compose.prod.yml up -d --remove-orphans

echo "==> Pruning old, now-unused images (keeps the last few layers Docker's still using)"
docker image prune -af --filter "until=72h"

echo "==> Current state"
docker compose -f docker-compose.prod.yml ps
