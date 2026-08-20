/*
Forma do passe normal: até 15 m vai SEMPRE rasteiro, seja qual for o sorteio e
seja qual for o estilo de passe. Corre a função real de utils.js num sandbox —
é uma global de browser, por isso é recortada do ficheiro em vez de importada.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const CONFIG = fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8');
const UTILS = fs.readFileSync(path.join(raiz, 'js', 'utils.js'), 'utf8');

function recortarConst(src, nome) {
    const i = src.indexOf('const ' + nome + ' = {');
    assert.ok(i >= 0, 'const ' + nome + ' nao encontrado');
    let nivel = 0;
    for (let k = src.indexOf('{', i); k < src.length; k++) {
        if (src[k] === '{') nivel++;
        else if (src[k] === '}' && --nivel === 0) return src.slice(i, k + 1) + ';';
    }
    assert.fail('chavetas desequilibradas em ' + nome);
}

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

// PassModel é grande e cheio de dependências; só interessa o sub-objecto do
// arco, por isso monta-se um PassModel mínimo com esse pedaço real.
function extrairPasseArco() {
    const i = CONFIG.indexOf('    passeArco: {');
    assert.ok(i >= 0, 'passeArco nao encontrado');
    let nivel = 0;
    for (let k = CONFIG.indexOf('{', i); k < CONFIG.length; k++) {
        if (CONFIG[k] === '{') nivel++;
        else if (CONFIG[k] === '}' && --nivel === 0) {
            return 'const PassModel = { ' + CONFIG.slice(i, k + 1) + ' };';
        }
    }
    assert.fail('chavetas desequilibradas em passeArco');
}

function montar(valorAleatorio) {
    const sandbox = {
        Math: Object.create(Math),
        // resolverElevacaoPasse só usa MathUtils.clamp, no ramo dos 30m+.
        THREE: { MathUtils: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) } }
    };
    sandbox.Math.random = () => valorAleatorio;
    vm.createContext(sandbox);
    vm.runInContext(
        extrairPasseArco() + '\n' +
        recortarFuncao(UTILS, 'resolverElevacaoPasse') + '\n' +
        'this.elev = resolverElevacaoPasse; this.B = PassModel.passeArco;', sandbox);
    return sandbox;
}

test('o corte do rasteiro está nos 15 m', () => {
    const s = montar(0);
    assert.strictEqual(s.B.rasteiroMax, 15.0);
});

test('até 15 m é sempre rasteiro, com qualquer sorteio', () => {
    // random = 0 é o caso que MAIS favorece o arco (0 < chanceArco).
    for (const r of [0, 0.25, 0.49, 0.5, 0.99]) {
        const s = montar(r);
        for (const d of [0.5, 3, 5, 8, 12, 14.9, 15]) {
            assert.strictEqual(s.elev(d, false), null,
                'd=' + d + ' m com random=' + r + ' devia ser rasteiro');
        }
    }
});

test('até 15 m nem o estilo "longo" levanta a bola', () => {
    const s = montar(0);
    for (const d of [3, 8, 12, 15]) {
        assert.strictEqual(s.elev(d, true), null,
            'd=' + d + ' m com forcarArco devia continuar rasteiro');
    }
});

test('acima de 15 m o arco volta a ser possível', () => {
    const s = montar(0);   // random = 0 < chanceArco, portanto sorteia arco
    const e = s.elev(18, false);
    assert.ok(e !== null, 'a 18 m com random=0 devia sair arco');
    assert.ok(e > 0 && e < Math.PI / 2, 'elevação fora do intervalo: ' + e);
});

test('acima de 15 m o sorteio ainda pode dar rasteiro', () => {
    const s = montar(0.99);   // random >= chanceArco, portanto rasteiro
    assert.strictEqual(s.elev(18, false), null);
});

test('o estilo "longo" força o arco acima dos 15 m', () => {
    const s = montar(0.99);   // sorteio que daria rasteiro
    assert.ok(s.elev(18, true) !== null, 'forcarArco devia ignorar o sorteio');
});
