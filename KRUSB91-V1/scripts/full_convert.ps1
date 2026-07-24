# full_convert.ps1 - Re-extract JS from HTML and convert google.script.run
# Uses simple string replacement approach (no regex for multiline blocks)

$basePath = Split-Path -Parent $PSScriptRoot
$jsDir = Join-Path $basePath "js"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

# Step 1: Re-extract JS files from HTML sources
$sourceFiles = @(
    @{ Source = "script-utils.html"; Target = "utils.js" },
    @{ Source = "script-core.html"; Target = "core.js" },
    @{ Source = "script-canvas.html"; Target = "canvas.js" },
    @{ Source = "script-export.html"; Target = "export.js" }
)

foreach ($file in $sourceFiles) {
    $sourcePath = Join-Path $basePath $file.Source
    $targetPath = Join-Path $jsDir $file.Target
    
    $content = Get-Content $sourcePath -Raw -Encoding UTF8
    $js = $content -replace '(?s)^\s*<script>\s*', '' -replace '(?s)\s*</script>\s*$', ''
    
    [System.IO.File]::WriteAllText($targetPath, $js, $utf8NoBom)
    Write-Output "Extracted: $($file.Target)"
}

# Step 2: Convert google.script.run in all JS files
$jsFiles = @("utils.js", "core.js", "canvas.js", "export.js")

foreach ($filename in $jsFiles) {
    $filePath = Join-Path $jsDir $filename
    $content = Get-Content $filePath -Raw -Encoding UTF8
    $beforeCount = ([regex]::Matches($content, 'google\.script\.run')).Count
    
    # Process line by line
    $lines = $content -split "`n"
    $result = New-Object System.Collections.Generic.List[string]
    $i = 0
    $converted = 0
    
    while ($i -lt $lines.Count) {
        $line = $lines[$i]
        $trimmed = $line.TrimEnd("`r").Trim()
        
        # ═══ Pattern 1: Simple one-liner ═══
        # google.script.run.functionName(getToken(), args);
        if ($trimmed -match '^google\.script\.run\.(\w+)\((.+)\);\s*$' -and $trimmed -notmatch '\.with') {
            $indent = ($line -replace '^(\s*).*', '$1').TrimEnd("`r")
            $funcName = $Matches[1]
            $args = $Matches[2]
            $args = $args -replace '^\s*getToken\(\)\s*,?\s*', ''
            $args = $args -replace ',\s*$', ''
            $result.Add("${indent}api.${funcName}(${args});")
            $converted++
            $i++
            continue
        }
        
        # ═══ Pattern 2: Multi-line google.script.run chain ═══
        if ($trimmed -eq 'google.script.run' -or $trimmed -match '^google\.script\.run\s*$') {
            $indent = ($line -replace '^(\s*).*', '$1').TrimEnd("`r")
            
            # Collect the entire chain by counting braces
            $chainLines = @($line)
            $j = $i + 1
            $braceDepth = 0
            $foundFunc = $false
            $funcLine = ""
            
            # Count braces in first line
            foreach ($c in $trimmed.ToCharArray()) {
                if ($c -eq '{') { $braceDepth++ }
                if ($c -eq '}') { $braceDepth-- }
            }
            
            while ($j -lt $lines.Count -and -not $foundFunc) {
                $nextLine = $lines[$j]
                $nextTrimmed = $nextLine.TrimEnd("`r").Trim()
                $chainLines += $nextLine
                
                foreach ($c in $nextTrimmed.ToCharArray()) {
                    if ($c -eq '{') { $braceDepth++ }
                    if ($c -eq '}') { $braceDepth-- }
                }
                
                # Function call line: .functionName(...); with depth 0
                if ($nextTrimmed -match '^\.\w+\(' -and $nextTrimmed -notmatch '^\.with' -and $braceDepth -le 0) {
                    $funcLine = $nextTrimmed
                    $foundFunc = $true
                }
                
                $j++
            }
            
            if ($foundFunc) {
                $chainText = ($chainLines -join "`n")
                
                # Extract function name and args from last line
                $funcMatch = [regex]::Match($funcLine, '\.(\w+)\((.*)\);\s*$')
                if ($funcMatch.Success) {
                    $funcName = $funcMatch.Groups[1].Value
                    $funcArgs = $funcMatch.Groups[2].Value.Trim()
                    $funcArgs = $funcArgs -replace '^\s*getToken\(\)\s*,?\s*', ''
                    $funcArgs = $funcArgs -replace ',\s*$', ''
                    
                    # Extract handler bodies using brace counting
                    $successParam = "result"
                    $successBody = ""
                    $failureParam = "err"
                    $failureBody = ""
                    
                    # Find withSuccessHandler
                    $sMatch = [regex]::Match($chainText, '\.withSuccessHandler\(function\s*\((\w+)\)\s*\{')
                    if ($sMatch.Success) {
                        $successParam = $sMatch.Groups[1].Value
                        $startPos = $sMatch.Index + $sMatch.Length
                        $bd = 1
                        $endPos = $startPos
                        for ($k = $startPos; $k -lt $chainText.Length; $k++) {
                            if ($chainText[$k] -eq '{') { $bd++ }
                            if ($chainText[$k] -eq '}') { 
                                $bd--
                                if ($bd -eq 0) { $endPos = $k; break }
                            }
                        }
                        $successBody = $chainText.Substring($startPos, $endPos - $startPos)
                    }
                    
                    # Find withFailureHandler
                    $fMatch = [regex]::Match($chainText, '\.withFailureHandler\(function\s*\((\w+)\)\s*\{')
                    if ($fMatch.Success) {
                        $failureParam = $fMatch.Groups[1].Value
                        $startPos = $fMatch.Index + $fMatch.Length
                        $bd = 1
                        $endPos = $startPos
                        for ($k = $startPos; $k -lt $chainText.Length; $k++) {
                            if ($chainText[$k] -eq '{') { $bd++ }
                            if ($chainText[$k] -eq '}') { 
                                $bd--
                                if ($bd -eq 0) { $endPos = $k; break }
                            }
                        }
                        $failureBody = $chainText.Substring($startPos, $endPos - $startPos)
                    }
                    
                    # Build new api call
                    $apiCall = "${indent}api.${funcName}(${funcArgs})"
                    
                    if ($successBody.Trim()) {
                        $apiCall += "`n${indent}  .then(function(${successParam}) {${successBody}})"
                    }
                    if ($failureBody.Trim()) {
                        $apiCall += "`n${indent}  .catch(function(${failureParam}) {${failureBody}})"
                    }
                    $apiCall += ";"
                    
                    $result.Add($apiCall)
                    $converted++
                    $i = $j
                    continue
                }
            }
        }
        
        # ═══ Pattern 3: google.script.run inside a line (e.g., var runner = google.script.run) ═══
        if ($trimmed -match 'var runner = google\.script\.run') {
            # This is in serverCall() - already handled in utils.js
            # Just pass through
        }
        
        $result.Add($line)
        $i++
    }
    
    $finalContent = $result -join "`n"
    $afterCount = ([regex]::Matches($finalContent, 'google\.script\.run')).Count
    
    [System.IO.File]::WriteAllText($filePath, $finalContent, $utf8NoBom)
    Write-Output "${filename}: ${beforeCount} calls found, ${converted} converted, ${afterCount} remaining"
}

Write-Output "`nDone!"
