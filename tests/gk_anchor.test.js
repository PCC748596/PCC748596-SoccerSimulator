/*
Ancoragem do guarda-redes: quanto mais perto a bola está da baliza, mais perto
da linha ele fica. Corre a função real de config.js num sandbox — é uma global
de browser, por isso é recortada do ficheiro em vez de importada.
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

function recortarLinha(src, nome) {
    const re = new RegExp('^const ' + nome + '\\s*=.*$', 'm');
    const m = src.match(re);
    assert.ok(m, 'const ' + nome + ' nao encontrado');
    return m[0];
}

function montar() {
    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext(
        recortarLinha(CONFIG, 'LARGURA_BALIZA') + '\n' +
        recortarLinha(CONFIG, 'GK_D_NEAR') + '\n' +
        recortarLinha(CONFIG, 'GK_D_FAR') + '\n' +
        recortarConst(CONFIG, 'GoalkeeperStyle') + '\n' +
        recortarFuncao(CONFIG, 'gkAnchor') + '\n' +
        'this.gkAnchor = gkAnchor; this.S = GoalkeeperStyle;' +
        'this.NEAR = GK_D_NEAR; this.FAR = GK_D_FAR;', sandbox);
    return sandbox;
}

// TeamA defende em z = -52.5 e ataca para +z.
const GOL_A = -52.5, DIR_A = 1;
// TeamB defende em z = +52.5 e ataca para -z.
const GOL_B = 52.5, DIR_B = -1;

// Limite lateral do guarda-redes, igual ao de updateGK: meio-poste menos 0.5 m.
const LIMITE_X = (7.32 / 2) - 0.5;

// Profundidade = distância da posição devolvida à própria linha de golo.
function depth(r, ownGoalZ, dirZ) {
    return (r.z - ownGoalZ) * dirZ;
}

test('a profundidade nunca aumenta quando a bola se aproxima da baliza', () => {
    const s = montar();
    let anterior = Infinity;
    // Bola no eixo, a percorrer o campo desde longe até à linha.
    for (let d = 100; d >= 0; d -= 1) {
        const r = s.gkAnchor(0, GOL_A + d * DIR_A, GOL_A, DIR_A, s.S.defensive);
        const p = depth(r, GOL_A, DIR_A);
        assert.ok(p <= anterior + 1e-9, 'subiu de ' + anterior + ' para ' + p + ' a d=' + d);
        anterior = p;
    }
});

test('bola colada à baliza dá depthMin, bola muito longe dá depthMax', () => {
    const s = montar();
    const perto = s.gkAnchor(0, GOL_A, GOL_A, DIR_A, s.S.defensive);
    assert.ok(Math.abs(depth(perto, GOL_A, DIR_A) - s.S.defensive.depthMin) < 1e-9);

    const longe = s.gkAnchor(0, GOL_A + 200 * DIR_A, GOL_A, DIR_A, s.S.defensive);
    assert.ok(Math.abs(depth(longe, GOL_A, DIR_A) - s.S.defensive.depthMax) < 1e-9);
});

test('dentro da grande área ele está sempre em depthMin', () => {
    const s = montar();
    for (const d of [0, 5, 10, 16.5]) {
        const r = s.gkAnchor(0, GOL_A + d * DIR_A, GOL_A, DIR_A, s.S.defensive);
        assert.ok(Math.abs(depth(r, GOL_A, DIR_A) - s.S.defensive.depthMin) < 1e-9,
            'd=' + d);
    }
});

test('regressão do bug: bola a 16 m deixa-o mais recuado do que bola a 40 m', () => {
    const s = montar();
    const perto = s.gkAnchor(0, GOL_A + 16 * DIR_A, GOL_A, DIR_A, s.S.defensive);
    const longe = s.gkAnchor(0, GOL_A + 40 * DIR_A, GOL_A, DIR_A, s.S.defensive);
    assert.ok(depth(perto, GOL_A, DIR_A) < depth(longe, GOL_A, DIR_A));
});

test('o desvio lateral nunca passa do poste', () => {
    const s = montar();
    for (const bx of [-40, -20, -5, 0, 5, 20, 40]) {
        for (const d of [2, 16.5, 30, 60]) {
            const r = s.gkAnchor(bx, GOL_A + d * DIR_A, GOL_A, DIR_A, s.S.offensive);
            assert.ok(Math.abs(r.x) <= LIMITE_X + 1e-9,
                'x=' + r.x + ' para bx=' + bx + ' d=' + d);
        }
    }
});

test('o desvio lateral segue o lado da bola', () => {
    const s = montar();
    const dir = s.gkAnchor(20, GOL_A + 30 * DIR_A, GOL_A, DIR_A, s.S.defensive);
    const esq = s.gkAnchor(-20, GOL_A + 30 * DIR_A, GOL_A, DIR_A, s.S.defensive);
    assert.ok(dir.x > 0);
    assert.ok(esq.x < 0);
    assert.ok(Math.abs(dir.x + esq.x) < 1e-9, 'devia ser simétrico');
});

test('TeamA e TeamB produzem posições espelhadas', () => {
    const s = montar();
    const a = s.gkAnchor(12, GOL_A + 35 * DIR_A, GOL_A, DIR_A, s.S.defensive);
    const b = s.gkAnchor(12, GOL_B + 35 * DIR_B, GOL_B, DIR_B, s.S.defensive);
    assert.ok(Math.abs(a.x - b.x) < 1e-9, 'o x não depende do lado');
    assert.ok(Math.abs(depth(a, GOL_A, DIR_A) - depth(b, GOL_B, DIR_B)) < 1e-9);
});

test('offensive fica mais adiantado que defensive à mesma distância', () => {
    const s = montar();
    const d = 45;
    const def = s.gkAnchor(0, GOL_A + d * DIR_A, GOL_A, DIR_A, s.S.defensive);
    const off = s.gkAnchor(0, GOL_A + d * DIR_A, GOL_A, DIR_A, s.S.offensive);
    assert.ok(depth(off, GOL_A, DIR_A) > depth(def, GOL_A, DIR_A));
});

test('nunca devolve NaN, mesmo com a bola exactamente sobre a baliza', () => {
    const s = montar();
    const r = s.gkAnchor(0, GOL_A, GOL_A, DIR_A, s.S.defensive);
    assert.ok(Number.isFinite(r.x), 'x = ' + r.x);
    assert.ok(Number.isFinite(r.z), 'z = ' + r.z);
});

test('os estilos têm todas as chaves esperadas', () => {
    const s = montar();
    for (const nome of ['defensive', 'offensive']) {
        const e = s.S[nome];
        assert.ok(e, nome + ' em falta');
        for (const k of ['depthMin', 'depthMax', 'sweepOut']) {
            assert.strictEqual(typeof e[k], 'number', nome + '.' + k);
        }
        assert.ok(e.depthMin < e.depthMax, nome + ': depthMin tem de ser menor');
    }
});

test('as distâncias de referência são a área e o meio-campo adversário', () => {
    const s = montar();
    assert.strictEqual(s.NEAR, 16.5);
    assert.strictEqual(s.FAR, 55.0);
});
