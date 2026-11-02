# Copyright (C) 2026 jozzhu
# SPDX-License-Identifier: AGPL-3.0-or-later

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$source = [Drawing.Image]::FromFile((Join-Path $root 'assets/app_icon.png'))
$generated = Join-Path $PSScriptRoot 'generated'
$res = Join-Path $PSScriptRoot 'android/app/src/main/res'
New-Item -ItemType Directory -Path $generated -Force | Out-Null
function Render-Icon([int]$size, [double]$scale = 1) {
 $bitmap = New-Object Drawing.Bitmap $size,$size
 $graphics = [Drawing.Graphics]::FromImage($bitmap)
 try {
  $graphics.Clear([Drawing.Color]::White)
  $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $edge = [int]($size * $scale)
  $offset = [int](($size - $edge) / 2)
  $graphics.DrawImage($source, $offset, $offset, $edge, $edge)
 } finally { $graphics.Dispose() }
 return $bitmap
}
try {
 $sizes = @(16,24,32,48,64,128,256)
 $images = @()
 foreach ($size in $sizes) {
  $bitmap = Render-Icon $size
  $stream = New-Object IO.MemoryStream
  try { $bitmap.Save($stream, [Drawing.Imaging.ImageFormat]::Png); $images += ,$stream.ToArray() }
  finally { $stream.Dispose(); $bitmap.Dispose() }
 }
 $file = [IO.File]::Create((Join-Path $generated 'app.ico'))
 $writer = New-Object IO.BinaryWriter $file
 try {
  $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$sizes.Count)
  $offset = 6 + 16 * $sizes.Count
  for ($i = 0; $i -lt $sizes.Count; $i++) {
   $dimension = if ($sizes[$i] -eq 256) { 0 } else { $sizes[$i] }
   $writer.Write([byte]$dimension); $writer.Write([byte]$dimension)
   $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([uint16]1); $writer.Write([uint16]32)
   $writer.Write([uint32]$images[$i].Length); $writer.Write([uint32]$offset)
   $offset += $images[$i].Length
  }
  foreach ($bytes in $images) { $writer.Write([byte[]]$bytes) }
 } finally { $writer.Dispose() }
 foreach ($entry in @(@('mdpi',48),@('hdpi',72),@('xhdpi',96),@('xxhdpi',144),@('xxxhdpi',192))) {
  $directory = Join-Path $res ('mipmap-' + $entry[0])
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
  $bitmap = Render-Icon $entry[1]
  try { $bitmap.Save((Join-Path $directory 'ic_launcher.png'), [Drawing.Imaging.ImageFormat]::Png) }
  finally { $bitmap.Dispose() }
 }
 $directory = Join-Path $res 'drawable-nodpi'
 New-Item -ItemType Directory -Path $directory -Force | Out-Null
 $bitmap = Render-Icon 432 0.88
 try { $bitmap.Save((Join-Path $directory 'ic_launcher_foreground.png'), [Drawing.Imaging.ImageFormat]::Png) }
 finally { $bitmap.Dispose() }
 Write-Output 'Application icons generated from assets/app_icon.png.'
} finally { $source.Dispose() }
