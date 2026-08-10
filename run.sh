#!/bin/bash

# ==========================================
# KHỞI TẠO HỆ THỐNG
# ==========================================
echo "[HỆ THỐNG] Đang khởi động script điều khiển..."

CD_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$CD_DIR" || { echo "[LỖI] Không thể truy cập thư mục $CD_DIR"; exit 1; }

SESSION="mc_bots"
PORT=7681
JSON_FILE="accounts.json"
DEFAULT_SERVER="aquamc.vn"

# Khoảng cách (giây) giữa các acc chạy .sh để vào server — để sát quá bị server nghi DDoS và ban
DELAY_BETWEEN_BOTS=5

# ==========================================
# CÁC HÀM QUẢN LÝ WEB
# ==========================================
web_is_running() {
    pgrep -f "ttyd.* -p $PORT " > /dev/null 2>&1
}

start_web() {
    echo "--> [WEB] Đang yêu cầu bật Web Dashboard ngầm..."
    if web_is_running; then
        LAN_IP=$(ip -4 addr show scope global 2>/dev/null | grep -oP 'inet \K[\d.]+' | head -1)
        echo "--> [WEB] BỎ QUA: Web đang hoạt động sẵn tại port $PORT."
        echo "         - Truy cập máy này:   http://localhost:$PORT"
        [ -n "$LAN_IP" ] && echo "         - Chia sẻ LAN:       http://$LAN_IP:$PORT"
    else
        nohup ttyd -i 0.0.0.0 -p $PORT -t fontSize=15 -W bash -c "while true; do tmux attach-session -t $SESSION 2>/dev/null || (clear && echo '=== CHO BOT KHOI CHAY ===' && sleep 2); done" > web_log.txt 2>&1 &
        sleep 2
        if web_is_running; then
            LAN_IP=$(ip -4 addr show scope global 2>/dev/null | grep -oP 'inet \K[\d.]+' | head -1)
            echo "--> [WEB] THÀNH CÔNG: Web đã lên!"
            echo "         - Truy cập máy này:   http://localhost:$PORT"
            [ -n "$LAN_IP" ] && echo "         - Chia sẻ LAN:       http://$LAN_IP:$PORT"
        else
            echo "--> [WEB] THẤT BẠI: Web bị lỗi ngầm. Hãy kiểm tra file web_log.txt!"
        fi
    fi
}

stop_web() {
    echo "--> [WEB] Đang tắt Web Dashboard..."
    if web_is_running; then
        pkill -f "ttyd.* -p $PORT " 2>/dev/null
        echo "--> [WEB] THÀNH CÔNG: Đã tắt Web."
    else
        echo "--> [WEB] BỎ QUA: Không có Web nào đang chạy."
    fi
}

reset_web() {
    echo "--> [WEB] Yêu cầu Restart Web..."
    stop_web
    sleep 1
    start_web
}

# ==========================================
# CÁC HÀM QUẢN LÝ BOT
# ==========================================
start_bots() {
    echo "--> [BOT] Bắt đầu quá trình nạp dữ liệu Bot..."
    if [ ! -f "$JSON_FILE" ]; then
        echo "--> [BOT] LỖI: Không tìm thấy file $JSON_FILE! Hãy thêm bot trước."
        return 1
    fi

    TOTAL_BOTS=$(jq '. | length' "$JSON_FILE" 2>/dev/null || echo 0)
    if [ "$TOTAL_BOTS" -eq 0 ]; then
        echo "--> [BOT] LỖI: File $JSON_FILE đang trống."
        return 1
    fi
    echo "--> [BOT] Tìm thấy $TOTAL_BOTS tài khoản."

    TOTAL_ACTIVE=$(jq '[.[] | select(.active != false)] | length' "$JSON_FILE" 2>/dev/null || echo 0)
    if [ "$TOTAL_ACTIVE" -eq 0 ]; then
        echo "--> [BOT] LỖI: Tất cả tài khoản đang bị TẮT (active=false trong $JSON_FILE)."
        return 1
    fi
    echo "--> [BOT] Số bot đang bật (active=true): $TOTAL_ACTIVE"

    echo "--> [BOT] Đảm bảo file script login trong scripts/..."
    mkdir -p scripts
    for ((i=0; i<TOTAL_BOTS; i++)); do
        SCRIPT_FILE=$(jq -r ".[$i].script" "$JSON_FILE")
        if [ -n "$SCRIPT_FILE" ] && [ "$SCRIPT_FILE" != "null" ]; then
            if [ ! -f "scripts/$SCRIPT_FILE" ] && [ -f "$SCRIPT_FILE" ]; then
                cp "$SCRIPT_FILE" "scripts/$SCRIPT_FILE"
                echo "--> [BOT] Đã copy $SCRIPT_FILE vào scripts/ (bản gốc vẫn ở ngoài)."
            fi
            if [ ! -f "scripts/$SCRIPT_FILE" ]; then
                echo "--> [BOT] CẢNH BÁO: Không tìm thấy file script $SCRIPT_FILE (thiếu ở thư mục gốc lẫn scripts/)."
            fi
        fi
    done

    echo "--> [BOT] Dọn dẹp môi trường tmux cũ..."
    tmux kill-session -t $SESSION 2>/dev/null
    sleep 1

    echo "--> [BOT] Đang tạo môi trường chạy Bot mới..."
    tmux new-session -d -s $SESSION -n "MinecraftBots"
    
    # Kiểm tra xem session có thực sự sống không, nếu không thì báo lỗi thoát luôn
    if ! tmux has-session -t $SESSION 2>/dev/null; then
        echo "--> [BOT] LỖI NGHIÊM TRỌNG: Không thể khởi tạo Tmux session! Kiểm tra lại dịch vụ tmux trên máy."
        return 1
    fi

    # Cấu hình để hiển thị đúng tên từng ô
    tmux set-option -t $SESSION allow-rename off
    tmux set-option -t $SESSION automatic-rename off
    tmux set-option -t $SESSION pane-border-status top
    tmux set-option -t $SESSION pane-border-format " [ #[fg=cyan,bold]#{@bot}#[default] ] " 

    # Lấy pane đầu tiên bằng ID (không phụ thuộc pane-base-index)
    FIRST_PANE=$(tmux list-panes -t $SESSION -F '#{pane_id}' 2>/dev/null | head -1)
    if [ -z "$FIRST_PANE" ]; then
        echo "--> [BOT] LỖI NGHIÊM TRỌNG: Không tìm thấy pane đầu tiên trong session tmux."
        return 1
    fi

    PREV_PANE="$FIRST_PANE"
    PREV_NAME=""
    PREV_SCRIPT=""
    CURRENT=0

    for ((i=0; i<TOTAL_BOTS; i++)); do
        BOT_NAME=$(jq -r ".[$i].name" "$JSON_FILE")
        IS_ACTIVE=$(jq -r ".[$i].active // true" "$JSON_FILE")

        if [ "$IS_ACTIVE" != "true" ]; then
            echo "--> [BOT] BỎ QUA (đang TẮT): $BOT_NAME"
            continue
        fi
        CURRENT=$((CURRENT+1))

        BOT_SH_RAW=$(jq -r ".[$i].sh" "$JSON_FILE")
        # File .sh nằm trong thư mục bots/ (đã phân loại)
        BOT_SH="$BOT_SH_RAW"
        case "$BOT_SH" in
            /*|./*) ;;
            *) BOT_SH="./$BOT_SH" ;;
        esac
        BOT_SCRIPT=$(jq -r ".[$i].script" "$JSON_FILE")

        echo "--> [BOT $CURRENT/$TOTAL_ACTIVE] Khởi chạy: $BOT_NAME..."

        if [ -z "$PREV_NAME" ]; then
            tmux select-pane -t "$FIRST_PANE" -T "$BOT_NAME" 2>/dev/null
            tmux set-option -p -t "$FIRST_PANE" @bot "$BOT_NAME" 2>/dev/null
            tmux set-option -p -t "$FIRST_PANE" @sh "$BOT_SH" 2>/dev/null
            tmux send-keys -t "$FIRST_PANE" "$BOT_SH" C-m
        else
            echo "--> [BOT] Chờ $DELAY_BETWEEN_BOTS giây rồi mới mở .sh của acc kế tiếp (chống ban)..."
            sleep $DELAY_BETWEEN_BOTS
            tmux send-keys -t "$PREV_PANE" "/script ${PREV_SCRIPT}" C-m

            if [[ "$PREV_NAME" == "khoablabla" ]]; then
                sleep 2
                tmux send-keys -t "$PREV_PANE" "/warp afk" C-m
            fi

            tmux split-window -t "$SESSION"
            tmux select-layout -t "$SESSION" tiled

            # Pane vừa split chính là pane đang active — lấy ID thực tế của nó
            NEW_PANE=$(tmux display-message -p -t "$SESSION" '#{pane_id}')
            tmux select-pane -t "$NEW_PANE" -T "$BOT_NAME" 2>/dev/null
            tmux set-option -p -t "$NEW_PANE" @bot "$BOT_NAME" 2>/dev/null
            tmux set-option -p -t "$NEW_PANE" @sh "$BOT_SH" 2>/dev/null
            tmux send-keys -t "$NEW_PANE" "$BOT_SH" C-m
            PREV_PANE="$NEW_PANE"
        fi

        PREV_NAME="$BOT_NAME"
        PREV_SCRIPT="$BOT_SCRIPT"
    done

    # Xử lý lệnh cho Bot cuối cùng (nếu có ít nhất 1 bot được bật)
    if [ -n "$PREV_SCRIPT" ]; then
        echo "--> [BOT] Đang chờ nạp lệnh cuối cùng..."
        sleep 3
        tmux send-keys -t "$PREV_PANE" "/script ${PREV_SCRIPT}" C-m

        if [[ "$PREV_NAME" == "khoablabla" ]]; then
            sleep 2
            tmux send-keys -t "$PREV_PANE" "/warp afk" C-m
        fi
    fi

    tmux select-layout -t "$SESSION" tiled
    echo "--> [BOT] HOÀN TẤT! Đã bật thành công $CURRENT bot."
    refresh_pane_titles
}
stop_bots() {
    echo "--> [BOT] Đang thực hiện Stop toàn bộ Bot..."
    if tmux has-session -t $SESSION 2>/dev/null; then
        tmux kill-session -t $SESSION 2>/dev/null
        echo "--> [BOT] THÀNH CÔNG: Đã dập tắt sạch sẽ các Bot đang chạy."
    else
        echo "--> [BOT] BỎ QUA: Không có Bot nào đang hoạt động."
    fi
}

reset_bots() {
    echo "--> [BOT] Yêu cầu Restart toàn bộ dàn Bot..."
    stop_bots
    sleep 1
    start_bots
}

# ==========================================
# HÀM TIỆN ÍCH: TRẠNG THÁI TỪNG BOT + TITLE ĐỘNG
# ==========================================
# Lấy tên acc THẬT từ file .sh (khi acc chạy lệch với tên đăng ký)
get_real_acc() {
    local BOT_NAME="$1"
    local BOT_SH="$2"
    if [ -f "$BOT_SH" ]; then
        local REAL
        REAL=$(grep -oP 'MinecraftClient\s+\K[a-zA-Z0-9_]+' "$BOT_SH" 2>/dev/null | head -1)
        [ -n "$REAL" ] && { echo "$REAL"; return; }
    fi
    echo "$BOT_NAME"
}

# Bot có đang chạy không (dò theo process MinecraftClient với acc thật)
bot_running() {
    local ACC="$1"
    pgrep -f "MinecraftClient ${ACC} " > /dev/null 2>&1
}

# Tìm pane tmux chứa bot theo tên đăng ký (@bot) hoặc acc thật (@acc)
find_bot_pane() {
    local TARGET="$1"
    if tmux has-session -t $SESSION 2>/dev/null; then
        tmux list-panes -t $SESSION -F '#{pane_id}|#{@bot}|#{@acc}' 2>/dev/null | \
            awk -F'|' -v t="$TARGET" '$2==t || $3==t {print $1; exit}'
    fi
}

# Cập nhật title động cho MỌI pane: tên thật khi chạy, "<acc> off" khi tắt
refresh_pane_titles() {
    tmux has-session -t $SESSION 2>/dev/null || return 0
    tmux list-panes -t $SESSION -F '#{pane_id}|#{@bot}|#{@sh}' 2>/dev/null | while IFS='|' read -r PANE_ID BOT_NAME BOT_SH; do
        [ -z "$PANE_ID" ] || [ -z "$BOT_NAME" ] && continue
        REAL_ACC=$(get_real_acc "$BOT_NAME" "$BOT_SH")
        if bot_running "$REAL_ACC"; then
            tmux set-option -p -t "$PANE_ID" @acc "$REAL_ACC" 2>/dev/null
            tmux set-option -p -t "$PANE_ID" @bot "$REAL_ACC" 2>/dev/null
        else
            tmux set-option -p -t "$PANE_ID" @acc "$REAL_ACC" 2>/dev/null
            tmux set-option -p -t "$PANE_ID" @bot "${REAL_ACC} off" 2>/dev/null
        fi
    done
}

# ==========================================
# HÀM QUẢN LÝ TÀI KHOẢN (SUB-MENU)
# ==========================================
add_account() {
    echo "=> BẠN CHỌN: Thêm Bot mới"
    read -p "Tên tài khoản (vd: acc1): " ACC_NAME
    if [ -z "$ACC_NAME" ]; then
        echo "--> LỖI: Tên không được để trống!"
        return 1
    fi
    read -p "IP Server [$DEFAULT_SERVER]: " SERVER_IP
    read -p "File script [login_afk.txt]: " SCRIPT_FILE
    SERVER_IP="${SERVER_IP:-$DEFAULT_SERVER}"
    SCRIPT_FILE="${SCRIPT_FILE:-login_afk.txt}"
    mkdir -p bots
    SH_FILENAME="bots/${ACC_NAME}.sh"
    if [ ! -f "$SH_FILENAME" ]; then
        cat <<EOF > "$SH_FILENAME"
#!/bin/bash
clear
./MinecraftClient $ACC_NAME - $SERVER_IP script=scripts/$SCRIPT_FILE
EOF
        chmod +x "$SH_FILENAME"
    fi
    TMP_JSON=$(mktemp)
    if [ ! -s "$JSON_FILE" ]; then
        echo "[]" > "$JSON_FILE"
    fi
    if jq --arg name "$ACC_NAME" --arg sh "$SH_FILENAME" --arg script "$SCRIPT_FILE" \
       '. + [{"name": $name, "sh": $sh, "script": $script, "active": true}]' "$JSON_FILE" > "$TMP_JSON" 2>/dev/null; then
        mv "$TMP_JSON" "$JSON_FILE"
        mkdir -p scripts
        if [ -f "$SCRIPT_FILE" ] && [ ! -f "scripts/$SCRIPT_FILE" ]; then
            cp "$SCRIPT_FILE" "scripts/$SCRIPT_FILE"
            echo "--> Đã copy $SCRIPT_FILE vào scripts/."
        fi
        echo "--> THÀNH CÔNG: Đã lưu Bot '$ACC_NAME'."
    else
        echo "--> LỖI: Không lưu được vào $JSON_FILE (file JSON có thể bị hỏng)."
        rm -f "$TMP_JSON"
    fi
}

delete_account() {
    echo "=> BẠN CHỌN: Xóa tài khoản"
    if [ ! -f "$JSON_FILE" ]; then
        echo "--> LỖI: Không tìm thấy $JSON_FILE."
        return 1
    fi
    TOTAL=$(jq '. | length' "$JSON_FILE" 2>/dev/null || echo 0)
    if [ "$TOTAL" -eq 0 ]; then
        echo "--> Chưa có tài khoản nào để xóa."
        return 1
    fi
    echo "--> Danh sách tài khoản hiện có:"
    echo ""
    for ((i=0; i<TOTAL; i++)); do
        NAME=$(jq -r ".[$i].name" "$JSON_FILE")
        ACTIVE=$(jq -r ".[$i].active // true" "$JSON_FILE")
        STATE="ON"; [ "$ACTIVE" != "true" ] && STATE="OFF"
        printf "   %2d) %-15s [%s]\n" "$((i+1))" "$NAME" "$STATE"
    done
    echo ""
    read -p "Nhập số/tên acc muốn xóa, cách nhau dấu phẩy hoặc khoảng trắng (Enter = hủy): " DEL_CHOICE
    [ -z "$DEL_CHOICE" ] && { echo "--> Đã hủy."; return 1; }
    DEL_NAMES=()
    NOT_FOUND=()
    IFS=' ,' read -r -a DEL_TOKENS <<< "$DEL_CHOICE"
    for TOK in "${DEL_TOKENS[@]}"; do
        [ -z "$TOK" ] && continue
        if [[ "$TOK" =~ ^[0-9]+$ ]]; then
            FOUND=$(jq -r ".[$((TOK-1))].name // empty" "$JSON_FILE")
        else
            FOUND=$(jq -r --arg n "$TOK" '.[] | select(.name == $n) | .name' "$JSON_FILE" | head -1)
        fi
        if [ -z "$FOUND" ]; then
            NOT_FOUND+=("$TOK")
        else
            DEL_NAMES+=("$FOUND")
        fi
    done
    if [ ${#DEL_NAMES[@]} -eq 0 ]; then
        echo "--> LỖI: Không tìm thấy '$DEL_CHOICE'."
        return 1
    fi
    if [ ${#NOT_FOUND[@]} -gt 0 ]; then
        echo "--> Bỏ qua: ${NOT_FOUND[*]} (không tìm thấy)"
    fi
    echo "--> Sẽ xóa ${#DEL_NAMES[@]} tài khoản: ${DEL_NAMES[*]}"
    read -p "Xác nhận XÓA? (y/N): " CONFIRM
    if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
        echo "--> Đã hủy xóa."
        return 1
    fi
    TMP_JSON=$(mktemp)
    if jq --args 'del(.[] | select($ARGS.positional | index(.name)))' "$JSON_FILE" -- "${DEL_NAMES[@]}" > "$TMP_JSON" 2>/dev/null; then
        mv "$TMP_JSON" "$JSON_FILE"
        # Dừng bot đang chạy của các acc đã xóa nếu có
        for N in "${DEL_NAMES[@]}"; do
            local PANE
            PANE=$(find_bot_pane "$N")
            if [ -n "$PANE" ]; then
                tmux send-keys -t "$PANE" C-c 2>/dev/null
                sleep 1
            fi
        done
        refresh_pane_titles
        echo "--> THÀNH CÔNG: Đã xóa ${#DEL_NAMES[@]} tài khoản (${DEL_NAMES[*]}) khỏi danh sách."
    else
        echo "--> LỖI: Không ghi được $JSON_FILE."
        rm -f "$TMP_JSON"
    fi
}

start_one_bot() {
    local BOT_NAME="$1"
    local BOT_SH
    local BOT_SCRIPT
    BOT_SH=$(jq -r --arg n "$BOT_NAME" '.[] | select(.name == $n) | .sh' "$JSON_FILE" | head -1)
    BOT_SCRIPT=$(jq -r --arg n "$BOT_NAME" '.[] | select(.name == $n) | .script' "$JSON_FILE" | head -1)
    [ -z "$BOT_SH" ] && { echo "--> LỖI: Không tìm thấy acc '$BOT_NAME' trong $JSON_FILE."; return 1; }

    case "$BOT_SH" in
        /*|./*) ;;
        *) BOT_SH="./$BOT_SH" ;;
    esac
    [ ! -f "$BOT_SH" ] && { echo "--> LỖI: Thiếu file $BOT_SH."; return 1; }

    if ! tmux has-session -t $SESSION 2>/dev/null; then
        echo "--> [BOT] Session chưa tồn tại, khởi tạo tmux mới..."
        tmux new-session -d -s $SESSION -n "MinecraftBots"
        tmux set-option -t $SESSION allow-rename off
        tmux set-option -t $SESSION automatic-rename off
        tmux set-option -t $SESSION pane-border-status top
        tmux set-option -t $SESSION pane-border-format " [ #[fg=cyan,bold]#{@bot}#[default] ] "
    fi

    # Tạo pane mới riêng cho bot này (có thể có pane cũ đang "off" — tái sử dụng)
    local PANE
    PANE=$(find_bot_pane "$BOT_NAME")
    if [ -z "$PANE" ]; then
        local FIRST
        FIRST=$(tmux list-panes -t $SESSION -F '#{pane_id}' 2>/dev/null | head -1)
        PANE="$FIRST"
        if [ -n "$(tmux list-panes -t $SESSION -F '#{@bot}' 2>/dev/null | grep -v '^$')" ]; then
            tmux split-window -t $SESSION
            tmux select-layout -t $SESSION tiled
            PANE=$(tmux display-message -p -t "$SESSION" '#{pane_id}')
        fi
    fi

    tmux set-option -p -t "$PANE" @bot "$BOT_NAME" 2>/dev/null
    tmux set-option -p -t "$PANE" @sh "$BOT_SH" 2>/dev/null
    tmux send-keys -t "$PANE" "$BOT_SH" C-m
    sleep $DELAY_BETWEEN_BOTS
    [ -n "$BOT_SCRIPT" ] && [ "$BOT_SCRIPT" != "null" ] && \
        tmux send-keys -t "$PANE" "/script $BOT_SCRIPT" C-m 2>/dev/null
    if [[ "$BOT_NAME" == "khoablabla" ]]; then
        sleep 2
        tmux send-keys -t "$PANE" "/warp afk" C-m 2>/dev/null
    fi
    refresh_pane_titles
    echo "--> THÀNH CÔNG: Đã bật '$BOT_NAME'."
}

stop_one_bot() {
    local BOT_NAME="$1"
    local PANE
    PANE=$(find_bot_pane "$BOT_NAME")
    if [ -z "$PANE" ]; then
        echo "--> BỎ QUA: Không thấy pane của '$BOT_NAME' (bot chưa chạy)."
        return 1
    fi
    tmux send-keys -t "$PANE" C-c
    sleep 1
    tmux send-keys -t "$PANE" C-c
    refresh_pane_titles
    echo "--> THÀNH CÔNG: Đã tắt '$BOT_NAME'."
}

# Menu con: danh sách bot -> chọn bằng số HOẶC tên -> Bật/Tắt
toggle_bot_menu() {
    while true; do
        echo "=> BẠN CHỌN: Chạy/Tắt từng Bot"
        if [ ! -f "$JSON_FILE" ]; then
            echo "--> LỖI: Không tìm thấy $JSON_FILE."
            return 1
        fi
        TOTAL=$(jq '. | length' "$JSON_FILE" 2>/dev/null || echo 0)
        if [ "$TOTAL" -eq 0 ]; then
            echo "--> Chưa có tài khoản nào."
            return 1
        fi
        echo "--> Danh sách tài khoản (chọn bằng SỐ hoặc nhập TÊN):"
        echo ""
        for ((i=0; i<TOTAL; i++)); do
            NAME=$(jq -r ".[$i].name" "$JSON_FILE")
            ACTIVE=$(jq -r ".[$i].active // true" "$JSON_FILE")
            [ "$ACTIVE" != "true" ] && { echo "   $((i+1))) $NAME [đang TẮT]"; continue; }
            SH=$(jq -r ".[$i].sh" "$JSON_FILE")
            REAL=$(get_real_acc "$NAME" "$SH")
            if bot_running "$REAL"; then
                echo "   $((i+1))) $NAME [đang CHẠY]"
            else
                echo "   $((i+1))) $NAME [đang TẮT]"
            fi
        done
        echo ""
        read -p "Nhập số hoặc tên bot (Enter = thoát): " TARGET
        [ -z "$TARGET" ] && return 0
        BOT_NAME=""
        if [[ "$TARGET" =~ ^[0-9]+$ ]]; then
            BOT_NAME=$(jq -r ".[$((TARGET-1))].name // empty" "$JSON_FILE")
        else
            BOT_NAME=$(jq -r --arg n "$TARGET" '.[] | select(.name == $n) | .name' "$JSON_FILE" | head -1)
        fi
        if [ -z "$BOT_NAME" ]; then
            echo "--> LỖI: Không tìm thấy '$TARGET'."
            continue
        fi

        echo ""
        echo "=========================================="
        echo "  [ BOT: $BOT_NAME ]"
        echo "=========================================="
        echo "  1) Bật"
        echo "  2) Tắt"
        echo "  3) Quay lại danh sách"
        echo "=========================================="
        read -p "Chọn (1-3): " BOT_OPT
        case "$BOT_OPT" in
            1) start_one_bot "$BOT_NAME" ;;
            2) stop_one_bot "$BOT_NAME" ;;
            3) ;;
            *) echo "=> LỖI: Chọn 1-3!" ;;
        esac
        refresh_pane_titles
    done
}

# Menu con tổng: Quản lý tài khoản
account_menu() {
    while true; do
        echo ""
        echo "=========================================="
        echo "  [ QUẢN LÝ TÀI KHOẢN ]"
        echo "=========================================="
        echo "  1) ➕ Thêm tài khoản"
        echo "  2) 🗑️ Xóa tài khoản"
        echo "  3) ▶️⏹️ Chạy / Tắt Bot (chọn theo danh sách)"
        echo "  4) Quay lại Menu chính"
        echo "=========================================="
        read -p "Chọn (1-4): " ACC_OPT
        echo ""
        case "$ACC_OPT" in
            1) add_account ;;
            2) delete_account ;;
            3) toggle_bot_menu ;;
            4) return 0 ;;
            *) echo "=> LỖI: Vui lòng chọn từ 1 đến 4!" ;;
        esac
    done
}

# ==========================================
# HÀM MENU CON (SUB-MENU)
# ==========================================
handle_submenu() {
    local TARGET=$1
    local TITLE=$2
    
    while true; do
        echo ""
        echo "=========================================="
        echo "  [ MỤC $TARGET ] $TITLE"
        echo "=========================================="
        echo "  1) Khởi động (Start)"
        echo "  2) Khởi động lại (Restart)"
        echo "  3) Tắt (Stop)"
        echo "  4) Quay lại Menu chính"
        echo "=========================================="
        read -p "Chọn (1-4): " SUB_OPT
        echo ""
        
        case "$SUB_OPT" in
            1)
                if [ "$TARGET" == "TOÀN BỘ" ]; then start_web; start_bots; fi
                if [ "$TARGET" == "CHỈ BOT" ]; then start_bots; fi
                if [ "$TARGET" == "CHỈ WEB" ]; then start_web; fi
                break
                ;;
            2)
                if [ "$TARGET" == "TOÀN BỘ" ]; then reset_web; reset_bots; fi
                if [ "$TARGET" == "CHỈ BOT" ]; then reset_bots; fi
                if [ "$TARGET" == "CHỈ WEB" ]; then reset_web; fi
                break
                ;;
            3)
                if [ "$TARGET" == "TOÀN BỘ" ]; then stop_bots; stop_web; pkill -f "MinecraftClient" 2>/dev/null; rm -f /tmp/mcc_* 2>/dev/null; fi
                if [ "$TARGET" == "CHỈ BOT" ]; then stop_bots; pkill -f "MinecraftClient" 2>/dev/null; fi
                if [ "$TARGET" == "CHỈ WEB" ]; then stop_web; fi
                break
                ;;
            4) return 0 ;; # Quay lại
            *) echo "=> LỖI: Vui lòng chọn từ 1 đến 4!" ;;
        esac
    done
}

# ==========================================
# MENU ĐIỀU KHIỂN CHÍNH
# ==========================================
# Tự động kích hoạt Web lần đầu khi mở Script
start_web

while true; do
    # Cập nhật title động cho từng pane (đang chạy / "<acc> off")
    refresh_pane_titles
    echo ""
    echo "=========================================="
    echo "       BẢNG ĐIỀU KHIỂN TRUNG TÂM"
    echo "=========================================="
    if tmux has-session -t $SESSION 2>/dev/null; then echo " Trạng thái Bot: [ ĐANG HOẠT ĐỘNG ]"; else echo " Trạng thái Bot: [ ĐÃ TẮT ]"; fi
    if web_is_running; then echo " Trạng thái Web: [ ĐANG HOẠT ĐỘNG ]"; else echo " Trạng thái Web: [ ĐÃ TẮT ]"; fi
    echo "=========================================="
    echo " 1) 🌐 Tùy chỉnh CHỈ WEB DASHBOARD"
    echo " 2) 🤖 Tùy chỉnh CHỈ DÀN BOT"
    echo " 3) 🚀 Tùy chỉnh TOÀN BỘ HỆ THỐNG"
    echo "------------------------------------------"
    echo " 4) 👥 QUẢN LÝ TÀI KHOẢN (Thêm/Xóa/Chạy-Tắt Bot)"
    echo " 5) ❌ Thoát Bảng Điều Khiển"
    echo "=========================================="
    read -p "Hãy nhập số bạn muốn chọn (1-5): " OPTION

    case "$OPTION" in
        1) handle_submenu "CHỈ WEB" "QUẢN LÝ RIÊNG WEB DASHBOARD" ;;
        2) handle_submenu "CHỈ BOT" "QUẢN LÝ RIÊNG DÀN BOT" ;;
        3) handle_submenu "TOÀN BỘ" "QUẢN LÝ ĐỒNG THỜI BOT & WEB" ;;
        4) account_menu ;;
        5)
            echo "=> BẠN CHỌN: Thoát"
            echo "--> Tạm biệt! (Bot và Web nếu đang bật vẫn sẽ chạy ngầm nhé)."
            exit 0
            ;;
        *)
            echo "=> LỖI: Phím bấm không hợp lệ. Vui lòng nhập từ 1 đến 5."
            ;;
    esac
    
    # Tạm dừng màn hình để người dùng kịp đọc thông báo
    echo ""
    read -p "Nhấn Enter để quay lại bảng điều khiển..."
done
