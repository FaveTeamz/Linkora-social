#!/usr/bin/env bash
# deploy_staging.sh — Deploy Linkora microservices to a staging environment.
#
# This script deploys the notification, search, and media services using the
# docker-compose staging override on a remote host (or locally when
# STAGING_HOST is set to "localhost").
#
# Required environment variables:
#   STAGING_HOST        - SSH-reachable hostname or IP of the staging server
#                         (use "localhost" to deploy to the current machine)
#   STAGING_USER        - SSH user on the staging host (default: ubuntu)
#   STAGING_DEPLOY_DIR  - Absolute path to the project root on the staging
#                         host (default: /opt/linkora)
#
# Optional environment variables:
#   STAGING_SERVICES    - Space-separated list of services to (re)deploy.
#                         Defaults to all new microservices:
#                         "notification search media"
#   COMPOSE_PROJECT     - Docker Compose project name (default: linkora-staging)
#   SKIP_BUILD          - Set to "true" to skip docker compose build
#   DRY_RUN             - Set to "true" to print commands without running them
#
# Usage:
#   STAGING_HOST=staging.example.com ./scripts/deploy_staging.sh
#   DRY_RUN=true STAGING_HOST=staging.example.com ./scripts/deploy_staging.sh

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────

STAGING_HOST="${STAGING_HOST:-}"
STAGING_USER="${STAGING_USER:-ubuntu}"
STAGING_DEPLOY_DIR="${STAGING_DEPLOY_DIR:-/opt/linkora}"
STAGING_SERVICES="${STAGING_SERVICES:-notification search media}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-linkora-staging}"
SKIP_BUILD="${SKIP_BUILD:-false}"
DRY_RUN="${DRY_RUN:-false}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ── Helpers ───────────────────────────────────────────────────────────────────

log()  { echo "[deploy_staging] $*"; }
warn() { echo "[deploy_staging] WARNING: $*" >&2; }
err()  { echo "[deploy_staging] ERROR: $*" >&2; exit 1; }

run() {
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "  [dry-run] $*"
  else
    "$@"
  fi
}

# Run a command on the staging host (or locally when host is "localhost").
remote() {
  if [[ "$STAGING_HOST" == "localhost" ]]; then
    run bash -c "$*"
  else
    run ssh "${STAGING_USER}@${STAGING_HOST}" "$*"
  fi
}

# ── Validate inputs ────────────────────────────────────────────────────────────

[[ -z "$STAGING_HOST" ]] && err "STAGING_HOST is required."

log "Staging host : $STAGING_HOST"
log "Deploy dir   : $STAGING_DEPLOY_DIR"
log "Services     : $STAGING_SERVICES"
log "Project      : $COMPOSE_PROJECT"
[[ "$DRY_RUN" == "true" ]] && log "(DRY RUN — no commands will be executed)"

# ── Check local tooling ────────────────────────────────────────────────────────

if ! command -v docker &>/dev/null; then
  warn "docker is not installed locally — remote deploy only."
fi

# ── Step 1: Sync repository to staging host ───────────────────────────────────

log "[1/4] Syncing repository to $STAGING_HOST:$STAGING_DEPLOY_DIR ..."

if [[ "$STAGING_HOST" == "localhost" ]]; then
  log "  Local deploy — skipping rsync."
else
  run rsync -az --delete \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='dist' \
    --exclude='target' \
    --exclude='*.env' \
    --exclude='.env*' \
    "${ROOT_DIR}/" \
    "${STAGING_USER}@${STAGING_HOST}:${STAGING_DEPLOY_DIR}/"
fi

# ── Step 2: Build service images ──────────────────────────────────────────────

log "[2/4] Building service images ..."

COMPOSE_CMD="docker compose \
  -p ${COMPOSE_PROJECT} \
  -f ${STAGING_DEPLOY_DIR}/docker-compose.yml \
  -f ${STAGING_DEPLOY_DIR}/docker-compose.staging.yml"

if [[ "$SKIP_BUILD" != "true" ]]; then
  remote "${COMPOSE_CMD} build --no-cache ${STAGING_SERVICES}"
else
  log "  SKIP_BUILD=true — skipping image build."
fi

# ── Step 3: Deploy / recreate containers ─────────────────────────────────────

log "[3/4] Deploying services: $STAGING_SERVICES ..."

remote "${COMPOSE_CMD} up -d --remove-orphans ${STAGING_SERVICES}"

# ── Step 4: Health check ─────────────────────────────────────────────────────

log "[4/4] Waiting for services to become healthy ..."

# Give containers up to 60 s to pass their health checks.
HEALTH_TIMEOUT=60
HEALTH_INTERVAL=5

for service in $STAGING_SERVICES; do
  elapsed=0
  log "  Checking $service ..."
  while true; do
    status=$(remote "docker inspect --format='{{.State.Health.Status}}' \
      \$(docker compose -p ${COMPOSE_PROJECT} ps -q ${service} 2>/dev/null) 2>/dev/null || echo unknown" 2>/dev/null || echo "unknown")

    if [[ "$status" == *"healthy"* ]]; then
      log "  ✓ $service is healthy."
      break
    fi

    if [[ "$elapsed" -ge "$HEALTH_TIMEOUT" ]]; then
      warn "$service did not become healthy within ${HEALTH_TIMEOUT}s (status: $status)."
      break
    fi

    sleep "$HEALTH_INTERVAL"
    elapsed=$((elapsed + HEALTH_INTERVAL))
  done
done

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║            Staging Deployment Summary                       ║"
echo "╠══════════════════════════════════════════════════════════════╣"
printf  "║  %-20s %-38s ║\n" "host:"        "$STAGING_HOST"
printf  "║  %-20s %-38s ║\n" "deploy_dir:"  "$STAGING_DEPLOY_DIR"
printf  "║  %-20s %-38s ║\n" "project:"     "$COMPOSE_PROJECT"
printf  "║  %-20s %-38s ║\n" "services:"    "$STAGING_SERVICES"
[[ "$DRY_RUN" == "true" ]] && \
printf  "║  %-20s %-38s ║\n" "mode:"        "DRY RUN"
echo "╚══════════════════════════════════════════════════════════════╝"
