/*
Graça de condução (carryTouchGrace): a janela entre o toque à frente e o
portador voltar a tocar a bola. Enquanto ela corre, o BT continua a tratá-lo
como quem tem a bola (temBola em player_bt.js).

O que estes testes fixam: a graça morre no instante em que a bola passa a ser
de outro. Sem isso ficam DOIS jogadores em CARRY ao mesmo tempo — o novo
portador, porque tem mesmo a bola, e o antigo, porque a graça ainda não
expirou.

Corre a função real de utils.js num sandbox (é global de browser).
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const UTILS = fs.readFileSync(path.join(raiz, 'js', 'utils.js'), 'utf8');

function recortarFuncao(src, nome) {
    const i = src.indexOf('function ' + nome + '(');
    assert.ok(i >= 0, 'funcao ' + nome + ' nao encontrada em utils.js');
    let nivel = 0;
    for (let k = src.indexOf('{', i); k < src.length; k++) {
        if (src[k] === '{') nivel++;
        else if (src[k] === '}' && --nivel === 0) return src.slice(i, k + 1);
    }
    assert.fail('chavetas desequilibradas em ' + nome);
}

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(recortarFuncao(UTILS, 'graceDeConducao') + '\nthis.g = graceDeConducao;', sandbox);
const graceDeConducao = sandbox.g;

test('com a bola no pé não há graça nenhuma a correr', () => {
    assert.strictEqual(graceDeConducao(true, 1.5, false, 0.016), 0);
});

test('a graça desconta o tempo enquanto a bola continua a ser dele', () => {
    assert.ok(Math.abs(graceDeConducao(false, 1.0, false, 0.25) - 0.75) < 1e-9);
});

test('a graça não desce abaixo de zero', () => {
    assert.strictEqual(graceDeConducao(false, 0.1, false, 0.5), 0);
});

test('a graça morre assim que a bola passa a ser de outro jogador', () => {
    assert.strictEqual(graceDeConducao(false, 2.5, true, 0.016), 0);
});

test('sem graça e sem bola continua a zero', () => {
    assert.strictEqual(graceDeConducao(false, 0, false, 0.016), 0);
});
