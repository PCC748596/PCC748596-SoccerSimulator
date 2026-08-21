const fs = require('fs');
let code = fs.readFileSync('js/config.js', 'utf8');

code = code.replace(/elevacaoCurta: 28 \* Math.PI \/ 180/, 'elevacaoCurta: 24 * Math.PI / 180');
code = code.replace(/elevacaoLonga: 30 \* Math.PI \/ 180/, 'elevacaoLonga: 25 * Math.PI / 180');
code = code.replace(/elevacaoCruzamento: 26 \* Math.PI \/ 180/, 'elevacaoCruzamento: 22 * Math.PI / 180');
code = code.replace(/elevacaoLancamento: 28 \* Math.PI \/ 180/, 'elevacaoLancamento: 24 * Math.PI / 180');

fs.writeFileSync('js/config.js', code);
console.log("Angles patched!");
