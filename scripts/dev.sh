#!/bin/bash
# Dev mode: bot (tsx watch) + tauri dev
set -euo pipefail
cd "$(dirname "$0")/.."

npm install

case "${1:-all}" in
  bot)
    npm run dev -w @minebot/bot-core -- --config config/default.toml "$@"
    ;;
  gui)
    npx tauri dev
    ;;
  *)
    echo "Dung: scripts/dev.sh bot|gui"
    echo "  bot - chay bot voi hot reload (tsx watch)"
    echo "  gui - chay Tauri app dev mode"
    ;;
esac
