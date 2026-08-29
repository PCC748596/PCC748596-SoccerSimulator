const fs = require('fs');
let lines = fs.readFileSync('js/crowd.js', 'utf8').split('\n');

for(let i = 0; i < lines.length; i++) {
    if (lines[i].includes('*/') && lines[i].trim() === '*/' && i+1 < lines.length && lines[i+1].trim() === '/*') {
        // remove both
        lines[i] = '';
        lines[i+1] = '';
    }
}
fs.writeFileSync('js/crowd.js', lines.join('\n'));
