# convert_all.ps1 - Comprehensive google.script.run → api conversion
# Handles all patterns found in core.js, canvas.js, export.js

$basePath = Split-Path -Parent $PSScriptRoot
$jsDir = Join-Path $basePath "js"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$files = @("core.js", "canvas.js", "export.js")

foreach ($filename in $files) {
    $filePath = Join-Path $jsDir $filename
    $content = Get-Content $filePath -Raw -Encoding UTF8
    $beforeCount = ([regex]::Matches($content, 'google\.script\.run')).Count
    
    # ─── STEP 1: Convert multi-line google.script.run blocks ───
    # Pattern: google.script.run\n  .withSuccessHandler(function(result) { ... })\n  .withFailureHandler(function(err) { ... })\n  .functionName(getToken(), arg1, arg2);
    # → api.functionName(arg1, arg2).then(function(result) { ... }).catch(function(err) { ... });
    
    # We'll use a state machine approach reading line by line
    $lines = $content -split "`n"
    $output = New-Object System.Collections.Generic.List[string]
    $i = 0
    
    while ($i -lt $lines.Count) {
        $line = $lines[$i]
        $trimmed = $line.Trim()
        
        # Detect start of google.script.run block
        if ($trimmed -match 'google\.script\.run\s*$' -or $trimmed -match 'google\.script\.run\s*\.') {
            
            # Collect the entire google.script.run chain
            $blockLines = @()
            $blockLines += $line
            $indent = $line -replace '^(\s*).*', '$1'
            
            # Read ahead to get the full chain
            $j = $i + 1
            $foundEnd = $false
            while ($j -lt $lines.Count -and -not $foundEnd) {
                $nextLine = $lines[$j]
                $nextTrimmed = $nextLine.Trim()
                $blockLines += $nextLine
                
                # End of chain: line ends with ); and doesn't start with .with
                if ($nextTrimmed -match ';\s*$' -and $nextTrimmed -notmatch '^\.(with|$)') {
                    $foundEnd = $true
                }
                # Also end if we see the function call (e.g., .loginUser(...);)
                if ($nextTrimmed -match '^\.\w+\(.*\);\s*$' -and $nextTrimmed -notmatch '^\.with') {
                    $foundEnd = $true
                }
                $j++
            }
            
            $blockText = $blockLines -join "`n"
            
            # Extract success handler body
            $successBody = ""
            if ($blockText -match '(?s)\.withSuccessHandler\(function\s*\((\w+)\)\s*\{(.*?)\}\s*\)') {
                $successParam = $Matches[1]
                $successBody = $Matches[2]
            }
            
            # Extract failure handler body
            $failureBody = ""
            if ($blockText -match '(?s)\.withFailureHandler\(function\s*\((\w+)\)\s*\{(.*?)\}\s*\)') {
                $failureParam = $Matches[1]
                $failureBody = $Matches[2]
            }
            
            # Extract function call: .functionName(getToken(), arg1, arg2)
            $funcName = ""
            $funcArgs = ""
            if ($blockText -match '\.(\w+)\(([^)]*)\);\s*$') {
                $funcName = $Matches[1]
                $funcArgs = $Matches[2].Trim()
                
                # Remove getToken() from args (api.js handles this automatically)
                $funcArgs = $funcArgs -replace '^\s*getToken\(\)\s*,?\s*', ''
                $funcArgs = $funcArgs -replace ',\s*$', ''
            }
            
            if ($funcName -and ($successBody -or $failureBody)) {
                # Build the api call
                $apiCall = "${indent}api.${funcName}(${funcArgs})"
                
                if ($successBody) {
                    $apiCall += "`n${indent}  .then(function(${successParam}) {${successBody}})"
                }
                if ($failureBody) {
                    $apiCall += "`n${indent}  .catch(function(${failureParam}) {${failureBody}})"
                }
                $apiCall += ";"
                
                $output.Add($apiCall)
                $i = $j
                continue
            }
        }
        
        # ─── Handle simple one-line fire-and-forget patterns ───
        # google.script.run.functionName(getToken(), args);
        if ($trimmed -match '^google\.script\.run\.(\w+)\((.+)\);\s*$') {
            $funcName = $Matches[1]
            $funcArgs = $Matches[2].Trim()
            $indent = $line -replace '^(\s*).*', '$1'
            
            # Remove getToken() from args
            $funcArgs = $funcArgs -replace '^\s*getToken\(\)\s*,?\s*', ''
            $funcArgs = $funcArgs -replace ',\s*$', ''
            
            $output.Add("${indent}api.${funcName}(${funcArgs});")
            $i++
            continue
        }
        
        # ─── Handle: var runner = google.script.run pattern (already converted in utils.js) ───
        # Just pass through
        
        $output.Add($line)
        $i++
    }
    
    $result = $output -join "`n"
    $afterCount = ([regex]::Matches($result, 'google\.script\.run')).Count
    
    [System.IO.File]::WriteAllText($filePath, $result, $utf8NoBom)
    Write-Output "${filename}: Converted $beforeCount → $afterCount remaining google.script.run calls"
}

Write-Output "`nConversion complete!"
