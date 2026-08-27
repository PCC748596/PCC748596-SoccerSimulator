/*
DIAGNÓSTICO DO PASSE, por TIPO (direct / space / leading) e por forma
(rasteiro / alto / lançamento).

O que se mede, por passe:
  - onde a bola foi PEDIDA (passTargetPos) e onde ela ACABOU;
  - quem lhe tocou primeiro: o destinatário, outro colega, um adversário, ou
    ninguém;
  - quanto tempo levou, e quanto tempo levou o destinatário a chegar ao ponto.

Uso: node tools/headless/passes.js [segundos]
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
let aberta = null;

// Embrulha o executePassGameplay: é o instante do contacto, onde o tipo, o
// alvo e o destinatário ainda existem todos.
const originalExec = global.executePassGameplay;
global.executePassGameplay = function (p) {
    const tipo = p.passTipo || 'direct';
    const lancamento = !!(p.isThroughBall && p.throughBallTarget);
    const receptor = p.passTarget;
    originalExec(p);

    const alvo = { x: p.passTargetPos.x, z: p.passTargetPos.z };
    const origem = { x: Match.ball.position.x, z: Match.ball.position.z };

    /*
    Adversários EM CIMA DA LINHA do passe no instante em que ele sai: distância
    perpendicular ao segmento origem->alvo, só os que estão entre os dois.
    É a pergunta directa "este passe era para ser dado?".
    */
    const advs = (p.team === 'TeamA') ? Match.opponents : Match.players;
    const lx = alvo.x - origem.x, lz = alvo.z - origem.z;
    const len2 = lx * lx + lz * lz || 1;
    let naLinha = 0, maisPerto = 99;
    for (const o of advs) {
        if (o.role === 'gk') continue;
        const t = ((o.model.position.x - origem.x) * lx + (o.model.position.z - origem.z) * lz) / len2;
        if (t < 0.05 || t > 0.95) continue;
        const px = origem.x + t * lx, pz = origem.z + t * lz;
        const d = Math.hypot(o.model.position.x - px, o.model.position.z - pz);
        if (d < 2.5) naLinha++;
        if (d < maisPerto) maisPerto = d;
    }
    const distPedida = Math.hypot(alvo.x - Match.ball.position.x, alvo.z - Match.ball.position.z);
    const distReceptorAoAlvo = receptor
        ? Math.hypot(alvo.x - receptor.model.position.x, alvo.z - receptor.model.position.z) : null;

    if (aberta) fechar('ninguem');
    aberta = {
        tipo: lancamento ? 'lancamento' : tipo,
        alto: Match.ballVel.y > 0.5,
        distPedida: distPedida,
        distReceptorAoAlvo: distReceptorAoAlvo,
        passador: p, receptor: receptor,
        alvo: alvo, origem: origem,
        naLinha: naLinha, advMaisPerto: maisPerto,
        t: 0,
        tocouAlguem: Match.lastTouchedPlayer
    };
};

function fechar(desfecho, quem) {
    if (!aberta) return;
    const b = Match.ball.position;
    const percorrido = Math.hypot(b.x - aberta.origem.x, b.z - aberta.origem.z) /
        Math.max(0.1, Math.hypot(aberta.alvo.x - aberta.origem.x, aberta.alvo.z - aberta.origem.z));
    amostras.push({
        naLinha: aberta.naLinha,
        advMaisPerto: aberta.advMaisPerto,
        fraccaoPercorrida: percorrido,
        tipo: aberta.tipo,
        alto: aberta.alto,
        distPedida: aberta.distPedida,
        distReceptorAoAlvo: aberta.distReceptorAoAlvo,
        erroAoAlvo: Math.hypot(b.x - aberta.alvo.x, b.z - aberta.alvo.z),
        distAoReceptor: aberta.receptor
            ? Math.hypot(b.x - aberta.receptor.model.position.x, b.z - aberta.receptor.model.position.z)
            : null,
        tempo: aberta.t,
        desfecho: desfecho
    });
    aberta = null;
}

for (let i = 0; i < passos; i++) {
    Match.update(dt);

    if (aberta) {
        aberta.t += dt;
        const tocou = Match.lastTouchedPlayer;
        if (tocou && tocou !== aberta.passador && tocou !== aberta.tocouAlguem) {
            let desfecho;
            if (tocou === aberta.receptor) desfecho = 'recebeu';
            else if (tocou.team === aberta.passador.team) desfecho = 'outroColega';
            else desfecho = 'cortado';
            fechar(desfecho);
        } else if (aberta.t > 0.4 && Match.ballVel.lengthSq() < 0.09) {
            fechar('morreu');       // parou sozinha no relvado
        } else if (aberta.t > 8) {
            fechar('perdeuse');
        }
    }
}

/* ---- relatório ----------------------------------------------------------- */

const mediana = (xs) => {
    if (!xs.length) return NaN;
    const o = xs.slice().sort((a, b) => a - b);
    return o[Math.floor(o.length / 2)];
};

const TIPOS = ['direct', 'space', 'leading', 'lancamento'];
const DESFECHOS = ['recebeu', 'outroColega', 'cortado', 'morreu', 'ninguem', 'perdeuse'];

console.log('');
console.log(`PASSES por TIPO — ${amostras.length} amostras em ${segundos}s simulados`);
console.log('');
console.log('  tipo         n     ' + DESFECHOS.map(d => d.slice(0, 8).padStart(9)).join(''));
for (const t of TIPOS) {
    const g = amostras.filter(a => a.tipo === t);
    if (!g.length) { console.log(`  ${t.padEnd(11)} 0`); continue; }
    const cols = DESFECHOS.map(d =>
        (100 * g.filter(a => a.desfecho === d).length / g.length).toFixed(0).padStart(8) + '%');
    console.log(`  ${t.padEnd(11)} ${String(g.length).padStart(4)}  ` + cols.join(''));
}

console.log('');
console.log('  tipo        distPedida  erroAoAlvo  distAoReceptor  distReceptorAoAlvo  tempo');
for (const t of TIPOS) {
    const g = amostras.filter(a => a.tipo === t);
    if (!g.length) continue;
    console.log(`  ${t.padEnd(11)} ` +
        `${mediana(g.map(a => a.distPedida)).toFixed(1).padStart(9)}m` +
        `${mediana(g.map(a => a.erroAoAlvo)).toFixed(1).padStart(11)}m` +
        `${mediana(g.filter(a => a.distAoReceptor !== null).map(a => a.distAoReceptor)).toFixed(1).padStart(15)}m` +
        `${mediana(g.filter(a => a.distReceptorAoAlvo !== null).map(a => a.distReceptorAoAlvo)).toFixed(1).padStart(19)}m` +
        `${mediana(g.map(a => a.tempo)).toFixed(2).padStart(8)}s`);
}

console.log('');
console.log('PORQUE SE PERDE — adversários na linha do passe no instante em que ele sai');
console.log('  tipo        %comAdvNaLinha  distAdvMaisPerto  |  cortados: onde (fracção do percurso)');
for (const t of TIPOS) {
    const g = amostras.filter(a => a.tipo === t);
    if (!g.length) continue;
    const comAdv = 100 * g.filter(a => a.naLinha > 0).length / g.length;
    const cortados = g.filter(a => a.desfecho === 'cortado');
    console.log(`  ${t.padEnd(11)} ${comAdv.toFixed(0).padStart(13)}%` +
        `${mediana(g.map(a => a.advMaisPerto)).toFixed(1).padStart(17)}m  |  ` +
        `${(mediana(cortados.map(a => a.fraccaoPercorrida)) * 100).toFixed(0)}% do caminho` +
        `   (dos cortados, ${(100 * cortados.filter(a => a.naLinha > 0).length / Math.max(1, cortados.length)).toFixed(0)}% já tinham alguém na linha)`);
}

console.log('');
console.log('  (erroAoAlvo = onde a bola acabou vs onde foi pedida;');
console.log('   distAoReceptor = onde acabou vs onde o destinatário estava nesse instante)');
