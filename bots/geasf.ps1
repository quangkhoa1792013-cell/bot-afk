# BOT: geasf | Server: kingmc.vn | Windows PowerShell - tu dong vuot bao tri 04:00-05:20
$ErrorActionPreference = "SilentlyContinue"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir
Set-Location $ProjectDir

$ACCOUNT = "geasf"
$SERVER = "kingmc.vn"
$INI_SRC = "bots\geasf.ini"
$INI_TMP = "$env:TEMP\geasf_runtime.ini"
$MAINT_START = 4*60
$MAINT_END = 5*60+20

while ($true) {
    $now = Get-Date
    $curTotal = $now.Hour*60 + $now.Minute
    if ($curTotal -ge $MAINT_START -and $curTotal -lt $MAINT_END) {
        $target = Get-Date -Date "05:20:00"
        if ($target -le $now) { $target = $target.AddDays(1) }
        $sleepSec = [int]($target - $now).TotalSeconds
        if ($sleepSec -le 0) { $sleepSec = 30 }
        Write-Host "[$($now.ToString('HH:mm:ss'))] Bao tri 04:00-05:20 -> ngu ${sleepSec}s toi 05:20..."
        Start-Sleep -Seconds $sleepSec
        continue
    }
    Write-Host "[$((Get-Date).ToString('HH:mm:ss'))] Dang ket noi: MinecraftClient.exe $INI_SRC -> $INI_TMP $ACCOUNT - $SERVER"
    Copy-Item -Force $INI_SRC $INI_TMP -ErrorAction SilentlyContinue
    $p = Start-Process -FilePath ".\MinecraftClient.exe" -ArgumentList "`"$INI_TMP`"","$ACCOUNT","-","$SERVER" -Wait -PassThru -NoNewWindow
    $exit = $p.ExitCode
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Thoat exit $exit"
    # Phan biet timeout vs bao tri bang Test-Connection
    if (Test-Connection -ComputerName kingmc.vn -Count 1 -Quiet -TimeoutSeconds 3) {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Timeout/kick -> doi 70s..."
        Start-Sleep -Seconds 70
    } else {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Khong ping duoc -> doi 90s..."
        Start-Sleep -Seconds 90
    }
}
