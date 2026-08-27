/*
JOGO DE PRIMEIRA — tocar sem dominar (FirstTouchModel + `jogaDePrimeira`).

Até aqui toda a gente dominava sempre, e a seguir esperava a cadência do ramo
`Dominar` (CadenceModel.posseBase, ~3 s) antes de decidir. Um jogador de
técnica alta com um adversário em cima não faz isso: toca de primeira.

O que este teste fixa são as três condições — técnica, pressão, e o facto de
ser uma POSSIBILIDADE e não uma obrigação — mais as duas ligações no código
sem as quais a mecânica não passaria de uma constante no config.

Corre com: node --test tests/primeira_tocada.test.js
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
const srcMatch = semCR(fs.readFileSync(path.join(raiz, 'js', 'match.js'), 'utf8'));
const srcBt = semCR(fs.readFileSync(path.join(raiz, 'js', 'bt', 'player_bt.js'), 'utf8'));

function extrairObjecto(src, nome) {
    const cabeca = `const ${nome} = {`;
    const ini = src.indexOf(cabeca);
    if (ini < 0) throw new Error(`${nome} não encontrado`);
    const fim = src.indexOf(LF + '};', ini);
    return new Function(`${src.slice(ini, fim + 3)}; return ${nome};`)();
}
function extrairFuncao(src, nome) {
    const cabeca = `function ${nome}(`;
    const ini = src.indexOf(cabeca);
    if (ini < 0) throw new Error(`${nome} não encontrada`);
    const fim = src.indexOf(LF + '}', ini);
    return src.slice(ini, fim + 2);
}

const FirstTouchModel = extrairObjecto(srcConfig, 'FirstTouchModel');
const jogaDePrimeira = new Function('FirstTouchModel',
    `${extrairFuncao(srcUtils, 'jogaDePrimeira')}; return jogaDePrimeira;`)(FirstTouchModel);

// Fracção de sorteios que dão "de primeira", varrendo o intervalo todo.
function fraccao(tec, dist) {
    const N = 1000;
    let n = 0;
    for (let i = 0; i < N; i++) if (jogaDePrimeira(tec, dist, i / N)) n++;
    return n / N;
}

test('técnica abaixo do mínimo nunca joga de primeira', () => {
    for (const tec of [40, 70, 84, 84.9]) {
        assert.strictEqual(fraccao(tec, 2.0), 0, `TEC ${tec} jogou de primeira`);
    }
});

test('sem adversário perto, domina — mesmo com técnica de sobra', () => {
    for (const dist of [4.1, 6, 12, 30]) {
        assert.strictEqual(fraccao(99, dist), 0,
            `com o adversário a ${dist} m devia dominar`);
    }
    // Mesmo à distância exacta ainda é opção.
    assert.ok(fraccao(99, FirstTouchModel.distAdversario) > 0,
        'à distância limite devia continuar a ser opção');
});

test('é uma POSSIBILIDADE, não uma obrigação', () => {
    const f = fraccao(99, 2.0);
    assert.ok(f > 0.1 && f < 0.95,
        `um TEC 99 sob pressão joga de primeira ${(f * 100).toFixed(0)}% das vezes — ` +
        'isso é obrigação (ou nunca), não possibilidade');
});

test('mais técnica, mais vezes', () => {
    const noMinimo = fraccao(FirstTouchModel.tecMin, 2.0);
    const noTopo = fraccao(100, 2.0);
    assert.ok(noTopo > noMinimo + 0.15,
        `a técnica quase não muda a frequência: ${noMinimo} vs ${noTopo}`);
    assert.ok(Math.abs(noMinimo - FirstTouchModel.chanceMin) < 0.02, 'chanceMin não bate');
    assert.ok(Math.abs(noTopo - FirstTouchModel.chanceMax) < 0.02, 'chanceMax não bate');
});

test('as duas ligações existem — senão isto era só uma constante no config', () => {
    // 1. Decidido no instante do contacto, e sem gesto de domínio a seguir.
    assert.ok(srcMatch.includes('jogaDePrimeira('),
        'o resolveBallContact não chama jogaDePrimeira');
    assert.ok(srcMatch.includes('!best.jogarDePrimeira'),
        'o gesto de domínio (iniciarDominioDireito) não é saltado');

    // 2. E salta a espera de cadência do ramo `Dominar`.
    assert.ok(srcBt.includes('ctx.p.jogarDePrimeira'),
        'a árvore não consome a flag: ele tocava de primeira e ficava 3 s a pensar');
});
