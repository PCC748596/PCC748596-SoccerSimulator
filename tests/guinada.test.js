/*
passoDeGuinada(): limite de velocidade angular da viragem do corpo.

Sem limite, o corpo vira o que for preciso num frame — nas inversões de ~180°
(passe para trás, disputa de bola) dava 50-160° por frame, ou seja 3000+ °/s,
que se vê como o boneco a rodopiar.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function carregar() {
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'utils.js'), 'utf8');
    const sandbox = { console, Math, THREE: {}, DebugRot: { ativo: false } };
    vm.createContext(sandbox);
    return vm.runInContext(src + '\n;DebugRot.ativo = false; ({ passoDeGuinada, guinadaPara })', sandbox);
}

const G = Math.PI / 180;

test('passo pequeno chega ao alvo no mesmo frame', () => {
    const { passoDeGuinada } = carregar();
    const r = passoDeGuinada(0, 5 * G, 1 / 60, 500 * G);
    assert.ok(Math.abs(r - 5 * G) < 1e-9);
});

test('inversao de 180 graus fica limitada ao passo maximo', () => {
    const { passoDeGuinada } = carregar();
    const dt = 1 / 60, velMax = 500 * G;
    const r = passoDeGuinada(0, Math.PI, dt, velMax);
    assert.ok(Math.abs(r) <= velMax * dt + 1e-9, 'passo ' + (r / G) + '° excede o maximo');
    assert.ok(Math.abs(r) > 0, 'tem de progredir');
});

test('atravessa o descontinuo de +-PI pelo caminho curto', () => {
    const { passoDeGuinada } = carregar();
    /*
    De 175° para -175° o caminho curto sao +10° (passa por 180°/-180°), nao
    -350°. Com o passo limitado a 4°, tem de ir para 179° — ir para 171° seria
    o caminho longo.
    */
    const r = passoDeGuinada(175 * G, -175 * G, 1 / 60, 240 * G);   // passo = 4°
    assert.ok(Math.abs(r - 179 * G) < 1e-9, 'deu ' + (r / G) + '°');
});

test('velocidade angular nunca passa do tecto, em qualquer angulo', () => {
    const { passoDeGuinada } = carregar();
    const dt = 1 / 60, velMax = 500 * G;
    for (let a = -180; a <= 180; a += 7) {
        const r = passoDeGuinada(0, a * G, dt, velMax);
        const andou = Math.abs(Math.atan2(Math.sin(r), Math.cos(r)));
        assert.ok(andou <= velMax * dt + 1e-9, 'alvo ' + a + '° andou ' + (andou / G) + '°');
    }
});

test('guinadaPara mira o alvo com a convencao de frente em +Z', () => {
    const { guinadaPara } = carregar();
    // Alvo em +Z puro => guinada 0. Em +X puro => +90°.
    assert.ok(Math.abs(guinadaPara({ x: 0, z: 0 }, 0, 5)) < 1e-9);
    assert.ok(Math.abs(guinadaPara({ x: 0, z: 0 }, 5, 0) - Math.PI / 2) < 1e-9);
    assert.ok(Math.abs(guinadaPara({ x: 0, z: 0 }, 0, -5) - Math.PI) < 1e-9);
});
