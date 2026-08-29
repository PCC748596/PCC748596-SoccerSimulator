/*
QUEM VIBRA NO LUGAR.

Um jogador "parado" que na verdade inverte o sentido do movimento todos os
frames lê-se como vibração. Mede-se por INVERSÕES DE SENTIDO por segundo em
quem está praticamente quieto (deslocação líquida pequena numa janela).

Uso: node tools/headless/vibracao.js [segundos]
*/
require('./harness.js');

const segundos = Number(process.argv[2] || 300);
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const est = new Map();
const porEstado = {};
const porPos = {};
let piores = [];

for (const p of Match.players.concat(Match.opponents)) {
    est.set(p, { vAnt: null, inversoes: 0, janela: [], frames: 0 });
}

for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);

    for (const p of Match.players.concat(Match.opponents)) {
        if (p.role === 'gk') continue;
        const e = est.get(p);
        const v = { x: p.velocity.x, z: p.velocity.z };
        const pos = { x: p.model.position.x, z: p.model.position.z };

        e.janela.push(pos);
        if (e.janela.length > 30) e.janela.shift();   // meio segundo

        if (e.vAnt) {
            /*
            INVERSÃO: o produto escalar entre a velocidade deste frame e a do
            anterior é negativo, ou seja mudou de sentido. Só conta acima de um
            mínimo de velocidade — abaixo disso é ruído numérico e não se vê.
            */
            const dot = v.x * e.vAnt.x + v.z * e.vAnt.z;
            const s0 = Math.hypot(e.vAnt.x, e.vAnt.z);
            const s1 = Math.hypot(v.x, v.z);
            if (dot < 0 && s0 > 0.25 && s1 > 0.25) {
                // ...e só se ele estiver praticamente no mesmo sítio: quem
                // inverte a correr está a mudar de direcção, não a vibrar.
                if (e.janela.length >= 30) {
                    const a = e.janela[0], b = e.janela[e.janela.length - 1];
                    const liquido = Math.hypot(b.x - a.x, b.z - a.z);
                    if (liquido < 1.0) {
                        e.inversoes++;
                        const chave = p.fsm.currentState;
                        porEstado[chave] = (porEstado[chave] || 0) + 1;
                        porPos[p.pos] = (porPos[p.pos] || 0) + 1;
                        if (piores.length < 8) {
                            piores.push(`${p.team} ${p.pos} ${chave} v=(${v.x.toFixed(2)},${v.z.toFixed(2)}) ` +
                                `antes=(${e.vAnt.x.toFixed(2)},${e.vAnt.z.toFixed(2)}) ` +
                                `liquido=${liquido.toFixed(2)} m em 0.5 s ` +
                                `alvo=(${p.dynamicTarget.x.toFixed(2)},${p.dynamicTarget.z.toFixed(2)}) ` +
                                `dist=${Math.hypot(p.dynamicTarget.x - pos.x, p.dynamicTarget.z - pos.z).toFixed(2)} ` +
                                `recv=${Match.intendedReceiver === p}`);
                        }
                    }
                }
            }
        }
        e.vAnt = v;
        e.frames++;
    }
}

let total = 0, framesTotais = 0;
for (const [p, e] of est) { total += e.inversoes; framesTotais += e.frames; }
console.log(`inversões de sentido com o jogador quieto: ${total} em ${(framesTotais * dt).toFixed(0)} jogador-segundos`);
console.log(`ou seja ${(total / (framesTotais * dt) * 60).toFixed(2)} por jogador-minuto`);
console.log('por estado da FSM: ' + Object.entries(porEstado).sort((a, b) => b[1] - a[1])
    .slice(0, 8).map(([k, v]) => `${k}=${v}`).join(' '));
console.log('por posição: ' + Object.entries(porPos).sort((a, b) => b[1] - a[1])
    .slice(0, 8).map(([k, v]) => `${k}=${v}`).join(' '));
console.log('\namostras:');
piores.forEach(l => console.log('  ' + l));
