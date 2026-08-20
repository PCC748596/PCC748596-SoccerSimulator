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

test('o tempo corre e a bola continua no chao', () => {
    novoJogo();
    vm.runInContext('for (let i = 0; i < 60; i++) Match.update(0.016);', ctx);
    const y = vm.runInContext('Match.ball.position.y', ctx);
    assert.ok(y >= 0.10 && y < 3.0, 'y fora do razoavel: ' + y);
});
