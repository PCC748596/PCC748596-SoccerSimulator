const fs = require('fs');
let code = fs.readFileSync('js/bt/player_bt.js', 'utf8');

code = code.replace(
    /const mateZ = mateAlvo\.z \* p\.dirZ;\s*\/\/ Tem de estar aquém da linha \(senão já está em fora-de-jogo\) mas perto dela\.\s*if \(mateZ > linhaNoNosso\) continue;\s*if \(mateZ < linhaNoNosso - PassModel\.throughBallGap\) continue;/,
    `const mateZ_current = mate.model.position.z * p.dirZ;
        const mateZ = mateAlvo.z * p.dirZ;
        
        // Verificação de fora-de-jogo DEVE usar a posição ACTUAL do jogador, não a projetada,
        // senão jogadores em sprint (infiltrações) são rejeitados injustamente por parecerem estar offside!
        if (mateZ_current > linhaNoNosso + 0.5) continue; 
        
        // A folga avalia se o jogador já está razoavelmente perto da última linha para a conseguir romper.
        if (mateZ_current < linhaNoNosso - PassModel.throughBallGap) continue;
        
        // Bónus especial se ele já estiver em movimento de ruptura
        let sprintBonus = 0;
        if (mate.fsm && mate.fsm.currentState === 'RUN_INTO_SPACE') sprintBonus = 300;
        `
);

// We also need to add sprintBonus to the score!
code = code.replace(
    /let score = 100 - \(Math\.abs\(alvoX\) \* 0\.5\);/,
    `let score = 100 - (Math.abs(alvoX) * 0.5) + sprintBonus;`
);

fs.writeFileSync('js/bt/player_bt.js', code);
console.log('Patched findThroughBall');
