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
global.CAMPO_LARG = 68;

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
const sandbox = { CAMPO_COMP: 105, CAMPO_LARG: 68, Math };
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

test('centro para centro: 30% direct, 35% into space, 35% leading', () => {
    for (const sec of ['def', 'mid']) {
        for (const dest of ['def', 'mid']) {
            // Só destinos que NÃO recuam mais que a margem, senão casa a
            // regra do recuo, que corre antes desta.
            if (sec === 'mid' && dest === 'def') continue;
            const m = PassTypes.misturaPara(
                zonaCalc(zona('centro', sec)), zonaCalc(zona('centro', dest)));
            assert.deepStrictEqual(plano(m),
                { direct: 0.3, space: 0.35, leading: 0.35 }, sec + '->' + dest);
        }
    }
});

test('centro para o lado, a progredir: 55% into space, 35% leading', () => {
    const defMid = PassTypes.misturaPara(
        zonaCalc(zona('centro', 'def')), zonaCalc(zona('lado', 'mid')));
    const midAtk = PassTypes.misturaPara(
        zonaCalc(zona('centro', 'mid')), zonaCalc(zona('lado', 'atk')));
    assert.deepStrictEqual(plano(defMid), { direct: 0.1, space: 0.55, leading: 0.35 });
    assert.deepStrictEqual(plano(midAtk), { direct: 0.1, space: 0.55, leading: 0.35 });
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

test('a partir do ataque: 45% into space, 30% leading, 25% direct', () => {
    // 'centro'/'mid' sai da lista: com origem no ataque é recuo, e a regra
    // do recuo corre primeiro.
    for (const dest of [zona('centro', 'atk'), zona('lado', 'atk')]) {
        const m = PassTypes.misturaPara(zonaCalc(zona('centro', 'atk')), zonaCalc(dest));
        assert.deepStrictEqual(plano(m), { direct: 0.25, space: 0.45, leading: 0.3 });
    }
});

test('o resto herda 30% direct / 35% into space / 35% leading', () => {
    // Lateral dentro do mesmo sector: não progride, mas também não recua.
    const lateral = PassTypes.misturaPara(
        zonaCalc(zona('lado', 'mid')), zonaCalc(zona('lado', 'mid')));
    assert.deepStrictEqual(plano(lateral),
        { direct: 0.3, space: 0.35, leading: 0.35 });
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

/* ------------------------------------------------------------------
   Recuo: a bola vai aos pés quando o passe é para trás.
   ------------------------------------------------------------------ */

// zonaCalc/zona só sabem construir zonas por sector; para o recuo interessa
// o avanço em metros, por isso constrói-se a zona directamente.
const zonaEm = (x, zAtk) => PassTypes.zonaDe(x, zAtk);

test('zonaDe devolve o avanço recebido, sem mexer no resto', () => {
    const z = PassTypes.zonaDe(20, -30);
    assert.strictEqual(z.avanco, -30);
    assert.strictEqual(z.sector, 'def');
    assert.strictEqual(z.corredor, 'lado');
});

test('passe para trás casa a regra do recuo', () => {
    const m = PassTypes.misturaPara(zonaEm(0, 20), zonaEm(0, 5));
    assert.deepStrictEqual(plano(m), { direct: 0.85, space: 0.15 });
});

test('passe lateral puro NÃO é recuo', () => {
    const m = PassTypes.misturaPara(zonaEm(-20, 10), zonaEm(20, 10));
    assert.notStrictEqual(m.direct, 0.85, 'mesmo avanço não devia ser recuo');
});

test('recuo mais curto que a margem NÃO conta como recuo', () => {
    const dentro = PassTypeModel.margemRecuo - 0.5;
    const m = PassTypes.misturaPara(zonaEm(0, 10), zonaEm(0, 10 - dentro));
    assert.notStrictEqual(m.direct, 0.85);
});

test('a regra do recuo ganha à do ataque (ordem das regras)', () => {
    // Origem no ataque, destino bem atrás: sem a ordem certa cairia em
    // origemAtaque e a bola ia para o espaço, à frente de quem recebe.
    const m = PassTypes.misturaPara(zonaEm(0, 30), zonaEm(0, 5));
    assert.deepStrictEqual(plano(m), { direct: 0.85, space: 0.15 });
});

test('a maioria das misturas pede a bola à frente', () => {
    const aFrente = (m) => (m.space || 0) + (m.leading || 0);
    // A do recuo é a única excepção, e é essa a intenção.
    for (const r of PassTypeModel.regras) {
        if (r.nome === 'recuo') {
            assert.ok(aFrente(r.mistura) < 0.5, 'recuo devia ir aos pés');
        } else {
            assert.ok(aFrente(r.mistura) >= 0.7, r.nome + ' só tem ' + aFrente(r.mistura));
        }
    }
    assert.ok(aFrente(PassTypeModel.misturaPadrao) >= 0.7, 'a padrão é a que mais dispara');
});

test('as constantes do leading curto existem e são coerentes', () => {
    for (const k of ['margemRecuo', 'liderancaCurta', 'liderancaPasso', 'liderancaMin']) {
        assert.strictEqual(typeof PassTypeModel[k], 'number', k + ' em falta');
        assert.ok(PassTypeModel[k] > 0, k + ' devia ser positivo');
    }
    assert.ok(PassTypeModel.liderancaMin < PassTypeModel.liderancaCurta,
        'o mínimo tem de ser menor que a distância cheia');
});

/* ------------------------------------------------------------------
   Leading curto: o ponto à frente que não passa pelo leque.
   ------------------------------------------------------------------ */

/*
Companheiro de teste. `quaternion` é uma rotação em torno de Y de `ang`
radianos, na convenção do THREE: (0, sin(ang/2), 0, cos(ang/2)). Com ang=0 a
frente local +Z fica a apontar para +Z do mundo.

Não se usa THREE aqui de propósito: js/pass_types.js é importado em Node, onde
ele não existe, e por isso a frente sai do quaternião por aritmética.
*/
function mateVirado(x, z, ang, id) {
    return {
        id: id === undefined ? 99 : id,
        dirZ: 1,
        model: {
            position: { x: x, z: z },
            quaternion: { x: 0, y: Math.sin(ang / 2), z: 0, w: Math.cos(ang / 2) }
        }
    };
}

const opp = (x, z) => ({ role: 'def', model: { position: { x: x, z: z } } });

test('frenteDe lê a orientação do modelo', () => {
    const f0 = PassTypes.frenteDe(mateVirado(0, 0, 0));
    assert.ok(Math.abs(f0.fx - 0) < 1e-9, 'fx = ' + f0.fx);
    assert.ok(Math.abs(f0.fz - 1) < 1e-9, 'fz = ' + f0.fz);

    const f90 = PassTypes.frenteDe(mateVirado(0, 0, Math.PI / 2));
    assert.ok(Math.abs(f90.fx - 1) < 1e-9, 'fx = ' + f90.fx);
    assert.ok(Math.abs(f90.fz - 0) < 1e-9, 'fz = ' + f90.fz);
});

test('frenteDe cai no eixo de ataque quando não há quaternião', () => {
    const semModelo = { id: 1, dirZ: -1, model: { position: { x: 0, z: 0 } } };
    const f = PassTypes.frenteDe(semModelo);
    assert.strictEqual(f.fx, 0);
    assert.strictEqual(f.fz, -1);
});

test('o ponto curto fica à frente do companheiro, à distância pedida', () => {
    const m = mateVirado(0, 0, 0);
    const pt = PassTypes.pontoLiderancaCurta(m, []);
    assert.ok(pt, 'devia ter devolvido um ponto');
    assert.ok(Math.abs(pt.z - PassTypeModel.liderancaCurta) < 1e-9, 'z = ' + pt.z);
    assert.ok(Math.abs(pt.x) < 1e-9, 'x = ' + pt.x);
});

test('o ponto curto nunca fica atrás do companheiro', () => {
    for (const ang of [0, 0.7, Math.PI / 2, 2.5, Math.PI, -1.2]) {
        const m = mateVirado(5, -8, ang);
        const pt = PassTypes.pontoLiderancaCurta(m, []);
        if (!pt) continue;
        const f = PassTypes.frenteDe(m);
        // Projecção do deslocamento na frente do jogador: tem de ser positiva.
        const proj = (pt.x - 5) * f.fx + (pt.z - (-8)) * f.fz;
        assert.ok(proj > 0, 'ang=' + ang + ' deu projecção ' + proj);
    }
});

test('o ponto curto vem marcado como curto', () => {
    const pt = PassTypes.pontoLiderancaCurta(mateVirado(0, 0, 0), []);
    assert.strictEqual(pt.curto, true);
});

test('encurta perante um adversário em cima do ponto cheio', () => {
    const m = mateVirado(0, 0, 0);
    // Adversário exactamente onde cairia o ponto de 4 m.
    const pt = PassTypes.pontoLiderancaCurta(m, [opp(0, PassTypeModel.liderancaCurta)]);
    assert.ok(pt, 'devia ter encurtado, não desistido');
    assert.ok(pt.z < PassTypeModel.liderancaCurta, 'não encurtou: z = ' + pt.z);
    assert.ok(pt.z >= PassTypeModel.liderancaMin - 1e-9, 'passou o mínimo: z = ' + pt.z);
});

test('desiste quando o corredor à frente está todo tapado', () => {
    const m = mateVirado(0, 0, 0);
    // Adversários a cobrir todas as distâncias entre o mínimo e a cheia.
    const tapado = [];
    for (let d = 1; d <= 5; d += 0.5) tapado.push(opp(0, d));
    assert.strictEqual(PassTypes.pontoLiderancaCurta(m, tapado), null);
});

test('desiste quando o ponto cairia fora do campo', () => {
    // Encostado à linha de fundo, virado para fora.
    const m = mateVirado(0, CAMPO_COMP / 2 - 0.5, 0);
    assert.strictEqual(PassTypes.pontoLiderancaCurta(m, []), null);
});

test('desiste quando o ponto cairia fora da linha lateral', () => {
    // Encostado à lateral, virado para fora (90 graus = +X).
    const m = mateVirado(CAMPO_LARG / 2 - 0.5, 0, Math.PI / 2);
    assert.strictEqual(PassTypes.pontoLiderancaCurta(m, []), null);
});

test('guarda-redes não conta como adversário a tapar', () => {
    const m = mateVirado(0, 0, 0);
    const gk = { role: 'gk', model: { position: { x: 0, z: PassTypeModel.liderancaCurta } } };
    const pt = PassTypes.pontoLiderancaCurta(m, [gk]);
    assert.ok(Math.abs(pt.z - PassTypeModel.liderancaCurta) < 1e-9,
        'não devia ter encurtado por causa do GR');
});

/* ------------------------------------------------------------------
   Regressão: leque vazio já não manda a bola aos pés.
   ------------------------------------------------------------------ */

test('leque vazio com adversários dados: leading vira ponto curto', () => {
    const m = mateVirado(0, 0, 0, 7);
    const r = PassTypes.pontoPara(PassTypes.LEADING, [], m, 52.5, []);
    assert.strictEqual(r.tipo, PassTypes.LEADING);
    assert.ok(r.ponto, 'devia trazer ponto');
    assert.strictEqual(r.ponto.curto, true);
});

test('leque vazio com adversários dados: space vira ponto curto', () => {
    const m = mateVirado(0, 0, 0, 8);
    const r = PassTypes.pontoPara(PassTypes.SPACE, [], m, 52.5, []);
    assert.strictEqual(r.tipo, PassTypes.SPACE);
    assert.strictEqual(r.ponto.curto, true);
});

test('sem ponto curto possível, ainda cai em direct', () => {
    // Encostado à linha de fundo, virado para fora: nada à frente cabe no campo.
    const m = mateVirado(0, CAMPO_COMP / 2 - 0.5, 0, 9);
    const r = PassTypes.pontoPara(PassTypes.LEADING, [], m, 52.5, []);
    assert.strictEqual(r.tipo, PassTypes.DIRECT);
    assert.strictEqual(r.ponto, null);
});

test('leque cheio continua a ganhar ao ponto curto', () => {
    const m = mateVirado(0, 0, 0, 10);
    const doLeque = [3, 6, 9].map(d => ({ x: 0, z: d, mate: m }));
    const r = PassTypes.pontoPara(PassTypes.LEADING, doLeque, m, 52.5, []);
    assert.strictEqual(r.ponto.z, 9, 'devia ser o ponto do leque mais adiantado');
    assert.strictEqual(r.ponto.curto, undefined, 'o do leque não é curto');
});

test('direct continua a não trazer ponto, mesmo com adversários dados', () => {
    const m = mateVirado(0, 0, 0, 11);
    const r = PassTypes.pontoPara(PassTypes.DIRECT, [], m, 52.5, []);
    assert.strictEqual(r.tipo, PassTypes.DIRECT);
    assert.strictEqual(r.ponto, null);
});
