const fs = require('fs');
let lines = fs.readFileSync('js/crowd.js', 'utf8').split('\n');
lines.splice(634, 1);
fs.writeFileSync('js/crowd.js', lines.join('\n'));
