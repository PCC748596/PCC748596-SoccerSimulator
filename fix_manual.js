const fs = require('fs');
let lines = fs.readFileSync('js/crowd.js', 'utf8').split('\n');

lines[606] = '            /*';
lines[613] = '            */';

lines[626] = '    /*';
lines[634] = '    */';

fs.writeFileSync('js/crowd.js', lines.join('\n'));
