/*
ELEVAÇÃO REAL DE SAÍDA de tudo o que sai do pé, medida na velocidade da bola
logo a seguir ao contacto: atan2(vy, |vh|).

Não confia em nenhuma constante do config — mede o que a bola faz.

Uso: node tools/headless/elevacoes.js [segundos]
*/
require('./harness.js');

const segundos = Number(process.argv[2] || 600);
const dt = 1 / 60;
const passos = Math.round(segundos / dt);

const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Tatics !== 'undefined' && Tatics.updateSkills) Tatics.updateSkills();
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const amostras = [];
const grau = (vy, vh) => Math.atan2(vy, vh) * 180 / Math.PI;

function registar(origem, extra) {
    const vh = Math.hypot(Match.ballVel.x, Match.ballVel.z);
    amostras.push(Object.assign({
        origem: origem,
        elev: grau(Match.ballVel.y, vh),
        v: Match.ballVel.length(),
        vy: Match.ballVel.y
    }, extra || {}));
}

const origExec = global.executePassGameplay;
global.executePassGameplay = function (p) {
    const lanc = !!(p.isThroughBall && p.throughBallTarget);
    const cruz = !!p.isCross;
    const tipo = p.passTipo || 'direct';
    const alvo = p.passTargetPos ? { x: p.passTargetPos.x, z: p.passTargetPos.z } : null;
    const bx = Match.ball.position.x, bz = Match.ball.position.z;
    origExec(p);
    registar(lanc ? 'lancamento' : (cruz ? 'cruzamento' : ('passe:' + tipo)), {
        dist: alvo ? Math.hypot(alvo.x - bx, alvo.z - bz) : null
    });
};

const origShot = global.executeShotGameplay;
if (origShot) {
    global.executeShotGameplay = function (p) { origShot(p); registar('remate'); };
}

for (const nome of ['puntBall', 'releaseFromHands']) {
    const orig = FootballPlayer.prototype[nome];
    if (!orig) continue;
    FootballPlayer.prototype[nome] = function (...args) {
        orig.apply(this, args);
        registar('gk:' + nome);
    };
}

for (let i = 0; i < passos; i++) Match.update(dt);

const mediana = (xs) => {
    const o = xs.slice().sort((a, b) => a - b);
    return o.length ? o[Math.floor(o.length / 2)] : NaN;
};
const p95 = (xs) => {
    const o = xs.slice().sort((a, b) => a - b);
    return o.length ? o[Math.min(o.length - 1, Math.floor(o.length * 0.95))] : NaN;
};

const origens = [...new Set(amostras.map(a => a.origem))].sort();
console.log('');
console.log(`ELEVAÇÃO DE SAÍDA — ${amostras.length} bolas batidas em ${segundos}s`);
console.log('');
console.log('  origem                n   mediana     p95     max   |  >35°   >45°  |  apexMediano  apexMax  distMax');
for (const o of origens) {
    const g = amostras.filter(a => a.origem === o);
    const es = g.map(a => a.elev);
    const acima = (lim) => (100 * es.filter(e => e > lim).length / es.length).toFixed(0) + '%';
    console.log(`  ${o.padEnd(18)} ${String(g.length).padStart(4)}  ` +
        `${mediana(es).toFixed(1).padStart(7)}°  ${p95(es).toFixed(1).padStart(6)}°  ` +
        `${Math.max(...es).toFixed(1).padStart(6)}°  |  ${acima(35).padStart(4)}  ${acima(45).padStart(5)}  |  ` +
        `${mediana(g.map(a => (a.vy * a.vy) / (2 * BallPhysics.gravidade))).toFixed(1).padStart(10)}m  ` +
        `${Math.max(...g.map(a => (a.vy * a.vy) / (2 * BallPhysics.gravidade))).toFixed(1).padStart(6)}m  ` +
        `${(g.some(a => a.dist) ? Math.max(...g.filter(a => a.dist).map(a => a.dist)).toFixed(0) : '-').padStart(6)}m`);
}

console.log('');
console.log('AS 10 BOLAS MAIS ALTAS (excluindo o guarda-redes)');
amostras.filter(a => !a.origem.startsWith('gk:'))
    .sort((a, b) => b.elev - a.elev).slice(0, 10)
    .forEach(a => console.log(`  ${a.origem.padEnd(18)} ${a.elev.toFixed(1).padStart(6)}°  ` +
        `v=${a.v.toFixed(1)}m/s  vy=${a.vy.toFixed(1)}  ` +
        `dist=${a.dist !== null && a.dist !== undefined ? a.dist.toFixed(1) + 'm' : '-'}`));
