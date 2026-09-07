/*
O CENTRO DO BLOCO EM RELAÇÃO À LINHA DA BOLA.

Regra 4 do bloco (ver o cabeçalho do computeBlock em js/bt/team_bt.js): o
centro do rectângulo fica à frente da linha da bola, e "à frente" muda de
sentido com o Team State —

    T.Offensive / Offensive   -> +BlockShape.avancoDoCentroComBola  (8 m)
    T.Defensive / Defensive   -> -BlockShape.recuoDoCentroSemBola   (5 m)

Os dois números estavam escritos à mão no computeBlock (`? 5.0 : -5.0`). Este
teste corre o computeBlock a sério, com as globais stubbadas e SEM adversários
(para nenhuma âncora de última linha mexer no resultado), e mede o centro.

Corre com: node --test tests/centro_do_bloco.test.js
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcTeam = semCR(fs.readFileSync(path.join(raiz, 'js', 'bt', 'team_bt.js'), 'utf8'));
const srcTac = semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'tactics.js'), 'utf8'));
const srcDef = semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'defense.js'), 'utf8'));
const srcUtils = semCR(fs.readFileSync(path.join(raiz, 'js', 'utils.js'), 'utf8'));

const CAMPO_LARG = 68, CAMPO_COMP = 106, LINHA_FUNDO = CAMPO_COMP / 2;
const Area = { profundidade: 16.5 };

function extrairObjecto(src, nome, extras) {
    const ini = src.indexOf(`const ${nome} = {`);
    if (ini < 0) throw new Error(`${nome} não encontrado`);
    const fim = src.indexOf(LF + '};', ini);
    const nomes = Object.keys(extras || {});
    return new Function(...nomes, `${src.slice(ini, fim + 3)}; return ${nome};`)
        (...nomes.map(n => extras[n]));
}
function extrairFuncao(src, nome) {
    const ini = src.indexOf(`function ${nome}(`);
    if (ini < 0) throw new Error(`${nome} não encontrada`);
    const fim = src.indexOf(LF + '}' + LF, ini);
    return src.slice(ini, fim + 3);
}

const BlockShape = extrairObjecto(srcTac, 'BlockShape', { CAMPO_COMP, CAMPO_LARG });
const TeamShape = extrairObjecto(srcTac, 'TeamShape', { CAMPO_COMP, CAMPO_LARG });
const MentalidadeModel = extrairObjecto(srcTac, 'MentalidadeModel', { CAMPO_COMP });
const MarkingModel = extrairObjecto(srcDef, 'MarkingModel', { CAMPO_COMP, CAMPO_LARG });
const seguirBola = new Function(extrairFuncao(srcUtils, 'seguirBola') + '; return seguirBola;')();
const recuoDaUltimaLinha = new Function(
    extrairFuncao(srcUtils, 'recuoDaUltimaLinha') + '; return recuoDaUltimaLinha;')();

const Tatics = {
    linhaDefensiva: 'medium', lengthCompactness: 'median',
    compactness: 'median', pressaoDefensiva: 'balanced', estilo: 'balanceado'
};
const escolherProfundidade = new Function('BlockShape', 'Tatics', 'MentalidadeModel',
    extrairFuncao(srcTeam, 'escolherProfundidade') + '; return escolherProfundidade;')
    (BlockShape, Tatics, MentalidadeModel);

const sandbox = {
    CAMPO_LARG, CAMPO_COMP, LINHA_FUNDO, Area, BlockShape, TeamShape,
    MarkingModel, MentalidadeModel, seguirBola, recuoDaUltimaLinha,
    escolherProfundidade, Tatics, Match: { delta: 0.016, state: 'PLAY' }
};
const computeBlock = new Function(...Object.keys(sandbox),
    extrairFuncao(srcTeam, 'computeBlock') + '; return computeBlock;')(...Object.values(sandbox));

// Centro do bloco menos a linha da bola, no referencial de ataque.
function centroMenosBola(bolaZDir, atacando) {
    const bb = {
        dir: 1, isAttacking: atacando, bolaZSuave: bolaZDir, bolaXSuave: 0,
        ballX: 0, blocoZSuave: undefined, opp: [], own: []
    };
    let b;
    for (let i = 0; i < 600; i++) b = computeBlock(bb);
    return (b.z0 + b.z1) / 2 - bolaZDir;
}

/*
O CENTRO COM BOLA TEM TRÊS VALORES, UM POR TERÇO.

Era um só (`avancoDoCentroComBola`, 8 m em todo o campo). Passou a três, para a
equipa não se esticar num rectângulo único: com a bola no miolo o centro fica
`centro.meio` à frente dela; nos terços, o comprimento do bloco entra na conta
(`fraccaoProfundidade`) para a defesa não acabar dentro da área adversária nem
colada à própria baliza. A passagem entre eles é uma rampa de `centro.rampa`
metros — sem ela o bloco saltava ao cruzar a fronteira do terço.
*/
// O avanço do meio-campo (BlockShape.avancoNoMeioCampo) soma-se ao centro
// enquanto a bola estiver na faixa central — vale com e sem bola.
function avancoDoMeioCampo(atacando) {
    const prof = CAMPO_COMP * BlockShape.profundidade[
        atacando ? (Tatics.lengthCompactness || 'median') : 'short'];
    return prof * (BlockShape.avancoNoMeioCampo || 0);
}

test('com a bola no miolo o centro fica centro.meio à frente dela', () => {
    const C = BlockShape.centro;
    assert.strictEqual(typeof C.meio, 'number');
    const extra = avancoDoMeioCampo(true);
    for (const bolaZ of [-10, -5, 0, 5]) {
        assert.ok(Math.abs(bolaZ) <= C.faixaMeio, 'o cenário tem de estar na faixa central');
        const d = centroMenosBola(bolaZ, true);
        assert.ok(Math.abs(d - (C.meio + extra)) < 0.01,
            `bola em ${bolaZ}: centro a ${d.toFixed(2)} m, esperado ${(C.meio + extra).toFixed(2)}`);
    }
});

test('no terço ofensivo o centro recua ao longo da rampa', () => {
    const C = BlockShape.centro;
    /*
    Todos os pontos fora da faixa do `avancoNoMeioCampo` (20 m), para o avanço
    do meio-campo não entrar em uns e não noutros — o que aqui se mede é a
    rampa do centro, e mais nada.
    */
    const inicio = centroMenosBola(C.faixaMeio + 1, true);
    const meio = centroMenosBola(C.faixaMeio + C.rampa / 2, true);
    const fim = centroMenosBola(C.faixaMeio + C.rampa, true);

    assert.ok(meio < inicio, 'ao entrar no terço ofensivo o centro tem de recuar');
    assert.ok(fim < meio, 'e continua a recuar ao longo da rampa');

    /*
    A rampa é linear no cálculo, mas aqui não se mede assim: com a bola a 21 m
    do meio-campo a frente do bloco já bate na linha de fundo adversária, e o
    clamp do campo desloca o rectângulo inteiro. O que se pode afirmar é a
    ordem — e é essa que interessa: entre a faixa e o fim da rampa o centro só
    anda para trás, sem saltos de sinal.
    */

    // Depois da rampa estabiliza: não continua a recuar para sempre.
    const alem = centroMenosBola(C.faixaMeio + C.rampa + 6, true);
    assert.ok(Math.abs(alem - fim) < 0.3, 'o recuo do centro não pode crescer sem fim');
});

test('sem bola o centro fica centro.semBola atrás da bola', () => {
    const C = BlockShape.centro;
    assert.ok(C.semBola < 0, 'sem posse o centro fica ATRÁS da linha da bola');
    const avancoMeio = avancoDoMeioCampo(false);   // a defender o bloco é sempre short
    for (const bolaZ of [-10, -5, 0]) {
        const naFaixa = Math.abs(bolaZ) <= (BlockShape.faixaMeioCampo || 20);
        const esperado = C.semBola + (naFaixa ? avancoMeio : 0);
        const d = centroMenosBola(bolaZ, false);
        assert.ok(Math.abs(d - esperado) < 0.01,
            `bola em ${bolaZ}: centro a ${d.toFixed(2)} m, esperado ${esperado.toFixed(2)}`);
    }
});

test('o avanço do meio-campo sai do config e vale só na faixa central', () => {
    assert.ok(BlockShape.avancoNoMeioCampo > 0 && BlockShape.avancoNoMeioCampo <= 0.35,
        `avancoNoMeioCampo=${BlockShape.avancoNoMeioCampo} fora do que é um ajuste de bloco`);
    const ini = srcTeam.indexOf('function computeBlock(');
    const corpo = srcTeam.slice(ini, srcTeam.indexOf(LF + '}' + LF, ini));
    assert.ok(corpo.includes('avancoNoMeioCampo'),
        'o computeBlock já não adianta o bloco com a bola no meio-campo');
    assert.ok(corpo.includes('faixaMeioCampo'),
        'a faixa do meio-campo voltou a estar escrita à mão');
    assert.ok(corpo.includes('+ avancoMeio'),
        'o tecto da última linha já não acompanha o avanço do meio-campo');
});

test('junto às linhas de fundo o campo morde, e é a única coisa que morde', () => {
    const perto = centroMenosBola(20, true);
    assert.ok(perto < BlockShape.centro.meio + avancoDoMeioCampo(true),
        'junto à baliza adversária o centro tinha de ficar aquém do valor do miolo');
    assert.ok(perto > 0, 'mesmo com o clamp o centro fica à frente da bola');
});

test('o computeBlock lê os números do config, não os tem escritos', () => {
    const ini = srcTeam.indexOf('function computeBlock(');
    const corpo = srcTeam.slice(ini, srcTeam.indexOf(LF + '}' + LF, ini));
    assert.ok(corpo.includes('B.centro'),
        'os três centros do bloco voltaram a estar escritos à mão no computeBlock');
    for (const numero of ['offsetMeio = 10.0;', 'bZ < -20.0', '(profundidade / 3)']) {
        assert.ok(!corpo.includes(numero),
            `'${numero}' voltou para dentro do computeBlock — pertence ao BlockShape.centro`);
    }
    assert.ok(!/isAttacking\s*\?\s*5\.0\s*:\s*-5\.0/.test(corpo),
        'ainda lá está o `bb.isAttacking ? 5.0 : -5.0`');
});
