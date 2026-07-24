# extract_js.ps1 - Extract JS from script-*.html files and convert google.script.run
$basePath = Split-Path -Parent $PSScriptRoot
$jsDir = Join-Path $basePath "js"

if (-not (Test-Path $jsDir)) {
    New-Item -ItemType Directory -Path $jsDir -Force | Out-Null
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$files = @(
    @{ Source = "script-utils.html"; Target = "utils.js" },
    @{ Source = "script-core.html"; Target = "core.js" },
    @{ Source = "script-canvas.html"; Target = "canvas.js" },
    @{ Source = "script-export.html"; Target = "export.js" }
)

foreach ($file in $files) {
    $sourcePath = Join-Path $basePath $file.Source
    $targetPath = Join-Path $jsDir $file.Target
    
    $content = Get-Content $sourcePath -Raw -Encoding UTF8
    
    # Remove <script> and </script> tags
    $js = $content -replace '(?s)^\s*<script>\s*', '' -replace '(?s)\s*</script>\s*$', ''
    
    [System.IO.File]::WriteAllText($targetPath, $js, $utf8NoBom)
    Write-Output "Created: $($file.Target) ($($js.Length) chars)"
}

Write-Output "`nAll JS files extracted successfully!"
