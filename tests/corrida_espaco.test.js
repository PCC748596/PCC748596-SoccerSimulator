/*
Destino de uma corrida ao espaco.

O candidato bruto vem do SpatialGrid (a celula mais vazia por perto). Esta
funcao decide se ele SERVE: tem de estar a frente, dentro do campo, aquem da
linha de fora-de-jogo e a uma distancia que se corra — senao a "corrida ao
espaco" era um passeio de 40 m ou um passo de lado.
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
    vm.runInContext(
        'const CAMPO_LARG = 68; const CAMPO_COMP = 106;\n' +
        recortarFuncao(UTILS, 'destinoDeCorrida') +
        '\nthis.destino = destinoDeCorrida;', sandbox);
    return sandbox.destino;
}

// Jogador do TeamA (dirZ +1) em x=20, z=0. Ataca para +z.
const base = (extra) => Object.assign({
    px: 20, pz: 0, dirZ: 1,
    candidatoX: 22, candidatoZ: 14,
    offsideLimitDir: 40,
    maxCorrida: 18
}, extra || {});

test('aceita um ponto à frente, livre e dentro do campo', () => {
    const d = montar();
    const r = d(base());
    assert.ok(r, 'devia aceitar');
    assert.ok(r.z > 0, 'devia estar a frente');
});

test('recusa um ponto atrás do jogador', () => {
    const d = montar();
    assert.strictEqual(d(base({ candidatoZ: -6 })), null);
});

test('recusa um ponto quase em cima do jogador', () => {
    const d = montar();
    assert.strictEqual(d(base({ candidatoX: 20.5, candidatoZ: 1.0 })), null);
});

test('não passa a linha de fora-de-jogo', () => {
    const d = montar();
    const r = d(base({ candidatoZ: 46, offsideLimitDir: 40 }));
    assert.ok(r === null || r.z * 1 <= 40, 'passou a linha: ' + JSON.stringify(r));
});

test('sem linha de fora-de-jogo publicada, corre na mesma', () => {
    const d = montar();
    assert.ok(d(base({ offsideLimitDir: null })), 'devia aceitar sem linha');
});

test('encurta a corrida ao alcance máximo', () => {
    const d = montar();
    const r = d(base({ candidatoZ: 34, offsideLimitDir: 50, maxCorrida: 18 }));
    assert.ok(r, 'devia aceitar encurtado');
    const dist = Math.hypot(r.x - 20, r.z - 0);
    assert.ok(dist <= 18.1, 'corrida de ' + dist.toFixed(1) + ' m');
});

test('não manda ninguém para fora do campo', () => {
    const d = montar();
    const r = d(base({ px: 30, candidatoX: 40, candidatoZ: 12, offsideLimitDir: 50 }));
    assert.ok(r === null || Math.abs(r.x) <= 32.1, 'x=' + (r && r.x));
});

test('espelha para a equipa que ataca no sentido oposto', () => {
    const d = montar();
    const a = d(base());
    const b = d(base({ pz: -0, dirZ: -1, candidatoZ: -14, offsideLimitDir: 40 }));
    assert.ok(a && b, 'ambas as equipas deviam poder correr');
    assert.ok(a.z > 0 && b.z < 0, 'a=' + a.z.toFixed(1) + ' b=' + b.z.toFixed(1));
});

/* ------------------------------------------------------------------
   Linha de passe livre — o que faltava na primeira versao.
   ------------------------------------------------------------------ */

function montarLinha() {
    const sandbox = { Math: Math };
    vm.createContext(sandbox);
    vm.runInContext(recortarFuncao(UTILS, 'linhaLivre') +
        '\nthis.linhaLivre = linhaLivre;', sandbox);
    return sandbox.linhaLivre;
}

const obst = (x, z) => ({ x: x, z: z });

test('linha sem ninguém pelo meio está livre', () => {
    const l = montarLinha();
    assert.strictEqual(l(0, 0, 0, 20, [obst(15, 10)], 2.0), true);
});

test('adversário em cima da linha fecha-a', () => {
    const l = montarLinha();
    assert.strictEqual(l(0, 0, 0, 20, [obst(0.5, 10)], 2.0), false);
});

test('adversário atrás do destino não conta', () => {
    const l = montarLinha();
    assert.strictEqual(l(0, 0, 0, 20, [obst(0, 26)], 2.0), true);
});

test('adversário atrás de quem passa não conta', () => {
    const l = montarLinha();
    assert.strictEqual(l(0, 0, 0, 20, [obst(0, -6)], 2.0), true);
});

test('a margem manda', () => {
    const l = montarLinha();
    const o = [obst(2.5, 10)];
    assert.strictEqual(l(0, 0, 0, 20, o, 2.0), true);
    assert.strictEqual(l(0, 0, 0, 20, o, 3.0), false);
});

test('lista vazia é sempre livre', () => {
    const l = montarLinha();
    assert.strictEqual(l(0, 0, 0, 20, [], 2.0), true);
});
