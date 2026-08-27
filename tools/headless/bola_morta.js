/*
BOLA PARADA EM JOGO — o episódio inteiro: quanto dura, a que distância o mais
próximo chega, e o que o trava.

Uso: node tools/headless/bola_morta.js [segundos]
*/
require('./harness.js');

const segundos = Number(process.argv[2] || 900);
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Tatics !== 'undefined' && Tatics.updateSkills) Tatics.updateSkills();
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const episodios = [];
let ep = null;

for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);

    const b = Match.ball.position;
    const morta = Match.state === 'PLAY' && !Match.ballCarrier &&
        Match.ballVel.lengthSq() < 1.0;

    if (!morta) {
        if (ep && ep.t > 1.0) episodios.push(ep);
        ep = null;
        continue;
    }

    if (!ep) {
        ep = {
            t: 0, distMin: 999, distLinha: CAMPO_LARG / 2 - Math.abs(b.x),
            estados: {}, touchLockMax: 0, reachs: 0
        };
    }
    ep.t += dt;

    let melhor = null, dMin = 999;
    for (const p of Match.players.concat(Match.opponents)) {
        if (p.role === 'gk') continue;
        const d = p.model.position.distanceTo(b);
        if (d < dMin) { dMin = d; melhor = p; }
    }
    if (dMin < ep.distMin) ep.distMin = dMin;
    if (melhor) {
        const e = melhor.fsm ? melhor.fsm.currentState : '?';
        ep.estados[e] = (ep.estados[e] || 0) + 1;
        ep.touchLockMax = Math.max(ep.touchLockMax, melhor.touchLock || 0);
        if (dMin < BallControl.reach) ep.reachs++;
        ep.ultimo = {
            dist: dMin, estado: e, touchLock: melhor.touchLock || 0,
            vel: Math.hypot(melhor.velocity.x, melhor.velocity.z),
            intended: Match.intendedReceiver === melhor,
            chaser: (Match.chaserA === melhor || Match.chaserB === melhor)
        };
    }
}
if (ep && ep.t > 1.0) episodios.push(ep);

const mediana = (xs) => {
    const o = xs.slice().sort((a, b) => a - b);
    return o.length ? o[Math.floor(o.length / 2)] : NaN;
};

console.log('');
console.log(`BOLA PARADA EM JOGO, >1 s: ${episodios.length} episódios em ${segundos}s`);
if (!episodios.length) process.exit(0);

const longos = episodios.filter(e => e.t > 3);
console.log(`  duração mediana ${mediana(episodios.map(e => e.t)).toFixed(1)}s, ` +
    `máxima ${Math.max(...episodios.map(e => e.t)).toFixed(1)}s, ` +
    `acima de 3 s: ${longos.length}`);
console.log(`  distância MÍNIMA a que o mais próximo chegou: ` +
    `mediana ${mediana(episodios.map(e => e.distMin)).toFixed(2)} m` +
    `  (reach do controlo: ${BallControl.reach} m)`);
console.log(`  episódios em que alguém chegou ao alcance: ` +
    `${episodios.filter(e => e.reachs > 0).length} de ${episodios.length}`);
console.log(`  perto da linha lateral (<6 m): ${episodios.filter(e => e.distLinha < 6).length}`);

console.log('');
console.log('OS 6 MAIS LONGOS');
episodios.sort((a, b) => b.t - a.t).slice(0, 6).forEach(e => {
    const u = e.ultimo || {};
    console.log(`  ${e.t.toFixed(1)}s  distMin ${e.distMin.toFixed(2)}m  ` +
        `linha ${e.distLinha.toFixed(1)}m  |  no fim: ${(u.estado || '?').padEnd(14)} ` +
        `dist ${(u.dist || 0).toFixed(2)}m  vel ${(u.vel || 0).toFixed(2)}  ` +
        `touchLock ${(u.touchLock || 0).toFixed(2)}  ` +
        `${u.chaser ? 'chaser' : ''} ${u.intended ? 'destinatario' : ''}`);
});
