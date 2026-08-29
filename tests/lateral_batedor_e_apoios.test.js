/*
O LATERAL: QUEM O COBRA E QUEM SE APROXIMA.

DUAS COISAS, vistas no mesmo ecrã.

1. O BATEDOR era simplesmente o jogador de campo mais perto do ponto da linha —
   e num lateral no nosso meio-campo isso dá quase sempre o CENTRAL, que é quem
   não devia estar a pôr a bola em jogo. A ordem pedida é a do futebol:
   LATERAL, depois o MÉDIO DA ALA, depois o CM. Do lado certo do campo, e sem
   ir buscar um lateral que está a 40 m dali.

2. TODA A GENTE se deslocava para receber. O nível 2 fica ligado no THROW_IN e
   a mola de coesão puxa o bloco inteiro para a bola: o central sai da posição,
   o CM cola-se à linha, e num lance que precisa de duas ou três opções curtas
   aparecem seis. O central mantém a posição, o CM oferece-se mas de longe.

Corre com: node tests/lateral_batedor_e_apoios.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const srcConfig = ler('js/config/player_behavior.js');
const srcUtils = ler('js/utils.js');
const srcMatch = ['js/match/match_state.js', 'js/match/match_setup.js', 'js/match/match_physics.js', 'js/match/match_setpieces.js', 'js/match/match_loop.js', 'js/match/match_ui.js'].map(ler).join('\n');
const srcTeam = ler('js/bt/team_bt.js');

function extrairObjecto(src, nome) {
    const i = src.indexOf(`const ${nome} = {`);
    if (i < 0) throw new Error(`${nome} não encontrado`);
    const f = src.indexOf(LF + '};', i);
    return new Function(`${src.slice(i, f + 3)}; return ${nome};`)();
}

function extrairFuncao(src, nome, preludio) {
    const i = src.indexOf(`function ${nome}(`);
    if (i < 0) throw new Error(`${nome} não encontrada`);
    return new Function(`${preludio || ''}
        ${src.slice(i, src.indexOf(LF + '}', i) + 2)}; return ${nome};`)();
}

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

const T = extrairObjecto(srcConfig, 'ThrowInModel');

const jog = (pos, x, z) => ({
    pos, role: (pos === 'GK') ? 'gk' : 'def',
    nome: pos,
    model: {
        position: {
            x, z,
            distanceTo(o) { return Math.hypot(o.x - x, o.z - z); }
        }
    }
});

/* =====================================================================
   1 — A ORDEM PEDIDA
   ===================================================================== */
console.log(LF + '1 — LB, depois LM, depois CM');
{
    const escolher = extrairFuncao(srcMatch, 'escolherBatedorDoLateral',
        `const ThrowInModel = ${JSON.stringify(T)};`);

    // Linha do lado do LB (x positivo, a mesma convenção das formações em
    // config.js: LB em +x, RB em -x). Bola a meio-campo.
    const bola = { x: 34, z: 0 };
    const lb = jog('LB', 30, 4);
    const lm = jog('LM', 28, -2);
    const cm = jog('CM', 10, 0);
    const cb = jog('CB', 6, -10);

    // O CB está mais LONGE aqui, mas o teste que interessa é o outro: mesmo
    // sendo o mais perto, não pode ser ele.
    const cbColado = jog('CB', 33, 1);

    const escolha = (lista) => escolher(lista, bola);

    if (escolha([lb, lm, cm, cb]) !== lb) erro('com o LB disponível devia ser ele');
    else ok('LB é o primeiro');

    if (escolha([lm, cm, cb]) !== lm) erro('sem LB devia ser o LM');
    else ok('sem LB: LM');

    if (escolha([cm, cb]) !== cm) erro('sem LB nem LM devia ser o CM');
    else ok('sem LB nem LM: CM');

    /*
    O caso do ecrã: o central é o mais perto da linha e era ele que cobrava.
    Com o LB em campo, mesmo mais longe, é o LB.
    */
    if (escolha([cbColado, lb]) !== lb) {
        erro('o central colado à linha voltou a cobrar o lateral');
    } else ok('o central colado à linha não cobra: cobra o LB');

    // Sem nenhum dos três, cobra o mais perto — nunca fica ninguém sem cobrar.
    const st = jog('ST', 30, 6);
    if (escolha([cb, st]) === null) erro('ficou sem batedor');
    else ok('sem LB/LM/CM: cobra o mais perto');
}

/* =====================================================================
   2 — O LADO CERTO E A DISTÂNCIA
   ===================================================================== */
console.log(LF + '2 — o lateral do outro lado não atravessa o campo');
{
    const escolher = extrairFuncao(srcMatch, 'escolherBatedorDoLateral',
        `const ThrowInModel = ${JSON.stringify(T)};`);

    const bola = { x: 34, z: 0 };
    const rb = jog('RB', -30, 0);      // lado oposto da linha
    const cm = jog('CM', 12, 2);

    if (escolher([rb, cm], bola) !== cm) {
        erro('mandou o lateral do lado oposto atravessar o campo para cobrar');
    } else ok('lateral do lado oposto: não é ele');

    // E um LB muito longe também não: 45 m para ir bater um lateral é lance
    // parado à espera dele.
    const lbLonge = jog('LB', 30, -45);
    const cmPerto = jog('CM', 20, 2);
    if (escolher([lbLonge, cmPerto], bola) !== cmPerto) {
        erro(`o LB a ${Math.round(Math.hypot(34 - 30, 45))} m continuou a ser chamado`);
    } else ok(`além de ${T.distanciaMaxBatedor} m: passa ao seguinte da ordem`);
}

/* =====================================================================
   3 — QUEM SE APROXIMA, E QUANTO
   ===================================================================== */
console.log(LF + '3 — o central fica, o CM não se cola');
{
    const dist = extrairFuncao(srcUtils, 'distanciaMinimaNoLateral',
        `const ThrowInModel = ${JSON.stringify(T)};`);

    const dCB = dist('CB');
    const dCM = dist('CM');
    const dLM = dist('LM');

    if (!(dCB > dCM)) erro(`o central devia ficar mais longe do que o CM: ${dCB} vs ${dCM}`);
    else ok(`CB fica a ${dCB} m, CM a ${dCM} m`);

    if (!(dCM > dLM)) erro(`o CM devia ficar mais longe do que o médio da ala: ${dCM} vs ${dLM}`);
    else ok(`CM a ${dCM} m, LM a ${dLM} m`);

    /*
    O médio da ala é uma das opções curtas do lance: se ele também tivesse de
    ficar longe, não havia lateral nenhum para cobrar — trocava-se "toda a
    gente em cima" por "ninguém a quem jogar".
    */
    if (dLM > T.alcanceMin) {
        erro(`o médio da ala ficaria a ${dLM} m, fora do alcance mínimo do lance ` +
            `(${T.alcanceMin} m)`);
    } else ok('o médio da ala continua a ser opção de passe curto');

    // Uma posição desconhecida não pode ficar sem regra.
    if (typeof dist('XX') !== 'number') erro('posição fora da tabela devolveu não-número');
    else ok('posição fora da tabela: tem omissão');
}

/* =====================================================================
   4 — E O POSICIONAMENTO USA MESMO ISTO
   ===================================================================== */
console.log(LF + '4 — o tickFinal afasta quem tem de ficar longe');
{
    const j = srcTeam.indexOf('tickFinal: function');
    const corpo = srcTeam.slice(j, srcTeam.indexOf(LF + '};', j));

    if (!/distanciaMinimaNoLateral/.test(corpo)) {
        erro('o tickFinal não usa a distância mínima — o bloco continua a colar-se à bola');
    } else ok('o tickFinal usa a distância mínima do lateral');

    if (!/THROW_IN/.test(corpo)) {
        erro('a regra não está limitada ao lance de lateral');
    } else ok('só no THROW_IN');
}

console.log(LF + (falhas ? `FALHOU: ${falhas}` : 'OK'));
process.exit(falhas ? 1 : 0);
