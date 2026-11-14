$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$outputDir = Join-Path $projectRoot 'instagram/content/2026-11-09'
$previewDir = Join-Path $projectRoot 'telegram/previews'
$logoPath = Join-Path $projectRoot 'telegram/content/2026-11-09/daneshyar-telegram-avatar.png'
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

$ink = '#F8F4E8'
$gold = '#F4C565'
$muted = '#BCD6D2'
$panel = '#153C41'
$rtl = [Drawing.StringFormat]::new()
$rtl.FormatFlags = [Drawing.StringFormatFlags]::DirectionRightToLeft
$ltr = [Drawing.StringFormat]::new()
$logo = [Drawing.Image]::FromFile($logoPath)

function Write-CardText($graphics, [string]$text, [float]$x, [float]$y, [float]$width, [float]$height, [float]$size, [string]$color, [switch]$Bold, [switch]$Latin) {
    $style = if ($Bold) { [Drawing.FontStyle]::Bold } else { [Drawing.FontStyle]::Regular }
    $font = [Drawing.Font]::new('Tahoma', $size, $style, [Drawing.GraphicsUnit]::Pixel)
    $brush = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml($color))
    $format = if ($Latin) { $ltr } else { $rtl }
    try {
        $graphics.DrawString($text, $font, $brush, [Drawing.RectangleF]::new($x, $y, $width, $height), $format)
    } finally { $font.Dispose(); $brush.Dispose() }
}

function Fill-CardRect($graphics, [string]$color, [int]$x, [int]$y, [int]$width, [int]$height) {
    $brush = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml($color))
    try { $graphics.FillRectangle($brush, $x, $y, $width, $height) } finally { $brush.Dispose() }
}

function New-Card([string]$file, [string]$series, [scriptblock]$body) {
    $bitmap = [Drawing.Bitmap]::new(1080, 1350)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $background = [Drawing.Drawing2D.LinearGradientBrush]::new(
        [Drawing.Rectangle]::new(0, 0, 1080, 1350),
        [Drawing.ColorTranslator]::FromHtml('#0C222A'),
        [Drawing.ColorTranslator]::FromHtml('#124649'), 38.0)
    try {
        $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
        $graphics.FillRectangle($background, 0, 0, 1080, 1350)
        Fill-CardRect $graphics $gold 68 150 944 3
        $graphics.DrawImage($logo, [Drawing.Rectangle]::new(920, 47, 86, 86))
        Write-CardText $graphics 'دانشیار' 62 47 826 55 40 $ink -Bold
        Write-CardText $graphics $series 62 104 826 43 25 $muted
        & $body $graphics
        Fill-CardRect $graphics '#467374' 68 1244 944 2
        Write-CardText $graphics 'daneshyar.vercel.app' 68 1270 600 45 25 $muted -Latin
        Write-CardText $graphics '@daneshyar.web' 730 1270 290 45 25 $muted -Latin
        $codec = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
        $quality = [Drawing.Imaging.EncoderParameters]::new(1)
        $quality.Param[0] = [Drawing.Imaging.EncoderParameter]::new([Drawing.Imaging.Encoder]::Quality, [long]94)
        try { $bitmap.Save((Join-Path $outputDir $file), $codec, $quality) } finally { $quality.Dispose() }
    } finally { $background.Dispose(); $graphics.Dispose(); $bitmap.Dispose() }
    Write-Output (Join-Path $outputDir $file)
}

$services = @(
    @{ Title = 'پایان‌نامه و پروژه کارشناسی'; Slug = 'bachelor-thesis'; Note = 'گزیده‌ای از چکیده'; Number = '۱' },
    @{ Title = 'پایان‌نامه کارشناسی ارشد'; Slug = 'master-thesis'; Note = 'پیش‌نمایش فهرست مطالب'; Number = '۲' },
    @{ Title = 'پروپوزال پایان‌نامه'; Slug = 'proposal'; Note = 'پیش‌نمایش فهرست مطالب'; Number = '۳' },
    @{ Title = 'تحقیق دانشگاهی'; Slug = 'research-assignment'; Note = 'گزیده‌ای از چکیده و فهرست مطالب'; Number = '۴' },
    @{ Title = 'ارائه و پاورپوینت'; Slug = 'presentation'; Note = 'پیش‌نمایش یک اسلاید از نمونهٔ ارائه'; Number = '۵' }
)

New-Card 'order-guide.jpg' 'خدمات دانشگاهی' {
    param($graphics)
    Write-CardText $graphics 'راهنمای ثبت سفارش' 65 207 950 105 69 $ink -Bold
    Write-CardText $graphics 'قبل از ثبت درخواست، این اطلاعات را آماده کنید.' 65 315 950 70 33 $muted
    $steps = @(
        @('۱', 'نوع خدمت، رشته و مقطع را مشخص کنید.'),
        @('۲', 'موضوع، دانشگاه و مهلت تحویل را بنویسید.'),
        @('۳', 'شیوه‌نامه، منابع و توضیحات استاد را ضمیمه کنید.'),
        @('۴', 'پس از بررسی، زمان و هزینه با شما هماهنگ می‌شود.'),
        @('۵', 'وضعیت سفارش و فایل نهایی را در سایت پیگیری کنید.')
    )
    $y = 410
    foreach ($step in $steps) {
        Fill-CardRect $graphics $panel 68 $y 944 126
        Write-CardText $graphics $step[0] 934 ($y + 32) 60 58 38 $gold -Bold
        Write-CardText $graphics $step[1] 89 ($y + 38) 820 70 33 $ink
        $y += 143
    }
    Write-CardText $graphics 'ثبت و پیگیری از حساب کاربری سایت' 65 1150 950 55 32 $gold -Bold
}

New-Card 'samples-00-cover.jpg' 'پیش‌نمایش خروجی‌ها' {
    param($graphics)
    Write-CardText $graphics 'نمونه‌کارها' 65 213 950 140 105 $gold -Bold
    Write-CardText $graphics 'پنج نمونه از خدمات دانشگاهی دانشیار' 65 365 950 85 43 $ink
    $y = 500
    foreach ($service in $services) {
        Fill-CardRect $graphics $panel 68 $y 944 105
        Write-CardText $graphics $service.Number 930 ($y + 24) 64 55 36 $gold -Bold
        Write-CardText $graphics $service.Title 90 ($y + 25) 810 70 39 $ink -Bold
        $y += 122
    }
    Write-CardText $graphics 'برای دیدن نمونه‌ها، ورق بزنید.' 65 1151 950 65 35 $muted
}

for ($index = 0; $index -lt $services.Count; $index++) {
    $service = $services[$index]
    New-Card ('samples-{0:00}-{1}.jpg' -f ($index + 1), $service.Slug) 'نمونه‌کارها' {
        param($graphics)
        Write-CardText $graphics $service.Title 65 199 950 95 57 $ink -Bold
        Write-CardText $graphics $service.Note 65 292 950 52 30 $muted
        $preview = [Drawing.Image]::FromFile((Join-Path $previewDir ('telegram-{0}-2.png' -f $service.Slug)))
        try {
            $scale = [Math]::Min(930 / $preview.Width, 795 / $preview.Height)
            $width = [int]($preview.Width * $scale)
            $height = [int]($preview.Height * $scale)
            $left = [int]((1080 - $width) / 2)
            $top = [int](362 + (795 - $height) / 2)
            $graphics.DrawImage($preview, [Drawing.Rectangle]::new($left, $top, $width, $height))
        } finally { $preview.Dispose() }
        Write-CardText $graphics 'نسخهٔ کامل در بخش نمونه‌کارهای سایت' 65 1181 950 53 28 $gold
    }
}

$logo.Dispose()
$rtl.Dispose()
$ltr.Dispose()
