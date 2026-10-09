#!/usr/bin/env bash
# Runs ON the EC2 instance, invoked remotely by GitHub Actions via
# `aws ssm send-command` (see .github/actions/ssm-redeploy) — never over SSH.
#
#   redeploy.sh <production|staging> <image-tag>      e.g. redeploy.sh staging sha-65234f6a1b2c
#
# Both environments live on this one box as separate compose projects
# (docker-compose.prod.yml / docker-compose.staging.yml). This pulls the
# given image tag for the chosen environment and recreates only the
# containers whose image actually changed; db/redis are untouched unless
# their own images changed. The compose files, the Caddyfile, and this
# script itself are unpacked into /binxportal by the same SSM command just
# before this runs, so the box always matches the commit being deployed.
#
# SAFETY: this must never become `down -v` / `down` — see the warning at the
# top of docker-compose.prod.yml. `up -d` after a `pull` is the whole deploy.
set -euo pipefail
cd /binxportal

TARGET="${1:?usage: redeploy.sh <production|staging> <image-tag>}"
TAG="${2:?usage: redeploy.sh <production|staging> <image-tag>}"

AWS_REGION=us-east-2
ECR_REGISTRY="574247905173.dkr.ecr.${AWS_REGION}.amazonaws.com"
EDGE_NETWORK=binxportal-edge
PROD_COMPOSE=(docker compose -f docker-compose.prod.yml)

case "$TARGET" in
  production)
    SECRET_ID=binxportal/app
    ENV_FILE=.env
    WEB_TAG="$TAG"
    COMPOSE=("${PROD_COMPOSE[@]}")
    APP_SERVICES=(api web)
    ;;
  staging)
    SECRET_ID=binxportal/staging
    ENV_FILE=.env.staging
    # binx-web is built once per environment (NEXT_PUBLIC_* are baked in at
    # build time) — the staging build is the same commit under this prefix.
    WEB_TAG="staging-$TAG"
    COMPOSE=(docker compose --env-file .env.staging -f docker-compose.staging.yml)
    APP_SERVICES=(staging-api staging-web)

    # Production fits in 2GB on its own; a second stack does not. Refuse
    # rather than let staging push the box into swap/OOM under production.
    mem_kb=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)
    if [ "$mem_kb" -lt 3500000 ]; then
      echo "ERROR: staging needs a 4GB instance (t4g.medium); this box has $((mem_kb / 1024))MB. Resize it first." >&2
      exit 1
    fi
    ;;
  *)
    echo "ERROR: unknown environment '$TARGET' (expected production or staging)" >&2
    exit 2
    ;;
esac

# The env file is regenerated on every deploy, not hand-placed — the real
# secrets live in Secrets Manager (see infra/lib/secrets-stack.ts and
# infra/lib/staging-stack.ts), fetched here via the instance's own IAM role.
# API_IMAGE/WEB_IMAGE aren't secrets, so they're just computed below rather
# than stored anywhere. Nothing is sourced into this shell: compose reads the
# file itself, and keeping one environment's values out of the process env
# means they can't leak into a compose command for the other.
secret_json=$(aws secretsmanager get-secret-value --secret-id "$SECRET_ID" --region "$AWS_REGION" \
  --query SecretString --output text)

for key in POSTGRES_PASSWORD JWT_SECRET; do
  value=$(jq -r --arg k "$key" '.[$k] // empty' <<<"$secret_json")
  if [ -z "$value" ] || [ "$value" = "REPLACE_ME" ]; then
    echo "ERROR: $key is not set in the $SECRET_ID secret (still the CDK placeholder?)" >&2
    exit 1
  fi
done

umask 077
{
  jq -r 'to_entries[] | "\(.key)=\(.value)"' <<<"$secret_json"
  echo "API_IMAGE=${ECR_REGISTRY}/binx-api:${TAG}"
  echo "WEB_IMAGE=${ECR_REGISTRY}/binx-web:${WEB_TAG}"
} > "$ENV_FILE"

aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin "$ECR_REGISTRY"

# Shared by production's Caddy and the staging app containers. Owned by this
# script rather than either compose project (both declare it `external`).
docker network inspect "$EDGE_NETWORK" >/dev/null 2>&1 || docker network create "$EDGE_NETWORK"

# A pull can land mid-layer with "no space left on device" if the previous
# deploy's now-superseded images are still sitting around. Pruning before the
# pull, not just after, is what actually guarantees room; images still
# backing a running container (either environment's) are never touched by
# `prune`, so this can't take down what's currently live.
echo "==> Pruning unused images before pulling, to guarantee room for the new layers"
docker image prune -af

echo "==> Deploying $TARGET at $TAG"
"${COMPOSE[@]}" pull "${APP_SERVICES[@]}"
"${COMPOSE[@]}" up -d --remove-orphans

# Caddy belongs to the production project but fronts both environments, so a
# staging deploy refreshes it too. --no-deps: only Caddy — a staging deploy
# must never recreate production's api/web as a side effect.
"${PROD_COMPOSE[@]}" up -d --no-deps caddy

if [ "$TARGET" = "staging" ]; then
  # Basic auth for staging.binxportal.com, generated from the secret so no
  # password hash is committed. Caddy does the bcrypt hashing itself.
  auth_user=$(jq -r '.STAGING_BASIC_AUTH_USER // empty' <<<"$secret_json")
  auth_password=$(jq -r '.STAGING_BASIC_AUTH_PASSWORD // empty' <<<"$secret_json")
  if [ -n "$auth_user" ] && [ -n "$auth_password" ]; then
    auth_hash=$("${PROD_COMPOSE[@]}" exec -T caddy caddy hash-password --plaintext "$auth_password")
    printf 'basic_auth {\n\t%s %s\n}\n' "$auth_user" "$auth_hash" > deploy/staging-auth.caddy
  else
    echo "WARNING: STAGING_BASIC_AUTH_USER/PASSWORD not set in $SECRET_ID — staging is publicly reachable (still noindex)"
    rm -f deploy/staging-auth.caddy
  fi
fi

# Validate before reloading: a reload that fails leaves the running config
# in place, but say so loudly rather than let a broken Caddyfile sit on disk
# waiting for the next container restart.
echo "==> Reloading Caddy"
"${PROD_COMPOSE[@]}" exec -T caddy caddy validate --config /etc/caddy/Caddyfile
for attempt in 1 2 3 4 5; do
  # Retried because a just-recreated Caddy's admin API takes a moment to listen.
  if "${PROD_COMPOSE[@]}" exec -T caddy caddy reload --config /etc/caddy/Caddyfile; then
    break
  fi
  [ "$attempt" -eq 5 ] && { echo "ERROR: caddy reload failed" >&2; exit 1; }
  sleep 2
done

echo "==> Pruning the now-superseded previous version's images"
docker image prune -af

echo "==> Current state"
"${PROD_COMPOSE[@]}" ps
if [ -f .env.staging ]; then
  docker compose --env-file .env.staging -f docker-compose.staging.yml ps
fi
