# 📬 Bot-mail — Self-Hosted Temporary Email Receiver

Nhận email **catch-all** (mọi địa chỉ `*@khoablabla.ddns.net` hoặc `*@*`), tự động bóc mã **OTP** và **link kích hoạt**, gửi thông báo qua **Telegram Bot**, hiển thị trên **Web Dashboard realtime** — toàn bộ chạy trên máy local.

![Stack](https://img.shields.io/badge/Stack-Node.js%20%2B%20TypeScript-blue) ![License](https://img.shields.io/badge/License-MIT-green)

## ✨ Tính năng

| Tính năng | Mô tả |
|---|---|
| 🤖 **Quản lý Profile (Web-in-Web)** | 1 Profile = 1 bot: gán `assigned_email` + `target_url` web local. CRUD đầy đủ, danh sách bên Sidebar, bấm vào Profile → mở workspace nhúng web bot qua **iframe** (tab 🌐 Bot Web) + **hòm thư riêng** của email đó (tab 📥 Mail) |
| 🔔 **Báo mail theo Profile** | Mail gửi tới `assigned_email` của Profile nào → **flash + badge** ngay trên card/tab Profile đó (realtime qua SSE), kèm toast riêng cho từng Profile |
| 🗂 Lưu trữ Profile | File `data/profiles.json` (JSON thuần, dễ copy/di chuyển sang máy khác) |
| 📫 Địa chỉ hòm thư | **Tạo trước** các địa chỉ `ten@khoablabla.ddns.net` (đặt tên + ghi chú), đổi tên, xóa. Mail tới địa chỉ **chưa tạo bị từ chối** (550) |
| 📥 SMTP Receiver | Lắng nghe port 25, chỉ nhận mail tới địa chỉ đã tạo **hoặc assigned_email của Profile** (hoặc bật `CATCH_ALL=true`), không cần xác thực, **không relay** |
| 🔑 OTP Extractor | Regex thông minh bóc mã 4–8 chữ số (ưu tiên vùng keyword "mã xác nhận / otp / verification code") + link kích hoạt |
| 🤖 Telegram Notify | Gửi tin nhắn ngay khi có mail: `📩 Mail tới / 👤 Từ / 📌 Tiêu đề / 🔑 Mã OTP` |
| 🌐 Web Dashboard | List mail live (SSE), xem chi tiết (HTML/text), OTP highlight, tải attachment |
| ✍️ Soạn & gửi mail | Gửi ra ngoài qua SMTP provider (Gmail/Outlook/Zoho...) cấu hình từ UI |
| 🗂 Quản lý | Đánh dấu đã đọc/chưa đọc, yêu thích, xóa từng mail, xóa tất cả, hộp "đã gửi" |
| 🗄 Lưu trữ | SQLite (`data/mail.db`) — không mất mail khi tắt máy |
| 🧹 Tự dọn dẹp | Xóa tự động mail cũ hơn 24h (cấu hình được `MAIL_TTL_HOURS`) |

## 📁 Cấu trúc dự án

```
bot-mail/
├── src/
│   ├── index.ts                 # Entry point: khởi động mọi service
│   ├── config.ts                # Cấu hình từ .env
│   ├── types.ts                 # Kiểu dữ liệu chung
│   ├── events/bus.ts            # Event bus (SMTP -> SSE/Telegram)
│   ├── db/
│   │   ├── database.ts          # SQLite schema (node:sqlite built-in)
│   │   └── mail.repository.ts   # CRUD mail/attachment/sent/settings
│   ├── profiles/
│   │   └── profile.repository.ts# Profile CRUD -> data/profiles.json (JSON)
│   ├── smtp/server.ts           # SMTP server port 25 (duyệt mailbox + profile email)
│   ├── parser/
│   │   ├── message.parser.ts    # mailparser: raw -> các trường
│   │   └── otp.extractor.ts     # Regex OTP + link extractor
│   ├── notifications/telegram.ts# Telegram Bot API (fetch, có retry)
│   ├── mailer/send.service.ts   # nodemailer: gửi mail ra ngoài
│   ├── api/
│   │   ├── app.ts               # Express + serve web/dist (Vite build)
│   │   └── routes/              # mails.ts, send.ts, events.ts (SSE),
│   │                            # mailboxes.ts, profiles.ts
│   └── cleanup/janitor.ts       # Dọn mail > 24h định kỳ
├── web/                         # Dashboard (Vite + React + Tailwind CSS)
│   ├── vite.config.ts           # dev :5173, proxy /api -> :3000
│   ├── index.html
│   └── src/
│       ├── main.ts / style.css  # theme dark glassmorphism
│       ├── store.ts             # state + API + SSE + toast
│       └── components/          # Sidebar, Profiles, ProfileWorkspace (iframe),
│                                # ProfileMailList, ProfileModal, MailList,
│                                # MailDetail, ComposeModal, SettingsModal, Toasts
├── data/mail.db                 # SQLite (tự tạo khi chạy)
├── data/profiles.json           # Danh sách Profile (JSON, tự tạo khi chạy)
├── .env                         # Cấu hình (copy từ .env.example)
└── package.json
```

## 🚀 Cài đặt & chạy

### 1. Cài dependencies

```bash
cd /home/khoablabla/bot-mail
npm install
```

### 2. Cấu hình (`cp .env.example .env` rồi sửa)

```ini
SMTP_PORT=25              # Giữ 25 để nhận mail thật (hoặc 2525 nếu test không sudo)
WEB_PORT=3000             # Dashboard
MAIL_TTL_HOURS=24         # Tự xóa mail sau 24h
# Telegram (tạo bot qua @BotFather, lấy chatId qua @userinfobot)
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

> 💡 Telegram & SMTP outbound **cũng có thể nhập trực tiếp trên Dashboard → ⚙️ Cài đặt** (lưu vào DB, không cần sửa .env).

### 3. Chạy app (3 cách — chọn 1)

**Dev mode (tự reload): API :3000 + UI :5173**

```bash
npm run dev
# UI:   http://localhost:5173  (Vite dev server, proxy /api -> :3000)
# API:  http://localhost:3000  (cần sudo nếu SMTP_PORT=25)
```

> Khi chỉ sửa UI dùng `npm run dev:web`, chỉ sửa backend dùng `npm run dev:api`.

**Cách A — Production: chạy bằng sudo (đơn giản nhất)**

```bash
npm run build
sudo npm start
# UI:   http://localhost:3000  (web/dist do Vite build)
```

**Cách B — Cấp capability cho node (không cần sudo mỗi lần)**

```bash
# Cấp quyền bind port thấp (<1024) cho binary node (chỉ làm 1 lần)
sudo setcap 'cap_net_bind_service=+ep' $(which node)

# Sau đó chạy như user thường
npm run dev        # hoặc npm run build && npm start
```

> ⚠️ Nếu dùng nvm, `which node` trỏ vào bản hiện tại; nếu đổi version node phải chạy lại lệnh này. Có thể thay bằng `sudo setcap ... $(readlink -f $(which node))`.

**Cách C — systemd service (chạy nền, tự khởi động khi boot máy)**

Tạo file `/etc/systemd/system/bot-mail.service`:

```ini
[Unit]
Description=Bot-mail Temporary Email Receiver
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/khoablabla/bot-mail
ExecStart=/usr/bin/node /home/khoablabla/bot-mail/dist/index.js
Restart=always
# Cần quyền root để bind port 25; hoặc bỏ dòng này nếu đã setcap
User=root
AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
```

```bash
npm run build
sudo systemctl daemon-reload
sudo systemctl enable --now bot-mail
sudo systemctl status bot-mail   # kiểm tra
```

### 4. Kiểm tra xung đột port 25

Nếu máy đã cài postfix/sendmail, chúng có thể chiếm port 25:

```bash
sudo ss -tlnp | grep :25
# Nếu thấy postfix/sendmail -> tắt chúng:
sudo systemctl stop postfix sendmail 2>/dev/null
sudo systemctl disable postfix sendmail 2>/dev/null
```

### 5. Truy cập dashboard

```
Dev:   http://localhost:5173        (Vite, cần `npm run dev`)
Prod:  http://localhost:3000        (hoặc http://192.168.1.50:3000 từ máy khác)
```

### 6. Kiểm tra mail đến (khi SMTP đang chạy)

```bash
# Từ 1 máy khác trên cùng mạng:
swaks --to test1@khoablabla.ddns.net --from you@gmail.com \
  --header "Subject: Test OTP" --body "Ma xac nhan cua ban la: 482913"
```

Hoặc dùng thư viện tự kiểm tra nội bộ (xem mục Test bên dưới).

## 🤖 Quản lý Profile (Web-in-Web) — dùng thế nào

1. Vào **Sidebar → Quản lý Profile → ➕ Tạo Profile**, nhập:
   - **Tên**: vd `Discord Bot 01`
   - **assigned_email**: vd `bot01@khoablabla.ddns.net` (SMTP sẽ nhận mail gửi tới địa chỉ này, kể cả khi chưa tạo ở "Địa chỉ hòm thư")
   - **target_url**: URL web local của bot, vd `http://localhost:8080`
   - **notes** + **status** (Active/Inactive)
2. Bấm vào Profile (trong Sidebar hoặc trên card) → workspace mở ra:
   - **🌐 Bot Web**: nhúng web local của bot qua `<iframe>` (kèm nút 🔄 tải lại / ↗ mở tab mới)
   - **📥 Mail**: hòm thư riêng của `assigned_email` — search, đọc, đánh dấu, xóa
   - **ℹ️ Thông tin**: chi tiết + ghi chú + nút tạm tắt/kích hoạt
3. Mail mới gửi tới `assigned_email` của Profile nào → card/tab Profile đó **flash + badge** ngay, kèm toast `🤖 <tên profile> vừa nhận mail` (OTP được tô vàng).

> 💡 Nếu iframe trống: bot web của bạn có thể chặn nhúng bằng header `X-Frame-Options` — dùng nút **↗ Tab mới** thay thế. Dashboard và bot nên chạy cùng một máy (cùng `localhost`) để iframe hoạt động ổn định.

## 🔑 Cách hoạt động

```
Internet ──> Router (forward port 25) ──> 192.168.1.50:25
                                            │ smtp-server (catch-all)
                                            ▼
                              mailparser (sender/recipient/subject/text/html/att)
                                            ▼
                              SQLite (data/mail.db)  +  OTP Extractor
                                            │
                              ┌─────────────┴──────────────┐
                              ▼                            ▼
                     Telegram Bot (thông báo ngay)   SSE → Dashboard realtime
```

- **MX/DNS**: domain `khoablabla.ddns.net` cần trỏ tới `192.168.1.50` (A record DDNS). MX record không bắt buộc nếu đối tác gửi mail theo tên domain; nếu cần, đặt MX trỏ vào chính domain.
- **Server chỉ NHẬN mail, không RELAY** — không thể bị lợi dụng thành open relay.

## 🔌 API tóm tắt

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/api/profiles` | Danh sách Profile (kèm `mailCount` + `unreadCount` của assigned_email) |
| POST | `/api/profiles` | Tạo Profile `{name, assignedEmail, targetUrl?, notes?, status?}` |
| PATCH | `/api/profiles/:id` | Sửa (mọi field optional; trùng tên/email → 409) |
| DELETE | `/api/profiles/:id` | Xóa Profile |
| GET | `/api/profiles/:id/mails?search=&limit=` | Mail gửi tới đúng assigned_email của Profile |
| GET | `/api/mailboxes` | Danh sách địa chỉ hòm thư (kèm số mail mỗi địa chỉ) |
| POST | `/api/mailboxes` | Tạo địa chỉ `{name, note}` |
| PATCH | `/api/mailboxes/:id` | Sửa `{name?, note?}` (đổi tên = đổi địa chỉ) |
| DELETE | `/api/mailboxes/:id` | Xóa địa chỉ |
| GET | `/api/mails?folder=&search=&mailbox=&limit=` | Danh sách mail (folder: inbox/unread/favorite; `mailbox=ten` lọc theo địa chỉ hòm thư) |
| GET | `/api/mails/:id` | Chi tiết mail + attachment |
| GET | `/api/mails/:id/attachments/:fileId` | Xem/tải attachment (MIME theo đuôi file; `inline` mặc định, `?download=1` tải về; 404 JSON nếu không có) |
| GET | `/api/stats` | Số liệu badges (total/unread/favorite) |
| PATCH | `/api/mails/:id` | `{read?, favorite?}` |
| DELETE | `/api/mails/:id` | Xóa 1 mail |
| DELETE | `/api/mails` | Xóa tất cả |
| POST | `/api/send` | Gửi mail (`{to, subject, text}`) |
| POST | `/api/send/test` | Test kết nối SMTP |
| GET | `/api/sent` | Hộp đã gửi |
| GET/PUT | `/api/settings*` | Cấu hình SMTP/Telegram |
| GET | `/api/events` | **SSE** — push mail mới realtime (kèm `profileIds` khớp assigned_email) + `profiles-changed` |
| GET | `/api/health` | Health check |

## 🧪 Test toàn bộ luồng (tự động)

```bash
# 1. Chạy app ở 1 terminal (test port cao không cần sudo):
SMTP_PORT=2525 npm run dev

# 2. Terminal khác:
npm run build && node test/smoke.js

# Test riêng tính năng Quản lý Profile (CRUD + mail tới assigned_email + SSE):
npm run test:profile
```

Script sẽ gửi 3 mail mẫu (OTP + link kích hoạt + attachment) vào port 2525 rồi
verify chúng xuất hiện qua API `/api/mails` kèm OTP bóc tách đúng.

## 📝 Ghi chú vận hành

- **Backup**: chỉ cần copy `data/mail.db` + `data/profiles.json` (dạng file đơn lẻ).
- **Giới hạn**: mail > 25MB bị từ chối (`552`); tối đa 50 người nhận/mail.
- **Bảo mật**: dashboard không có auth — nếu muốn lộ ra internet, đặt sau reverse proxy (Caddy/Nginx) có basic-auth, hoặc chạy trên VPN/Tailscale thay vì mở port.
- Port `WEB_PORT` (3000) không cần mở trên router trừ khi muốn truy cập dashboard từ ngoài.

## 🛠 Troubleshooting

| Vấn đề | Cách xử lý |
|---|---|
| `EACCES: permission denied ... listen 25` | Chạy bằng `sudo`, hoặc `setcap`, hoặc systemd `AmbientCapabilities` |
| `EADDRINUSE` port 25 | Tắt postfix/sendmail (`sudo ss -tlnp | grep :25`) |
| `attempt to write a readonly database` | Từng chạy bằng `sudo` tạo `data/mail.db` do root sở hữu. Sửa: `sudo chown -R $USER data` hoặc `sudo rm -rf data` (dữ liệu cũ sẽ mất) |
| `Cannot GET /` ở dev | Đã fix (dùng `process.cwd()`); pull code mới và chạy lại `npm run dev` |
| UI cũ (trang đơn giản) vẫn hiện | Đang chạy instance cũ — dừng nó (Ctrl+C) rồi `npm run build && sudo npm start` lại |
| Test từ Gmail không tới | Gmail cache MX; thử gửi từ Outlook/điện thoại hoặc dùng `swaks` |
| Telegram không báo | Kiểm tra token/chatId trên @BotFather và @userinfobot; bot phải được chat "khởi động" bởi `/start` |
| Gửi mail lỗi | Dùng App Password (Gmail 2FA) thay cho mật khẩu thường; test qua nút "🧪 Test kết nối" |