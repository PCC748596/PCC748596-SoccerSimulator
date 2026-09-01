/*
O CHUTÃO QUE RELANÇAVA UMA BOLA QUE JÁ NÃO ERA DELE.

Sintoma: a trajectória do canto cortada a meio, com a bola no ar e ninguém por
perto. Apanhado a instrumentar as escritas em `Match.ballVel` — um cruzamento a
17.0 m/s, a 5.3 m de altura, com o guarda-redes mais próximo a 10.7 m, a passar
de repente para 28.5 m/s. A pilha apontava para `puntBall`.

A causa: o chutão e o lançamento do guarda-redes são `ActionState`, e o efeito
cai no `contactTime` do clip — uns décimos DEPOIS da decisão. Nesse intervalo a
bola pode deixar de ser dele: uma bola parada marcada entretanto limpa o
`hasBall` de toda a gente no `setupSetPiece`. O gesto continua a correr, porque
o `updateGK` conduz o `gkKickAction` fora da FSM e nunca passa pelo
`changeState`, que é quem limpa os `actionState` pendurados.

Chegado o contacto, o `Match.ballVel.set` do `puntBall` reescrevia a velocidade
da bola que estivesse em jogo, onde quer que ela estivesse.

Corre com: node --test tests/gk_chutao_sem_bola.test.js
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcPlayer = semCR(fs.readFileSync(path.join(raiz, 'js', 'player.js'), 'utf8'));

function corpoDoMetodo(nome) {
    const ini = srcPlayer.indexOf(`    ${nome}(`);
    assert.ok(ini > 0, `${nome} não encontrado`);
    const fim = srcPlayer.indexOf(LF + '    }', ini);
    return srcPlayer.slice(ini, fim);
}

test('o chutão aborta quando a bola já não é do guarda-redes', () => {
    const corpo = corpoDoMetodo('puntBall');
    const guarda = corpo.slice(0, corpo.indexOf('const gGrav'));
    assert.ok(/!this\.hasBall/.test(guarda),
        'o puntBall voltou a relançar sem verificar se a bola é dele');
    assert.ok(/Match\.ballCarrier && Match\.ballCarrier !== this/.test(guarda),
        'falta a verificação do ballCarrier: outro jogador pode ter ficado com ela');
    assert.ok(/return;/.test(guarda), 'a guarda não aborta');
});

test('o lançamento com a mão tem a mesma guarda', () => {
    const corpo = corpoDoMetodo('releaseFromHands');
    const guarda = corpo.slice(0, corpo.indexOf('const alvo'));
    assert.ok(/!this\.hasBall/.test(guarda),
        'o releaseFromHands também escreve a velocidade da bola no contacto do clip');
});

test('o gesto abortado não fica pendurado', () => {
    /*
    Sem limpar o `gkKickAction` e o `gkEstado`, o guarda-redes ficava no estado
    'chutando' para sempre — o mesmo tipo de encrave do actionState pendurado
    que já custou sete jogos parados num lote (ver actionstate_pendurado).
    */
    for (const nome of ['puntBall', 'releaseFromHands']) {
        const corpo = corpoDoMetodo(nome);
        const guarda = corpo.slice(0, corpo.indexOf('return;') + 8);
        assert.ok(/gkKickAction = null/.test(guarda), `${nome}: o ActionState fica pendurado`);
        assert.ok(/gkEstado = 'idle'/.test(guarda), `${nome}: o guarda-redes fica preso a chutar`);
    }
});

test('a guarda não pode depender do estado do gesto', () => {
    /*
    A tentação é abortar por `gkEstado !== 'chutando'`. Não serve: o gesto está
    a correr, é por isso que o contacto disparou. O que mudou foi a POSSE.
    */
    const corpo = corpoDoMetodo('puntBall');
    const guarda = corpo.slice(0, corpo.indexOf('const gGrav'));
    assert.ok(!/gkEstado !== /.test(guarda),
        'a guarda está a testar o estado do gesto em vez da posse da bola');
});
