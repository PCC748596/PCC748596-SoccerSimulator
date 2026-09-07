const fs = require('fs');
let code = fs.readFileSync('js/fsm.js', 'utf8');

code = code.replace(
    /const houvePasse = \(Match\.ballCarrier && Match\.ballCarrier !== p\.runCarrier\);/,
    `const houvePasse = false; // Removido para nao abortar durante dribles intermitentes`
);

fs.writeFileSync('js/fsm.js', code);
console.log('Patched fsm.js');
