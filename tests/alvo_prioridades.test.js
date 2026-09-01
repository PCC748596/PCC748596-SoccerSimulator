/*
O RESOLVEDOR DE ALVOS — as prioridades (js/bt/alvo.js).

Ninguém escreve o alvo: cada camada PROPÕE com uma prioridade, e o alvo é
resolvido uma vez por frame. A regra tem duas linhas:

  1. o ALVO é a proposta mais forte (número mais baixo);
  2. aplicam-se-lhe os LIMITES de prioridade igual ou mais forte do que ele.

    1 LEIS   2 BOLA   3 SEGURO   4 ACCAO   5 ESTRUTURA   6 MICRO

Este teste corre o `resolverAlvo` a sério, extraído do ficheiro, com jogadores
de mentira. É onde a POLÍTICA do jogo fica fixada — antes disto ela era a ordem
das linhas nos ficheiros (ver docs/auditoria_nivel2.md).

Corre com: node --test tests/alvo_prioridades.test.js
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcAlvo = semCR(fs.readFileSync(path.join(raiz, 'js', 'bt', 'alvo.js'), 'utf8'));

// O ficheiro é um script clássico: corre-se inteiro num sandbox.
const ALTURA_BASE_Y = 0;
const api = new Function('ALTURA_BASE_Y', 'BlockShape', 'Match', 'PositionSmoothing',
    srcAlvo + LF + 'return { AlvoPrio, limparPropostas, proporAlvo, proporLimiteAvanco, resolverAlvo, temTarefaDeBola };'
)(ALTURA_BASE_Y, { resolverAlvoActivo: true }, { delta: 0.016, state: 'PLAY' }, 3.0);

const { AlvoPrio, limparPropostas, proporAlvo, proporLimiteAvanco, resolverAlvo } = api;

const jogador = () => ({
    dirZ: 1, role: 'mid', fsm: { currentState: 'MOVE_TO_POS' },
    model: { position: { x: 0, z: 0 } },
    dynamicTarget: { x: 0, y: 0, z: 0 }
});

// O alisamento só age quando ganha ESTRUTURA/MICRO; para comparar valores
// exactos, corre-se a resolução até assentar.
function resolverAteAssentar(p, bb, vezes) {
    let r = null;
    for (let i = 0; i < (vezes || 200); i++) r = resolverAlvo(p, bb);
    return r;
}

test('a proposta mais forte ganha', () => {
    const p = jogador();
    limparPropostas(p);
    proporAlvo(p, AlvoPrio.ESTRUTURA, 0, 10, 'slot');
    proporAlvo(p, AlvoPrio.BOLA, 5, 30, 'chaser');
    proporAlvo(p, AlvoPrio.MICRO, 0, 0, 'inquietação');
    const fonte = resolverAlvo(p, null);
    assert.strictEqual(fonte, 'chaser');
    assert.strictEqual(p.dynamicTarget.z, 30, 'o alvo de BOLA entra a direito, sem alisamento');
});

test('um limite mais forte corta o alvo', () => {
    const p = jogador();
    limparPropostas(p);
    proporAlvo(p, AlvoPrio.ACCAO, 0, 40, 'corrida');
    proporLimiteAvanco(p, AlvoPrio.SEGURO, 20, 'rest defense');
    resolverAlvo(p, null);
    assert.strictEqual(p.dynamicTarget.z, 20, 'o rest defense tinha de segurar a corrida');
    assert.strictEqual(p.alvoCortadoPor, 'rest defense');
});

test('um limite mais FRACO não fala', () => {
    const p = jogador();
    limparPropostas(p);
    proporAlvo(p, AlvoPrio.BOLA, 0, 40, 'chaser');
    proporLimiteAvanco(p, AlvoPrio.SEGURO, 20, 'rest defense');
    resolverAlvo(p, null);
    assert.strictEqual(p.dynamicTarget.z, 40,
        'quem vai à bola não pode ser preso pelo rest defense');
    assert.strictEqual(p.alvoCortadoPor, null);
});

test('as leis do jogo cortam tudo, incluindo a tarefa de bola', () => {
    const p = jogador();
    limparPropostas(p);
    proporAlvo(p, AlvoPrio.BOLA, 0, 40, 'receptor');
    proporLimiteAvanco(p, AlvoPrio.LEIS, 25, 'fora-de-jogo');
    resolverAlvo(p, null);
    assert.strictEqual(p.dynamicTarget.z, 25);
});

test('o limite só corta para trás, nunca empurra para a frente', () => {
    const p = jogador();
    limparPropostas(p);
    proporAlvo(p, AlvoPrio.ACCAO, 0, 5, 'apoio');
    proporLimiteAvanco(p, AlvoPrio.LEIS, 30, 'fora-de-jogo');
    resolverAlvo(p, null);
    assert.strictEqual(p.dynamicTarget.z, 5, 'quem está aquém do limite não é empurrado');
});

test('o avanço conta no referencial de ataque (dirZ negativo)', () => {
    const p = jogador();
    p.dirZ = -1;
    limparPropostas(p);
    proporAlvo(p, AlvoPrio.ACCAO, 0, -40, 'corrida');
    proporLimiteAvanco(p, AlvoPrio.SEGURO, 20, 'rest defense');
    resolverAlvo(p, null);
    assert.strictEqual(p.dynamicTarget.z, -20,
        'com dirZ = -1 o avanço é -z, e o corte tem de acompanhar');
});

test('sem propostas o alvo não é tocado', () => {
    const p = jogador();
    p.dynamicTarget.x = 7; p.dynamicTarget.z = 9;
    limparPropostas(p);
    const r = resolverAlvo(p, null);
    assert.strictEqual(r, null);
    assert.strictEqual(p.dynamicTarget.x, 7);
    assert.strictEqual(p.dynamicTarget.z, 9);
});

test('a estrutura é alisada; a acção e a bola entram a direito', () => {
    const p = jogador();
    limparPropostas(p);
    proporAlvo(p, AlvoPrio.ESTRUTURA, 0, 20, 'slot');
    resolverAlvo(p, null);
    assert.ok(p.dynamicTarget.z > 0 && p.dynamicTarget.z < 20,
        `alvo estrutural entrou a direito (${p.dynamicTarget.z}): o alisamento desapareceu`);
    resolverAteAssentar(p, null);
    assert.ok(Math.abs(p.dynamicTarget.z - 20) < 0.01, 'o alisamento tem de convergir para o alvo');
});

test('entre duas propostas do mesmo nível ganha a primeira', () => {
    const p = jogador();
    limparPropostas(p);
    proporAlvo(p, AlvoPrio.ACCAO, 1, 10, 'primeira');
    proporAlvo(p, AlvoPrio.ACCAO, 2, 20, 'segunda');
    assert.strictEqual(resolverAlvo(p, null), 'primeira');
});

test('a ordem dos níveis é a da auditoria', () => {
    assert.deepStrictEqual(
        [AlvoPrio.LEIS, AlvoPrio.BOLA, AlvoPrio.SEGURO,
        AlvoPrio.ACCAO, AlvoPrio.ESTRUTURA, AlvoPrio.MICRO],
        [1, 2, 3, 4, 5, 6],
        'os níveis mudaram de número: a política do jogo mudou com eles');
    assert.ok(AlvoPrio.ACCAO < AlvoPrio.ESTRUTURA,
        'a acção tem de estar ACIMA da estrutura — com a estrutura por cima o jogo pára ' +
        '(medido: 24 passes em 10 min de física, contra ~140)');
    assert.ok(AlvoPrio.SEGURO < AlvoPrio.ACCAO,
        'o rest defense tem de estar acima da acção, senão nenhuma corrida o respeita');
});
