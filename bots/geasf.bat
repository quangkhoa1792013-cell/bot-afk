@echo off
REM BOT: geasf | Server: kingmc.vn | Windows - tu dong vuot bao tri 04:00-05:20
setlocal enabledelayedexpansion
cd /d "%~dp0.."
if not exist "bots\geasf.ini" (
    echo [!] Khong thay bots\geasf.ini
    pause
    exit /b 1
)
set "ACCOUNT=geasf"
set "SERVER=kingmc.vn"
set "INI=bots\geasf.ini"
set "TMP_INI=%TEMP%\geasf_runtime.ini"

:loop
for /f "tokens=1,2 delims=:" %%a in ("%time%") do (
    set "CUR_H=%%a"
    set "CUR_M=%%b"
)
REM Xoa so 0 dau de tranh loi 08,09 la so bat hop phap he 8
set /a CUR_H=1%CUR_H% - 100 2>nul
set /a CUR_M=1%CUR_M% - 100 2>nul
set /a CUR_TOTAL=CUR_H*60+CUR_M
set /a MAINT_START=4*60
set /a MAINT_END=5*60+20
if !CUR_TOTAL! GEQ !MAINT_START! if !CUR_TOTAL! LSS !MAINT_END! (
    echo [%time%] Bao tri 04:00-05:20 -> ngu den 05:20...
    REM Tinh giay den 05:20
    powershell -Command "Start-Sleep -Seconds 30" >nul
    goto loop
)

echo [%time%] Dang ket noi: MinecraftClient.exe %INI% %ACCOUNT% - %SERVER%
copy /Y "%INI:geasf.ini=%INI:geasf.ini%" "%TMP_INI%" >nul 2>&1
if exist "bots\geasf.ini" copy /Y "bots\geasf.ini" "%TMP_INI%" >nul
MinecraftClient.exe "%TMP_INI%" "%ACCOUNT%" - "%SERVER%"
set "EXIT_CODE=%errorlevel%"
echo [%time%] Thoat exit %EXIT_CODE%

REM Phan biet timeout vs bao tri bang ping
ping -n 1 -w 3000 kingmc.vn >nul 2>&1
if %errorlevel%==0 (
    echo [%time%] Timeout/kick -> doi 70s...
    timeout /t 70 >nul
) else (
    echo [%time%] Khong ping duoc kingmc.vn -> doi 90s...
    timeout /t 90 >nul
)
goto loop
