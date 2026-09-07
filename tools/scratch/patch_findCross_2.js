const fs = require('fs');
let code = fs.readFileSync('js/bt/player_bt.js', 'utf8');

code = code.replace(
    /const avanco = Math\.min\(v \* tVoo, C\.leadMax \?\? 4\.0\);/,
    `const avanco = Math.min(v * tVoo, C.leadMax ?? 4.0);
            
            // CORREÇÃO: Limitar o avanço no eixo Z para a bola não ser cruzada "para dentro da baliza/linha de fundo"
            // Se o alvo está indo pra frente e nós damos +4 metros, podemos jogar a bola pra fora do campo.`
);

code = code.replace(
    /p\.passAimPoint = \{ x: alvoPos\.x \+ lx, z: alvoPos\.z \+ lz \};/,
    `let finalZ = alvoPos.z + lz;
    const tetoFundo = ((CAMPO_COMP / 2) - 2.0) * p.dirZ; // Não passa da linha de fundo menos 2m
    if (p.dirZ > 0 && finalZ > tetoFundo) finalZ = tetoFundo;
    if (p.dirZ < 0 && finalZ < tetoFundo) finalZ = tetoFundo;
    
    p.passAimPoint = { x: alvoPos.x + lx, z: finalZ };`
);

fs.writeFileSync('js/bt/player_bt.js', code);
console.log('Patched actCross aim.');
