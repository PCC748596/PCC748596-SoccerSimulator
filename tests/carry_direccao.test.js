/*
Direcção de condução: para onde o portador leva a bola. Corre as funções reais
de config.js e utils.js num sandbox — são globais de browser, por isso são
recortadas dos ficheiros em vez de importadas.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const CONFIG = fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8');

// Recorta um método de objecto escrito como `nome: function (...) { ... }`.
function recortarMetodo(src, nome) {
    const i = src.indexOf('    ' + nome + ': function (');
    assert.ok(i >= 0, 'metodo ' + nome + ' nao encontrado');
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

/*
Monta um Tatics mínimo com os dois métodos reais e os sectores pedidos. O
Tatics verdadeiro fala com o DOM no update(), por isso não se carrega inteiro.
*/
function montarTatics(setores) {
    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext(
        recortarLinha(CONFIG, 'LARGURA_BALIZA') + '\n' +
        'const CAMPO_LARG = 68;\n' +
        'const Tatics = {\n' +
        '    setores: ' + JSON.stringify(setores) + ',\n' +
        recortarMetodo(CONFIG, 'sectorDeX') + ',\n' +
        recortarMetodo(CONFIG, 'penalidadeSector') + '\n' +
        '};\n' +
        'this.T = Tatics;', sandbox);
    return sandbox.T;
}

test('sectorDeX classifica pelas faixas de 10 m', () => {
    const T = montarTatics(['esq', 'cen', 'dir']);
    assert.strictEqual(T.sectorDeX(-25, 1), 'esq');
    assert.strictEqual(T.sectorDeX(-11, 1), 'esq');
    assert.strictEqual(T.sectorDeX(0, 1), 'cen');
    assert.strictEqual(T.sectorDeX(25, 1), 'dir');
    assert.strictEqual(T.sectorDeX(11, 1), 'dir');
});

test('sectorDeX trata as fronteiras -10 e +10 como centro', () => {
    const T = montarTatics(['esq', 'cen', 'dir']);
    assert.strictEqual(T.sectorDeX(-10, 1), 'cen');
    assert.strictEqual(T.sectorDeX(10, 1), 'cen');
});

test('sectorDeX espelha para a equipa que ataca ao contrário', () => {
    const T = montarTatics(['esq', 'cen', 'dir']);
    assert.strictEqual(T.sectorDeX(25, 1), 'dir');
    assert.strictEqual(T.sectorDeX(25, -1), 'esq');
    assert.strictEqual(T.sectorDeX(0, -1), 'cen');
});

test('penalidade zero em qualquer ponto dentro de um sector activo', () => {
    const T = montarTatics(['esq', 'dir']);
    for (const x of [-33, -25, -19, -11, 11, 19, 25, 33]) {
        assert.strictEqual(T.penalidadeSector(x, 1), 0, 'x=' + x);
    }
});

test('o extremo bem colocado deixa de ser penalizado', () => {
    // Era este o bug: x=+25 com Right activo levava penalidade por não estar
    // exactamente no ponto +19 que o getWeightedSectorX sorteava.
    const T = montarTatics(['dir']);
    assert.strictEqual(T.penalidadeSector(25, 1), 0);
});

test('penalidade positiva fora dos sectores activos', () => {
    const T = montarTatics(['esq', 'dir']);
    // O centro está desactivado: qualquer x no centro é penalizado.
    assert.ok(T.penalidadeSector(0, 1) > 0);
    assert.ok(T.penalidadeSector(5, 1) > 0);
});

test('a penalidade cresce com a distância à borda do sector activo', () => {
    const T = montarTatics(['dir']);
    // Só a direita está activa: quanto mais à esquerda, pior.
    const perto = T.penalidadeSector(5, 1);
    const meio = T.penalidadeSector(-5, 1);
    const longe = T.penalidadeSector(-30, 1);
    assert.ok(perto < meio, 'perto=' + perto + ' meio=' + meio);
    assert.ok(meio < longe, 'meio=' + meio + ' longe=' + longe);
});

test('a penalidade está sempre entre 0 e 1', () => {
    for (const setores of [['esq'], ['cen'], ['dir'], ['esq', 'dir'], ['esq', 'cen', 'dir']]) {
        const T = montarTatics(setores);
        for (let x = -40; x <= 40; x += 2) {
            for (const dir of [1, -1]) {
                const p = T.penalidadeSector(x, dir);
                assert.ok(p >= 0 && p <= 1,
                    setores.join('+') + ' x=' + x + ' dir=' + dir + ' deu ' + p);
            }
        }
    }
});

test('com só o centro activo, quem está na ponta é penalizado', () => {
    const T = montarTatics(['cen']);
    assert.strictEqual(T.penalidadeSector(0, 1), 0);
    assert.ok(T.penalidadeSector(30, 1) > 0);
    assert.ok(T.penalidadeSector(-30, 1) > 0);
});

test('a penalidade é simétrica quando os dois lados estão activos', () => {
    const T = montarTatics(['esq', 'dir']);
    assert.ok(Math.abs(T.penalidadeSector(4, 1) - T.penalidadeSector(-4, 1)) < 1e-9);
});
