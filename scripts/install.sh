#!/bin/bash
# Cai dat MineBot cho user hien tai (khong can sudo)
set -euo pipefail
cd "$(dirname "$0")/.."

BIN_SRC="target/release/minebot-gui"
BOT_SRC="packages/bot-core/dist"
INSTALL_BIN="$HOME/.local/bin"
DATA_DIR="$HOME/.local/share/minebot"
CONFIG_DIR="$HOME/.config/minebot"

[ -x "$BIN_SRC" ] || { echo "Chua build! Chay scripts/build.sh truoc."; exit 1; }

mkdir -p "$INSTALL_BIN" "$CONFIG_DIR" "$DATA_DIR/bot-core"

cp "$BIN_SRC" "$INSTALL_BIN/"
cp -r "$BOT_SRC"/* "$DATA_DIR/bot-core/"

if [ ! -f "$CONFIG_DIR/config.toml" ]; then
  cp config/default.toml "$CONFIG_DIR/config.toml"
  echo "-> Da tao config: $CONFIG_DIR/config.toml (sua server/username trong file nay)"
fi

mkdir -p ~/.config/systemd/user
sed "s|%h|$HOME|g" config/systemd/minebot.service > ~/.config/systemd/user/minebot.service
systemctl --user daemon-reload

echo ""
echo "=== Cach dung ==="
echo "  GUI:        $INSTALL_BIN/minebot-gui"
echo "  Bot ngam:   systemctl --user enable --now minebot.service"
echo "  Xem log:    journalctl --user -u minebot -f"
echo "  Dung bot:   systemctl --user stop minebot.service"
