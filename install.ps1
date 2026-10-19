# BOT MCC - Installer Windows PowerShell
# Dung nhu ban Linux: hoi thu muc, ten, server, file script, alias, Task Scheduler
param()

function Expand-PathWin($p) {
    if ($p -eq ".") { return (Get-Location).Path }
    if ($p -eq "~") { return $env:USERPROFILE }
    if ($p -like "~/*") { return $p -replace "^~", $env:USERPROFILE }
    if ($p -like ".\*") { return Join-Path (Get-Location).Path $p.Substring(2) }
    if (-not [IO.Path]::IsPathRooted($p)) { return Join-Path (Get-Location).Path $p }
    return $p
}
function Ask($prompt, $def="") {
    if ($def) { $inp = Read-Host "$prompt [$def]" } else { $inp = Read-Host $prompt }
    if ([string]::IsNullOrWhiteSpace($inp)) { return $def } else { return $inp }
}

Write-Host "=== BOT MCC Installer Windows (PowerShell) ==="
Write-Host "Thu muc cai dat (dung . cho hien tai, ho tro ~, .\, tuyet doi)"
$targetRaw = Ask "Nhap vi tri thu muc" "."
$targetDir = Expand-PathWin $targetRaw
$targetDir = [IO.Path]::GetFullPath($targetDir)
Write-Host "[*] Se cai tai: $targetDir"
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
Set-Location $targetDir
Write-Host "[*] Dang o: $(Get-Location)"

# --- Chon ten & server ---
Write-Host ""
$botDef = "geasf"; $srvDef = "kingmc.vn"
$botIn = Ask "Ten bot (mac dinh $botDef, go q giu mac dinh)" $botDef
if ($botIn -eq "q" -or [string]::IsNullOrWhiteSpace($botIn)) { $botName = $botDef } else { $botName = $botIn }
$srvIn = Ask "Server (mac dinh $srvDef, go q giu mac dinh)" $srvDef
if ($srvIn -eq "q" -or [string]::IsNullOrWhiteSpace($srvIn)) { $botServer = $srvDef } else { $botServer = $srvIn }
Write-Host "[*] Se dung: ten=$botName, server=$botServer"
$botIni = "bots\$botName.ini"
$botScript = "scripts\login_$botName.txt"

# --- Chon file script ---
Write-Host ""
$defScript = $botScript
Write-Host "File script mac dinh: $defScript (cua minh)"
$scriptIn = Ask "Nhap path den file script (go q de dung cua minh)" "q"
if ($scriptIn -eq "q" -or [string]::IsNullOrWhiteSpace($scriptIn)) {
    Write-Host "[*] Dung script mac dinh"
    $useCustom = $false
} else {
    $customPath = Expand-PathWin $scriptIn
    if (Test-Path $customPath) {
        Write-Host "[*] Se dung file ban chi: $customPath"
        $useCustom = $true; $customSrc = $customPath
    } else {
        Write-Host "[!] Khong thay $customPath, dung mac dinh"
        $useCustom = $false
    }
}

# --- Tao cau truc ---
New-Item -ItemType Directory -Force -Path "bots","scripts","logs" | Out-Null
Write-Host "[*] Tao $botIni ..."
if (Test-Path "$targetDir\MinecraftClient.ini") {
    Copy-Item "$targetDir\MinecraftClient.ini" $botIni -Force -ErrorAction SilentlyContinue
} elseif (Test-Path "$PSScriptRoot\MinecraftClient.ini") {
    Copy-Item "$PSScriptRoot\MinecraftClient.ini" $botIni -Force
} else {
    @"
[Main.Advanced]
ExitOnFailure = true
CacheScript = true
BrandInfo = "vanilla"
MinecraftVersion = "1.21.11"
InventoryHandling = true
EntityHandling = true
[ChatBot.ScriptScheduler]
Enabled = true
[[ChatBot.ScriptScheduler.TaskList]]
Task_Name = "auto login $botName"
Trigger_On_Login = true
Trigger_On_Times = { Enable = false, Times = [] }
Trigger_On_Interval = { Enable = false, MinTime = 1.0, MaxTime = 10.0 }
Action = "script $botScript"
"@ | Set-Content $botIni -Encoding UTF8
}
# Dam bao dung
(Get-Content $botIni) -replace 'ExitOnFailure = false','ExitOnFailure = true' | Set-Content $botIni

if ($useCustom) {
    Copy-Item $customSrc $botScript -Force
    Write-Host "[*] Da copy script $customSrc -> $botScript"
} elseif (-not (Test-Path $botScript)) {
    Write-Host ""
    Write-Host "=== Script login (tu dong chay khi vao server) ==="
    Write-Host "De trong = tao file rong, tu sua sau"
    $loginInput = Ask "Nhap lenh login (vd: /dn YourNick) hoac de trong" ""
    if ([string]::IsNullOrWhiteSpace($loginInput)) {
        @"
# Hay sua file nay - them lenh login cua ban
# Vi du:
# wait 140
# send /dn YourNick
"@ | Set-Content $botScript -Encoding UTF8
        Write-Host "[!] Da tao $botScript RONG - hay mo va sua lai!"
    } else {
        @"
send da hoat dong
wait 140
send $loginInput
wait 60
send $loginInput
wait 60
inventory 0 click 40
wait 60
inventory 1 click 24
wait 60
send /afk
wait 40
inventory 1 click 22
"@ | Set-Content $botScript -Encoding UTF8
        Write-Host "[*] Da tao $botScript voi lenh $loginInput"
    }
}

# Tao bot ps1/bat
$botSh = "bots\$botName.ps1"
$botBat = "bots\$botName.bat"
# Copy tu file mau da co, thay ten/server
Copy-Item "$PSScriptRoot\bots\geasf.ps1" $botSh -Force -ErrorAction SilentlyContinue
Copy-Item "$PSScriptRoot\bots\geasf.bat" $botBat -Force -ErrorAction SilentlyContinue
# Thay the neu copy duoc
if (Test-Path $botSh) {
    (Get-Content $botSh) -replace 'geasf',$botName | Set-Content $botSh
    (Get-Content $botSh) -replace 'kingmc\.vn',$botServer | Set-Content $botSh
}
if (Test-Path $botBat) {
    (Get-Content $botBat) -replace 'geasf',$botName | Set-Content $botBat
    (Get-Content $botBat) -replace 'kingmc\.vn',$botServer | Set-Content $botBat
}
Write-Host "[*] Tao $botSh / $botBat"

# MinecraftClient.exe
if (-not (Test-Path "MinecraftClient.exe")) {
    if (Test-Path "$PSScriptRoot\MinecraftClient.exe") {
        Copy-Item "$PSScriptRoot\MinecraftClient.exe" "MinecraftClient.exe"
        Write-Host "[*] Copy MinecraftClient.exe"
    } else {
        Write-Host "[*] Dang tai MinecraftClient.exe tu GitHub..."
        $arch="win-x64"; if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { $arch="win-arm64" }
        try {
            $api = Invoke-RestMethod "https://api.github.com/repos/MCCTeam/Minecraft-Console-Client/releases/latest" -TimeoutSec 10
            $url = ($api.assets | Where-Object { $_.name -like "*$arch*" }).browser_download_url | Select-Object -First 1
            if (-not $url) { $url="https://github.com/MCCTeam/Minecraft-Console-Client/releases/latest/download/MinecraftClient.exe" }
            Invoke-WebRequest -Uri $url -OutFile "MinecraftClient.exe" -UseBasicParsing
            Write-Host "[*] Da tai MinecraftClient.exe"
        } catch { Write-Host "[!] Tai that bai, tai tay tu https://github.com/MCCTeam/Minecraft-Console-Client/releases" }
    }
}

# Alias - tao bot.bat o %USERPROFILE%
$needAlias = Ask "Them alias bot? (y/n)" "y"
if ($needAlias -eq "y") {
    $aliasPath = "$env:USERPROFILE\bot.bat"
    @"
@echo off
set "BOT_DIR=$targetDir\bots"
if "%~1"=="" (
    powershell -NoProfile -Command "Get-ChildItem '%BOT_DIR%\*.bat' | Where-Object { `$_.Name -notlike '*_tmux*' } | ForEach-Object { `$_.BaseName }"
    echo Dung: bot ^<ten^>  (vd: bot $botName)
) else (
    if exist "%BOT_DIR%\%~1.bat" ( call "%BOT_DIR%\%~1.bat" ) else ( echo Khong thay bot %~1 & dir /b "%BOT_DIR%\*.bat" )
)
"@ | Set-Content $aliasPath -Encoding ASCII
    Write-Host "[*] Da tao $aliasPath - them %USERPROFILE% vao PATH neu chua co"
    Write-Host "    Dung: bot  hoac  bot $botName"
}

# Windows khong co tmux - dung Task Scheduler + loop trong .bat/.ps1 thay the
# (Linux dung tmux, Windows dung loop + Task Scheduler de chay ngam)
# Task Scheduler
if ($needTask -eq "y") {
    $taskName = "MC_Bot_$botName"
    $tr = "`"$targetDir\bots\$botName.bat`""
    schtasks /create /tn $taskName /tr $tr /sc onlogon /rl highest /f 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[*] Da tao Task $taskName"
        Write-Host "    Chay ngay: schtasks /run /tn $taskName"
        Write-Host "    Xoa: schtasks /delete /tn $taskName /f"
    } else { Write-Host "[!] Can chay PowerShell voi admin de tao Task" }
}

Write-Host ""
Write-Host "=== XONG ==="
Write-Host "Thu muc: $targetDir"
Write-Host "Chay thu: bots\$botName.bat  hoac  bot $botName"
Write-Host "Copy sang may khac: chi can copy install.ps1/install.bat va chay"
