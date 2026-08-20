/*
O deslocamento lateral por corredor: quanto cada jogador desliza quando a bola
esta numa ala ou no eixo.

O que se testa aqui e sobretudo a COERENCIA DAS DISTANCIAS. Com a bola no lado
oposto, o lateral fechava 8 m e o central 3 m: a distancia entre os dois
encolhia 5 m de uma vez e os dois acabavam em cima um do outro. Fechar tem de
ser um movimento do bloco todo, nao de um homem so.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const TEAM = fs.readFileSync(path.join(raiz, 'js', 'bt', 'team_bt.js'), 'utf8');

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
    vm.runInContext(recortarFuncao(TEAM, 'deslocamentoDeCorredor') +
        '\nthis.desl = deslocamentoDeCorredor;', sandbox);
    return sandbox.desl;
}

// Atalhos: bola na direita (+1). O lado oposto e o -1.
const opts = (extra) => Object.assign({
    ballCorredor: 1, pCorredor: 0, isLateral: false, isDefesa: false,
    isAttacking: false, sectorPedido: true
}, extra);

test('bola no eixo: quem está num sector pedido não é puxado', () => {
    const d = montar();
    assert.strictEqual(d(opts({ ballCorredor: 0, pCorredor: 1, sectorPedido: true })), 0);
});

test('bola no eixo: quem não está num sector pedido fecha para dentro', () => {
    const d = montar();
    assert.ok(d(opts({ ballCorredor: 0, pCorredor: 1, sectorPedido: false })) < 0);
    assert.ok(d(opts({ ballCorredor: 0, pCorredor: -1, sectorPedido: false })) > 0);
});

test('lado oposto: o lateral fecha, mas não mais de 6 m', () => {
    const d = montar();
    const v = d(opts({ pCorredor: -1, isLateral: true }));
    assert.ok(v > 0, 'devia fechar para o lado da bola');
    assert.ok(v <= 6.0, 'fechava demais: ' + v);
});

test('lado oposto: o CB acompanha o lateral, para não abrir um buraco', () => {
    const d = montar();
    const lateral = d(opts({ pCorredor: -1, isLateral: true }));
    const central = d(opts({ pCorredor: -1, isDefesa: true }));
    assert.ok(central > 0, 'o central do lado oposto tambem tem de fechar');
    assert.ok(Math.abs(lateral - central) <= 2.0,
        'a distancia entre eles encolhe ' + Math.abs(lateral - central).toFixed(1) + ' m de uma vez');
});

test('corredor central: o defesa desliza mais que o médio', () => {
    const d = montar();
    const defesa = d(opts({ pCorredor: 0, isDefesa: true }));
    const medio = d(opts({ pCorredor: 0, isDefesa: false }));
    assert.ok(defesa > medio, 'defesa=' + defesa + ' medio=' + medio);
});

test('mesmo lado da bola: o lateral abre só a atacar, e com comedimento', () => {
    const d = montar();
    const semBola = d(opts({ pCorredor: 1, isLateral: true, isAttacking: false }));
    const comBola = d(opts({ pCorredor: 1, isLateral: true, isAttacking: true }));
    assert.strictEqual(semBola, 0, 'sem bola nao abre');
    assert.ok(comBola > 0 && comBola <= 4.5, 'abria demais: ' + comBola);
});

test('espelha: com a bola na esquerda tudo troca de sinal', () => {
    const d = montar();
    const dir = d(opts({ ballCorredor: 1, pCorredor: -1, isLateral: true }));
    const esq = d(opts({ ballCorredor: -1, pCorredor: 1, isLateral: true }));
    assert.strictEqual(dir, -esq);
});
