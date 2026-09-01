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

test('com bola o centro fica avancoDoCentroComBola à frente da bola', () => {
    assert.strictEqual(BlockShape.avancoDoCentroComBola, 8.0,
        'o avanço do centro com bola devia ser 8 m');
    // No meio-campo não há clamp nenhum a morder: o valor sai limpo.
    for (const bolaZ of [-10, -5, 0, 5]) {
        const d = centroMenosBola(bolaZ, true);
        assert.ok(Math.abs(d - BlockShape.avancoDoCentroComBola) < 0.01,
            `bola em ${bolaZ}: centro a ${d.toFixed(2)} m, esperado ${BlockShape.avancoDoCentroComBola}`);
    }
});

test('sem bola o centro fica recuoDoCentroSemBola atrás da bola', () => {
    for (const bolaZ of [-10, -5, 0]) {
        const d = centroMenosBola(bolaZ, false);
        assert.ok(Math.abs(d + BlockShape.recuoDoCentroSemBola) < 0.01,
            `bola em ${bolaZ}: centro a ${d.toFixed(2)} m, esperado ${-BlockShape.recuoDoCentroSemBola}`);
    }
});

test('junto às linhas de fundo o campo morde, e é a única coisa que morde', () => {
    // Perto da própria baliza o bloco não pode recuar mais (minZ), perto da
    // adversária não pode avançar mais (maxZ): o centro afasta-se do valor
    // nominal, e é isso que se quer.
    const perto = centroMenosBola(20, true);
    assert.ok(perto < BlockShape.avancoDoCentroComBola,
        'junto à baliza adversária o centro tinha de ficar aquém dos 8 m');
    assert.ok(perto > 0, 'mesmo com o clamp o centro fica à frente da bola');
});

test('o computeBlock lê os dois números do config, não os tem escritos', () => {
    const ini = srcTeam.indexOf('function computeBlock(');
    const corpo = srcTeam.slice(ini, srcTeam.indexOf(LF + '}' + LF, ini));
    assert.ok(corpo.includes('BlockShape.avancoDoCentroComBola') &&
        corpo.includes('BlockShape.recuoDoCentroSemBola'),
        'o avanço do centro voltou a estar escrito à mão no computeBlock');
    assert.ok(!/isAttacking\s*\?\s*5\.0\s*:\s*-5\.0/.test(corpo),
        'ainda lá está o `bb.isAttacking ? 5.0 : -5.0`');
});
