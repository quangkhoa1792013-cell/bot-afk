#!/bin/bash
# security_audit.sh - kiem tra toan bo 5 tang + offline graceful
set -u
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; RESET='\033[0m'
ok(){ echo -e "${GREEN}✓ $*${RESET}"; }
warn(){ echo -e "${YELLOW}! $*${RESET}"; }
fail(){ echo -e "${RED}✗ $*${RESET}"; }
echo "=== AUDIT 5 TANG - $(date '+%Y-%m-%d %T') ==="
echo "Domain: khoablabla.ddns.net | Port: 2013->127.0.0.1 | 80/443 -> Caddy"
echo ""
# T2: Isolation
echo "[T2] Co lap 127.0.0.1"
if ss -tlnp 2>/dev/null | grep -q "0.0.0.0:2013"; then fail "0.0.0.0:2013 dang ho (lo hong)"; else ok "127.0.0.1:2013 (khong ho 0.0.0.0)"; fi
if ss -tlnp 2>/dev/null | grep -q "127.0.0.1:2013"; then ok "download.py 127.0.0.1:2013"; else fail "download.py chua chay 127.0.0.1:2013"; fi
if ss -tlnp 2>/dev/null | grep -q "127.0.0.1:2014"; then ok "ttyd 127.0.0.1:2014"; else fail "ttyd chua chay"; fi
echo ""
# T3: Caddy
echo "[T3] Caddy Reverse Proxy"
if systemctl is-active --quiet caddy 2>/dev/null; then ok "caddy active"; else fail "caddy off"; fi
if grep -q "protocols tls1.2 tls1.3" /etc/caddy/Caddyfile 2>/dev/null; then ok "TLS 1.2/1.3"; else warn "TLS config chua chuan"; fi
if grep -q "basicauth" /etc/caddy/Caddyfile 2>/dev/null || grep -q "basic_auth" /etc/caddy/Caddyfile 2>/dev/null; then ok "BasicAuth bcrypt"; else fail "thieu BasicAuth"; fi
if grep -q "@download" /etc/caddy/Caddyfile 2>/dev/null; then ok "/download public (khong mk)"; else warn "thieu @download"; fi
if timeout 3 curl -sk https://khoablabla.ddns.net/download/ 2>&1 | grep -q "Download"; then ok "https://.../download 200 public"; else warn "download qua https chua toi (co the domain/port tat)"; fi
if timeout 3 curl -sk -I https://khoablabla.ddns.net/ 2>&1 | grep -q "401"; then ok "/ can mk 401"; else warn "/ chua 401 (co the offline)"; fi
echo ""
# T1: Fail2Ban
echo "[T1] Fail2Ban"
if systemctl is-active --quiet fail2ban 2>/dev/null; then ok "fail2ban active"; else fail "fail2ban off"; fi
if grep -q "bantime = 67d" /etc/fail2ban/jail.local 2>/dev/null; then ok "bantime 67d"; else warn "bantime khac 67d"; fi
if grep -q "maxretry = 5" /etc/fail2ban/jail.local 2>/dev/null; then ok "maxretry 5 / findtime 10m"; else warn "jail.local lech"; fi
echo ""
# T4: Systemd
echo "[T4] Systemd Restart=always"
if grep -q "Restart=always" /etc/systemd/system/mc-geasf.service 2>/dev/null; then ok "mc-geasf.service Restart=always"; else fail "thieu Restart=always"; fi
if systemctl is-enabled --quiet mc-geasf.service 2>/dev/null; then ok "mc-geasf enabled"; else warn "chua enable mc-geasf"; fi
echo ""
# T5: NAT
echo "[T5] NAT 80/443"
if ss -tlnp 2>/dev/null | grep -q "\*:80"; then ok "*:80 Caddy"; else fail "*:80 chua listen"; fi
if ss -tlnp 2>/dev/null | grep -q "\*:443"; then ok "*:443 Caddy"; else fail "*:443 chua listen"; fi
if ss -tlnp 2>/dev/null | grep -q "0.0.0.0:2013"; then fail "con ho 0.0.0.0:2013 (phai XOA forward 2013)"; else ok "da XOA forward 2013 (chi 80/443)"; fi
echo ""
# Offline graceful
echo "[Offline] Domain tat -> ngat nhe"
if getent hosts khoablabla.ddns.net >/dev/null 2>&1 && timeout 3 bash -c "cat < /dev/null > /dev/tcp/khoablabla.ddns.net/443" 2>/dev/null; then
  ok "external UP - Caddy https toi duoc"
else
  warn "external DOWN - da ngat ngoai, chi giu 127.0.0.1 + lenh noi bo \`bot\`/\`tmux attach -t mc_bot\` van chay"
fi
if tmux has-session -t mc_bot 2>/dev/null; then ok "tmux mc_bot van chay (lenh noi bo con)"; else fail "tmux mc_bot tat"; fi
if ss -tlnp 2>/dev/null | grep -q "127.0.0.1:2013"; then ok "van con lenh noi bo 127.0.0.1:2013"; else fail "mat 127.0.0.1:2013"; fi
echo ""
# Tong ket port mo
echo "[Port mo ngoai] (netcheck)"
ss -tlnp 2>/dev/null | grep -E ":\*:" | grep LISTEN || ss -tlnp 2>/dev/null | grep LISTEN | head -n 20
echo ""
echo "=== XONG - Neu tat DDNS/port: external DOWN la dung, noi bo van OK ==="
