const fs = require('fs');
let lines = fs.readFileSync('js/crowd.js', 'utf8').split('\n');

lines[501] = '    /*';

lines[616] = '            */\n            if (vs === antes || vs.indexOf(\'crowdPesos(dePe\') === -1) {';

fs.writeFileSync('js/crowd.js', lines.join('\n'));
