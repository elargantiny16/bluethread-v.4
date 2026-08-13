$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$zipPath = Join-Path (Split-Path -Parent $root) "bluethread-bluetooth-messenger.zip"

Compress-Archive -Path (Join-Path $root "*") -DestinationPath $zipPath -Force
Write-Host "Created $zipPath"
