const fs = require('fs');
let lines = fs.readFileSync('js/crowd.js', 'utf8').split('\n');

lines[435] = '                */';
lines[443] = '                /*';
lines[448] = '                */';
lines[458] = '    /*';
lines[464] = '    */';

fs.writeFileSync('js/crowd.js', lines.join('\n'));
