const fs = require('fs');
let lines = fs.readFileSync('js/crowd.js', 'utf8').split('\n');

// 1. Line 634 is build(scene, lugares). We need to insert `    */` at line 633.
lines.splice(633, 0, '    */');

// Now line 785 is actually line 786. Let's find it.
for (let i = 0; i < lines.length; i++) {
    if (lines[i] === '    */' && lines[i+1] === '    /*' && lines[i+2].includes('Corre por frame')) {
        // Remove the unexpected `*/`
        lines.splice(i, 1);
        break;
    }
}

// Check for the extra */ at the end
if (lines[lines.length - 1] === '*/' || lines[lines.length - 2] === '*/') {
    if (lines[lines.length - 1] === '*/') lines.pop();
    else if (lines[lines.length - 2] === '*/') {
        lines.splice(lines.length - 2, 1);
    }
}

fs.writeFileSync('js/crowd.js', lines.join('\n'));
