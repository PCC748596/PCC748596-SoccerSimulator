/*
O DESTINATÁRIO CORRE PARA O PONTO, OU PARA O PASSADOR?

Hipótese a testar: nos passes para o espaço o companheiro vem primeiro AO
ENCONTRO da bola — vira-se para o passador e anda para trás — antes de arrancar
para o ponto. Se for verdade, mede-se assim:

  - ângulo entre a velocidade dele e a direcção dele -> ponto, no instante do
    passe (0° = já vai para lá, 180° = vai ao contrário);
  - o mesmo, meio segundo depois;
  - a distância dele ao ponto no instante do passe e 0.5 s depois: se cresce,
    ele afastou-se do sítio para onde a bola foi;
  - em que estado da FSM ele estava.

Uso: node tools/headless/receptor.js [segundos]
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
const abertas = [];

const anguloParaPonto = (p, alvo) => {
    const dx = alvo.x - p.model.position.x, dz = alvo.z - p.model.position.z;
    const d = Math.hypot(dx, dz);
    const v = Math.hypot(p.velocity.x, p.velocity.z);
    if (d < 0.01 || v < 0.3) return null;    // parado: não há direcção
    const cos = (p.velocity.x * dx + p.velocity.z * dz) / (d * v);
    return Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
};

const originalExec = global.executePassGameplay;
global.executePassGameplay = function (p) {
    const tipo = (p.isThroughBall && p.throughBallTarget) ? 'lancamento' : (p.passTipo || 'direct');
    const receptor = p.passTarget;
    originalExec(p);
    if (!receptor) return;

    const alvo = { x: p.passTargetPos.x, z: p.passTargetPos.z };
    const dist0 = Math.hypot(alvo.x - receptor.model.position.x, alvo.z - receptor.model.position.z);
    if (dist0 < 3.0) return;    // passe aos pés: não há ponto para onde correr

    abertas.push({
        tipo: tipo, receptor: receptor, passador: p, alvo: alvo,
        dist0: dist0,
        ang0: anguloParaPonto(receptor, alvo),
        // Ângulo entre a velocidade dele e a direcção para o PASSADOR.
        angPassador0: anguloParaPonto(receptor, {
            x: p.model.position.x, z: p.model.position.z
        }),
        estado0: receptor.fsm ? receptor.fsm.currentState : '?',
        t: 0
    });
};

for (let i = 0; i < passos; i++) {
    Match.update(dt);
    for (let k = abertas.length - 1; k >= 0; k--) {
        const a = abertas[k];
        a.t += dt;
        if (a.t >= 0.5) {
            const r = a.receptor;
            amostras.push({
                tipo: a.tipo,
                dist0: a.dist0,
                dist1: Math.hypot(a.alvo.x - r.model.position.x, a.alvo.z - r.model.position.z),
                ang0: a.ang0,
                ang1: anguloParaPonto(r, a.alvo),
                angPassador0: a.angPassador0,
                estado0: a.estado0,
                estado1: r.fsm ? r.fsm.currentState : '?'
            });
            abertas.splice(k, 1);
        }
    }
}

const mediana = (xs) => {
    const o = xs.filter(x => x !== null && !isNaN(x)).sort((a, b) => a - b);
    return o.length ? o[Math.floor(o.length / 2)] : NaN;
};
const pct = (xs, f) => (100 * xs.filter(f).length / Math.max(1, xs.length)).toFixed(0) + '%';

console.log('');
console.log(`DESTINATÁRIO vs PONTO DO PASSE — ${amostras.length} passes com alvo a >3 m dele`);
console.log('');
console.log('  tipo         n   ang0  ang0>90  afastou-se  distAntes  distDepois');
for (const t of ['direct', 'space', 'leading', 'lancamento']) {
    const g = amostras.filter(a => a.tipo === t);
    if (!g.length) continue;
    console.log(`  ${t.padEnd(11)} ${String(g.length).padStart(3)}  ` +
        `${mediana(g.map(a => a.ang0)).toFixed(0).padStart(4)}°  ` +
        `${pct(g, a => a.ang0 !== null && a.ang0 > 90).padStart(7)}  ` +
        `${pct(g, a => a.dist1 > a.dist0 + 0.2).padStart(10)}  ` +
        `${mediana(g.map(a => a.dist0)).toFixed(1).padStart(9)}m  ` +
        `${mediana(g.map(a => a.dist1)).toFixed(1).padStart(10)}m`);
}

console.log('');
console.log('  ang0 = ângulo entre a corrida dele e a direcção para o ponto, no instante do passe');
console.log('         (0° = já vai para lá; >90° = vai ao contrário)');
console.log('  afastou-se = ficou MAIS LONGE do ponto meio segundo depois');

console.log('');
console.log('ESTADO DA FSM do destinatário, no instante do passe');
const conta = {};
for (const a of amostras) conta[a.estado0] = (conta[a.estado0] || 0) + 1;
Object.entries(conta).sort((x, y) => y[1] - x[1]).forEach(([e, n]) =>
    console.log(`  ${e.padEnd(18)} ${String(n).padStart(3)}  ${(100 * n / amostras.length).toFixed(0)}%`));

console.log('');
console.log('E MEIO SEGUNDO DEPOIS');
const conta1 = {};
for (const a of amostras) conta1[a.estado1] = (conta1[a.estado1] || 0) + 1;
Object.entries(conta1).sort((x, y) => y[1] - x[1]).forEach(([e, n]) =>
    console.log(`  ${e.padEnd(18)} ${String(n).padStart(3)}  ${(100 * n / amostras.length).toFixed(0)}%`));
