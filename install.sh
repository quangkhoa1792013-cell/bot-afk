#!/usr/bin/env bash
set -euo pipefail

INSTALLER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_RAW="https://raw.githubusercontent.com/quangkhoa1792013-cell/bot-afk/main"
RELEASE_BASE="https://github.com/quangkhoa1792013-cell/bot-afk/releases/latest/download"
SCRIPT_PRESET=""
SOURCE_MODE="auto"

ask() {
    local prompt="$1" default="${2:-}" answer
    if [ -n "$default" ]; then printf '%s [%s]: ' "$prompt" "$default" >&2
    else printf '%s: ' "$prompt" >&2; fi
    IFS= read -r answer || true
    printf '%s\n' "${answer:-$default}"
}

expand_path() {
    local path="$1"
    case "$path" in
        '~') printf '%s\n' "$HOME" ;;
        '~/'*) printf '%s/%s\n' "$HOME" "${path#~/}" ;;
        /*) printf '%s\n' "$path" ;;
        *) printf '%s/%s\n' "$(pwd)" "$path" ;;
    esac
}

fetch() {
    local url="$1" output="$2"
    if command -v curl >/dev/null 2>&1; then
        curl -fL --retry 2 --connect-timeout 15 -o "$output" "$url"
    elif command -v wget >/dev/null 2>&1; then
        wget -O "$output" "$url"
    else
        return 127
    fi
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        --script) SCRIPT_PRESET="${2:-}"; shift 2 ;;
        --offline) SOURCE_MODE="offline"; shift ;;
        --download) SOURCE_MODE="download"; shift ;;
        --build) SOURCE_MODE="build"; shift ;;
        -h|--help) echo "Dùng: ./install.sh [--script FILE] [--offline|--download|--build]"; exit 0 ;;
        *) echo "[!] Tham số không hợp lệ: $1" >&2; exit 2 ;;
    esac
done

echo "=== Cài bot AFK KingMC ==="
echo "Enter ở bước thư mục sẽ dùng: $HOME/<tên trong game>"
INSTALL_INPUT="$(ask "Thư mục cài bot (Enter = mặc định)" "")"
BOT_ALIAS="$(ask "Tên gọi nhớ (Enter = dùng tên trong game)" "")"
BOT_ACCOUNT="$(ask "Tên trong game" "")"

if ! [[ "$BOT_ACCOUNT" =~ ^[A-Za-z0-9_]{1,16}$ ]]; then
    echo "[!] Tên trong game phải có 1-16 chữ cái, chữ số hoặc dấu _." >&2
    exit 1
fi
BOT_NAME="${BOT_ALIAS:-$BOT_ACCOUNT}"
if ! [[ "$BOT_NAME" =~ ^[A-Za-z0-9_-]{1,32}$ ]]; then
    echo "[!] Tên gọi nhớ chỉ được dùng chữ, số, dấu _ hoặc -." >&2
    exit 1
fi

if [ -z "$INSTALL_INPUT" ]; then TARGET_DIR="$HOME/$BOT_ACCOUNT"
else TARGET_DIR="$(expand_path "$INSTALL_INPUT")"; fi
TARGET_DIR="$(realpath -m "$TARGET_DIR" 2>/dev/null || printf '%s' "$TARGET_DIR")"
echo "Bot sẽ được cài tại: $TARGET_DIR"

INSTALL_COMMAND="$(ask "Cài lệnh 'bot' để quản lý? (y/n)" "y")"
BOT_SERVER="$(ask "Địa chỉ server" "kingmc.vn")"
if ! [[ "$BOT_SERVER" =~ ^[A-Za-z0-9._:-]+$ ]]; then
    echo "[!] Địa chỉ server không hợp lệ." >&2
    exit 1
fi

if [ -n "$SCRIPT_PRESET" ]; then SCRIPT_INPUT="$SCRIPT_PRESET"
else SCRIPT_INPUT="$(ask "Đường dẫn script đăng nhập có sẵn (Enter = tạo mới)" "")"; fi

mkdir -p "$TARGET_DIR/bots" "$TARGET_DIR/scripts" "$TARGET_DIR/logs"
if [ -e "$TARGET_DIR/bots/$BOT_NAME.sh" ]; then
    echo "[!] Bot '$BOT_NAME' đã tồn tại tại $TARGET_DIR. Không ghi đè file đang dùng." >&2
    exit 1
fi

BOT_INI="$TARGET_DIR/bots/$BOT_NAME.ini"
LOGIN_SCRIPT="$TARGET_DIR/scripts/login_$BOT_NAME.txt"
if [ -f "$INSTALLER_DIR/config.ini" ]; then
    cp "$INSTALLER_DIR/config.ini" "$BOT_INI"
else
    echo "[*] Đang tải cấu hình mẫu..."
    fetch "$REPO_RAW/config.ini" "$BOT_INI" || true
fi
if [ ! -s "$BOT_INI" ]; then
    cat > "$BOT_INI" <<EOF
[Main.Advanced]
EnableSentry = false
MinecraftVersion = "1.21.11"
BrandInfo = "vanilla"
TerrainAndMovements = true
InventoryHandling = true
EntityHandling = true
ExitOnFailure = true

[Console.General]
ConsoleMode = "classic"
EOF
fi

sed -i \
    -e 's/^EnableSentry = .*/EnableSentry = false/' \
    -e 's/^ExitOnFailure = .*/ExitOnFailure = true/' \
    -e 's/^TerrainAndMovements = .*/TerrainAndMovements = true/' \
    -e 's/^InventoryHandling = .*/InventoryHandling = true/' \
    -e 's/^EntityHandling = .*/EntityHandling = true/' \
    -e 's/^ConsoleMode = .*/ConsoleMode = "classic"/' \
    "$BOT_INI"

tmp_ini="$BOT_INI.tmp"
awk '
    /^\[ChatBot\.ScriptScheduler\]$/ { skipping=1; next }
    skipping && /^\[ChatBot\./ { skipping=0 }
    !skipping { print }
' "$BOT_INI" > "$tmp_ini"
cat >> "$tmp_ini" <<EOF

[ChatBot.ScriptScheduler]
Enabled = true

[[ChatBot.ScriptScheduler.TaskList]]
Task_Name = "auto login $BOT_NAME"
Trigger_On_Login = true
Trigger_On_Times = { Enable = false, Times = [] }
Trigger_On_Interval = { Enable = false, MinTime = 1.0, MaxTime = 10.0 }
Action = "script scripts/login_$BOT_NAME.txt"
EOF
mv "$tmp_ini" "$BOT_INI"

if [ -n "$SCRIPT_INPUT" ]; then
    SCRIPT_SOURCE="$(expand_path "$SCRIPT_INPUT")"
    [ -f "$SCRIPT_SOURCE" ] || { echo "[!] Không tìm thấy script: $SCRIPT_SOURCE" >&2; exit 1; }
    cp "$SCRIPT_SOURCE" "$LOGIN_SCRIPT"
else
    LOGIN_COMMAND="$(ask "Lệnh đăng nhập (Enter = để trống)" "")"
    if [ -n "$LOGIN_COMMAND" ]; then
        cat > "$LOGIN_SCRIPT" <<EOF
send da hoat dong
wait 140
send $LOGIN_COMMAND
wait 60
send $LOGIN_COMMAND
wait 60
inventory 0 click 40
wait 60
inventory 1 click 24
wait 60
send /afk
wait 40
inventory 1 click 22
EOF
    else
        cat > "$LOGIN_SCRIPT" <<EOF
# Thêm các lệnh bot cần gửi sau khi vào server.
# Ví dụ:
# wait 140
# send /login mat_khau
EOF
    fi
fi
chmod 600 "$LOGIN_SCRIPT" "$BOT_INI"

cat > "$TARGET_DIR/bots/$BOT_NAME.sh" <<EOF
#!/usr/bin/env bash
set -u
ROOT="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")/.." && pwd)"
ACCOUNT="$BOT_ACCOUNT"
SERVER="$BOT_SERVER"
INI_SOURCE="\$ROOT/bots/$BOT_NAME.ini"
INI_RUNTIME="/tmp/bot-afk-\${UID}-$BOT_NAME.ini"
trap 'exit 0' INT TERM
cd "\$ROOT" || exit 1
while true; do
    hour=\$(date +%H); minute=\$(date +%M)
    now_minutes=\$((10#\$hour * 60 + 10#\$minute))
    if [ "\$now_minutes" -ge 240 ] && [ "\$now_minutes" -lt 320 ]; then
        echo "[\$(date '+%Y-%m-%d %H:%M:%S')] Server đang trong giờ bảo trì; thử lại sau 30 giây."
        sleep 30
        continue
    fi
    cp -f "\$INI_SOURCE" "\$INI_RUNTIME"
    ./MinecraftClient "\$INI_RUNTIME" "\$ACCOUNT" - "$BOT_SERVER" BasicIO
    code=\$?
    echo "[\$(date '+%Y-%m-%d %H:%M:%S')] Bot đã dừng (mã \$code); thử lại sau 90 giây."
    sleep 90
done
EOF
chmod +x "$TARGET_DIR/bots/$BOT_NAME.sh"

cat > "$TARGET_DIR/bots/${BOT_NAME}_tmux.sh" <<EOF
#!/usr/bin/env bash
set -e
ROOT="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")/.." && pwd)"
SESSION="mc_bot"
WINDOW="$BOT_NAME"
background=0
[ "\${1:-}" = "--bg" ] && background=1
if tmux list-windows -t "\$SESSION" -F '#{window_name}' 2>/dev/null | grep -Fxq "\$WINDOW"; then
    echo "Bot \$WINDOW đang chạy."
elif tmux has-session -t "=\$SESSION" 2>/dev/null; then
    tmux new-window -t "\$SESSION" -n "\$WINDOW" "bash \"\$ROOT/bots/$BOT_NAME.sh\""
else
    tmux new-session -d -s "\$SESSION" -n "\$WINDOW" "bash \"\$ROOT/bots/$BOT_NAME.sh\""
fi
tmux set-option -t "\$SESSION" allow-rename off 2>/dev/null || true
[ "\$background" -eq 1 ] || exec tmux attach-session -t "\$SESSION"
EOF
chmod +x "$TARGET_DIR/bots/${BOT_NAME}_tmux.sh"

install_binary() {
    local arch asset temp source_project choice
    if [ -n "${BOT_BINARY_SOURCE:-}" ] && [ -f "$BOT_BINARY_SOURCE" ]; then
        cp "$BOT_BINARY_SOURCE" "$TARGET_DIR/MinecraftClient"; return 0
    fi
    if [ -f "$INSTALLER_DIR/MinecraftClient" ] && [ "$SOURCE_MODE" != build ] && [ "$SOURCE_MODE" != download ]; then
        cp "$INSTALLER_DIR/MinecraftClient" "$TARGET_DIR/MinecraftClient"
        echo "[*] Đã dùng MinecraftClient đi kèm gói offline."
        return 0
    fi
    if [ "$SOURCE_MODE" = offline ]; then echo "[!] Gói offline thiếu MinecraftClient." >&2; return 1; fi
    if [ "$SOURCE_MODE" = auto ]; then
        if [ -t 0 ]; then
            choice="$(ask "Nguồn MinecraftClient: 1 tải bản có sẵn, 2 tự build" "1")"
            [ "$choice" = 2 ] && SOURCE_MODE=build || SOURCE_MODE=download
        else SOURCE_MODE=download; fi
    fi
    if [ "$SOURCE_MODE" = download ]; then
        arch="$(uname -m)"
        case "$arch" in
            x86_64|amd64) asset="MinecraftClient-linux-x64" ;;
            aarch64|arm64) asset="MinecraftClient-linux-arm64" ;;
            *) echo "[!] Kiến trúc $arch chưa có binary tải sẵn; sẽ thử tự build."; SOURCE_MODE=build ;;
        esac
        if [ "$SOURCE_MODE" = download ]; then
            temp="$TARGET_DIR/.MinecraftClient.download"
            echo "[*] Đang tải $asset..."
            if fetch "$RELEASE_BASE/$asset" "$temp"; then mv "$temp" "$TARGET_DIR/MinecraftClient"; return 0; fi
            rm -f "$temp"
            echo "[!] Tải binary thất bại; sẽ thử build từ source."
            SOURCE_MODE=build
        fi
    fi
    source_project="$INSTALLER_DIR/mcc-src/MinecraftClient/MinecraftClient.csproj"
    if [ "$SOURCE_MODE" = build ] && command -v dotnet >/dev/null 2>&1 && [ -f "$source_project" ]; then
        arch="$(uname -m)"
        case "$arch" in x86_64|amd64) arch=x64;; aarch64|arm64) arch=arm64;; *) arch=x64;; esac
        temp="$(mktemp -d)"
        echo "[*] Đang build MinecraftClient..."
        dotnet publish "$source_project" -c Release -r "linux-$arch" --self-contained true \
            -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o "$temp"
        cp "$temp/MinecraftClient" "$TARGET_DIR/MinecraftClient"
        rm -rf "$temp"
        return 0
    fi
    echo "[!] Không thể lấy MinecraftClient. Dùng gói offline có binary hoặc cài .NET SDK để build." >&2
    return 1
}

install_binary
chmod +x "$TARGET_DIR/MinecraftClient"

SHARE_DIR="$HOME/.local/share/bot-afk"
REG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/bot-afk"
mkdir -p "$SHARE_DIR/bin" "$SHARE_DIR/completions" "$HOME/.local/bin" "$REG_DIR"
cp "$INSTALLER_DIR/install.sh" "$SHARE_DIR/install.sh"
[ -f "$INSTALLER_DIR/config.ini" ] && cp "$INSTALLER_DIR/config.ini" "$SHARE_DIR/config.ini"
for helper in bot bot_tmux_run.sh bot_tmux_log.sh bot_cycle_log.py; do
    if [ -f "$INSTALLER_DIR/bin/$helper" ]; then
        cp "$INSTALLER_DIR/bin/$helper" "$SHARE_DIR/bin/$helper"
    elif [ "$helper" = bot ]; then
        fetch "$REPO_RAW/bin/bot" "$SHARE_DIR/bin/bot" || true
    fi
done
[ -f "$INSTALLER_DIR/bots/bot-completion.bash" ] \
    && cp "$INSTALLER_DIR/bots/bot-completion.bash" "$SHARE_DIR/completions/bot.bash"
[ -f "$INSTALLER_DIR/bots/_bot" ] \
    && cp "$INSTALLER_DIR/bots/_bot" "$SHARE_DIR/completions/_bot"

REG_FILE="${BOT_REG_FILE:-$REG_DIR/bots.conf}"
mkdir -p "$(dirname "$REG_FILE")"
touch "$REG_FILE"
awk -F'|' -v name="$BOT_NAME" '$1 != name' "$REG_FILE" > "$REG_FILE.tmp"
printf '%s|%s\n' "$BOT_NAME" "$TARGET_DIR/bots" >> "$REG_FILE.tmp"
mv "$REG_FILE.tmp" "$REG_FILE"

if [[ "$INSTALL_COMMAND" =~ ^[Yy]$ ]]; then
    [ -f "$SHARE_DIR/bin/bot" ] || { echo "[!] Không có file lệnh bot trong gói cài." >&2; exit 1; }
    cp "$SHARE_DIR/bin/bot" "$HOME/.local/bin/bot"
    chmod +x "$HOME/.local/bin/bot" "$SHARE_DIR/bin/"* 2>/dev/null || true
    path_line='export PATH="$HOME/.local/bin:$PATH"'
    touch "$HOME/.profile" "$HOME/.bashrc"
    grep -Fqx "$path_line" "$HOME/.profile" || printf '\n%s\n' "$path_line" >> "$HOME/.profile"
    grep -Fqx "$path_line" "$HOME/.bashrc" || printf '\n%s\n' "$path_line" >> "$HOME/.bashrc"
    completion_line='[ -f "$HOME/.local/share/bot-afk/completions/bot.bash" ] && source "$HOME/.local/share/bot-afk/completions/bot.bash"'
    if [ -f "$SHARE_DIR/completions/bot.bash" ]; then
        grep -Fqx "$completion_line" "$HOME/.bashrc" || printf '%s\n' "$completion_line" >> "$HOME/.bashrc"
    fi
fi

echo ""
echo "=== Cài đặt hoàn tất ==="
echo "Thư mục : $TARGET_DIR"
echo "Bot      : $BOT_NAME ($BOT_ACCOUNT)"
echo "Server   : $BOT_SERVER"
if [[ "$INSTALL_COMMAND" =~ ^[Yy]$ ]]; then
    echo "Chạy     : bot start $BOT_NAME"
    echo "Dừng     : bot stop $BOT_NAME"
    echo "Tự chạy  : bot autostart on $BOT_NAME"
else
    echo "Chạy     : bash $TARGET_DIR/bots/${BOT_NAME}_tmux.sh"
fi
