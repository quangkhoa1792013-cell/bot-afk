#!/usr/bin/env bash
set -u
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bot="$1"
script="$2"
if ! bash "$root/bin/bot_tmux_log.sh" "$bot"; then
    printf '[!] Không bật được log cho bot %s\n' "$bot" >&2
fi
exec bash "$script" --inside-tmux
