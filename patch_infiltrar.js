const fs = require('fs');
let code = fs.readFileSync('js/bt/player_bt.js', 'utf8');

// Replace the podeInfiltrarLateral function
code = code.replace(
    /function podeInfiltrarLateral\(ctx\) \{[\s\S]*?return false;\n\}/,
    `function podeInfiltrar(ctx) {
    const p = ctx.p;
    if (p.role === 'gk' || p.pos === 'CB' || p.role === 'def') return false;
    if (p === Match.ballCarrier) return false;

    // Se já está a infiltrar, mantém a corrida enquanto tiver timer
    if (p.fsm.currentState === 'RUN_INTO_SPACE' && p.runTimer > 0) return true;

    // Se está em cooldown, não pode arrancar já
    if (p.runCooldown > 0) return false;

    const bola = Match.ball.position;
    const avancoBola = bola.z * p.dirZ;
    const meuAvanco = p.model.position.z * p.dirZ;
    
    if (meuAvanco < -15.0) return false; // Muito recuado na defesa

    const isWingerOrFullback = p.role === 'lat' || p.role === 'ml' || p.pos === 'LB' || p.pos === 'RB' || p.pos === 'LM' || p.pos === 'RM' || p.pos === 'LW' || p.pos === 'RW';
    const isAttacker = p.pos === 'CF' || p.pos === 'SS' || p.pos === 'AM';
    const isMidfielder = p.pos === 'CM' || p.pos === 'DM';

    // A bola deve estar no mesmo corredor lateral que ele (só para laterais/alas)
    if (isWingerOrFullback) {
        const ladoBola = Math.sign(bola.x) || 1;
        const meuLado = Math.sign(p.model.position.x) || 1;
        if (ladoBola !== meuLado || Math.abs(bola.x) < 8.0) return false;
    }

    // Distância aceitável para infiltrar (não quer arrancar se estiver muito longe da bola)
    const distToBall = p.model.position.distanceTo(bola);
    if (distToBall > 35.0) return false;

    // Tem de estar do meio campo pra frente, ou pelo menos não muito atrás da bola
    if (meuAvanco < avancoBola - 12.0) return false;

    // Probabilidade de arrancar baseada na posição (tabelas e infiltrações)
    let chance = 0.02;
    if (isAttacker) chance = 0.05;
    if (isMidfielder) chance = 0.015;

    if (Math.random() < chance) return true;

    return false;
}`
);

// Replace the actInfiltrarLateral function
code = code.replace(
    /function actInfiltrarLateral\(ctx\) \{[\s\S]*?return;\n\}/,
    `function actInfiltrar(ctx) {
    const p = ctx.p;
    
    if (p.fsm.currentState !== 'RUN_INTO_SPACE') {
        p.runTimer = 3.5; // corre durante uns segundos
        p.runCarrier = Match.ballCarrier;
        
        let targetX = p.model.position.x;
        
        // Se for atacante central, pode fechar um pouco mais para o gol
        const isCentral = p.pos === 'CF' || p.pos === 'SS' || p.pos === 'AM';
        if (isCentral) {
            targetX = p.model.position.x * 0.7; 
        }

        // Alvo lá na frente no corredor dele
        let avancoDestino = Math.min(CAMPO_COMP / 2 - 2.0, (p.model.position.z * p.dirZ) + 20.0);
        
        // Limitar pela linha de fora-de-jogo
        const bbEquipa = (typeof TeamAI !== 'undefined') ? TeamAI.get(p.team) : null;
        if (bbEquipa && typeof bbEquipa.offsideLimitDir === 'number') {
            const tecto = bbEquipa.offsideLimitDir - 0.5;
            if (avancoDestino > tecto) avancoDestino = tecto;
        }
        
        p.dynamicTarget.set(targetX, ALTURA_BASE_Y, avancoDestino * p.dirZ);
        p.speedMult = p.sprintSpeed || (6.5 * 1.3);
        p.fsm.changeState('RUN_INTO_SPACE');
    }
    
    return;
}`
);

// Replace in BT tree
code = code.replace(
    /seq\('InfiltracaoLateral',\s*cond\('querInfiltrar', podeInfiltrarLateral\),\s*act\('infiltrar', actInfiltrarLateral\)\s*\)/,
    `seq('Infiltracao',
                    cond('querInfiltrar', podeInfiltrar),
                    act('infiltrar', actInfiltrar)
                )`
);

fs.writeFileSync('js/bt/player_bt.js', code);
console.log('Patched player_bt.js');
