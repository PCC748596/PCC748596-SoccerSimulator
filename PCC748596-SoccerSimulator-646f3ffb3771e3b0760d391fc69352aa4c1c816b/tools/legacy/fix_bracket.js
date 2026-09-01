const fs = require('fs');
let lines = fs.readFileSync('js/crowd.js', 'utf8').split('\n');
lines.splice(770, 2); // remove `    },` and empty line
fs.writeFileSync('js/crowd.js', lines.join('\n'));
