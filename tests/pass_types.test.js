/*
Tipos de passe: zonas, tabela de misturas, sorteio e escolha do ponto.

O PassTypeModel vive em js/config.js (script de browser, sem exports), por
isso é recortado do ficheiro e avaliado; o PassTypes já exporta em Node.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const CONFIG = fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8');

global.CAMPO_COMP = 105;

// Recorta `const NOME = { ... };` (chaveta equilibrada).
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
const sandbox = { CAMPO_COMP: 105, Math };
vm.createContext(sandbox);
vm.runInContext(recortarConst(CONFIG, 'PassTypeModel') + '\nthis.M = PassTypeModel;', sandbox);
global.PassTypeModel = sandbox.M;

const { PassTypes } = require('../js/pass_types.js');

const terco = 105 / 6; // 17.5
const zona = (corredor, sector) => ({
    corredor,
    sector,
    // z no referencial de ataque, representativo do terço
    z: sector === 'def' ? -30 : (sector === 'atk' ? 30 : 0),
    x: corredor === 'centro' ? 0 : 20
});
const zonaCalc = (z) => PassTypes.zonaDe(z.x, z.z);

/*
As misturas nascem dentro do vm, logo o prototipo delas e' o Object desse
realm e o deepStrictEqual recusa-as mesmo com o conteudo igual. Copiar para
um objecto deste realm resolve, sem afrouxar a comparacao.
*/
const plano = (o) => Object.assign({}, o);

/* ---------------------------------------------------------------- */

test('sector pelo terço do campo, no referencial de ataque', () => {
    assert.strictEqual(PassTypes.sectorDe(-30), 'def');
    assert.strictEqual(PassTypes.sectorDe(0), 'mid');
    assert.strictEqual(PassTypes.sectorDe(30), 'atk');
    // fronteiras
    assert.strictEqual(PassTypes.sectorDe(-terco - 0.1), 'def');
    assert.strictEqual(PassTypes.sectorDe(-terco + 0.1), 'mid');
    assert.strictEqual(PassTypes.sectorDe(terco + 0.1), 'atk');
});

test('corredor central é |x| < larguraCentro', () => {
    assert.strictEqual(PassTypes.corredorDe(0), 'centro');
    assert.strictEqual(PassTypes.corredorDe(9.9), 'centro');
    assert.strictEqual(PassTypes.corredorDe(10), 'lado');
    assert.strictEqual(PassTypes.corredorDe(-25), 'lado');
});

test('centro para centro: 80% direct, 20% into space', () => {
    for (const sec of ['def', 'mid']) {
        for (const dest of ['def', 'mid']) {
            const m = PassTypes.misturaPara(
                zonaCalc(zona('centro', sec)), zonaCalc(zona('centro', dest)));
            assert.deepStrictEqual(plano(m), { direct: 0.8, space: 0.2 }, sec + '->' + dest);
        }
    }
});

test('centro para o lado, a progredir: 80% into space, 20% leading', () => {
    const defMid = PassTypes.misturaPara(
        zonaCalc(zona('centro', 'def')), zonaCalc(zona('lado', 'mid')));
    const midAtk = PassTypes.misturaPara(
        zonaCalc(zona('centro', 'mid')), zonaCalc(zona('lado', 'atk')));
    assert.deepStrictEqual(plano(defMid), { space: 0.8, leading: 0.2 });
    assert.deepStrictEqual(plano(midAtk), { space: 0.8, leading: 0.2 });
});

test('defesa directo para o ataque: 50/50 into space e leading', () => {
    for (const corredor of ['centro', 'lado']) {
        const m = PassTypes.misturaPara(
            zonaCalc(zona('centro', 'def')), zonaCalc(zona(corredor, 'atk')));
        assert.deepStrictEqual(plano(m), { space: 0.5, leading: 0.5 }, corredor);
    }
});

test('def->atk ganha à regra do ataque (ordem das regras)', () => {
    const m = PassTypes.misturaPara(
        zonaCalc(zona('centro', 'def')), zonaCalc(zona('centro', 'atk')));
    assert.strictEqual(m.leading, 0.5, 'devia cair em defParaAtk, nao em origemAtaque');
});

test('a partir do ataque: 60% into space, 40% direct', () => {
    for (const dest of [zona('centro', 'atk'), zona('lado', 'atk'), zona('centro', 'mid')]) {
        const m = PassTypes.misturaPara(zonaCalc(zona('centro', 'atk')), zonaCalc(dest));
        assert.deepStrictEqual(plano(m), { space: 0.6, direct: 0.4 });
    }
});

test('o resto herda 80% direct / 20% into space', () => {
    // recuo do meio para a defesa, e lateral dentro do mesmo sector
    const recuo = PassTypes.misturaPara(
        zonaCalc(zona('centro', 'mid')), zonaCalc(zona('centro', 'def')));
    const lateral = PassTypes.misturaPara(
        zonaCalc(zona('lado', 'mid')), zonaCalc(zona('lado', 'mid')));
    assert.deepStrictEqual(plano(recuo), { direct: 0.8, space: 0.2 });
    assert.deepStrictEqual(plano(lateral), { direct: 0.8, space: 0.2 });
});

test('toda a mistura da tabela soma 1', () => {
    const somas = PassTypeModel.regras.map(r =>
        Object.values(r.mistura).reduce((a, b) => a + b, 0));
    somas.push(Object.values(PassTypeModel.misturaPadrao).reduce((a, b) => a + b, 0));
    for (const s of somas) assert.ok(Math.abs(s - 1) < 1e-9, 'mistura soma ' + s);
});

/* ---------------------------------------------------------------- */

test('sorteio respeita as proporções da mistura', () => {
    const m = { direct: 0.8, space: 0.2 };
    const conta = { direct: 0, space: 0, leading: 0 };
    // varre [0,1) deterministicamente em vez de confiar na sorte
    for (let i = 0; i < 1000; i++) conta[PassTypes.sortear(m, i / 1000)]++;
    assert.strictEqual(conta.direct, 800);
    assert.strictEqual(conta.space, 200);
    assert.strictEqual(conta.leading, 0);
});

test('sorteio de uma mistura 50/50 sem direct', () => {
    const conta = { direct: 0, space: 0, leading: 0 };
    for (let i = 0; i < 1000; i++) conta[PassTypes.sortear({ space: 0.5, leading: 0.5 }, i / 1000)]++;
    assert.strictEqual(conta.space, 500);
    assert.strictEqual(conta.leading, 500);
    assert.strictEqual(conta.direct, 0);
});

/* ---------------------------------------------------------------- */

const mate = { id: 1, model: { position: { x: 0, z: 0 } } };
// pontos a 3, 6, 9, 12 e 15 m do companheiro, ao longo de +z
const pontos = [3, 6, 9, 12, 15].map(d => ({ x: 0, z: d, mate }));

test('into space mira a mediana em profundidade', () => {
    const pt = PassTypes.pontoMediano(pontos, mate);
    assert.strictEqual(pt.z, 9, 'de 5 pontos, o 3º');
    // ordem de entrada não conta
    const baralhado = [pontos[4], pontos[0], pontos[3], pontos[1], pontos[2]];
    assert.strictEqual(PassTypes.pontoMediano(baralhado, mate).z, 9);
});

test('mediana com número par de pontos escolhe o de cima', () => {
    assert.strictEqual(PassTypes.pontoMediano(pontos.slice(0, 4), mate).z, 9);
});

test('leading mira o ponto mais perto do golo', () => {
    const pt = PassTypes.pontoMaisPertoDoGolo(pontos, 52.5);
    assert.strictEqual(pt.z, 15);
});

test('leading com a baliza do outro lado escolhe o oposto', () => {
    const pt = PassTypes.pontoMaisPertoDoGolo(pontos, -52.5);
    assert.strictEqual(pt.z, 3);
});

test('sem pontos vivos, qualquer tipo cai em direct', () => {
    for (const tipo of [PassTypes.SPACE, PassTypes.LEADING]) {
        const r = PassTypes.pontoPara(tipo, [], mate, 52.5);
        assert.strictEqual(r.tipo, PassTypes.DIRECT);
        assert.strictEqual(r.ponto, null);
    }
});

test('direct nunca traz ponto de mira', () => {
    const r = PassTypes.pontoPara(PassTypes.DIRECT, pontos, mate, 52.5);
    assert.strictEqual(r.tipo, PassTypes.DIRECT);
    assert.strictEqual(r.ponto, null);
});

test('pontoPara devolve o ponto certo para cada tipo', () => {
    assert.strictEqual(PassTypes.pontoPara(PassTypes.SPACE, pontos, mate, 52.5).ponto.z, 9);
    assert.strictEqual(PassTypes.pontoPara(PassTypes.LEADING, pontos, mate, 52.5).ponto.z, 15);
});

/* ------------------------------------------------------------------
   Leading: só adianta, nunca recua.
   ------------------------------------------------------------------ */

const mateAtras = { id: 2, model: { position: { x: 0, z: 10 } } };

test('leading ignora pontos que não aproximam do golo', () => {
    // Leque de um colega a recuar: todos os pontos ficam atrás dele.
    const atras = [3, 6, 9].map(d => ({ x: 0, z: 10 - d, mate: mateAtras }));
    assert.strictEqual(
        PassTypes.pontoMaisPertoDoGolo(atras, 52.5, mateAtras), null,
        'nenhum destes pontos adianta a bola');
});

test('leading escolhe o mais adiantado quando há pontos bons', () => {
    const frente = [3, 6, 9].map(d => ({ x: 0, z: 10 + d, mate: mateAtras }));
    assert.strictEqual(
        PassTypes.pontoMaisPertoDoGolo(frente, 52.5, mateAtras).z, 19);
});

test('leading descarta os que recuam e fica com os que adiantam', () => {
    const misto = [-6, -3, 3, 6].map(d => ({ x: 0, z: 10 + d, mate: mateAtras }));
    assert.strictEqual(
        PassTypes.pontoMaisPertoDoGolo(misto, 52.5, mateAtras).z, 16);
});

test('sem leading possível, o tipo cai em direct', () => {
    const atras = [3, 6].map(d => ({ x: 0, z: 10 - d, mate: mateAtras }));
    const r = PassTypes.pontoPara(PassTypes.LEADING, atras, mateAtras, 52.5);
    assert.strictEqual(r.tipo, PassTypes.DIRECT);
    assert.strictEqual(r.ponto, null);
});

test('a baliza do outro lado inverte o que conta como adiantar', () => {
    const pontos = [-6, -3, 3].map(d => ({ x: 0, z: 10 + d, mate: mateAtras }));
    // A atacar -Z: adiantar é descer em z.
    assert.strictEqual(
        PassTypes.pontoMaisPertoDoGolo(pontos, -52.5, mateAtras).z, 4);
});
