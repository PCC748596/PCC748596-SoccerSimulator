const fs = require('fs');
let code = fs.readFileSync('js/crowd.js', 'utf8');
let lines = code.split('\n');
let inComment = false;
let startLine = -1;
for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (!inComment) {
        if (line.includes('/*')) {
            inComment = true;
            startLine = i + 1;
            // check if closed on same line
            if (line.includes('*/') && line.indexOf('*/') > line.indexOf('/*')) {
                inComment = false;
            }
        }
    } else {
        if (line.includes('/*')) {
            console.log("Unclosed comment started at line " + startLine + ", found another /* at line " + (i + 1));
            // Let's assume we need to close before this line.
            lines.splice(i, 0, '    */');
            inComment = false;
            i--; // reprocess this line
        } else if (line.includes('*/')) {
            inComment = false;
        }
    }
}
if (inComment) {
    console.log("Unclosed comment started at line " + startLine + " reaches EOF");
    lines.push('*/');
}
fs.writeFileSync('js/crowd.js.fixed', lines.join('\n'));
