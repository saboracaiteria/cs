#!/bin/bash
echo "=== liberando portas 80, 443, 3000 ==="
sudo iptables -I INPUT 5 -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 7 -p tcp --dport 3000 -j ACCEPT
echo "=== regras atualizadas ==="
sudo iptables -L INPUT -n | head -12
echo "=== persistindo (iptables-persistent) ==="
export DEBIAN_FRONTEND=noninteractive
sudo apt-get install -y iptables-persistent > /tmp/ipt.log 2>&1
sudo netfilter-persistent save > /tmp/ipt-save.log 2>&1
echo "save exit: $?"
echo "=== fim ==="
