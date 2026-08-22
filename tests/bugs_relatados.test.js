/*
Bugs reportados em jogo, cada um com a medição que o confirmou (ver
tools/diag_bugs.js) e o teste que o fecha.

  INTERCEPT na equipa COM posse   23% dos frames tinham alguém da equipa que
                                  acabou de passar em INTERCEPT — a correr
                                  para um ponto diferente do do destinatário
  Player_Pass_Points sem efeito   os pontos são limpos no topo de Match.update
                                  e escritos a meio do frame, pelo portador
  Corpo a 90 graus do movimento   2% dos frames acima de 90 graus, todos em
                                  estados que mandam olhar para a bola
  Extra Frontman sempre no ataque só deve subir em bola parada, ou a perder
                                  no fim do jogo
*/
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const { ctx } = require(path.join(raiz, 'tests', 'headless.js'));

vm.runInContext('if (!Match.players.length) { Match.init(new THREE.Scene()); for (let i=0;i<60;i++) Match.update(0.016); }', ctx);

function aval(expr) {
    return JSON.parse(vm.runInContext(`JSON.stringify((() => { ${expr} })())`, ctx));
}

test('quem acabou de passar nao poe um colega a intercetar o proprio passe', () => {
    const r = aval(`
        const bb = TeamAI.get('TeamA');
        bb.gather(Match);
        const alvo = Match.players.find(p => p.role !== 'gk');
        const antes = Match.ballCarrier, antesRec = Match.intendedReceiver;
        Match.ballCarrier = null;              // bola no ar
        Match.intendedReceiver = alvo;         // passe da TeamA em curso
        // Toda a gente da TeamA "consegue" intercetar, para o unico filtro
        // que interessa ser o da posse.
        for (const p of Match.players) {
            p.blackboard = p.blackboard || {};
            p.blackboard.ball = {
                interceptable: true, timeToIntercept: 0.2,
                interceptionPoint: { x: 0, y: 0, z: 0 }
            };
        }
        const estadoAntes = Match.state;
        Match.state = 'PLAY';
        pickIntercetor(bb);
        const escolhido = bb.intercetor ? bb.intercetor.pos : null;
        Match.ballCarrier = antes; Match.intendedReceiver = antesRec; Match.state = estadoAntes;
        return { escolhido };
    `);
    assert.strictEqual(r.escolhido, null,
        `a equipa que passou nao devia ter intercetor, escolheu o ${r.escolhido}`);
});

test('a equipa adversaria continua a poder intercetar o passe', () => {
    const r = aval(`
        const bb = TeamAI.get('TeamB');
        bb.gather(Match);
        const alvo = Match.players.find(p => p.role !== 'gk');
        const antes = Match.ballCarrier, antesRec = Match.intendedReceiver;
        const estadoAntes = Match.state;
        Match.ballCarrier = null;
        Match.intendedReceiver = alvo;         // passe da TeamA
        Match.state = 'PLAY';
        for (const p of Match.opponents) {
            p.blackboard = p.blackboard || {};
            p.blackboard.ball = {
                interceptable: true, timeToIntercept: 0.2,
                interceptionPoint: { x: 0, y: 0, z: 0 }
            };
        }
        bb.chaser = null;
        pickIntercetor(bb);
        const houve = !!bb.intercetor;
        Match.ballCarrier = antes; Match.intendedReceiver = antesRec; Match.state = estadoAntes;
        return { houve };
    `);
    assert.ok(r.houve, 'a equipa sem posse deixou de poder intercetar');
});

test('os pontos de passe sobrevivem ao frame de quem tem a posse', () => {
    const r = aval(`
        const antesPoss = Match.possessionTeam;
        Match.possessionTeam = 'TeamA';
        for (const p of Match.players) p.debugPoints = { Pass: 123 };
        for (const p of Match.opponents) p.debugPoints = { Pass: 456 };
        Match.limparPontosDeDebug();
        return {
            comPosse: Match.players.filter(p => p.debugPoints).length,
            semPosse: Match.opponents.filter(p => p.debugPoints).length,
            _restaurar: (Match.possessionTeam = antesPoss, 0)
        };
    `);
    assert.ok(r.comPosse > 0, 'os pontos da equipa com posse foram limpos — o label nunca os chega a ver');
    assert.strictEqual(r.semPosse, 0, 'os pontos da equipa sem posse deviam ser limpos');
});

test('o corpo nao corre a 90 graus da direccao do movimento', () => {
    const r = aval(`
        const p = Match.players.find(j => j.role !== 'gk');
        const estadoAntes = p.fsm.currentState;
        p.fsm.currentState = 'SUPPORT_PASS';
        p.model.position.set(0, 0, 0);
        p.model.quaternion.identity();
        Match.ball.position.set(0, 0, -25);      // bola atras dele
        const alvo = new THREE.Vector3(0, 0, 25); // e ele a correr para a frente
        // Varios frames, para a rotacao assentar.
        for (let i = 0; i < 120; i++) p.steerArrive(alvo, 7.0);
        const f = new THREE.Vector3(0, 0, 1).applyQuaternion(p.model.quaternion);
        const v = p.velocity;
        const vel = Math.hypot(v.x, v.z);
        const cos = (f.x * v.x + f.z * v.z) / (vel * (Math.hypot(f.x, f.z) || 1));
        const ang = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
        p.fsm.currentState = estadoAntes;
        return { ang: Math.round(ang), vel: Math.round(vel * 10) / 10 };
    `);
    assert.ok(r.vel > 1.5, `o teste nao chegou a por o jogador a correr (${r.vel} m/s)`);
    // A correr, o tecto e o SteeringModel.desvioMaxCorrida (22 graus) mais a
    // folga do slerp que ainda esta a apanhar o alvo.
    assert.ok(r.ang <= 30, `corpo a ${r.ang} graus da direccao do movimento a ${r.vel} m/s`);
});

test('a andar, ainda pode virar-se todo para a bola', () => {
    const r = aval(`
        const p = Match.players.find(j => j.role !== 'gk');
        const estadoAntes = p.fsm.currentState;
        p.fsm.currentState = 'MARKING';
        p.model.position.set(0, 0, 0);
        p.model.quaternion.identity();
        p.velocity.set(0, 0, 0);
        Match.ball.position.set(25, 0, 0);        // bola de lado
        const alvo = new THREE.Vector3(0.4, 0, 0.4);  // passinho curto: fica lento
        for (let i = 0; i < 90; i++) p.steerArrive(alvo, 1.2);
        const f = new THREE.Vector3(0, 0, 1).applyQuaternion(p.model.quaternion);
        const paraBola = Math.atan2(25 - p.model.position.x, 0 - p.model.position.z);
        const frente = Math.atan2(f.x, f.z);
        let d = Math.abs(paraBola - frente);
        if (d > Math.PI) d = 2 * Math.PI - d;
        p.fsm.currentState = estadoAntes;
        return { desvioParaBola: Math.round(d * 180 / Math.PI) };
    `);
    assert.ok(r.desvioParaBola <= 25,
        `a marcar devagar devia estar virado para a bola, esta a ${r.desvioParaBola} graus dela`);
});

test('o chutao do guarda-redes sai entre 25 e 35 graus', () => {
    const r = aval(`
        const gk = Match.players.find(j => j.role === 'gk');
        const angs = [];
        for (let i = 0; i < 200; i++) {
            gk.hasBall = true;
            gk.puntBall();
            const horiz = Math.hypot(Match.ballVel.x, Match.ballVel.z);
            angs.push(Math.atan2(Match.ballVel.y, horiz) * 180 / Math.PI);
        }
        return { min: Math.min(...angs), max: Math.max(...angs) };
    `);
    assert.ok(r.min >= 24.5, `saiu a ${r.min.toFixed(1)} graus, abaixo dos 25 pedidos`);
    assert.ok(r.max <= 35.5, `saiu a ${r.max.toFixed(1)} graus, acima dos 35 pedidos`);
});

test('Extra Frontman: nao sobe num ataque normal', () => {
    const r = aval(`
        const p = Match.players.find(j => j.pos === 'CB') || Match.players[2];
        const bb = TeamAI.get(p.team);
        const s = { atacando: true, ultimoTerco: true };
        const antesTaker = Match.setPieceTaker, antesTempo = Match.tempoDeJogo;
        Match.setPieceTaker = null;
        Match.tempoDeJogo = 600;                  // 10 minutos de jogo
        Match.placarA = 0; Match.placarB = 0;
        const r1 = !!PlayingStyleTriggers.extra_frontman(p, bb, s);
        Match.setPieceTaker = antesTaker; Match.tempoDeJogo = antesTempo;
        return { subiu: r1 };
    `);
    assert.strictEqual(r.subiu, false, 'subiu ao ataque num ataque normal');
});

test('Extra Frontman: sobe na bola parada da equipa dele e a perder no fim', () => {
    const r = aval(`
        const p = Match.players.find(j => j.pos === 'CB') || Match.players[2];
        const bb = TeamAI.get(p.team);
        const s = { atacando: true, ultimoTerco: true };
        const antesTaker = Match.setPieceTaker, antesTeam = Match.setPieceTeam;
        const antesTempo = Match.tempoDeJogo, pa = Match.placarA, pb = Match.placarB;

        // 1) bola parada da equipa dele
        Match.setPieceTaker = p; Match.setPieceTeam = p.team;
        Match.tempoDeJogo = 600; Match.placarA = 0; Match.placarB = 0;
        const bolaParada = !!PlayingStyleTriggers.extra_frontman(p, bb, s);

        // 2) a perder, no fim do jogo
        Match.setPieceTaker = null; Match.setPieceTeam = null;
        Match.tempoDeJogo = 80 * 60;
        Match.placarA = 0; Match.placarB = 1;      // TeamA a perder
        const aPerderNoFim = !!PlayingStyleTriggers.extra_frontman(p, bb, s);

        Match.setPieceTaker = antesTaker; Match.setPieceTeam = antesTeam;
        Match.tempoDeJogo = antesTempo; Match.placarA = pa; Match.placarB = pb;
        return { bolaParada, aPerderNoFim };
    `);
    assert.ok(r.bolaParada, 'nao subiu na bola parada da equipa dele');
    assert.ok(r.aPerderNoFim, 'nao subiu a perder no fim do jogo');
});

/*
"A linha de passe aparece mas o passe sai noutra direccao."

A direccao estava certa (medido: mediana 2.3 graus entre a linha e a saida da
bola). O que estava errado era a LINHA: os botoes Team BT POS e PlayingStyleBT
punham `passLineVisual.visible = true` sem redesenhar nada, e o que aparecia
era a linha do ultimo passe desenhado — ancorada num jogador e num alvo ja
velhos, sem relacao com passe nenhum a acontecer.
*/
test('o toggle do painel nao mostra a linha de um passe que ja acabou', () => {
    const r = aval(`
        const antes = window.teamBTPosState;
        Match.passVisualAtivo = false;          // nenhum passe em curso
        window.teamBTPosState = 'TeamA';        // e o painel ligado
        Match.atualizarVisuaisDePasse();
        const visivelSemPasse = Match.passLineVisual.visible;

        Match.passVisualAtivo = true;           // agora com passe
        Match.atualizarVisuaisDePasse();
        const visivelComPasse = Match.passLineVisual.visible;

        window.teamBTPosState = 'OFF';
        Match.atualizarVisuaisDePasse();
        const visivelPainelDesligado = Match.passLineVisual.visible;

        window.teamBTPosState = antes;
        Match.passVisualAtivo = false;
        Match.atualizarVisuaisDePasse();
        return { visivelSemPasse, visivelComPasse, visivelPainelDesligado };
    `);
    assert.strictEqual(r.visivelSemPasse, false,
        'o painel ligado mostrou a linha sem haver passe nenhum');
    assert.strictEqual(r.visivelComPasse, true, 'com passe em curso a linha devia aparecer');
    assert.strictEqual(r.visivelPainelDesligado, false, 'painel desligado devia esconder a linha');
});

test('a linha do passe parte de onde a bola esta, nao do jogador', () => {
    const r = aval(`
        Match.ball.position.set(7, 0, -3);
        Match.desenharLinhaDePasse(20, 15);
        const a = Match.passLineVisual.geometry.attributes.position;
        return {
            origem: { x: Math.round(a.getX(0) * 100) / 100, z: Math.round(a.getZ(0) * 100) / 100 },
            fim: { x: Math.round(a.getX(1) * 100) / 100, z: Math.round(a.getZ(1) * 100) / 100 }
        };
    `);
    assert.deepStrictEqual(r.origem, { x: 7, z: -3 }, 'a linha nao parte da bola');
    assert.deepStrictEqual(r.fim, { x: 20, z: 15 }, 'a linha nao acaba no alvo pedido');
});

/*
TECTO DA VELOCIDADE ANGULAR.

A viragem era um slerp exponencial sem limite: `quaternion.slerp(alvo,
giro * dt)` fecha uma fraccao do angulo que falta, por isso a velocidade
angular e proporcional ao erro — 3240 graus/s no primeiro instante de uma
inversao de 180, ou 52 graus num unico frame.

O `passoDeGuinada` (utils.js) existia para isto com cinco testes a passar, e
nunca tinha sido chamado por ninguem — o mesmo padrao do bb.phase e do
findPassTargetInCone.
*/
test('o jogador nao roda mais depressa do que o tecto declarado', () => {
    const r = aval(`
        const p = Match.players.find(j => j.role !== 'gk');
        const estadoAntes = p.fsm.currentState;
        p.fsm.currentState = 'MOVE_TO_POS';
        p.model.position.set(0, 0, 0);
        p.model.quaternion.identity();          // virado para +Z
        p.velocity.set(0, 0, 0);
        Match.delta = 1 / 60;

        // Alvo exactamente atras: inversao de 180 graus.
        const alvo = new THREE.Vector3(0, 0, -20);
        const frente = () => {
            const f = new THREE.Vector3(0, 0, 1).applyQuaternion(p.model.quaternion);
            return Math.atan2(f.x, f.z);
        };

        let maiorPasso = 0;
        let anterior = frente();
        let frames = 0;
        for (let i = 0; i < 600; i++) {
            p.steerArrive(alvo, 6.0);
            const agora = frente();
            let d = Math.abs(Math.atan2(Math.sin(agora - anterior), Math.cos(agora - anterior)));
            if (d > maiorPasso) maiorPasso = d;
            anterior = agora;
            frames++;
            if (Math.abs(Math.atan2(Math.sin(agora - Math.PI), Math.cos(agora - Math.PI))) < 0.09) break;
        }
        p.fsm.currentState = estadoAntes;
        return {
            maiorPassoGraus: maiorPasso * 180 / Math.PI,
            tectoPorFrame: SteeringModel.giroMaxGrausPorSeg / 60,
            segundos: frames / 60
        };
    `);
    assert.ok(r.maiorPassoGraus <= r.tectoPorFrame + 0.05,
        `rodou ${r.maiorPassoGraus.toFixed(1)}° num frame, tecto é ${r.tectoPorFrame.toFixed(1)}°`);
    /*
    Meia volta tem de demorar o que o tecto manda — 180 graus a dividir pela
    velocidade maxima. Sai do valor configurado e nao de um numero a mao,
    senao mudar o tecto parte o teste em vez de o verificar.
    */
    const esperado = 180 / (r.tectoPorFrame * 60);
    assert.ok(r.segundos > esperado * 0.8 && r.segundos < esperado * 1.35,
        `meia volta demorou ${r.segundos.toFixed(2)} s, esperado ~${esperado.toFixed(2)} s`);
});
