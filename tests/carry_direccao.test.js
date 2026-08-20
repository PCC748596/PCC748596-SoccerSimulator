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

/* ===================================================================
   Pontuação da direcção de condução
   =================================================================== */

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

function montarNota() {
    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext(
        recortarConst(CONFIG, 'CarryModel') + '\n' +
        recortarFuncao(UTILS, 'pesoEspacoPorTecnica') + '\n' +
        recortarFuncao(UTILS, 'notaDireccaoCarry') + '\n' +
        'this.peso = pesoEspacoPorTecnica; this.nota = notaDireccaoCarry;' +
        'this.C = CarryModel;', sandbox);
    return sandbox;
}

test('o peso do espaço satura nos extremos da técnica', () => {
    const s = montarNota();
    assert.strictEqual(s.peso(20), s.C.pesoEspacoMin);
    assert.strictEqual(s.peso(40), s.C.pesoEspacoMin);
    assert.strictEqual(s.peso(90), s.C.pesoEspacoMax);
    assert.strictEqual(s.peso(99), s.C.pesoEspacoMax);
});

test('o peso do espaço é o ponto médio a meio caminho da técnica', () => {
    const s = montarNota();
    const meio = (s.C.tecEspacoMin + s.C.tecEspacoMax) / 2;   // 65
    const esperado = (s.C.pesoEspacoMin + s.C.pesoEspacoMax) / 2;
    assert.ok(Math.abs(s.peso(meio) - esperado) < 1e-9,
        'esperava ' + esperado + ', deu ' + s.peso(meio));
});

test('o peso do espaço cresce com a técnica', () => {
    const s = montarNota();
    let anterior = -Infinity;
    for (let t = 0; t <= 100; t += 5) {
        const p = s.peso(t);
        assert.ok(p >= anterior - 1e-9, 'desceu em tec=' + t);
        anterior = p;
    }
});

test('mais espaço nunca baixa a nota', () => {
    const s = montarNota();
    let anterior = -Infinity;
    for (let e = 0; e <= 1.0001; e += 0.1) {
        const n = s.nota(Math.min(e, 1), 0.5, 0, 70);
        assert.ok(n >= anterior - 1e-9, 'desceu em espaco=' + e);
        anterior = n;
    }
});

test('mais progresso nunca baixa a nota', () => {
    const s = montarNota();
    let anterior = -Infinity;
    for (let g = 0; g <= 1.0001; g += 0.1) {
        const n = s.nota(0.5, Math.min(g, 1), 0, 70);
        assert.ok(n >= anterior - 1e-9, 'desceu em progresso=' + g);
        anterior = n;
    }
});

test('mais penalidade de sector nunca sobe a nota', () => {
    const s = montarNota();
    let anterior = Infinity;
    for (let p = 0; p <= 1.0001; p += 0.1) {
        const n = s.nota(0.5, 0.5, Math.min(p, 1), 70);
        assert.ok(n <= anterior + 1e-9, 'subiu em sector=' + p);
        anterior = n;
    }
});

/*
O bug relatado: extremo recebe na direita com Right activo, o caminho central
está fechado, e ele corta para o meio na mesma. Com os pesos antigos o termo do
progresso tinha 56 pontos de amplitude contra 32 do espaço, e a frontal ganhava
sempre.

Números da ponta livre: um candidato a 56° do eixo tem progresso cos(56°)=0.56 e
espaço 1.0 (nenhum adversário até ao spaceCap). O frontal tem progresso 1.0 e,
com um adversário a 2 m e spaceCap 16, espaço 2/16 = 0.125.
*/
test('regressão do bug: a ponta livre bate a frontal fechada a técnica 80', () => {
    const s = montarNota();
    const frontal = s.nota(0.125, 1.0, 0, 80);
    const ponta = s.nota(1.0, 0.56, 0, 80);
    assert.ok(ponta > frontal, 'ponta=' + ponta + ' frontal=' + frontal);
});

test('a ponta livre ainda ganha a técnica 40, quando ele a consegue ver', () => {
    const s = montarNota();
    const frontal = s.nota(0.125, 1.0, 0, 40);
    // A técnica 40 o cone é +/-30 graus, logo o melhor lateral visível tem
    // progresso cos(30) = 0.87.
    const ponta = s.nota(1.0, 0.87, 0, 40);
    assert.ok(ponta > frontal, 'ponta=' + ponta + ' frontal=' + frontal);
});

test('a vantagem da ponta é MAIOR a técnica alta do que a técnica baixa', () => {
    const s = montarNota();
    const margemAlta = s.nota(1.0, 0.56, 0, 90) - s.nota(0.125, 1.0, 0, 90);
    const margemBaixa = s.nota(1.0, 0.56, 0, 40) - s.nota(0.125, 1.0, 0, 40);
    assert.ok(margemAlta > margemBaixa,
        'alta=' + margemAlta + ' baixa=' + margemBaixa);
});

test('um sector desactivado chega para virar a escolha entre iguais', () => {
    const s = montarNota();
    const dentro = s.nota(0.6, 0.6, 0, 70);
    const fora = s.nota(0.6, 0.6, 0.5, 70);
    assert.ok(dentro > fora);
});

test('os pesos novos existem e os antigos desapareceram', () => {
    const s = montarNota();
    for (const k of ['pesoEspacoMin', 'pesoEspacoMax', 'tecEspacoMin',
                     'tecEspacoMax', 'pesoProgresso', 'pesoSector']) {
        assert.strictEqual(typeof s.C[k], 'number', k + ' em falta');
    }
    for (const k of ['spaceWeight', 'progressWeight', 'sectorWeight']) {
        assert.strictEqual(s.C[k], undefined, k + ' devia ter sido removido');
    }
});
