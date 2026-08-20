/*
O harness headless: o jogo inteiro a correr em jsdom, sem browser. Existe para
os testes de comportamento poderem medir o que acontece EM CAMPO ao fim de N
frames, e nao so o que uma funcao pura devolve.
*/
const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const { ctx, novoJogo } = require('./headless.js');

test('o jogo arranca sem browser', () => {
    novoJogo();
    assert.strictEqual(vm.runInContext('Match.players.length', ctx), 11);
    assert.strictEqual(vm.runInContext('Match.opponents.length', ctx), 11);
});

test('o tempo corre e a bola fica em campo', () => {
    novoJogo();
    vm.runInContext('for (let i = 0; i < 60; i++) Match.update(0.016);', ctx);
    const b = vm.runInContext(
        '({ x: Match.ball.position.x, y: Match.ball.position.y, z: Match.ball.position.z })', ctx);

    /*
    Nao se testa "a bola esta no chao": ela pode estar no ar num alivio, e a
    versao anterior deste teste falhava uma corrida em cada seis por isso.
    O que se testa e que a fisica nao divergiu — dentro do estadio e acima
    da relva.
    */
    assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.z),
        'posicao nao finita: ' + JSON.stringify(b));
    assert.ok(b.y >= 0.10 && b.y < 30, 'y fora do estadio: ' + b.y);
    assert.ok(Math.abs(b.x) < 60 && Math.abs(b.z) < 80, 'bola fora do estadio: ' + JSON.stringify(b));
});
