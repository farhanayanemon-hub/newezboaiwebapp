#!/usr/bin/env bash
#
# EzboAI Deploy Script
# Run as: sudo -u ezbo bash infrastructure/deploy.sh
#
set -euo pipefail

APP_DIR="/var/www/ezboai"
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; }

cd "$APP_DIR"

log "1/6 Git pull"
git fetch --all
git reset --hard origin/main
git pull

log "2/7 pnpm install"
pnpm install --frozen-lockfile --prod=false

log "3/7 Playwright Chromium"
# Install/update Chromium binaries for the api-server's browser automation.
# System-level libs (glib/nss/nspr/atk/cups/dbus/libgbm/etc) are already
# installed by vps-setup.sh, so we don't need --with-deps here.
pnpm --filter @workspace/api-server exec playwright install chromium || \
  warn "playwright install chromium failed — Web Task will return 500 until fixed"

log "4/7 Build api-server"
pnpm --filter @workspace/api-server run build

log "5/7 Build web-app"
pnpm --filter @workspace/web-app run build

log "6/7 Database migrate"
if [ -f .env.production ]; then
  set -a
  source .env.production
  set +a
  pnpm --filter @workspace/db run push || warn "DB push failed — may need manual review"
else
  err ".env.production missing!"
  exit 1
fi

log "7/7 PM2 reload"
if pm2 list | grep -q ezboai-api; then
  pm2 reload infrastructure/ecosystem.config.cjs --env production
else
  pm2 start infrastructure/ecosystem.config.cjs --env production
  pm2 save
fi

log "Deploy complete!"
echo ""
pm2 status
