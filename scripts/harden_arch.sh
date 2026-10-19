#!/bin/bash
# harden_arch.sh - 5 tang phong thu cho tram Arch Linux (ban full danh cho linux)
# Chay 1 lan sau khi da co bot: sudo bash scripts/harden_arch.sh
set -e
if [ "$(id -u)" -ne 0 ]; then
  echo "[!] Hay chay: sudo bash $0"
  exit 1
fi
USER_HOME=$(eval echo ~khoablabla)
PROJECT_DIR="$USER_HOME/geasf"
DOMAIN="khoablabla.ddns.net"
CADDYFILE_SRC="$PROJECT_DIR/caddy/Caddyfile.hardened"
CADDYFILE_DST="/etc/caddy/Caddyfile"
JAIL_SRC="$PROJECT_DIR/systemd/fail2ban-jail.local.hardened"
JAIL_DST="/etc/fail2ban/jail.local"
SERVICE_SRC="$PROJECT_DIR/systemd/mc-geasf.service.hardened"
SERVICE_DST="/etc/systemd/system/mc-geasf.service"

echo "=== [1/5] Fail2Ban (khoa IP brute-force) ==="
pacman -Q fail2ban >/dev/null 2>&1 || pacman -S --noconfirm fail2ban
cp -f "$JAIL_SRC" "$JAIL_DST"
systemctl enable --now fail2ban
fail2ban-client reload || systemctl restart fail2ban
fail2ban-client status sshd || true
echo "  -> jail.local: bantime=67d findtime=10m maxretry=5 backend=systemd"

echo "=== [2/5] Co lap dich vu bot (127.0.0.1:2013) ==="
# download.py da co BIND_HOST=127.0.0.1 mac dinh, them env cho service
grep -q BIND_HOST "$PROJECT_DIR/download.py" && echo "  -> download.py da hardened (BIND_HOST=127.0.0.1)"
# kill tien trinh cu dang mo 0.0.0.0:2013 neu co
if ss -tlnp | grep -q "0.0.0.0:2013"; then
  echo "  [!] Dang mo 0.0.0.0:2013 -> se restart ve 127.0.0.1"
  pkill -f "python3.*download.py" || true
  sleep 1
  sudo -u khoablabla bash -c "BIND_HOST=127.0.0.1 nohup python3 $PROJECT_DIR/download.py >/tmp/download-2013.log 2>&1 &"
  ss -tlnp | grep 2013 || true
else
  echo "  -> da 127.0.0.1:2013 (ok)"
fi

echo "=== [3/5] Caddy Reverse Proxy (80/443 + BasicAuth + TLS) ==="
pacman -Q caddy >/dev/null 2>&1 || pacman -S --noconfirm caddy
cp -f "$CADDYFILE_SRC" "$CADDYFILE_DST"
caddy fmt --overwrite "$CADDYFILE_DST" 2>/dev/null || true
caddy validate --config "$CADDYFILE_DST"
systemctl enable --now caddy
systemctl reload caddy || systemctl restart caddy
echo "  -> Caddyfile: /download* public, / can basicauth, tls 1.2/1.3"
echo "  -> Domain: https://$DOMAIN (ko con :2013)"
echo "  [!] Router NAT: XOA forward 2013, chi forward 80 + 443 -> IP laptop"
echo "      Neu chua mo 80/443, Let's Encrypt se timeout (nhu log hien tai). Mo xong chay: systemctl reload caddy"

echo "=== [4/5] Systemd auto-restart (ttyd + bot) ==="
cp -f "$SERVICE_SRC" "$SERVICE_DST"
systemctl daemon-reload
systemctl enable --now mc-geasf.service
systemctl status mc-geasf.service --no-pager | head -n 20 || true
echo "  -> Restart=always (tu dung lai khi crash/reboot)"

echo "=== [5/5] Kiem tra ==="
ss -tlnp | grep -E ":2013|:80|:443|:2014" || true
echo "--- Caddy ---"; systemctl is-active caddy
echo "--- Fail2Ban ---"; systemctl is-active fail2ban; fail2ban-client status 2>&1 | head -n 20 || true
echo "[*] Xong. Thu: curl -I https://$DOMAIN/download/ (200 ko can mk), curl -I https://$DOMAIN/ (401 can mk)"
