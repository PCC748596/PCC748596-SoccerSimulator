const fs = require('fs');
let lines = fs.readFileSync('js/crowd.js', 'utf8').split('\n');

lines[477] = '    /*';
lines[483] = '    */';

fs.writeFileSync('js/crowd.js', lines.join('\n'));
