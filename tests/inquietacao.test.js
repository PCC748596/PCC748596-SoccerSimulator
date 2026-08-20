/*
Micro-movimento nos alvos: quem chega ao slot não fica estátua. A parte pura
vive em js/config.js (script de browser, sem exports), por isso é recortada do
ficheiro e avaliada num sandbox.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const CONFIG = fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8');

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

function montar() {
    const sandbox = { Math: Math };
    vm.createContext(sandbox);
    vm.runInContext(
        recortarConst(CONFIG, 'RestlessModel') + '\n' +
        recortarFuncao(CONFIG, 'offsetInquietacao') + '\n' +
        'this.R = RestlessModel; this.offset = offsetInquietacao;', sandbox);
    return sandbox;
}

test('as constantes da inquietação existem e são coerentes', () => {
    const s = montar();
    for (const k of ['raio', 'limiarChegada', 'intervaloMin', 'intervaloMax']) {
        assert.strictEqual(typeof s.R[k], 'number', k + ' em falta');
        assert.ok(s.R[k] > 0, k + ' devia ser positivo');
    }
    assert.ok(s.R.intervaloMin < s.R.intervaloMax,
        'o intervalo mínimo tem de ser menor que o máximo');
});

test('o raio é os 2 metros pedidos', () => {
    const s = montar();
    assert.strictEqual(s.R.raio, 2.0);
});

test('o offset nunca passa do raio pedido', () => {
    const s = montar();
    for (const raio of [0.5, 1.0, 2.0, s.R.raio]) {
        for (let a = 0; a < Math.PI * 2; a += 0.1) {
            const o = s.offset(a, raio);
            const d = Math.hypot(o.x, o.z);
            assert.ok(d <= raio + 1e-9, 'ângulo ' + a + ' deu ' + d);
        }
    }
});

test('com raio zero não se mexe nada', () => {
    const s = montar();
    const o = s.offset(1.234, 0);
    assert.strictEqual(o.x, 0);
    assert.strictEqual(o.z, 0);
});

test('o offset cobre os quatro quadrantes', () => {
    const s = montar();
    const vistos = new Set();
    for (let a = 0; a < Math.PI * 2; a += 0.05) {
        const o = s.offset(a, 2.0);
        if (Math.abs(o.x) < 1e-6 || Math.abs(o.z) < 1e-6) continue;
        vistos.add((o.x > 0 ? 'D' : 'E') + (o.z > 0 ? 'F' : 'T'));
    }
    assert.strictEqual(vistos.size, 4, 'só saíram ' + [...vistos].join(', '));
});

test('a volta completa devolve ao mesmo sítio', () => {
    const s = montar();
    const a = s.offset(0.7, 2.0);
    const b = s.offset(0.7 + Math.PI * 2, 2.0);
    assert.ok(Math.abs(a.x - b.x) < 1e-9, 'x: ' + a.x + ' vs ' + b.x);
    assert.ok(Math.abs(a.z - b.z) < 1e-9, 'z: ' + a.z + ' vs ' + b.z);
});

test('ângulos opostos dão offsets opostos', () => {
    const s = montar();
    const a = s.offset(0.4, 2.0);
    const b = s.offset(0.4 + Math.PI, 2.0);
    assert.ok(Math.abs(a.x + b.x) < 1e-9, 'x não é simétrico');
    assert.ok(Math.abs(a.z + b.z) < 1e-9, 'z não é simétrico');
});
