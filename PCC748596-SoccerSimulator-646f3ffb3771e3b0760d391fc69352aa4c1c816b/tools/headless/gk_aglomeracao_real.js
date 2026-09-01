/*
A AGLOMERAÇÃO, em apanhadas REAIS e só enquanto a bola está nas mãos.

Ao contrário do gk_aglomeracao.js, aqui não se força nada: espera-se que o
guarda-redes agarre a bola em jogo. É a única forma de ver o caso do ecrã — os
jogadores que já estavam amontoados no lance (um cruzamento, um remate) e a
questão é se se DESFAZEM enquanto ele a segura.

Mede-se só nos frames em que `Match.gkHoldingBall` é verdade. Depois de ele
largar, convergir para a bola é o jogo a recomeçar e não um defeito.

Uso: node tools/headless/gk_aglomeracao_real.js [segundos]
*/
require('./harness.js');

const segundos = Number(process.argv[2] || 2400);
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const raio = (typeof GuardaRedesComBola !== 'undefined') ? GuardaRedesComBola.raioRespeito : 9.15;

// Maior aglomerado: quantos jogadores de campo cabem num círculo de 6 m.
function maiorGrupo() {
    const t = Match.players.concat(Match.opponents).filter(p => p.role !== 'gk');
    let melhor = 0;
    for (const a of t) {
        let n = 0;
        for (const b of t) if (a.model.position.distanceTo(b.model.position) < 6.0) n++;
        if (n > melhor) melhor = n;
    }
    return melhor;
}

const linha = {};
let apanhadas = 0, inicio = -1, equipaGk = null;
let gkAnt = false;

for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    const segura = !!(Match.gkHoldingBall && (Match.gkHoldingBall.TeamA || Match.gkHoldingBall.TeamB));

    if (segura && !gkAnt) {
        apanhadas++;
        inicio = i;
        equipaGk = Match.gkHoldingBall.TeamA ? 'TeamA' : 'TeamB';
    }
    gkAnt = segura;

    // SÓ com a bola nas mãos. Largou, acabou a medição deste caso.
    if (!segura) { inicio = -1; continue; }
    if (inicio < 0) continue;

    if ((i - inicio) % 15) continue;
    const s = Math.round((i - inicio) * dt * 2) / 2;
    if (s > 8) continue;

    const outros = ((equipaGk === 'TeamA') ? Match.opponents : Match.players)
        .filter(p => p.role !== 'gk');
    const r = linha[s] = linha[s] || { grupo: [], dentro: [], perto: [] };
    r.grupo.push(maiorGrupo());
    r.dentro.push(outros.filter(p => p.model.position.distanceTo(Match.ball.position) < raio).length);
    r.perto.push(outros.filter(p => p.model.position.distanceTo(Match.ball.position) < 18).length);
}

const media = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
console.log('apanhadas do guarda-redes em ' + segundos + ' s: ' + apanhadas);
console.log('  t      maior aglomerado    adversários dentro    adversários');
console.log('         (círculo de 6 m)      de ' + raio + ' m           a <18 m');
Object.keys(linha).map(Number).sort((a, b) => a - b).forEach(s => {
    const r = linha[s];
    console.log('  +' + s.toFixed(1) + 's      ' + media(r.grupo).toFixed(2).padStart(5) +
        ' (máx ' + Math.max(...r.grupo) + ')      ' +
        media(r.dentro).toFixed(2).padStart(5) + '              ' +
        media(r.perto).toFixed(2).padStart(5) + '   [' + r.grupo.length + ' amostras]');
});
