# Copyright (C) 2026 jozzhu
# SPDX-License-Identifier: AGPL-3.0-or-later

param([Parameter(Mandatory=$true)][string]$Apk)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($Apk)
try {
 foreach ($library in @('libnode.so','liblegendhost.so','libc++_shared.so')) {
  $entry = $zip.GetEntry("lib/arm64-v8a/$library")
  if (!$entry -or $entry.Length -eq 0) { throw "APK is missing required native dependency: $library" }
  Write-Output "Verified native dependency: $library ($($entry.Length) bytes)"
 }
 if (!$zip.GetEntry('res/mipmap-anydpi-v26/ic_launcher.xml')) { throw 'APK adaptive launcher icon is missing' }
} finally { $zip.Dispose() }
