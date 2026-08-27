/*
JOGO DE PRIMEIRA — quantos, de quem, e o que dá.

Uso: node tools/headless/primeira.js [segundos]
*/
require('./harness.js');

const segundos = Number(process.argv[2] || 600);
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Tatics !== 'undefined' && Tatics.updateSkills) Tatics.updateSkills();
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

let elegiveis = 0, dePrimeira = 0;
const tecs = [];
const orig = global.jogaDePrimeira;
global.jogaDePrimeira = function (tec, dist, rnd) {
    const r = orig(tec, dist, rnd);
    if (tec >= FirstTouchModel.tecMin && dist <= FirstTouchModel.distAdversario) {
        elegiveis++;
        if (r) { dePrimeira++; tecs.push(tec); }
    }
    return r;
};

// O que acontece a seguir a um toque de primeira: o passe sai logo?
let saiuLogo = 0, tempoAteSair = [];
const pendentes = new Map();
const origExec = global.executePassGameplay;
global.executePassGameplay = function (p) {
    if (pendentes.has(p)) {
        tempoAteSair.push(pendentes.get(p));
        saiuLogo++;
        pendentes.delete(p);
    }
    origExec(p);
};

let recepcoes = 0;
for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    for (const p of Match.players.concat(Match.opponents)) {
        if (p.jogarDePrimeira && p.hasBall && !pendentes.has(p)) pendentes.set(p, 0);
    }
    for (const [p, t] of pendentes) {
        if (!p.hasBall && t > 0.05) { pendentes.delete(p); continue; }
        pendentes.set(p, t + dt);
        if (t > 3) pendentes.delete(p);
    }
    recepcoes++;
}

const mediana = (xs) => {
    const o = xs.slice().sort((a, b) => a - b);
    return o.length ? o[Math.floor(o.length / 2)] : NaN;
};

console.log('');
console.log(`JOGO DE PRIMEIRA — ${segundos}s simulados`);
console.log(`  situações elegíveis (TEC >= ${FirstTouchModel.tecMin} e adversário <= ${FirstTouchModel.distAdversario}m): ${elegiveis}`);
console.log(`  jogadas de primeira: ${dePrimeira}  (${(100 * dePrimeira / Math.max(1, elegiveis)).toFixed(0)}% das elegíveis)`);
console.log(`  técnica mediana de quem o fez: ${mediana(tecs).toFixed(0)}`);
console.log(`  dessas, seguidas de passe: ${saiuLogo}, ao fim de ${mediana(tempoAteSair).toFixed(2)}s (mediana)`);
console.log('');
console.log(`  MatchStats.primeiraTocada  TeamA ${MatchStats.TeamA.primeiraTocada}  TeamB ${MatchStats.TeamB.primeiraTocada}`);
