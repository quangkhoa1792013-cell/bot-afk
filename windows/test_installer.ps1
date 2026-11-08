$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$testDir = Join-Path $env:RUNNER_TEMP 'bot installer test'
New-Item -ItemType Directory -Force -Path $testDir | Out-Null
Copy-Item (Join-Path $root 'out/MinecraftClient.exe') (Join-Path $testDir 'MinecraftClient.exe')
$installer = Join-Path $root 'install.ps1'
$info = New-Object System.Diagnostics.ProcessStartInfo
$info.FileName = 'powershell.exe'
$info.Arguments = '-NoLogo -NoProfile -ExecutionPolicy Bypass -File "' + $installer + '" -Native'
$info.UseShellExecute = $false
$info.RedirectStandardInput = $true
$info.RedirectStandardOutput = $true
$info.RedirectStandardError = $true
$info.CreateNoWindow = $true
$process = New-Object System.Diagnostics.Process
$process.StartInfo = $info
if (-not $process.Start()) { throw 'Cannot start installer test' }
$stdout = $process.StandardOutput.ReadToEndAsync()
$stderr = $process.StandardError.ReadToEndAsync()
@($testDir, 'DemoBot', 'localhost', '', '', 'n', 'n') | ForEach-Object { $process.StandardInput.WriteLine($_) }
$process.StandardInput.Close()
if (-not $process.WaitForExit(60000)) { $process.Kill(); throw 'Installer test timed out' }
if ($process.ExitCode -ne 0) { throw ("Installer failed: " + $stdout.Result + $stderr.Result) }
$ini = Join-Path $testDir 'bots/DemoBot.ini'
$runner = Join-Path $testDir 'bots/DemoBot.ps1'
$loginScript = Join-Path $testDir 'scripts/login_DemoBot.txt'
foreach ($file in @($ini, $runner, $loginScript)) {
    if (-not (Test-Path $file)) { throw "Installer did not create $file" }
}
$text = [IO.File]::ReadAllText($ini)
if ($text -notmatch '(?ms)\[ChatBot\.ScriptScheduler\]\s*Enabled\s*=\s*true') { throw 'Script scheduler was not enabled' }
if ($text -notmatch 'Action\s*=\s*"script scripts/login_DemoBot\.txt"') { throw 'Login script path is incorrect' }
if ($text -notmatch '(?ms)\[ChatBot\.AutoRelog\]\s*Enabled\s*=\s*true') { throw 'AutoRelog was not enabled' }
if ($text -notmatch 'không xác nhận được client') { throw 'UTF-8 reconnect message was not preserved' }
Write-Host 'Windows installer smoke test passed'
