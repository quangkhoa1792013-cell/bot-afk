# Minecraft Console Client Bot - Windows

Ban phat hanh Windows x64 gom `MinecraftClient.exe`, cau hinh mau va bo cai dat. Tren Windows ARM64, may can ho tro chay ung dung x64.

## Cai dat

1. Tai `bot-afk-windows-x64.zip` tu Releases, giai nen vao thu muc rieng.
2. Chay `install.bat`, hoac chay `powershell -ExecutionPolicy Bypass -File install.ps1 -Native`.
3. Nhap ten nhan vat, dia chi server va tuy chon script dang nhap. Khong chia se script dang nhap hay thu muc ca nhan vi co the chua mat khau.
4. Chay file `bots\<ten>.bat` vua duoc tao. Dung bot bang Ctrl+C hoac dong cua so. Neu chon Task Scheduler, co the dung hoac tat task tu Task Scheduler cua Windows.

Installer khong ghi de cau hinh bot co san va khong tai binary cua mot du an khac. Khi tai binary tu release, installer su dung tai nguyen duoc GitHub Actions build cho repo nay.

## Build tu source

Can .NET SDK 10. Chay `dotnet test mcc-src/MinecraftClient.Tests/MinecraftClient.Tests.csproj -c Release` va `dotnet publish mcc-src/MinecraftClient/MinecraftClient.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true`.

Bot native Windows dung PowerShell va Task Scheduler thay cho tmux va systemd. Cac lenh quan ly bot Linux khong tu dong co tren Windows. Khong co gi dam bao vuot duoc moi co che anti-bot cua server; hay tuan theo quy dinh cua server.

MCC la phan mem cua cac tac gia duoc ghi nhan trong LICENSE; giay phep goc duoc giu lai.
