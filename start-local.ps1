# Copyright (C) 2026 jozzhu
# SPDX-License-Identifier: AGPL-3.0-or-later

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
Write-Host '小传说正在启动，留空端口时由系统自动分配空闲端口。'
node host-runner.js
