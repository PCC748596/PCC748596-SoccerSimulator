/*
PORQUE MORRE A CORRIDA AO ESPAÇO.

Reavalia, por frame, as mesmas condições de aborto do `case 'RUN_INTO_SPACE'`
(fsm.js) para cada jogador que está no estado, e regista qual era verdadeira no
instante em que ele saiu.
*/
require('./tools/headless/harness.js');
const dt = 1 / 60, segundos = Number(process.argv[2] || 600);
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Tatics !== 'undefined' && Tatics.updateSkills) Tatics.updateSkills();
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

/*
Qual FOLHA correu para cada jogador em cada frame — embrulha as acções globais.
*/
const ultimaAccao = new Map();
for (const nome of ['actHoldPosition', 'actChaseBall', 'actInfiltrar', 'actApoioCirculacao',
    'actIntercept', 'actReceivePass', 'actTackle', 'actSlideTackle', 'actOverlap',
    'actEsperarDevolucao', 'actEsperarNaArea', 'actMarcar', 'tratarBolaParada']) {
    const orig = global[nome];
    if (typeof orig !== 'function') continue;
    global[nome] = function (ctx) {
        if (ctx && ctx.p) ultimaAccao.set(ctx.p, nome);
        return orig.apply(this, arguments);
    };
}

const estado = new Map();   // jogador -> { t, ultima }
const causas = {};
let total = 0, somaDur = 0;

function porque(p) {
    const causas = [];
    if ((p.runTimer || 0) <= 0) causas.push('runTimer<=0 (prazo acabou)');
    if (Match.possessionTeam !== p.team) causas.push('perdemosABola');
    if (Match.intendedReceiver && Match.intendedReceiver !== p) causas.push('passeParaOutro');
    if (p.dynamicTarget && p.model.position.distanceTo(p.dynamicTarget) < 1.5) causas.push('chegou');
    if (p.dynamicTarget && ((p.dynamicTarget.z - p.model.position.z) * p.dirZ) < -1.0) causas.push('alvoAtras');
    return causas.length ? causas.join(' + ') : '(nenhuma: saiu por outra folha da arvore)';
}

for (let i = 0; i < Math.round(segundos / dt); i++) {
    ultimaAccao.clear();   // a folha registada tem de ser a DESTE frame
    const antes = new Map();
    for (const p of Match.players.concat(Match.opponents)) {
        if (p.fsm.currentState === 'RUN_INTO_SPACE') antes.set(p, porque(p));
    }
    Match.update(dt);
    for (const p of Match.players.concat(Match.opponents)) {
        const aCorrer = p.fsm.currentState === 'RUN_INTO_SPACE';
        const r = estado.get(p);
        if (aCorrer && !r) estado.set(p, { t: dt });
        else if (aCorrer && r) r.t += dt;
        else if (!aCorrer && r) {
            total++; somaDur += r.t;
            let c = antes.has(p) ? antes.get(p) : '(ja nao estava no estado)';
            if (c.startsWith('(nenhuma')) {
                // Que folha ganhou? O estado NOVO diz qual.
                c = 'outra folha: ' + (ultimaAccao.get(p) || '?') + ' -> ' + p.fsm.currentState +
                    (p.blackboard && p.blackboard.bb ? '' : '') +
                    (TeamAI.get(p.team).isAttacking ? ' (a atacar)' : ' (SEM posse)');
            }
            causas[c] = (causas[c] || 0) + 1;
            estado.delete(p);
        }
    }
}
console.log('corridas terminadas', total, '| duracao media', (somaDur / Math.max(1, total)).toFixed(2), 's');
Object.entries(causas).sort((a, b) => b[1] - a[1]).forEach(([c, n]) =>
    console.log('  ' + String(Math.round(1000 * n / total) / 10).padStart(5) + '%  ' + String(n).padStart(5) + '  ' + c));
