$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Root = 'C:\meter-ocr'
New-Item -ItemType Directory -Force -Path $Root, "$Root\ollama", "$Root\models", "$Root\logs" | Out-Null

if (-not (Test-Path "$Root\ollama\ollama.exe")) {
  Write-Output 'Downloading Ollama...'
  curl.exe -fsSL -o "$Root\ollama.zip" https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.zip
  tar -xf "$Root\ollama.zip" -C "$Root\ollama"
  Remove-Item "$Root\ollama.zip"
}

if (-not (Test-Path "$Root\node\node.exe")) {
  Write-Output 'Downloading Node.js LTS...'
  $releases = Invoke-RestMethod https://nodejs.org/dist/index.json
  $lts = ($releases | ForEach-Object { $_ } | Where-Object { $_.lts } | Select-Object -First 1).version
  curl.exe -fsSL -o "$Root\node.zip" "https://nodejs.org/dist/$lts/node-$lts-win-x64.zip"
  tar -xf "$Root\node.zip" -C $Root
  Rename-Item "$Root\node-$lts-win-x64" 'node'
  Remove-Item "$Root\node.zip"
}

$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$Root\start.cmd`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable
Register-ScheduledTask -TaskName 'MeterOcr' -Action $action -Trigger $trigger -Settings $settings -User 'SYSTEM' -RunLevel Highest -Force | Out-Null

Write-Output 'Installed. Fill C:\meter-ocr\.env, then: Start-ScheduledTask MeterOcr'
