#!/bin/bash
exec > /tmp/setup.log 2>&1
set -x
echo "=== [1/6] apt update/upgrade ==="
echo "x" | sudo -S apt update -y
echo "x" | sudo -S DEBIAN_FRONTEND=noninteractive apt upgrade -y
echo "=== [2/6] node 20 + nginx + certbot ==="
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
echo "x" | sudo -S DEBIAN_FRONTEND=noninteractive apt install -y nodejs nginx certbot python3-certbot-nginx
node -v; npm -v
echo "=== [3/6] clone do repo ==="
echo "x" | sudo -S mkdir -p /srv && echo "x" | sudo -S chown ubuntu:ubuntu /srv
cd /srv
[ -d cs ] || git clone https://github.com/saboracaiteria/cs.git
cd cs
git pull --ff-only || true
npm install --omit=dev 2>&1 | tail -3
echo "=== [4/6] servico systemd ==="
cat > /tmp/cs.service <<'UNIT'
[Unit]
Description=CS-Like Game Server
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/srv/cs
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=3
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
UNIT
echo "x" | sudo -S cp /tmp/cs.service /etc/systemd/system/cs.service
echo "x" | sudo -S systemctl daemon-reload
echo "x" | sudo -S systemctl enable --now cs
sleep 3
echo "x" | sudo -S systemctl is-active cs
echo "=== [5/6] nginx (proxy 80 -> 3000) ==="
cat > /tmp/cs-nginx <<'NGX'
server {
    listen 80;
    listen [::]:80;
    server_name _;
    client_max_body_size 50M;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
NGX
echo "x" | sudo -S cp /tmp/cs-nginx /etc/nginx/sites-available/cs
echo "x" | sudo -S ln -sf /etc/nginx/sites-available/cs /etc/nginx/sites-enabled/cs
echo "x" | sudo -S rm -f /etc/nginx/sites-enabled/default
echo "x" | sudo -S nginx -t
echo "x" | sudo -S systemctl reload nginx
echo "=== [6/6] aponta cliente p/ este servidor + teste ==="
sed -i "s#wsUrl: 'wss://tiroteio-cs.onrender.com/ws'#wsUrl: 'ws://144.22.250.80/ws'#" /srv/cs/src/config.js
grep wsUrl /srv/cs/src/config.js
sleep 2
curl -s -o /dev/null -w "node direto: HTTP %{http_code}\n" http://127.0.0.1:3000/health || true
curl -s -o /dev/null -w "via nginx:  HTTP %{http_code}\n" http://127.0.0.1/health || true
echo "=== SETUP FINALIZADO ==="
