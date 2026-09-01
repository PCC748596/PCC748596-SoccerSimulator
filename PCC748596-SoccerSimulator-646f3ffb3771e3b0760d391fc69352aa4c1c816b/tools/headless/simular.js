/*
Corre um tempo de jogo headless e imprime um resumo. Ver tools/headless/harness.js.

Uso:  node tools/headless/simular.js [segundosSimulados]
      (600 s simulados = 45 min de relógio, com o timeScale de 4.5)
*/
require('./harness.js');

const segundos = Number(process.argv[2] || 600);
const dt = 1 / 60;
const passos = Math.round(segundos / dt);

const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Tatics !== 'undefined' && Tatics.updateSkills) Tatics.updateSkills();

// Marca o modo headless: o player.js salta animateBones/labels quando o vê.
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

/*
Instrumentação das duas mecânicas novas — tipo de remate escolhido e desfecho
de cada defesa. Embrulha as funções globais em vez de tocar no código do jogo.
*/
const contaRemates = {};
const contaDefesas = {};
{
    const tipoOriginal = global.tipoDeRemate;
    global.tipoDeRemate = function (o) {
        const t = tipoOriginal(o);
        contaRemates[t] = (contaRemates[t] || 0) + 1;
        return t;
    };
    const defesaOriginal = global.resolverDefesaGK;
    global.resolverDefesaGK = function (o) {
        const r = defesaOriginal(o);
        const chave = (o.tipo || '?') + '/' + r.resultado;
        contaDefesas[chave] = (contaDefesas[chave] || 0) + 1;
        return r;
    };
}

const estados = {};
const contaEstado = () => {
    for (const p of Match.players.concat(Match.opponents)) {
        const s = p.fsm ? p.fsm.currentState : '?';
        estados[s] = (estados[s] || 0) + 1;
    }
};

const t0 = Date.now();
let ultimoAviso = 0;
for (let i = 0; i < passos; i++) {
    Match.update(dt);
    if (i % 6 === 0) contaEstado();
    const frac = i / passos;
    if (frac - ultimoAviso >= 0.25) {
        ultimoAviso = frac;
        process.stderr.write(`  ${(frac * 100).toFixed(0)}%  ${Math.round(Match.tempoDeJogo / 60)}'  ` +
            `${Match.placarA}-${Match.placarB}\n`);
    }
}
const segsReais = (Date.now() - t0) / 1000;

const A = MatchStats.TeamA, B = MatchStats.TeamB;
const pct = (a, b) => (a + b > 0 ? (100 * a / (a + b)).toFixed(0) + '%' : '-');

console.log('');
console.log(`TEMPO SIMULADO ${Math.round(Match.tempoDeJogo / 60)} min de relógio ` +
    `(${segundos}s simulados, ${segsReais.toFixed(0)}s de CPU)`);
console.log(`RESULTADO      ${Match.placarA} - ${Match.placarB}`);
console.log('');

const linha = (nome, a, b) => console.log(
    `  ${nome.padEnd(24)} ${String(a).padStart(8)} ${String(b).padStart(8)}`);

console.log('  ' + 'MÉTRICA'.padEnd(24) + '   TeamA'.padStart(8) + '   TeamB'.padStart(8));
linha('remates', A.remates.tentados, B.remates.tentados);
linha('  no alvo', A.remates.noAlvo, B.remates.noAlvo);
linha('  golos', A.remates.golos, B.remates.golos);
linha('conversão', pct(A.remates.golos, A.remates.tentados - A.remates.golos),
    pct(B.remates.golos, B.remates.tentados - B.remates.golos));
linha('xG', A.xg.toFixed(2), B.xg.toFixed(2));
linha('passes tentados', A.passes.tentados, B.passes.tentados);
linha('passes certos', A.passes.certos, B.passes.certos);
linha('  precisão', pct(A.passes.certos, A.passes.tentados - A.passes.certos),
    pct(B.passes.certos, B.passes.tentados - B.passes.certos));
linha('faltas cometidas', A.faltas.cometidas, B.faltas.cometidas);
linha('penáltis', A.penaltis, B.penaltis);
linha('cantos', A.cantos !== undefined ? A.cantos : '-', B.cantos !== undefined ? B.cantos : '-');

if (typeof MatchStats.resumoPasses === 'function') {
    console.log('');
    console.log('PASSES POR FAIXA (as duas equipas juntas — é o que o resumoPasses dá)');
    for (const f of MatchStats.resumoPasses()) {
        console.log(`  ${f.faixa.padEnd(7)} n=${String(f.n).padStart(4)}  ` +
            `alto ${String(f.pctAlto).padStart(3)}%  ` +
            `vSaida ${String(f.vSaidaMediana).padStart(5)}  vChegada ${String(f.vChegadaMediana).padStart(5)}  ` +
            `tVoo ${String(f.tVooMediano).padStart(4)}s  |  certo ${String(f.pctCerto).padStart(3)}%  ` +
            `cortado ${String(f.pctCortado).padStart(3)}%  dominioFalhado ${String(f.pctDominioFalhado).padStart(3)}%  ` +
            `ninguemTocou ${String(f.pctNinguemTocou).padStart(3)}%`);
    }
}

/*
REMATES E DEFESAS, contados por instrumentação: as duas coisas mudadas nesta
sessão não têm contador em MatchStats, e sem isto a simulação não diz nada
sobre elas.
*/
console.log('');
console.log('REMATES POR TIPO');
const totRem = Object.values(contaRemates).reduce((a, b) => a + b, 0);
if (!totRem) console.log('  (nenhum)');
Object.entries(contaRemates).sort((a, b) => b[1] - a[1]).forEach(([k, n]) =>
    console.log(`  ${k.padEnd(10)} ${String(n).padStart(3)}  ${(100 * n / totRem).toFixed(0)}%`));

console.log('');
console.log('DEFESAS DO GUARDA-REDES');
const totDef = Object.values(contaDefesas).reduce((a, b) => a + b, 0);
if (!totDef) console.log('  (nenhuma)');
Object.entries(contaDefesas).sort((a, b) => b[1] - a[1]).forEach(([k, n]) =>
    console.log(`  ${k.padEnd(10)} ${String(n).padStart(3)}  ${(100 * n / totDef).toFixed(0)}%`));

console.log('');
console.log('ESTADOS DA FSM (amostras a 10 Hz, por jogador)');
const total = Object.values(estados).reduce((a, b) => a + b, 0);
Object.entries(estados).sort((a, b) => b[1] - a[1]).slice(0, 14).forEach(([e, n]) =>
    console.log(`  ${e.padEnd(20)} ${(100 * n / total).toFixed(1)}%`));
