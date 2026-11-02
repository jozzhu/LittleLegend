# Copyright (C) 2026 jozzhu
# SPDX-License-Identifier: AGPL-3.0-or-later

param([string]$Version = '5.0.0')
$ErrorActionPreference = 'Stop'
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Version must be numeric semver' }
$root = Split-Path $PSScriptRoot -Parent
$destination = Join-Path $root "工程$Version"
$archive = Join-Path $root "工程$Version.zip"
if ((Test-Path -LiteralPath $destination) -or (Test-Path -LiteralPath $archive)) { throw 'Source export already exists; use a fresh version or move the previous export first.' }
New-Item -ItemType Directory -Path $destination -Force | Out-Null
$files = @(
 'package.json','package-lock.json','.gitignore','README.md','CHANGELOG.md','LICENSE','ASSETS.md','THIRD_PARTY_NOTICES.md','CONTRIBUTING.md',
 'server.js','game.js','accounts.js','storage.js','realtime.js','host-runtime.js','host-runner.js','host-monitor.js','start-local.ps1','startup-preview.html',
 'assets/app_icon.png','assets/battlefield_2560x1440.png','assets/cardback_royal.png','assets/cardback_monster.png',
 'assets/wood_table_texture.png','assets/emblem_royal_sword.png','assets/emblem_monster_spiral.png',
 'host/build-icons.ps1','host/generate-avatar-characters.js','host/prepare-audio.js','host/prepare-languages.js','host/export-source.ps1','host/package-release.ps1','host/data-management.md','host/validation-2026-11-01.md',
 'host/windows/build.ps1','host/windows/Launcher.cs','host/windows/Preview.cs',
 'host/android/build.ps1','host/android/verify-apk.ps1','host/android/README.md',
 'host/android/settings.gradle','host/android/build.gradle','host/android/gradle.properties','host/android/app/build.gradle',
 'host/android/app/src/main/AndroidManifest.xml'
)
foreach ($folder in @('public','test','docs','.github','host/licenses','assets/ui','assets/effects','assets/profiles','assets/audio','host/android/app/src/main/java','host/android/app/src/main/cpp')) {
 foreach ($file in Get-ChildItem -LiteralPath (Join-Path $root $folder) -Recurse -File) {
  $files += $file.FullName.Substring($root.Length + 1)
 }
}
foreach ($file in Get-ChildItem -LiteralPath (Join-Path $root 'host/android/app/src/main/res') -Recurse -File -Filter '*.xml') {
 $files += $file.FullName.Substring($root.Length + 1)
}
foreach ($relative in $files) {
 $target = Join-Path $destination $relative
 New-Item -ItemType Directory -Path (Split-Path $target -Parent) -Force | Out-Null
 Copy-Item -LiteralPath (Join-Path $root $relative) -Destination $target
}
$forbidden = Get-ChildItem -LiteralPath $destination -Recurse -File | Where-Object {
 $_.FullName.Substring($destination.Length) -match '[/\\](data[^/\\]*|\.tools|node_modules|nodejs-mobile|jniLibs|build|\.gradle)[/\\]' -or
 $_.Extension -match '^\.(key|keystore|jks|apk|exe|so|log)$'
}
if ($forbidden) { throw 'Unexpected private data or build output in source export' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($destination,$archive,[IO.Compression.CompressionLevel]::Optimal,$true)
Write-Output "SOURCE=$destination"
Write-Output "ARCHIVE=$archive"
