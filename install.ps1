# BOT MCC - Installer Windows (PowerShell)
# Dung: powershell -ExecutionPolicy Bypass -File install.ps1
# Co WSL2 -> mode WSL: chay install.sh Linux, bot hoat dong y het Linux (tmux that).
# Khong WSL -> mode native: .bat/.ps1 loop + Task Scheduler (Windows khong co tmux).
param([switch]$Native)

function Expand-PathWin($p) {
    if ($p -eq ".") { return (Get-Location).Path }
    if ($p -eq "~") { return $env:USERPROFILE }
    if ($p.StartsWith("~\")) { return Join-Path $env:USERPROFILE $p.Substring(2) }
    if ($p.StartsWith("~/")) { return Join-Path $env:USERPROFILE $p.Substring(2) }
    if ($p.StartsWith(".\")) { return Join-Path (Get-Location).Path $p.Substring(2) }
    if ($p.StartsWith("./")) { return Join-Path (Get-Location).Path $p.Substring(2) }
    if (-not [IO.Path]::IsPathRooted($p)) { return Join-Path (Get-Location).Path $p }
    return $p
}
function Ask($prompt, $def="") {
    if ($def) { $inp = Read-Host "$prompt [$def]" } else { $inp = Read-Host $prompt }
    if ([string]::IsNullOrWhiteSpace($inp)) { return $def } else { return $inp.Trim() }
}

Write-Host "=== Cài đặt bot Minecraft trên Windows ==="
Write-Host "Chọn thư mục để lưu bot. Nhập dấu chấm (.) nếu muốn dùng thư mục hiện tại."
$targetRaw = Ask "Bạn muốn cài ở đâu?" "."
$targetDir = [IO.Path]::GetFullPath((Expand-PathWin $targetRaw))
Write-Host "Bot sẽ được cài tại: $targetDir"
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
Set-Location $targetDir
$repoDir = $PSScriptRoot
Write-Host "Thư mục hiện tại: $((Get-Location).Path)"

# ------------------------------------------------------------------
# 0) WSL2 mode - chay ban Linux neu co
# ------------------------------------------------------------------
$haveWsl = $false
if (-not $Native -and (Get-Command wsl.exe -ErrorAction SilentlyContinue)) {
    & wsl.exe -e true 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $haveWsl = $true }
}
if ($haveWsl) {
    Write-Host ""
    Write-Host "=== Đã tìm thấy WSL ==="
    Write-Host "Bạn có thể cài bản Linux trong WSL, hoặc tiếp tục với bản Windows."
    Write-Host "Bản Linux có tmux và các lệnh quản lý bot của Linux."
    $useWsl = Ask "Bạn muốn cài bản Linux trong WSL không? (y/n)" "y"
    if ($useWsl -eq "y") {
        $tempSh = Join-Path $env:TEMP "bot-install-wsl.sh"
        $repoFwd = $repoDir -replace '\\', '/'
        $wrap = "cd `"`$(wslpath '$repoFwd')`" && ./install.sh"
        $body = "#!/bin/bash" + [Environment]::NewLine + $wrap + [Environment]::NewLine
        $body | Set-Content -Path $tempSh -Encoding ASCII
        $tempFwd = ($env:TEMP -replace '\\', '/')
        $wslOut = & wsl.exe -e wslpath "$tempFwd/bot-install-wsl.sh" 2>$null
        if ($wslOut) {
            $wslSh = ($wslOut -join " ").Trim()
            Write-Host "Đang chạy bộ cài Linux trong WSL..."
            & wsl.exe -e bash $wslSh
            Write-Host ""
            Write-Host "=== Đã chạy bộ cài WSL ==="
            Write-Host "Nếu không có lỗi ở trên, mở WSL và chạy 'bot <tên bot>'."
            Write-Host "Để xem các bot đang chạy, dùng: tmux attach -t mc_bot"
            exit 0
        } else {
            Write-Host "[!] Không chuyển được đường dẫn sang WSL. Bạn có thể mở WSL và chạy:"
            Write-Host "      cd $repoFwd && ./install.sh"
        }
    }
}

# ------------------------------------------------------------------
# 1) Native Windows mode
# ------------------------------------------------------------------
Write-Host ""
Write-Host "=== Thiết lập bot cho Windows ==="
$botDef = "Player"; $srvDef = "localhost"
$botIn = Ask "Tên nhân vật của bạn là gì? (nhập q để dùng tên mặc định)" $botDef
if ($botIn -eq "q" -or [string]::IsNullOrWhiteSpace($botIn)) { $botName = $botDef } else { $botName = $botIn }
if ($botName -notmatch '^[A-Za-z0-9_]{1,16}$') { throw 'Tên bot phải có 1–16 chữ cái, chữ số hoặc dấu gạch dưới.' }
$srvIn = Ask "Địa chỉ server là gì? (nhập q để dùng địa chỉ mặc định)" $srvDef
if ($srvIn -eq "q" -or [string]::IsNullOrWhiteSpace($srvIn)) { $botServer = $srvDef } else { $botServer = $srvIn }
if ($botServer -notmatch '^[A-Za-z0-9.\-:\[\]]+$') { throw 'Địa chỉ server không hợp lệ. Hãy kiểm tra và thử lại.' }
$botIni = "bots\$botName.ini"
$botScript = "scripts\login_$botName.txt"
Write-Host "Bot: $botName | Server: $botServer"

# --- 1.1 Chon file script ---
Write-Host ""
$scriptIn = Ask "Bạn có script đăng nhập sẵn không? Nhập đường dẫn hoặc để trống để tạo mới" ""
if (-not [string]::IsNullOrWhiteSpace($scriptIn) -and $scriptIn -ne "q") {
    $customPath = Expand-PathWin $scriptIn
    if (Test-Path $customPath) {
        Write-Host "Sẽ dùng script: $customPath"
        $useCustom = $true; $customSrc = $customPath
    } else {
        Write-Host "[!] Không tìm thấy $customPath. Sẽ tạo file mới."
        $useCustom = $false
    }
} else { $useCustom = $false }

# --- 2) Tao cau truc ---
New-Item -ItemType Directory -Force -Path "bots","scripts","logs" | Out-Null

# Sao chep cau hinh mau cho tung bot; ho tro ten cu neu chua co config.ini.
Write-Host "Đang chuẩn bị cấu hình cho $botName..."
if (Test-Path $botIni) { throw "File $botIni đã tồn tại. Hãy chọn tên bot khác để giữ nguyên cấu hình cũ." }
$iniContent = $null
$templateCandidates = @(
    (Join-Path $targetDir 'config.ini'),
    (Join-Path $repoDir 'config.ini'),
    (Join-Path $targetDir 'MinecraftClient.ini'),
    (Join-Path $repoDir 'MinecraftClient.ini')
)
foreach ($template in $templateCandidates) {
    if (Test-Path -LiteralPath $template -PathType Leaf) {
        Copy-Item -LiteralPath $template -Destination $botIni -ErrorAction Stop
        break
    }
}
if (-not (Test-Path $botIni)) {
    $iniContent = @'
[Main.Advanced]
ExitOnFailure = true
CacheScript = true
BrandInfo = "vanilla"
MinecraftVersion = "1.21.11"
TerrainAndMovements = true
InventoryHandling = true
EntityHandling = true

[ChatBot.AutoRelog]
Enabled = true

[ChatBot.ScriptScheduler]
Enabled = true

[[ChatBot.ScriptScheduler.TaskList]]
Task_Name = "auto login __BOT__"
Trigger_On_Login = true
Trigger_On_Times = { Enable = false, Times = [] }
Trigger_On_Interval = { Enable = false, MinTime = 1.0, MaxTime = 10.0 }
Action = "script __SCRIPT__"
'@.Replace('__BOT__', $botName).Replace('__SCRIPT__', $botScript)
    # Encoding ASCII de tranh BOM lam lo hang dau file ini
    $iniContent | Set-Content $botIni -Encoding ASCII
}
$configText = [IO.File]::ReadAllText((Join-Path $targetDir $botIni))
$configText = $configText -replace 'ExitOnFailure\s*=\s*false', 'ExitOnFailure = true'
$configText = $configText -replace 'TerrainAndMovements\s*=\s*false', 'TerrainAndMovements = true'
$configText = $configText -replace 'EnableSentry\s*=\s*true', 'EnableSentry = false'
$noConfirm = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('a2jDtG5nIHjDoWMgbmjhuq1uIMSRxrDhu6NjIGNsaWVudA=='))
$temporaryBlock = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('dOG6oW0gdGjhu51pIGLhu4sgY2jhurduIGLhu59pIGjhu4cgdGjhu5FuZyBjaOG7kW5nIGJvdA=='))
$maintenance = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('YuG6o28gdHLDrA=='))
$restart = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('TcOBWSBDSOG7piBLSOG7nkkgxJDhu5hORyBM4bqgSQ=='))
$relogConfig = @'
[ChatBot.AutoRelog]
Enabled = true
Delay = { min = 90.0, max = 150.0 }
Retries = -1
Ignore_Kick_Message = false
Kick_Messages = ["Connection has been lost", "Server is restarting", "Server is full", "bao tri", "__MAINTENANCE__", "__RESTART__", "__NO_CONFIRM__", "__TEMP_BLOCK__"]

'@.Replace('__NO_CONFIRM__', $noConfirm).Replace('__TEMP_BLOCK__', $temporaryBlock).Replace('__MAINTENANCE__', $maintenance).Replace('__RESTART__', $restart)
$configText = [regex]::Replace($configText, '(?ms)^\[ChatBot\.AutoRelog\].*?(?=^\[ChatBot\.|\z)', $relogConfig)
$configText = [regex]::Replace($configText, '(?ms)^\[ChatBot\.ScriptScheduler\].*?(?=^\[ChatBot\.(?!ScriptScheduler)|\z)', @'
[ChatBot.ScriptScheduler]
Enabled = true

[[ChatBot.ScriptScheduler.TaskList]]
Task_Name = "Login script"
Trigger_On_First_Login = false
Trigger_On_Login = true
Trigger_On_Times = { Enable = false, Times = [] }
Trigger_On_Interval = { Enable = false, MinTime = 1.0, MaxTime = 10.0 }
Action = "script __SCRIPT__"

'@.Replace('__SCRIPT__', $botScript.Replace('\', '/')))
[IO.File]::WriteAllText((Join-Path $targetDir $botIni), $configText, (New-Object System.Text.UTF8Encoding($false)))

# --- 2.1 Tao script login ---
if ($useCustom) {
    if (Test-Path $botScript) { throw "File $botScript đã tồn tại; script cũ sẽ được giữ nguyên." }
    Copy-Item $customSrc $botScript
    Write-Host "Đã sao chép script vào $botScript."
} elseif (-not (Test-Path $botScript)) {
    Write-Host ""
    Write-Host "=== Script đăng nhập ==="
    $loginInput = Ask "Nhập lệnh đăng nhập server, hoặc để trống để tự sửa script sau" ""
    if ([string]::IsNullOrWhiteSpace($loginInput)) {
        $scriptText = @'
# Hay sua file nay - them lenh login cua ban
# Vi du:
# wait 140
# send /dn __BOT__
'@.Replace('__BOT__', $botName)
        [IO.File]::WriteAllText((Join-Path $targetDir $botScript), $scriptText, (New-Object System.Text.UTF8Encoding($false)))
        Write-Host "Đã tạo $botScript. Bạn có thể mở file này để thêm lệnh đăng nhập."
    } else {
        $scriptText = @'
send da hoat dong
wait 140
send __LOGIN__
wait 60
send __LOGIN__
wait 60
inventory 0 click 40
wait 60
inventory 1 click 24
wait 60
send /afk
wait 40
inventory 1 click 22
'@.Replace('__LOGIN__', $loginInput)
        [IO.File]::WriteAllText((Join-Path $targetDir $botScript), $scriptText, (New-Object System.Text.UTF8Encoding($false)))
        Write-Host "Đã tạo script đăng nhập tại $botScript. Hãy giữ file này riêng tư."
    }
}

# --- 2.2 Tao runner: bots\<ten>.bat + bots\<ten>.ps1 (tu lieu, khong xin template) ---
$botBat = "bots\$botName.bat"
$botPs1 = "bots\$botName.ps1"

$batContent = @'
@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0__BOT__.ps1"
exit /b %ERRORLEVEL%
'@.Replace('__BOT__', $botName).Replace('__SRV__', $botServer).Replace('__INI__', $botIni)
$batContent | Set-Content $botBat -Encoding ASCII
Write-Host "Đã tạo file chạy bot: $botBat"

$psContent = @'
# BOT: __BOT__ @ __SRV__ - PowerShell runner (thay cho tmux tren Windows)
Set-Location (Join-Path $PSScriptRoot "..")
while ($true) {
    $now = Get-Date
    $c = $now.Hour*60 + $now.Minute
    if ($c -ge 240 -and $c -lt 320) {
        Write-Host "Đang trong giờ bảo trì 04:00–05:20. Sẽ kiểm tra lại sau 30 giây."
        Start-Sleep 30
        continue
    }
    Write-Host ("Đang kết nối... " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss"))
    $p = Start-Process -Wait -PassThru -NoNewWindow -FilePath ".\MinecraftClient.exe" -ArgumentList @("__INI__", "__BOT__", "-", "__SRV__")
    Write-Host ("Bot đã thoát (mã " + $p.ExitCode + "). Sẽ thử lại sau 70 giây.")
    Start-Sleep 70
}
'@.Replace('__BOT__', $botName).Replace('__SRV__', $botServer).Replace('__INI__', $botIni)
[IO.File]::WriteAllText((Join-Path $targetDir $botPs1), $psContent, (New-Object System.Text.UTF8Encoding($true)))
Write-Host "Đã tạo script chạy bot: $botPs1"

# --- 2.3 MinecraftClient.exe ---
if (-not (Test-Path "MinecraftClient.exe")) {
    if (Test-Path "$repoDir\MinecraftClient.exe") {
        Copy-Item "$repoDir\MinecraftClient.exe" "MinecraftClient.exe"
        Write-Host "Đã sao chép MinecraftClient.exe từ thư mục cài đặt."
    } else {
        $arch = "win-x64"
        if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { Write-Host '[!] Windows ARM cần hỗ trợ chạy ứng dụng x64.' }
        Write-Host "Chưa có MinecraftClient.exe. Đang tìm bản $arch trên GitHub..."
        $asset = $null
        try {
            $rel = Invoke-RestMethod "https://api.github.com/repos/quangkhoa1792013-cell/bot-afk/releases/latest" -TimeoutSec 15
            $asset = $rel.assets | Where-Object { $_.name -eq "MinecraftClient-$arch.exe" } | Select-Object -First 1
        } catch { Write-Host "[!] Không truy cập được trang phát hành của dự án." }
        if ($asset -and $asset.browser_download_url) {
            try {
                Invoke-WebRequest -Uri $asset.browser_download_url -OutFile "MinecraftClient.exe" -UseBasicParsing
            } catch { Write-Host "[!] Không tải được file: $($_.Exception.Message)" }
        }
        if (Test-Path "MinecraftClient.exe") {
            Write-Host "Đã tải bản $arch về MinecraftClient.exe."
        } else {
            Write-Host "[!] Tải tự động không thành công. Bạn có thể tải thủ công tại:"
            Write-Host "    https://github.com/quangkhoa1792013-cell/bot-afk/releases"
            Write-Host "    Sau đó đặt file 'MinecraftClient.exe' vào $((Get-Location).Path)"
            throw 'Chưa tìm thấy MinecraftClient.exe của dự án.'
        }
    }
} else {
    Write-Host "Đã có MinecraftClient.exe, không cần tải lại."
}

# --- 3) Alias bot -> USERPROFILE\.local\bin\bot.bat (ghi de file cu neu co) ---
Write-Host ""
$needAlias = Ask "Bạn có muốn thêm lệnh 'bot' vào terminal không? (y/n)" "y"
if ($needAlias -eq "y") {
    $localBin = Join-Path $env:USERPROFILE ".local\bin"
    New-Item -ItemType Directory -Force -Path $localBin | Out-Null
    $aliasPath = Join-Path $localBin "bot.bat"
    $aliasContent = @'
@echo off
REM Quan ly MCC Bot - chi can go 'bot' hoac 'bot <ten>'
set "BOT_DIR=__TARGET__\bots"
if "%~1"=="" (
    for %%f in ("%BOT_DIR%\*.bat") do echo %%~nf
    echo Dung: bot ^<ten^>  (vd: bot __BOT__)
) else (
    if exist "%BOT_DIR%\%~1.bat" (
        call "%BOT_DIR%\%~1.bat"
    ) else (
        echo Khong thay bot %~1
        dir /b "%BOT_DIR%\*.bat"
    )
)
'@.Replace('__TARGET__', $targetDir).Replace('__BOT__', $botName)
    # Xoa file alias kiem tim cu (khai giu PATH nguoi dung)
    if (Test-Path "$env:USERPROFILE\bot.bat") {
        Remove-Item "$env:USERPROFILE\bot.bat" -Force -ErrorAction SilentlyContinue
        Write-Host "Đã xóa lệnh bot cũ tại $env:USERPROFILE\bot.bat."
    }
    # Ghi de file (neu co - Set-Content tranh dong chay lai mau cu)
    $aliasContent | Set-Content $aliasPath -Encoding ASCII
    Write-Host "Đã lưu lệnh bot tại $aliasPath."
    # Dam bao .local\bin nam trong PATH cua User (khong lam vo PATH hien tai)
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($null -eq $userPath) { $userPath = "" }
    if ($userPath -notlike "*" + $localBin + "*") {
        if ([string]::IsNullOrEmpty($userPath)) { $newPath = $localBin }
        elseif ($userPath.EndsWith(";")) { $newPath = "$userPath$localBin" }
        else { $newPath = "$userPath;$localBin" }
        [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
        $env:Path = "$env:Path;$localBin"
        Write-Host "Đã thêm $localBin vào PATH. Hãy mở terminal mới để dùng lệnh bot."
    }
    Write-Host "    Gõ 'bot' để xem danh sách, hoặc 'bot $botName' để chạy bot."
}

# --- 4) Task Scheduler (chay ngam luc khoi Windows) ---
Write-Host ""
$needTask = Ask "Bạn có muốn bot tự chạy khi đăng nhập Windows không? (y/n)" "y"
if ($needTask -eq "y") {
    $taskName = "MC_Bot_$botName"
    $tr = "`"$targetDir\bots\$botName.bat`""
    schtasks /create /tn $taskName /tr $tr /sc onlogon /rl limited /f 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Đã tạo task $taskName. Bot sẽ chạy khi bạn đăng nhập Windows."
        Write-Host "    Chạy ngay:  schtasks /run /tn $taskName"
        Write-Host "    Xem task:   schtasks /query /tn $taskName"
        Write-Host "    Xóa task:   schtasks /delete /tn $taskName /f"
    } else {
        Write-Host "[!] Không tạo được task. Hãy kiểm tra quyền và thử lại, hoặc chạy bot thủ công:"
        Write-Host "    $targetDir\bots\$botName.bat"
    }
} else {
    Write-Host "Đã bỏ qua Task Scheduler. Bạn có thể chạy bot thủ công bằng $targetDir\bots\$botName.bat."
}

Write-Host ""
Write-Host "=== Cài đặt xong ==="
Write-Host "Thư mục bot: $targetDir"
Write-Host "Để chạy, mở bots\$botName.bat hoặc gõ 'bot $botName' trong terminal mới."
