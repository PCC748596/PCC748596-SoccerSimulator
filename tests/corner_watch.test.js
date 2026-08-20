/*
Canto: o batedor fica a olhar para dentro enquanto a bola está no ar.

O case WATCH_CORNER vive dentro de um método de 700 linhas da PlayerFSM e
depende do Match inteiro, por isso o que se testa aqui é a REGRA de saída,
recortada para uma função equivalente, mais a estrutura do disparo em fsm.js.

Foram dois defeitos, e são estes dois que os testes fixam:

  1. o WATCH_CORNER só era posto no laço de Match.players (TeamA), e num canto
     do TeamB o batedor nunca chegava a entrar no estado;
  2. a bola PARTE do chão (y = 0.11) e só passa os 0.5 m ao fim de quatro
     frames, por isso `y < 0.5` era verdade logo à cabeça e ele saía 67 ms
     depois de bater.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const FSM = fs.readFileSync(path.join(raiz, 'js', 'fsm.js'), 'utf8');

/*
A regra de saída, tal como está no case WATCH_CORNER. `estado` guarda o
`cornerBolaSubiu` entre chamadas, como a FSM faz.
*/
function passo(estado, ballY, souOUltimoATocar) {
    if (ballY > 0.5) estado.cornerBolaSubiu = true;
    const caiu = estado.cornerBolaSubiu && ballY < 0.5;
    return caiu || !souOUltimoATocar;
}

// Trajectória real da bola do canto: parte do chão com vy = 7.5, g = 15.
function trajectoria(frames) {
    const g = 15, dt = 1 / 60;
    let y = 0.11, vy = 7.5;
    const out = [];
    for (let i = 0; i < frames; i++) {
        out.push(y);
        vy -= g * dt;
        y += vy * dt;
        if (y < 0) y = 0;
    }
    return out;
}

test('a bola do canto só passa os 0.5 m depois de alguns frames', () => {
    const ys = trajectoria(10);
    assert.ok(ys[0] < 0.5, 'parte do chão: y = ' + ys[0]);
    const subiu = ys.findIndex(y => y > 0.5);
    assert.ok(subiu > 0, 'devia levar frames a subir, levou ' + subiu);
});

test('o batedor NÃO sai no primeiro frame, com a bola ainda no chão', () => {
    const estado = { cornerBolaSubiu: false };
    // Primeiro frame depois de bater: ele é o último a tocar e a bola está baixa.
    assert.strictEqual(passo(estado, 0.11, true), false,
        'era este o bug: saía 67 ms depois de bater');
});

test('aguenta a subida inteira sem sair', () => {
    const estado = { cornerBolaSubiu: false };
    for (const y of trajectoria(30)) {
        if (y > 0.5) break;
        assert.strictEqual(passo(estado, y, true), false, 'saiu a y = ' + y);
    }
});

test('sai quando a bola cai, depois de ter subido', () => {
    const estado = { cornerBolaSubiu: false };
    assert.strictEqual(passo(estado, 0.2, true), false);   // ainda no chão
    assert.strictEqual(passo(estado, 3.0, true), false);   // no ar
    assert.strictEqual(passo(estado, 0.3, true), true);    // caiu
});

test('sai assim que outro jogador toca na bola, mesmo com ela no ar', () => {
    const estado = { cornerBolaSubiu: false };
    assert.strictEqual(passo(estado, 3.0, true), false);
    assert.strictEqual(passo(estado, 3.0, false), true, 'alguém cabeceou');
});

test('a subida de um canto rasteiro não prende o batedor', () => {
    // Bola que nunca passa dos 0.5 m: sai quando outro lhe tocar.
    const estado = { cornerBolaSubiu: false };
    for (let i = 0; i < 60; i++) {
        assert.strictEqual(passo(estado, 0.2, true), false);
    }
    assert.strictEqual(passo(estado, 0.2, false), true);
});

/* ---------------------------------------------------------------- */

// O bloco que trata o canto ser batido, para os testes estruturais não
// apanharem código de outros sítios do ficheiro.
function blocoDoCanto() {
    const i = FSM.indexOf("if (Match.state === 'CORNER_KICK')");
    assert.ok(i >= 0, 'bloco do CORNER_KICK nao encontrado');
    const j = FSM.indexOf("case 'IDLE':", i);
    assert.ok(j > i, 'fim do bloco nao encontrado');
    return FSM.slice(i, j);
}

test('os dois planteis passam pelo mesmo laço', () => {
    /*
    Estavam em dois forEach separados, e só o de Match.players punha o batedor
    em WATCH_CORNER. Um laço só sobre os dois planteis torna impossível tratar
    uma equipa de maneira diferente da outra por esquecimento.

    Procura DENTRO do bloco do canto: há outro concat noutro sítio do ficheiro,
    e a primeira versão deste teste passava por causa dele — não detectava nada.
    */
    const bloco = blocoDoCanto();
    assert.ok(bloco.indexOf('Match.players.concat(Match.opponents)') >= 0,
        'o canto devia percorrer os dois planteis de uma vez');
    assert.ok(bloco.indexOf('Match.opponents.forEach') < 0,
        'ficou um laço separado para os adversários');
});

test('o WATCH_CORNER é disparado uma vez só no ficheiro', () => {
    const disparos = (FSM.match(/changeState\('WATCH_CORNER'\)/g) || []).length;
    assert.strictEqual(disparos, 1, 'apareceu ' + disparos + ' vezes');
});

test('a bandeira da subida é reposta ao entrar no estado', () => {
    // Sem isto, o segundo canto do mesmo jogador herdava o cornerBolaSubiu do
    // primeiro e ele saía logo à cabeça outra vez.
    assert.ok(/newState === 'WATCH_CORNER'\) this\.cornerBolaSubiu = false/.test(FSM),
        'o changeState devia repor a bandeira');
});

test('sai para MOVE_TO_POS, não para IDLE', () => {
    // IDLE zera a velocidade e deixa-o à espera; ele tem de voltar ao jogo.
    const i = FSM.indexOf("case 'WATCH_CORNER':");
    assert.ok(i >= 0, 'case WATCH_CORNER nao encontrado');
    const bloco = FSM.slice(i, FSM.indexOf('break;', i));
    assert.ok(bloco.indexOf("changeState('MOVE_TO_POS')") >= 0, 'devia ir para MOVE_TO_POS');
    assert.ok(bloco.indexOf("changeState('IDLE')") < 0, 'não devia ficar em IDLE');
});
