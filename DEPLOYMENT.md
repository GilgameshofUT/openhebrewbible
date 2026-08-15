# Deployment

Web Tanakh is a Next.js application with server-side route handlers. It needs a
Node.js runtime with a writable filesystem. It **cannot** be deployed to GitHub
Pages or any static-only host, because the API routes read query parameters at
request time, which Next.js forbids under `output: 'export'`.

This guide covers a Hostinger VPS (or any Ubuntu/Debian VPS with root).

---

## The corpus is not in the repository

`data/generated/` is gitignored apart from `manifest.json`. The corpus, lexicon,
citation map, per-book files, and occurrence index are all generated from pinned
upstream sources during deployment.

| Step | Command | Produces | Time |
| --- | --- | --- | --- |
| 1 | `npm run import:oshb` | `oshb-corpus.json`, `oshb-lexicon.json` | ~45 s |
| 2 | `npm run import:citations` | `jewish-to-christian-citation-map.json` | ~10 s |
| 3 | `npm run build:derived` | `books/`, `occurrence-index.json` | ~20 s |

The additional English translations are **already committed** under
`data/sources/{web,ylt,bsb,sct}/` in the Jewish versification, so no import
step is needed at deploy time — the Dockerfile copies them straight into the
runner image.

This was verified from a clean clone: the regenerated corpus is **byte-identical**
(SHA-256 `cb802bda…`) to the previously committed file.

Steps 1 and 2 fetch from `raw.githubusercontent.com`. **The build host needs
outbound HTTPS to GitHub.** If that is unacceptable, generate the data once and
copy `data/generated/` to the server instead.

### Disk requirements

| Item | Size |
| --- | --- |
| Repository clone | ~9 MB |
| Generated data | ~140 MB |
| `node_modules` | ~500 MB (build only) |
| Built image / app | ~700 MB |

A 1 GB RAM / 10 GB disk VPS is sufficient. **2 GB RAM is recommended for the
build**, since `next build` and the corpus import are memory-hungry. If you only
have 1 GB, add swap (see Troubleshooting).

---

## Option A — Docker (recommended)

Self-contained, reproducible, and easy to roll back.

### 1. Prepare the server

```bash
ssh root@YOUR_SERVER_IP

apt update && apt upgrade -y
apt install -y ca-certificates curl git ufw

# Docker Engine
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

docker --version
```

### 2. Create a deploy user

Do not run the app as root.

```bash
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys
```

### 3. Firewall

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status
```

Port 3000 is deliberately **not** opened; Nginx proxies to it over loopback.

### 4. Build and run

```bash
su - deploy
git clone https://github.com/YOUR_USERNAME/web-tanakh.git
cd web-tanakh

docker build -t web-tanakh .     # ~5 min: installs deps, imports corpus, builds

docker run -d \
  --name web-tanakh \
  --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  web-tanakh

docker ps
curl -s localhost:3000/api/chapter\?book=gen\&chapter=1 | head -c 200
```

Binding to `127.0.0.1:3000` means the container is unreachable from the internet
except through Nginx.

### 5. Updating

```bash
cd ~/web-tanakh
git pull
docker build -t web-tanakh .
docker stop web-tanakh && docker rm web-tanakh
docker run -d --name web-tanakh --restart unless-stopped -p 127.0.0.1:3000:3000 web-tanakh
docker image prune -f
```

Rollback is `git checkout <previous-sha>` and rebuild.

---

## Option B — systemd, no Docker

Lighter on a small VPS, but the corpus import runs on the server.

### 1. Install Node.js 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs git
node -v
```

### 2. Deploy

```bash
adduser --disabled-password --gecos "" deploy
su - deploy
git clone https://github.com/YOUR_USERNAME/web-tanakh.git
cd web-tanakh

npm ci
npm run import:oshb
npm run import:citations
npm run build:derived
npm run build
```

### 3. Service unit

```bash
exit   # back to root
cat > /etc/systemd/system/web-tanakh.service <<'UNIT'
[Unit]
Description=Web Tanakh
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/home/deploy/web-tanakh
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOSTNAME=127.0.0.1
ExecStart=/usr/bin/node .next/standalone/server.js
Restart=always
RestartSec=5

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/home/deploy/web-tanakh

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now web-tanakh
systemctl status web-tanakh
```

`output: 'standalone'` bundles the server, but static assets are copied
separately. After each build:

```bash
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/
cp -r data .next/standalone/
```

### 4. Updating

```bash
su - deploy
cd ~/web-tanakh && git pull && npm ci && npm run build
cp -r .next/static .next/standalone/.next/ && cp -r public data .next/standalone/
exit
systemctl restart web-tanakh
```

Re-run the import steps only when the pinned OSHB release changes.

---

## Nginx and HTTPS

Required for both options.

```bash
apt install -y nginx certbot python3-certbot-nginx

cat > /etc/nginx/sites-available/web-tanakh <<'CONF'
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    # The corpus responses are large; allow compression to do its work.
    gzip on;
    gzip_types application/json application/javascript text/css;
    gzip_min_length 1024;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
    }

    # Immutable build output.
    location /_next/static/ {
        proxy_pass http://127.0.0.1:3000;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location /fonts/ {
        proxy_pass http://127.0.0.1:3000;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
CONF

ln -sf /etc/nginx/sites-available/web-tanakh /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

Point your domain's A record at the server, then:

```bash
certbot --nginx -d your-domain.com -d www.your-domain.com
systemctl status certbot.timer     # auto-renewal
```

The application sets its own security headers, including a CSP that allows the
SoundCloud and YouTube embeds. Do not add a second CSP in Nginx — two policies
intersect, and the stricter one wins, which will break the players.

---

## Verifying a deployment

```bash
curl -sI https://your-domain.com | grep -i content-security-policy
curl -s "https://your-domain.com/api/chapter?book=gen&chapter=1" | head -c 200
curl -s "https://your-domain.com/api/chapter?book=bogus&chapter=1"   # expect 400
curl -s "https://your-domain.com/api/occurrences?lexiconId=iff" | head -c 200
```

A healthy deployment returns 200 for the first three and 400 with an explanatory
message for the fourth. Warm chapter requests should be a few milliseconds.

If `/api/chapter` returns **503**, the derived data is missing — run
`npm run build:derived` (Option B) or rebuild the image (Option A).

---

## Operations

### Logs

```bash
docker logs -f web-tanakh          # Option A
journalctl -u web-tanakh -f        # Option B
```

### Memory

The server memoises each parsed artifact at module scope. Expect **250–400 MB**
resident once all books have been touched. This is deliberate: it took chapter
requests from ~250 ms to ~4 ms. Do not "fix" it by disabling the cache.

Cap it under Docker if needed:

```bash
docker run -d --name web-tanakh --restart unless-stopped \
  --memory=768m -p 127.0.0.1:3000:3000 web-tanakh
```

### Updating the corpus

When the pinned OSHB release changes, edit `release` in `scripts/import-oshb.ts`,
then re-run all three data steps and **restart the process**. The memoised cache
does not notice files changing on disk.

### Backups

Nothing needs backing up. There is no database and no user data; everything is
either in git or regenerable from upstream.

---

## Troubleshooting

**Build killed / out of memory on a 1 GB VPS**

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

**Import fails with a network error** — the build host needs outbound HTTPS to
`raw.githubusercontent.com`. Alternatively generate `data/generated/` elsewhere
and copy it up with `rsync`.

**503 from `/api/chapter`** — derived data missing; run `npm run build:derived`.

**Stale text after regenerating data** — restart the process. Parsed artifacts
are cached at module scope for the life of the process.

**SoundCloud or YouTube players blank** — a second CSP is being applied, almost
always from Nginx. Remove it; the app sets its own.

**Nginx 502** — the app is not listening. Check `docker ps` or
`systemctl status web-tanakh`, and confirm it is bound to `127.0.0.1:3000`.
