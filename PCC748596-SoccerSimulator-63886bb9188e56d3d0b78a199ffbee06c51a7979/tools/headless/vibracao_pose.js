/*
A VIBRAÇÃO, medida no ESQUELETO e não na posição: quanto é que a coxa salta de
um frame para o outro num jogador que está praticamente quieto.

O `animateBones` troca de ramo aos 0.1 m/s — abaixo escreve a pose neutra com
lerp, acima escreve a passada inteira com `set` directo. Se a amplitude da
passada não decair com a velocidade, atravessar esse limiar salta entre uma
passada completa e estar de pé, e é isso que se vê como vibração.

O headless não chama o `animateBones` (é animação), por isso chama-se aqui à
mão — é o mesmo que o browser faz todos os frames.

Uso: node tools/headless/vibracao_pose.js [segundos]
*/
require('./harness.js');

const segundos = Number(process.argv[2] || 180);
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const est = new Map();
const amostras = [];
for (const p of Match.players.concat(Match.opponents)) {
    est.set(p, { ant: null, velAnt: null, jan: [], saltos: [] });
}

for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);

    for (const p of Match.players.concat(Match.opponents)) {
        if (p.role === 'gk' || !p.rig) continue;
        try { p.animateBones(dt); } catch (e) { continue; }

        const e = est.get(p);
        e.jan.push({ x: p.model.position.x, z: p.model.position.z });
        if (e.jan.length > 60) e.jan.shift();

        const coxa = p.rig.lLeg.rotation.x;
        const vel = Math.hypot(p.velocity.x, p.velocity.z);
        /*
        QUIETO A SÉRIO: lento neste frame E no anterior. A janela de um metro
        por segundo deixava passar quem anda devagar em círculo, e aí a passada
        muda muito de frame para frame com toda a razão.
        */
        if (e.ant !== null && e.velAnt !== null && vel < 0.6 && e.velAnt < 0.6) {
            const salto = Math.abs(coxa - e.ant);
            e.saltos.push(salto);
            if (salto * 180 / Math.PI > 5 && amostras.length < 6) {
                amostras.push(`${p.team} ${p.pos} ${p.fsm.currentState}: coxa ` +
                    `${(e.ant * 180 / Math.PI).toFixed(1)} -> ${(coxa * 180 / Math.PI).toFixed(1)} graus ` +
                    `| v ${e.velAnt.toFixed(3)} -> ${vel.toFixed(3)} m/s`);
            }
        }
        e.ant = coxa;
        e.velAnt = vel;
    }
}

let todos = [];
for (const [p, e] of est) todos = todos.concat(e.saltos);
todos.sort((a, b) => a - b);

const grau = r => (r * 180 / Math.PI);
const pct = q => todos.length ? grau(todos[Math.floor(todos.length * q)]) : 0;
const acimaDe = g => todos.filter(v => grau(v) > g).length;

console.log(`amostras (jogador quase parado): ${todos.length}`);
console.log(`salto da coxa entre frames, em graus:`);
console.log(`  mediana ${pct(0.5).toFixed(3)}  p95 ${pct(0.95).toFixed(3)}  ` +
    `p99 ${pct(0.99).toFixed(3)}  máximo ${grau(todos[todos.length - 1] || 0).toFixed(3)}`);
console.log(`frames com salto acima de 2 graus: ${acimaDe(2)} ` +
    `(${(100 * acimaDe(2) / Math.max(1, todos.length)).toFixed(2)}%)`);
console.log(`frames com salto acima de 5 graus: ${acimaDe(5)} ` +
    `(${(100 * acimaDe(5) / Math.max(1, todos.length)).toFixed(2)}%)`);
if (amostras.length) {
    console.log('');
    console.log('amostras:');
    amostras.forEach(a => console.log('  ' + a));
}
