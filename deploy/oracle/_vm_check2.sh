#!/bin/bash
echo "=== portas escutando ==="
ss -tlnp 2>/dev/null | grep -E ":80 |:3000 " || ss -tln | grep -E ":80 |:3000 "
echo "=== nginx ==="
systemctl is-active nginx
echo "=== cs service ==="
systemctl is-active cs
echo "=== iptables INPUT ==="
sudo iptables -L INPUT -n 2>/dev/null | head -10
echo "=== ufw ==="
sudo ufw status 2>/dev/null | head -5 || echo "sem ufw"
echo "=== fim ==="
