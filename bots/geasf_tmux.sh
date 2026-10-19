#!/bin/bash
# geasf_tmux.sh — đưa bot geasf vào session CHUNG mc_bot (mỗi bot 1 window).
# Cùng logic với 'bot start geasf' (bot CLI v2): mọi bot chung 1 session mc_bot.
#
# Cách dùng:
#   bash bots/geasf_tmux.sh [--bg] [--force|-f|-y]
#   bots/geasf.sh tự gọi script này với --bg khi chạy ngoài tmux.
#
# LƯU Ý: hạ tầng web/ttyd do 'bot download on/off' quản lý — script này
# chỉ BÁO trạng thái, không tự start/kill hạ tầng gì cả.

BOT="geasf"
SESSION="mc_bot"            # session CHUNG duy nhất cho mọi bot
LEGACY_SESSION="mc_geasf"   # session riêng kiểu cũ — tự migrate sang mc_bot
PORT=2013
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TTYD_ENABLED="y"
TTYD_USER="khoablabla"
TTYD_PASS='!@#$%^&*()'
TTYD_PORT=2014
DOMAIN_ENABLED="y"
DOMAIN_NAME="khoablabla.ddns.net"
BG_MODE=0
FORCE=0
LOCK_FILE="/tmp/mc_bot.lock"

usage() {
    echo "Dùng: $(basename "$0") [--bg] [--force|-f|-y]"
    echo "  --bg            chạy nền, không hỏi attach"
    echo "  --force/-f/-y   kill window $BOT cũ trong $SESSION rồi tạo lại"
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --bg) BG_MODE=1; shift ;;
        --force|-f|-y) FORCE=1; shift ;;
        -h|--help|help) usage; exit 0 ;;
        --inside-tmux) shift ;;  # forwarded từ geasf.sh, bỏ qua ở đây
        *) echo "[$(date +%T)] [!] Tham số lạ: $1"; usage; exit 1 ;;
    esac
done

command -v tmux >/dev/null 2>&1 || { echo "[$(date +%T)] [!] Chưa có tmux"; exit 1; }

# --- Chống 2 tiến trình tạo session cùng lúc (nguyên nhân gây 2 session) ---
exec 9>"$LOCK_FILE"
if command -v flock >/dev/null 2>&1; then
    flock -w 15 9 || { echo "[$(date +%T)] [!] Không lấy được lock $LOCK_FILE"; exit 1; }
fi

# --- Migrate session riêng kiểu cũ sang session chung ---
if tmux has-session -t "$LEGACY_SESSION" 2>/dev/null; then
    if tmux has-session -t "$SESSION" 2>/dev/null; then
        echo "[$(date +%T)] [!] Session cũ $LEGACY_SESSION còn sót trong khi $SESSION đã có -> kill session cũ"
        tmux kill-session -t "$LEGACY_SESSION" 2>/dev/null
    else
        echo "[$(date +%T)] [*] Đổi tên session cũ $LEGACY_SESSION -> $SESSION (giữ bot đang chạy)"
        tmux rename-session -t "$LEGACY_SESSION" "$SESSION" 2>/dev/null
    fi
fi

window_exists() {
    tmux list-windows -t "$SESSION" -F '#{window_name}' 2>/dev/null | grep -qx "$BOT"
}

create_window() {
    echo "[$(date +%T)] Tạo window $BOT trong $SESSION..."
    if tmux has-session -t "$SESSION" 2>/dev/null; then
        # 9>&- : không để tmux server thừa hưởng fd lock, tránh kẹt /tmp/mc_bot.lock
        tmux new-window -t "$SESSION" -n "$BOT" "bash $PROJECT_DIR/bots/$BOT.sh --inside-tmux" 9>&- \
            || { echo "[$(date +%T)] [!] Không tạo được window $BOT"; return 1; }
    else
        tmux new-session -d -s "$SESSION" -n "$BOT" "bash $PROJECT_DIR/bots/$BOT.sh --inside-tmux" 9>&- \
            || { echo "[$(date +%T)] [!] Không tạo được session $SESSION"; return 1; }
    fi
    tmux set-option -t "$SESSION" allow-rename off 2>/dev/null
    sleep 1
    echo "[$(date +%T)] ✓ Bot $BOT đang chạy trong $SESSION:$BOT"
}

report_infra() {
    # Chỉ báo trạng thái bật/tắt — không khởi động gì cả
    if ss -tlnp 2>/dev/null | grep -q ":$PORT "; then
        echo "[$(date +%T)] [bat] Web download.py: dang bat (port $PORT)"
    else
        echo "[$(date +%T)] [tat] Web download.py: chua bat (port $PORT)"
    fi
    if ss -tlnp 2>/dev/null | grep -q ":$TTYD_PORT "; then
        echo "[$(date +%T)] [bat] ttyd: dang bat (port $TTYD_PORT)"
    else
        echo "[$(date +%T)] [tat] ttyd: chua bat (port $TTYD_PORT)"
    fi
}

report_infra

if window_exists; then
    echo "[$(date +%T)] ⚠️  Bot $BOT đã chạy trong $SESSION:"
    tmux list-windows -t "$SESSION" -F '  #{window_index}: #{window_name} (#{pane_current_command})' 2>/dev/null | grep -w "$BOT" || true
    if [[ "$FORCE" -eq 1 ]]; then
        ANS="y"
        echo "[$(date +%T)] --force -> kill window cũ, tạo lại"
    elif [ -t 0 ]; then
        read -r -p "Kill window $BOT và chạy lại? (y/N): " ANS
    else
        echo "[$(date +%T)] Non-interactive -> giữ window cũ"
        ANS="n"
    fi
    if [[ "$ANS" =~ ^[Yy]$ ]]; then
        echo "[$(date +%T)] Kill window $SESSION:$BOT..."
        tmux kill-window -t "$SESSION:$BOT" 2>/dev/null
        sleep 1
        create_window
    else
        echo "[$(date +%T)] Giữ window cũ."
    fi
else
    create_window
fi

# --- Liệt kê mọi bot trong session chung ---
echo "[$(date +%T)] Session chung $SESSION hiện có:"
tmux list-windows -t "$SESSION" -F '  - #{window_name} (#{pane_current_command})' 2>/dev/null || echo "  (không có)"

# --- Báo trạng thái web (không tự khởi động gì cả) ---
LAN_IP=$(ip -4 addr show scope global 2>/dev/null | grep -oP 'inet \K[\d.]+' | head -1); [ -z "$LAN_IP" ] && LAN_IP="127.0.0.1"
if ss -tlnp 2>/dev/null | grep -q ":$PORT "; then
    if [ "$DOMAIN_ENABLED" = "y" ]; then
        echo "[$(date +%T)] ✓ Web dang chay: https://$DOMAIN_NAME/"
    else
        echo "[$(date +%T)] ✓ Web dang chay: http://$LAN_IP:$PORT/"
    fi
else
    echo "[$(date +%T)] [tat] Web download.py chua bat (port $PORT) - dung 'bot download on' de mo"
fi
# Thông báo cho người dùng
if [ -f "$PROJECT_DIR/.download_on" ]; then
    if [ "$DOMAIN_ENABLED" = "y" ]; then
        echo "[$(date +%T)] Tai file: https://$DOMAIN_NAME/download"
    else
        echo "[$(date +%T)] Tai file: http://$LAN_IP:$PORT/download"
    fi
else
    echo "[$(date +%T)] Tai file: tat (dung 'bot download on' de mo)"
fi
# --- TTYD: chỉ báo trạng thái ---
if ss -tlnp 2>/dev/null | grep -q ":$TTYD_PORT "; then
    echo "[$(date +%T)] [bat] ttyd: dang bat (port $TTYD_PORT)"
else
    echo "[$(date +%T)] [tat] ttyd: chua bat (port $TTYD_PORT)"
fi

if [ "$BG_MODE" -eq 1 ]; then
    echo "[$(date +%T)] (bg mode) Xem bot: tmux attach -t $SESSION"
    exit 0
fi

# --- Chay duoi systemd (khong co TTY): giu process song de systemd khong kill tmux ---
# Neu script thoat ngay, systemd coi service xong va KillMode=control-group se
# kill luon tmux + bot. Wait tai day de service active va tu restart khi tmux chet.
if [ ! -t 0 ]; then
    exec 9>&- 2>/dev/null || true   # nha lock /tmp/mc_bot.lock truoc khi wait
    trap 'echo "[$(date +%T)] (service mode) Nhận TERM -> thoát"; exit 0' TERM INT
    echo "[$(date +%T)] (service mode) Giữ service sống theo dõi tmux $SESSION:$BOT..."
    while window_exists; do
        sleep 5
    done
    echo "[$(date +%T)] [!] Window $BOT đã chết -> thoát để systemd restart"
    exit 1
fi
if [ -t 0 ]; then
    read -r -p "Attach tmux ngay? (Y/n): " ATTACH
    if [[ ! "$ATTACH" =~ ^[Nn]$ ]]; then
        tmux select-window -t "$SESSION:$BOT" 2>/dev/null
        tmux attach-session -t "$SESSION"
    fi
fi
