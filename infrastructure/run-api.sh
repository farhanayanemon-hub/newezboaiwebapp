#!/usr/bin/env bash
# EzboAI API server launcher (called by PM2).
# Sources .env.production so DATABASE_URL, APP_ENCRYPTION_KEY, SESSION_SECRET,
# and any other secrets are present in the process environment before node boots.
set -e
cd /var/www/ezboai
if [ -f ./.env.production ]; then
  set -a
  # shellcheck disable=SC1091
  source ./.env.production
  set +a
fi
export NODE_ENV="${NODE_ENV:-production}"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/var/www/ezboai/.playwright}"
exec node ./artifacts/api-server/dist/index.mjs
