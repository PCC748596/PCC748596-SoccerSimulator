const fs = require('fs');
let lines = fs.readFileSync('js/crowd.js', 'utf8').split('\n');

lines[435] = '                */\n                if (!g || g.attributes.position.count !== n) {';
lines[448] = '                */\n                if (nome !== \'Idle\') {';
lines[464] = '    */\n    claqueEm(t, rnd) {';

fs.writeFileSync('js/crowd.js', lines.join('\n'));
