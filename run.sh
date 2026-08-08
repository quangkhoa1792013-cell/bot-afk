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
    echo " 4) ➕ Thêm tài khoản Bot mới"
    echo " 5) ❌ Thoát Bảng Điều Khiển"
    echo "=========================================="
    read -p "Hãy nhập số bạn muốn chọn (1-5): " OPTION

    case "$OPTION" in
        1) handle_submenu "CHỈ WEB" "QUẢN LÝ RIÊNG WEB DASHBOARD" ;;
        2) handle_submenu "CHỈ BOT" "QUẢN LÝ RIÊNG DÀN BOT" ;;
        3) handle_submenu "TOÀN BỘ" "QUẢN LÝ ĐỒNG THỜI BOT & WEB" ;;
        4)
            echo "=> BẠN CHỌN: Thêm Bot mới"
            read -p "Tên tài khoản (vd: acc1): " ACC_NAME
            if [ -z "$ACC_NAME" ]; then
                echo "--> LỖI: Tên không được để trống!"
            else
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
            fi
            ;;
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
