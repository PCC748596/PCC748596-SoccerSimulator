/*
O Setor do campo tem de mandar na LARGURA da equipa, nao so na escolha do
passe e da conducao.

Medido antes desta mudanca: 32.3 m de largura com esq+dir, 32.3 m com cen,
31.2 m com esq — ou seja, o botao nao mexia um centimetro em quem estava
onde. `Tatics.setores` era lido em dois sitios (player.js findPassTarget e
o CARRY na fsm.js) e nenhum deles posiciona ninguem.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const CONFIG = fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8');

function recortarFuncao(src, nome) {
    const i = src.indexOf('function ' + nome + '(');
    assert.ok(i >= 0, 'function ' + nome + ' nao encontrada');
    let nivel = 0;
    for (let k = src.indexOf('{', i); k < src.length; k++) {
        if (src[k] === '{') nivel++;
        else if (src[k] === '}' && --nivel === 0) return src.slice(i, k + 1);
    }
    assert.fail('chavetas desequilibradas em ' + nome);
}

function montar() {
    const sandbox = { Math: Math };
    vm.createContext(sandbox);
    vm.runInContext(recortarFuncao(CONFIG, 'fechoDoSector') +
        '\nthis.fecho = fechoDoSector;', sandbox);
    return sandbox.fecho;
}

test('so os flancos: a equipa abre', () => {
    const fecho = montar();
    assert.ok(fecho(['esq', 'dir']) > 1.0, 'devia alargar');
});

test('so o centro: a equipa fecha', () => {
    const fecho = montar();
    assert.ok(fecho(['cen']) < 1.0, 'devia estreitar');
});

test('os tres sectores ligados é o neutro', () => {
    const fecho = montar();
    assert.strictEqual(fecho(['esq', 'cen', 'dir']), 1.0);
});

test('um flanco só ainda abre, mas menos do que os dois', () => {
    const fecho = montar();
    const um = fecho(['esq']);
    const dois = fecho(['esq', 'dir']);
    assert.ok(um > 1.0, 'um flanco devia alargar');
    assert.ok(um < dois, 'um flanco devia alargar menos que dois: ' + um + ' vs ' + dois);
});

test('flanco com centro fica entre o neutro e os flancos sós', () => {
    const fecho = montar();
    const misto = fecho(['esq', 'cen']);
    assert.ok(misto >= 1.0 && misto < fecho(['esq']), 'misto=' + misto);
});

test('lista vazia ou inválida não rebenta nem estreita', () => {
    const fecho = montar();
    assert.strictEqual(fecho([]), 1.0);
    assert.strictEqual(fecho(null), 1.0);
});
