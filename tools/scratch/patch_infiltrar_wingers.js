const fs = require('fs');
let code = fs.readFileSync('js/bt/player_bt.js', 'utf8');

code = code.replace(
    /\/\/ A bola deve estar no mesmo corredor lateral[\s\S]*?if \(isWingerOrFullback\) \{[\s\S]*?return false;\n    \}/,
    `// Removida a restricao de corredor para permitir diagonais nas costas do lateral oposto`
);

fs.writeFileSync('js/bt/player_bt.js', code);
console.log('Patched wingers infiltration');
