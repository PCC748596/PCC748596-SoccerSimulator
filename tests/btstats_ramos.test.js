/*
QUE RAMO DA ARVORE E QUE DECIDE — `BTStats` (js/bt/core.js).

PORQUE EXISTE. Uma alteracao ao ramo `ConduzirEmEspaco`, feita para reduzir as
conducoes, nao mudou nada: 7309 conducoes passaram a 6930, dentro do ruido.
Custou um lote inteiro descobrir que a conducao nem vinha desse ramo — havia
pelo menos outros dois `actCarry` na arvore, um deles o fallback final sem
condicao nenhuma.

Deduzir qual ramo decide a partir da ORDEM da arvore nao funciona: catorze
ramos com condicoes que se cruzam, e o que ganha depende do estado do jogo.

O QUE ISTO MEDE, e porque sao duas coisas:

    frames    quanto TEMPO aquela folha mandou. Uma conducao de 3 s conta 180.
    entradas  quantas VEZES a decisao foi tomada de novo. A mesma conta 1.

Foi a licao da tabela `permanencia`: o total de frames nao distingue mil
decisoes curtas de uma decisao longa, e as duas pedem correccoes opostas.

Corre com: node tests/btstats_ramos.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const srcCore = ler('js/bt/core.js');
const srcSim = ler('js/simulate.js');

const iBT = srcCore.indexOf('const BTStats = {');
if (iBT < 0) throw new Error('BTStats nao encontrado no js/bt/core.js');
const BTStats = new Function(
    srcCore.slice(iBT, srcCore.indexOf(LF + '};', iBT) + 3) + '; return BTStats;')();

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

console.log(LF + '1 — desligado por omissao');
{
    if (BTStats.activo !== false) {
        erro('BTStats nasce ligado — 22 jogadores x 60 fps a escrever para ninguem ler');
    } else ok('activo = false');

    // E a Action so conta quando esta ligado.
    const iAct = srcCore.indexOf('class Action extends BTNode');
    const bloco = srcCore.slice(iAct, iAct + 600);
    if (!/if \(BTStats\.activo\)/.test(bloco)) {
        erro('a Action conta sempre, mesmo com o BTStats desligado');
    } else ok('a Action so conta com o BTStats ligado');
}

console.log(LF + '2 — frames e entradas contam coisas diferentes');
{
    BTStats.reset();
    const p = {};

    // Uma decisao longa: a mesma folha 180 frames seguidos.
    for (let i = 0; i < 180; i++) BTStats.contar('conduzir', p);

    const e = BTStats.porAccao['conduzir'];
    if (e.frames !== 180) erro(`frames deviam ser 180, sao ${e.frames}`);
    else if (e.entradas !== 1) erro(`entradas deviam ser 1 (uma decisao), sao ${e.entradas}`);
    else ok('180 frames seguidos = 1 entrada, 180 frames');

    // Mil decisoes curtas alternadas: mesmo numero de frames, 180 entradas.
    BTStats.reset();
    const q = {};
    for (let i = 0; i < 90; i++) {
        BTStats.contar('conduzir', q);
        BTStats.contar('passar', q);
    }
    const c = BTStats.porAccao['conduzir'];
    if (c.frames !== 90) erro(`frames deviam ser 90, sao ${c.frames}`);
    else if (c.entradas !== 90) erro(`alternando, cada frame e uma entrada nova: ${c.entradas}`);
    else ok('alternado: 90 frames = 90 entradas');
}

console.log(LF + '3 — as entradas sao por JOGADOR');
{
    /*
    Um contador global nao distinguiria onze jogadores a alternar entre dois
    ramos de UMA pessoa a mudar onze vezes. O ultimo ramo fica guardado no
    proprio jogador.
    */
    BTStats.reset();
    const a = {}, b = {};

    // Dois jogadores, cada um estavel na sua folha, 60 frames.
    for (let i = 0; i < 60; i++) {
        BTStats.contar('marcar', a);
        BTStats.contar('marcar', b);
    }
    const e = BTStats.porAccao['marcar'];
    if (e.entradas !== 2) {
        erro(`dois jogadores estaveis deviam dar 2 entradas, deram ${e.entradas}`);
    } else ok('dois jogadores estaveis = 2 entradas (nao 120)');

    if (e.frames !== 120) erro(`frames deviam somar os dois: 120, sao ${e.frames}`);
    else ok('os frames somam os jogadores');

    // Sem jogador nao pode rebentar (nos de teste, arvores sem ctx).
    BTStats.reset();
    BTStats.contar('semDono', null);
    if (BTStats.porAccao['semDono'].frames !== 1) erro('contar sem jogador rebentou');
    else ok('sem jogador: conta frames e nao rebenta');
}

console.log(LF + '4 — o resumo e legivel e ordenado pela decisao');
{
    BTStats.reset();
    const p1 = {}, p2 = {};
    for (let i = 0; i < 300; i++) BTStats.contar('conduzir', p1);   // 1 entrada, muito tempo
    for (let i = 0; i < 50; i++) { BTStats.contar('passar', p2); BTStats.contar('receber', p2); }

    const r = BTStats.resumo();
    if (!r.length) { erro('resumo vazio'); }
    else {
        /*
        Ordenado por ENTRADAS e nao por frames: a pergunta e "quantas vezes se
        decidiu isto", e uma unica conducao longa nao pode encabecar a tabela
        so por ter durado.
        */
        if (r[0].accao === 'conduzir') {
            erro('ordenado por frames — uma decisao longa encabeca a tabela');
        } else ok('ordenado por entradas, nao por tempo');

        const soma = r.reduce((t, l) => t + l.pctTempo, 0);
        if (Math.abs(soma - 100) > 0.5) {
            erro(`as percentagens de tempo somam ${soma.toFixed(1)}%, deviam somar 100`);
        } else ok('pctTempo soma 100%');
    }
}

console.log(LF + '5 — o lote liga, desliga e publica');
{
    if (!/BTStats\.reset\(\);\s*BTStats\.activo = true/.test(srcSim)) {
        erro('o lote nao liga o BTStats');
    } else ok('o lote liga no inicio');

    if (!/BTStats\.activo = false/.test(srcSim)) {
        erro('o lote nao desliga o BTStats — ficava ligado no jogo normal a seguir');
    } else ok('o lote desliga no fim');

    if (!/ramos: relatorioRamos/.test(srcSim)) {
        erro('o relatorio do lote nao inclui os ramos');
    } else ok('sai no JSON do lote, em `ramos`');
}

console.log(LF + (falhas === 0
    ? 'btstats_ramos: tudo bem.'
    : `btstats_ramos: ${falhas} falha(s).`));
process.exit(falhas === 0 ? 0 : 1);
