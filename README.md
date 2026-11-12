# Bot AFK cho KingMC

Bộ công cụ này được làm riêng để chạy và quản lý bot AFK trên server Minecraft Java KingMC. Bot hoạt động qua cửa sổ dòng lệnh, không cần mở giao diện trò chơi. Trên Linux có lệnh quản lý nhiều bot và ghi log; trên Windows có bộ cài và trình chạy riêng.

Dự án được sao chép và chỉnh sửa từ [Minecraft Console Client (MCC)](https://github.com/MCCTeam/Minecraft-Console-Client) của **MCCTeam và những người đóng góp**. Đây là phiên bản được phát triển riêng cho mục đích AFK trên KingMC, không phải sản phẩm chính thức của MCCTeam hay KingMC. Mã nguồn MCC được phân phối theo giấy phép [CDDL 1.0](LICENSE).

## Tải về

Tải bản phù hợp tại [Releases](https://github.com/quangkhoa1792013-cell/bot-afk/releases). Bản Windows x64 có tên `bot-afk-windows-x64.zip`. Giải nén vào một thư mục riêng trước khi cài đặt.

Cấu hình và bộ cài được mô tả dưới đây thuộc mã nguồn hiện tại. Các bản phát hành cũ có thể dùng tên `MinecraftClient.ini` cho cấu hình mẫu.

## Cài và chạy trên Windows

1. Giải nén gói Windows và mở `install.bat`.
2. Chọn thư mục cài, nhập tên nhân vật, địa chỉ server và đường dẫn script đăng nhập nếu đã có.
3. Mở `bots/<tên>.bat` để chạy bot. Nhấn `Ctrl+C` hoặc đóng cửa sổ để dừng.

Bộ cài có thể tạo tác vụ trong Task Scheduler để chạy bot khi đăng nhập Windows. Có thể quản lý hoặc tắt tác vụ bằng Task Scheduler. Windows hiện chưa có đầy đủ lệnh quản lý và ghi log như Linux.

## Cài và chạy trên Linux

Chạy bộ cài:

```bash
chmod +x install.sh
./install.sh
```

Nếu gói cài có sẵn `MinecraftClient`, bộ cài hoạt động offline. Nếu chưa có binary, bộ cài cho phép tải bản phát hành hoặc tự build khi máy có .NET SDK. Enter ở bước chọn thư mục sẽ dùng `$HOME/<tên trong game>`; đường dẫn tự nhập được dùng nguyên trạng.

`config.ini` được sao chép thành `bots/<tên bot>.ini`. Tên gọi nhớ có thể để trống để dùng tên trong game. Bộ cài Linux không cài web server hoặc ttyd.

Các lệnh quản lý thường dùng:

```text
bot start <tên>     Chạy một bot
bot start all       Chạy tất cả bot
bot status all      Xem trạng thái
bot attach <tên>    Mở cửa sổ bot
bot restart <tên>   Khởi động lại một bot
bot autostart on <tên>   Bật tự chạy khi máy khởi động
bot autostart off <tên>  Tắt tự khởi động
bot stop <tên>      Dừng một bot
bot stop all        Dừng tất cả bot
bot help            Xem thêm lệnh
```

Bot chạy trong tmux. Để rời cửa sổ mà không tắt bot, nhấn `Ctrl+B`, sau đó nhấn `D`. Nếu lệnh `bot` chưa có trong terminal hiện tại, mở terminal mới sau khi cài đặt.

## Cấu hình và log

`config.ini` ở thư mục ngoài cùng là **mẫu chung**. Khi tạo bot, bộ cài sao chép mẫu thành `bots/<tên>.ini` và thiết lập cho bot đó. Chỉnh file riêng của bot khi cần thay đổi cấu hình; thay đổi `config.ini` chỉ ảnh hưởng đến các bot tạo sau.

Script đăng nhập nằm trong `scripts/` và có thể chứa mật khẩu. Không chia sẻ script, cấu hình cá nhân hay log công khai. Khi chạy bằng lệnh `bot`, log được lưu trong `~/.local/share/bot-afk/logs/bots/<tên>/`; mỗi file ghi từ 04:00 đến trước 04:00 hôm sau theo giờ máy, với thời gian tới mili giây. Một số lệnh đăng nhập thông thường được che mật khẩu, nhưng log vẫn có thể chứa nội dung riêng tư.

## Build từ mã nguồn

Cần .NET SDK 10. Ví dụ build Linux x64:

```bash
dotnet publish mcc-src/MinecraftClient/MinecraftClient.csproj -c Release -r linux-x64 --self-contained true -p:PublishSingleFile=true
```

Thay `linux-x64` bằng `win-x64` để build Windows x64. GitHub Actions cũng build các bản Windows và Linux. Khả năng kết nối phụ thuộc cấu hình và quy định của server; hệ thống chống bot có thể từ chối client.
