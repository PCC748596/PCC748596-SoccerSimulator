const fs = require('fs');
let code = fs.readFileSync('js/crowd.js', 'utf8');
let regex = /\/\*|\*\//g;
let match;
let inComment = false;
let lines = code.split('\n');

function getLine(index) {
    let sub = code.substring(0, index);
    return sub.split('\n').length;
}

while ((match = regex.exec(code)) !== null) {
    console.log(`Line ${getLine(match.index)}: ${match[0]} (inComment before: ${inComment})`);
    if (match[0] === '/*') {
        inComment = true;
    } else {
        inComment = false;
    }
}
