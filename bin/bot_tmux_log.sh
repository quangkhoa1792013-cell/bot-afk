#!/usr/bin/env bash
# Attach a log pipe without replacing any pipe already owned by another program.
set -u
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bot="${1:-}"
pane="${2:-${TMUX_PANE:-}}"
[[ "$bot" =~ ^[A-Za-z0-9_-]+$ && -n "$pane" ]] || exit 1
if [ "$(tmux display-message -p -t "$pane" '#{pane_pipe}' 2>/dev/null)" = 1 ]; then
    printf '[!] Pane %s đã có pipe khác; không thay thế pipe đó.\n' "$pane" >&2
    exit 1
fi
log_root="${BOT_LOG_ROOT:-$root/logs/bots}"
printf -v command 'exec %q %q %q %q' /usr/bin/python3 "$root/bin/bot_cycle_log.py" "$bot" "$log_root"
tmux pipe-pane -o -t "$pane" "$command"
