/*
A TRASEIRA DO BLOCO DENTRO DA PRÓPRIA ÁREA.

O piso do rectângulo era a linha da grande área e mais nada. Com a bola entre
essa linha e a baliza o bloco não podia recuar mais: a bola ficava ATRÁS da
traseira do bloco e toda a gente colocada à frente dela — o buraco no meio da
área.

Regra: com a bola à frente da linha da área o piso é o de sempre; assim que ela
passa, o piso passa a ser a própria bola recuada de `BlockShape.folgaAtrasDaBola`,
até `BlockShape.margemFundoDoBloco` da linha de fundo. O rectângulo desloca-se
inteiro — a profundidade nunca muda.

Corre com: node --test tests/bloco_segue_bola_na_area.test.js
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

// Bloco estabilizado com a bola numa dada linha, a defender e sem adversários
// (para nenhuma âncora de última linha mexer no resultado).
function blocoCom(bolaZDir) {
    const bb = {
        dir: 1, isAttacking: false, bolaZSuave: bolaZDir, bolaXSuave: 0,
        ballX: 0, blocoZSuave: undefined, opp: [], own: []
    };
    let b;
    for (let i = 0; i < 600; i++) b = computeBlock(bb);
    return b;
}

const linhaDaArea = -(LINHA_FUNDO - Area.profundidade);   // -36 m

test('os dois números vivem no config', () => {
    assert.strictEqual(typeof BlockShape.folgaAtrasDaBola, 'number');
    assert.strictEqual(typeof BlockShape.margemFundoDoBloco, 'number');
    assert.ok(BlockShape.margemFundoDoBloco > 0 &&
        BlockShape.margemFundoDoBloco < Area.profundidade,
        'o piso absoluto tem de ficar entre a linha de fundo e a linha da área');
});

test('com a bola à frente da linha da área o piso continua a ser a linha da área', () => {
    const b = blocoCom(linhaDaArea + 6);
    assert.ok(b.z0 >= linhaDaArea - 1e-6,
        `traseira em ${b.z0.toFixed(2)}, não devia passar da linha da área (${linhaDaArea})`);
});

test('com a bola dentro da área a traseira acompanha-a', () => {
    for (const bolaZ of [linhaDaArea - 4, linhaDaArea - 9]) {
        const b = blocoCom(bolaZ);
        const esperado = bolaZ - BlockShape.folgaAtrasDaBola;
        assert.ok(b.z0 <= linhaDaArea - 1e-6,
            `bola em ${bolaZ}: traseira ficou em ${b.z0.toFixed(2)}, presa na linha da área`);
        assert.ok(Math.abs(b.z0 - esperado) < 0.01,
            `bola em ${bolaZ}: traseira em ${b.z0.toFixed(2)}, esperado ${esperado.toFixed(2)}`);
        assert.ok(b.z0 < bolaZ, 'a bola tem de ficar DENTRO do bloco, não atrás dele');
    }
});

test('o piso absoluto é a linha de fundo, não a bola', () => {
    const b = blocoCom(-(LINHA_FUNDO - 0.5));
    const piso = -(LINHA_FUNDO - BlockShape.margemFundoDoBloco);
    assert.ok(b.z0 >= piso - 1e-6,
        `traseira em ${b.z0.toFixed(2)}, saiu do campo (piso ${piso.toFixed(2)})`);
});

test('o bloco não se deforma ao acompanhar a bola', () => {
    const prof = blocoCom(0).z1 - blocoCom(0).z0;
    for (const bolaZ of [linhaDaArea + 6, linhaDaArea - 4, -(LINHA_FUNDO - 0.5)]) {
        const b = blocoCom(bolaZ);
        assert.ok(Math.abs((b.z1 - b.z0) - prof) < 0.01,
            `bola em ${bolaZ}: profundidade ${(b.z1 - b.z0).toFixed(2)}, esperado ${prof.toFixed(2)}`);
    }
});
