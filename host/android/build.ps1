# Copyright (C) 2026 jozzhu
# SPDX-License-Identifier: AGPL-3.0-or-later

param([switch]$Release)
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
& node (Join-Path $root 'host/prepare-languages.js')
if ($LASTEXITCODE -ne 0) { throw '语言资源准备失败' }
& node (Join-Path $root 'host/prepare-audio.js')
if ($LASTEXITCODE -ne 0) { throw '音频资源准备失败' }
& (Join-Path $root 'host/build-icons.ps1')
$tools = Join-Path $root '.tools/android'
$buildRoot = Join-Path ([System.IO.Path]::GetTempPath()) 'LittleLegendAndroid'
New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null
$toolsLink = Join-Path $buildRoot 'tools'
if (!(Test-Path -LiteralPath $toolsLink)) { New-Item -ItemType Junction -Path $toolsLink -Target $tools | Out-Null }
$sdk = Join-Path $toolsLink 'sdk'
$gradle = Join-Path $toolsLink 'gradle-8.9/bin/gradle.bat'
if (!(Test-Path -LiteralPath $gradle)) { throw '缺少本项目Gradle，请先配置.tools/android依赖' }
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:GRADLE_USER_HOME = Join-Path $toolsLink 'gradle-cache'
if (-not $env:JAVA_HOME) {
 $settings = & java -XshowSettings:properties -version 2>&1
 $javaHomeLine = $settings | Select-String 'java.home = (.+)' | Select-Object -First 1
 if (!$javaHomeLine) { throw '未找到JDK17' }
 $env:JAVA_HOME = $javaHomeLine.Matches[0].Groups[1].Value.Trim()
}
$task = if ($Release) { 'assembleRelease' } else { 'assembleDebug' }
$project = Join-Path $buildRoot 'project'
New-Item -ItemType Directory -Path $project -Force | Out-Null
foreach ($file in @('settings.gradle','build.gradle','gradle.properties')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination $project -Force }
New-Item -ItemType Directory -Path (Join-Path $project 'app') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'app/build.gradle') -Destination (Join-Path $project 'app/build.gradle') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'app/src') -Destination (Join-Path $project 'app') -Recurse -Force
& $gradle -p $project "-PlegendGameRoot=$root" $task --no-daemon --console=plain
if ($LASTEXITCODE -ne 0) { throw '安卓构建失败' }
$kind = if ($Release) { 'release' } else { 'debug' }
$apk = Join-Path $project "app/build/outputs/apk/$kind/app-$kind.apk"
if ($Release) { Write-Output 'Release仍需配置你自己的签名密钥，不能分发未签名APK。'; return }
& (Join-Path $PSScriptRoot 'verify-apk.ps1') -Apk $apk
$destination = Join-Path $root 'release/android'
New-Item -ItemType Directory -Path $destination -Force | Out-Null
Copy-Item -LiteralPath $apk -Destination (Join-Path $destination 'LittleLegendHost-debug.apk') -Force
Write-Output "APK=$destination/LittleLegendHost-debug.apk"
