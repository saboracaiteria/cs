#!/bin/bash
echo "=== [1/3] certbot HTTPS ==="
export DEBIAN_FRONTEND=noninteractive
sudo certbot --nginx -d tiroteio.duckdns.org --non-interactive --agree-tos -m admin@tiroteio.duckdns.org --redirect 2>&1 | tail -8
echo "=== [2/3] apontar wsUrl p/ wss://tiroteio.duckdns.org/ws ==="
cd /srv/cs
grep -n "wsUrl" src/config.js | head -3
sed -i "s#ws://144.22.250.80/ws#wss://tiroteio.duckdns.org/ws#g" src/config.js
grep -n "wsUrl" src/config.js | head -3
echo "=== [3/3] reiniciar servidor ==="
sudo systemctl restart cs
sleep 3
sudo systemctl is-active cs
echo "=== teste local https ==="
curl -s -o /dev/null -w "https local: HTTP %{http_code}\n" https://127.0.0.1/health -k || true
echo "=== fim ==="
