/*
JOGADAS COMBINADAS — quantas saem, e o que dá cada uma.

Uso: node tools/headless/jogadas.js [segundos]
*/
require('./harness.js');

const segundos = Number(process.argv[2] || 600);
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Tatics !== 'undefined' && Tatics.updateSkills) Tatics.updateSkills();
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

let overlapsAtivos = 0, frames = 0;
for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    if (i % 6) continue;
    frames++;
    for (const p of Match.players.concat(Match.opponents)) {
        if (p.overlapTimer > 0) overlapsAtivos++;
    }
}

const A = MatchStats.TeamA, B = MatchStats.TeamB;
console.log('');
console.log(`JOGADAS COMBINADAS — ${segundos}s simulados`);
console.log('                      TeamA   TeamB');
console.log(`  cara a cara         ${String(A.caraACara).padStart(5)}   ${String(B.caraACara).padStart(5)}`);
console.log(`  tabelinhas          ${String(A.tabelinhas).padStart(5)}   ${String(B.tabelinhas).padStart(5)}`);
console.log(`  passes p/ overlap   ${String(A.overlaps).padStart(5)}   ${String(B.overlaps).padStart(5)}`);
console.log('');
console.log(`  jogadores em overlap: ${(overlapsAtivos / Math.max(1, frames)).toFixed(2)} por frame (média)`);
console.log('');
console.log(`  remates             ${String(A.remates.tentados).padStart(5)}   ${String(B.remates.tentados).padStart(5)}`);
console.log(`  no alvo             ${String(A.remates.noAlvo).padStart(5)}   ${String(B.remates.noAlvo).padStart(5)}`);
console.log(`  golos               ${String(A.remates.golos).padStart(5)}   ${String(B.remates.golos).padStart(5)}`);
console.log(`  passes certos       ${String(A.passes.certos).padStart(5)}   ${String(B.passes.certos).padStart(5)}`);
console.log(`  passes tentados     ${String(A.passes.tentados).padStart(5)}   ${String(B.passes.tentados).padStart(5)}`);
