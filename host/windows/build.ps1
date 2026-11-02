# Copyright (C) 2026 jozzhu
# SPDX-License-Identifier: AGPL-3.0-or-later

param([string]$DestinationDirectory)
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
& node (Join-Path $root 'host/prepare-languages.js')
if ($LASTEXITCODE -ne 0) { throw '语言资源准备失败' }
& node (Join-Path $root 'host/prepare-audio.js')
if ($LASTEXITCODE -ne 0) { throw '音频资源准备失败' }
& (Join-Path $root 'host/build-icons.ps1')
$destination = if ($DestinationDirectory) { [IO.Path]::GetFullPath($DestinationDirectory) } else { Join-Path $root 'release/windows' }
New-Item -ItemType Directory -Path $destination -Force | Out-Null
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (!(Test-Path -LiteralPath $compiler)) { throw '需要 .NET Framework 4 编译器' }
& $compiler /nologo /target:winexe /codepage:65001 "/win32icon:$root/host/generated/app.ico" "/out:$destination/LittleLegendHost.exe" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll (Join-Path $PSScriptRoot 'Launcher.cs')
if ($LASTEXITCODE -ne 0) { throw '启动器编译失败' }
New-Item -ItemType Directory -Path (Join-Path $destination 'runtime'),(Join-Path $destination 'app') -Force | Out-Null
Copy-Item -LiteralPath (Get-Command node.exe).Source -Destination (Join-Path $destination 'runtime/node.exe') -Force
$nodeVersion = (& node.exe --version).Trim()
$nodeLicense = Join-Path $root "host/licenses/NODE-$nodeVersion-LICENSE.txt"
if (Test-Path -LiteralPath $nodeLicense) {
 Copy-Item -LiteralPath $nodeLicense -Destination (Join-Path $destination 'runtime/NODE-LICENSE.txt') -Force
} else { Write-Warning "请为 $nodeVersion 附上匹配的上游 Node LICENSE。" }
foreach ($file in @('server.js','game.js','accounts.js','storage.js','realtime.js','package.json','package-lock.json','host-runtime.js','host-runner.js','host-monitor.js')) { Copy-Item -LiteralPath (Join-Path $root $file) -Destination (Join-Path $destination 'app') -Force }
$ws = Join-Path $root 'node_modules/ws'
if (!(Test-Path -LiteralPath $ws)) { throw '请先运行 npm ci --omit=optional --ignore-scripts 安装依赖' }
New-Item -ItemType Directory -Path (Join-Path $destination 'app/node_modules') -Force | Out-Null
Copy-Item -LiteralPath $ws -Destination (Join-Path $destination 'app/node_modules') -Recurse -Force
Copy-Item -LiteralPath (Join-Path $root 'public') -Destination (Join-Path $destination 'app') -Recurse -Force
Write-Output "已生成：$destination/LittleLegendHost.exe"
Write-Output '整个 windows 文件夹一起分发，不含原有账户或存档。'
