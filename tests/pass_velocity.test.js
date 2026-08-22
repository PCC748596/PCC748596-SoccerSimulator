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

/*
Os limiares antigos (saida >= 12 m/s num passe de 4 m) foram escritos para
um atritoRolamento de 0.10. Com o valor real do jogo, 0.38, sao impossiveis
e indesejaveis: 12 m/s de saida em 4 m CHEGA a 10 m/s, muito acima do
BallControl.easySpeed (7.75) — ninguem domina isso.

Estes testes verificam a CHEGADA, que e o que decide se a bola e jogavel. A
saida e consequencia.
*/

// Velocidade com que a bola chega, dada a de saida: inverte a mesma fisica.
function chegadaDe(sandbox, dist, v0) {
    const B = sandbox.BallPhysics;
    const atrito = B.atritoRolamento * B.gravidade;
    const q = (B.kArrasto * v0 * v0 + atrito) / Math.exp(2 * B.kArrasto * dist) - atrito;
    return q <= 0 ? 0 : Math.sqrt(q / B.kArrasto);
}

test('velocidadeRasteiraPara: a bola chega sempre dominável', () => {
    const vChegada = sandbox.PassModel.vChegadaRasteira;
    const easySpeed = 7.75;   // BallControl.easySpeed
    for (const d of [3, 5, 8, 12, 15, 20, 25]) {
        const v0 = sandbox.velocidadeRasteiraPara(d, vChegada);
        const chegada = chegadaDe(sandbox, d, v0);
        assert.ok(chegada < easySpeed,
            `Passe de ${d}m chega a ${chegada.toFixed(2)} m/s — acima do easySpeed`);
        assert.ok(chegada >= 1.49,
            `Passe de ${d}m chega a ${chegada.toFixed(2)} m/s — morre antes do alvo`);
    }
});

test('velocidadeRasteiraPara: o passe curto chega mais vivo que o longo', () => {
    const vChegada = sandbox.PassModel.vChegadaRasteira;
    const curto = chegadaDe(sandbox, 4, sandbox.velocidadeRasteiraPara(4, vChegada));
    const longo = chegadaDe(sandbox, 25, sandbox.velocidadeRasteiraPara(25, vChegada));
    assert.ok(curto > longo,
        `curto=${curto.toFixed(2)} longo=${longo.toFixed(2)} m/s`);
});

/*
Guarda contra recalibração silenciosa: `chegadaDe`, acima, é o inverso
algébrico exacto da fórmula fechada dentro de `velocidadeRasteiraPara`, por
isso qualquer erro na física partilhada cancela-se e os testes de "chegada"
ficam sempre verdes — mudar `atritoRolamento`, ou qualquer outra constante
da calibração, passaria despercebido. Estes dois números vêm de uma
observação directa (não da fórmula inversa) e são o que prende a decisão do
humano de manter `atritoRolamento` em 0.38. Se moverem, ou a física ou a
calibração mudou, e isso tem de ser deliberado — não um efeito colateral.
*/
test('velocidadeRasteiraPara: velocidades de saída ficam presas à calibração actual', () => {
    const vChegada = sandbox.PassModel.vChegadaRasteira;
    const curto = sandbox.velocidadeRasteiraPara(4, vChegada);
    const longo = sandbox.velocidadeRasteiraPara(25, vChegada);
    assert.ok(Math.abs(curto - 7.18) < 0.05, `saida a 4m = ${curto.toFixed(2)} (esperado ~7.18)`);
    assert.ok(Math.abs(longo - 16.46) < 0.05, `saida a 25m = ${longo.toFixed(2)} (esperado ~16.46)`);
});

test('velocidadeRasteiraPara: mais distância, mais velocidade de saída', () => {
    const vChegada = sandbox.PassModel.vChegadaRasteira;
    let anterior = 0;
    for (const d of [3, 6, 10, 15, 20, 25]) {
        const v0 = sandbox.velocidadeRasteiraPara(d, vChegada);
        assert.ok(v0 > anterior,
            `saida em ${d}m (${v0.toFixed(2)}) nao e maior que em ${d - 1}m ou menos (${anterior.toFixed(2)})`);
        anterior = v0;
    }
});

test('velocidadeRasteiraPara: o tecto de 18.5 m/s é respeitado', () => {
    const vChegada = sandbox.PassModel.vChegadaRasteira;
    for (const d of [30, 50, 80]) {
        const v0 = sandbox.velocidadeRasteiraPara(d, vChegada);
        assert.ok(v0 <= 18.5, `Passe de ${d}m sai a ${v0.toFixed(2)} m/s`);
    }
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
