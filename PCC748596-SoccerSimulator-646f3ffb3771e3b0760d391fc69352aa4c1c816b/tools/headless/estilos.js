/*
ONDE OS PLAYING STYLES REALMENTE ESTÃO — posição medida por estilo.

Uso: node tools/headless/estilos.js [segundos]
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

const dados = {};
const registar = (p, atacando) => {
    const est = p.playingStyle;
    if (!est || p.playingStyleDesligado) return;
    const chave = est + (atacando ? ' (a atacar)' : ' (sem bola)');
    if (!dados[chave]) dados[chave] = { distArea: [], distBola: [], absX: [], zAtk: [] };
    const d = dados[chave];

    // Distância à linha da grande área da baliza atacada, medida para dentro.
    const linhaArea = (CAMPO_COMP / 2 - 16.5) * p.dirZ;
    d.distArea.push((linhaArea - p.model.position.z) * p.dirZ);
    d.distBola.push(p.model.position.distanceTo(Match.ball.position));
    d.absX.push(Math.abs(p.model.position.x));
    d.zAtk.push(p.model.position.z * p.dirZ);
};

for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    if (i % 6) continue;
    for (const eq of [['TeamA', Match.players], ['TeamB', Match.opponents]]) {
        const bb = (typeof TeamAI !== 'undefined') ? TeamAI.get(eq[0]) : null;
        const atacando = !!(bb && bb.isAttacking);
        for (const p of eq[1]) registar(p, atacando);
    }
}

const mediana = (xs) => {
    const o = xs.slice().sort((a, b) => a - b);
    return o.length ? o[Math.floor(o.length / 2)] : NaN;
};
const p90 = (xs) => {
    const o = xs.slice().sort((a, b) => a - b);
    return o.length ? o[Math.floor(o.length * 0.9)] : NaN;
};

console.log('');
console.log('POSIÇÃO POR PLAYING STYLE (amostras a 10 Hz)');
console.log('  distArea = metros ATRÁS da linha da grande área que ataca (negativo = já dentro)');
console.log('');
console.log('  estilo                              n   distArea(med)  distArea(p90)   |x|   distBola');
for (const k of Object.keys(dados).sort()) {
    const d = dados[k];
    console.log(`  ${k.padEnd(34)} ${String(d.distArea.length).padStart(5)}  ` +
        `${mediana(d.distArea).toFixed(1).padStart(11)}m  ${p90(d.distArea).toFixed(1).padStart(11)}m  ` +
        `${mediana(d.absX).toFixed(1).padStart(5)}m  ${mediana(d.distBola).toFixed(1).padStart(7)}m`);
}
