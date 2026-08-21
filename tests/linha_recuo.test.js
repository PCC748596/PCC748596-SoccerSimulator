/*
Traseira do bloco a defender: até onde a última linha recua.

O que estes testes fixam: o limite à frente do guarda-redes é um PISO (recuo
máximo), não um destino. A profundidade real da linha vem do adversário mais
recuado, menos a distância de marcação do Defensive Pressure.

Corre a função real de config.js num sandbox (é global de browser).
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
    assert.ok(i >= 0, 'funcao ' + nome + ' nao encontrada em config.js');
    let nivel = 0;
    for (let k = src.indexOf('{', i); k < src.length; k++) {
        if (src[k] === '{') nivel++;
        else if (src[k] === '}' && --nivel === 0) return src.slice(i, k + 1);
    }
    assert.fail('chavetas desequilibradas em ' + nome);
}

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(recortarFuncao(CONFIG, 'recuoDaUltimaLinha') + '\nthis.f = recuoDaUltimaLinha;', sandbox);
const recuoDaUltimaLinha = sandbox.f;

// Piso típico: guarda-redes na linha (-49) mais 1 m de folga.
const PISO = -48;
const TECTO = -18.25;

test('sem adversário nenhum, só o piso fala', () => {
    assert.strictEqual(recuoDaUltimaLinha(-57, null, 3.0, PISO, TECTO), PISO);
    assert.strictEqual(recuoDaUltimaLinha(-30, null, 3.0, PISO, TECTO), -30);
});

test('a linha fica a distância de marcação atrás do atacante mais recuado', () => {
    // Bloco a querer -57, atacante a -30, Balanced (3 m): a linha fica a -33.
    assert.strictEqual(recuoDaUltimaLinha(-57, -30, 3.0, PISO, TECTO), -33);
});

test('o Defensive Pressure manda na distância', () => {
    assert.strictEqual(recuoDaUltimaLinha(-57, -30, 1.5, PISO, TECTO), -31.5);
    assert.strictEqual(recuoDaUltimaLinha(-57, -30, 4.5, PISO, TECTO), -34.5);
});

test('o piso do guarda-redes ganha quando o atacante já está sobre a baliza', () => {
    // Atacante a -47.5: 3 m atrás dele seria -50.5, atrás do guarda-redes.
    assert.strictEqual(recuoDaUltimaLinha(-57, -47.5, 3.0, PISO, TECTO), PISO);
});

test('a linha não SOBE por causa deste ajuste, só deixa de recuar a mais', () => {
    // Bloco já à frente do ponto de marcação: fica onde estava.
    assert.strictEqual(recuoDaUltimaLinha(-25, -30, 3.0, PISO, TECTO), -25);
});

test('o tecto da Linha Defensiva continua a travar a subida', () => {
    // Atacante a -10 daria uma linha em -13, acima do tecto -18.25.
    assert.strictEqual(recuoDaUltimaLinha(-57, -10, 3.0, PISO, TECTO), TECTO);
});

test('o piso ganha ao tecto: nunca atrás do guarda-redes', () => {
    assert.strictEqual(recuoDaUltimaLinha(-57, -47.5, 3.0, PISO, -49.5), PISO);
});
