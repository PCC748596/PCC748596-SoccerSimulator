/*
A nota de DISTANCIA do passe.

Antes: `if (dist <= 20) baseScore = 80 + 20 * circulacao` — uma faixa PLANA
de 2 a 20 m. Um passe de 2.5 m valia exactamente o mesmo que um de 19 m, e o
desempate ficava para o bonus de "livre de marcacao" (ate +50), que o passe
curtissimo ganha quase sempre porque uma linha de 3 m e dificil de
interceptar.

Medido no jogo: 32.1% dos passes abaixo de 5 m, mediana 11.0 m. A troca de
passes de 12-18 m, a que faz o jogo girar, nao tinha vantagem nenhuma.
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
    vm.runInContext(recortarFuncao(UTILS, 'formaDistanciaPasse') + recortarFuncao(UTILS, 'notaDistanciaPasse') +
        '\nthis.nota = notaDistanciaPasse;', sandbox);
    return sandbox.nota;
}

// Estilo neutro: isola a FORMA da curva do peso do TeamPlayStyle.
const N = (nota, d) => nota(d, 1.0, 1.0);

test('o passe curtíssimo vale muito menos que o de 14 m', () => {
    const nota = montar();
    assert.ok(N(nota, 3) < N(nota, 14) * 0.6,
        '3 m=' + N(nota, 3).toFixed(0) + ' 14 m=' + N(nota, 14).toFixed(0));
});

test('a faixa de 12 a 20 m é o topo', () => {
    const nota = montar();
    const topo = N(nota, 14);
    for (const d of [12, 14, 16, 18, 20]) {
        assert.ok(N(nota, d) >= topo * 0.9, d + ' m devia estar perto do topo');
    }
    for (const d of [3, 5, 8, 30, 45]) {
        assert.ok(N(nota, d) < topo * 0.9, d + ' m nao devia estar no topo');
    }
});

test('a curva sobe entre 6 e 12 m', () => {
    const nota = montar();
    let antes = N(nota, 6);
    for (const d of [7, 9, 11, 12]) {
        const agora = N(nota, d);
        assert.ok(agora > antes, 'nao subiu de ' + d);
        antes = agora;
    }
});

test('a curva desce depois dos 22 m', () => {
    const nota = montar();
    let antes = N(nota, 22);
    for (const d of [26, 32, 40, 55]) {
        const agora = N(nota, d);
        assert.ok(agora < antes, 'nao desceu em ' + d);
        antes = agora;
    }
});

test('nunca devolve nota negativa nem zero', () => {
    const nota = montar();
    for (const d of [0, 1, 60, 100]) {
        assert.ok(N(nota, d) > 0, 'nota <= 0 em ' + d + ' m');
    }
});

test('circulação alta favorece o passe curto/médio', () => {
    const nota = montar();
    const posse = nota(12, 1.9, 0.6);
    const directo = nota(12, 0.65, 1.4);
    assert.ok(posse > directo, 'posse=' + posse.toFixed(0) + ' directo=' + directo.toFixed(0));
});

test('verticalidade alta favorece o passe longo', () => {
    const nota = montar();
    const posse = nota(35, 1.9, 0.6);
    const directo = nota(35, 0.65, 1.4);
    assert.ok(directo > posse, 'directo=' + directo.toFixed(0) + ' posse=' + posse.toFixed(0));
});
