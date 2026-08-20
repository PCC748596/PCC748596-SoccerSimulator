/*
Alcance da cabeçada.

Fora da zona de remate a cabeçada era resolvida como um passe: pedia-se a
força necessária para CHEGAR ao companheiro escolhido. Com um colega a 35 m,
saía uma cabeçada de meio campo.

Aqui verifica-se o que sai da balística real (velocidadeParaAlcance, que já
inclui arrasto) com o tecto do HeaderModel.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const CONFIG = fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8');
const UTILS = fs.readFileSync(path.join(raiz, 'js', 'utils.js'), 'utf8');
const PLAYER = fs.readFileSync(path.join(raiz, 'js', 'player.js'), 'utf8');

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

const sandbox = { Math };
vm.createContext(sandbox);
vm.runInContext(
    recortarConst(CONFIG, 'BallPhysics') + '\n' +
    // `area` e `kArrasto` são derivados FORA do literal (ver config.js).
    'BallPhysics.area = Math.PI * BallPhysics.raio * BallPhysics.raio;\n' +
    'BallPhysics.kArrasto = 0.5 * BallPhysics.densidadeAr * BallPhysics.cd *' +
    ' BallPhysics.area / BallPhysics.massa;\n' +
    recortarConst(CONFIG, 'HeaderModel') + '\n' +
    recortarFuncao(UTILS, 'velocidadeParaAlcance') +
    '\nthis.vPara = velocidadeParaAlcance; this.H = HeaderModel; this.BP = BallPhysics;',
    sandbox);

const H = sandbox.H;
const BP = sandbox.BP;

// Simula o voo até tocar o chão e devolve o alcance horizontal.
function alcanceDe(v, elev) {
    const g = BP.gravidade, k = BP.kArrasto, r = BP.raio;
    let x = 0, y = r, vx = v * Math.cos(elev), vy = v * Math.sin(elev);
    const dt = 1 / 240;
    for (let i = 0; i < 4000; i++) {
        const s = Math.hypot(vx, vy);
        if (s > 0.001) { const dv = k * s * s * dt; vx -= vx / s * dv; vy -= vy / s * dv; }
        if (y > r + 0.001) vy -= g * dt;
        x += vx * dt; y += vy * dt;
        if (y <= r && vy < 0) return x;
    }
    return x;
}

// O que o executeHeader faz agora: distância desejada limitada ao tecto.
function alcanceDaCabecada(distAoColega) {
    const d = Math.min(distAoColega, H.alcanceMax);
    return alcanceDe(sandbox.vPara(d, H.elevacao), H.elevacao);
}

test('o tecto declarado é 10m', () => {
    assert.strictEqual(H.alcanceMax, 10.0);
});

test('uma cabeçada nunca passa dos 10m, por muito longe que esteja o colega', () => {
    for (const d of [12, 20, 30, 45, 60]) {
        const alc = alcanceDaCabecada(d);
        assert.ok(alc <= H.alcanceMax + 0.5,
            'colega a ' + d + 'm deu cabecada de ' + alc.toFixed(1) + 'm');
    }
});

test('com o colega perto, a bola chega-lhe (não vai sempre no máximo)', () => {
    for (const d of [4, 6, 8]) {
        const alc = alcanceDaCabecada(d);
        assert.ok(Math.abs(alc - d) < 0.6,
            'colega a ' + d + 'm recebeu a ' + alc.toFixed(1) + 'm');
    }
});

test('o alcance cresce com a distância pedida, até ao tecto', () => {
    const a4 = alcanceDaCabecada(4);
    const a8 = alcanceDaCabecada(8);
    const a30 = alcanceDaCabecada(30);
    assert.ok(a4 < a8, 'devia crescer');
    assert.ok(a8 < a30, 'devia crescer ate ao tecto');
    assert.ok(Math.abs(a30 - alcanceDaCabecada(50)) < 0.01, 'acima do tecto e sempre igual');
});

test('a velocidade de saída é a de uma cabeçada, não a de um remate', () => {
    // Um remate sai a 25-30 m/s; uma cabeçada de 10m fica muito abaixo disso.
    const v = sandbox.vPara(H.alcanceMax, H.elevacao);
    assert.ok(v < 15, 'saiu a ' + v.toFixed(1) + ' m/s, forte demais para uma cabecada');
    assert.ok(v > 5, 'saiu a ' + v.toFixed(1) + ' m/s, fraca demais para chegar aos 10m');
});

test('o executeHeader usa o tecto e não a distância ao colega', () => {
    const i = PLAYER.indexOf('executeHeader()');
    assert.ok(i >= 0);
    const corpo = PLAYER.slice(i, PLAYER.indexOf('\n    update(dt)', i));
    assert.ok(/HeaderModel\.alcanceMax/.test(corpo),
        'executeHeader nao aplica o tecto');
    assert.ok(!/velocidadeParaAlcance\(distToTarget/.test(corpo),
        'executeHeader ainda pede a forca para chegar ao colega');
});

test('sem colega nenhum a bola sai à mesma (não fica colada à testa)', () => {
    const i = PLAYER.indexOf('executeHeader()');
    const corpo = PLAYER.slice(i, PLAYER.indexOf('\n    update(dt)', i));
    // O ramo de alívio já não está dentro de um `if (target)`.
    assert.ok(/let uxP = 0, uzP = this\.dirZ/.test(corpo),
        'sem colega devia aliviar para a frente');
});
