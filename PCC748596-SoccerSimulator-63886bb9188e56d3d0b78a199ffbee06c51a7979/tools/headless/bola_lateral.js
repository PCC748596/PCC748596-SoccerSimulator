/*
BOLA PARADA PERTO DA LINHA LATERAL E NINGUÉM A VAI BUSCAR.

Detecta a situação e diz PORQUÊ: quem estava mais perto, em que estado, se era
o chaser da equipa, e para onde é que ele estava a ir.

Uso: node tools/headless/bola_lateral.js [segundos]
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

const meiaLarg = CAMPO_LARG / 2;
let paradaHa = 0;
const casos = [];

for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);

    const b = Match.ball.position;
    const perto = meiaLarg - Math.abs(b.x);
    const parada = Match.ballVel.lengthSq() < 1.0 && !Match.ballCarrier &&
        Match.state === 'PLAY';

    if (!parada) { paradaHa = 0; continue; }
    paradaHa += dt;
    if (paradaHa < 2.5) continue;
    paradaHa = 0;   // um caso por episódio

    // Quem está mais perto, e o que está a fazer.
    let melhor = null, dMin = 999;
    for (const p of Match.players.concat(Match.opponents)) {
        if (p.role === 'gk') continue;
        const d = p.model.position.distanceTo(b);
        if (d < dMin) { dMin = d; melhor = p; }
    }
    if (!melhor) continue;

    casos.push({
        distBolaALinha: perto,
        distJogador: dMin,
        estado: melhor.fsm ? melhor.fsm.currentState : '?',
        velocidade: Math.hypot(melhor.velocity.x, melhor.velocity.z),
        ehChaser: (Match.chaserA === melhor || Match.chaserB === melhor),
        alvoX: melhor.dynamicTarget ? melhor.dynamicTarget.x : null,
        alvoDist: melhor.dynamicTarget
            ? Math.hypot(melhor.dynamicTarget.x - b.x, melhor.dynamicTarget.z - b.z) : null,
        equipaPosse: Match.possessionTeam,
        estadoJogo: Match.state,
        intended: !!Match.intendedReceiver
    });
}

const mediana = (xs) => {
    const o = xs.filter(x => x !== null && x !== undefined).sort((a, b) => a - b);
    return o.length ? o[Math.floor(o.length / 2)] : NaN;
};

console.log('');
console.log(`BOLA PARADA EM JOGO (PLAY), sem dono, >2.5 s: ${casos.length} episódios em ${segundos}s`);
const contaEstadoJogo = {};
for (const c of casos) contaEstadoJogo[c.estadoJogo] = (contaEstadoJogo[c.estadoJogo] || 0) + 1;
console.log('  estado do JOGO:', JSON.stringify(contaEstadoJogo));
const perto6 = casos.filter(c => c.distBolaALinha < 6);
console.log(`  desses, com a bola a menos de 6 m da linha lateral: ${perto6.length}`);
if (!casos.length) { console.log('  (nenhum)'); process.exit(0); }

console.log('');
console.log(`  distância da bola à linha:        ${mediana(casos.map(c => c.distBolaALinha)).toFixed(1)} m`);
console.log(`  distância do jogador à bola:      ${mediana(casos.map(c => c.distJogador)).toFixed(1)} m`);
console.log(`  velocidade dele:                  ${mediana(casos.map(c => c.velocidade)).toFixed(2)} m/s`);
console.log(`  distância do ALVO dele à bola:    ${mediana(casos.map(c => c.alvoDist)).toFixed(1)} m`);
console.log(`  era o chaser da equipa:           ${(100 * casos.filter(c => c.ehChaser).length / casos.length).toFixed(0)}%`);
console.log(`  havia intendedReceiver:           ${(100 * casos.filter(c => c.intended).length / casos.length).toFixed(0)}%`);

const conta = {};
for (const c of casos) conta[c.estado] = (conta[c.estado] || 0) + 1;
console.log('');
console.log('  estado do mais próximo:');
Object.entries(conta).sort((a, b) => b[1] - a[1]).forEach(([e, n]) =>
    console.log(`    ${e.padEnd(18)} ${n}`));
