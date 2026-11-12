#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

home="$tmp/home"
registry="$home/.config/bot-afk/bots.conf"
mkdir -p "$home/Player123/bots" "$home/.config/bot-afk" "$tmp/bin"
: > "$registry"
printf '#!/bin/sh\nexit 0\n' > "$home/Player123/bots/123.sh"
chmod +x "$home/Player123/bots/123.sh"

cat > "$tmp/bin/tmux" <<'EOF'
#!/bin/sh
case "$1" in
    has-session|list-panes) exit 1 ;;
    new-session|new-window|set-option) exit 0 ;;
esac
exit 0
EOF
chmod +x "$tmp/bin/tmux"

HOME="$home" XDG_CONFIG_HOME="$home/.config" PATH="$tmp/bin:$PATH" \
    BOT_PROJECT_DIR="$repo" bash "$repo/bin/bot" start 123 >/dev/null

grep -Fq "123|$home/Player123/bots" "$registry" \
    || { echo 'FAIL: bot start did not recover the unregistered bot'; exit 1; }

echo 'PASS: bot start recovers an existing bot missing from the registry'
