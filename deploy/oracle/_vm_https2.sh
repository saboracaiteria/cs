#!/bin/bash
echo "=== [1/3] server_name no nginx ==="
sudo sed -i "s/server_name _;/server_name tiroteio.duckdns.org;/" /etc/nginx/sites-available/cs
grep server_name /etc/nginx/sites-available/cs
sudo nginx -t 2>&1 | tail -2
sudo systemctl reload nginx
echo "=== [2/3] certbot ==="
export DEBIAN_FRONTEND=noninteractive
sudo certbot --nginx -d tiroteio.duckdns.org --non-interactive --agree-tos -m admin@tiroteio.duckdns.org --redirect 2>&1 | tail -6
echo "=== [3/3] teste ==="
sleep 2
curl -s -o /dev/null -w "https local: HTTP %{http_code}\n" https://127.0.0.1/health -k || true
echo "=== fim ==="
