/*
AGLOMERAÇÃO À VOLTA DO GUARDA-REDES QUE SEGURA A BOLA.

Enquanto ele a segura não há disputa — ninguém lha pode tirar — e mesmo assim a
mola de coesão puxava os vinte e dois para cima dele.

O guarda-redes é mantido a segurar durante toda a janela (o relógio dos 8 s é
reposto todos os frames) para se medir só o POSICIONAMENTO, sem a distribuição
a fazer o jogo recomeçar a meio da medição.

Uso: node tools/headless/gk_aglomeracao.js [quantas posses]
*/
require('./harness.js');

const quantas = Number(process.argv[2] || 30);
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const linha = {};
const media = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;

for (let n = 0; n < quantas; n++) {
    // Deixa o jogo correr para as posições serem diferentes de caso para caso.
    for (let i = 0; i < Math.round(5 / dt); i++) Match.update(dt);

    const gk = (n % 2 === 0) ? Match.players[0] : Match.opponents[0];
    const meus = ((gk.team === 'TeamA') ? Match.players : Match.opponents).filter(p => p.role !== 'gk');
    const outros = ((gk.team === 'TeamA') ? Match.opponents : Match.players).filter(p => p.role !== 'gk');

    Match.state = 'PLAY';
    Match.ball.position.set(0, BallPhysics.raio, gk.model.position.z + gk.dirZ * 0.5);
    Match.ballVel.set(0, 0, 0);
    Match.ballCarrier = gk;

    for (let i = 0; i < Math.round(8 / dt); i++) {
        // Mantém-no a segurar: é o posicionamento que se quer medir.
        gk.hasBall = true;
        gk.gkEstado = 'segurando';
        gk.gkHoldTimer = 0;
        Match.ballCarrier = gk;
        if (Match.gkHoldingBall) Match.gkHoldingBall[gk.team] = true;

        Match.update(dt);
        if (i % 30) continue;

        const s = Math.round(i * dt);
        const r = linha[s] = linha[s] || { meus: [], outros: [], perto: [], dentro: [] };
        r.meus.push(media(meus.map(p => p.model.position.distanceTo(Match.ball.position))));
        r.outros.push(media(outros.map(p => p.model.position.distanceTo(Match.ball.position))));
        r.perto.push(outros.filter(p => p.model.position.distanceTo(Match.ball.position) < 18).length);
        // Adversários DENTRO do raio de respeito: é a regra a ser violada.
        const raio = (typeof GuardaRedesComBola !== 'undefined') ? GuardaRedesComBola.raioRespeito : 9.15;
        r.dentro.push(outros.filter(p => p.model.position.distanceTo(Match.ball.position) < raio).length);
    }

    if (Match.gkHoldingBall) Match.gkHoldingBall[gk.team] = false;
    gk.hasBall = false; gk.gkEstado = 'idle'; Match.ballCarrier = null;
}

console.log('com o guarda-redes a segurar a bola (' + quantas + ' posses):');
console.log('  t     dist. média à bola          adversários');
console.log('        dele / adversária        a <18 m   dentro do raio');
Object.keys(linha).map(Number).sort((a, b) => a - b).forEach(s => {
    const r = linha[s];
    console.log('  +' + s + 's   ' + media(r.meus).toFixed(1).padStart(5) + ' / ' +
        media(r.outros).toFixed(1).padStart(5) + ' m      ' +
        media(r.perto).toFixed(2).padStart(5) + '     ' + media(r.dentro).toFixed(2).padStart(5));
});
