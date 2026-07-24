# Deploys the plugin to Stream Deck. If local-assets\claude-logo.png exists
# (not in the repo — drop in your own copy of the official icon for personal use),
# it replaces the launcher and category icons in the deployed copy only.
param([switch]$NoRestart)

$src = Join-Path $PSScriptRoot "com.technicallybrantley.claude-deck.sdPlugin"
$dst = Join-Path $env:APPDATA "Elgato\StreamDeck\Plugins\com.technicallybrantley.claude-deck.sdPlugin"

Stop-Process -Name StreamDeck -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# usage-cache.json lives inside the installed folder, so a plain wipe-and-copy
# throws away the last good usage reading — the very thing that exists so a
# restart doesn't show empty gauges. If the first poll after the restart then
# gets a 429 (easy to trigger by deploying a few times in a row), the gauges sit
# on "--" for the whole backoff. Carry the cache across instead.
$cache = Join-Path $dst "usage-cache.json"
$saved = if (Test-Path $cache) { Get-Content $cache -Raw } else { $null }

if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
Copy-Item $src $dst -Recurse
if ($saved) {
    Set-Content -Path (Join-Path $dst "usage-cache.json") -Value $saved -NoNewline
    Write-Host "preserved usage cache across deploy"
}

$logo = Join-Path $PSScriptRoot "local-assets\claude-logo.png"
if (Test-Path $logo) {
    Copy-Item $logo (Join-Path $dst "imgs\launch.png") -Force
    Remove-Item (Join-Path $dst "imgs\launch.svg") -Force
    Copy-Item $logo (Join-Path $dst "imgs\plugin.png") -Force
    Remove-Item (Join-Path $dst "imgs\plugin.svg") -Force
    Write-Host "applied local claude-logo.png to launch + category icons"
}

if (-not $NoRestart) { Start-Process "C:\Program Files\Elgato\StreamDeck\StreamDeck.exe" }
Write-Host "deployed to $dst"
