/*
INFILTRAÇÕES QUE RECEBERAM BOLA.

Conta cada arranque de RUN_INTO_SPACE (o `actInfiltrar`) e verifica, enquanto
a corrida dura, se aquele jogador chegou a ser destinatário de um passe
(Match.intendedReceiver) e se chegou mesmo a tocar na bola.
*/
require('./tools/headless/harness.js');
const dt = 1 / 60, segundos = Number(process.argv[2] || 1080);
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Tatics !== 'undefined' && Tatics.updateSkills) Tatics.updateSkills();
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const corridas = new Map();          // jogador -> { visado, tocou, lancamento }
let total = 0, visados = 0, tocaram = 0, lancados = 0, somaDur = 0;

for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    for (const p of Match.players.concat(Match.opponents)) {
        const aCorrer = p.fsm.currentState === 'RUN_INTO_SPACE';
        const r = corridas.get(p);
        if (aCorrer && !r) {
            corridas.set(p, { visado: false, tocou: false, alto: false, t: 0 });
            total++;
        } else if (aCorrer && r) {
            r.t += dt;
            if (Match.intendedReceiver === p) {
                r.visado = true;
                // Lançamento/passe em profundidade: a bola vai para um ponto à
                // frente dele, não para os pés.
                if (Match.passTargetPos && p.model) {
                    const d = Math.hypot(Match.passTargetPos.x - p.model.position.x,
                        Match.passTargetPos.z - p.model.position.z);
                    if (d > 2.5) r.alto = true;
                }
            }
            if (Match.lastTouchedPlayer === p) r.tocou = true;
        } else if (!aCorrer && r) {
            if (r.visado) visados++;
            if (r.tocou) tocaram++;
            if (r.alto) lancados++;
            somaDur += r.t;
            corridas.delete(p);
        }
    }
}
const pct = (n) => total ? (100 * n / total).toFixed(1) + '%' : '-';
const minutos = (segundos * MatchDuration.timeScale) / 60;
console.log('minutos de relogio        ', minutos.toFixed(0));
console.log('infiltracoes (arranques)  ', total, '   (' + (total * 90 / minutos).toFixed(0) + ' por 90 min)');
console.log('duracao media da corrida  ', (somaDur / Math.max(1, total)).toFixed(2), 's');
console.log('   ... com passe para ela ', visados, pct(visados));
console.log('   ... em que ele TOCOU   ', tocaram, pct(tocaram));
console.log('   ... passe no ESPACO    ', lancados, pct(lancados), '(alvo do passe > 2.5 m a frente dele)');
