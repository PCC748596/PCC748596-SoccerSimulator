/*
LABORATÓRIO DO GUARDA-REDES.

Dispara N remates de posições sorteadas dentro/à volta da área, com o pipeline
real (tipoDeRemate -> miraDeRemate -> sigma -> física -> GK), e conta o
desfecho. Isola a defesa do resto do jogo.

Uso: node lab_gk.js [remates]
*/
require('./tools/headless/harness.js');
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Tatics !== 'undefined' && Tatics.updateSkills) Tatics.updateSkills();
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const dt = 1 / 60;
const N = Number(process.argv[2] || 200);
const atacante = Match.players.find(p => p.pos === 'CF') || Match.players[10];
const gk = Match.opponents[0];
const golZ = atacante.targetGoalZ;

const bandas = {}, estadosGK = {};
let golos = 0, defesas = 0, fora = 0, madeira = 0, outros = 0, enquadrados = 0;
for (let n = 0; n < N; n++) {
    // Posição: dentro da área e na entrada dela.
    const x = (Math.random() * 2 - 1) * 14;
    const dist = 6 + Math.random() * 14;
    atacante.model.position.set(x, ALTURA_BASE_Y, golZ - Math.sign(golZ) * dist);
    atacante.velocity.set(0, 0, 0);
    atacante.hasBall = true;
    Match.ballCarrier = atacante;
    Match.ball.position.set(x, BallPhysics.raio, atacante.model.position.z);
    Match.ballVel.set(0, 0, 0);
    Match.state = 'PLAY';

    // GK na baliza, parado.
    gk.model.position.set(0, ALTURA_BASE_Y, golZ - Math.sign(golZ) * 0.4);
    gk.gkEstado = 'idle'; gk.dive = null; gk.gkReagiu = false; gk.isPenaltyDive = false;
    gk.hasBall = false;

    const antesGolos = MatchStats.TeamA.remates.golos;
    const antesDefesas = MatchStats.TeamB.defesas;
    const antesAlvo = MatchStats.TeamA.remates.noAlvo;

    atacante.initiateShoot();
    // Onde a bola vai cruzar a linha, e a que distancia lateral do GK.
    let cruzX = null;

    let estados = new Set();
    let resolvido = null;
    for (let f = 0; f < 180 && !resolvido; f++) {
        Match.update(dt);
        estados.add(gk.gkEstado);
        if (cruzX === null && Math.abs(Match.ball.position.z) >= Math.abs(golZ) - 0.6) {
            cruzX = Match.ball.position.x;
        }
        if (MatchStats.TeamA.remates.golos > antesGolos) resolvido = 'golo';
        else if (MatchStats.TeamB.defesas > antesDefesas) resolvido = 'defesa';
        else if (gk.hasBall) resolvido = 'defesa';
        else if (Match.state !== 'PLAY') resolvido = 'fora';
        else if (Math.abs(Match.ball.position.z) > Math.abs(golZ) + 1) resolvido = 'fora';
    }
    if (MatchStats.TeamA.remates.noAlvo > antesAlvo) enquadrados++;
    if (cruzX !== null && (resolvido === 'golo' || resolvido === 'defesa')) {
        const d = Math.abs(cruzX - 0);   // o GK arranca do meio da baliza
        const faixa = Math.min(3, Math.floor(d));
        bandas[faixa] = bandas[faixa] || { golo: 0, defesa: 0 };
        bandas[faixa][resolvido === 'golo' ? 'golo' : 'defesa']++;
    }
    for (const e of estados) estadosGK[e] = (estadosGK[e] || 0) + 1;
    if (resolvido === 'golo') golos++;
    else if (resolvido === 'defesa') defesas++;
    else if (resolvido === 'fora') fora++;
    else outros++;

    // Repõe o jogo para o remate seguinte.
    Match.state = 'PLAY';
    gk.hasBall = false; Match.ballCarrier = null;
}
const pc = (a, b) => (100 * a / Math.max(1, b)).toFixed(1) + '%';
console.log('remates', N, '| enquadrados (contador do jogo)', enquadrados, pc(enquadrados, N));
console.log('  golos ', golos, pc(golos, N));
console.log('  defesas', defesas, pc(defesas, N));
console.log('  fora  ', fora, pc(fora, N));
console.log('  por resolver', outros);
console.log('estados do GK durante os remates:', JSON.stringify(estadosGK));
console.log('por distancia lateral ao GK (m):');
for (const k of Object.keys(bandas).sort()) {
    const b = bandas[k];
    console.log('  ' + k + '-' + (Number(k) + 1) + ' m: golos ' + b.golo + '  defesas ' + b.defesa +
        '   -> defendidos ' + (100 * b.defesa / (b.golo + b.defesa)).toFixed(0) + '%');
}
console.log('GOLOS POR ENQUADRADO', pc(golos, golos + defesas), ' (real ~32%)');
