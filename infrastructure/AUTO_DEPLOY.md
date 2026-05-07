# EzboAI — GitHub Auto-Deploy Guide (Bangla)

Goal: `git push origin main` korlei VPS e auto deploy hobe (30-60 sec).

---

## 🎯 How It Works

```
Replit/laptop e code change
      ↓ git push origin main
GitHub repo updated
      ↓ webhook trigger
GitHub Actions runs (free for public repos, 2000 min/mo for private)
      ↓ SSH into VPS using deploy key
VPS: git pull → pnpm install → build → PM2 reload
      ↓
Live ezboai.com updated
```

---

## 📋 Prerequisites

✅ Hostinger VPS already setup (`vps-setup.sh` run kora hoyeche)
✅ GitHub repo created (private OK, public OK)
✅ Code initial push GitHub e kora hoyeche
✅ Domain DNS configured (ezboai.com → VPS IP)

---

## 🔧 Step 1: VPS e Deploy Key Setup

VPS e `ezbo` user diye SSH login korun:

```bash
ssh -p 2222 ezbo@147.93.108.171
```

Tarpor ei command run korun:

```bash
# Repository theke setup script chalan
cd /var/www/ezboai
bash infrastructure/setup-deploy-key.sh
```

Script ja korbe:
- ✅ SSH key generate (`~/.ssh/github_deploy`)
- ✅ Public key authorize (GitHub Actions login korte parbe)
- ✅ Sudo NOPASSWD configure (deploy.sh nginx reload korte parbe)
- ✅ **5 ta secret** print korbe — eta GitHub e add korte hobe

---

## 🔐 Step 2: GitHub Secrets Add

GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

5 ta secret add korben:

| Secret Name | Value |
|-------------|-------|
| `VPS_HOST` | Apnar VPS IP (e.g., `147.93.108.171`) |
| `VPS_USER` | `ezbo` |
| `VPS_SSH_PORT` | `2222` |
| `DEPLOY_HEALTH_URL` | `ezboai.com/api/healthz` |
| `VPS_SSH_KEY` | **Private key** (script er output theke copy korben — `-----BEGIN OPENSSH PRIVATE KEY-----` theke `-----END OPENSSH PRIVATE KEY-----` porjonto sob) |

⚠️ **`VPS_SSH_KEY` private key — kothao share korben na, GitHub secret e thakle safe.**

---

## 🚀 Step 3: First Deploy Trigger

Apnar laptop ba Replit theke ekta small change kore push korun:

```bash
git add .
git commit -m "test auto-deploy"
git push origin main
```

GitHub repo → **Actions** tab → "Deploy to Hostinger VPS" workflow run dekhben.

3-5 minute lagbe (first time installation slow):
- ✓ Checkout
- ✓ Setup SSH
- ✓ Add VPS to known_hosts
- ✓ Deploy via SSH (git pull → build → pm2 reload)
- ✓ Verify deployment

✅ Browser e **https://ezboai.com** refresh korle update dekhben!

---

## 🔄 Daily Workflow

```bash
# Replit/laptop e:
# 1. Code change korun (Replit Agent diye ba nije)
# 2. Commit + push:
git add .
git commit -m "feature: add voice input"
git push origin main

# 3. Wait 1-2 min — GitHub Actions auto-deploy korbe
# 4. ezboai.com refresh — live update dekhben
```

**Apni VPS e SSH login korar dorkar nai daily workflow e!**

---

## 🐛 Troubleshooting

### Deploy fail hocche?

GitHub repo → **Actions** → failed run e click → log dekhun.

**Common issues:**

#### "Permission denied (publickey)"
- Private key in `VPS_SSH_KEY` secret theek nai
- `setup-deploy-key.sh` script abar run korun, full key copy korun (BEGIN/END lines shoho)

#### "Host key verification failed"
- VPS IP change hoyeche
- `VPS_HOST` secret update korun

#### "deploy.sh: command not found"
- VPS-er `/var/www/ezboai/infrastructure/deploy.sh` exist nai
- VPS e SSH login → `cd /var/www/ezboai && git pull`

#### "Build failed: Out of memory"
- VPS RAM kom (KVM 1 hole)
- Swap add korun:
  ```bash
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  ```

#### "PM2 process not found"
- First time deploy hole PM2 process exist na
- VPS e SSH login → `cd /var/www/ezboai && pm2 start infrastructure/ecosystem.config.cjs && pm2 save`

---

## 🔒 Security Best Practices

✅ Deploy key VPS-specific (other server e use korben na)
✅ GitHub secrets encrypted at rest
✅ SSH key passwordless (eta GitHub Actions er jonno OK, karon GitHub secret e securely stored)
✅ Sudo NOPASSWD shudhu nginx reload e (full sudo na)
✅ Branch protection enable korun:
  - GitHub repo → Settings → Branches → Add rule for `main`
  - "Require pull request reviews" check korun (production safety)

---

## 🎁 Bonus: Manual Deploy Trigger

GitHub UI theke manual trigger korte parben:

GitHub repo → **Actions** → "Deploy to Hostinger VPS" → **Run workflow** button → **Run**

Eta useful jokhon:
- Code change korenni kintu manually deploy korte chan (e.g., env var update korar por)
- Failed deploy retry korte chan

---

## 📊 Cost

GitHub Actions:
- **Public repo:** Free, unlimited
- **Private repo:** 2,000 minutes/month free (eta 100+ deploys er jonno enough)

Total monthly cost: $0 extra (apnar Hostinger VPS-er bahire kichui dite hobe na)

---

## ❓ FAQ

**Q: Replit e code likhle GitHub e kivabe push korbo?**
A: Replit panel e "Tools" → "Git" → connect GitHub account → push button. Or manual: `git push origin main` Replit shell e.

**Q: Deploy hote koto somoy lage?**
A: First time 3-5 min (full install). Subsequent deploys 30-60 sec (only changed files build).

**Q: Production database migration hole ki hobe?**
A: `deploy.sh` e `pnpm --filter @workspace/db run push` ache — auto migrate korbe. Risky changes (column drop) hole manually review korben.

**Q: Multiple developers thakle conflict hobe?**
A: GitHub branch protection + PR review use korun. `concurrency` block in workflow simultaneous deploys block kore.

**Q: VPS down hole ki hobe?**
A: Deploy fail hobe, GitHub Actions log e dekhben. Hostinger SLA 99.9%, kintu monthly ~40 min downtime expected.
