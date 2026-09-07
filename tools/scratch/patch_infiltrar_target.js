const fs = require('fs');
let code = fs.readFileSync('js/bt/player_bt.js', 'utf8');

code = code.replace(
    /let targetX = p\.model\.position\.x;\s*\/\/ Se for atacante central, pode fechar um pouco mais para o gol\s*const isCentral = p\.pos === 'CF' \|\| p\.pos === 'SS' \|\| p\.pos === 'AM';\s*if \(isCentral\) \{\s*targetX = p\.model\.position\.x \* 0\.7;\s*\}/,
    `let targetX = p.model.position.x;
        
        const isCentral = p.pos === 'CF' || p.pos === 'SS' || p.pos === 'AM';
        const isWinger = p.pos === 'LM' || p.pos === 'RM' || p.pos === 'LW' || p.pos === 'RW';
        
        if (isCentral) {
            targetX = p.model.position.x * 0.5; // Fecha forte pro gol
        } else if (isWinger && Math.sign(p.model.position.x) !== Math.sign(Match.ball.position.x)) {
            // Extremo do lado oposto à bola fecha para a área (segundo poste)
            targetX = p.model.position.x * 0.4; 
        }`
);

fs.writeFileSync('js/bt/player_bt.js', code);
console.log('Patched targetX for wingers');
