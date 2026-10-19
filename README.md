# bot-afk (bot-manager nhánh)

Bot AFK Minecraft (MCC) đã patch để pass anti-bot KingMC (Velocity): gửi brand `fabric` trước ClientInformation, đăng ký 44 kênh mod như client thật, `PlayerLoaded` đúng lúc nạp world, im lặng trong pha configuration.

## Cài đặt

```bash
git clone https://github.com/quangkhoa1792013-cell/bot-afk.git
cd bot-afk
./install.sh            # hỏi thư mục, tạo bot, alias `bot`, tùy chọn systemctl
bot <tên>               # chạy bot (tự vào tmux)
bot help                # xem lệnh: list/status/add/remove/kill/download
```

Script login nằm ở `scripts/login_<tên>.txt` — sửa mật khẩu vào đó (đừng commit mật khẩu thật!).

## Binary MinecraftClient

Không commit binary (quá lớn). Tải từ tab **Releases** (build tự động bởi GitHub Actions cho `linux-x64` + `linux-arm64`), hoặc build tay:

```bash
dotnet publish mcc-src/MinecraftClient/MinecraftClient.csproj -c Release --arch x64 -o .
```

Cần .NET SDK 10.0.

## Cấu trúc

- `install.sh` — installer: tạo bot, alias `bot`, tab-completion, tùy chọn systemd/ttyd/download
- `bots/` — mỗi bot 1 bộ `.sh` + `.ini` (+ `_tmux.sh` quản lý session chung `mc_bot`)
- `scripts/` — script login, công cụ debug (`record_proxy.py` ghi packet qua proxy)
- `mcc-src/` — mã nguồn MCC đã patch (Protocol/Handlers/Protocol18.cs, Settings.cs)
- `systemd/` — unit files mẫu
- `download.py` — web download nhẹ cho portal
