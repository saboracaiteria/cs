#!/bin/bash
echo "=== CONECTADO ==="
whoami; hostname; uname -m
echo "--- pacotes ---"
node -v 2>/dev/null || echo "sem node"
git --version 2>/dev/null || echo "sem git"
nginx -v 2>&1 | head -1 || echo "sem nginx"
echo "--- recursos ---"
free -h | head -2
nproc
echo "--- sudo sem senha? ---"
echo "x" | sudo -S true 2>/dev/null && echo "sudo NOPASSWD OK" || echo "sudo pede senha"
echo "--- rede ---"
curl -s --max-time 5 ifconfig.me 2>/dev/null || echo "sem curl"
