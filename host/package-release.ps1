# Copyright (C) 2026 jozzhu
# SPDX-License-Identifier: AGPL-3.0-or-later

param([string]$Version = '5.0.0')
$ErrorActionPreference = 'Stop'
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Version must be numeric semver' }
$root = Split-Path $PSScriptRoot -Parent
if ((Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version -ne $Version) { throw 'Package version does not match' }
$destination = Join-Path $root "release-$Version"
$archive = Join-Path $root "release-$Version.zip"
$sourceArchive = Join-Path $root "工程$Version.zip"
if (Test-Path -LiteralPath $archive) { throw 'Release archive already exists' }
if (!(Test-Path -LiteralPath (Join-Path $destination 'windows/LittleLegendHost.exe'))) { throw 'Build Windows into the version directory first' }
New-Item -ItemType Directory -Path (Join-Path $destination 'android') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $root 'release/android/LittleLegendHost-debug.apk') -Destination (Join-Path $destination 'android') -Force
foreach ($file in @('README.md','CHANGELOG.md','ASSETS.md','LICENSE','THIRD_PARTY_NOTICES.md')) {
 Copy-Item -LiteralPath (Join-Path $root $file) -Destination $destination -Force
}
Copy-Item -LiteralPath (Join-Path $root "docs/VALIDATION-$Version.md") -Destination $destination -Force
$private = Get-ChildItem -LiteralPath $destination -Recurse -File | Where-Object {
 $_.FullName.Substring($destination.Length) -match '[/\\](data[^/\\]*|backups?)[/\\]' -or $_.Extension -match '^\.(key|keystore|jks|log)$'
}
if ($private) { throw 'Private data unexpectedly found in release' }
$checksumPath = Join-Path $destination 'SHA256SUMS.txt'
$hashes = Get-ChildItem -LiteralPath $destination -Recurse -File | Where-Object { $_.FullName -ne $checksumPath } | Sort-Object FullName | ForEach-Object {
 $relative = $_.FullName.Substring($destination.Length + 1).Replace('\','/')
 '{0}  {1}' -f (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant(),$relative
}
$hashes | Set-Content -LiteralPath (Join-Path $destination 'SHA256SUMS.txt') -Encoding utf8
if (!(Test-Path -LiteralPath $sourceArchive)) { & (Join-Path $PSScriptRoot 'export-source.ps1') -Version $Version }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($destination,$archive,[IO.Compression.CompressionLevel]::Optimal,$true)
@($archive,$sourceArchive) | ForEach-Object {
 '{0}  {1}' -f (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant(),[IO.Path]::GetFileName($_)
} | Set-Content -LiteralPath (Join-Path $root "SHA256SUMS-$Version.txt") -Encoding utf8
Write-Output "RELEASE=$archive"
Write-Output "SOURCE=$sourceArchive"
Write-Output "CHECKSUMS=$(Join-Path $root "SHA256SUMS-$Version.txt")"
