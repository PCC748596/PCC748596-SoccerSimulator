/*
O JOGADOR QUE SAÍA DO CAMPO EM LINHA RECTA.

Medido no headless: corpos a |x| = 60 m — vinte e seis metros para lá da linha
lateral, para lá da própria bancada. O rasto era sempre igual: `MOVE_TO_POS`,
velocidade CONGELADA no mesmo valor durante centenas de frames, e a posição a
integrá-la.

A cadeia:

  1. `actEsperarDevolucao` (tabelinha) e `actOverlap` mudavam o estado para
     RUN_INTO_SPACE mas NÃO punham `p.runTimer` — só o `actRunIntoSpace` o
     fazia;
  2. o `case 'RUN_INTO_SPACE'` da FSM aborta à entrada quando `runTimer <= 0`,
     e o aborto fazia `changeState('MOVE_TO_POS')` + `break` sem tocar na
     velocidade;
  3. o `player.update` integra a velocidade a seguir, corra ou não corra a
     direcção — logo o frame ficava sem ninguém a guiar;
  4. as guardas da tabelinha e do overlap não olham para o `runCooldown`, por
     isso a árvore voltava a pedir RUN_INTO_SPACE no frame seguinte. O ciclo
     fechava-se e o jogador coasteava para fora do campo para sempre.

Este teste fixa as três ligações. A medição está em
`tools/headless/fora_do_campo.js`.

Corre com: node --test tests/corrida_abortada.test.js
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcFsm = semCR(fs.readFileSync(path.join(raiz, 'js', 'fsm.js'), 'utf8'));
const srcBt = semCR(fs.readFileSync(path.join(raiz, 'js', 'bt', 'player_bt.js'), 'utf8'));

function corpoDaFuncao(src, nome) {
    const ini = src.indexOf(`function ${nome}(`);
    assert.ok(ini > 0, `${nome} não encontrado`);
    const fim = src.indexOf(LF + '}', ini);
    return src.slice(ini, fim + 2);
}

test('o aborto do RUN_INTO_SPACE guia o jogador no mesmo frame', () => {
    const ini = srcFsm.indexOf("case 'RUN_INTO_SPACE'");
    assert.ok(ini > 0, 'case RUN_INTO_SPACE não encontrado');
    const ramo = srcFsm.slice(ini, srcFsm.indexOf("case 'CARRY'", ini));

    const aborto = ramo.slice(ramo.indexOf('runCooldown'), ramo.indexOf('break;'));
    assert.ok(/steerArrive\(/.test(aborto),
        'o aborto voltou a deixar um frame sem ninguém a guiar: a velocidade antiga fica a integrar e o jogador sai do campo');
});

test('quem pede RUN_INTO_SPACE põe também o runTimer', () => {
    for (const nome of ['actEsperarDevolucao', 'actOverlap']) {
        const corpo = corpoDaFuncao(srcBt, nome);
        assert.ok(/changeState\('RUN_INTO_SPACE'\)/.test(corpo),
            `${nome} já não pede RUN_INTO_SPACE — este teste precisa de ser revisto`);
        assert.ok(/p\.runTimer\s*=/.test(corpo),
            `${nome} pede RUN_INTO_SPACE sem pôr runTimer: a FSM aborta à entrada, todos os frames`);
    }
});

/*
O `runTarget` DEIXOU DE EXISTIR — e este teste guarda isso.

A corrida ao espaço era criada pelo `actRunIntoSpace`, que fixava um destino em
`p.runTarget` e o relia nos frames seguintes. Essa folha foi substituída pelo
`actInfiltrar` (Setembro de 2026), que escreve o destino directamente no
`dynamicTarget` e não guarda estado nenhum à parte. Se alguém voltar a pôr um
`runTarget` sem o voltar a criar em TODAS as folhas, volta o
"Cannot read properties of null (reading 'z')" que este ficheiro documenta.
*/
test('ninguém escreve nem lê um runTarget', () => {
    for (const src of [srcBt, srcFsm]) {
        assert.ok(!/runTarget/.test(src),
            'voltou a haver runTarget: ou o põem todas as folhas, ou não o põe nenhuma');
    }
});

/*
QUEM CRIA A CORRIDA AO ESPAÇO É O `actInfiltrar`.

Era o `actRunIntoSpace`, apagado com a folha `CorrerNoEspaco`. O prazo da
corrida continua a ter de ser posto por quem a pede — é a condição de entrada
do estado na FSM.
*/
test('a folha da corrida ao espaço põe prazo e destino', () => {
    const corpo = corpoDaFuncao(srcBt, 'actInfiltrar');
    assert.ok(/p\.runTimer = /.test(corpo), 'a corrida ao espaço deixou de ter prazo próprio');
    assert.ok(/p\.dynamicTarget\.set\(/.test(corpo), 'a corrida ao espaço deixou de fixar destino');
    assert.ok(/avancoDeInfiltracao/.test(corpo),
        'e o destino tem de ser para a FRENTE (ver tests/infiltracao_para_a_frente.test.js)');
});
