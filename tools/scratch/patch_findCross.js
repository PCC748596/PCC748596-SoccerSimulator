const fs = require('fs');
let code = fs.readFileSync('js/bt/player_bt.js', 'utf8');

code = code.replace(
    /const fundoMinAlvo = \(C\.fundoMinAlvo !== undefined\) \? C\.fundoMinAlvo : 0;/,
    `const fundoMinAlvo = (C.fundoMinAlvo !== undefined) ? C.fundoMinAlvo : 0;
    
    // CORREÇÃO: Não tenta cruzar se ele mesmo estiver quase colado à linha de fundo (sem ângulo).
    // O jogador na linha de fundo às vezes cruza para fora do campo porque a área alvo ficou "atrás" dele
    // em termos de ângulo se ele for até a linha de fundo da bandeirinha e tentar cruzar na paralela.
    const distFundoJogador = (CAMPO_COMP / 2) - Math.abs(p.model.position.z);
    if (distFundoJogador < 1.0) { ctx._cross = null; return null; }
    
    // CORREÇÃO 2: A distância X dele pra o alvo tem que ser no mínimo razoável pra fazer sentido um balão,
    // se o cruzamento for quase no mesmo X (como se ele corresse da lateral em bico para a área e cruzasse pro 1o poste colado nele)
    // é um passe, não cruzamento.`
);

code = code.replace(
    /const dAoAlvo = m\.model\.position\.distanceTo\(p\.model\.position\);/,
    `const dx = Math.abs(m.model.position.x - p.model.position.x);
        if (dx < 5.0) continue; // Muito no mesmo corredor pra ser cruzamento pelo ar normal
        const dAoAlvo = m.model.position.distanceTo(p.model.position);`
);

fs.writeFileSync('js/bt/player_bt.js', code);
console.log('Patched findCross.');
