#Requires -Version 5.1
# Generates the NSIS installer bitmaps (24-bit BMP) from build/logo.png using the launcher palette.
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$buildDir = Join-Path (Split-Path -Parent $PSScriptRoot) "build"
$logo = [System.Drawing.Image]::FromFile((Join-Path $buildDir "logo.png"))
$background = [System.Drawing.ColorTranslator]::FromHtml("#09090b")
$brandGlow = [System.Drawing.Color]::FromArgb(70, 59, 130, 246)
$textColor = [System.Drawing.ColorTranslator]::FromHtml("#fafafa")
$mutedColor = [System.Drawing.ColorTranslator]::FromHtml("#a1a1aa")
$borderColor = [System.Drawing.ColorTranslator]::FromHtml("#27272a")

function New-Canvas([int]$width, [int]$height) {
  $bitmap = New-Object System.Drawing.Bitmap $width, $height, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = "AntiAlias"
  $graphics.InterpolationMode = "HighQualityBicubic"
  $graphics.TextRenderingHint = "AntiAliasGridFit"
  $graphics.Clear($background)
  return @{ Bitmap = $bitmap; Graphics = $graphics }
}

function Add-Glow($graphics, [int]$centerX, [int]$centerY, [int]$radius) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddEllipse($centerX - $radius, $centerY - $radius, $radius * 2, $radius * 2)
  $brush = New-Object System.Drawing.Drawing2D.PathGradientBrush $path
  $brush.CenterColor = $brandGlow
  $brush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 59, 130, 246))
  $graphics.FillPath($brush, $path)
  $brush.Dispose(); $path.Dispose()
}

function Save-Canvas($canvas, [string]$name) {
  $canvas.Bitmap.Save((Join-Path $buildDir $name), [System.Drawing.Imaging.ImageFormat]::Bmp)
  $canvas.Graphics.Dispose(); $canvas.Bitmap.Dispose()
}

function New-Sidebar([string]$name) {
  $canvas = New-Canvas 164 314
  $graphics = $canvas.Graphics
  Add-Glow $graphics 82 96 110
  $graphics.DrawImage($logo, 26, 40, 112, 112)
  $centered = New-Object System.Drawing.StringFormat
  $centered.Alignment = "Center"
  $titleFont = New-Object System.Drawing.Font "Segoe UI Semibold", 13
  $subtitleFont = New-Object System.Drawing.Font "Segoe UI", 8.5
  $graphics.DrawString("MimicDice", $titleFont, (New-Object System.Drawing.SolidBrush $textColor), (New-Object System.Drawing.RectangleF 0, 168, 164, 28), $centered)
  $graphics.DrawString("VTT", $subtitleFont, (New-Object System.Drawing.SolidBrush $mutedColor), (New-Object System.Drawing.RectangleF 0, 196, 164, 20), $centered)
  $graphics.DrawLine((New-Object System.Drawing.Pen $borderColor), 163, 0, 163, 314)
  $titleFont.Dispose(); $subtitleFont.Dispose()
  Save-Canvas $canvas $name
}

function New-Header {
  $canvas = New-Canvas 150 57
  Add-Glow $canvas.Graphics 118 28 40
  $canvas.Graphics.DrawImage($logo, 94, 6, 46, 46)
  Save-Canvas $canvas "installerHeader.bmp"
}

New-Sidebar "installerSidebar.bmp"
New-Sidebar "uninstallerSidebar.bmp"
New-Header
$logo.Dispose()
Write-Output "Imagens do instalador geradas em $buildDir"
