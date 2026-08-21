#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "[1/3] Build bot-core (TypeScript -> dist/)..."
npm ci || npm install
npm run build:bot

echo "[2/3] Build Tauri app (release)..."
npx tauri build

echo "[3/3] Done."
ls -la target/release/minebot-gui 2>/dev/null || true
