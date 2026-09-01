/*
O JOGADOR QUE VIBRAVA NO LUGAR À ESPERA DA BOLA.

O `animateBones` troca de ramo aos 0.1 m/s: abaixo escreve a pose neutra com
lerp, acima escreve a passada INTEIRA com `set` directo. Quem espera um passe
anda à volta desse limiar o tempo todo — medido, 14.8 travessias por
jogador-minuto com o jogador praticamente quieto.

Isso só por si não se veria. O que o tornava visível era o
`misturarAndamento`: abaixo de `andar.vel` devolvia o andar INTEIRO, com a coxa
a oscilar 22.9 graus a 0.05 m/s exactamente como a 1.8 m/s. Atravessar o limiar
era saltar entre uma passada completa e estar de pé.

Duas correcções:

  1. `GaitModel.parado` — a amplitude decai até zero com a velocidade, e no
     limiar a passada vale 1.4 graus em vez de 22.9;
  2. `aplicarPosePassada` aceita `suavizacao` — perto do limiar a pose entra por
     lerp em vez de `set`, para os dois ramos deixarem de puxar a perna em
     sentidos contrários. A correr continua escrita directa.

Medido (inversões de sentido da coxa em jogadores quietos):

                                 antes     agora
    frames com inversão          2.50%     0.65%
    amplitude mediana             3.59°     0.91°
    amplitude p95                17.75°     3.58°

Ferramentas: tools/headless/vibracao.js e vibracao_pose.js

Corre com: node --test tests/vibracao_parado.test.js
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const src = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const srcGait = src('js/config/gait.js');
const srcUtils = src('js/utils.js');
const srcPose = src('js/pose.js');
const srcPlayer = src('js/player.js');

function extrairObjecto(s, nome) {
    const ini = s.indexOf('const ' + nome + ' = {');
    assert.ok(ini > 0, nome + ' não encontrado');
    const fim = s.indexOf(LF + '};', ini);
    return new Function(s.slice(ini, fim + 3) + '; return ' + nome + ';')();
}
function extrairFuncao(s, nome) {
    const ini = s.indexOf('function ' + nome + '(');
    assert.ok(ini > 0, nome + ' não encontrada');
    const fim = s.indexOf(LF + '}', ini);
    return s.slice(ini, fim + 2);
}

const GaitModel = extrairObjecto(srcGait, 'GaitModel');
const lerp = (a, b, k) => a + (b - a) * k;
const misturarAndamento = new Function('GaitModel', 'lerp',
    extrairFuncao(srcUtils, 'misturarAndamento') + '; return misturarAndamento;')(GaitModel, lerp);

const graus = r => r * 180 / Math.PI;

test('existe um extremo PARADO na mistura de andamentos', () => {
    assert.ok(GaitModel.parado, 'GaitModel.parado desapareceu');
    assert.strictEqual(GaitModel.parado.anca, 0, 'parado com a coxa a oscilar não é parado');
    assert.strictEqual(GaitModel.parado.joelhoOscila, 0);
    assert.strictEqual(GaitModel.parado.ressalto, 0);
    assert.ok(GaitModel.parado.passada > 0,
        'a passada NÃO pode ir a zero: é ela que divide a cadência (vel*dt/passada)');
});

test('a amplitude da passada decai com a velocidade até zero', () => {
    assert.strictEqual(misturarAndamento(0).anca, 0, 'parado tem de ter amplitude zero');

    // Monótona: mais velocidade, mais amplitude.
    let ant = -1;
    for (const v of [0, 0.1, 0.3, 0.6, 1.0, 1.4, 1.8]) {
        const a = misturarAndamento(v).anca;
        assert.ok(a >= ant, 'a amplitude tem de crescer com a velocidade');
        ant = a;
    }
});

test('no limiar dos 0.1 m/s a passada é invisível', () => {
    /*
    É este o número que causava a vibração: no limiar em que o animateBones
    troca de ramo, a passada valia os mesmos 22.9 graus do andar.
    */
    const noLimiar = graus(misturarAndamento(0.1).anca);
    assert.ok(noLimiar < 3.0,
        'no limiar a coxa oscila ' + noLimiar.toFixed(1) + ' graus — volta a ver-se o salto');
});

test('andar e correr não mudaram', () => {
    assert.ok(Math.abs(misturarAndamento(GaitModel.andar.vel).anca - GaitModel.andar.anca) < 1e-9,
        'à velocidade de andar a passada tem de ser exactamente a do andar');
    assert.ok(Math.abs(misturarAndamento(GaitModel.trote.vel).anca - GaitModel.trote.anca) < 1e-9);
    assert.ok(Math.abs(misturarAndamento(GaitModel.correr.vel).anca - GaitModel.correr.anca) < 1e-9);
    assert.ok(Math.abs(misturarAndamento(99).anca - GaitModel.correr.anca) < 1e-9,
        'acima do correr continua a saturar no correr');
});

test('a passada entra por lerp perto do limiar e por set a correr', () => {
    const corpo = srcPose.slice(srcPose.indexOf('function aplicarPosePassada('));
    const ate = corpo.slice(0, corpo.indexOf('function ', 10));
    assert.ok(/suavizacao/.test(ate),
        'o aplicarPosePassada deixou de aceitar suavização: os dois ramos voltam a puxar a perna em sentidos contrários');
    assert.ok(/sv >= 1/.test(ate),
        'sem o caminho directo, a passada a correr passa a ser lerp e fica mole');

    assert.ok(/suavizacao: Math\.min\(1, speed \/ /.test(srcPlayer),
        'o animateBones deixou de passar a suavização em função da velocidade');
});
