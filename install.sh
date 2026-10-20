#!/bin/bash
# ============================================================
#  BOT MCC - Installer
#  Hỏi thư mục, tạo file, thêm alias bot, tùy chọn systemctl
#  Dùng được khi copy sang máy khác: chỉ cần ./install.sh
# ============================================================
set -e

# --- Helpers ---
expand_path() {
    local p="$1"
    # xử lý ~, ., đường dẫn tương đối
    if [[ "$p" == "." ]]; then echo "$(pwd)"; return; fi
    if [[ "$p" == "~" ]]; then echo "$HOME"; return; fi
    if [[ "$p" == "~/"* ]]; then echo "${HOME}/${p:2}"; return; fi
    if [[ "$p" == "."/* ]]; then echo "$(pwd)/${p:2}"; return; fi
    if [[ "$p" != /* ]]; then echo "$(pwd)/$p"; return; fi
    echo "$p"
}

ask() {
    local prompt="$1" def="$2" ans
    if [ -n "$def" ]; then prompt="$prompt [$def]"; fi
    printf "%s: " "$prompt" >&2
    read -r ans || true
    echo "${ans:-$def}"
}

# Xu ly tham so dong lenh (bot add --script path)
SCRIPT_PRESET=""
while [[ "$1" == --* ]]; do
    case "$1" in
        --script) SCRIPT_PRESET="$2"; shift 2;;
        --help|-h) echo "Usage: $0 [--script <path>]"; exit 0;;
        *) shift;;
    esac
done

# --- 1. Hỏi vị trí thư mục ---
echo "=== BOT MCC Installer ==="
echo "Thư mục cài đặt (dùng . cho hiện tại, hỗ trợ ~, ./, /tuyệt/đối)"
echo "  Ví dụ: .  |  ~/bot  |  /home/$USER/bot  |  ./bot"
DEF_DIR="$(pwd)"
TARGET_RAW=$(ask "Nhập vị trí thư mục" ".")
TARGET_DIR=$(expand_path "$TARGET_RAW")
# chuẩn hóa (bỏ //, / cuối)
TARGET_DIR=$(realpath -m "$TARGET_DIR" 2>/dev/null || echo "$TARGET_DIR")
TARGET_DIR=${TARGET_DIR%/}
echo "[*] Sẽ cài tại: $TARGET_DIR"
mkdir -p "$TARGET_DIR"
cd "$TARGET_DIR" || { echo "[!] Không vào được $TARGET_DIR"; exit 1; }
echo "[*] Đang ở: $(pwd)"

# --- 1.5. Chon ten va server ---
echo ""
BOT_NICK_DEF="geasf"
BOT_SERVER_DEF="kingmc.vn"
# Ten goi nho (nickname) - ten file
while true; do
    BOT_NICK_INPUT=$(ask "Ten goi nho (ten file, go bot <ten>)" "$BOT_NICK_DEF")
    if [ -z "$BOT_NICK_INPUT" ]; then BOT_NICK="$BOT_NICK_DEF"; else BOT_NICK="$BOT_NICK_INPUT"; fi
    # Kiem tra list bot co ten chua
    if [ -f "bots/$BOT_NICK.sh" ] || [ -f "bots/$BOT_NICK.ini" ]; then
        echo "[!] Da co bot ten '$BOT_NICK' trong list"
        echo "    Co the: 1) ghi de 2) nhap ten goi nho khac"
        OVER=$(ask "Ghi de bot '$BOT_NICK'? (y/n, n=nhap ten khac)" "n")
        if [[ "$OVER" =~ ^[Yy]$ ]]; then
            echo "[*] Se ghi de bot '$BOT_NICK'"
            break
        else
            echo "[*] Hay nhap ten goi nho khac"
            continue
        fi
    fi
    break
done
# Ten that (ACCOUNT trong game)
BOT_ACCOUNT_DEF="$BOT_NICK"
BOT_ACCOUNT_INPUT=$(ask "Ten that (ACCOUNT trong game, de trong=dung ten goi nho)" "$BOT_ACCOUNT_DEF")
if [ -z "$BOT_ACCOUNT_INPUT" ]; then BOT_ACCOUNT="$BOT_NICK"; else BOT_ACCOUNT="$BOT_ACCOUNT_INPUT"; fi
# Kiem tra trung ACCOUNT (tim toan cuc)
for search_dir in "$HOME/geasf/bots" "$HOME/test-bo/bots" "$TARGET_DIR/bots" "./bots" "$HOME/.local/share/mcc/bots"; do
    for f in "$search_dir"/*.sh; do
        [ -e "$f" ] || continue
        b=$(basename "$f" .sh)
        [[ "$b" == *_tmux ]] && continue
        [[ "$b" == "$BOT_NICK" ]] && continue
        acc=$(grep -oP 'ACCOUNT="\K[^"]+' "$f" 2>/dev/null || echo "")
        if [ "$acc" = "$BOT_ACCOUNT" ]; then
            echo "[!] Canh bao: da co bot '$b' trung ACCOUNT='$acc' (goi nho '$b')"
            echo "    Neu dung se co 2 bot cung acc"
        fi
    done
done
BOT_SERVER_INPUT=$(ask "Server" "$BOT_SERVER_DEF")
if [ -z "$BOT_SERVER_INPUT" ]; then
    BOT_SERVER="$BOT_SERVER_DEF"
else
    BOT_SERVER="$BOT_SERVER_INPUT"
fi
# Kiem tra trung ACCOUNT+SERVER hoan toan (toan cuc)
for search_dir in "$HOME/geasf/bots" "$HOME/test-bo/bots" "$TARGET_DIR/bots" "./bots"; do
    for f in "$search_dir"/*.sh; do
        [ -e "$f" ] || continue
        b=$(basename "$f" .sh)
        [[ "$b" == *_tmux ]] && continue
        [[ "$b" == "$BOT_NICK" ]] && continue
        acc=$(grep -oP 'ACCOUNT="\K[^"]+' "$f" 2>/dev/null || echo "")
        srv=$(grep -oP 'SERVER="\K[^"]+' "$f" 2>/dev/null || echo "")
        if [ "$acc" = "$BOT_ACCOUNT" ] && [ "$srv" = "$BOT_SERVER" ]; then
            echo "[!] Canh bao: da co bot '$b' trung hoan toan ACCOUNT='$acc' SERVER='$srv' (goi nho '$b')"
            echo "    Co 1 acc bi trung - co muon ghi de khong?"
            OVER2=$(ask "Van dung '$BOT_NICK ($BOT_ACCOUNT)'? (y/n, n=nhap ten goi nho khac)" "n")
            if [[ "$OVER2" =~ ^[Yy]$ ]]; then
                echo "[*] Van dung, se tao bot trung (co the ghi de sau)"
                break
            else
                echo "[*] Hay nhap ten goi nho khac hoac thong tin khac de tranh trung"
                read -p "Nhap ten goi nho moi (de trong giu $BOT_NICK): " nn
                if [ -n "$nn" ]; then BOT_NICK="$nn"; echo "[*] Doi goi nho -> $BOT_NICK"; fi
                read -p "Nhap ten that moi (de trong giu $BOT_ACCOUNT): " na
                if [ -n "$na" ]; then BOT_ACCOUNT="$na"; echo "[*] Doi ten that -> $BOT_ACCOUNT"; fi
                read -p "Nhap server moi (de trong giu $BOT_SERVER): " ns
                if [ -n "$ns" ]; then BOT_SERVER="$ns"; echo "[*] Doi server -> $BOT_SERVER"; fi
            fi
        fi
    done
done
echo "[*] Se dung: goi nho='$BOT_NICK' thuc='$BOT_ACCOUNT' server=$BOT_SERVER"
# Tuong thich cu: BOT_NAME = BOT_NICK
BOT_NAME="$BOT_NICK"
# --- Port ---
PORT_DEF="2013"
PORT_INPUT=$(ask "Port download/web" "$PORT_DEF")
if ! [[ "$PORT_INPUT" =~ ^[0-9]+$ ]] || [ "$PORT_INPUT" -lt 1 ] || [ "$PORT_INPUT" -gt 65535 ]; then
    echo "[!] Port khong hop le (1-65535), dung $PORT_DEF"
    PORT="$PORT_DEF"
else
    PORT="$PORT_INPUT"
fi
TTYD_PORT=$((PORT+1))
echo "[*] Se dung port: $PORT (download) / $TTYD_PORT (ttyd)"
# --- Chon che do MCC ---
echo ""
echo "=== Che do chay MCC ==="
echo "  1) GUI (Web portal + Terminal + Download) - can TTYD, Caddy, TLS"
echo "  2) CLI only (chi chay bot trong tmux, khong web/ttyd) - nhe hon, chay ngay"
MCC_MODE=$(ask "Chon che do (1/2)" "1")
if [[ "$MCC_MODE" != "1" && "$MCC_MODE" != "2" ]]; then
    echo "[!] Khong hop le, mac dinh che do 1 (GUI)"
    MCC_MODE="1"
fi
if [[ "$MCC_MODE" == "2" ]]; then
    echo "[*] Che do CLI only: khong cai TTYD, khong web, chi chay bot trong tmux"
    TTYD_ENABLED="n"
    TTYD_USER=""
    TTYD_PASS=""
else
    echo "[*] Che do GUI: se hoi TTYD, web portal, download"
fi
# --- Chon ConsoleMode MCC ---
echo ""
echo "=== Console Mode MCC ==="
echo "  1) classic - Terminal chuan (bth, on dinh cho tmux/ttyd/ssh)"
echo "  2) tui     - Giao dien full-screen (minimap, tab list, chat sidebar) - can terminal tot (kitty/wezterm/foot)"
CONSOLE_MODE=$(ask "Chon ConsoleMode (1/2)" "1")
if [[ "$CONSOLE_MODE" == "2" ]]; then
    CONSOLE_MODE_VAL="tui"
    echo "[*] ConsoleMode = tui (full-screen TUI)"
else
    CONSOLE_MODE_VAL="classic"
    echo "[*] ConsoleMode = classic (terminal chuan)"
fi
# Dinh nghia BOT_INI/BOT_SCRIPT dung BOT_NICK
BOT_INI="bots/$BOT_NICK.ini"
BOT_SCRIPT="scripts/login_${BOT_NICK}.txt"

# --- 1.6. Chon file script (path den file co san) ---
echo ""
if [ -n "$SCRIPT_PRESET" ]; then
    SCRIPT_INPUT="$SCRIPT_PRESET"
    echo "[*] Dung script preset: $SCRIPT_INPUT"
else
    SCRIPT_INPUT=$(ask "Nhap path den file script (de trong = bo qua)" "")
fi
if [ -z "$SCRIPT_INPUT" ]; then
    USE_CUSTOM_SCRIPT="n"
else
    CUSTOM_SCRIPT_PATH=$(expand_path "$SCRIPT_INPUT")
    if [ -f "$CUSTOM_SCRIPT_PATH" ]; then
        echo "[*] Sẽ dùng file bạn chỉ: $CUSTOM_SCRIPT_PATH"
        USE_CUSTOM_SCRIPT="y"
        CUSTOM_SCRIPT_SRC="$CUSTOM_SCRIPT_PATH"
    else
        echo "[!] Khong thay $CUSTOM_SCRIPT_PATH"
        USE_CUSTOM_SCRIPT="n"
    fi
fi

# --- 2. Tạo cấu trúc & file ---
mkdir -p bots scripts logs
# Dùng tên đã chọn
BOT_INI="bots/$BOT_NICK.ini"
BOT_SCRIPT="scripts/login_${BOT_NICK}.txt"
echo "[*] Tạo $BOT_INI từ MinecraftClient.ini (nếu có)..."
if [ -f "$TARGET_DIR/MinecraftClient.ini" ]; then
    cp -n "$TARGET_DIR/MinecraftClient.ini" "$TARGET_DIR/$BOT_INI" 2>/dev/null || true
elif [ -f "$(dirname "$0")/MinecraftClient.ini" ]; then
    cp -n "$(dirname "$0")/MinecraftClient.ini" "$TARGET_DIR/$BOT_INI" 2>/dev/null || true
else
    # tạo ini tối thiểu nếu chưa có - ĐÚNG CONFIG đầy đủ mới vào được (copy từ file gốc hiện tại)
    # Dùng file hiện tại làm mẫu để đảm bảo đủ InventoryHandling, BrandInfo, Version...
    TEMPLATE_INI="$(dirname "$0")/bots/geasf.ini"
    if [ -f "$TEMPLATE_INI" ]; then
        cp "$TEMPLATE_INI" "$TARGET_DIR/$BOT_INI" 2>/dev/null || true
        # Thay tên/action cho bot mới
        sed -i "s/Task_Name = \"auto login geasf\"/Task_Name = \"auto login $BOT_NAME\"/" "$TARGET_DIR/$BOT_INI" 2>/dev/null || true
        sed -i "s|Action = \"script scripts/login_geasf.txt\"|Action = \"script $BOT_SCRIPT\"|" "$TARGET_DIR/$BOT_INI" 2>/dev/null || true
    else
        cat > "$TARGET_DIR/$BOT_INI" <<INI
[Main.Advanced]
ExitOnFailure = true
CacheScript = true
BrandInfo = "fabric"
MinecraftVersion = "1.21.11"
InventoryHandling = true
EntityHandling = true
[ChatBot.ScriptScheduler]
Enabled = true
[[ChatBot.ScriptScheduler.TaskList]]
Task_Name = "auto login $BOT_NAME"
Trigger_On_Login = true
Trigger_On_Times = { Enable = false, Times = [] }
Trigger_On_Interval = { Enable = false, MinTime = 1.0, MaxTime = 10.0 }
Action = "script $BOT_SCRIPT"
INI
    fi
fi
# Đảm bảo ExitOnFailure=true và scheduler đúng để tự /dn khi vào SẢNH
sed -i 's/ExitOnFailure = false/ExitOnFailure = true/' "$TARGET_DIR/$BOT_INI" 2>/dev/null || true
# Fix scheduler nếu đang tắt: bật lại và set action đúng
if grep -q "Enabled = false" "$TARGET_DIR/$BOT_INI" 2>/dev/null && grep -q "ScriptScheduler" "$TARGET_DIR/$BOT_INI" 2>/dev/null; then
    python3 <<PY 2>/dev/null || true
import re, pathlib, os
p=pathlib.Path(os.path.join("$TARGET_DIR", "$BOT_INI"))
try:
    t=p.read_text(encoding='utf-8')
    old=re.compile(r'\[ChatBot\.ScriptScheduler\].*?Action = "send /login pass"', re.S)
    new='''[ChatBot.ScriptScheduler]
Enabled = true

[[ChatBot.ScriptScheduler.TaskList]]
Task_Name = "auto login $BOT_NAME"
Trigger_On_Login = true
Trigger_On_Times = { Enable = false, Times = [] }
Trigger_On_Interval = { Enable = false, MinTime = 1.0, MaxTime = 10.0 }
Action = "script $BOT_SCRIPT"'''
    if old.search(t):
        t=old.sub(new, t)
        p.write_text(t, encoding='utf-8')
        print("fixed scheduler")
except Exception as e:
    print(e)
PY
fi
sed -i 's/MinecraftVersion = "auto"/MinecraftVersion = "1.21.11"/' "$TARGET_DIR/$BOT_INI" 2>/dev/null || true
# Set ConsoleMode theo lua chon
sed -i "s/^ConsoleMode = .*/ConsoleMode = \"$CONSOLE_MODE_VAL\"/" "$TARGET_DIR/$BOT_INI" 2>/dev/null || true
# Neu khong co ConsoleMode thi them vao [Console.General]
if ! grep -q "^ConsoleMode" "$TARGET_DIR/$BOT_INI" 2>/dev/null; then
    sed -i "/^\[Console.General\]/a ConsoleMode = \"$CONSOLE_MODE_VAL\"" "$TARGET_DIR/$BOT_INI" 2>/dev/null || true
fi
echo "[*] ConsoleMode = $CONSOLE_MODE_VAL da ghi vao $BOT_INI"

if [[ "$USE_CUSTOM_SCRIPT" == "y" ]]; then
    mkdir -p "$(dirname "$TARGET_DIR/$BOT_SCRIPT")"
    if [ "$CUSTOM_SCRIPT_SRC" != "$TARGET_DIR/$BOT_SCRIPT" ]; then
        cp -f "$CUSTOM_SCRIPT_SRC" "$TARGET_DIR/$BOT_SCRIPT" 2>/dev/null || cp "$CUSTOM_SCRIPT_SRC" "$TARGET_DIR/$BOT_SCRIPT"
        echo "[*] Đã copy script từ $CUSTOM_SCRIPT_SRC -> $BOT_SCRIPT"
    else
        echo "[*] Script đã ở đúng chỗ: $BOT_SCRIPT"
    fi
else
    # Luon hoi login - neu de trong thi giu nguyen hoac tao rong
    echo ""
    echo "=== Script login (tu dong chay khi vao server) ==="
    if [ -f "$TARGET_DIR/$BOT_SCRIPT" ]; then
        echo "File da co: $TARGET_DIR/$BOT_SCRIPT (de trong = giu nguyen)"
    else
        echo "De trong = tao file rong, tu sua sau tai $BOT_SCRIPT"
    fi
    echo "Neu ban nhap, se ghi thang vao file (vd: /login $BOT_NAME)"
    LOGIN_INPUT=$(ask "Nhap lenh login (vd: /login $BOT_NAME) hoac de trong" "")
    if [ -n "$LOGIN_INPUT" ]; then
        mkdir -p "$(dirname "$TARGET_DIR/$BOT_SCRIPT")"
        # Neu user nhap 1 dong /dn thi tao template day du, neu nhap nhieu dong thi ghi nguyen
        if [[ "$LOGIN_INPUT" == *$'\n'* ]] || [[ "$LOGIN_INPUT" == *";"* ]]; then
            echo "$LOGIN_INPUT" > "$TARGET_DIR/$BOT_SCRIPT"
        else
            cat > "$TARGET_DIR/$BOT_SCRIPT" <<TXT
send da hoat dong
wait 140
send $LOGIN_INPUT
wait 60
send $LOGIN_INPUT
wait 60
inventory 0 click 40
wait 60
inventory 1 click 24
wait 60
send /afk
wait 40
inventory 1 click 22
TXT
        fi
        echo "[*] Da tao $BOT_SCRIPT voi noi dung ban nhap: $LOGIN_INPUT"
    elif [ ! -f "$TARGET_DIR/$BOT_SCRIPT" ]; then
        mkdir -p "$(dirname "$TARGET_DIR/$BOT_SCRIPT")"
        cat > "$TARGET_DIR/$BOT_SCRIPT" <<TXT
# Hay sua file nay - them lenh login cua ban
# Vi du:
# wait 140
# send /login $BOT_NAME
# wait 60
# inventory 0 click 40
TXT
        echo "[!] Da tao $BOT_SCRIPT RONG - hay mo va sua lai truoc khi chay bot!"
    else
        echo "[*] Giu nguyen $BOT_SCRIPT"
    fi
    # Hien noi dung va hoi sua
    echo "--- Noi dung $BOT_SCRIPT ---"
    cat "$TARGET_DIR/$BOT_SCRIPT" 2>/dev/null | sed 's/^/  /'
    echo "---------------------------"
    EDIT_NOW=$(ask "Co can sua ngay? (y/n)" "n")
    if [[ "$EDIT_NOW" =~ ^[Yy]$ ]]; then
        echo "[*] Mo $TARGET_DIR/$BOT_SCRIPT de sua (Ctrl+X de thoat nano)..."
        if [ -n "${EDITOR:-}" ]; then
            $EDITOR "$TARGET_DIR/$BOT_SCRIPT" < /dev/tty > /dev/tty 2> /dev/tty || nano "$TARGET_DIR/$BOT_SCRIPT" < /dev/tty > /dev/tty 2> /dev/tty || vi "$TARGET_DIR/$BOT_SCRIPT" < /dev/tty > /dev/tty 2> /dev/tty || echo "[!] Hay mo $TARGET_DIR/$BOT_SCRIPT de sua thu cong: nano $TARGET_DIR/$BOT_SCRIPT"
        else
            nano "$TARGET_DIR/$BOT_SCRIPT" < /dev/tty > /dev/tty 2> /dev/tty || vi "$TARGET_DIR/$BOT_SCRIPT" < /dev/tty > /dev/tty 2> /dev/tty || echo "[!] Hay mo $TARGET_DIR/$BOT_SCRIPT de sua thu cong: nano $TARGET_DIR/$BOT_SCRIPT"
        fi
    fi
fi
# Hien them lenh da nhap neu co
if [ -n "${LOGIN_INPUT:-}" ]; then
    echo "[*] Lenh login da dung: $LOGIN_INPUT"
fi

# bots/$BOT_NAME.sh - bản chuẩn đã fix tmux + ttyd nền + 1.21.11
BOT_SH="bots/$BOT_NAME.sh"
cat > "$TARGET_DIR/$BOT_SH" <<'EOSH_TMP'
#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR" || exit 1
# Tự động chạy trong tmux cho nhanh (bot __BOT_NAME__ / bash __BOT_SH__ đều vào tmux)
if [ -z "$TMUX" ] && [[ "$1" != "--inside-tmux" && "$1" != "--no-tmux" ]]; then
    bash "$SCRIPT_DIR/__BOT_NAME___tmux.sh" --bg "$@"
    exit 0
fi
if [[ "$1" == "--inside-tmux" ]]; then
    shift
fi
ACCOUNT="__BOT_ACCOUNT__"
SERVER="__BOT_SERVER__"
INI_SRC="bots/__BOT_NAME__.ini"
INI_TMP="/tmp/__BOT_NAME___runtime.ini"
INI="$INI_TMP"
EOSH_TMP
# Thay placeholder bằng giá trị thực đã chọn
sed -i "s/__BOT_NAME__/$BOT_NICK/g; s/__BOT_ACCOUNT__/$BOT_ACCOUNT/g; s/__BOT_SERVER__/$BOT_SERVER/g; s|__BOT_SH__|$BOT_SH|g" "$TARGET_DIR/$BOT_SH"
# Thêm phần còn lại (dùng placeholder để thay tên/server đã chọn)
cat >> "$TARGET_DIR/$BOT_SH" <<'EOSH2_TMP'
MAINT_START_MIN=$((4*60))
MAINT_END_MIN=$((5*60+20))
END_STR="05:20"
trap 'echo ""; echo "[$(date +%T)] [BOT __BOT_NAME__] Đã dừng."; exit 0' INT TERM
mkdir -p logs 2>/dev/null
clear
echo "=========================================="
echo "[$(date '+%Y-%m-%d %T')] BOT: __BOT_NAME__ | __BOT_SERVER__"
echo "=========================================="
EOSH2_TMP
# Thay placeholder lần 2
sed -i "s/__BOT_NAME__/$BOT_NICK/g; s/__BOT_ACCOUNT__/$BOT_ACCOUNT/g; s/__BOT_SERVER__/$BOT_SERVER/g" "$TARGET_DIR/$BOT_SH"
cat >> "$TARGET_DIR/$BOT_SH" <<'EOSH2'
while true; do
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
    chmod 644 "$INI_TMP" 2>/dev/null || true
    ./MinecraftClient "$INI_TMP" "$ACCOUNT" - "$SERVER"
    EXIT_CODE=$?
    echo "[$(date '+%Y-%m-%d %T')] ⚠️  Thoát exit $EXIT_CODE"
    if [ "$EXIT_CODE" -ne 0 ]; then
        if timeout 3 bash -c "cat < /dev/null > /dev/tcp/kingmc.vn/25565" 2>/dev/null; then
            echo "[$(date '+%Y-%m-%d %T')] ⏱️  Timeout/kick -> đợi 70s (tránh spam 60s)..."
            sleep 70
        else
            echo "[$(date '+%Y-%m-%d %T')] ⚠️  Không kết nối TCP được kingmc.vn:25565 -> server có thể sập, đợi 90s thử lại..."
            sleep 90
        fi
    else
        echo "[$(date '+%Y-%m-%d %T')] ⏱️  Bị kick (exit 0) -> đợi 70s..."
        sleep 70
    fi
done
EOSH2
chmod +x "$TARGET_DIR/$BOT_SH"
echo "[*] Tạo $BOT_SH"

# bots/${BOT_NAME}_tmux.sh - tmux 2013 + ttyd 2014 + download proxy
BOT_TMUX_SH="bots/${BOT_NAME}_tmux.sh"
# Copy download.py mau neu co (chi phuc vu download, khong proxy)
if [ -f "$(dirname "$0")/download.py" ]; then
    cp -n "$(dirname "$0")/download.py" "$TARGET_DIR/download.py" 2>/dev/null || true
fi
chmod +x "$TARGET_DIR/download.py" 2>/dev/null || true
# Dat PORT cho download.py (lite: chay truc tiep 0.0.0.0, ko hoi bao ve nang cao)
if [ -f "$TARGET_DIR/download.py" ]; then
    sed -i "s/^PORT = .*/PORT = $PORT/" "$TARGET_DIR/download.py" 2>/dev/null || true
    echo "Da dat cong $PORT (0.0.0.0:$PORT)"
fi
# Hoi TTYD web terminal
echo ""
echo "=== TTYD web terminal (xem bot tu xa) ==="
NEED_TTYD=$(ask "Muon dung TTYD? (y/n)" "n")
TTYD_USER=""; TTYD_PASS=""; TTYD_ENABLED="n"
if [[ "$NEED_TTYD" =~ ^[Yy]$ ]]; then
    TTYD_ENABLED="y"
    # Kiem tra ttyd da cai chua va distro
    if command -v ttyd >/dev/null 2>&1; then
        echo "[*] ttyd da co: $(ttyd --version 2>&1 | head -1)"
    else
        echo "[!] ttyd chua co"
        DISTRO="unknown"
        if [ -f /etc/os-release ]; then . /etc/os-release; DISTRO=${ID:-unknown}; fi
        case "$DISTRO" in
            ubuntu|debian) INSTALL_CMD="sudo apt update && sudo apt install -y ttyd" ;;
            arch|manjaro) INSTALL_CMD="sudo pacman -S --noconfirm ttyd" ;;
            fedora) INSTALL_CMD="sudo dnf install -y ttyd" ;;
            opensuse*) INSTALL_CMD="sudo zypper install -y ttyd" ;;
            *) INSTALL_CMD="https://github.com/tsl0922/ttyd/releases" ;;
        esac
        echo "[*] Distro: $DISTRO"
        echo "    Lenh cai dat goi y: $INSTALL_CMD"
        AUTO_INSTALL=$(ask "Co tu dong cai dat ttyd khong? (y/n)" "n")
        if [[ "$AUTO_INSTALL" =~ ^[Yy]$ ]]; then
            echo "[*] Dang chay (can root): $INSTALL_CMD"
            if [[ "$INSTALL_CMD" == http* ]]; then
                echo "[!] Hay cai thu cong tu $INSTALL_CMD"
            else
                if sudo sh -c "$INSTALL_CMD"; then
                    echo "[*] Cai ttyd xong"
                else
                    echo "[!] Cai that bai, hay cai thu cong: $INSTALL_CMD"
                    echo "[!] Code co ttyd, phai cai neu muon web"
                fi
            fi
        else
            echo "[!] Bo qua, nho cai sau: $INSTALL_CMD"
            echo "[!] Code co ttyd, phai cai neu muon web"
        fi
    fi
    NEED_AUTH=$(ask "Co can buoc bao mat (user/pass) cho ttyd? (y/n)" "y")
    if [[ "$NEED_AUTH" =~ ^[Yy]$ ]]; then
        TTYD_USER=$(ask "User ttyd" "")
        TTYD_PASS=$(ask "Pass ttyd" "")
        if [ -z "$TTYD_USER" ] || [ -z "$TTYD_PASS" ]; then
            echo "[!] Thieu user/pass -> se chay khong bao mat"
            TTYD_USER=""; TTYD_PASS=""
        fi
    else
        echo "[*] Se chay ttyd khong bao mat (chi nen dung LAN)"
        TTYD_USER=""; TTYD_PASS=""
    fi
fi
USE_TTYD="$TTYD_ENABLED"
MCC_MODE_TMUX="$MCC_MODE"
cat > "$TARGET_DIR/$BOT_TMUX_SH" <<EOSH
#!/bin/bash
SHARED_SESSION="mc_bot"       # session CHUNG duy nhat cho moi bot
SESSION="mc_bot"
BOT="$BOT_NAME"
LEGACY_SESSION="mc_$BOT_NAME"   # session rieng kieu cu — tu migrate sang mc_bot
PORT=$PORT
PROJECT_DIR="$TARGET_DIR"
TTYD_ENABLED="$TTYD_ENABLED"
TTYD_USER="$TTYD_USER"
TTYD_PASS="$TTYD_PASS"
TTYD_PORT=$TTYD_PORT
MCC_MODE="$MCC_MODE_TMUX"
BG_MODE=0
FORCE=0
LOCK_FILE="/tmp/mc_bot.lock"
while [[ "\$#" -gt 0 ]]; do
    case "\$1" in
        --bg) BG_MODE=1; shift ;;
        --force|-f|-y) FORCE=1; shift ;;
        -h|--help|help) echo "Dung: $(basename \$0) [--bg] [--force|-f|-y]"; exit 0 ;;
        --inside-tmux) shift ;;
        *) echo "[$(date +%T)] [!] Tham so la: \$1"; exit 1 ;;
    esac
done

# --- Chong 2 tien trinh tao session cung luc (nguyen nhan gay 2 session) ---
exec 9>"\$LOCK_FILE"
if command -v flock >/dev/null 2>&1; then
    flock -w 15 9 || { echo "[$(date +%T)] [!] Khong lay duoc lock \$LOCK_FILE"; exit 1; }
fi

# --- Migrate session rieng kieu cu sang session chung ---
if tmux has-session -t "\$LEGACY_SESSION" 2>/dev/null; then
    if tmux has-session -t "\$SHARED_SESSION" 2>/dev/null; then
        echo "[$(date +%T)] [!] Session cu \$LEGACY_SESSION con sot trong khi \$SHARED_SESSION da co -> kill session cu"
        tmux kill-session -t "\$LEGACY_SESSION" 2>/dev/null
    else
        echo "[$(date +%T)] [*] Doi ten session cu \$LEGACY_SESSION -> \$SHARED_SESSION (giu bot dang chay)"
        tmux rename-session -t "\$LEGACY_SESSION" "\$SHARED_SESSION" 2>/dev/null
    fi
fi
SESSION="\$SHARED_SESSION"

window_exists() {
    tmux list-windows -t "\$SESSION" -F '#{window_name}' 2>/dev/null | grep -qx "$BOT_NAME"
}

create_tmux() {
    echo "[$(date +%T)] Tao window $BOT_NAME trong \$SESSION..."
    if tmux has-session -t "\$SESSION" 2>/dev/null; then
        tmux new-window -t "\$SESSION" -n "$BOT_NAME" "bash \$PROJECT_DIR/bots/$BOT_NAME.sh --inside-tmux" \
            || { echo "[$(date +%T)] [!] Khong tao duoc window $BOT_NAME"; return 1; }
    else
        tmux new-session -d -s "\$SESSION" -n "$BOT_NAME" "bash \$PROJECT_DIR/bots/$BOT_NAME.sh --inside-tmux" \
            || { echo "[$(date +%T)] [!] Khong tao duoc session \$SESSION"; return 1; }
    fi
    tmux set-option -t "\$SESSION" allow-rename off 2>/dev/null
    sleep 1
    echo "[$(date +%T)] ✓ Bot $BOT_NAME dang chay trong \$SESSION:$BOT_NAME"
}

if window_exists; then
    echo "[$(date +%T)] ⚠️  Bot $BOT_NAME da chay trong \$SESSION."
    if [[ "\$FORCE" -eq 1 || "\$1" == "--force" || "\$1" == "-y" || "\$1" == "-f" ]]; then
        ANS="y"
        echo "[$(date +%T)] --force -> kill window cu, tao lai"
    elif [ -t 0 ]; then
        read -p "Kill window $BOT_NAME va chay lai? (y/N): " ANS
    else
        echo "[$(date +%T)] Non-interactive -> giu window cu"
        ANS="n"
    fi
    if [[ "\$ANS" =~ ^[Yy]\$ ]]; then
        tmux kill-window -t "\$SESSION:$BOT_NAME" 2>/dev/null
        sleep 1
        create_tmux
    else
        echo "[$(date +%T)] Giu window cu."
    fi
else
    create_tmux
fi

echo "[$(date +%T)] Session chung \$SESSION hien co:"
tmux list-windows -t "\$SESSION" -F '  - #{window_name} (#{pane_current_command})' 2>/dev/null || echo "  (khong co)"

# Neu che do CLI only -> khong chay download/ttyd
if [ "\$MCC_MODE" = "2" ]; then
    echo "[\$(date +%T)] Che do CLI only: khong chay download/ttyd"
    if [ "\$BG_MODE" -eq 1 ]; then
        echo "[\$(date +%T)] (bg mode) Bot nen: tmux attach -t \$SESSION"
        exit 0
    fi
    if [ -t 0 ]; then
        read -p "Attach tmux ngay? (Y/n): " ATTACH
        if [[ ! "\$ATTACH" =~ ^[Nn]\$ ]]; then
            tmux attach-session -t "\$SESSION"
        fi
    fi
    exit 0
fi

# --- Download+Proxy (lite: 0.0.0.0 truc tiep) ---
BIND_ENV="BIND_HOST=0.0.0.0"
LAN_IP=\$(ip -4 addr show scope global 2>/dev/null | grep -oP 'inet \K[\d.]+' | head -1); [ -z "\$LAN_IP" ] && LAN_IP="127.0.0.1"
if ss -tlnp 2>/dev/null | grep -q ":\$PORT "; then
    echo "[\$(date +%T)] ✓ Web dang chay: http://\$LAN_IP:\$PORT/"
else
    nohup env \$BIND_ENV python3 "\$PROJECT_DIR/download.py" >/tmp/download-\${PORT}.log 2>&1 &
    sleep 1
    echo "[\$(date +%T)] ✓ Web dang chay: http://\$LAN_IP:\$PORT/"
fi
if [ -f "\$PROJECT_DIR/.download_on" ]; then
    echo "[\$(date +%T)] Tai file: http://\$LAN_IP:\$PORT/download"
else
    echo "[\$(date +%T)] Tai file: tat (dung 'bot download on' de mo)"
fi
# --- TTYD (chay ngam) ---
if [ "\$TTYD_ENABLED" = "y" ]; then
    if [ -n "\$TTYD_USER" ] && [ -n "\$TTYD_PASS" ]; then
        if ! ss -tlnp 2>/dev/null | grep -q ":\$TTYD_PORT "; then
            nohup ttyd -i 127.0.0.1 -p "\$TTYD_PORT" -c "\$TTYD_USER:\$TTYD_PASS" -t fontSize=15 -W bash -c "while true; do tmux attach-session -t \$SESSION 2>/dev/null || (clear; echo '=== CHỜ BOT ==='; sleep 2); done" >/tmp/ttyd-\${TTYD_PORT}.log 2>&1 &
        fi
    else
        if ! ss -tlnp 2>/dev/null | grep -q ":\$TTYD_PORT "; then
            nohup ttyd -i 127.0.0.1 -p "\$TTYD_PORT" -t fontSize=15 -W bash -c "while true; do tmux attach-session -t \$SESSION 2>/dev/null || (clear; echo '=== CHỜ BOT ==='; sleep 2); done" >/tmp/ttyd-\${TTYD_PORT}.log 2>&1 &
        fi
    fi
    if [ "\$BG_MODE" -eq 1 ]; then
        echo "[\$(date +%T)] (bg mode) Bot nen: tmux attach -t \$SESSION"
        exit 0
    fi
    if [ -t 0 ]; then
        read -p "Attach tmux ngay? (Y/n): " ATTACH
        if [[ ! "\$ATTACH" =~ ^[Nn]\$ ]]; then
            tmux attach-session -t "\$SESSION"
        fi
    fi
else
    echo "[\$(date +%T)] TTYD không dùng (để trống user/pass). Bot chạy trong tmux: tmux attach -t \$SESSION"
    echo "[\$(date +%T)] Download: http://\$LAN_IP:\$PORT/download"
    if [ "\$BG_MODE" -eq 1 ]; then
        exit 0
    fi
    if [ -t 0 ]; then
        read -p "Attach tmux ngay? (Y/n): " ATTACH
        if [[ ! "\$ATTACH" =~ ^[Nn]\$ ]]; then
            tmux attach-session -t "\$SESSION"
        fi
    fi
fi
EOSH
chmod +x "$TARGET_DIR/$BOT_TMUX_SH"
echo "[*] Tạo $BOT_TMUX_SH (tmux 127.0.0.1:2013)"

# Đảm bảo MinecraftClient tồn tại - có thể tải từ web, chỉ cài đặt không chạy bot
if [ ! -f "$TARGET_DIR/MinecraftClient" ]; then
    if [ -f "$(dirname "$0")/MinecraftClient" ]; then
        cp -n "$(dirname "$0")/MinecraftClient" "$TARGET_DIR/MinecraftClient" 2>/dev/null || true
        chmod +x "$TARGET_DIR/MinecraftClient" 2>/dev/null || true
        echo "[*] Copy MinecraftClient từ chỗ cài gốc"
    else
        echo "[*] MinecraftClient chưa có, đang tải từ GitHub (MCCTeam)..."
        # Tự nhận diện arch
        ARCH=$(uname -m)
        case "$ARCH" in
            x86_64) ASSET_KEY="linux-x64" ;;
            aarch64|arm64) ASSET_KEY="linux-arm64" ;;
            armv7l|arm) ASSET_KEY="linux-arm" ;;
            *) ASSET_KEY="linux-x64" ;;
        esac
        MCC_URL=""
        if command -v curl >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
            MCC_URL=$(curl -s https://api.github.com/repos/MCCTeam/Minecraft-Console-Client/releases/latest 2>/dev/null | jq -r ".assets[] | select(.name | contains(\"$ASSET_KEY\")) | .browser_download_url" 2>/dev/null | head -1)
        fi
        # fallback nếu không lấy được qua API
        if [ -z "$MCC_URL" ] || [ "$MCC_URL" = "null" ]; then
            MCC_URL="https://github.com/MCCTeam/Minecraft-Console-Client/releases/latest/download/MinecraftClient"
        fi
        echo "    URL: $MCC_URL"
        if command -v curl >/dev/null 2>&1; then
            curl -L -o "$TARGET_DIR/MinecraftClient" "$MCC_URL" 2>&1 | tail -5
        elif command -v wget >/dev/null 2>&1; then
            wget -O "$TARGET_DIR/MinecraftClient" "$MCC_URL" 2>&1 | tail -5
        else
            echo "[!] Không có curl/wget, vui lòng tải thủ công:"
            echo "    $MCC_URL -> $TARGET_DIR/MinecraftClient"
        fi
        if [ -f "$TARGET_DIR/MinecraftClient" ]; then
            chmod +x "$TARGET_DIR/MinecraftClient" 2>/dev/null || true
            echo "[*] Đã tải MinecraftClient ($ASSET_KEY)"
        else
            echo "[!] Tải thất bại, bạn có thể tải thủ công từ https://github.com/MCCTeam/Minecraft-Console-Client/releases"
        fi
    fi
else
    echo "[*] MinecraftClient đã có sẵn, bỏ qua tải"
fi


echo "[*] Xong tạo file tại $TARGET_DIR"
ls -lh "$TARGET_DIR/bots/" | sed 's/^/  /'

# --- 3. Cai lenh bot (help/list/add/remove) ---
echo ""
echo "=== Lenh bot ==="
echo "Tao lenh 'bot' de quan ly bot (help/list/add/remove/run)"
NEED_ALIAS=$(ask "Them lenh bot? (y/n)" "y")
if [[ "$NEED_ALIAS" =~ ^[Yy]$ ]]; then
    BOTS_COUNT=$(for f in "$TARGET_DIR/bots/"*.sh; do [ -e "$f" ] || continue; b=$(basename "$f"); case "$b" in *_tmux.sh|test_*) continue;; *) echo "$b";; esac; done | wc -l)
    echo "[*] Tim thay $BOTS_COUNT bot(s) trong bots/ (bo _tmux, test_)"
    mkdir -p "$HOME/.local/bin" 2>/dev/null
    BOT_BIN="$HOME/.local/bin/bot"
    CLI_SRC="$(dirname "$0")/bin/bot"
    if [ -f "$CLI_SRC" ]; then
        # Ưu tiên CLI dài 'bin/bot' trong repo (bản v2, có registry + attach...) — GHI ĐÈ
        cp -f "$CLI_SRC" "$BOT_BIN" && chmod +x "$BOT_BIN"
        echo "[*] Ghi de CLI tai $BOT_BIN ($CLI_SRC, ban day du)"
    else
        # Khong co bin/bot thi sinh CLI don gian
cat > "$BOT_BIN" <<EOSH
#!/bin/bash
# BOT CLI - sinh boi install.sh - ho tro info/status/list/help/add/remove/kill/start/download
BOT_DIR="$TARGET_DIR/bots"
PROJECT_DIR="$TARGET_DIR"
DOWNLOAD_PORT=$PORT
TTYD_PORT=$TTYD_PORT
# Colors - git style do den trang
RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[0;33m'
BLUE='\\033[0;34m'
MAGENTA='\\033[0;35m'
CYAN='\\033[0;36m'
WHITE='\\033[0;37m'
BOLD='\\033[1m'
DIM='\\033[2m'
RESET='\\033[0m'
_bot_list() {
    local found=0
    for f in "\$BOT_DIR"/*.sh; do [ -e "\$f" ] || continue; b=\$(basename "\$f"); case "\$b" in *_tmux.sh|test_*) continue;; *) echo "\${b%.sh}"; found=1;; esac; done
    if [ "\$found" -eq 0 ]; then
        for alt in "\$HOME/geasf/bots" "./bots" "\$PROJECT_DIR/bots"; do
            [ "\$alt" = "\$BOT_DIR" ] && continue
            for f in "\$alt"/*.sh; do [ -e "\$f" ] || continue; b=\$(basename "\$f"); case "\$b" in *_tmux.sh|test_*) continue;; *) echo "\${b%.sh}"; found=1;; esac; done
            [ "\$found" -eq 1 ] && break
        done
    fi
}
_check_exists() {
    local n="\$1"
    [ -f "$BOT_DIR/\$n.sh" ] || [ -f "$BOT_DIR/\$n.ini" ] && return 0
    for alt in "\$HOME/geasf/bots" "./bots" "\$PROJECT_DIR/bots" "\$HOME/test-bo/bots"; do
        [ "\$alt" = "\$BOT_DIR" ] && continue
        [ -f "\$alt/\$n.sh" ] || [ -f "\$alt/\$n.ini" ] && return 0
    done
    return 1
}
_get_bot_dir() {
    # Tim dir thuc su chua bot (de ho tro nhieu noi cai)
    local n="\$1"
    if [ -f "\$BOT_DIR/\$n.sh" ]; then echo "\$BOT_DIR"; return 0; fi
    for alt in "\$HOME/geasf/bots" "./bots" "\$PROJECT_DIR/bots"; do
        if [ -f "\$alt/\$n.sh" ]; then echo "\$alt"; return 0; fi
    done
    echo "\$BOT_DIR"
}
_run_bot() {
    local name="\$1"
    local bdir=\$(_get_bot_dir "\$name")
    local tmux_script="\$bdir/\${name}_tmux.sh"
    local direct="\$bdir/\${name}.sh"
    if [ -f "\$tmux_script" ]; then
        bash "\$tmux_script" --bg
    elif [ -f "\$direct" ]; then
        bash "\$direct"
    else
        echo "Khong thay bot '\$name'"
        return 1
    fi
}
_bot_status_line() {
    local name="\$1"
    local bdir=\$(_get_bot_dir "\$name")
    local session="mc_\$name"
    local running="off"
    local pid="-"
    if tmux has-session -t "\$session" 2>/dev/null; then
        running="on"
        pid=\$(tmux list-panes -t "\$session" -F "#{pane_pid}" 2>/dev/null | head -1)
        [ -z "\$pid" ] && pid="?"
    fi
    local ini="\$bdir/\$name.ini"
    local script="\$PROJECT_DIR/scripts/login_\$name.txt"
    [ -f "\$ini" ] || ini="-"
    [ -f "\$script" ] || script="-"
    printf "%-12s %-6s %-8s %-30s\n" "\$name" "\$running" "\$pid" "\$bdir/\$name.sh"
}
bot_help() {
    cat <<HELP
bot - Quan ly MCC Bot
Usage: bot [lenh] [ten|all] [path]

Lenh:
  help, -h, --help          Hien tro giup nay
  list, ls                  Liet ke bot va duong dan
  info [bot|all]            Thong tin bot (neu khong doi so: all)
  status [bot|all]          Trang thai bot (running/pid/download/ttyd) - bang dep
  add [path]                Them bot moi; khong path = hoi kieu (1 cai moi / 2 ghi path co san)
  remove <bot|all>, rm      Xoa bot
  kill <bot|all>            Kill tmux session bot
  start <bot|all>           Chay bot
  download [on|off|status]  Bat/tat web download (mac dinh off, chi tmux/ttyd)
  edit [bot|all]            Sua config (path/ini/script/acc/...)

Vi du:
  bot                       # tu dong chay neu 1 bot, list neu nhieu
  bot info                  # info all
  bot info geasf
  bot status all
  bot list
  bot add
  bot add ./my_login.txt
  bot start geasf
  bot kill all
  bot remove geasf
  bot download on
  bot download off
HELP
}
case "\$1" in
    help|-h|--help)
        bot_help
        ;;
    list|ls)
        echo "Bot trong \$BOT_DIR (va \$HOME/geasf/bots):"
        printf "%-12s %-20s %-30s %-10s\n" "TEN GOI NHO" "TEN THAT" "PATH" "TRANG THAI"
        printf "%-12s %-20s %-30s %-10s\n" "-----------" "--------" "----" "----------"
        for b in \$(_bot_list); do
            bdir=\$(_get_bot_dir "\$b")
            acc=\$(grep -oP 'ACCOUNT="\\K[^"]+' "\$bdir/\$b.sh" 2>/dev/null || echo "\$b")
            if tmux has-session -t "mc_\$b" 2>/dev/null; then st="on"; else st="off"; fi
            printf "%-12s %-20s %-30s %-10s\n" "\$b" "\$acc" "\$bdir/\$b.sh" "\$st"
        done
        [ -z "\$(_bot_list)" ] && echo "  (khong co bot nao - dung 'bot add' de them)"
        ;;
    info)
        target="\$2"
        if [ -z "\$target" ] || [ "\$target" = "all" ]; then
            echo "=== Info all ==="
            for b in \$(_bot_list); do
                bdir=\$(_get_bot_dir "\$b")
                acc=\$(grep -oP 'ACCOUNT="\K[^"]+' "\$bdir/\$b.sh" 2>/dev/null || echo "\$b"); srv=\$(grep -oP 'SERVER="\K[^"]+' "\$bdir/\$b.sh" 2>/dev/null || echo "?")
                echo "--- \$b (\$acc) @ \$srv ---"
                echo "  Ten goi nho: \$b"
                echo "  Ten that (ACCOUNT): \$acc"
                echo "  Server: \$srv"
                echo "  Path: \$bdir/\$b.sh"
                echo "  INI: \$bdir/\$b.ini"
                echo "  Script: \$PROJECT_DIR/scripts/login_\$b.txt"
                [ -f "\$bdir/\$b.sh" ] && grep -E "ACCOUNT|SERVER" "\$bdir/\$b.sh" 2>/dev/null | sed 's/^/  /' || echo "  (khong doc duoc)"
                cat "\$PROJECT_DIR/scripts/login_\$b.txt" 2>/dev/null | sed 's/^/  script: /' | head -5
            done
            [ -z "\$(_bot_list)" ] && echo "(khong co bot)"
        else
            b="\$target"
            if ! _check_exists "\$b"; then echo "[!] Khong thay bot '\$b'"; _bot_list | sed 's/^/  - /'; exit 1; fi
            bdir=\$(_get_bot_dir "\$b")
            acc=\$(grep -oP 'ACCOUNT="\K[^"]+' "\$bdir/\$b.sh" 2>/dev/null || echo "\$b")
            srv=\$(grep -oP 'SERVER="\K[^"]+' "\$bdir/\$b.sh" 2>/dev/null || echo "?")
            echo "=== Info \$b (\$acc) ==="
            echo "Ten goi nho: \$b"
            echo "Ten that: \$acc"
            echo "Server: \$srv"
            echo "Path: \$bdir/\$b.sh"
            echo "INI: \$bdir/\$b.ini"
            echo "Script: \$PROJECT_DIR/scripts/login_\$b.txt"
            echo "--- ini ---"
            cat "\$bdir/\$b.ini" 2>/dev/null | head -20 | sed 's/^/  /'
            echo "--- script ---"
            cat "\$PROJECT_DIR/scripts/login_\$b.txt" 2>/dev/null | sed 's/^/  /'
        fi
        ;;
    status)
        target="\$2"
        if [ -z "\$target" ] || [ "\$target" = "all" ]; then
            printf "%-12s %-6s %-8s %-30s %-12s %-12s %-10s\n" "TEN" "RUN" "PID" "PATH" "DOWNLOAD" "TTYD" "SESSION"
            printf "%-12s %-6s %-8s %-30s %-12s %-12s %-10s\n" "---" "---" "---" "----" "--------" "----" "-------"
            for b in \$(_bot_list); do
                bdir=\$(_get_bot_dir "\$b")
                session="mc_\$b"
                sess_type="rieng"
                if tmux has-session -t "mc_bot" 2>/dev/null && tmux list-windows -t mc_bot -F "#{window_name}" 2>/dev/null | grep -q "^\$b\$"; then
                    session="mc_bot"
                    sess_type="chung"
                fi
                if tmux has-session -t "\$session" 2>/dev/null; then run="on"; pid=\$(tmux list-panes -t "\$session" -F "#{pane_pid}" 2>/dev/null | head -1); else run="off"; pid="-"; fi
                if ss -tlnp 2>/dev/null | grep -q ":\$DOWNLOAD_PORT "; then dl="on"; else dl="off"; fi
                if ss -tlnp 2>/dev/null | grep -q ":\$TTYD_PORT "; then td="on"; else td="off"; fi
                printf "%-12s %-6s %-8s %-30s %-12s %-12s %-10s\n" "\$b" "\$run" "\$pid" "\$bdir/\$b.sh" "\$dl" "\$td" "\$sess_type"
            done
            [ -z "\$(_bot_list)" ] && echo "(khong co bot)"
            echo "--- download :\$DOWNLOAD_PORT ---"
            ss -tlnp 2>&1 | grep ":\$DOWNLOAD_PORT" | sed 's/^/  /' || echo "  (chua chay - dung 'bot download on')"
            echo "--- ttyd :\$TTYD_PORT ---"
            ss -tlnp 2>&1 | grep ":\$TTYD_PORT" | sed 's/^/  /' || echo "  (chua chay)"
            if tmux has-session -t mc_bot 2>/dev/null; then
                echo "--- session chung (mc_bot) ---"
                tmux list-windows -t mc_bot -F "  #{window_name} #{pane_current_command}" 2>/dev/null | sed 's/^/  /'
            fi
        else
            b="\$target"
            if ! _check_exists "\$b"; then echo "[!] Khong thay bot '\$b'"; exit 1; fi
            _bot_status_line "\$b"
            echo "--- tmux ---"
            tmux ls 2>&1 | grep "mc_\$b" | sed 's/^/  /' || echo "  (off)"
            echo "--- ini ---"
            bdir=\$(_get_bot_dir "\$b"); cat "\$bdir/\$b.ini" 2>/dev/null | head -10 | sed 's/^/  /'
        fi
        ;;
    add)
        echo "=== Them bot ==="
        echo "  1) Cai dat moi hoan chinh (chay install.sh: hoi ten/acc/server/script...)"
        echo "  2) Bot co san - chi ghi path (file <ten>.sh hoac thu muc chua no), sau do chay bth"
        read -p "Chon 1/2 (Enter=1): " ADDMODE
        if [ -z "\$ADDMODE" ] && [ ! -t 0 ]; then
            echo "Dung: bot add <file.sh|thu_muc> (bot add khong doi so can terminal tuong tac)"
            exit 1
        fi
        if [ "\$ADDMODE" != "2" ]; then
            bash "\$PROJECT_DIR/install.sh"
            exit \$?
        fi
        if [ -z "\$2" ]; then read -r -p "Path toi bot: " ADDSRC; else ADDSRC="\$2"; fi
        ADDSRC="\${ADDSRC/#\\~/$HOME}"
        # .txt = file script login -> tao bot moi qua installer --script
        case "\$ADDSRC" in
            *.txt)
                [ -f "\$ADDSRC" ] || { echo "[!] Khong thay file '\$ADDSRC'"; exit 1; }
                bash "\$PROJECT_DIR/install.sh" --script "\$ADDSRC"
                exit \$?
                ;;
        esac
        ADDSRC="\$(readlink -f "\$ADDSRC" 2>/dev/null || printf '%s' "\$ADDSRC")"
        if [ -d "\$ADDSRC" ]; then
            cnt=0
            for f in "\$ADDSRC"/*.sh; do
                [ -e "\$f" ] || continue
                case "\$(basename "\$f" .sh)" in *_tmux|*_backup|*_old|test_*) continue;; esac
                ADDFILE="\$f"; cnt=\$((cnt+1))
            done
            [ "\$cnt" -eq 1 ] || { echo "[!] '\$ADDSRC' phai chua dung 1 file <ten>.sh (thay \$cnt)"; exit 1; }
        else
            ADDFILE="\$ADDSRC"
        fi
        if [ ! -f "\$ADDFILE" ]; then echo "[!] Khong thay file '\$ADDFILE'"; exit 1; fi
        ADDDIR="\$(dirname "\$ADDFILE")"
        ADDNAME="\$(basename "\$ADDFILE" .sh)"
        case "\$ADDNAME" in *_tmux|*_backup|*_old|test_*) echo "[!] Ten khong hop le: \$ADDNAME"; exit 1;; esac
        # import file cua bot (khong ghi de file da co, backup la .imported.bak)
        echo "[*] Import bot '\$ADDNAME' tu \$ADDIR -> \$PROJECT_DIR"
        for f in "\$ADDIR/\$ADDNAME.sh" "\$ADDIR/\${ADDNAME}_tmux.sh" "\$ADDIR/\$ADDNAME.ini"; do
            [ -f "\$f" ] || continue
            dest="\$PROJECT_DIR/bots/\$(basename "\$f")"
            if [ -e "\$dest" ]; then
                cp -f "\$dest" "\$dest.imported.bak" 2>/dev/null
                cp -f "\$f" "\$dest"
            else
                cp -f "\$f" "\$dest"
            fi
            chmod +x "\$dest" 2>/dev/null || true
            echo "    \$(basename "\$f")"
        done
        for src_login in "\$ADDIR/scripts/login_\$ADDNAME.txt" "\$ADDIR/../scripts/login_\$ADDNAME.txt" "\$ADDIR/login_\$ADDNAME.txt"; do
            [ -f "\$src_login" ] || continue
            mkdir -p "\$PROJECT_DIR/scripts"
            if [ -e "\$PROJECT_DIR/scripts/login_\$ADDNAME.txt" ]; then
                cp -f "\$PROJECT_DIR/scripts/login_\$ADDNAME.txt" "\$PROJECT_DIR/scripts/login_\$ADDNAME.txt.imported.bak"
            fi
            cp -f "\$src_login" "\$PROJECT_DIR/scripts/login_\$ADDNAME.txt"
            echo "    scripts/login_\$ADDNAME.txt"
            break
        done
        # Sua path tuyet doi cua project cu trong file da import (neu co)
        if [ -f "\$PROJECT_DIR/bots/\${ADDNAME}_tmux.sh" ]; then
            sed -i "s|^PROJECT_DIR=.*|PROJECT_DIR=\"\$PROJECT_DIR\"|" "\$PROJECT_DIR/bots/\${ADDNAME}_tmux.sh" 2>/dev/null || true
        fi
        echo "[*] Xong. Chay: bot \$ADDNAME   •   xem list: bot list"
        ;;
    remove|rm|delete|del)
        target="\$2"
        if [ -z "\$target" ]; then echo "Dung: bot remove <ten|all>"; _bot_list | sed 's/^/  - /'; exit 1; fi
        if [ "\$target" = "all" ]; then
            echo "Se xoa TOAN BO bot:"
            _bot_list | sed 's/^/  - /'
            read -p "Xoa tat ca? (y/N): " ans
            if [[ "\$ans" =~ ^[Yy]\$ ]]; then
                for b in \$(_bot_list); do
                    bdir=\$(_get_bot_dir "\$b")
                    echo "Xoa \$b..."
                    tmux kill-session -t "mc_\$b" 2>/dev/null; pkill -f "mc_\$b" 2>/dev/null
                    rm -f "\$bdir/\$b.sh" "\$bdir/\$b.ini" "\$bdir/\${b}_tmux.sh" "\$PROJECT_DIR/scripts/login_\$b.txt" 2>/dev/null
                    rm -f "\$HOME/.config/systemd/user/mc-\$b.service" 2>/dev/null
                    sudo rm -f "/etc/systemd/system/mc-\$b.service" 2>/dev/null
                done
                systemctl --user daemon-reload 2>/dev/null; sudo systemctl daemon-reload 2>/dev/null
                echo "Da xoa all"
            else
                echo "Huy"
            fi
            exit 0
        fi
        name="\$target"
        if ! _check_exists "\$name"; then
            echo "[!] Khong thay bot '\$name' (ngam kiem tra)"
            echo "Co the file da xoa. Co the xoa muc nay khong? (da co add de them lai)"
            read -p "Xoa tham chieu bot '\$name'? (y/N): " ans
            if [[ "\$ans" =~ ^[Yy]\$ ]]; then echo "Da bo qua (khong co file de xoa)"; fi
            exit 1
        fi
        bdir=\$(_get_bot_dir "\$name")
        echo "Se xoa: \$bdir/\$name.sh, \$bdir/\$name.ini, \$bdir/\${name}_tmux.sh, scripts/login_\$name.txt"
        read -p "Xoa bot '\$name'? (y/N): " ans
        if [[ "\$ans" =~ ^[Yy]\$ ]]; then
            # Kill trong session chung neu co
            if tmux has-session -t mc_bot 2>/dev/null && tmux list-windows -t mc_bot -F "#{window_name}" 2>/dev/null | grep -q "^\$name\$"; then
                tmux kill-window -t "mc_bot:\$name" 2>/dev/null
            fi
            tmux kill-session -t "mc_\$name" 2>/dev/null
            rm -f "\$bdir/\$name.sh" "\$bdir/\$name.ini" "\$bdir/\${name}_tmux.sh" "\$PROJECT_DIR/scripts/login_\$name.txt" 2>/dev/null
            rm -f "\$HOME/.config/systemd/user/mc-\$name.service" 2>/dev/null
            sudo rm -f "/etc/systemd/system/mc-\$name.service" 2>/dev/null
            systemctl --user daemon-reload 2>/dev/null; sudo systemctl daemon-reload 2>/dev/null
            echo "Da xoa bot '\$name'"
        else
            echo "Huy"
        fi
        ;;
    kill)
        target="\$2"
        if [ -z "\$target" ]; then echo "Dung: bot kill <ten|all>"; exit 1; fi
        if [ "\$target" = "all" ]; then
            for b in \$(_bot_list); do
                echo "Kill \$b..."
                # Kill trong session chung neu co
                if tmux has-session -t mc_bot 2>/dev/null && tmux list-windows -t mc_bot -F "#{window_name}" 2>/dev/null | grep -q "^\$b\$"; then
                    tmux kill-window -t "mc_bot:\$b" 2>/dev/null && echo "  da kill \$b (trong mc_bot)" || echo "  \$b khong co trong mc_bot"
                fi
                tmux kill-session -t "mc_\$b" 2>/dev/null && echo "  da kill \$b (rieng)" || true
                pkill -f "mc_\$b" 2>/dev/null
            done
        else
            name="\$target"
            if ! _check_exists "\$name"; then echo "[!] Khong thay bot '\$name'"; exit 1; fi
            # Kill trong session chung neu co
            if tmux has-session -t mc_bot 2>/dev/null && tmux list-windows -t mc_bot -F "#{window_name}" 2>/dev/null | grep -q "^\$name\$"; then
                tmux kill-window -t "mc_bot:\$name" 2>/dev/null && echo "Da kill \$name (trong mc_bot)"
            fi
            tmux kill-session -t "mc_\$name" 2>/dev/null && echo "Da kill \$name (rieng)" || echo "\$name khong chay"
        fi
        ;;
    start)
        target="\$2"
        if [ -z "\$target" ]; then echo "Dung: bot start <ten|all>"; _bot_list | sed 's/^/  - /'; exit 1; fi
        if [ "\$target" = "all" ]; then
            for b in \$(_bot_list); do echo "Start \$b..."; _run_bot "\$b" & done
            wait
        else
            name="\$target"
            if ! _check_exists "\$name"; then echo "[!] Khong thay bot '\$name'"; exit 1; fi
            _run_bot "\$name"
        fi
        ;;
    download|dl)
        sub="\$2"
        case "\$sub" in
            on)
                touch "\$PROJECT_DIR/.download_on"
                if ss -tlnp 2>/dev/null | grep -q ":\$DOWNLOAD_PORT "; then
                    echo "Download da chay"
                else
                    echo "[*] Khoi download server :\$DOWNLOAD_PORT..."
                    nohup python3 "\$PROJECT_DIR/download.py" >/tmp/download-\${DOWNLOAD_PORT}.log 2>&1 &
                    sleep 1
                    echo "Da mo download"
                fi
                LAN_IP=\$(ip -4 addr show scope global 2>/dev/null | grep -oP 'inet \K[\d.]+' | head -1); [ -z "\$LAN_IP" ] && LAN_IP="127.0.0.1"
                echo "Download: http://\$LAN_IP:\$DOWNLOAD_PORT/download"
                echo "          http://localhost:\$DOWNLOAD_PORT/download"
                ;;
            off)
                rm -f "\$PROJECT_DIR/.download_on"
                echo "[*] Da tat /download (web / -> ttyd van chay, ghi tay /download se bao tat)"
                ;;
            status|"")
                if [ -f "\$PROJECT_DIR/.download_on" ]; then flag="mo"; else flag="tat"; fi
                if ss -tlnp 2>/dev/null | grep -q ":\$DOWNLOAD_PORT "; then echo "Web (ttyd): on (port \$DOWNLOAD_PORT) - / -> ttyd"; ss -tlnp 2>&1 | grep ":\$DOWNLOAD_PORT" | sed 's/^/  /'; else echo "Web (ttyd): off (port \$DOWNLOAD_PORT)"; fi
                echo "/download: \$flag (ghi tay \$DOWNLOAD_PORT/download, 'bot download on/off')"
                LAN_IP=\$(ip -4 addr show scope global 2>/dev/null | grep -oP 'inet \K[\d.]+' | head -1); [ -z "\$LAN_IP" ] && LAN_IP="127.0.0.1"
                echo "Link ttyd: http://\$LAN_IP:\$DOWNLOAD_PORT/ | Link tai: http://\$LAN_IP:\$DOWNLOAD_PORT/download"
                ;;
            *)
                echo "Dung: bot download [on|off|status]"
                ;;
        esac
        ;;
    "")
        # Khong doi so - tu dong vao download KHONG tu mo download, chi chay bot/list
        count=\$(_bot_list | wc -l)
        if [ "\$count" -eq 1 ]; then
            only=\$(_bot_list)
            echo "-> Chay bot duy nhat: \$only"
            _run_bot "\$only"
        elif [ "\$count" -gt 1 ]; then
            echo "Co \$count bot:"
            _bot_list | sed 's/^/  - /'
            echo "Dung: bot <ten> (vd: bot geasf) | bot help de xem them"
        else
            echo "Khong co bot nao trong \$BOT_DIR"
            echo "Dung 'bot add' de them bot moi"
        fi
        ;;
    edit)
        target="\$2"
        _edit_one() {
            local b="\$1"
            local bdir=\$(_get_bot_dir "\$b")
            local sh_file="\$bdir/\$b.sh"
            local ini_file="\$bdir/\$b.ini"
            local tmux_file="\$bdir/\${b}_tmux.sh"
            local script_file="\$PROJECT_DIR/scripts/login_\$b.txt"
            local dl_file="\$PROJECT_DIR/download.py"
            echo "=== Edit \$b ==="
            echo "  1) Account (sh:ACCOUNT)"
            echo "  2) Server"
            echo "  3) Port (download/ttyd)"
            echo "  4) INI file (path/content) [\$ini_file]"
            echo "  5) Script file (path/content) [\$script_file]"
            echo "  6) TTYD user/pass"
            echo "  7) Edit INI truc tiep (nano)"
            echo "  8) Edit Script truc tiep (nano)"
            echo "  9) Doi ten bot (rename file)"
            echo "  10) Edit bot.sh truc tiep (mo editor)"
            echo "  11) Edit download.py truc tiep"
            echo "  0) Thoat"
            while true; do
                read -p "Chon muc de sua (0-9, Enter=thoat): " ch
                [ -z "\$ch" ] && break
                case "\$ch" in
                    1)
                        cur=\$(grep -oP 'ACCOUNT="\\K[^"]+' "\$sh_file" 2>/dev/null || echo "\$b")
                        read -p "Account [\$cur]: " nv
                        if [ -n "\$nv" ]; then
                            sed -i "s/^ACCOUNT=.*/ACCOUNT=\"\$nv\"/" "\$sh_file" 2>/dev/null || echo "ACCOUNT=\"\$nv\"" >> "\$sh_file"
                            echo "Da doi ACCOUNT -> \$nv (file \$sh_file)"
                        fi
                        ;;
                    2)
                        cur=\$(grep -oP 'SERVER="\\K[^"]+' "\$sh_file" 2>/dev/null || echo "kingmc.vn")
                        read -p "Server [\$cur]: " nv
                        if [ -n "\$nv" ]; then
                            sed -i "s/^SERVER=.*/SERVER=\"\$nv\"/" "\$sh_file" 2>/dev/null || echo "SERVER=\"\$nv\"" >> "\$sh_file"
                            echo "Da doi SERVER -> \$nv"
                        fi
                        ;;
                    3)
                        cur=\$(grep -oP '^PORT=\\K[0-9]+' "\$tmux_file" 2>/dev/null || echo "\$DOWNLOAD_PORT")
                        cur2=\$(grep -oP '^PORT = \\K[0-9]+' "\$dl_file" 2>/dev/null || echo "\$DOWNLOAD_PORT")
                        echo "Port hien tai: tmux \$cur / download.py \$cur2 / TTYD \$TTYD_PORT"
                        read -p "Nhap port moi (1-65535, de trong giu nguyen): " nv
                        if [ -n "\$nv" ]; then
                            if ! [[ "\$nv" =~ ^[0-9]+\$ ]] || [ "\$nv" -lt 1 ] || [ "\$nv" -gt 65535 ]; then
                                echo "[!] Port khong hop le"
                            else
                                new_t=\$((nv+1))
                                sed -i "s/^PORT=.*/PORT=\$nv/" "\$tmux_file" 2>/dev/null
                                sed -i "s/^TTYD_PORT=.*/TTYD_PORT=\$new_t/" "\$tmux_file" 2>/dev/null
                                sed -i "s/^PORT = .*/PORT = \$nv/" "\$dl_file" 2>/dev/null
                                echo "Da doi PORT \$cur -> \$nv, TTYD \$new_t (can restart: bot kill \$b; bot start \$b; bot download off; bot download on neu can)"
                            fi
                        fi
                        ;;
                    4)
                        echo "INI hien tai: \$ini_file"
                        read -p "Nhap path INI moi (de trong mo editor, - de doi path): " nv
                        if [ "\$nv" = "-" ]; then
                            read -p "Nhap path moi: " np
                            if [ -n "\$np" ]; then
                                mkdir -p "\$(dirname "\$np")"
                                cp "\$ini_file" "\$np" 2>/dev/null
                                sed -i "s|INI_SRC=.*|INI_SRC=\"\$np\"|" "\$sh_file" 2>/dev/null
                                echo "Da doi INI path -> \$np (can sua sh_file thu cong neu chua doi)"
                            fi
                        elif [ -z "\$nv" ]; then
                            \${EDITOR:-nano} "\$ini_file" < /dev/tty > /dev/tty 2>&1 || vi "\$ini_file" < /dev/tty > /dev/tty 2>&1 || echo "Mo \$ini_file de sua: nano \$ini_file"
                        else
                            mkdir -p "\$(dirname "\$nv")"
                            cp "\$ini_file" "\$nv" 2>/dev/null
                            echo "Da copy INI -> \$nv"
                        fi
                        ;;
                    5)
                        echo "Script hien tai: \$script_file"
                        read -p "Nhap path Script moi (de trong mo editor, - de doi path): " nv
                        if [ "\$nv" = "-" ]; then
                            read -p "Nhap path moi: " np
                            if [ -n "\$np" ]; then
                                mkdir -p "\$(dirname "\$np")"
                                cp "\$script_file" "\$np" 2>/dev/null
                                sed -i "s|script .*|script \$np|" "\$bdir/\$b.ini" 2>/dev/null
                                echo "Da doi Script path -> \$np"
                            fi
                        elif [ -z "\$nv" ]; then
                            \${EDITOR:-nano} "\$script_file" < /dev/tty > /dev/tty 2>&1 || vi "\$script_file" < /dev/tty > /dev/tty 2>&1 || echo "Mo \$script_file: nano \$script_file"
                        else
                            mkdir -p "\$(dirname "\$nv")"
                            cp "\$script_file" "\$nv" 2>/dev/null
                            echo "Da copy Script -> \$nv"
                        fi
                        ;;
                    6)
                        cur_u=\$(grep -oP 'TTYD_USER="\\K[^"]+' "\$tmux_file" 2>/dev/null || echo "")
                        cur_p=\$(grep -oP 'TTYD_PASS="\\K[^"]+' "\$tmux_file" 2>/dev/null || echo "")
                        echo "TTYD hien tai: \$cur_u / ***"
                        read -p "User ttyd [\$cur_u]: " nu
                        read -p "Pass ttyd [***]: " np
                        if [ -n "\$nu" ]; then sed -i "s/^TTYD_USER=.*/TTYD_USER=\"\$nu\"/" "\$tmux_file" 2>/dev/null; echo "Da doi user"; fi
                        if [ -n "\$np" ]; then sed -i "s/^TTYD_PASS=.*/TTYD_PASS=\"\$np\"/" "\$tmux_file" 2>/dev/null; echo "Da doi pass"; fi
                        ;;
                    7)
                        \${EDITOR:-nano} "\$ini_file" < /dev/tty > /dev/tty 2>&1 || vi "\$ini_file" < /dev/tty > /dev/tty 2>&1 || echo "nano \$ini_file"
                        ;;
                    8)
                        \${EDITOR:-nano} "\$script_file" < /dev/tty > /dev/tty 2>&1 || vi "\$script_file" < /dev/tty > /dev/tty 2>&1 || echo "nano \$script_file"
                        ;;
                    9)
                        read -p "Nhap ten moi cho bot '\$b': " nn
                        if [ -n "\$nn" ] && [ "\$nn" != "\$b" ]; then
                            echo "Se doi \$b -> \$nn"
                            read -p "Xac nhan? (y/N): " cf
                            if [[ "\$cf" =~ ^[Yy]\$ ]]; then
                                mv "\$bdir/\$b.sh" "\$bdir/\$nn.sh" 2>/dev/null
                                mv "\$bdir/\$b.ini" "\$bdir/\$nn.ini" 2>/dev/null
                                mv "\$bdir/\${b}_tmux.sh" "\$bdir/\${nn}_tmux.sh" 2>/dev/null
                                mv "\$PROJECT_DIR/scripts/login_\$b.txt" "\$PROJECT_DIR/scripts/login_\$nn.txt" 2>/dev/null
                                sed -i "s/\$b/\$nn/g" "\$bdir/\$nn.sh" 2>/dev/null
                                sed -i "s/\$b/\$nn/g" "\$bdir/\$nn.ini" 2>/dev/null
                                echo "Da doi ten \$b -> \$nn (can bot kill \$b; bot start \$nn)"
                                b="\$nn"; bdir=\$(_get_bot_dir "\$b"); sh_file="\$bdir/\$b.sh"; ini_file="\$bdir/\$b.ini"; tmux_file="\$bdir/\${b}_tmux.sh"; script_file="\$PROJECT_DIR/scripts/login_\$b.txt"
                            fi
                        fi
                        ;;
                    10)
                        ${EDITOR:-nano} "$bdir/$b.sh" < /dev/tty > /dev/tty 2>&1 || vi "$bdir/$b.sh" < /dev/tty > /dev/tty 2>&1 || echo "Mo $bdir/$b.sh: nano $bdir/$b.sh"
                        ;;
                    11)
                        ${EDITOR:-nano} "$PROJECT_DIR/download.py" < /dev/tty > /dev/tty 2>&1 || vi "$PROJECT_DIR/download.py" < /dev/tty > /dev/tty 2>&1 || echo "Mo $PROJECT_DIR/download.py"
                        ;;
                    0) break ;;
                    *) echo "Chon 0-9" ;;
                esac
            done
            echo "Xong edit \$b"
        }
        if [ -z "\$target" ]; then
            cnt=\$(_bot_list | wc -l)
            if [ "\$cnt" -eq 0 ]; then echo "Khong co bot"; exit 1
            elif [ "\$cnt" -eq 1 ]; then _edit_one "\$(_bot_list)"
            else
                echo "Chon bot de edit:"
                _bot_list | cat -n | sed 's/^/  /'
                read -p "Nhap ten bot (de trong = all, all de edit all): " sel
                if [ -z "\$sel" ]; then sel="all"; fi
                if [ "\$sel" = "all" ]; then for b in \$(_bot_list); do _edit_one "\$b"; done; else _edit_one "\$sel"; fi
            fi
        elif [ "\$target" = "all" ]; then
            for b in \$(_bot_list); do _edit_one "\$b"; done
        else
            if ! _check_exists "\$target"; then echo "[!] Khong thay bot '\$target'"; _bot_list | sed 's/^/  - /'; exit 1; fi
            _edit_one "\$target"
        fi
        ;;
    *)
        name="\$1"
        # Kiem tra file con ko (ngam)
        if ! _check_exists "\$name"; then
            echo "[!] Khong thay bot '\$name' (kiem tra ngam)"
            echo "Co the file da bi xoa hoac chua them."
            echo "Co the xoa tham chieu nay khong? (dung 'bot remove \$name' de xoa, 'bot add' de them)"
            _bot_list | sed 's/^/  - /'
            exit 1
        fi
        _run_bot "\$name"
        ;;
esac
EOSH
        chmod +x "$BOT_BIN"
    fi
    # Dam bao ~/.local/bin trong PATH
    if ! echo "$PATH" | grep -q "$HOME/.local/bin"; then
        SHELL_RC=""
        if [[ "$SHELL" == *"zsh"* ]]; then SHELL_RC="$HOME/.zshrc"
        elif [ -f "$HOME/.bashrc" ]; then SHELL_RC="$HOME/.bashrc"
        else SHELL_RC="$HOME/.profile"; fi
        if ! grep -q 'HOME/.local/bin' "$SHELL_RC" 2>/dev/null; then
            echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$SHELL_RC"
            echo "[*] Da them ~/.local/bin vao PATH trong $SHELL_RC"
        fi
        export PATH="$HOME/.local/bin:$PATH"
    fi
    # GHI DE + dọn sạch các dạng alias/definition `bot` cũ trong rc (kẻo làm che mất CLI mới)
    echo "[*] Ghi de CLI tai $BOT_BIN (file cu, neu co, se duoc thay the)"
    clean_rc_bot() {
        # $1 = rc file. Xoa: 'alias bot=...', dong marker, và function bot(){...} (dem brace, không ăn trọn file)
        awk '
            /^[[:space:]]*alias[[:space:]]+/ && ($0!~/bot=/) {print; next}
            /^[[:space:]]*alias[[:space:]]+/ {next}
            /BOT MCC alias/ {next}
            /^[[:space:]]*bot[()]*[[:space:]]*[{]/ {infun=1; depth=0}
            /^[[:space:]]*function[[:space:]]+bot/ {infun=1; depth=0}
            infun {
                n=length($0)
                for (i=1; i<=n; i++) {
                    c=substr($0,i,1)
                    if (c=="{") depth++
                    else if (c=="}") { depth--; if (depth==0) { infun=0; next } }
                }
            }
            infun { next }
            { print }
        ' "$1"
    }
    for RC in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.profile"; do
        [ -f "$RC" ] || continue
        # backup truoc khi chinh sua rc
        cp "$RC" "$HOME/.rc-bot-backup" 2>/dev/null || true
        clean_rc_bot "$RC" > "$RC.tmp-bot" 2>/dev/null && mv "$RC.tmp-bot" "$RC" || rm -f "$RC.tmp-bot"
    done
    echo "[*] Da tao lenh bot tai $BOT_BIN (alias/function cu trong .bashrc/.zshrc/.profile da duoc xoa, backup: ~/.rc-bot-backup)"
    echo "    Dung: bot help | bot list | bot add | bot remove <ten> | bot <ten>"
    echo "    Mo terminal moi hoac chay: source ~/.bashrc; bot help"
else
    echo "[*] Bo qua lenh bot"
fi

# --- 3.5. Cai tab-completion cho lenh bot (go phim TAB) ---
echo ""
echo "=== Tab-completion cho lenh bot ==="
echo "Goi y lenh + ten bot + subcommand khi bam TAB (vd: bot <TAB>, bot start <TAB>)"
NEED_COMPLETION=$(ask "Cai goi y phim TAB cho lenh bot? (y/n)" "y")
if [[ "$NEED_COMPLETION" =~ ^[Yy]$ ]]; then
    # Copy file completion theo project (de copy sang may khac van co)
    if [ -f "$(dirname "$0")/bots/bot-completion.bash" ]; then
        cp -f "$(dirname "$0")/bots/bot-completion.bash" "$TARGET_DIR/bots/bot-completion.bash" 2>/dev/null || true
        echo "[*] Da copy bots/bot-completion.bash"
    fi
    if [ -f "$(dirname "$0")/bots/_bot" ]; then
        cp -f "$(dirname "$0")/bots/_bot" "$TARGET_DIR/bots/_bot" 2>/dev/null || true
    fi
    if [ ! -f "$TARGET_DIR/bots/bot-completion.bash" ]; then
        echo "[!] Khong tim thay bots/bot-completion.bash (bo qua completion)"
    else
        # --- bash ---
        if [ -f "$HOME/.bashrc" ]; then
            if grep -q "bot-completion.bash" "$HOME/.bashrc" 2>/dev/null; then
                echo "[*] Completion da co trong ~/.bashrc"
            else
                {
                    echo ""
                    echo "# bot CLI tab-completion (goi y lenh + ten bot + subcommand)"
                    echo "if [[ -f \"$TARGET_DIR/bots/bot-completion.bash\" ]]; then"
                    echo "    source \"$TARGET_DIR/bots/bot-completion.bash\""
                    echo "fi"
                } >> "$HOME/.bashrc"
                echo "[*] Da them completion vao ~/.bashrc"
            fi
        fi
        # --- zsh (neu may co dung) ---
        if [ -f "$HOME/.zshrc" ]; then
            mkdir -p "$HOME/.zsh/completions" 2>/dev/null || true
            if [ -f "$TARGET_DIR/bots/_bot" ]; then
                cp -f "$TARGET_DIR/bots/_bot" "$HOME/.zsh/completions/_bot" 2>/dev/null || true
                if grep -q '\.zsh/completions' "$HOME/.zshrc" 2>/dev/null; then
                    echo "[*] Completion da co trong ~/.zshrc"
                elif grep -q "compinit" "$HOME/.zshrc" 2>/dev/null; then
                    # chen fpath truoc compinit (phai dung truoc compinit moi co tac dung)
                    awk '!done && /compinit/ {print "fpath=(~/.zsh/completions $fpath)"; done=1} {print}' "$HOME/.zshrc" > "$HOME/.zshrc.new" \
                        && mv "$HOME/.zshrc.new" "$HOME/.zshrc" \
                        && echo "[*] Da them fpath completion vao ~/.zshrc (truoc compinit)"
                else
                    echo 'fpath=(~/.zsh/completions $fpath)' >> "$HOME/.zshrc"
                    echo "[*] Da them fpath completion vao ~/.zshrc"
                fi
            fi
        fi
        echo "    Mo terminal moi hoac chay: source ~/.bashrc; thu: bot <TAB>"
    fi
else
    echo "[*] Bo qua completion (sau nay them tay: source $TARGET_DIR/bots/bot-completion.bash)"
fi


# --- 4. Hỏi tạo systemctl ---
echo ""
echo "=== Systemctl (chạy ngầm) ==="
NEED_SYSTEM=$(ask "Tạo service systemctl để chạy ngầm? (y/n)" "y")
if [[ "$NEED_SYSTEM" =~ ^[Yy]$ ]]; then
    NEED_SUDO=$(ask "Cần sudo không? (y=cần sudo system service / n=user service)" "n")
    if [[ "$NEED_SUDO" =~ ^[Yy]$ ]]; then
        SERVICE_PATH="/etc/systemd/system/mc-$BOT_NAME.service"
        echo "[*] Sẽ tạo $SERVICE_PATH (cần sudo, chỉ sudo mới tắt được)"
        sudo tee "$SERVICE_PATH" >/dev/null <<EOF
[Unit]
Description=MCC Bot $BOT_NAME tmux 2013 (sudo mới tắt)
After=network-online.target
Wants=network-online.target
[Service]
# geasf_tmux.sh tu giu process song khi chay duoi systemd (khong co TTY).
Type=simple
User=$(whoami)
Group=$(id -gn)
WorkingDirectory=$TARGET_DIR
ExecStart=/bin/bash $TARGET_DIR/$BOT_TMUX_SH
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
[Install]
WantedBy=multi-user.target
EOF
        if [ $? -eq 0 ]; then
            sudo systemctl daemon-reload
            sudo systemctl enable mc-$BOT_NAME.service
            echo "[*] Đã tạo system service (chỉ cài, chưa chạy): sudo systemctl status mc-$BOT_NAME"
            echo "    Để chạy: sudo systemctl start mc-$BOT_NAME"
            echo "    Web sau khi chạy: http://127.0.0.1:2013"
            echo "    Chỉ sudo mới tắt: sudo systemctl stop mc-$BOT_NAME"
        else
            echo "[!] Không ghi được $SERVICE_PATH (cần sudo)"
        fi
    else
        # user service
        mkdir -p "$HOME/.config/systemd/user"
        SERVICE_PATH="$HOME/.config/systemd/user/mc-$BOT_NAME.service"
        echo "[*] Sẽ tạo $SERVICE_PATH (user service, không cần sudo)"
        cat > "$SERVICE_PATH" <<EOF
[Unit]
Description=MCC Bot $BOT_NAME tmux 2013
After=network-online.target
Wants=network-online.target
[Service]
# geasf_tmux.sh tu giu process song khi chay duoi systemd (khong co TTY).
Type=simple
WorkingDirectory=$TARGET_DIR
ExecStart=/bin/bash $TARGET_DIR/$BOT_TMUX_SH
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
[Install]
WantedBy=default.target
EOF
        systemctl --user daemon-reload
        systemctl --user enable mc-$BOT_NAME.service
        loginctl enable-linger "$(whoami)" 2>/dev/null || true
        echo "[*] Đã tạo user service (chỉ cài, chưa chạy): systemctl --user status mc-$BOT_NAME"
        echo "    Để chạy: systemctl --user start mc-$BOT_NAME"
        echo "    Web sau khi chạy: http://127.0.0.1:2013"
    fi
else
    echo "[*] Bỏ qua systemctl, bạn có thể chạy thủ công: $TARGET_DIR/$BOT_SH hoặc bot $BOT_NAME"
fi


echo ""
echo "=== XONG ==="
echo "Thư mục: $TARGET_DIR"
echo "Chạy thử:  $TARGET_DIR/$BOT_SH"
echo "Hoặc alias: bot        (nếu 1 bot)  |  bot $BOT_NAME"
echo ""
echo "[*] Luu y: Bot chua chay. Dung 'bot $BOT_NAME' hoac 'systemctl --user start mc-$BOT_NAME' de chay"

