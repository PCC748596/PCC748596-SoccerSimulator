const fs = require('fs');
let code = fs.readFileSync('js/bt/player_bt.js', 'utf8');

code = code.replace(
    /\/\/ Limitar pela linha de fora-de-jogo[\s\S]*?if \(avancoDestino > tecto\) avancoDestino = tecto;\s*\}/,
    `// Removido o limite de offside: um jogador em RUN_INTO_SPACE está ativamente a tentar romper a linha,
        // o risco de ficar offside é natural do jogo. Se o limitarmos à linha, ele nunca se desmarca nas costas!`
);

fs.writeFileSync('js/bt/player_bt.js', code);
console.log('Patched offside cap');
