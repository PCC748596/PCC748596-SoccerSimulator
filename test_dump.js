const fs = require('fs');
const ler = f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const code = ler('js/utils.js').match(/function mergeNonIndexedGeometries[\s\S]*?\n}\n/)[0] + '\n' + ler('js/crowd.js');
const lines = code.split('\n');
console.log(lines.slice(815, 825).join('\n'));
