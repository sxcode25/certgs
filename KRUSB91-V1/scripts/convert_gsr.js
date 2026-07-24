// convert_gsr.js - Convert google.script.run → api calls in JS files
// Run with: node scripts/convert_gsr.js

const fs = require('fs');
const path = require('path');

const jsDir = path.join(__dirname, '..', 'js');
const files = ['core.js', 'canvas.js', 'export.js'];

files.forEach(filename => {
  const filePath = path.join(jsDir, filename);
  let content = fs.readFileSync(filePath, 'utf8');
  const beforeCount = (content.match(/google\.script\.run/g) || []).length;
  
  // ══════════════════════════════════════════════════════════════════
  // Step 1: Convert simple fire-and-forget one-liners
  // google.script.run.functionName(getToken(), args);
  // → api.functionName(args);
  // ══════════════════════════════════════════════════════════════════
  content = content.replace(
    /google\.script\.run\.(\w+)\(getToken\(\),\s*/g,
    'api.$1('
  );
  content = content.replace(
    /google\.script\.run\.(\w+)\(getToken\(\)\)/g,
    'api.$1()'
  );
  
  // ══════════════════════════════════════════════════════════════════
  // Step 2: Convert multi-line blocks
  // google.script.run
  //   .withSuccessHandler(function(result) { ... })
  //   .withFailureHandler(function(err) { ... })
  //   .functionName(getToken(), args);
  // 
  // → api.functionName(args)
  //   .then(function(result) { ... })
  //   .catch(function(err) { ... });
  // ══════════════════════════════════════════════════════════════════
  
  // Process line by line with a state machine
  const lines = content.split('\n');
  const output = [];
  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Detect "google.script.run" standalone line (start of chain)
    if (trimmed === 'google.script.run') {
      const indent = line.match(/^(\s*)/)[1];
      
      // Collect the entire chain
      let successHandler = '';
      let successParam = 'result';
      let failureHandler = '';
      let failureParam = 'err';
      let funcName = '';
      let funcArgs = '';
      let blockEnd = i + 1;
      
      // Parse the chain lines
      let depth = 0;
      let currentSection = ''; // 'success', 'failure', ''
      let sectionBody = [];
      let j = i + 1;
      
      // Collect all lines of the chain
      let chainLines = [line];
      while (j < lines.length) {
        chainLines.push(lines[j]);
        
        const t = lines[j].trim();
        
        // Count braces to track nesting
        for (let c = 0; c < t.length; c++) {
          if (t[c] === '{') depth++;
          if (t[c] === '}') depth--;
        }
        
        // Check if this line has the final function call
        const funcMatch = t.match(/^\.(\w+)\((.*)?\);\s*$/);
        if (funcMatch && !t.startsWith('.with') && depth <= 0) {
          funcName = funcMatch[1];
          funcArgs = funcMatch[2] || '';
          blockEnd = j + 1;
          break;
        }
        
        j++;
      }
      
      if (funcName) {
        // Remove getToken() from args
        funcArgs = funcArgs.replace(/^\s*getToken\(\)\s*,?\s*/, '').replace(/,\s*$/, '');
        
        // Re-parse to extract handler bodies
        const chainText = chainLines.join('\n');
        
        // Extract success handler
        const successMatch = chainText.match(
          /\.withSuccessHandler\(function\s*\((\w+)\)\s*\{([\s\S]*?)\}\s*\)\s*$/m
        );
        
        // Extract failure handler
        const failMatch = chainText.match(
          /\.withFailureHandler\(function\s*\((\w+)\)\s*\{([\s\S]*?)\}\s*\)\s*$/m
        );
        
        // Build the full chain text to extract handlers properly
        // Use a different approach: find handler blocks by counting braces
        let fullChain = chainText;
        
        // Extract withSuccessHandler block
        let sIdx = fullChain.indexOf('.withSuccessHandler(function');
        let fIdx = fullChain.indexOf('.withFailureHandler(function');
        let funcIdx = fullChain.lastIndexOf('.' + funcName + '(');
        
        let successBody = '';
        let failBody = '';
        
        if (sIdx !== -1) {
          // Find the function param
          const sParamMatch = fullChain.substring(sIdx).match(/\.withSuccessHandler\(function\s*\((\w+)\)\s*\{/);
          if (sParamMatch) {
            successParam = sParamMatch[1];
            // Find matching closing brace+paren
            let startBrace = fullChain.indexOf('{', sIdx + sParamMatch[0].length - 1);
            let braceCount = 0;
            let endBrace = startBrace;
            for (let k = startBrace; k < fullChain.length; k++) {
              if (fullChain[k] === '{') braceCount++;
              if (fullChain[k] === '}') {
                braceCount--;
                if (braceCount === 0) {
                  endBrace = k;
                  break;
                }
              }
            }
            successBody = fullChain.substring(startBrace + 1, endBrace);
          }
        }
        
        if (fIdx !== -1) {
          const fParamMatch = fullChain.substring(fIdx).match(/\.withFailureHandler\(function\s*\((\w+)\)\s*\{/);
          if (fParamMatch) {
            failureParam = fParamMatch[1];
            let startBrace = fullChain.indexOf('{', fIdx + fParamMatch[0].length - 1);
            let braceCount = 0;
            let endBrace = startBrace;
            for (let k = startBrace; k < fullChain.length; k++) {
              if (fullChain[k] === '{') braceCount++;
              if (fullChain[k] === '}') {
                braceCount--;
                if (braceCount === 0) {
                  endBrace = k;
                  break;
                }
              }
            }
            failBody = fullChain.substring(startBrace + 1, endBrace);
          }
        }
        
        // Build the new api call
        let apiCall = `${indent}api.${funcName}(${funcArgs})`;
        
        if (successBody.trim()) {
          apiCall += `\n${indent}  .then(function(${successParam}) {${successBody}})`;
        }
        if (failBody.trim()) {
          apiCall += `\n${indent}  .catch(function(${failureParam}) {${failBody}})`;
        }
        apiCall += ';';
        
        output.push(apiCall);
        i = blockEnd;
        continue;
      }
    }
    
    output.push(line);
    i++;
  }
  
  const result = output.join('\n');
  const afterCount = (result.match(/google\.script\.run/g) || []).length;
  
  fs.writeFileSync(filePath, result, 'utf8');
  console.log(`${filename}: ${beforeCount} → ${afterCount} google.script.run calls remaining`);
});

console.log('\nConversion complete!');
