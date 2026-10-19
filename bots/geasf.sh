#!/bin/bash
# geasf.sh — vòng lặp chạy bot geasf (MinecraftClient) + tự reconnect.
# Chạy ngoài tmux sẽ tự chuyển vào window 'geasf' của session chung mc_bot
# qua bots/geasf_tmux.sh (cùng logic với 'bot start geasf').
#
# Cách dùng:
#   bash bots/geasf.sh [--force|-f|-y]   # ngoài tmux -> vào session chung
#   bash bots/geasf.sh --no-tmux         # chạy loop trực tiếp, không vào tmux
#   bash bots/geasf.sh --inside-tmux     # (nội bộ) chạy loop, đã ở trong tmux

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR" || exit 1

INSIDE=0
NO_TMUX=0
TMUX_ARGS=()
for a in "$@"; do
    case "$a" in
        --inside-tmux) INSIDE=1 ;;
        --no-tmux) NO_TMUX=1 ;;
        -h|--help|help)
            sed -n '2,10p' "$0"
            exit 0
            ;;
        --force|-f|-y) TMUX_ARGS+=("$a") ;;
        --bg) TMUX_ARGS+=("$a") ;;
        *) echo "[$(date +%T)] [!] Tham số lạ: $a (dùng --help)"; exit 1 ;;
    esac
done

# Tự động chạy trong tmux session chung (bot geasf / bash bots/geasf.sh đều vào tmux)
if [ "$INSIDE" -eq 0 ] && [ "$NO_TMUX" -eq 0 ] && [ -z "$TMUX" ]; then
    bash "$SCRIPT_DIR/geasf_tmux.sh" --bg "${TMUX_ARGS[@]}"
    exit 0
fi

ACCOUNT="geasf"
SERVER="kingmc.vn"
INI_SRC="bots/geasf.ini"
INI_TMP="/tmp/geasf_runtime.ini"
INI="$INI_TMP"
MAINT_START_MIN=$((4*60))
MAINT_END_MIN=$((5*60+20))
END_STR="05:20"
# Chống kick-loop spam: thoát nhanh liên tục 5 lần -> nghỉ dài 1 lần
FAIL_COUNT=0
LAST_EXIT_TS=0

on_exit() {
    echo ""
    echo "[$(date +%T)] [BOT geasf] Đã dừng."
    exit 0
}
trap on_exit INT TERM

mkdir -p logs 2>/dev/null

# --- Chỉ báo trạng thái web infra (không tự kill/restart gì cả) ---
report_web_infra() {
    local port=2013
    local ttyd_port=2014
    if ss -tlnp 2>/dev/null | grep -q ":$port "; then
        echo "[OK] download.py dang chay (port $port)"
    else
        echo "[!] download.py chua bat (port $port) - dung 'bot download on' de mo"
    fi
    if ss -tlnp 2>/dev/null | grep -q ":$ttyd_port "; then
        echo "[OK] ttyd dang chay (port $ttyd_port)"
    else
        echo "[!] ttyd chua bat (port $ttyd_port)"
    fi
}
report_web_infra
echo "=========================================="
echo "[$(date '+%Y-%m-%d %T')] BOT: geasf | $SERVER"
# Thông báo cho người dùng biết địa chỉ truy cập
if [ -f "$PROJECT_DIR/caddy/Caddyfile" ] && grep -qE "[a-z0-9.-]+\.ddns\.net|[a-z0-9.-]+\.duckdns\.org" "$PROJECT_DIR/caddy/Caddyfile" 2>/dev/null; then
    DOMAIN_NAME=$(grep -oE '[a-z0-9.-]+\.(ddns\.net|duckdns\.org)' "$PROJECT_DIR/caddy/Caddyfile" 2>/dev/null | head -1)
    [ -z "$DOMAIN_NAME" ] && DOMAIN_NAME="khoablabla.ddns.net"
    echo "Truy cap: https://$DOMAIN_NAME/"
    echo "Tai file: https://$DOMAIN_NAME/download"
else
    LAN_IP=$(ip -4 addr show scope global 2>/dev/null | grep -oP 'inet \K[\d.]+' | head -1); [ -z "$LAN_IP" ] && LAN_IP="127.0.0.1"
    echo "Truy cap: http://$LAN_IP:2013/"
    echo "Tai file: http://$LAN_IP:2013/download"
fi
echo "=========================================="
while true; do
    # --- Kiểm tra điều kiện chạy trước mỗi vòng (tránh loop spam khi thiếu file) ---
    if [ ! -x "./MinecraftClient" ]; then
        echo "[$(date '+%Y-%m-%d %T')] [!] Thiếu ./MinecraftClient -> đợi 60s thử lại (không spam)..."
        sleep 60
        continue
    fi
    if [ ! -f "$INI_SRC" ]; then
        echo "[$(date '+%Y-%m-%d %T')] [!] Thiếu $INI_SRC -> đợi 60s thử lại..."
        sleep 60
        continue
    fi
    CUR_H=$(date +%H); CUR_M=$(date +%M)
    CUR_TOTAL=$((10#$CUR_H * 60 + 10#$CUR_M))
    if [ "$CUR_TOTAL" -ge "$MAINT_START_MIN" ] && [ "$CUR_TOTAL" -lt "$MAINT_END_MIN" ]; then
        TARGET_SEC=$(date -d "today 05:20:00" +%s 2>/dev/null)
        if [ -z "$TARGET_SEC" ] || [ "$TARGET_SEC" -le "$(date +%s)" ]; then
            TARGET_SEC=$(date -d "tomorrow 05:20:00" +%s 2>/dev/null)
        fi
        [ -z "$TARGET_SEC" ] && TARGET_SEC=$(( $(date +%s) + (MAINT_END_MIN - CUR_TOTAL)*60 ))
        SLEEP_SEC=$((TARGET_SEC - $(date +%s)))
        [ "$SLEEP_SEC" -le 0 ] && SLEEP_SEC=30
        echo "[$(date '+%Y-%m-%d %T')] 🛠️ Bảo trì 04:00-05:20 -> ngủ ${SLEEP_SEC}s tới $END_STR..."
        while [ "$SLEEP_SEC" -gt 0 ]; do CHUNK=$(( SLEEP_SEC > 30 ? 30 : SLEEP_SEC )); sleep $CHUNK; SLEEP_SEC=$((SLEEP_SEC - CHUNK)); done
        continue
    fi
    echo "[$(date '+%Y-%m-%d %T')] ▶️  ./MinecraftClient $INI_SRC -> $INI_TMP $ACCOUNT - $SERVER"
    cp -f "$INI_SRC" "$INI_TMP" 2>/dev/null
    chmod 600 "$INI_TMP" 2>/dev/null || true
    ./MinecraftClient "$INI_TMP" "$ACCOUNT" - "$SERVER"
    EXIT_CODE=$?
    NOW_TS=$(date +%s)
    if [ $((NOW_TS - LAST_EXIT_TS)) -lt 60 ]; then
        FAIL_COUNT=$((FAIL_COUNT + 1))
    else
        FAIL_COUNT=1
    fi
    LAST_EXIT_TS=$NOW_TS
    echo "[$(date '+%Y-%m-%d %T')] ⚠️  Thoát exit $EXIT_CODE (lần nhanh thứ $FAIL_COUNT)"
    if [ "$FAIL_COUNT" -ge 5 ]; then
        echo "[$(date '+%Y-%m-%d %T')] 🛑 Thoát nhanh 5 lần liên tiếp -> nghỉ 300s tránh spam server..."
        sleep 300
        FAIL_COUNT=0
        continue
    fi
    if [ "$EXIT_CODE" -ne 0 ]; then
        if timeout 3 bash -c "cat < /dev/null > /dev/tcp/$SERVER/25565" 2>/dev/null; then
            echo "[$(date '+%Y-%m-%d %T')] ⏱️  Timeout/kick -> đợi 70s (tránh spam 60s)..."
            sleep 70
        else
            echo "[$(date '+%Y-%m-%d %T')] ⚠️  Không kết nối TCP được $SERVER:25565 -> server có thể sập, đợi 90s thử lại..."
            sleep 90
        fi
    else
        echo "[$(date '+%Y-%m-%d %T')] ⏱️  Bị kick (exit 0) -> đợi 70s..."
        sleep 70
    fi
done
