const fs = require('fs');
let code = fs.readFileSync('js/player.js', 'utf8');

code = code.replace(/let lookPos = Match\.ball\.position\.clone\(\);/g, "let lookPos = _v1.copy(Match.ball.position);");

fs.writeFileSync('js/player.js', code);
console.log("Patched player gk clones!");
