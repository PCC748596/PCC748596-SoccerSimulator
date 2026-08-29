const fs = require('fs');
let code = fs.readFileSync('js/bt/team_bt.js', 'utf8');

const oldBlock = `    if (bb.isAttacking && role === 'def') {
        const distAtras = (typeof TeamShape !== 'undefined' && typeof TeamShape.distanciaDefesaSaida === 'number')
            ? TeamShape.distanciaDefesaSaida : 3.0;
        const limiteCirculo = (typeof TeamShape !== 'undefined' && typeof TeamShape.limiteSaidaCirculoCentral === 'number')
            ? TeamShape.limiteSaidaCirculoCentral : 0.0;

        // Teto de segurança para a linha de defesa nunca ultrapassar ou colidir com a linha média (CM)
        const zMidDir = bloco.z0 + 0.45 * (bloco.z1 - bloco.z0);
        const zDefTeto = zMidDir - 3.5;

        const bolaZDir = (typeof bb.bolaZSuave === 'number' ? bb.bolaZSuave : (bb.ballZ || 0)) * bb.dir;
        const zAcompanhaBola = Math.min(bolaZDir - distAtras, limiteCirculo, zDefTeto);

        let zAlvoDir = zTarget * bb.dir;
        if (pos === 'CB') {
            if (zAcompanhaBola > zAlvoDir) {
                zAlvoDir = zAcompanhaBola;
            }
        } else if (pos === 'LB' || pos === 'RB') {
            const nudgeOffset = (nudge && nudge.comBola) ? nudge.comBola * (bloco.z1 - bloco.z0) : 0;
            const zLatAcompanha = Math.min(zAcompanhaBola + nudgeOffset, limiteCirculo, zDefTeto + 1.5);
            if (zLatAcompanha > zAlvoDir) {
                zAlvoDir = zLatAcompanha;
            }
        } else {
            if (zAcompanhaBola > zAlvoDir) {
                zAlvoDir = zAcompanhaBola;
            }
        }

        const minZDef = -(CAMPO_COMP / 2 - 1.5);
        if (zAlvoDir < minZDef) zAlvoDir = minZDef;

        zTarget = zAlvoDir * bb.dir;
    }`;

const newBlock = `    if (bb.isAttacking) {
        const bolaZDir = (typeof bb.bolaZSuave === 'number' ? bb.bolaZSuave : (bb.ballZ || 0)) * bb.dir;
        let zAlvoDir = zTarget * bb.dir;
        
        let distFrente = 5;
        let distTras = 5;

        // Regras de afastamento da linha da bola:
        // "se afastando mais somente quando acreditam que vão receber um lançamento em profundidade..."
        let emProfundidade = bb.isCounter || role === 'atk' || pos === 'LW' || pos === 'RW' || pos === 'LWB' || pos === 'RWB';
        if (emProfundidade) {
            distFrente = 20; // Atacantes podem esticar o jogo na frente
        }
        
        // Defesas e trincos costumam ficar atrás da linha da bola para dar cobertura
        if (role === 'def' || pos === 'DM') {
            distTras = 15;
            distFrente = 0; // Defesa central e trinco não devem passar à frente da bola 
            
            // Mas laterais podem subir no corredor se forem ofensivos
            if (pos === 'LB' || pos === 'RB' || pos === 'LWB' || pos === 'RWB') {
                distFrente = 10;
            }
        }
        
        // "...ou que tem que recuar para abrir linhas de passe para um jogador a frente com progresso bloqueado."
        let portadorBloqueado = false;
        if (bb.ballCarrier && bb.ballCarrier.team === p.team) {
            const oppCarrier = bb.oppCarrier; // adversário mais próximo do portador
            if (oppCarrier && bb.ballCarrier.model.position.distanceTo(oppCarrier.model.position) < 4.0) {
                portadorBloqueado = true;
            }
        }
        
        if (portadorBloqueado) {
            distTras = 12; // Permite que venham mais atrás oferecer apoio
            distFrente = Math.min(distFrente, 3); // Reduz a distância na frente para forçá-los a aproximar para passe curto
        }

        // 1. Limita o avanço: não deixa os jogadores fugirem muito para a frente da bola
        if (zAlvoDir > bolaZDir + distFrente) {
            zAlvoDir = bolaZDir + distFrente;
        }
        
        // 2. Limita o recuo: não deixa os jogadores ficarem muito atrás da bola (garante o acompanhamento do time)
        if (zAlvoDir < bolaZDir - distTras) {
            zAlvoDir = bolaZDir - distTras;
        }
        
        // Mantém a regra de segurança antiga para a defesa na saída de jogo (teto para não bater nos médios)
        if (role === 'def') {
            const limiteCirculo = (typeof TeamShape !== 'undefined' && typeof TeamShape.limiteSaidaCirculoCentral === 'number')
                ? TeamShape.limiteSaidaCirculoCentral : 0.0;
            const zMidDir = bloco.z0 + 0.45 * (bloco.z1 - bloco.z0);
            const zDefTeto = zMidDir - 3.5;
            
            const distAtrasAntiga = 3.0;
            const zLatAcompanha = Math.min(bolaZDir - distAtrasAntiga, limiteCirculo, zDefTeto + 1.5);
            const zCBAcompanha = Math.min(bolaZDir - distAtrasAntiga, limiteCirculo, zDefTeto);
            
            // Se o clamp os tiver puxado muito para a frente, o teto corrige
            if (pos === 'CB' && zAlvoDir > zCBAcompanha) {
                zAlvoDir = zCBAcompanha;
            } else if ((pos === 'LB' || pos === 'RB') && zAlvoDir > zLatAcompanha) {
                zAlvoDir = zLatAcompanha;
            }
        }
        
        const minZDef = -(CAMPO_COMP / 2 - 1.5);
        if (zAlvoDir < minZDef) zAlvoDir = minZDef;

        zTarget = zAlvoDir * bb.dir;
    }`;

if (code.includes(oldBlock)) {
    code = code.replace(oldBlock, newBlock);
    fs.writeFileSync('js/bt/team_bt.js', code);
    console.log("Success");
} else {
    console.log("Could not find the block to replace.");
}
