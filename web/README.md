# ⛏️ AFK Bot Control — Web Dashboard

Web điều khiển dàn bot Minecraft bằng **Flask**, đẹp + animation, đổi tab bằng **hover chuột kiểu Hyprland** (focus follows mouse). Mọi dữ liệu live (log chat, trạng thái bot, captcha) đẩy qua **WebSocket** — cập nhật liên tục, không giật.

## ✨ Tính năng

| Tab | Chức năng |
|---|---|
| 📊 Tổng quan | Trạng thái dàn bot, terminal, discord, captcha; nút bấm nhanh start/stop/restart |
| 🎮 Điều khiển | Chạy trực tiếp `run.sh` trong terminal web (xterm.js) |
| 🤖 Quản lý Bot | Bật/tắt account, thêm bot mới, xóa + **log & chat LIVE** từng bot |
| 🧩 CAPTCHA | Xem ảnh map captcha render + nhập mã, hoặc gửi lên Discord |

- 🖱️ **Hover đổi tab**: chỉ riêng tab Quản lý Bot — rê chuột tới là tự chuyển (nút toggle góc phải)
- ⚡ **Live qua WebSocket**: log chat 0.5s, trạng thái bot 1s, captcha mới xuất hiện tức thì — không re-render toàn bộ, không giật
- 🔀 **2 chế độ xem log bot**: **Chia ô** (kiểu ttyd — thấy tất cả bot cùng lúc) / **Một ô** (chọn 1 bot xem to)
- 🧩 **CAPTCHA → Discord**: bridge render map thành ảnh, gửi kèm **tên tài khoản** lên Discord + web. Gõ `!submit <mã>` hoặc nhập trên web
- ✅ **Không sửa logic `run.sh`** — dashboard điều khiển qua terminal PTY

## 🚀 Chạy tại máy (local)

```bash
cd web
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Node deps cho captcha_discord.js
npm install

# Cấu hình Discord (tuỳ chọn)
cp config.example.json config.json
# điền discord_token, discord_channel_id, username...

python3 app.py
```

Mở trình duyệt: **http://localhost:7860**

> ⚠️ `run.sh` dùng port 7681 (ttyd) — web này dùng port **7860**, không xung đột.
> ⚠️ Khi web khởi động nó tự dọn run.sh rác — đừng chạy `./run.sh` tay song song với web, hãy dùng tab **Điều khiển**.

## 📁 Cấu trúc thư mục

```
bot/                          ← thư mục gốc (KHÔNG đổi khi move web)
├── run.sh                    # Script điều khiển chính (không sửa logic)
├── MinecraftClient           # Trình client
├── accounts.json             # Danh sách tài khoản
├── bots/*.sh                 # Script chạy từng bot
├── scripts/*.txt             # Script lệnh MinecraftClient
├── captcha_dumps/            # Ảnh captcha đã render
├── node_modules/             # (chia sẻ với bot.js, captcha.js)
└── web/                      ← MỌI THỨ CỦA WEB NẰM TRONG NÀY
    ├── app.py                # Flask server
    ├── requirements.txt
    ├── config.json           # Cấu hình captcha + Discord (gitignored)
    ├── captcha_discord.js    # Bridge captcha → Discord
    ├── templates/index.html
    ├── static/css|js|vendor/ # giao diện + xterm.js (local)
    ├── logs/bots/*.log       # Log & chat thực tế từng bot
    ├── Dockerfile            # Cho Hugging Face Spaces
    └── README.md
```

## 🧩 Chạy CAPTCHA Discord Bridge

Nút **▶ Chạy captcha bridge** ngay trên web (tab CAPTCHA), hoặc:

```bash
cd web && node captcha_discord.js
```

- Bot kết nối server → khi nhận map captcha → render PNG → lưu `captcha_dumps/<acc>_map_dump_<ts>.png` + gửi lên Discord kèm tên tài khoản
- Gõ trong Discord: `!submit AB12CD` → bot gõ `/captcha AB12CD` trong game
- Hoặc nhập mã ngay trên web (tab CAPTCHA) — bot đọc từ `captcha_submit.txt`

## 🔑 Discord token

⚠️ **QUAN TRỌNG**: token Discord là bí mật. Nếu token đã từng bị lộ (vd: gửi trong chat), hãy **tạo lại token mới** tại [Discord Developer Portal](https://discord.com/developers/applications) → mục Bot → Reset Token, rồi cập nhật `web/config.json`.

## ☁️ Deploy lên Hugging Face Spaces

> ⚠️ Space dạng **Docker** (chạy được tmux + MinecraftClient + node) **yêu cầu gói trả phí** (PRO). Tài khoản free chỉ tạo được Static Space (không chạy được Flask). Nếu bạn có PRO:

```bash
pip install -U huggingface_hub
hf auth login

hf repos create NS/afk-bot-control --type space --space-sdk docker --public --exist-ok
hf upload NS/afk-bot-control . --repo-type space \
  --exclude "**/__pycache__/**" "node_modules" ".venv" "web/config.json" "captcha_dumps" "web/logs" "run.log" "web_log.txt" "*.ini"
hf spaces logs NS/afk-bot-control --follow
```

- Space dùng `web/Dockerfile`, app chạy port `7860`
- `web/config.json` không đẩy lên — dùng **Secrets**: `hf spaces secrets set NS/afk-bot-control DISCORD_TOKEN=...`
- Trên Space, `/data` bị xóa mỗi lần restart — máy local mới là nơi chạy chính thức

## 🛠 API

| Endpoint | Mô tả |
|---|---|
| `GET /api/status` | Trạng thái hệ thống |
| `GET /api/bots/status` | Trạng thái từng bot (1 lần pgrep duy nhất) |
| `GET /api/botlog/<tên>` | 500 dòng log gần nhất của bot |
| `POST /api/accounts/*` | toggle / add / delete (accounts.json) |
| `POST /api/terminal/action` | `start_bots` / `stop_bots` / `restart_bots` / `restart_web` / `start_web` |
| `GET /api/captchas` · `POST /api/captcha/submit` | Danh sách ảnh / gửi mã |
| `POST /api/captcha/bridge` | start / stop captcha bridge |
| `WS /ws/term` | Terminal chạy `run.sh` |
| `WS /ws/events` | Sự kiện live: log, botstate, status, captcha |
