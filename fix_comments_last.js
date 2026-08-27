const fs = require('fs');
let lines = fs.readFileSync('js/crowd.js', 'utf8').split('\n');

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('update(dt) {')) {
        lines.splice(i, 0, '    */');
        break;
    }
}
fs.writeFileSync('js/crowd.js', lines.join('\n'));
