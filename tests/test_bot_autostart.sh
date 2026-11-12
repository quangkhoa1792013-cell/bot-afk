#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

mkdir -p "$tmp/home/.config/bot-afk" "$tmp/root/bots" "$tmp/bin"
printf 'demo|%s/root/bots\n' "$tmp" > "$tmp/home/.config/bot-afk/bots.conf"
printf '#!/bin/sh\nexit 0\n' > "$tmp/root/bots/demo_tmux.sh"
chmod +x "$tmp/root/bots/demo_tmux.sh"

cat > "$tmp/bin/systemctl" <<'EOF'
#!/bin/sh
printf '%s\n' "$*" >> "$SYSTEMCTL_LOG"
exit 0
EOF
cat > "$tmp/bin/loginctl" <<'EOF'
#!/bin/sh
exit 0
EOF
cat > "$tmp/bin/tmux" <<'EOF'
#!/bin/sh
exit 0
EOF
chmod +x "$tmp/bin/"*

export HOME="$tmp/home" XDG_CONFIG_HOME="$tmp/home/.config"
export PATH="$tmp/bin:$PATH" SYSTEMCTL_LOG="$tmp/systemctl.log"
BOT_PROJECT_DIR="$repo" bash "$repo/bin/bot" autostart on demo

unit="$tmp/home/.config/systemd/user/mc-demo.service"
[ -f "$unit" ] || { echo 'FAIL: unit was not created'; exit 1; }
grep -Fq "WorkingDirectory=\"$tmp/root\"" "$unit"
grep -Fq "ExecStart=/bin/bash \"$tmp/root/bots/demo_tmux.sh\" --bg" "$unit"
grep -Fq 'enable mc-demo.service' "$tmp/systemctl.log"

BOT_PROJECT_DIR="$repo" bash "$repo/bin/bot" autostart off demo
[ ! -e "$unit" ] || { echo 'FAIL: unit was not removed'; exit 1; }
grep -Fq 'disable --now mc-demo.service' "$tmp/systemctl.log"

echo 'PASS: bot autostart on/off manages the user service'
