/*
NO LATERAL, A EQUIPA QUE MARCA SOBE.

Pedido: "para o time batedor está ok; para o time marcador pode avançar um
pouco mais, está recuando muito". Sem regra nenhuma a equipa que não repõe usa
o bloco defensivo de sempre — centro `BlockShape.recuoDoCentroSemBola` (5 m)
atrás da linha da bola — e o batedor ficava com toda a gente longe.

`ThrowInModel.avancoDosMarcadores` avança o RECTÂNGULO INTEIRO enquanto o
estado for THROW_IN, e só para quem não tem a posse.

Corre com: node --test tests/lateral_bloco_marcador.test.js
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
const srcBeh = semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'player_behavior.js'), 'utf8'));
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
const ThrowInModel = extrairObjecto(srcBeh, 'ThrowInModel', { CAMPO_COMP, CAMPO_LARG, Math });
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

const Match = { delta: 0.016, state: 'PLAY' };
const sandbox = {
    CAMPO_LARG, CAMPO_COMP, LINHA_FUNDO, Area, BlockShape, TeamShape,
    MarkingModel, MentalidadeModel, ThrowInModel, seguirBola, recuoDaUltimaLinha,
    escolherProfundidade, Tatics, Match
};
const computeBlock = new Function(...Object.keys(sandbox),
    extrairFuncao(srcTeam, 'computeBlock') + '; return computeBlock;')(...Object.values(sandbox));

// Centro do bloco estabilizado, sem adversários (nenhuma âncora de última
// linha a mexer no resultado).
function centro(bolaZDir, atacando, estado) {
    Match.state = estado;
    const bb = {
        dir: 1, isAttacking: atacando, bolaZSuave: bolaZDir, bolaXSuave: CAMPO_LARG / 2,
        ballX: CAMPO_LARG / 2, blocoZSuave: undefined, opp: [], own: []
    };
    let b;
    for (let i = 0; i < 600; i++) b = computeBlock(bb);
    Match.state = 'PLAY';
    return { c: (b.z0 + b.z1) / 2, prof: b.z1 - b.z0 };
}

test('o número vive no config e é um avanço, não um recuo', () => {
    assert.strictEqual(typeof ThrowInModel.avancoDosMarcadores, 'number');
    assert.ok(ThrowInModel.avancoDosMarcadores > 0 && ThrowInModel.avancoDosMarcadores <= 15,
        `avancoDosMarcadores=${ThrowInModel.avancoDosMarcadores} fora do que é um ajuste de bloco`);
});

test('quem marca sobe avancoDosMarcadores no lateral', () => {
    // Bola no miolo: longe das duas linhas de fundo, para nenhum clamp morder
    // (a -30 m o bloco já está encostado ao piso e a diferença dava zero).
    const bolaZ = 0;
    const emJogo = centro(bolaZ, false, 'PLAY');
    const noLateral = centro(bolaZ, false, 'THROW_IN');
    const subiu = noLateral.c - emJogo.c;
    assert.ok(Math.abs(subiu - ThrowInModel.avancoDosMarcadores) < 0.01,
        `subiu ${subiu.toFixed(2)} m, esperado ${ThrowInModel.avancoDosMarcadores}`);
});

test('quem repõe fica como estava', () => {
    const bolaZ = 0;
    const emJogo = centro(bolaZ, true, 'PLAY');
    const noLateral = centro(bolaZ, true, 'THROW_IN');
    assert.ok(Math.abs(noLateral.c - emJogo.c) < 0.01,
        `a equipa com posse mexeu-se ${(noLateral.c - emJogo.c).toFixed(2)} m e não devia`);
});

test('o bloco não se deforma ao subir', () => {
    const bolaZ = 0;
    const emJogo = centro(bolaZ, false, 'PLAY');
    const noLateral = centro(bolaZ, false, 'THROW_IN');
    assert.ok(Math.abs(noLateral.prof - emJogo.prof) < 0.01,
        `profundidade ${noLateral.prof.toFixed(2)} contra ${emJogo.prof.toFixed(2)}`);
});

test('o tecto da última linha sobe com o avanço', () => {
    // A lição da sessão do meio-campo: sem isto o recuoDaUltimaLinha volta a
    // ancorar o bloco no tecto do painel e o avanço não chega ao terreno.
    const ini = srcTeam.indexOf('function computeBlock(');
    const corpo = srcTeam.slice(ini, srcTeam.indexOf(LF + '}' + LF, ini));
    assert.ok(corpo.includes('avancoDosMarcadores'),
        'o computeBlock já não sobe o bloco de quem marca no lateral');
    assert.ok(corpo.includes('avancoMeio += ThrowInModel.avancoDosMarcadores'),
        'o avanço do lateral tem de entrar no MESMO avancoMeio que sobe o tecto da última linha');
});
