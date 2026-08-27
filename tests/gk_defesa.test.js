/*
DEFESA DO GUARDA-REDES — agarrar, espalmar ou roçar.

Antes eram três fórmulas em três ramos, com bases e declives diferentes, e uma
quarta situação (bola ao corpo) que agarrava sempre. Nenhuma sabia a que
velocidade a bola vinha, nem se a mão estava ao peito ou na ponta dos dedos, e
o rebote saía sempre numa direcção aleatória — por isso não havia rebotes de
jogo nem espalmadas deliberadas para canto.

Este teste fixa a fórmula única (`resolverDefesaGK` em utils.js, constantes em
GkCatchModel) e, sobretudo, a CALIBRAÇÃO: guarda-redes médio contra remate
médio, ~65% de bolas agarradas. É o número que o resto se pendura.

Corre com: node --test tests/gk_defesa.test.js
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcConfig = semCR(fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8'));
const srcUtils = semCR(fs.readFileSync(path.join(raiz, 'js', 'utils.js'), 'utf8'));

function extrairObjecto(src, nome) {
    const cabeca = `const ${nome} = {`;
    const ini = src.indexOf(cabeca);
    if (ini < 0) throw new Error(`${nome} não encontrado em js/config.js`);
    const fim = src.indexOf(LF + '};', ini);
    return new Function(`${src.slice(ini, fim + 3)}; return ${nome};`)();
}

function extrairFuncao(src, nome) {
    const cabeca = `function ${nome}(`;
    const ini = src.indexOf(cabeca);
    if (ini < 0) throw new Error(`${nome} não encontrada em js/utils.js`);
    const fim = src.indexOf(LF + '}', ini);
    return src.slice(ini, fim + 2);
}

const GkCatchModel = extrairObjecto(srcConfig, 'GkCatchModel');
const nomes = ['resolverDefesaGK', 'qualidadeEspalmada', 'destinoDaEspalmada'];
const codigo = nomes.map(n => extrairFuncao(srcUtils, n)).join(LF + LF);
const { resolverDefesaGK, qualidadeEspalmada, destinoDaEspalmada } =
    new Function('GkCatchModel', `${codigo}; return { ${nomes.join(', ')} };`)(GkCatchModel);

const TIPOS = ['corpo', 'maos', 'salto', 'mergulho'];

// Probabilidade de agarrar, sem sortear (o `rnd` não entra no cálculo dela).
const pAgarra = (o) => resolverDefesaGK(Object.assign({ rnd: 0 }, o)).pAgarra;

/* ---- calibração --------------------------------------------------------- */

test('GK médio contra remate médio: ~65% de bolas agarradas', () => {
    /*
    "Remate médio" é v = vRef com o braço a meio do alcance — nem a bola ao
    peito nem na ponta dos dedos. A média é sobre os quatro tipos de defesa,
    que é o que se vê ao longo de um jogo.
    */
    const ps = TIPOS.map(tipo => pAgarra({
        tipo: tipo, gk: 50, tec: 50,
        vChegada: GkCatchModel.vRef, extensao: 0.5, altura: 0
    }));
    const media = ps.reduce((a, b) => a + b, 0) / ps.length;

    console.log('  agarra (GK 50, TEC 50, v=vRef, ext 0.5): ' +
        TIPOS.map((t, i) => `${t} ${(ps[i] * 100).toFixed(0)}%`).join('  ') +
        `  |  média ${(media * 100).toFixed(1)}%`);

    assert.ok(media > 0.60 && media < 0.70,
        `média fora da faixa pedida (60-70%): ${(media * 100).toFixed(1)}%`);
});

test('a ordem dos tipos é a que faz sentido', () => {
    const p = (tipo) => pAgarra({
        tipo: tipo, gk: 50, tec: 50, vChegada: GkCatchModel.vRef, extensao: 0.5
    });
    assert.ok(p('corpo') > p('maos'), 'ao corpo tinha de ser mais fácil que de pé');
    assert.ok(p('maos') > p('salto'), 'de pé tinha de ser mais fácil que em salto');
    assert.ok(p('salto') > p('mergulho'), 'em salto tinha de ser mais fácil que esticado');
});

/* ---- as variáveis que faltavam ------------------------------------------ */

test('a velocidade da bola conta — e era isso que não existia', () => {
    const lento = pAgarra({ tipo: 'maos', gk: 50, tec: 50, vChegada: 8, extensao: 0.3 });
    const rapido = pAgarra({ tipo: 'maos', gk: 50, tec: 50, vChegada: 28, extensao: 0.3 });
    assert.ok(lento > rapido + 0.15,
        `a velocidade quase não pesa: ${lento.toFixed(2)} vs ${rapido.toFixed(2)}`);
});

test('a extensão do braço conta: a ponta dos dedos não segura', () => {
    const aoPeito = pAgarra({ tipo: 'mergulho', gk: 50, tec: 50, vChegada: 18, extensao: 0 });
    const naPonta = pAgarra({ tipo: 'mergulho', gk: 50, tec: 50, vChegada: 18, extensao: 1 });
    assert.ok(aoPeito > naPonta + 0.3,
        `a extensão quase não pesa: ${aoPeito.toFixed(2)} vs ${naPonta.toFixed(2)}`);
});

test('GK pesa mais do que TEC, e as duas pesam', () => {
    const base = { tipo: 'maos', vChegada: 18, extensao: 0.5 };
    const gkAlto = pAgarra(Object.assign({ gk: 90, tec: 50 }, base));
    const tecAlto = pAgarra(Object.assign({ gk: 50, tec: 90 }, base));
    const medio = pAgarra(Object.assign({ gk: 50, tec: 50 }, base));

    assert.ok(gkAlto > medio, 'GK alto não ajuda');
    assert.ok(tecAlto > medio, 'TEC alta não ajuda');
    assert.ok(gkAlto - medio > (tecAlto - medio) * 1.5,
        'GK tinha de pesar bem mais do que a TEC');
});

test('nunca é certo nem impossível', () => {
    const impossivel = pAgarra({ tipo: 'mergulho', gk: 1, tec: 1, vChegada: 40, extensao: 1, altura: 1.5 });
    const trivial = pAgarra({ tipo: 'corpo', gk: 99, tec: 99, vChegada: 2, extensao: 0 });
    assert.ok(impossivel >= GkCatchModel.minAgarra - 1e-9, 'abaixo do piso');
    assert.ok(trivial <= GkCatchModel.maxAgarra + 1e-9, 'acima do tecto');
});

/* ---- o terceiro resultado ----------------------------------------------- */

test('roçar só aparece em bolas rápidas e esticadas', () => {
    const manso = resolverDefesaGK({
        tipo: 'maos', gk: 50, tec: 50, vChegada: 10, extensao: 0.2, rnd: 0.999
    });
    assert.strictEqual(manso.pRoca, 0, 'uma bola lenta ao corpo não se roça');

    const tiro = resolverDefesaGK({
        tipo: 'mergulho', gk: 50, tec: 50, vChegada: 28, extensao: 1.0, rnd: 0.999
    });
    assert.ok(tiro.pRoca > 0.1, `roçar quase nunca acontece: ${tiro.pRoca.toFixed(3)}`);
    assert.strictEqual(tiro.resultado, 'roca', 'com rnd no topo tinha de sair roçar');

    // Um guarda-redes melhor transforma roçares em espalmadas.
    const bom = resolverDefesaGK({
        tipo: 'mergulho', gk: 90, tec: 50, vChegada: 28, extensao: 1.0, rnd: 0.999
    });
    assert.ok(bom.pRoca < tiro.pRoca, 'o GK não reduz o roçar');
});

test('os três resultados somam 1 e nenhum desaparece por arredondamento', () => {
    for (const tipo of TIPOS) {
        for (const v of [6, 18, 30]) {
            for (const ext of [0, 0.5, 1]) {
                const r = resolverDefesaGK({ tipo, gk: 50, tec: 50, vChegada: v, extensao: ext, rnd: 0 });
                const pEspalma = 1 - r.pAgarra - r.pRoca;
                assert.ok(pEspalma >= -1e-9,
                    `${tipo} v=${v} ext=${ext}: probabilidades somam mais de 1`);
            }
        }
    }
});

/* ---- para onde vai a espalmada ------------------------------------------ */

test('a técnica decide o destino do rebote', () => {
    const bom = qualidadeEspalmada(90), mau = qualidadeEspalmada(20);
    assert.ok(bom > mau + 0.3, `a TEC quase não muda a qualidade: ${mau} vs ${bom}`);

    // Varre o sorteio inteiro e conta os destinos, com a bola colocada (podeSair).
    const conta = (qualidade) => {
        const c = { canto: 0, lateral: 0, meio: 0 };
        for (let i = 0; i < 1000; i++) {
            c[destinoDaEspalmada({ qualidade, podeSair: true, rnd: i / 1000 })]++;
        }
        return c;
    };
    const cBom = conta(bom), cMau = conta(mau);

    assert.ok(cBom.canto > cMau.canto * 2,
        `técnica alta não manda mais para canto: ${cBom.canto} vs ${cMau.canto}`);
    assert.ok(cMau.meio > cBom.meio * 2,
        `técnica fraca não deixa mais rebotes ao meio: ${cMau.meio} vs ${cBom.meio}`);
    // E o rebote ao meio TEM de existir — é o caso que faltava no jogo.
    assert.ok(cMau.meio > 100, 'nunca há rebote para o meio da área');
});

test('bola ao centro do peito não vai para canto', () => {
    // `podeSair` falso: não se manda ao canto uma bola que vem ao meio.
    for (let i = 0; i < 200; i++) {
        const d = destinoDaEspalmada({ qualidade: 0.95, podeSair: false, rnd: i / 200 });
        assert.notStrictEqual(d, 'canto', 'saiu para canto sem estar colocada');
    }
});
