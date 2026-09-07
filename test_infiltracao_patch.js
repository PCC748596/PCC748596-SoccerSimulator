const fs = require('fs');
let code = fs.readFileSync('js/bt/player_bt.js', 'utf8');

const infiltracaoFns = `
function podeInfiltrarLateral(ctx) {
    const p = ctx.p;
    if (p.role === 'gk') return false;
    
    // Tem que ser lateral ou meia
    if (p.role !== 'lat' && p.role !== 'ml' && p.pos !== 'LB' && p.pos !== 'RB' && p.pos !== 'LM' && p.pos !== 'RM' && p.pos !== 'LW' && p.pos !== 'RW') return false;

    // Se já está a infiltrar, mantém a corrida enquanto tiver timer
    if (p.fsm.currentState === 'RUN_INTO_SPACE' && p.runTimer > 0) return true;

    // Se está em cooldown, não pode arrancar já
    if (p.runCooldown > 0) return false;

    // A bola deve estar no mesmo corredor lateral que ele
    const bola = Match.ball.position;
    const meiaLargura = CAMPO_LARG / 2;
    const tercoLat = CAMPO_LARG / 3; 

    // Lado do jogador e lado da bola (sinal de X)
    const ladoBola = Math.sign(bola.x) || 1;
    const meuLado = Math.sign(p.model.position.x) || 1;

    // Só arranca se a bola estiver do seu lado, e num dos terços laterais
    if (ladoBola !== meuLado || Math.abs(bola.x) < 8.0) return false;

    // A bola deve estar relativamente perto (terço ofensivo ou meio-campo)
    // E o jogador deve estar no meio-campo para a frente
    const avancoBola = bola.z * p.dirZ;
    const meuAvanco = p.model.position.z * p.dirZ;
    
    if (meuAvanco < -10.0) return false; // Muito recuado na defesa

    // Arranca se estiver à frente ou na linha da bola, ou a apoiar de trás
    if (Math.abs(meuAvanco - avancoBola) < 15.0) {
        // Probabilidade de arrancar
        if (Math.random() < 0.02) return true;
    }

    return false;
}

function actInfiltrarLateral(ctx) {
    const p = ctx.p;
    
    if (p.fsm.currentState !== 'RUN_INTO_SPACE') {
        p.runTimer = 3.5; // corre durante uns segundos
        p.runCarrier = Match.ballCarrier;
        
        // Alvo lá na frente no corredor dele
        const avancoDestino = Math.min(CAMPO_COMP / 2 - 2, (p.model.position.z * p.dirZ) + 18.0);
        p.dynamicTarget.set(p.model.position.x, ALTURA_BASE_Y, avancoDestino * p.dirZ);
        
        p.speedMult = p.sprintSpeed || (6.5 * 1.3);
        p.fsm.changeState('RUN_INTO_SPACE');
    }
    
    return;
}
`;

// Insert the functions right before `function actApoioCirculacao`
code = code.replace('function actApoioCirculacao', infiltracaoFns + '\nfunction actApoioCirculacao');

// Now insert into the tree
const treeInsert = `
                sel('DecisaoAtacando',
                seq('InfiltracaoLateral',
                    cond('querInfiltrar', podeInfiltrarLateral),
                    act('infiltrar', actInfiltrarLateral)
                ),
                seq('ApoioDeCirculacao',
`;
code = code.replace(`sel('DecisaoAtacando',
                seq('ApoioDeCirculacao',`, treeInsert);

fs.writeFileSync('js/bt/player_bt.js', code);
console.log('Patched player_bt.js');
