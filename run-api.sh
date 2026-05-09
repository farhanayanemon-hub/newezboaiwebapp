#!/usr/bin/env bash
set -e
cd /var/www/ezboai
set -a
source ./.env.production
set +a
export NODE_ENV=production
export PLAYWRIGHT_BROWSERS_PATH=/var/www/ezboai/.playwright
exec node ./artifacts/api-server/dist/index.mjs
