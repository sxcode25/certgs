# extract_css.ps1 - Extract CSS from style.html
$basePath = Split-Path -Parent $PSScriptRoot
$stylePath = Join-Path $basePath "style.html"
$cssDir = Join-Path $basePath "css"
$cssPath = Join-Path $cssDir "style.css"

# Create css directory if not exists
if (-not (Test-Path $cssDir)) {
    New-Item -ItemType Directory -Path $cssDir -Force | Out-Null
}

# Read style.html
$content = Get-Content $stylePath -Raw -Encoding UTF8

# Remove <style> and </style> tags
$css = $content -replace '(?s)^\s*<style>\s*', '' -replace '(?s)\s*</style>\s*$', ''

# Write CSS file (UTF-8 without BOM)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($cssPath, $css, $utf8NoBom)

Write-Output "CSS file created: $cssPath"
Write-Output "Size: $($css.Length) characters"
