const fs = require('fs');
let code = fs.readFileSync('js/bt/player_bt.js', 'utf8');

code = code.replace(
    /const avancoDestino = Math\.min\(CAMPO_COMP \/ 2 - 2, \(p\.model\.position\.z \* p\.dirZ\) \+ 18\.0\);/,
    `let avancoDestino = Math.min(CAMPO_COMP / 2 - 2.0, (p.model.position.z * p.dirZ) + 18.0);
        // Limitar pela linha de fora-de-jogo
        const bbEquipa = (typeof TeamAI !== 'undefined') ? TeamAI.get(p.team) : null;
        if (bbEquipa && typeof bbEquipa.offsideLimitDir === 'number') {
            const tecto = bbEquipa.offsideLimitDir - 0.5;
            if (avancoDestino > tecto) avancoDestino = tecto;
        }`
);

fs.writeFileSync('js/bt/player_bt.js', code);
console.log('Patched for offside.');
