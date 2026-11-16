# Builds dist\glyph-zoo-<version>.zip — the file you upload to the Chrome Web Store.
# Run from anywhere:   powershell -ExecutionPolicy Bypass -File tools\package.ps1
#
# Only the files the extension needs go into the zip (no README, tools, etc.).
# Uses .NET's ZipFile so paths inside the zip use "/" (the Web Store needs that).

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$version = (Get-Content (Join-Path $root 'manifest.json') -Raw | ConvertFrom-Json).version

$items = @(
  'manifest.json', 'index.html', 'style.css',
  'util.js', 'species.js', 'quotes.js', 'weather.js', 'audio.js', 'main.js',
  'icons'
)

$dist = Join-Path $root 'dist'
New-Item -ItemType Directory -Force -Path $dist | Out-Null
$zipPath = Join-Path $dist "glyph-zoo-$version.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Confirm:$false }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, 'Create')
try {
  foreach ($item in $items) {
    $full = Join-Path $root $item
    $files = if (Test-Path $full -PathType Container) { Get-ChildItem $full -Recurse -File } else { Get-Item $full }
    foreach ($f in $files) {
      $entry = $f.FullName.Substring($root.Length + 1).Replace('\', '/')
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $f.FullName, $entry) | Out-Null
      Write-Host "  + $entry"
    }
  }
} finally {
  $zip.Dispose()
}
Write-Host "Created $zipPath"
