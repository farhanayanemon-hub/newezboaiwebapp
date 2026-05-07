# EzboAI — Hostinger VPS Deployment Guide (Bangla)

VPS: Hostinger KVM 2 (Ubuntu 24.04 LTS) | Domain: ezboai.com

---

## ⚠️ CRITICAL Security Steps (FIRST)

**Apnar VPS root password chat e share kora hoyechilo — eta ekhuni change korben:**

1. Hostinger hPanel → VPS → Settings → **Reset Root Password**
2. Strong password set korun (16+ chars, mix kore)
3. Likhe nirapod jaygay rakhen (password manager prefer kori)

---

## 📋 Step 1: First SSH Login

Apnar laptop terminal theke (Windows hole PowerShell ba Termius use korun):

```bash
ssh root@147.93.108.171
```

New password den. Login successful hole `root@srv...:~#` dekhben.

---

## 🚀 Step 2: One-Command Setup

VPS er moddhe ei command run korun:

```bash
# Setup script download + run
curl -fsSL https://raw.githubusercontent.com/YOUR_USERNAME/ezboai/main/infrastructure/vps-setup.sh -o /tmp/setup.sh
sudo bash /tmp/setup.sh
```

**OR** jodi GitHub repo ekhono nai, manually upload korun:

Apnar laptop theke:
```bash
scp infrastructure/vps-setup.sh root@147.93.108.171:/tmp/
ssh root@147.93.108.171
sudo bash /tmp/vps-setup.sh
```

Eii script ja korbe (5-10 min lagbe):

- ✅ System update
- ✅ `ezbo` user create (root login disable)
- ✅ SSH port change to 2222
- ✅ Firewall (UFW) configure
- ✅ Fail2ban install (brute-force protection)
- ✅ Node.js 20 + pnpm + PM2
- ✅ PostgreSQL 16 + database create
- ✅ Nginx + Certbot (SSL)
- ✅ Redis
- ✅ Playwright browser dependencies
- ✅ `.env.production` generate (random secrets)
- ✅ Credentials file save: `/root/ezboai-credentials.txt`

---

## 📥 Step 3: Credentials Download Korun

Script complete hole, **immediately** credentials laptop e nin:

```bash
# Apnar laptop theke (server theke noy):
scp root@147.93.108.171:/root/ezboai-credentials.txt ./
```

Then **server theke delete** korun:
```bash
ssh root@147.93.108.171 "rm /root/ezboai-credentials.txt"
```

---

## 🔄 Step 4: Server Reboot (SSH port change effective hote)

```bash
sudo reboot
```

Reboot er por **new SSH command** use korun (port 2222, ezbo user):
```bash
ssh -p 2222 ezbo@147.93.108.171
```

---

## 🌐 Step 5: Domain DNS Point

Hostinger hPanel → Domains → `ezboai.com` → **DNS / Nameservers**:

| Type | Name | Points to | TTL |
|------|------|-----------|-----|
| A | `@` | `147.93.108.171` | 3600 |
| A | `www` | `147.93.108.171` | 3600 |

DNS propagate hote 5-30 min lagbe. Check:
```bash
dig ezboai.com +short    # apnar VPS IP show korbe
```

---

## 📦 Step 6: Code Deploy

VPS e (ezbo user):
```bash
cd /var/www/ezboai
git clone https://github.com/YOUR_USERNAME/ezboai.git .
sudo bash infrastructure/deploy.sh
```

Eii deploy script:
1. Git pull
2. pnpm install
3. Build frontend + backend
4. Database schema push
5. PM2 start

---

## 🔒 Step 7: Nginx + SSL Setup

```bash
# Nginx config copy
sudo cp /var/www/ezboai/infrastructure/nginx.conf /etc/nginx/sites-available/ezboai
sudo ln -sf /etc/nginx/sites-available/ezboai /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# SSL certificate (free Let's Encrypt)
sudo certbot --nginx -d ezboai.com -d www.ezboai.com
# Email den, terms accept, auto HTTPS redirect choose korun (option 2)

# Auto-renewal verify
sudo systemctl status certbot.timer
```

✅ **Browser e jaan: https://ezboai.com** — apnar app live!

---

## 💾 Step 8: Auto Backup Setup

```bash
sudo crontab -e
# Add this line (daily 3 AM e backup):
0 3 * * * /var/www/ezboai/infrastructure/backup.sh >> /var/log/ezboai-backup.log 2>&1
```

Backup files: `/var/backups/ezboai/` (14 din retain)

---

## 🔧 Common Commands Cheatsheet

```bash
# App status
pm2 status
pm2 logs ezboai-api          # live logs
pm2 monit                    # CPU/memory dashboard

# App restart
pm2 reload ezboai-api        # zero-downtime reload
pm2 restart ezboai-api       # full restart

# Nginx
sudo nginx -t                # test config
sudo systemctl reload nginx
sudo journalctl -u nginx -f  # nginx logs

# PostgreSQL
sudo -u postgres psql ezboai
\dt                          # list tables
\q                           # quit

# System monitoring
htop                         # process viewer
df -h                        # disk usage
free -h                      # memory
sudo ufw status              # firewall status

# Update app from GitHub (after code change)
cd /var/www/ezboai
sudo bash infrastructure/deploy.sh
```

---

## 🚨 Troubleshooting

### "Cannot connect to ezboai.com"
- DNS propagate hoyeche? Check: `dig ezboai.com +short`
- Nginx running? `sudo systemctl status nginx`
- Firewall allow korche? `sudo ufw status`

### "502 Bad Gateway"
- API server cholche? `pm2 status`
- Logs check: `pm2 logs ezboai-api`
- Port 3001 listen korche? `sudo ss -tlnp | grep 3001`

### "Database connection failed"
- PostgreSQL cholche? `sudo systemctl status postgresql`
- `.env.production` e DATABASE_URL correct? `cat /var/www/ezboai/.env.production`

### "SSL certificate error"
- Manual renew: `sudo certbot renew --force-renewal`

---

## 💰 Monthly Cost

| Item | Cost |
|------|------|
| Hostinger KVM 2 VPS | $7/mo |
| Domain ezboai.com | $1/mo (yearly $12) |
| SSL (Let's Encrypt) | Free |
| **Total** | **~$8/mo (~700 Taka)** |

---

## 📞 Support

- Apnar VPS amar (Replit Agent) direct access nai
- Code changes: Replit e edit kori → GitHub push → VPS e `bash infrastructure/deploy.sh`
- Server issue: error message screenshot/text amake share korben, ami solution debo
