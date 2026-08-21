/*
Quem intercepta é UM por equipa.

O bug: a reivindicação `bb.intercetorFrame` era feita pelo próprio jogador
dentro da condição da árvore, e só travava quem corresse DEPOIS e fosse PIOR.
Um jogador melhor a correr depois reivindicava na mesma, e o primeiro já tinha
mudado de estado nesse frame — ficavam dois em INTERCEPT, frame após frame,
porque a ordem da lista é sempre a mesma.

A escolha passou a ser colectiva (nível 1), como o chaser: escolhe-se o melhor
tempo de toda a equipa de uma vez, e a ordem deixa de contar.

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
vm.runInContext(recortarFuncao(UTILS, 'escolherIntercetor') + '\nthis.f = escolherIntercetor;', sandbox);
const escolherIntercetor = sandbox.f;

const MARGEM = 0.3;

test('sem candidatos não há intercetor', () => {
    assert.strictEqual(escolherIntercetor([], Infinity, MARGEM), null);
});

test('escolhe o de menor tempo, não o primeiro da lista', () => {
    const a = { id: 'a' }, b = { id: 'b' }, c = { id: 'c' };
    const lista = [{ p: a, t: 1.2 }, { p: b, t: 0.4 }, { p: c, t: 0.9 }];
    assert.strictEqual(escolherIntercetor(lista, Infinity, MARGEM), b);
});

test('a ordem da lista não altera a escolha', () => {
    const a = { id: 'a' }, b = { id: 'b' };
    const l1 = [{ p: a, t: 1.0 }, { p: b, t: 0.5 }];
    const l2 = [{ p: b, t: 0.5 }, { p: a, t: 1.0 }];
    assert.strictEqual(escolherIntercetor(l1, Infinity, MARGEM), escolherIntercetor(l2, Infinity, MARGEM));
});

test('ninguém intercepta se quem já vai lá chega igual ou antes', () => {
    const a = { id: 'a' };
    // Chaser chega a 0.8; o melhor candidato a 0.6 não bate a margem de 0.3.
    assert.strictEqual(escolherIntercetor([{ p: a, t: 0.6 }], 0.8, MARGEM), null);
});

test('intercepta quem bate quem já vai lá pela margem inteira', () => {
    const a = { id: 'a' };
    assert.strictEqual(escolherIntercetor([{ p: a, t: 0.4 }], 0.8, MARGEM), a);
});

test('empate exacto no tempo devolve sempre o mesmo, não alterna', () => {
    const a = { id: 'a' }, b = { id: 'b' };
    const l1 = [{ p: a, t: 0.5 }, { p: b, t: 0.5 }];
    const l2 = [{ p: b, t: 0.5 }, { p: a, t: 0.5 }];
    // Desempate estável pela ordem dada: o primeiro da lista ganha, e a lista
    // da equipa não muda de ordem entre frames.
    assert.strictEqual(escolherIntercetor(l1, Infinity, MARGEM), a);
    assert.strictEqual(escolherIntercetor(l2, Infinity, MARGEM), b);
});
