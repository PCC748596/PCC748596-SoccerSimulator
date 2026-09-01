/*
AUDITORIA DA CAMADA POSICIONAL (o "nível 2") — ver docs/auditoria_nivel2.md.

Mede, com o jogo a correr sem ecrã:

  - quanto cada troço da cadeia mexe no alvo (slot -> estilo -> TeamBT -> final);
  - com que frequência o nível 3 reescreve o alvo posicional, e em que estado;
  - quantos alvos e quantos corpos ficam em fora-de-jogo, e quem os escreveu;
  - quantos pares de companheiros ficam com alvos em cima uns dos outros.

Uso:
    node tools/headless/nivel2_auditoria.js [segundos]
    node tools/headless/nivel2_auditoria.js foradejogo [segundos]
*/
require('./harness.js');

const modo = process.argv[2] === 'foradejogo' ? 'foradejogo' : 'tudo';
const segundos = Number((modo === 'tudo' ? process.argv[2] : process.argv[3]) || 300);
const dt = 1 / 60;
Match.init(new THREE.Scene());
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(new THREE.Scene());
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const desvio = { estilo: [], meio: [], arvore: [] };
const porEstado = {}, porEstadoImpedido = {}, porFonte = {};
let leituras = 0, reescritas = 0;
let alvosImpedidos = 0, corposImpedidos = 0, amostrasImp = 0;
let paresJuntos = 0, amostrasPares = 0;
const causaMoveToPos = {};

for (let i = 0; i < 60 * segundos; i++) {
    Match.update(dt);
    if (i % 6) continue;

    ['TeamA', 'TeamB'].forEach(t => {
        const bb = (typeof TeamAI !== 'undefined' && TeamAI.blackboards)
            ? TeamAI.blackboards[t] : null;
        if (!bb) return;
        const meus = (t === 'TeamA') ? Match.players : Match.opponents;
        const emCampo = [];

        meus.forEach(p => {
            if (p.role === 'gk' || !p.tacticalTarget) return;
            leituras++;
            emCampo.push(p);

            if (p.slotTarget && p.postoBase) {
                desvio.estilo.push(Math.hypot(
                    p.postoBase.x - p.slotTarget.x, p.postoBase.z - p.slotTarget.z));
            }
            if (p.postoBase) {
                desvio.meio.push(Math.hypot(
                    p.tacticalTarget.x - p.postoBase.x, p.tacticalTarget.z - p.postoBase.z));
            }

            const d = Math.hypot(p.dynamicTarget.x - p.tacticalTarget.x,
                p.dynamicTarget.z - p.tacticalTarget.z);
            desvio.arvore.push(d);
            if (d > 3.0) {
                reescritas++;
                porEstado[p.fsm.currentState] = (porEstado[p.fsm.currentState] || 0) + 1;
                if (p.fsm.currentState === 'MOVE_TO_POS') {
                    const dPos = Math.hypot(p.dynamicTarget.x - p.model.position.x,
                        p.dynamicTarget.z - p.model.position.z);
                    const dBola = Match.ball ? Math.hypot(
                        p.dynamicTarget.x - Match.ball.position.x,
                        p.dynamicTarget.z - Match.ball.position.z) : 99;
                    const k = (dPos < 0.5) ? 'espera pelo slot'
                        : (dBola < 2.0) ? 'alvo na bola' : 'outras folhas';
                    causaMoveToPos[k] = (causaMoveToPos[k] || 0) + 1;
                }
            }

            if (bb.isAttacking && bb.offsideLimitDir !== undefined && bb.offsideLimitDir !== null) {
                amostrasImp++;
                const limite = bb.offsideLimitDir + 0.5;
                if (p.dynamicTarget.z * p.dirZ > limite) {
                    alvosImpedidos++;
                    porEstadoImpedido[p.fsm.currentState] =
                        (porEstadoImpedido[p.fsm.currentState] || 0) + 1;
                    const veioDoTeamBT = p.tacticalTarget.z * p.dirZ > limite;
                    const f = veioDoTeamBT ? 'já vinha do nível 2' : 'escrito depois (nível 3/estilo)';
                    porFonte[f] = (porFonte[f] || 0) + 1;
                }
                if (p.model.position.z * p.dirZ > limite) corposImpedidos++;
            }
        });

        for (let a = 0; a < emCampo.length; a++) {
            for (let b = a + 1; b < emCampo.length; b++) {
                amostrasPares++;
                const d = Math.hypot(
                    emCampo[a].dynamicTarget.x - emCampo[b].dynamicTarget.x,
                    emCampo[a].dynamicTarget.z - emCampo[b].dynamicTarget.z);
                if (d < 3.0) paresJuntos++;
            }
        }
    });
}

const media = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
const p95 = a => {
    if (!a.length) return 0;
    const b = a.slice().sort((x, y) => x - y);
    return b[Math.floor(b.length * 0.95)];
};
const tabela = (obj, total) => Object.keys(obj)
    .sort((a, b) => obj[b] - obj[a])
    .map(k => '  ' + k.padEnd(32) + (100 * obj[k] / Math.max(1, total)).toFixed(0) + '%')
    .join('\n');

if (modo !== 'foradejogo') {
    console.log('\n=== A CADEIA (' + segundos + ' s, ' + leituras + ' leituras) ===\n');
    console.log('  slot puro   -> posto com estilo : média ' + media(desvio.estilo).toFixed(2) +
        ' m   p95 ' + p95(desvio.estilo).toFixed(1) + ' m');
    console.log('  posto       -> alvo do nível 2  : média ' + media(desvio.meio).toFixed(2) +
        ' m   p95 ' + p95(desvio.meio).toFixed(1) + ' m');
    console.log('  alvo nível 2-> alvo FINAL       : média ' + media(desvio.arvore).toFixed(2) +
        ' m   p95 ' + p95(desvio.arvore).toFixed(1) + ' m');
    console.log('\nO NÍVEL 3 REESCREVE (>3 m) em ' +
        (100 * reescritas / Math.max(1, leituras)).toFixed(0) + '% das leituras:');
    console.log(tabela(porEstado, reescritas));
    console.log('\ndentro do MOVE_TO_POS:');
    console.log(tabela(causaMoveToPos, Object.values(causaMoveToPos).reduce((s, v) => s + v, 0)));
    console.log('\nPARES de companheiros com alvos a menos de 3 m: ' +
        (100 * paresJuntos / Math.max(1, amostrasPares)).toFixed(1) + '%');
}

console.log('\n=== FORA-DE-JOGO (equipa com bola) ===\n');
console.log('  alvos além da linha : ' + (100 * alvosImpedidos / Math.max(1, amostrasImp)).toFixed(1) + '%');
console.log('  corpos além da linha: ' + (100 * corposImpedidos / Math.max(1, amostrasImp)).toFixed(1) + '%');
console.log('\n  quem escreveu o alvo impedido:');
console.log(tabela(porFonte, alvosImpedidos));
console.log('\n  em que estado:');
console.log(tabela(porEstadoImpedido, alvosImpedidos));
console.log('');
