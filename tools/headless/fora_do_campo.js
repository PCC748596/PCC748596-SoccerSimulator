/*
QUEM SAI DO CAMPO, e em que estado de equipa.

Uso: node tools/headless/fora_do_campo.js [segundos]
*/
require('./harness.js');

const segundos = Number(process.argv[2] || 600);
const dt = 1 / 60;

const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const LIM = CAMPO_LARG / 2;   // 34
const porEstado = {};
const piorAlvo = {};
let frames = 0;
const porFsm = {};
let foraComBolaFora = 0, foraJaNoTactico = 0;
const corpoPorEstado = {}, longePorEstado = {};
let amostraLonge = null;

for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    if (i % 3) continue;
    frames++;
    for (const [eq, lista] of [['TeamA', Match.players], ['TeamB', Match.opponents]]) {
        const bb = (typeof TeamAI !== 'undefined') ? TeamAI.get(eq) : null;
        if (!bb) continue;
        const est = bb.state || '?';
        const r = porEstado[est] || (porEstado[est] = { n: 0, foraCorpo: 0, foraAlvo: 0, maxCorpo: 0, maxAlvo: 0, porPos: {} });
        for (const p of lista) {
            if (!p.model) continue;
            r.n++;
            const ax = Math.abs(p.model.position.x);
            const tx = p.dynamicTarget ? Math.abs(p.dynamicTarget.x) : 0;
            if (ax > LIM) {
                r.foraCorpo++;
                const ch = `${Match.state}/${p.fsm ? p.fsm.currentState : '?'}`;
                corpoPorEstado[ch] = (corpoPorEstado[ch] || 0) + 1;
                if (ax > 36) {
                    const ch2 = `${Match.state}/${p.fsm ? p.fsm.currentState : '?'}`;
                    longePorEstado[ch2] = (longePorEstado[ch2] || 0) + 1;
                    if (!amostraLonge && ax > 45) {
                        amostraLonge = `${p.team} ${p.pos} x=${p.model.position.x.toFixed(1)} z=${p.model.position.z.toFixed(1)} alvo=(${p.dynamicTarget.x.toFixed(1)},${p.dynamicTarget.z.toFixed(1)}) v=(${p.velocity.x.toFixed(1)},${p.velocity.z.toFixed(1)}) Match=${Match.state} fsm=${p.fsm.currentState}`;
                    }
                }
                r.porPos[p.pos] = (r.porPos[p.pos] || 0) + 1;
                if (ax > r.maxCorpo) r.maxCorpo = ax;
                if (ax > (piorAlvo.corpo || 0)) piorAlvo.corpo = ax;
            }
            if (tx > LIM - 0.001) {
                r.foraAlvo++;
                if (tx > r.maxAlvo) r.maxAlvo = tx;
                const chave = p.fsm ? p.fsm.currentState : '?';
                porFsm[chave] = (porFsm[chave] || 0) + 1;
                const bx = Math.abs(Match.ball.position.x);
                if (bx > LIM) foraComBolaFora++;
                // O alvo táctico (antes das folhas da árvore) saiu do campo?
                const ttx = p.tacticalTarget ? Math.abs(p.tacticalTarget.x) : 0;
                if (ttx > LIM - 0.001) foraJaNoTactico++;
            }
        }
    }
}

console.log(`frames amostrados: ${frames}`);
console.log('alvos fora, por estado da FSM: ' + Object.entries(porFsm).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}=${v}`).join(' '));
console.log(`  destes, com a BOLA fora do campo: ${foraComBolaFora}`);
console.log(`  destes, ja fora no tacticalTarget (TeamBT): ${foraJaNoTactico}`);
console.log('CORPO fora, por Match.state/FSM: ' + Object.entries(corpoPorEstado).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([k,v])=>`${k}=${v}`).join(' '));
console.log('CORPO alem de 36 m: ' + Object.entries(longePorEstado).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([k,v])=>`${k}=${v}`).join(' '));
if (amostraLonge) console.log('amostra: ' + amostraLonge);
console.log('estado           amostras   corpo fora do campo      alvo na linha ou fora');
for (const est of Object.keys(porEstado).sort()) {
    const r = porEstado[est];
    const pc = (100 * r.foraCorpo / Math.max(1, r.n)).toFixed(2);
    const pa = (100 * r.foraAlvo / Math.max(1, r.n)).toFixed(2);
    console.log(`${est.padEnd(16)} ${String(r.n).padStart(7)}   ${pc.padStart(6)}%  max |x|=${r.maxCorpo.toFixed(2)}   ${pa.padStart(6)}%  max |x|=${r.maxAlvo.toFixed(2)}`);
    const pos = Object.entries(r.porPos).sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (pos.length) console.log('                 posições: ' + pos.map(([k, v]) => `${k}=${v}`).join(' '));
}
