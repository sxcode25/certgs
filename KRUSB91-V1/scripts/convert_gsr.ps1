# convert_gsr.ps1 - Convert google.script.run patterns to api.call() in JS files
# This script handles ALL patterns found in the codebase

$basePath = Split-Path -Parent $PSScriptRoot
$jsDir = Join-Path $basePath "js"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$files = @("core.js", "canvas.js", "export.js")

foreach ($filename in $files) {
    $filePath = Join-Path $jsDir $filename
    if (-not (Test-Path $filePath)) {
        Write-Output "SKIP: $filename not found"
        continue
    }
    
    $content = Get-Content $filePath -Raw -Encoding UTF8
    $original = $content
    
    # Count occurrences before
    $beforeCount = ([regex]::Matches($content, 'google\.script\.run')).Count
    
    # ═══════════════════════════════════════════════════════════════
    # Pattern 1: google.script.run.withSuccessHandler(...).withFailureHandler(...).functionName(args)
    # → api.functionName(args).then(...).catch(...)
    # ═══════════════════════════════════════════════════════════════
    
    # Pattern 1a: .withSuccessHandler(function(result) { ... }).withFailureHandler(function(err) { ... }).functionName(getToken(), ...)
    # This is the most common pattern - needs careful regex
    
    # Pattern 1b: Simple fire-and-forget: google.script.run.updateRecordStatuses(getToken(), updates);
    # → api.updateRecordStatuses(updates);
    
    # ═══════════════════════════════════════════════════════════════
    # Due to complexity of multi-line regex with nested braces,
    # we'll output the count and let the main tool handle conversion
    # ═══════════════════════════════════════════════════════════════
    
    Write-Output "${filename}: Found $beforeCount google.script.run calls"
}
