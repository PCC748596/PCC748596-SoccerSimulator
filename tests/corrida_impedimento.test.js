/*
Corrida ao espaço vs. linha de fora-de-jogo.

O destino da corrida era cortado pela linha UMA VEZ, no instante em que a
corrida arrancava (destinoDeCorrida), e depois a corrida ficava fixa
`RunIntoSpaceModel.duracao` segundos (4 s). Nesses 4 s a linha move-se — a
última linha adversária sobe, ou a bola avança — e o jogador continuava a
correr para um ponto que já era ilegal.

`avancoLegalDeCorrida` é o corte, agora partilhado entre a escolha do destino
e a revalidação por frame.
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
vm.runInContext(recortarFuncao(UTILS, 'avancoLegalDeCorrida') + '\nthis.f = avancoLegalDeCorrida;', sandbox);
const avancoLegal = sandbox.f;

test('sem linha publicada não há corte', () => {
    assert.strictEqual(avancoLegal(30, null), 30);
    assert.strictEqual(avancoLegal(30, undefined), 30);
});

test('aquém da linha o destino fica intacto', () => {
    assert.strictEqual(avancoLegal(20, 30), 20);
});

test('além da linha o destino é puxado para trás dela, com margem', () => {
    // Margem de 0.5 m: o destino fica meio metro aquém da linha.
    assert.strictEqual(avancoLegal(35, 30), 29.5);
});

test('em cima da linha também é cortado — a margem existe para isso', () => {
    assert.strictEqual(avancoLegal(30, 30), 29.5);
});

test('a linha a recuar puxa o destino com ela', () => {
    // Mesma corrida, revalidada dois frames depois com a linha 10 m atrás.
    assert.strictEqual(avancoLegal(35, 40), 35);
    assert.strictEqual(avancoLegal(35, 30), 29.5);
});
