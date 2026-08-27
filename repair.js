const fs = require('fs');
let lines = fs.readFileSync('js/crowd.js', 'utf8').split('\n');
let inComment = false;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('/*')) {
        inComment = true;
    }
    if (lines[i].includes('*/')) {
        inComment = false;
    }
    // if we are in comment and next line has a property assignment (e.g. `    duracaoTransicao: 0.55,`)
    if (inComment && lines[i].match(/^\s*$/) && i + 1 < lines.length && lines[i+1].match(/^\s+[a-zA-Z]+:/)) {
        lines[i] = '    */';
        inComment = false;
    }
}
fs.writeFileSync('js/crowd.js', lines.join('\n'));
