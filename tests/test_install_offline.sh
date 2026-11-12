#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

test_home="$tmp/home"
mkdir -p "$test_home"

printf '\n\nDemoBot\ny\n\n\n\n' |
    HOME="$test_home" USER="tester" BOT_BINARY_SOURCE="/bin/true" \
    bash "$repo/install.sh"

root="$test_home/DemoBot"
for path in \
    "$root/MinecraftClient" \
    "$root/bots/DemoBot.ini" \
    "$root/bots/DemoBot.sh" \
    "$root/bots/DemoBot_tmux.sh" \
    "$root/scripts/login_DemoBot.txt" \
    "$test_home/.local/bin/bot" \
    "$test_home/.local/share/bot-afk/install.sh"; do
    [ -e "$path" ] || { echo "FAIL: thiếu $path"; exit 1; }
done

[ ! -e "$root/download.py" ] || { echo 'FAIL: bộ cài vẫn sao chép web server'; exit 1; }
grep -Fq "DemoBot|$root/bots" "$test_home/.config/bot-afk/bots.conf"
grep -Fq 'ConsoleMode = "classic"' "$root/bots/DemoBot.ini"
bash -n "$root/bots/DemoBot.sh" "$root/bots/DemoBot_tmux.sh"
HOME="$test_home" XDG_CONFIG_HOME="$test_home/.config" \
    "$test_home/.local/bin/bot" list | grep -Fq DemoBot

custom="$tmp/custom-location"
printf '%s\n%s\n%s\n%s\n%s\n%s\n%s\n' \
    "$custom" short PlayerTwo n play.example.com '' '' |
    HOME="$test_home" USER="tester" BOT_BINARY_SOURCE="/bin/true" \
    bash "$repo/install.sh"
[ -f "$custom/bots/short.sh" ] || { echo 'FAIL: custom path or nickname was ignored'; exit 1; }
[ ! -e "$custom/PlayerTwo" ] || { echo 'FAIL: game name was appended to a custom path'; exit 1; }
grep -Fq "short|$custom/bots" "$test_home/.config/bot-afk/bots.conf"

echo 'PASS: offline installer creates a minimal bot installation'
