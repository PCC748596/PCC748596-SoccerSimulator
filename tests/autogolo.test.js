/*
Regressão: o AUTOGOLO era creditado à equipa que marcou contra a própria baliza.

O `updateBall` fazia `MatchStats[lastTouchedTeam].remates.golos++` e
`placarA/placarB++` pelo ÚLTIMO A TOCAR, enquanto o `golosSofridos` já usava a
baliza em que a bola entrou. Num autogolo as duas contas divergiam: a mesma
equipa somava um golo marcado E um sofrido, e o placar dava a vantagem a quem
tinha marcado contra si. Medido num lote de 30 jogos: 10 partidas com o placar
publicado errado (jogo 26 dizia 4-0 sendo 3-1).

Quem marca é sempre o dono da baliza OPOSTA àquela em que a bola entrou. A
assistência e a grande chance, essas, só contam quando o golo foi mesmo da
equipa que tocou por último.

O teste corre o `creditarGolo` de produção, extraído do match_physics.js.
*/
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js/match/match_physics.js'), 'utf8');

function extrair(nome) {
    const cabeca = `    ${nome}: function (zSinal) {`;
    const ini = src.indexOf(cabeca);
    if (ini < 0) throw new Error(`${nome} não encontrado em match_physics.js`);
    const fim = src.indexOf('\n    },', ini);
    return src.slice(ini + cabeca.length, fim);
}

const corpo = extrair('creditarGolo');
const creditarGolo = new Function('MatchStats', 'zSinal', `return (function (zSinal) {${corpo}}).call(this, zSinal);`);

function cenario(lastTouchedTeam, zSinal) {
    const stats = {
        TeamA: { remates: { golos: 0 }, golosSofridos: 0, assistencias: 0, chances: 0 },
        TeamB: { remates: { golos: 0 }, golosSofridos: 0, assistencias: 0, chances: 0 },
        registarGoloSofrido: function (t) { this[t].golosSofridos++; },
        registarAssistencia: function (t) { this[t].assistencias++; },
        confirmarGrandeChance: function (t) { this[t].chances++; }
    };
    const M = { lastTouchedTeam, placarA: 0, placarB: 0, updatePlacar: function () {} };
    creditarGolo.call(M, stats, zSinal);
    return { M, stats };
}

let falhas = 0;
function ok(cond, msg) {
    if (cond) { console.log('  ok   ' + msg); } else { console.log('  FALHA ' + msg); falhas++; }
}

// A baliza do TeamA é a de z negativo (ver `nextKickoffTeam` no updateBall).
console.log('Golo normal: TeamB marca na baliza do TeamA');
{
    const { M, stats } = cenario('TeamB', -1);
    ok(stats.TeamB.remates.golos === 1, 'golo para o TeamB');
    ok(stats.TeamA.remates.golos === 0, 'TeamA sem golo');
    ok(stats.TeamA.golosSofridos === 1, 'sofrido no TeamA');
    ok(M.placarB === 1 && M.placarA === 0, 'placar 0-1');
    ok(stats.TeamB.assistencias === 1, 'assistência confirmada');
    ok(stats.TeamB.chances === 1, 'grande chance confirmada');
}

console.log('Autogolo: TeamA marca na PRÓPRIA baliza');
{
    const { M, stats } = cenario('TeamA', -1);
    ok(stats.TeamB.remates.golos === 1, 'golo para o TeamB, que não lhe tocou');
    ok(stats.TeamA.remates.golos === 0, 'o TeamA NÃO soma golo marcado');
    ok(stats.TeamA.golosSofridos === 1, 'sofrido no TeamA');
    ok(M.placarB === 1 && M.placarA === 0, 'placar 0-1');
    ok(stats.TeamA.assistencias === 0 && stats.TeamB.assistencias === 0, 'sem assistência num autogolo');
    ok(stats.TeamA.chances === 0 && stats.TeamB.chances === 0, 'sem grande chance num autogolo');
}

console.log('Autogolo do outro lado: TeamB na baliza de z positivo');
{
    const { M, stats } = cenario('TeamB', 1);
    ok(stats.TeamA.remates.golos === 1, 'golo para o TeamA');
    ok(stats.TeamB.golosSofridos === 1, 'sofrido no TeamB');
    ok(M.placarA === 1 && M.placarB === 0, 'placar 1-0');
}

console.log('Marcados e sofridos fecham nos dois casos');
{
    const a = cenario('TeamB', -1), b = cenario('TeamA', -1);
    [a, b].forEach(c => {
        const marcados = c.stats.TeamA.remates.golos + c.stats.TeamB.remates.golos;
        const sofridos = c.stats.TeamA.golosSofridos + c.stats.TeamB.golosSofridos;
        ok(marcados === sofridos, 'marcados = sofridos');
        ok((c.M.placarA + c.M.placarB) === marcados, 'placar = golos marcados');
    });
}

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\nTodos os cenários passaram.');
