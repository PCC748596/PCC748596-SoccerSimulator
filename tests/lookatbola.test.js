/*
lookAtBola() orienta jogadores: só o eixo Y (guinada) deve mudar.

Um jogador é um boneco de pé — nunca inclina nem roda o corpo todo para
olhar para uma bola que está acima ou abaixo da altura da origem do modelo.
Chamar model.lookAt() com a posição 3D crua da bola inclina o modelo inteiro
(bola no ar => deitado de costas; direcção quase vertical => o lookAt degenera
e o modelo roda sobre si próprio).
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function carregarLookAtBola() {
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'utils.js'), 'utf8');
    const sandbox = { console, Math, THREE: {}, DebugRot: { ativo: false } };
    vm.createContext(sandbox);
    // DebugRot é instrumentação temporária e precisa de THREE.Euler real.
    return vm.runInContext(src + '\n;DebugRot.ativo = false; lookAtBola', sandbox);
}

/* Modelo falso: registra o ponto que chegou ao .lookAt() do Three. */
function modeloFalso(x, y, z) {
    return {
        position: { x: x, y: y, z: z },
        recebido: null,
        /* Object3D.lookAt aceita (Vector3) ou (x, y, z) — os dois passam aqui. */
        lookAt: function (a, b, c) {
            this.recebido = (typeof a === 'number') ? { x: a, y: b, z: c }
                                                    : { x: a.x, y: a.y, z: a.z };
        }
    };
}

test('lookAtBola ignora a altura de um alvo acima do modelo', () => {
    const lookAtBola = carregarLookAtBola();
    const m = modeloFalso(0, 0, 0);
    lookAtBola(m, { x: 0.5, y: 2.4, z: 0.5 });
    assert.strictEqual(m.recebido.y, m.position.y);
    assert.strictEqual(m.recebido.x, 0.5);
    assert.strictEqual(m.recebido.z, 0.5);
});

test('lookAtBola ignora a altura de um alvo abaixo do modelo', () => {
    const lookAtBola = carregarLookAtBola();
    const m = modeloFalso(0, 1.2, 0);
    lookAtBola(m, { x: 3, y: 0.11, z: -4 });
    assert.strictEqual(m.recebido.y, 1.2);
});

test('lookAtBola nao altera o vector que o chamador passou', () => {
    const lookAtBola = carregarLookAtBola();
    const m = modeloFalso(0, 0, 0);
    const alvo = { x: 1, y: 2.4, z: 1 };
    lookAtBola(m, alvo);
    assert.strictEqual(alvo.y, 2.4);
});
