@echo off
REM ============================================================
REM  BOT MCC - Installer Windows
REM  Hoi thu muc, tao file, them alias, tuy chon Task Scheduler
REM  Dung duoc khi copy sang may khac: chi can chay install.bat
REM ============================================================
setlocal enabledelayedexpansion

echo === BOT MCC Installer Windows ===
echo Thu muc cai dat (dung . cho hien tai, ho tro ~, .\, tuyet doi)
echo   Vi du: .  ^|  %%USERPROFILE%%\bot  ^|  C:\bot  ^|  .\bot
set "DEF_DIR=%cd%"
set /p TARGET_RAW="Nhap vi tri thu muc [.]: "
if "%TARGET_RAW%"=="" set "TARGET_RAW=."
REM Xu ly ~ -> %USERPROFILE%
if "%TARGET_RAW:~0,1%"=="~" (
    set "TARGET_RAW=%USERPROFILE%%TARGET_RAW:~1%"
)
REM Xu ly . -> hien tai
if "%TARGET_RAW%"=="." set "TARGET_RAW=%CD%"
if "%TARGET_RAW:~0,2%"==".\" set "TARGET_RAW=%CD%\%TARGET_RAW:~2%"
REM Chuan hoa
for %%I in ("%TARGET_RAW%") do set "TARGET_DIR=%%~fI"
echo [*] Se cai tai: %TARGET_DIR%
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%" 2>nul
pushd "%TARGET_DIR%" 2>nul || (echo [!] Khong vao duoc %TARGET_DIR% & exit /b 1)
echo [*] Dang o: %CD%

REM --- 1.5 Chon ten va server (q = mac dinh) ---
echo.
echo === Config ten va server ===
set "BOT_NAME_DEF=geasf"
set "BOT_SERVER_DEF=kingmc.vn"
set /p BOT_NAME_INPUT="Ten bot (mac dinh %BOT_NAME_DEF%, go q giu mac dinh): "
if "%BOT_NAME_INPUT%"=="q" set "BOT_NAME=%BOT_NAME_DEF%"
if "%BOT_NAME_INPUT%"=="Q" set "BOT_NAME=%BOT_NAME_DEF%"
if "%BOT_NAME_INPUT%"=="" set "BOT_NAME=%BOT_NAME_DEF%"
if not "%BOT_NAME_INPUT%"=="q" if not "%BOT_NAME_INPUT%"=="Q" if not "%BOT_NAME_INPUT%"=="" set "BOT_NAME=%BOT_NAME_INPUT%"
set /p BOT_SERVER_INPUT="Server (mac dinh %BOT_SERVER_DEF%, go q giu mac dinh): "
if "%BOT_SERVER_INPUT%"=="q" set "BOT_SERVER=%BOT_SERVER_DEF%"
if "%BOT_SERVER_INPUT%"=="Q" set "BOT_SERVER=%BOT_SERVER_DEF%"
if "%BOT_SERVER_INPUT%"=="" set "BOT_SERVER=%BOT_SERVER_DEF%"
if not "%BOT_SERVER_INPUT%"=="q" if not "%BOT_SERVER_INPUT%"=="Q" if not "%BOT_SERVER_INPUT%"=="" set "BOT_SERVER=%BOT_SERVER_INPUT%"
echo [*] Se dung: ten=%BOT_NAME%, server=%BOT_SERVER%

REM --- 1.6 Chon file script (nhap path thang file do, q = dung cua minh) ---
echo.
set "BOT_SCRIPT=scripts\login_%BOT_NAME%.txt"
echo File script mac dinh: %BOT_SCRIPT% (cua minh)
set /p SCRIPT_INPUT="Nhap path den file script (go q de dung cua minh) [q]: "
if "%SCRIPT_INPUT%"=="" set "SCRIPT_INPUT=q"
if "%SCRIPT_INPUT%"=="q" goto use_default_script
if "%SCRIPT_INPUT%"=="Q" goto use_default_script
if not exist "%SCRIPT_INPUT%" (
    echo [!] Khong thay %SCRIPT_INPUT%, se dung mac dinh
    goto use_default_script
)
set "USE_CUSTOM_SCRIPT=y"
set "CUSTOM_SCRIPT_SRC=%SCRIPT_INPUT%"
goto after_script_choice
:use_default_script
set "USE_CUSTOM_SCRIPT=n"
:after_script_choice
if "%USE_CUSTOM_SCRIPT%"=="y" (
    echo [*] Se dung file ban chi: %CUSTOM_SCRIPT_SRC%
)

REM --- 2. Tao cau truc & file ---
if not exist "bots" mkdir bots
if not exist "scripts" mkdir scripts
if not exist "logs" mkdir logs

REM Tao bots\%BOT_NAME%.ini tu MinecraftClient.ini neu co
set "BOT_INI=bots\%BOT_NAME%.ini"
echo [*] Tao %BOT_INI% ...
if exist "MinecraftClient.ini" (
    copy /Y "MinecraftClient.ini" "%BOT_INI%" >nul 2>&1
) else if exist "%~dp0MinecraftClient.ini" (
    copy /Y "%~dp0MinecraftClient.ini" "%BOT_INI%" >nul 2>&1
) else (
    REM Tao ini toi thieu - dung config day du moi vao duoc
    > "%BOT_INI%" echo [Main.Advanced]
    >>"%BOT_INI%" echo ExitOnFailure = true
    >>"%BOT_INI%" echo CacheScript = true
    >>"%BOT_INI%" echo BrandInfo = "fabric"
    >>"%BOT_INI%" echo MinecraftVersion = "1.21.11"
    >>"%BOT_INI%" echo InventoryHandling = true
    >>"%BOT_INI%" echo EntityHandling = true
    >>"%BOT_INI%" echo [ChatBot.ScriptScheduler]
    >>"%BOT_INI%" echo Enabled = true
    >>"%BOT_INI%" echo [[ChatBot.ScriptScheduler.TaskList]]
    >>"%BOT_INI%" echo Task_Name = "auto login %BOT_NAME%"
    >>"%BOT_INI%" echo Trigger_On_Login = true
    >>"%BOT_INI%" echo Trigger_On_Times = { Enable = false, Times = [] }
    >>"%BOT_INI%" echo Trigger_On_Interval = { Enable = false, MinTime = 1.0, MaxTime = 10.0 }
    >>"%BOT_INI%" echo Action = "script %BOT_SCRIPT%"
)
REM Dam bao ExitOnFailure=true
powershell -Command "(Get-Content '%BOT_INI%') -replace 'ExitOnFailure = false','ExitOnFailure = true' | Set-Content '%BOT_INI%'" 2>nul

REM Tao script - hoi noi dung, de trong = file rong
if "%USE_CUSTOM_SCRIPT%"=="y" (
    copy /Y "%CUSTOM_SCRIPT_SRC%" "%BOT_SCRIPT%" >nul
    echo [*] Da copy script tu %CUSTOM_SCRIPT_SRC% -^> %BOT_SCRIPT%
) else (
    if not exist "%BOT_SCRIPT%" (
        echo.
        echo === Script login (tu dong chay khi vao server) ===
        echo De trong = tao file rong, tu sua sau tai %BOT_SCRIPT%
        set "LOGIN_INPUT="
        set /p LOGIN_INPUT="Nhap lenh login (vd: /dn YourNick) hoac de trong: "
        if "!LOGIN_INPUT!"=="" (
            > "%BOT_SCRIPT%" echo # Hay sua file nay - them lenh login cua ban
            >>"%BOT_SCRIPT%" echo # Vi du: wait 140
            >>"%BOT_SCRIPT%" echo # send /dn YourNick
            echo [!] Da tao %BOT_SCRIPT% RONG - hay mo va sua lai truoc khi chay bot!
        ) else (
            > "%BOT_SCRIPT%" echo send da hoat dong
            >>"%BOT_SCRIPT%" echo wait 140
            >>"%BOT_SCRIPT%" echo send !LOGIN_INPUT!
            >>"%BOT_SCRIPT%" echo wait 60
            >>"%BOT_SCRIPT%" echo send !LOGIN_INPUT!
            >>"%BOT_SCRIPT%" echo wait 60
            >>"%BOT_SCRIPT%" echo inventory 0 click 40
            >>"%BOT_SCRIPT%" echo wait 60
            >>"%BOT_SCRIPT%" echo inventory 1 click 24
            >>"%BOT_SCRIPT%" echo wait 60
            >>"%BOT_SCRIPT%" echo send /afk
            >>"%BOT_SCRIPT%" echo wait 40
            >>"%BOT_SCRIPT%" echo inventory 1 click 22
            echo [*] Da tao %BOT_SCRIPT% voi lenh !LOGIN_INPUT!
        )
    )
)

REM Tao bots\%BOT_NAME%.bat
set "BOT_BAT=bots\%BOT_NAME%.bat"
> "%BOT_BAT%" echo @echo off
>>"%BOT_BAT%" echo setlocal enabledelayedexpansion
>>"%BOT_BAT%" echo cd /d "%%~dp0.."
>>"%BOT_BAT%" echo set "ACCOUNT=%BOT_NAME%"
>>"%BOT_BAT%" echo set "SERVER=%BOT_SERVER%"
>>"%BOT_BAT%" echo set "INI=%BOT_INI%"
>>"%BOT_BAT%" echo :loop
>>"%BOT_BAT%" echo for /f "tokens=1,2 delims=:" %%%%a in ("%%time: =0%%") do (set "CUR_H=%%%%a" ^& set "CUR_M=%%%%b")
>>"%BOT_BAT%" echo set /a CUR_TOTAL=(1%%CUR_H%%-100)*60+(1%%CUR_M%%-100) 2^>nul
>>"%BOT_BAT%" echo if %%CUR_TOTAL%% GEQ 240 if %%CUR_TOTAL%% LSS 320 (echo Bao tri 04:00-05:20... ^& timeout /t 30 ^>nul ^& goto loop)
>>"%BOT_BAT%" echo echo Dang ket noi: MinecraftClient.exe %%INI%% %%ACCOUNT%% - %%SERVER%%
>>"%BOT_BAT%" echo MinecraftClient.exe "%%INI%%" "%%ACCOUNT%%" - "%%SERVER%%"
>>"%BOT_BAT%" echo echo Thoat exit %%errorlevel%% ^& timeout /t 70 ^>nul ^& goto loop
echo [*] Tao %BOT_BAT%

REM Tao bots\%BOT_NAME%.ps1
set "BOT_PS1=bots\%BOT_NAME%.ps1"
> "%BOT_PS1%" echo # BOT: %BOT_NAME% ^| %BOT_SERVER% - PowerShell
>>"%BOT_PS1%" echo $ErrorActionPreference = "SilentlyContinue"
>>"%BOT_PS1%" echo while ($true) {
>>"%BOT_PS1%" echo     $n=Get-Date; $c=$n.Hour*60+$n.Minute; if ($c -ge 240 -and $c -lt 320) { Write-Host "Bao tri 04:00-05:20..."; Start-Sleep 30; continue }
>>"%BOT_PS1%" echo     Write-Host "Dang ket noi: MinecraftClient.exe %BOT_INI% %BOT_NAME% - %BOT_SERVER%"
>>"%BOT_PS1%" echo     $p = Start-Process -Wait -PassThru -FilePath ".\MinecraftClient.exe" -ArgumentList "`"%BOT_INI%`",`"%BOT_NAME%`",`"-`",`"%BOT_SERVER%`""
>>"%BOT_PS1%" echo     Write-Host "Thoat exit $($p.ExitCode) - doi 70s"; Start-Sleep 70
>>"%BOT_PS1%" echo }
echo [*] Tao %BOT_PS1%

REM Dam bao MinecraftClient.exe ton tai
if not exist "MinecraftClient.exe" (
    if exist "%~dp0MinecraftClient.exe" (
        copy /Y "%~dp0MinecraftClient.exe" "MinecraftClient.exe" >nul
        echo [*] Copy MinecraftClient.exe
    ) else (
        echo [*] MinecraftClient.exe chua co, dang tai tu GitHub (tu nhan dien arch + ban moi nhat)...
        powershell -NoProfile -Command "$arch='win-x64'; if($env:PROCESSOR_ARCHITECTURE -eq 'ARM64'){$arch='win-arm64'}; try { $r=Invoke-RestMethod 'https://api.github.com/repos/MCCTeam/Minecraft-Console-Client/releases/latest' -TimeoutSec 15; $a=$r.assets | Where-Object { $_.name -like ('*'+$arch+'*') } | Select-Object -First 1; if($a){ Invoke-WebRequest -Uri $a.browser_download_url -OutFile 'MinecraftClient.exe' -UseBasicParsing; Write-Host ('[*] Da tai ' + $a.name) } else { Write-Host '[!] Khong thay asset nho' } } catch { Write-Host '[!] Tai that bai - tai tay tu https://github.com/MCCTeam/Minecraft-Console-Client/releases' }"
        if not exist "MinecraftClient.exe" (
            echo [!] Can tai tay tu releases (link tren) roi dat MinecraftClient.exe tai %CD%
        )
    )
)

echo [*] Xong tao file tai %CD%
dir /b bots 2>nul

REM --- 3. Alias ---
echo.
echo === Alias ===
echo Ban muon go 'bot' de chay khong? (Go bot hoac bot ^<ten^>)
set /p NEED_ALIAS="Them alias bot? (y/n) [y]: "
if "%NEED_ALIAS%"=="" set "NEED_ALIAS=y"
if /I "%NEED_ALIAS%"=="y" (
    REM Dung %USERPROFILE%\.local\bin\bot.bat (chu voi du kien .local/bin o Linux)
    set "BOTBIN=%USERPROFILE%\.local\bin\bot.bat"
    REM GHI DE (xoa file cu neu da co) 
    if exist "%USERPROFILE%\bot.bat" (
        del /f /q "%USERPROFILE%\bot.bat"
        echo [*] Da xoa alias cu: %USERPROFILE%\bot.bat
    )
    if not exist "%USERPROFILE%\.local\bin" mkdir "%USERPROFILE%\.local\bin"
    > "!BOTBIN!" echo @echo off
    >>"!BOTBIN!" echo set "BOT_DIR=%CD%\bots"
    >>"!BOTBIN!" echo if "%%~1"=="" (
    >>"!BOTBIN!" echo     for %%%%f in ("%%BOT_DIR%%\*.bat") do echo %%%%~nf
    >>"!BOTBIN!" echo     echo Dung: bot ^<ten^>  (vd: bot %BOT_NAME%^)
    >>"!BOTBIN!" echo ) else (
    >>"!BOTBIN!" echo     if exist "%%BOT_DIR%%\%%~1.bat" ( call "%%BOT_DIR%%\%%~1.bat" ) else ( echo Khong thay bot %%~1 ^& dir /b "%%BOT_DIR%%\*.bat" )
    >>"!BOTBIN!" echo )
    REM Them %USERPROFILE%\.local\bin vao PATH cua User (khong do dong toi PATH System)
    powershell -NoProfile -Command "$lb=$env:USERPROFILE+'\.local\bin'; $up=[Environment]::GetEnvironmentVariable('Path','User'); if($null -eq $up){$up=''}; if($up -notlike '*\.local\bin*'){ $np=$up; if($np -ne '' -and -not $np.EndsWith(';')){ $np=$np+';' }; [Environment]::SetEnvironmentVariable('Path', $np+$lb, 'User'); Write-Host '[*] Da them .local\bin vao PATH (mo terminal moi de bat dau)' }"
    echo [*] Da ghi de %USERPROFILE%\.local\bin\bot.bat
    echo     Dung: bot  hoac  bot %BOT_NAME%   (mo terminal moi neu PATH vua duoc them)
)

REM --- 4. Task Scheduler ---
echo.
echo === Task Scheduler (chay ngam Windows) ===
set /p NEED_TASK="Tao Task chay ngam khi khoi dong? (y/n) [y]: "
if "%NEED_TASK%"=="" set "NEED_TASK=y"
if /I "%NEED_TASK%"=="y" (
    schtasks /create /tn "MC_Bot_%BOT_NAME%" /tr "\"%CD%\bots\%BOT_NAME%.bat\"" /sc onlogon /rl highest /f 2>nul
    if !errorlevel!==0 (
        echo [*] Da tao Task MC_Bot_%BOT_NAME% - chay khi dang nhap
        echo     Xem: schtasks /query /tn MC_Bot_%BOT_NAME%
        echo     Chay ngay: schtasks /run /tn MC_Bot_%BOT_NAME%
        echo     Xoa: schtasks /delete /tn MC_Bot_%BOT_NAME% /f
    ) else (
        echo [!] Can chay CMD voi admin de tao Task
    )
)

echo.
echo === XONG ===
echo Thu muc: %CD%
echo Chay thu: bots\%BOT_NAME%.bat  hoac  bot %BOT_NAME%
echo Copy sang may khac: chi can copy install.bat va chay
pause
