/*
Geometria do canto: onde fica a bola, onde fica quem bate e para onde ele
olha. Regras que se viam mal no ecrã — a bola fora do chão e o batedor DENTRO
do campo, de costas para a área.

A função vive em js/config.js (script de browser, sem exports), por isso é
recortada do ficheiro e avaliada num sandbox.
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
    vm.runInContext(
        'const CAMPO_LARG = 68; const CAMPO_COMP = 106;\n' +
        'const BallPhysics = { raio: 0.11 };\n' +
        recortarFuncao(CONFIG, 'pontoDeCanto') + '\n' +
        'this.pontoDeCanto = pontoDeCanto;', sandbox);
    return sandbox.pontoDeCanto;
}

const MEIA_LARG = 34;   // CAMPO_LARG / 2
const MEIO_COMP = 53;   // CAMPO_COMP / 2

test('a bola fica na quina do lado por onde saiu, dentro das linhas', () => {
    const canto = montar();
    for (const bolaX of [12, -12]) {
        for (const attDir of [1, -1]) {
            const c = canto(bolaX, attDir);
            assert.strictEqual(Math.sign(c.bola.x), Math.sign(bolaX), 'lado errado');
            assert.strictEqual(Math.sign(c.bola.z), attDir, 'linha de fundo errada');
            assert.ok(Math.abs(c.bola.x) <= MEIA_LARG, 'bola fora da linha lateral');
            assert.ok(Math.abs(c.bola.z) <= MEIO_COMP, 'bola fora da linha de fundo');
            assert.ok(Math.abs(c.bola.x) > MEIA_LARG - 1.5, 'bola longe da quina');
            assert.ok(Math.abs(c.bola.z) > MEIO_COMP - 1.5, 'bola longe da quina');
        }
    }
});

test('a bola fica no chão', () => {
    const canto = montar();
    assert.strictEqual(canto(12, 1).bola.y, 0.11);
});

test('quem bate fica FORA do campo', () => {
    const canto = montar();
    for (const bolaX of [12, -12]) {
        for (const attDir of [1, -1]) {
            const c = canto(bolaX, attDir);
            const fora = Math.abs(c.batedor.x) > MEIA_LARG ||
                         Math.abs(c.batedor.z) > MEIO_COMP;
            assert.ok(fora, 'batedor dentro do campo: ' +
                JSON.stringify(c.batedor));
        }
    }
});

test('a bola fica ENTRE quem bate e a área', () => {
    const canto = montar();
    for (const bolaX of [12, -12]) {
        for (const attDir of [1, -1]) {
            const c = canto(bolaX, attDir);
            const dBatedor = Math.hypot(c.alvo.x - c.batedor.x, c.alvo.z - c.batedor.z);
            const dBola = Math.hypot(c.alvo.x - c.bola.x, c.alvo.z - c.bola.z);
            assert.ok(dBatedor > dBola,
                'o batedor devia estar mais longe da área do que a bola');
        }
    }
});

test('quem bate fica ao pé da bola', () => {
    const canto = montar();
    const c = canto(12, 1);
    const d = Math.hypot(c.batedor.x - c.bola.x, c.batedor.z - c.bola.z);
    assert.ok(d > 0.8 && d < 3.0, 'distância à bola fora do razoável: ' + d);
});

test('o alvo é dentro do campo, à frente da baliza atacada', () => {
    const canto = montar();
    for (const attDir of [1, -1]) {
        const c = canto(12, attDir);
        assert.strictEqual(Math.sign(c.alvo.z), attDir);
        assert.ok(Math.abs(c.alvo.z) < MEIO_COMP, 'alvo atrás da linha de fundo');
        assert.ok(Math.abs(c.alvo.z) > MEIO_COMP - 20, 'alvo longe demais da baliza');
    }
});
