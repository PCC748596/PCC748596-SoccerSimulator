const fs = require('fs');
let code = fs.readFileSync('js/bt/player_bt.js', 'utf8');

// Insert the functions right before `actChaseBall`
const funcs = `
function podeFazerOverlap(ctx) {
    const p = ctx.p;
    if (p.role === 'gk') return false;
    
    // Apenas defesas laterais ou extremos
    if (p.role !== 'lat' && p.role !== 'ml' && p.pos !== 'LB' && p.pos !== 'RB' && p.pos !== 'LW' && p.pos !== 'RW') return false;
    
    const bc = Match.ballCarrier;
    if (!bc || bc.team !== p.team || bc === p) return false;
    
    const meuLado = Math.sign(p.model.position.x) || 1;
    const carrierLado = Math.sign(bc.model.position.x) || 1;
    
    if (meuLado !== carrierLado && Math.abs(p.model.position.x) > 5) return false;
    
    const avancoMin = (typeof JogadasCombinadas !== 'undefined') ? JogadasCombinadas.overlap.avancoMin : -5.0;
    if (p.model.position.z * p.dirZ < avancoMin) return false;

    const meuAvanco = p.model.position.z * p.dirZ;
    const bcAvanco = bc.model.position.z * p.dirZ;
    
    if (meuAvanco > bcAvanco + 5) return false; // Já estou lá à frente
    
    if (p.model.position.distanceTo(bc.model.position) > 20.0) return false;
    if (Math.abs(p.model.position.x) < Math.abs(bc.model.position.x)) return false; // Estou por dentro
    if (Math.random() > 0.05) return false; // Não arranca sempre

    return true;
}

function actOverlap(ctx) {
    const p = ctx.p;
    let targetX = (Math.abs(p.model.position.x) > 5) ? p.model.position.x : (CAMPO_LARG / 2 - 2) * (Math.sign(p.model.position.x) || 1);
    
    let avancoDestino = Math.min(CAMPO_COMP / 2 - 2.0, (p.model.position.z * p.dirZ) + 18.0);
    const bbEquipa = (typeof TeamAI !== 'undefined') ? TeamAI.get(p.team) : null;
    if (bbEquipa && typeof bbEquipa.offsideLimitDir === 'number') {
        const tecto = bbEquipa.offsideLimitDir - 0.5;
        if (avancoDestino > tecto) avancoDestino = tecto;
    }
    
    p.dynamicTarget.set(targetX, ALTURA_BASE_Y, avancoDestino * p.dirZ);
    p.speedMult = p.sprintSpeed || (6.5 * 1.3);
    p.overlapTimer = 1.0; 
    
    if (p.fsm.currentState !== 'RUN_INTO_SPACE') {
        p.runTimer = 3.5;
        p.fsm.changeState('RUN_INTO_SPACE');
    }
}

function actEsperarDevolucao(ctx) {
    const p = ctx.p;
    const tab = p.esperarDevolucao;
    p.dynamicTarget.set(tab.alvo.x, ALTURA_BASE_Y, tab.alvo.z);
    p.speedMult = (typeof JogadasCombinadas !== 'undefined' && JogadasCombinadas.tabelinha.velocidadeArranque) ? JogadasCombinadas.tabelinha.velocidadeArranque : 7.9;
    
    if (p.fsm.currentState !== 'RUN_INTO_SPACE') {
        p.runTimer = tab.timer; 
        p.fsm.changeState('RUN_INTO_SPACE');
    }
}
`;

code = code.replace(/function actChaseBall/, funcs + '\nfunction actChaseBall');

// Now inject the BT nodes before `seq('Receber',`
const btNodes = `
            seq('Tabelinha',
                cond('pediTabelinha', (ctx) => !!(ctx.p.esperarDevolucao && ctx.p.esperarDevolucao.timer > 0)),
                act('esperarDevolucao', actEsperarDevolucao)
            ),
            seq('Overlap',
                cond('fazerOverlap', podeFazerOverlap),
                act('overlap', actOverlap)
            ),
`;
code = code.replace(/seq\('Receber',/, btNodes + "            seq('Receber',");

fs.writeFileSync('js/bt/player_bt.js', code);
console.log('Patched BT combinations (Overlap, Tabelinha)');
