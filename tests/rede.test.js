/*
Rede da baliza: a bola tem de parar NO pano, com a forma inclinada que o pano
tem, e escorregar por ele até ao chão.

Antes a colisão era uma caixa a 2.3 m de profundidade a qualquer altura — uma
bola entrada por cima ficava suspensa muito atrás do pano desenhado — e a
seguir a velocidade era zerada, o que a congelava no ar.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const CONFIG = fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8');
const MATCH = fs.readFileSync(path.join(raiz, 'js', 'match.js'), 'utf8');

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

function recortarMetodo(src, nome) {
    const i = src.indexOf('    ' + nome + ': function (');
    assert.ok(i >= 0, 'metodo ' + nome + ' nao encontrado');
    let nivel = 0;
    for (let k = src.indexOf('{', i); k < src.length; k++) {
        if (src[k] === '{') nivel++;
        else if (src[k] === '}' && --nivel === 0) {
            const args = src.slice(src.indexOf('(', i) + 1, src.indexOf(')', i));
            return 'function ' + nome + '(' + args + ') ' + src.slice(src.indexOf('{', i), k + 1);
        }
    }
    assert.fail('chavetas desequilibradas em ' + nome);
}

const CAMPO_COMP = 105;
const LARGURA_BALIZA = 7.32;
const ALTURA_BALIZA = 2.44;
const LINHA = CAMPO_COMP / 2;   // 52.5

const sandbox = { Math, CAMPO_COMP, LARGURA_BALIZA, ALTURA_BALIZA };
vm.createContext(sandbox);
vm.runInContext(
    recortarConst(CONFIG, 'BallPhysics') + '\n' +
    recortarConst(CONFIG, 'GoalNet') + '\n' +
    recortarMetodo(MATCH, 'colidirComRede') +
    '\nthis.f = colidirComRede; this.N = GoalNet; this.BP = BallPhysics;', sandbox);

const N = sandbox.N;
const rB = sandbox.BP.raio;

// Profundidade máxima do pano à altura `y` (a recta do pano de trás).
function profundidadeDoPano(y) {
    if (y >= ALTURA_BALIZA) return N.profTopo;
    const a = ALTURA_BALIZA / (N.profBase - N.profTopo);
    return (a * N.profBase - y) / a;
}

function bater(pos, vel, zSinal) {
    const sinal = zSinal === undefined ? 1 : zSinal;
    const estado = {
        ball: { position: { x: pos[0], y: pos[1], z: (LINHA + pos[2]) * sinal } },
        ballVel: { x: vel[0], y: vel[1], z: vel[2] * sinal }
    };
    sandbox.f.call(estado, sinal);
    return {
        x: estado.ball.position.x,
        y: estado.ball.position.y,
        d: estado.ball.position.z * sinal - LINHA,
        vx: estado.ballVel.x,
        vy: estado.ballVel.y,
        vd: estado.ballVel.z * sinal
    };
}

test('o pano de trás é inclinado, não uma parede', () => {
    assert.ok(profundidadeDoPano(2.4) < profundidadeDoPano(0.5),
        'em cima a rede tem de entrar menos do que em baixo');
    assert.ok(Math.abs(profundidadeDoPano(0) - N.profBase) < 1e-9);
});

test('bola alta para no pano de cima, não 2.3m lá atrás', () => {
    // Era isto que se via: bola a 2m de altura parada a 2.3m de profundidade.
    const r = bater([0, 2.0, 1.0], [0, 0, 12]);
    const limite = profundidadeDoPano(r.y);
    assert.ok(r.d <= limite - rB + 0.02,
        'ficou a ' + r.d.toFixed(2) + 'm, o pano ali esta a ' + limite.toFixed(2) + 'm');
    assert.ok(r.d < 2.0, 'ficou tao atras como a caixa antiga');
});

test('bola rasteira entra mais fundo do que a bola alta', () => {
    // Cada uma lancada JA contra o pano da sua altura.
    const alta = bater([0, 2.2, profundidadeDoPano(2.2)], [0, 0, 14]);
    const baixa = bater([0, 0.2, profundidadeDoPano(0.2)], [0, 0, 14]);
    assert.ok(baixa.d > alta.d,
        'em baixo a rede esta mais longe, a bola tem de entrar mais: ' +
        baixa.d.toFixed(2) + ' vs ' + alta.d.toFixed(2));
});

test('a bola nunca ultrapassa o pano', () => {
    for (const y of [0.2, 0.8, 1.5, 2.0, 2.3]) {
        const r = bater([0, y, 1.5], [0, 0, 20]);
        const limite = profundidadeDoPano(r.y);
        assert.ok(r.d <= limite - rB + 0.05,
            'a y=' + y + ' passou o pano: d=' + r.d.toFixed(2) + ' limite=' + limite.toFixed(2));
    }
});

test('a bola não fica congelada no ar: escorrega pelo pano', () => {
    const r = bater([0, 1.8, 1.0], [0, 0, 12]);
    const velocidade = Math.hypot(r.vx, r.vy, r.vd);
    assert.ok(velocidade > 0.01,
        'a bola parou completamente ao tocar na rede (v=' + velocidade.toFixed(3) + ')');
});

test('o ressalto da rede é fraco — corda absorve', () => {
    // Contra o pano, a 1m de altura.
    const r = bater([0, 1.0, profundidadeDoPano(1.0)], [0, 0, 18]);
    assert.ok(Math.abs(r.vd) < 18 * 0.3,
        'a rede devolveu ' + Math.abs(r.vd).toFixed(1) + ' m/s de 18');
});

test('bola contra a lateral da rede não a atravessa', () => {
    const r = bater([LARGURA_BALIZA / 2, 1.0, 0.5], [8, 0, 2]);
    assert.ok(r.x <= LARGURA_BALIZA / 2 - rB + 1e-6, 'saiu pela lateral: x=' + r.x.toFixed(2));
    assert.ok(r.vx <= 0, 'devia deixar de ir para fora');
});

test('bola contra o pano de cima não sobe acima da barra', () => {
    const r = bater([0, ALTURA_BALIZA, 0.4], [0, 6, 3]);
    assert.ok(r.y <= ALTURA_BALIZA - rB + 1e-6, 'passou o pano de cima: y=' + r.y.toFixed(2));
    assert.ok(r.vy <= 0, 'devia deixar de subir');
});

test('a baliza do lado negativo comporta-se igual', () => {
    const pos = bater([0, 1.5, 1.0], [0, 0, 12], 1);
    const neg = bater([0, 1.5, 1.0], [0, 0, 12], -1);
    assert.ok(Math.abs(pos.d - neg.d) < 1e-9, 'as duas balizas tem de ser simetricas');
});

test('a bola nunca é empurrada para fora da baliza pela frente', () => {
    const r = bater([0, 1.0, 0.05], [0, 0, -1]);
    assert.ok(r.d >= 0, 'saiu pela linha para tras: d=' + r.d.toFixed(2));
});
