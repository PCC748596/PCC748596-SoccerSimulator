/*
Exclusividade da marcação: dois companheiros nunca acompanham o MESMO
adversário. Sem isto, `pontoDeMarcacao` mapeia esse adversário para UM ponto e
os dois marcadores caminham para a mesma coordenada — foi assim que o RM e o CM
se sobrepunham com a bola na ala oposta.

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
    const sandbox = { Math: Math, Set: Set, Array: Array };
    vm.createContext(sandbox);
    vm.runInContext(recortarFuncao(CONFIG, 'atribuirMarcacoes') +
        '\nthis.atribuirMarcacoes = atribuirMarcacoes;', sandbox);
    return sandbox.atribuirMarcacoes;
}

function adversario(nome, x, z) {
    return { nome: nome, role: 'mid', model: { position: { x: x, z: z } } };
}

test('um adversário só é acompanhado por um marcador', () => {
    const atribuir = montar();
    const alvo = adversario('CF', 0, 10);
    const escolha = atribuir(
        [{ x: -3, z: 8 }, { x: 3, z: 8 }],   // RM e CM, ambos com o alvo no setor
        [alvo], 12);
    const ficaram = escolha.filter(o => o === alvo);
    assert.strictEqual(ficaram.length, 1, 'os dois agarraram o mesmo homem');
});

test('o mais perto fica com o homem', () => {
    const atribuir = montar();
    const alvo = adversario('CF', 0, 10);
    const escolha = atribuir([{ x: -9, z: 8 }, { x: 1, z: 10 }], [alvo], 12);
    assert.strictEqual(escolha[0], null);
    assert.strictEqual(escolha[1], alvo);
});

test('dois adversários, dois marcadores: um para cada', () => {
    const atribuir = montar();
    const a = adversario('CF9', -6, 10);
    const b = adversario('CF19', 6, 10);
    const escolha = atribuir([{ x: -5, z: 8 }, { x: 5, z: 8 }], [a, b], 12);
    assert.strictEqual(escolha[0], a);
    assert.strictEqual(escolha[1], b);
});

test('fora do raio ninguém é acompanhado', () => {
    const atribuir = montar();
    const escolha = atribuir([{ x: 0, z: 0 }], [adversario('CF', 0, 40)], 12);
    assert.strictEqual(escolha[0], null);
});

test('o guarda-redes adversário não se acompanha', () => {
    const atribuir = montar();
    const gk = adversario('GK', 0, 2);
    gk.role = 'gk';
    assert.strictEqual(atribuir([{ x: 0, z: 0 }], [gk], 12)[0], null);
});

test('histerese: quem mantém a referência não a perde para um companheiro', () => {
    const atribuir = montar();
    const alvo = adversario('CF', 0, 10);
    // O segundo marcador está MAIS PERTO, mas o primeiro já o acompanhava.
    const escolha = atribuir(
        [{ x: -6, z: 8, manter: true, ref: alvo }, { x: 0, z: 9 }],
        [alvo], 12);
    assert.strictEqual(escolha[0], alvo);
    assert.strictEqual(escolha[1], null);
});

test('referência que saiu do campo não se mantém', () => {
    const atribuir = montar();
    const fora = adversario('CF', 0, 10);
    const escolha = atribuir([{ x: 0, z: 8, manter: true, ref: fora }], [], 12);
    assert.strictEqual(escolha[0], null);
});
