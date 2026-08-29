const fs = require('fs');
let lines = fs.readFileSync('js/crowd.js', 'utf8').split('\n');
lines[635] = '    build(scene, lugares) {';
fs.writeFileSync('js/crowd.js', lines.join('\n'));
