# bot-afk (bot-manager)

Bot manager Minecraft dựa trên **fork của Minecraft-Console-Client (MCCTeam)**, đã patch để qua được lớp chống bot Velocity (KingShield) kiểu KingMC: brand từ client thật gửi trước ClientInformation, đăng ký đúng danh sách kênh mod, `PlayerLoaded` gửi đúng lúc nạp world, im lặng trong pha configuration.

Giấy phép gốc của MCC được giữ nguyên theo **CDDL 1.0** — xem [LICENSE](LICENSE).

## Cài đặt

```bash
git clone https://github.com/quangkhoa1792013-cell/bot-afk.git
cd bot-afk
./install.sh            # hỏi thư mục + tên bot, tạo bot, alias `bot`, tùy chọn systemd/ttyd/download
bot <tên>               # chạy bot (mở tmux)
bot help                # list/status/add/remove/kill/download...
```

Cần binary `MinecraftClient` trong thư mục cài — lấy ở tab **Releases** (GitHub Actions tự build `linux-x64` + `linux-arm64`) hoặc tự build:

```bash
dotnet publish mcc-src/MinecraftClient/MinecraftClient.csproj -c Release --arch x64 -o .
```

Cần .NET SDK 10.0.

## Cấu trúc repo

- `install.sh` (+ `install.bat`, `install.ps1`) — installer: tạo bot mới từ `MinecraftClient.ini` + `bots/geasf.ini` (template), sinh `bots/<tên>.sh` + `scripts/login_<tên>.txt` tại máy cài
- `bots/_bot` + `bots/bot-completion.bash` — lệnh `bot` và tab-completion
- `download.py` — trang tải binary đơn giản qua LAN
- `mcc-src/` — toàn bộ mã nguồn MCC fork (patch nằm chủ yếu ở `Protocol/Handlers/Protocol18.cs`, `Settings.cs`, `McClient.cs`)
- `LICENSE` — CDDL 1.0 của MCCTeam/Minecraft-Console-Client

## Lưu ý

- Mật khẩu đăng nhập nằm trong `scripts/login_<tên>.txt` **chỉ tồn tại trên máy cài**, không được commit.
- Repo không chứa binary — build tự động bằng [`.github/workflows/build.yml`](.github/workflows/build.yml).
