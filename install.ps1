# BOT MCC - Installer Windows (PowerShell)
# Dung: powershell -ExecutionPolicy Bypass -File install.ps1
# Co WSL2 -> mode WSL: chay install.sh Linux, bot hoat dong y het Linux (tmux that).
# Khong WSL -> mode native: .bat/.ps1 loop + Task Scheduler (Windows khong co tmux).
param()

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

Write-Host "=== BOT MCC Installer Windows ==="
Write-Host "Thu muc cai dat (. cho hien tai, ho tro ~, .\, tuyet doi)"
$targetRaw = Ask "Nhap vi tri thu muc" "."
$targetDir = [IO.Path]::GetFullPath((Expand-PathWin $targetRaw))
Write-Host "[*] Se cai tai: $targetDir"
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
Set-Location $targetDir
$repoDir = $PSScriptRoot
Write-Host "[*] Dang o: $((Get-Location).Path)"

# ------------------------------------------------------------------
# 0) WSL2 mode - chay ban Linux neu co
# ------------------------------------------------------------------
$haveWsl = $false
if (Get-Command wsl.exe -ErrorAction SilentlyContinue) {
    & wsl.exe -e true 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $haveWsl = $true }
}
if ($haveWsl) {
    Write-Host ""
    Write-Host "=== Phat hien WSL ==="
    Write-Host "Windows khong co tmux native. WSL2 chay duoc Linux that, bot hoat dong"
    Write-Host "y het Linux: tmux session song ca khi dong cua so, CLI 'bot', AutoRelog..."
    $useWsl = Ask "Chay cai dat Linux trong WSL ngay? (y/n)" "y"
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
            Write-Host "[*] Dang chay install.sh ben trong WSL ($wslSh)..."
            & wsl.exe -e bash $wslSh
            Write-Host ""
            Write-Host "=== XONG mode WSL ==="
            Write-Host "Neu ben tren khong loi: mo WSL (go 'wsl') roi chay 'bot <ten bot>'."
            Write-Host "Bot da chay trong tmux session 'mc_bot' - mo lai: tmux attach -t mc_bot"
            exit 0
        } else {
            Write-Host "[!] Khong lay duoc path qua wslpath ($tempSh) - lam thu cong:"
            Write-Host "    Mo WSL roi chay:"
            Write-Host "      cd $repoFwd && ./install.sh"
        }
    }
}

# ------------------------------------------------------------------
# 1) Native Windows mode
# ------------------------------------------------------------------
Write-Host ""
Write-Host "=== Config ten va server (mode native: khong tmux, bot tu giu trong .bat/.ps1 loop) ==="
$botDef = "geasf"; $srvDef = "kingmc.vn"
$botIn = Ask "Ten bot (dung lam ten file, mac dinh $botDef, go q giu mac dinh)" $botDef
if ($botIn -eq "q" -or [string]::IsNullOrWhiteSpace($botIn)) { $botName = $botDef } else { $botName = $botIn }
if ($botName -match '[\\/:*?"<>|\s]') {
    $clean = $botName -replace '[\\/:*?"<>|\s]', '_'
    Write-Host "[!] Ten '$botName' co ky tu khong duoc cho ten file doi thanh: $clean"
    $botName = $clean
}
$srvIn = Ask "Server (mac dinh $srvDef, go q giu mac dinh)" $srvDef
if ($srvIn -eq "q" -or [string]::IsNullOrWhiteSpace($srvIn)) { $botServer = $srvDef } else { $botServer = $srvIn }
$botIni = "bots\$botName.ini"
$botScript = "scripts\login_$botName.txt"
Write-Host "[*] Se dung: ten=$botName, server=$botServer"

# --- 1.1 Chon file script ---
Write-Host ""
$scriptIn = Ask "Nhap path den file script co san (de trong = tao file moi)" ""
if (-not [string]::IsNullOrWhiteSpace($scriptIn) -and $scriptIn -ne "q") {
    $customPath = Expand-PathWin $scriptIn
    if (Test-Path $customPath) {
        Write-Host "[*] Se dung file ban chi: $customPath"
        $useCustom = $true; $customSrc = $customPath
    } else {
        Write-Host "[!] Khong thay $customPath - tao file moi"
        $useCustom = $false
    }
} else { $useCustom = $false }

# --- 2) Tao cau truc ---
New-Item -ItemType Directory -Force -Path "bots","scripts","logs" | Out-Null

# Tao bots\<ten>.ini: uu tien MinecraftClient.ini (ban repo) -> khong thi tao toi thieu
Write-Host "[*] Tao $botIni ..."
$iniContent = $null
if (Test-Path "$targetDir\MinecraftClient.ini") {
    Copy-Item "$targetDir\MinecraftClient.ini" $botIni -Force -ErrorAction SilentlyContinue
} elseif (Test-Path "$repoDir\MinecraftClient.ini") {
    Copy-Item "$repoDir\MinecraftClient.ini" $botIni -Force
}
if (-not (Test-Path $botIni)) {
    $iniContent = @'
[Main.Advanced]
ExitOnFailure = true
CacheScript = true
BrandInfo = "fabric"
MinecraftVersion = "1.21.11"
InventoryHandling = true
EntityHandling = true

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
(Get-Content $botIni) -replace 'ExitOnFailure = false','ExitOnFailure = true' | Set-Content $botIni -Encoding ASCII

# --- 2.1 Tao script login ---
if ($useCustom) {
    Copy-Item $customSrc $botScript -Force
    Write-Host "[*] Da copy script $customSrc -> $botScript"
} elseif (-not (Test-Path $botScript)) {
    Write-Host ""
    Write-Host "=== Script login (tu dong chay khi vao server) ==="
    $loginInput = Ask "Nhap lenh login (vd: /dn $botName), de trong = file rong" ""
    if ([string]::IsNullOrWhiteSpace($loginInput)) {
        @'
# Hay sua file nay - them lenh login cua ban
# Vi du:
# wait 140
# send /dn __BOT__
'@.Replace('__BOT__', $botName) | Set-Content $botScript -Encoding ASCII
        Write-Host "[!] Da tao $botScript RONG - hay mo va sua lai!"
    } else {
        @'
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
'@.Replace('__LOGIN__', $loginInput) | Set-Content $botScript -Encoding ASCII
        Write-Host "[*] Da tao $botScript voi lenh $loginInput"
    }
}

# --- 2.2 Tao runner: bots\<ten>.bat + bots\<ten>.ps1 (tu lieu, khong xin template) ---
$botBat = "bots\$botName.bat"
$botPs1 = "bots\$botName.ps1"

$batContent = @'
@echo off
setlocal enabledelayedexpansion
title MCC Bot __BOT__
REM Baton __BOT__ @ __SRV__ - chay lai vong lap, tu dong skip bao tri 04:00-05:20
cd /d "%~dp0.."
set "ACCOUNT=__BOT__"
set "SERVER=__SRV__"
set "INI=__INI__"
:notconnected
for /f "tokens=1,2 delims=:" %%a in ("%time: =0%") do (set "CH=%%a" & set "CM=%%b")
set /a CUR_TOTAL=(1%CH%-100)*60+(1%CM%-100) 2>nul
if %CUR_TOTAL% GEQ 240 if %CUR_TOTAL% LSS 320 (
    echo Bao tri 04:00-05:20, nghi 30s truoc thu lai...
    timeout /t 30 /nobreak >nul
    goto notconnected
)
echo Dang ket noi: MinecraftClient %INI% %ACCOUNT% - %SERVER%
MinecraftClient.exe "%INI%" "%ACCOUNT%" - "%SERVER%"
echo Thoat exit %errorlevel%
echo Nghi 70s roi thu lai (tranh chan IP spam connect)
timeout /t 70 /nobreak >nul
goto notconnected
'@.Replace('__BOT__', $botName).Replace('__SRV__', $botServer).Replace('__INI__', $botIni)
$batContent | Set-Content $botBat -Encoding ASCII
Write-Host "[*] Tao $botBat"

$psContent = @'
# BOT: __BOT__ @ __SRV__ - PowerShell runner (thay cho tmux tren Windows)
Set-Location (Join-Path $PSScriptRoot "..")
while ($true) {
    $now = Get-Date
    $c = $now.Hour*60 + $now.Minute
    if ($c -ge 240 -and $c -lt 320) {
        Write-Host "Bao tri 04:00-05:20, nghi 30s..."
        Start-Sleep 30
        continue
    }
    Write-Host ("Dang ket noi: " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss"))
    $p = Start-Process -Wait -PassThru -FilePath ".\MinecraftClient.exe" -ArgumentList @("__INI__", "__BOT__", "-", "__SRV__")
    Write-Host ("Thoat exit " + $p.ExitCode + " - doi 70s")
    Start-Sleep 70
}
'@.Replace('__BOT__', $botName).Replace('__SRV__', $botServer).Replace('__INI__', $botIni)
$psContent | Set-Content $botPs1 -Encoding ASCII
Write-Host "[*] Tao $botPs1"

# --- 2.3 MinecraftClient.exe ---
if (-not (Test-Path "MinecraftClient.exe")) {
    if (Test-Path "$repoDir\MinecraftClient.exe") {
        Copy-Item "$repoDir\MinecraftClient.exe" "MinecraftClient.exe"
        Write-Host "[*] Copy MinecraftClient.exe tu thu muc repo"
    } else {
        $arch = "win-x64"
        if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { $arch = "win-arm64" }
        Write-Host "[*] Chua co MinecraftClient.exe - tai ban moi ($arch) tu GitHub..."
        $asset = $null
        try {
            $rel = Invoke-RestMethod "https://api.github.com/repos/MCCTeam/Minecraft-Console-Client/releases/latest" -TimeoutSec 15
            $asset = $rel.assets | Where-Object { $_.name -like "*$arch*" } | Select-Object -First 1
        } catch { Write-Host "[!] API GitHub loi - thu fallback URL" }
        if ($asset -and $asset.browser_download_url) {
            try {
                Invoke-WebRequest -Uri $asset.browser_download_url -OutFile "MinecraftClient.exe" -UseBasicParsing
            } catch { Write-Host "[!] Tai that bai: $($_.Exception.Message)" }
        }
        if (Test-Path "MinecraftClient.exe") {
            Write-Host "[*] Da tai $arch -> MinecraftClient.exe"
        } else {
            Write-Host "[!] Tai that bai - tai tay tu:"
            Write-Host "    https://github.com/MCCTeam/Minecraft-Console-Client/releases"
            Write-Host "    Dat file 'MinecraftClient.exe' tai $((Get-Location).Path)"
        }
    }
} else {
    Write-Host "[*] MinecraftClient.exe san co - bo qua tai"
}

# --- 3) Alias bot -> USERPROFILE\.local\bin\bot.bat (ghi de file cu neu co) ---
Write-Host ""
$needAlias = Ask "Them lenh 'bot'? (y/n)" "y"
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
        Write-Host "[*] Xoa alias cu $env:USERPROFILE\bot.bat (doi sang $aliasPath)"
    }
    # Ghi de file (neu co - Set-Content tranh dong chay lai mau cu)
    $aliasContent | Set-Content $aliasPath -Encoding ASCII
    Write-Host "[*] Ghi de alias tai $aliasPath"
    # Dam bao .local\bin nam trong PATH cua User (khong lam vo PATH hien tai)
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($null -eq $userPath) { $userPath = "" }
    if ($userPath -notlike "*" + $localBin + "*") {
        if ([string]::IsNullOrEmpty($userPath)) { $newPath = $localBin }
        elseif ($userPath.EndsWith(";")) { $newPath = "$userPath$localBin" }
        else { $newPath = "$userPath;$localBin" }
        [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
        $env:Path = "$env:Path;$localBin"
        Write-Host "[*] Da them $localBin vao PATH (mo terminal moi de ap dung)"
    }
    Write-Host "    Dung: bot (liet ke) hoac bot $botName"
}

# --- 4) Task Scheduler (chay ngam luc khoi Windows) ---
Write-Host ""
$needTask = Ask "Tao Task chay ngam khi khoi Windows? (y/n)" "y"
if ($needTask -eq "y") {
    $taskName = "MC_Bot_$botName"
    $tr = "`"$targetDir\bots\$botName.bat`""
    schtasks /create /tn $taskName /tr $tr /sc onlogon /rl highest /f 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[*] Da tao Task $taskName (bat dau moc chay khi khoi dong)"
        Write-Host "    Chay ngay:  schtasks /run /tn $taskName"
        Write-Host "    Xem:        schtasks /query /tn $taskName"
        Write-Host "    Xoa:        schtasks /delete /tn $taskName /f"
    } else {
        Write-Host "[!] Khong tao duoc Task - can chay PowerShell o che do Admin (run as Administrator)"
        Write-Host "    (ho bo qua va chay tay: $targetDir\bots\$botName.bat)"
    }
} else {
    Write-Host "[*] Bo qua Task Scheduler - chay tay: $targetDir\bots\$botName.bat hoac bot $botName"
}

Write-Host ""
Write-Host "=== XONG (mode native Windows) ==="
Write-Host "Thu muc: $targetDir"
Write-Host "Chay thu: bots\$botName.bat  hoac  bot $botName"
Write-Host "Copy sang may khac: chi can copy thu muc $repoDir roi chay install.ps1 (khong can cai them gi)"
