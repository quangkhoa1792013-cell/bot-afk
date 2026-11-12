# Cài bot trên Windows

Tải `bot-afk-windows-x64.zip` từ [Releases](https://github.com/quangkhoa1792013-cell/bot-afk/releases) và giải nén vào một thư mục riêng. Bản này chạy trên Windows x64; Windows ARM cần hỗ trợ chạy ứng dụng x64.

1. Mở `install.bat` và nhập thư mục cài, tên nhân vật, địa chỉ server cùng script đăng nhập nếu có.
2. Mở `bots/<tên>.bat` để chạy. Nhấn `Ctrl+C` hoặc đóng cửa sổ để dừng.
3. Nếu chọn tạo tác vụ tự khởi động, dùng Task Scheduler để quản lý tác vụ chạy khi đăng nhập Windows.

`config.ini` là cấu hình mẫu: bộ cài sao chép nó thành `bots/<tên>.ini` cho từng bot. Bộ cài cũng hỗ trợ tên mẫu cũ `MinecraftClient.ini`. Bot đã có cấu hình sẽ không bị bộ cài ghi đè. Các bản phát hành cũ có thể vẫn dùng tên mẫu cũ.

Script đăng nhập và cấu hình riêng có thể chứa thông tin tài khoản; không đưa các file này lên mạng. Windows chưa có đầy đủ lệnh quản lý và ghi log của bản Linux.

## Build từ mã nguồn

Cần .NET SDK 10:

```powershell
dotnet test mcc-src/MinecraftClient.Tests/MinecraftClient.Tests.csproj -c Release
dotnet publish mcc-src/MinecraftClient/MinecraftClient.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true
```

Dự án dựa trên [Minecraft Console Client của MCCTeam](https://github.com/MCCTeam/Minecraft-Console-Client); xem [giấy phép](../LICENSE).
