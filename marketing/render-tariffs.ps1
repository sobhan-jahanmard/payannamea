$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$catalog = Get-Content -Raw -Encoding UTF8 (Join-Path $root 'frontend/src/lib/service-catalog.json') | ConvertFrom-Json
$logo = [Drawing.Image]::FromFile((Join-Path $root 'frontend/public/images/daneshyar-logo.png'))
$rtl = [Drawing.StringFormat]::new([Drawing.StringFormatFlags]::DirectionRightToLeft)
$ltr = [Drawing.StringFormat]::new()
$ink = '#F8F4E8'
$muted = '#C5D9D4'
$gold = '#F6D395'

function Format-Price([int]$number) {
    $text = $number.ToString('N0', [Globalization.CultureInfo]::InvariantCulture).Replace(',', '٬')
    for ($i = 0; $i -lt 10; $i++) { $text = $text.Replace([char](48 + $i), [char](1776 + $i)) }
    return $text
}

function Draw-Text($graphics, $text, $x, $y, $width, $height, $size, $color, [switch]$Bold, [switch]$Latin) {
    $style = if ($Bold) { [Drawing.FontStyle]::Bold } else { [Drawing.FontStyle]::Regular }
    $font = [Drawing.Font]::new('Tahoma', $size, $style, [Drawing.GraphicsUnit]::Pixel)
    $brush = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml($color))
    $format = if ($Latin) { $ltr } else { $rtl }
    try {
        $graphics.DrawString($text, $font, $brush, [Drawing.RectangleF]::new($x,$y,$width,$height), $format)
    } finally { $font.Dispose(); $brush.Dispose() }
}

function Render-Tariffs([string]$relative, [int]$height, [int]$top) {
    $path = Join-Path $root $relative
    New-Item -ItemType Directory -Path (Split-Path -Parent $path) -Force | Out-Null
    $canvas = [Drawing.Bitmap]::new(1080, $height)
    $graphics = [Drawing.Graphics]::FromImage($canvas)
    $background = [Drawing.Drawing2D.LinearGradientBrush]::new(
        [Drawing.Rectangle]::new(0, 0, 1080, $height),
        [Drawing.ColorTranslator]::FromHtml('#102228'), [Drawing.ColorTranslator]::FromHtml('#153F43'), 55.0)
    $standard = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#1B4146'))
    $emphasis = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#285957'))
    try {
        $graphics.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
        $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.FillRectangle($background, 0, 0, 1080, $height)
        $graphics.DrawImage($logo, [Drawing.Rectangle]::new(915, $top, 88, 88))
        Draw-Text $graphics 'دانشیار' 65 ($top + 8) 800 70 35 $ink -Bold
        Draw-Text $graphics 'تعرفهٔ خدمات' 65 ($top + 110) 944 90 68 $ink -Bold
        $y = $top + 224
        foreach ($service in $catalog) {
            $unit = if ($service.unit -eq 'page') { 'صفحه' } else { 'اسلاید' }
            $fill = if ($service.order_type -eq 'editing') { $emphasis } else { $standard }
            $graphics.FillRectangle($fill, 65, $y, 944, 132)
            Draw-Text $graphics $service.label 480 ($y + 27) 490 70 33 $ink -Bold
            Draw-Text $graphics (('هر {0}  {1} تومان' -f $unit, (Format-Price $service.price_per_unit_toman))) 83 ($y + 30) 388 66 30 $gold -Bold
            Draw-Text $graphics (('{0} {1} حدود {2} تومان' -f (Format-Price $service.estimate_quantity), $unit, (Format-Price ($service.price_per_unit_toman * $service.estimate_quantity)))) 92 ($y + 86) 876 39 23 $muted
            $y += 146
        }
        Draw-Text $graphics 'مبلغ نهایی پس از بررسی سفارش مشخص می‌شود.' 65 ($y + 30) 944 67 27 $muted
        Draw-Text $graphics 'daneshyar.vercel.app' 71 ($y + 93) 760 52 31 $gold -Latin
        $canvas.Save($path, [Drawing.Imaging.ImageFormat]::Jpeg)
        Write-Output $path
    } finally {
        $emphasis.Dispose(); $standard.Dispose(); $background.Dispose(); $graphics.Dispose(); $canvas.Dispose()
    }
}

try {
    Render-Tariffs 'telegram/content/2026-11-17/pricing-poster.jpg' 1440 74
    Render-Tariffs 'instagram/content/2026-11-17/pricing-story.jpg' 1920 287
} finally { $logo.Dispose(); $rtl.Dispose(); $ltr.Dispose() }
