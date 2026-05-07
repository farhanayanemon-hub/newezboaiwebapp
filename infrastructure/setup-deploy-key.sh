#!/usr/bin/env bash
#
# EzboAI — Setup GitHub Actions deploy key on VPS
# Run ONCE on the VPS as the 'ezbo' user (not root).
#
# Usage:
#   ssh -p 2222 ezbo@YOUR_VPS_IP
#   bash <(curl -fsSL https://raw.githubusercontent.com/YOUR_USER/ezboai/main/infrastructure/setup-deploy-key.sh)
#
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
step() { echo -e "\n${BLUE}━━━ $1 ━━━${NC}"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }

if [[ "$(whoami)" == "root" ]]; then
  warn "Eta 'ezbo' user diye chalate hobe, root noy. Try: su - ezbo"
  exit 1
fi

KEY_PATH="$HOME/.ssh/github_deploy"
PUB_KEY_PATH="${KEY_PATH}.pub"

step "1/4 SSH Key Generate (if not exists)"
if [ -f "$KEY_PATH" ]; then
  warn "Key already exists at ${KEY_PATH}, skipping generation"
else
  mkdir -p "$HOME/.ssh"
  chmod 700 "$HOME/.ssh"
  ssh-keygen -t ed25519 -f "$KEY_PATH" -N "" -C "github-actions@ezboai"
  log "SSH key generated"
fi

step "2/4 Authorize Key for Login"
touch "$HOME/.ssh/authorized_keys"
chmod 600 "$HOME/.ssh/authorized_keys"
if grep -qF "$(cat ${PUB_KEY_PATH})" "$HOME/.ssh/authorized_keys"; then
  warn "Key already in authorized_keys"
else
  cat "$PUB_KEY_PATH" >> "$HOME/.ssh/authorized_keys"
  log "Public key added to authorized_keys"
fi

step "3/4 Sudo NOPASSWD for deploy script"
SUDOERS_FILE="/etc/sudoers.d/ezbo-deploy"
if sudo test -f "$SUDOERS_FILE"; then
  warn "Sudoers entry already exists"
else
  echo "ezbo ALL=(ALL) NOPASSWD: /usr/bin/systemctl reload nginx, /usr/bin/systemctl restart nginx" | sudo tee "$SUDOERS_FILE" >/dev/null
  sudo chmod 440 "$SUDOERS_FILE"
  log "Sudoers configured for nginx reload"
fi

step "4/4 Print Secrets for GitHub"
PUBLIC_IP=$(curl -s ifconfig.me)
SSH_PORT=$(grep "^Port " /etc/ssh/sshd_config | awk '{print $2}' || echo "2222")

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  GitHub Repository Secrets — Add these to GitHub         ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "GitHub repo → Settings → Secrets and variables → Actions → 'New repository secret'"
echo ""
echo -e "${YELLOW}Secret 1: VPS_HOST${NC}"
echo "  Value: ${PUBLIC_IP}"
echo ""
echo -e "${YELLOW}Secret 2: VPS_USER${NC}"
echo "  Value: ezbo"
echo ""
echo -e "${YELLOW}Secret 3: VPS_SSH_PORT${NC}"
echo "  Value: ${SSH_PORT}"
echo ""
echo -e "${YELLOW}Secret 4: DEPLOY_HEALTH_URL${NC}"
echo "  Value: ezboai.com/api/healthz"
echo ""
echo -e "${YELLOW}Secret 5: VPS_SSH_KEY${NC}"
echo "  Value (PRIVATE key — copy EVERYTHING below including BEGIN/END lines):"
echo ""
echo "─────────── COPY FROM HERE ───────────"
cat "$KEY_PATH"
echo "─────────── COPY UP TO HERE ───────────"
echo ""
echo -e "${GREEN}After adding all 5 secrets, push code to GitHub main branch — auto-deploy will trigger!${NC}"
echo ""
