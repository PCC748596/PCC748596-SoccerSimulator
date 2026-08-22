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
    assert.ok(r.ang <= 75, `corpo a ${r.ang} graus da direccao do movimento a ${r.vel} m/s`);
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
