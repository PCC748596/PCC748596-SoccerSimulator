/*
ESTATÍSTICA POR JOGO — o painel de calibração contra os alvos reais.

Os contadores do `MatchStats` são absolutos e o relógio de jogo anda enquanto
se joga, por isso qualquer leitura a meio é uma FRACÇÃO de jogo. O `porJogo`
escala tudo para 90 minutos, que é a única forma de comparar com os alvos sem
esperar pelo apito final.

O QUE ESTE TESTE FIXA, e é tudo coisa que se parte sem dar por isso:

1. A escala é `5400 / segundosJogados`, e as DUAS equipas somam — os alvos são
   de jogo (2,52 golos são os dois lados juntos), não de equipa.
2. As PERCENTAGENS não são escaladas. Uma razão já é independente do tempo, e
   multiplicá-la pelo factor dava percentagens acima de 100.
3. Com pouco jogo decorrido não se extrapola: aos 10 s, um único canto dá 540
   por jogo. Devolve-se `null` e o painel diz que ainda não sabe.
4. Um ataque que nunca sai do próprio meio-campo NÃO é um ataque; um que chega
   ao último terço, ou que acaba em remate, é PERIGOSO.
5. `impedimentos` fica a zero de propósito — não há regra de fora-de-jogo no
   jogo — e o painel tem de o dizer em vez de mostrar o zero.

Corre com: node tests/estatistica_por_jogo.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const srcStats = ler('js/stats.js');
const srcMain = ler('js/main.js');

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);
const perto = (a, b, tol) => Math.abs(a - b) <= (tol || 0.001);

/*
Monta o MatchStats a sério. O CAMPO_COMP entra por fora porque o `registarZona`
e o `seguirAtaque` dividem o campo em terços com ele.
*/
function montar() {
    const i = srcStats.indexOf('const MatchStats = {');
    const f = srcStats.indexOf(LF + '};', i);
    const corpo = srcStats.slice(i, f + 3);

    const iNovo = srcStats.indexOf('function novoContadorEquipa()');
    const fNovo = srcStats.indexOf(LF + '}', iNovo);
    const novo = srcStats.slice(iNovo, fNovo + 2);

    return new Function('CAMPO_COMP',
        `${novo}; ${corpo}; return MatchStats;`)(105);
}

/* =====================================================================
   1 — A ESCALA PARA 90 MINUTOS, COM AS DUAS EQUIPAS SOMADAS
   ===================================================================== */
console.log(LF + '1 — escala 5400/jogados, e as duas equipas somam');
{
    const MS = montar();
    MS.reset();

    // Meio jogo: 45 min. Tudo o que se contar aqui vale o dobro por jogo.
    MS.TeamA.remates.golos = 1;
    MS.TeamB.remates.golos = 2;
    MS.TeamA.cantos = 3;
    MS.TeamB.cantos = 1;

    const s = MS.porJogo(45 * 60);

    if (!s.escalado) {
        erro('45 min não foi considerado suficiente para extrapolar');
    } else if (!perto(s.golos, 6)) {
        erro(`golos deu ${s.golos}, esperava 6 (3 em meio jogo, as duas equipas)`);
    } else {
        ok(`3 golos em 45 min -> ${s.golos.toFixed(2)} por jogo`);
    }

    if (!perto(s.cantos, 8)) {
        erro(`cantos deu ${s.cantos}, esperava 8`);
    } else {
        ok(`4 cantos em 45 min -> ${s.cantos.toFixed(2)} por jogo`);
    }

    // Um jogo inteiro não muda nada: o factor é 1.
    MS.reset();
    MS.TeamA.remates.golos = 2;
    MS.TeamB.remates.golos = 1;
    const cheio = MS.porJogo(90 * 60);
    if (!perto(cheio.golos, 3)) {
        erro(`num jogo inteiro os golos deviam ficar iguais, deu ${cheio.golos}`);
    } else {
        ok('num jogo inteiro o factor é 1');
    }
}

/* =====================================================================
   2 — PERCENTAGENS NÃO SE ESCALAM
   ===================================================================== */
console.log(LF + '2 — as razões não levam o factor do tempo');
{
    const MS = montar();
    MS.reset();

    // 100 passes, 60 certos, em 9 minutos (um décimo de jogo).
    MS.TeamA.passes.tentados = 100;
    MS.TeamA.passes.certos = 60;

    const s = MS.porJogo(9 * 60);

    if (!perto(s.pctPassesCertos, 60, 0.01)) {
        erro(`% de passes certos deu ${s.pctPassesCertos} — devia ser 60 ` +
            `independentemente do tempo decorrido`);
    } else {
        ok('60/100 em 9 min continua a ser 60%');
    }

    // E o mesmo para a % no alvo e o xG POR REMATE.
    MS.TeamA.remates.tentados = 10;
    MS.TeamA.remates.noAlvo = 4;
    MS.TeamA.xg = 1.5;
    const s2 = MS.porJogo(9 * 60);

    if (!perto(s2.pctRematesNoAlvo, 40, 0.01)) {
        erro(`% no alvo deu ${s2.pctRematesNoAlvo}, esperava 40`);
    } else {
        ok('4 de 10 no alvo continua a ser 40%');
    }
    if (!perto(s2.xgPorRemate, 0.15, 0.001)) {
        erro(`xG por remate deu ${s2.xgPorRemate}, esperava 0.15`);
    } else {
        ok('1.5 xG em 10 remates -> 0.15 por remate');
    }

    // Mas o xG TOTAL escala, porque é uma contagem.
    if (!perto(s2.xg, 15, 0.01)) {
        erro(`xG total deu ${s2.xg}, esperava 15 (1.5 num décimo de jogo)`);
    } else {
        ok('o xG total, esse, escala: 1.5 em 9 min -> 15 por jogo');
    }
}

/* =====================================================================
   3 — COM POUCO JOGO NÃO SE EXTRAPOLA
   ===================================================================== */
console.log(LF + '3 — aos 10 segundos não se inventa um jogo inteiro');
{
    const MS = montar();
    MS.reset();
    MS.TeamA.cantos = 1;

    const s = MS.porJogo(10);

    if (s.escalado) {
        erro('extrapolou a partir de 10 s de jogo');
    } else if (s.cantos !== null) {
        erro(`devolveu cantos=${s.cantos} aos 10 s — um canto extrapolado ` +
            `daria 540 por jogo`);
    } else {
        ok('aos 10 s devolve null e o painel diz que ainda não sabe');
    }

    // As razões continuam a valer: não dependem do tempo.
    MS.TeamA.passes.tentados = 8;
    MS.TeamA.passes.certos = 4;
    const s2 = MS.porJogo(10);
    if (s2.pctPassesCertos === null) {
        erro('a % de passes certos foi anulada — essa não depende do tempo');
    } else {
        ok(`a % de passes certos vale desde o início (${s2.pctPassesCertos}%)`);
    }
}

/* =====================================================================
   4 — O QUE CONTA COMO ATAQUE, E COMO ATAQUE PERIGOSO
   ===================================================================== */
console.log(LF + '4 — ataques: totais, perigosos, e o que não conta');
{
    const terco = 105 / 6;   // 17.5 m

    const correr = (passos) => {
        const MS = montar();
        MS.reset();
        for (const [team, zona] of passos) MS.registarZona(team, zona, 0.016);
        MS.fecharAtaque();
        return MS;
    };

    // Posse toda no próprio meio-campo: não é ataque nenhum.
    let MS = correr([['TeamA', -30], ['TeamA', -20], ['TeamA', -25]]);
    if (MS.TeamA.ataques.totais !== 0) {
        erro(`posse só no próprio campo contou ${MS.TeamA.ataques.totais} ataques`);
    } else {
        ok('posse só no próprio meio-campo: não é ataque');
    }

    // Passou o meio-campo mas não chegou ao último terço: ataque, não perigoso.
    MS = correr([['TeamA', -30], ['TeamA', 5], ['TeamA', 10]]);
    if (MS.TeamA.ataques.totais !== 1 || MS.TeamA.ataques.perigosos !== 0) {
        erro(`esperava 1 ataque e 0 perigosos, deu ${MS.TeamA.ataques.totais} ` +
            `e ${MS.TeamA.ataques.perigosos}`);
    } else {
        ok('chegou ao meio-campo adversário: 1 ataque, 0 perigosos');
    }

    // Chegou ao último terço: perigoso.
    MS = correr([['TeamA', -30], ['TeamA', 10], ['TeamA', terco + 5]]);
    if (MS.TeamA.ataques.totais !== 1 || MS.TeamA.ataques.perigosos !== 1) {
        erro(`esperava 1 ataque e 1 perigoso, deu ${MS.TeamA.ataques.totais} ` +
            `e ${MS.TeamA.ataques.perigosos}`);
    } else {
        ok('chegou ao último terço: ataque perigoso');
    }

    // Trocar de equipa fecha a sequência e abre outra.
    MS = correr([['TeamA', 20], ['TeamB', 20], ['TeamA', 20]]);
    if (MS.TeamA.ataques.totais !== 2 || MS.TeamB.ataques.totais !== 1) {
        erro(`a troca de posse não separou as sequências: A=${MS.TeamA.ataques.totais} ` +
            `B=${MS.TeamB.ataques.totais}, esperava 2 e 1`);
    } else {
        ok('a troca de posse fecha a sequência e abre outra');
    }

    /*
    Um remate de longe torna a sequência um ataque perigoso mesmo sem a bola ter
    passado o meio-campo no pé de ninguém: foi uma ida à baliza.
    */
    const MS2 = montar();
    MS2.reset();
    MS2.registarZona('TeamA', -20, 0.016);
    MS2.registarRemateNoAtaque('TeamA');
    MS2.fecharAtaque();
    if (MS2.TeamA.ataques.perigosos !== 1) {
        erro('um remate não tornou a sequência um ataque perigoso');
    } else {
        ok('remate de trás do meio-campo: ataque perigoso à mesma');
    }
}

/* =====================================================================
   5 — IMPEDIMENTOS: SEM REGRA, E O PAINEL TEM DE O DIZER
   ===================================================================== */
console.log(LF + '5 — impedimentos não são zero, são "sem regra"');
{
    const MS = montar();
    MS.reset();
    const s = MS.porJogo(90 * 60);

    if (s.impedimentos !== 0) {
        erro(`impedimentos deu ${s.impedimentos} — não há regra de fora-de-jogo ` +
            `no jogo, tem de ser 0`);
    } else {
        ok('o contador é 0, porque não há regra que o incremente');
    }

    /*
    E a linha do painel tem de estar marcada `semRegra`, senão o 0 lê-se como
    "a equipa nunca esteve em fora-de-jogo" — que é uma medição, não uma
    ausência de regra.
    */
    const linha = srcMain.match(/\{[^}]*campo: 'impedimentos'[^}]*\}/);
    if (!linha) {
        erro('não encontrei a linha dos impedimentos em ALVOS_ESTATISTICA');
    } else if (!linha[0].includes('semRegra')) {
        erro('a linha dos impedimentos não está marcada `semRegra`');
    } else {
        ok('a linha do painel está marcada `semRegra`');
    }
}

/* =====================================================================
   6 — A TABELA DO PAINEL COBRE OS ALVOS PEDIDOS
   ===================================================================== */
console.log(LF + '6 — todas as métricas pedidas estão na tabela');
{
    const esperados = [
        'pctPassesCertos', 'golos', 'remates', 'pctRematesNoAlvo', 'cantos',
        'amarelos', 'vermelhos', 'faltas', 'impedimentos',
        'ataquesPerigosos', 'ataquesTotais', 'xg'
    ];

    const MS = montar();
    MS.reset();
    const s = MS.porJogo(90 * 60);

    for (const campo of esperados) {
        if (!srcMain.includes(`campo: '${campo}'`)) {
            erro(`falta a linha de '${campo}' em ALVOS_ESTATISTICA`);
        } else if (!(campo in s)) {
            erro(`'${campo}' está no painel mas o porJogo() não o devolve`);
        }
    }
    if (!falhas) ok(`as ${esperados.length} métricas estão na tabela e no porJogo()`);
}

console.log(LF + (falhas ? `FALHAS: ${falhas}` : 'TUDO OK'));
process.exit(falhas ? 1 : 0);
