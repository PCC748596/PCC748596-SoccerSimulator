const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const CONFIG = fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8');
const UTILS = fs.readFileSync(path.join(raiz, 'js', 'utils.js'), 'utf8');

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

const sandbox = {
    Math,
    ALTURA_CABECA: 1.55,
    THREE: {
        MathUtils: {
            clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
            degToRad: (deg) => deg * Math.PI / 180,
            radToDeg: (rad) => rad * 180 / Math.PI
        }
    }
};
vm.createContext(sandbox);

const script = `
${recortarConst(CONFIG, 'BallPhysics')}
BallPhysics.area = Math.PI * BallPhysics.raio * BallPhysics.raio;
BallPhysics.kArrasto = 0.5 * BallPhysics.densidadeAr * BallPhysics.cd * BallPhysics.area / BallPhysics.massa;
${recortarConst(CONFIG, 'PassModel')}
${recortarFuncao(UTILS, 'velocidadeRasteiraPara')}
${recortarFuncao(UTILS, 'resolverElevacaoPasse')}
this.BallPhysics = BallPhysics;
this.PassModel = PassModel;
this.velocidadeRasteiraPara = velocidadeRasteiraPara;
this.resolverElevacaoPasse = resolverElevacaoPasse;
`;

vm.runInContext(script, sandbox);

test('velocidadeRasteiraPara: passes curtos (<12m) recebem boost dinâmico para rapidez', () => {
    const vChegada = sandbox.PassModel.vChegadaRasteira;
    const vCurto4m = sandbox.velocidadeRasteiraPara(4.0, vChegada);
    const vCurto8m = sandbox.velocidadeRasteiraPara(8.0, vChegada);
    const vMedio15m = sandbox.velocidadeRasteiraPara(15.0, vChegada);

    // O passe curto deve ter velocidade de saída viva (> 11.5 m/s)
    assert.ok(vCurto4m >= 12.0, `Passe de 4m (${vCurto4m.toFixed(2)} m/s) deve ser ágil e rápido`);
    assert.ok(vCurto8m >= 11.5, `Passe de 8m (${vCurto8m.toFixed(2)} m/s) deve ser ágil e rápido`);
    assert.ok(vCurto4m > vMedio15m, 'Passe curto de 4m recebe boost em relação à velocidade base de 15m');
});

test('velocidadeRasteiraPara: passes longos (>20m) não viram foguetes e são contidos', () => {
    const vChegada = sandbox.PassModel.vChegadaRasteira;
    const v30m = sandbox.velocidadeRasteiraPara(30.0, vChegada);
    const v50m = sandbox.velocidadeRasteiraPara(50.0, vChegada);

    assert.ok(v30m <= 15.0, `Passe de 30m (${v30m.toFixed(2)} m/s) deve ser contido e jogável`);
    assert.ok(v50m <= 18.5, `Passe de 50m (${v50m.toFixed(2)} m/s) não pode exceder o teto seguro`);
});

test('resolverElevacaoPasse: arcos aéreos longos mantêm trajetória parabólica realista', () => {
    const elev30m = sandbox.resolverElevacaoPasse(30.0, true);
    const elev50m = sandbox.resolverElevacaoPasse(50.0, true);

    const deg30 = sandbox.THREE.MathUtils.radToDeg(elev30m);
    const deg50 = sandbox.THREE.MathUtils.radToDeg(elev50m);

    // Trajetória entre 32° e 42° para lançamento/arco longo
    assert.ok(deg30 >= 35.0 && deg30 <= 43.0, `Ângulo aos 30m (${deg30.toFixed(1)}°) deve ser equilibrado`);
    assert.ok(deg50 >= 30.0 && deg50 <= 38.0, `Ângulo aos 50m (${deg50.toFixed(1)}°) deve permitir balística realista sem laser missile`);
});
