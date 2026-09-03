/*
FALTA DE ATAQUE DENTRO DA ÁREA ADVERSÁRIA: QUEM A COMETEU RECUA E MARCA.

Relato: "os jogadores estão ficando dentro da área e não estão marcando
ninguém". A falta de ataque dá um livre batido do fundo do campo de quem
defendia — sector `defesa`, sem `slotsMarcacao` — e os infractores ficavam onde
a jogada de ataque os tinha deixado.

`lugaresDoInfratorNaArea` (utils.js) é geometria pura: cada infractor pega no
adversário mais perto, coloca-se do lado da PRÓPRIA baliza em relação a ele, e
sai da área.

Corre com: node --test tests/falta_infrator_recua.test.js
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcUtils = semCR(fs.readFileSync(path.join(raiz, 'js', 'utils.js'), 'utf8'));
const srcShoot = semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'shooting.js'), 'utf8'));

const CAMPO_LARG = 68, CAMPO_COMP = 106, LINHA_FUNDO = CAMPO_COMP / 2;
const ALTURA_CABECA = 1.72;

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

const FreeKickModel = extrairObjecto(srcShoot, 'FreeKickModel',
    { CAMPO_COMP, CAMPO_LARG, LINHA_FUNDO, Math, ALTURA_CABECA });
const R = FreeKickModel.recuoDoInfrator;

// A grande área do jogo (js/config/physics.js), com o mesmo contrato.
const Area = {
    profundidade: 16.5, meiaLargura: 20.16,
    contem: function (x, z, ladoZ) {
        if (Math.abs(x) > this.meiaLargura) return false;
        const sinal = Math.sign(ladoZ) || 1;
        const dz = (sinal * LINHA_FUNDO - z) * sinal;
        return dz >= 0 && dz <= this.profundidade;
    }
};

const stubs = { CAMPO_COMP, CAMPO_LARG, LINHA_FUNDO, Area, FreeKickModel, Math };
const lugaresDoInfratorNaArea = new Function(...Object.keys(stubs),
    extrairFuncao(srcUtils, 'lugaresDoInfratorNaArea') + '; return lugaresDoInfratorNaArea;')
    (...Object.values(stubs));

const jog = (nome, x, z) => ({ nome: nome, role: 'mid', model: { position: { x: x, z: z } } });

/*
Cenário: quem cobra ataca para +Z, portanto a área de onde bate é a de Z = -53
e a baliza dos INFRACTORES é a de +Z. A bola está lá dentro, a 8 m da linha.
*/
const attDir = 1;
const linhaFundoCobra = -LINHA_FUNDO;
const limiteArea = linhaFundoCobra + attDir * Area.profundidade;   // -36.5
const bolaX = 2.0, bolaZ = linhaFundoCobra + attDir * 8.0;         // -45

test('os quatro números vivem no config', () => {
    for (const k of ['distanciaMarcacao', 'margemForaDaArea', 'linhaDeRecuo', 'espacamentoRecuo']) {
        assert.strictEqual(typeof R[k], 'number', `${k} em falta em FreeKickModel.recuoDoInfrator`);
    }
});

test('ninguém fica dentro da área', () => {
    // Três infractores esquecidos lá dentro, três adversários a sair a jogar.
    const infratores = [jog('i1', 1, -48), jog('i2', -5, -44), jog('i3', 8, -40)];
    const homens = [jog('a1', -12, -38), jog('a2', 10, -34), jog('a3', 0, -25)];
    const lugares = lugaresDoInfratorNaArea(bolaX, bolaZ, attDir, infratores, homens);

    assert.strictEqual(lugares.length, 3, 'todos os infractores têm de ser colocados');
    for (const l of lugares) {
        assert.ok(!Area.contem(l.x, l.z, linhaFundoCobra),
            `${l.p.nome} ficou dentro da área em (${l.x.toFixed(1)}, ${l.z.toFixed(1)})`);
    }
});

test('cada um pega um homem, e nenhum homem leva dois marcadores', () => {
    const infratores = [jog('i1', 1, -48), jog('i2', -5, -44), jog('i3', 8, -40)];
    const homens = [jog('a1', -12, -38), jog('a2', 10, -34), jog('a3', 0, -25)];
    const lugares = lugaresDoInfratorNaArea(bolaX, bolaZ, attDir, infratores, homens);

    const marcados = lugares.filter(l => l.homem).map(l => l.homem.nome);
    assert.strictEqual(marcados.length, 3, 'os três tinham homem disponível');
    assert.strictEqual(new Set(marcados).size, 3, 'dois marcadores no mesmo homem');
});

test('o marcador fica do lado da PRÓPRIA baliza do homem dele', () => {
    // Um só par, e longe da área, para nenhum limite mexer no ponto.
    const homem = jog('a1', 4, -20);
    const lugares = lugaresDoInfratorNaArea(bolaX, bolaZ, attDir, [jog('i1', 3, -22)], [homem]);
    const l = lugares[0];
    assert.strictEqual(l.homem, homem);
    assert.ok(Math.abs(l.x - homem.model.position.x) < 0.01, 'na mesma coluna do homem');
    const esperado = homem.model.position.z + attDir * R.distanciaMarcacao;
    assert.ok(Math.abs(l.z - esperado) < 0.01,
        `z ${l.z.toFixed(2)}, esperado ${esperado.toFixed(2)} (lado da baliza dos infractores)`);
    assert.ok(l.z > homem.model.position.z,
        'a marcar para +Z: é para lá que a jogada vai sair');
});

test('quem sobra sem homem forma linha à frente da área', () => {
    const infratores = [jog('i1', 1, -48), jog('i2', -5, -44), jog('i3', 8, -46)];
    const lugares = lugaresDoInfratorNaArea(bolaX, bolaZ, attDir, infratores, [jog('a1', 0, -20)]);

    const sobras = lugares.filter(l => !l.homem);
    assert.strictEqual(sobras.length, 2);
    const esperadoZ = limiteArea + attDir * R.linhaDeRecuo;
    for (const s of sobras) {
        assert.ok(Math.abs(s.z - esperadoZ) < 0.01,
            `sobra em z=${s.z.toFixed(2)}, esperado ${esperadoZ.toFixed(2)}`);
    }
    assert.ok(Math.abs(sobras[0].x - sobras[1].x) >= R.espacamentoRecuo - 0.01,
        'as sobras ficaram coladas uma à outra');
});

test('funciona na outra direcção de ataque', () => {
    const dir = -1;
    const linhaOutra = LINHA_FUNDO;
    const homem = jog('a1', 4, 20);
    const lugares = lugaresDoInfratorNaArea(-bolaX, -bolaZ, dir, [jog('i1', 3, 22)], [homem]);
    const l = lugares[0];
    assert.ok(l.z < homem.model.position.z, 'com attDir=-1 o lado da baliza é -Z');
    assert.ok(!Area.contem(l.x, l.z, linhaOutra));
});

test('sem infractores devolve lista vazia', () => {
    assert.deepStrictEqual(lugaresDoInfratorNaArea(bolaX, bolaZ, attDir, [], []), []);
});
