# Tarteel — Production Deployment Guide

Deploys to **Hetzner CPX22** (3 vCPU, 4 GB RAM, €5.39/mo) with **auto-deploy from GitHub** on every push to `main`.

## Architecture

```
Internet (HTTPS)
      │
   Nginx (port 443)
   ├── tarteel.live        → Next.js   (127.0.0.1:3000)
   ├── www.tarteel.live    → redirect to tarteel.live
   └── api.tarteel.live
         ├── /hls/*        → static files from /opt/tarteel/hls/  (nginx direct)
         ├── /socket.io/*  → FastAPI + Socket.IO  (127.0.0.1:8000)
         └── /*            → FastAPI REST          (127.0.0.1:8000)

Docker Compose (internal network, no external ports)
   ├── backend   :8000   (FastAPI + Socket.IO + APScheduler)
   ├── db        :5432   (PostgreSQL 16)
   └── redis     :6379   (Redis 7)
```

Audio files and HLS segments live on the host, mounted into the backend container.
The GitHub repo contains all code. Audio is uploaded once via rsync and persists on the server.

---

## Prerequisites

Before you start you need:
- A **GitHub account** and this repo pushed to it (covered in Step 1)
- A **Hetzner** account — [hetzner.com/cloud](https://hetzner.com/cloud)
- The **tarteel.live** domain with DNS access (Namecheap or similar)
- Your local machine with the **audio files** ready (`audio/` directory, ~525 MB for Juz 1-10)

---

## Step 1 — Push the code to GitHub

On your **local machine**:

```bash
cd /path/to/Tarteel

# Initialise git (if not already done)
git init
git add .
git commit -m "Initial commit"

# Create a new repo on GitHub (do this in the GitHub web UI, don't add README/licence)
# Then connect and push:
git remote add origin https://github.com/YOUR_USERNAME/tarteel.git
git branch -M main
git push -u origin main
```

> The audio directory is excluded by `.gitignore` — it goes to the server via rsync (Step 8).

---

## Step 2 — Provision the Hetzner CPX22

1. Log in to [console.hetzner.com](https://console.hetzner.com)
2. **New Server** → Location: choose nearest to your users
3. **OS**: Ubuntu 24.04
4. **Type**: CPX22 (3 vCPU shared, 4 GB RAM, 80 GB SSD — ~€5.39/mo)
5. **SSH Key**: paste your **local machine's** public key (`~/.ssh/id_ed25519.pub`)
   If you don't have one: `ssh-keygen -t ed25519 -C "tarteel-deploy"`
6. Create the server. Note the **public IP address**.

---

## Step 3 — Point DNS at the server

Log in to **Namecheap** (or your registrar) → tarteel.live → Advanced DNS.

Delete existing A records, then add:

| Type | Host | Value            | TTL  |
|------|------|------------------|------|
| A    | @    | `YOUR_SERVER_IP` | Auto |
| A    | www  | `YOUR_SERVER_IP` | Auto |
| A    | api  | `YOUR_SERVER_IP` | Auto |

Check propagation (usually 5–30 min):
```bash
dig +short tarteel.live
```

---

## Step 4 — Initial server setup

SSH in as root:
```bash
ssh root@YOUR_SERVER_IP
```

### Create the deploy user

```bash
adduser deploy --gecos ""
usermod -aG sudo deploy

# Copy your SSH key to the deploy user
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
```

### Harden SSH

```bash
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd
```

### Firewall

```bash
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw enable
```

### Install Docker

```bash
apt-get update && apt-get install -y curl git
curl -fsSL https://get.docker.com | bash
usermod -aG docker deploy
```

Log out from root and back in as `deploy` to pick up the docker group:

```bash
exit
ssh deploy@YOUR_SERVER_IP
```

---

## Step 5 — Clone the repo on the server

```bash
sudo mkdir -p /opt/tarteel
sudo chown deploy:deploy /opt/tarteel
git clone https://github.com/SAADAT-Abu/tarteel.git /opt/tarteel
cd /opt/tarteel
```

---

## Step 6 — Install nginx + certbot

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

### Deploy the nginx config

```bash
sudo mkdir -p /etc/nginx/sites-available
sudo cp /opt/tarteel/nginx/tarteel.conf /etc/nginx/sites-available/tarteel.conf
sudo ln -sf /etc/nginx/sites-available/tarteel.conf /etc/nginx/sites-enabled/tarteel.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

### Get SSL certificates

```bash
sudo certbot --nginx \
  -d tarteel.live \
  -d www.tarteel.live \
  -d api.tarteel.live \
  --agree-tos --no-eff-email -m you@example.com
```

Verify auto-renewal is active:
```bash
sudo systemctl status certbot.timer
```

---

## Step 7 — Create the production `.env`

```bash
cp /opt/tarteel/.env.production /opt/tarteel/.env
```

Generate secrets and fill them in:

```bash
echo "JWT_SECRET_KEY=$(openssl rand -hex 32)"
echo "ADMIN_API_KEY=$(openssl rand -hex 32)"
echo "DB_PASSWORD=$(openssl rand -hex 16)"
```

```bash
nano /opt/tarteel/.env
```

**Required fields to fill in** (everything else has correct defaults):

| Key | Description |
|-----|-------------|
| `DB_PASSWORD` | Random string — **also update** `DATABASE_URL` to match |
| `JWT_SECRET_KEY` | Output of `openssl rand -hex 32` |
| `ADMIN_API_KEY` | Output of `openssl rand -hex 32` |
| `BREVO_SMTP_USER` | Your Brevo account login email |
| `BREVO_SMTP_KEY` | Your Brevo SMTP key |

Everything else (`FRONTEND_URL`, `HLS_SERVE_URL`, `COOKIE_SECURE`, etc.) is already correct for production in `.env.production`.

---

## Step 8 — Upload audio files (one-time, from your local machine)

The audio directory is not in git. Upload it from your local machine:

```bash
# Run this from your LOCAL machine, not the server
rsync -avz --progress \
  /path/to/Tarteel/audio/ \
  deploy@YOUR_SERVER_IP:/opt/tarteel/audio/
```

This uploads ~525 MB (Juz 1-10 + prayer phrase audio). Takes 5–15 minutes depending on your connection.

Also create the HLS output directory:
```bash
ssh deploy@YOUR_SERVER_IP "mkdir -p /opt/tarteel/hls"
```

---

## Step 9 — Build and start the stack

```bash
cd /opt/tarteel
docker compose -f docker-compose.prod.yml up -d --build
```

Watch startup logs:
```bash
docker compose -f docker-compose.prod.yml logs -f
```

Check everything is healthy:
```bash
docker compose -f docker-compose.prod.yml ps
curl https://api.tarteel.live/health
```

Expected response: `{"status":"ok","service":"tarteel"}`

---

## Step 10 — Trigger room creation for tonight

The scheduler auto-creates rooms at 2am UTC every night. For the first deploy, trigger it manually:

```bash
curl -X POST https://api.tarteel.live/admin/trigger/daily-room-creation \
  -H "X-Admin-Key: YOUR_ADMIN_API_KEY"
```

---

## Step 11 — Download Juz 11-30 in the background

Juz 1-10 are already uploaded. Juz 11-30 need to be downloaded on the server.
You have until Night 11 (about 8 days). Run this now so it finishes in time:

```bash
# Open a tmux session so it survives disconnection
tmux new -s audio

docker compose -f docker-compose.prod.yml exec backend python3 -c "
import asyncio
from services.audio.downloader import download_all
from config import get_settings
s = get_settings()
asyncio.run(download_all([s.DEFAULT_RECITER], juz_list=list(range(11, 31))))
"

# Detach from tmux: Ctrl+B then D
# Reattach later: tmux attach -t audio
```

Takes ~3-4 hours. Check progress at any time:
```bash
ls /opt/tarteel/audio/Alafasy_128kbps/ | wc -l   # how many surah dirs
```

---

## Step 12 — Set up GitHub Actions for auto-deploy

Every push to `main` will automatically SSH into the server and redeploy.

### Generate a dedicated CI SSH key (on the server)

```bash
ssh-keygen -t ed25519 -C "tarteel-github-actions" -f ~/.ssh/tarteel_ci -N ""
cat ~/.ssh/tarteel_ci.pub >> ~/.ssh/authorized_keys
cat ~/.ssh/tarteel_ci      # copy this — it's the private key for GitHub Secrets
```

### Add secrets to GitHub

Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Secret name | Value |
|-------------|-------|
| `SERVER_IP` | Your Hetzner server's public IP (e.g. `123.456.789.0`) |
| `SSH_PRIVATE_KEY` | The full content of `~/.ssh/tarteel_ci` (private key, starts with `-----BEGIN OPENSSH PRIVATE KEY-----`) |

### Test it

Push any change to `main` and watch the **Actions** tab on GitHub. The deploy job should:
1. SSH into the server
2. `git pull origin main`
3. `docker compose up -d --build`
4. Hit `/health` and confirm

From now on, every `git push origin main` from your local machine deploys automatically.

---

## Ongoing operations

### Deploy a code change

```bash
# From your local machine
git add .
git commit -m "describe what changed"
git push origin main
# GitHub Actions deploys automatically in ~3 minutes
```

### View live logs

```bash
ssh deploy@YOUR_SERVER_IP
docker compose -f /opt/tarteel/docker-compose.prod.yml logs backend -f --tail=100
docker compose -f /opt/tarteel/docker-compose.prod.yml logs frontend -f --tail=100
```

### Restart a service manually

```bash
docker compose -f /opt/tarteel/docker-compose.prod.yml restart backend
```

### Database backup

```bash
docker compose -f /opt/tarteel/docker-compose.prod.yml exec db \
  pg_dump -U tarteel tarteel > ~/backup_$(date +%Y%m%d).sql
```

### Trigger room creation manually

```bash
curl -X POST https://api.tarteel.live/admin/trigger/daily-room-creation \
  -H "X-Admin-Key: YOUR_ADMIN_API_KEY"
```

### Renew SSL certificates

Certbot handles this automatically via the `certbot.timer` systemd unit. To force renew:
```bash
sudo certbot renew --force-renewal
sudo systemctl reload nginx
```

---

## Costs

| Item | Provider | Cost |
|------|----------|------|
| VPS (Hetzner CPX22) | Hetzner | ~€5.39/mo |
| Domain (tarteel.live) | Namecheap | ~$10/yr |
| SSL | Let's Encrypt | Free |
| CI/CD | GitHub Actions | Free |
| Email (Brevo) | Brevo | Free up to 300/day |
| Quran audio | EveryAyah.com | Free |
| **Total** | | **~€5.39/mo** |

Optional extras:
- Twilio WhatsApp: ~$0.005 per message
- SendGrid email: Free up to 100/day

---

## Troubleshooting

**Backend won't start**
```bash
docker compose -f docker-compose.prod.yml logs backend --tail=50
```
Most common cause: `.env` is missing a required key (`JWT_SECRET_KEY`, `ADMIN_API_KEY`).

**Socket.IO not connecting**
Nginx must proxy `/socket.io/` with `Upgrade` and `Connection` headers. Check `nginx/tarteel.conf` is correctly linked and reloaded.

**HLS stream not playing**
- Check `/opt/tarteel/hls/<room_id>/stream.m3u8` exists
- Check nginx `/hls/` block has correct `alias /opt/tarteel/hls/`
- Check `HLS_SERVE_URL=https://api.tarteel.live` is set in `.env`

**Email not sending**
- Brevo: confirm your account at brevo.com (SMTP is disabled until email confirmed)
- Check backend logs for SMTP error messages

**Room has no audio for tonight's juz**
Juz 11-30 may not be downloaded yet. Check Step 11 above and rerun if needed.
