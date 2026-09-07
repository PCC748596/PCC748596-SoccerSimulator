const fs = require('fs');
let code = fs.readFileSync('js/bt/player_bt.js', 'utf8');

code = code.replace(
    /if \(\(p\.pos === 'CF' \|\| p\.pos === 'ST' \|\| p\.pos === 'SS' \|\| p\.pos === 'LW' \|\| p\.pos === 'RW' \|\| p\.pos === 'AM'\) && ctx\.livreAFrente10m20g && ctx\.zoneAhead > 0\) \{/g,
    `// Se é atacante, e tem pelo menos 3 metros de espaço à frente, DEVE conduzir para cima da defesa
                    // em vez de parar e tocar para trás, ganhando metros até poder driblar ou chutar!
                    if ((p.pos === 'CF' || p.pos === 'ST' || p.pos === 'SS' || p.pos === 'LW' || p.pos === 'RW' || p.pos === 'AM') && ctx.zoneAhead > 0 && ctx.espacoAFrente > 3.0) {`
);

fs.writeFileSync('js/bt/player_bt.js', code);
console.log('Patched ConduzirEmEspaco aggro');
