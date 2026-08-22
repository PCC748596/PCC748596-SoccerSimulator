const fs = require('fs');
let code = fs.readFileSync('js/match.js', 'utf8');

const regex = /aplicar\(ladoOposto, 5\);\s+\}\);/;
const replacement = "aplicar(ladoOposto, 5);\n            });\n        }";
code = code.replace(regex, replacement);
fs.writeFileSync('js/match.js', code);
