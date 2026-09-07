/*
INFILTRAR É PARA A FRENTE, E MAIS NADA.

Pedido: "infiltração é somente o movimento para frente em direção ao gol
adversário; não existe infiltração em movimento para trás em direção ao próprio
gol".

O `destinoDeCorrida` já o exigia; o `actInfiltrar` e o `actOverlap` calculavam
o alvo à mão e podiam pô-lo atrás do jogador por duas vias — o tecto do campo
(`min(CAMPO_COMP/2 - 2, avanço + 20)` para quem já está junto à linha de fundo)
e o tecto do fora-de-jogo (quem está em posição irregular tem a linha atrás de
si). `avancoDeInfiltracao` (utils.js) é a peça que faltava.

Corre com: node --test tests/infiltracao_para_a_frente.test.js
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcUtils = semCR(fs.readFileSync(path.join(raiz, 'js', 'utils.js'), 'utf8'));
const srcPass = semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'passing.js'), 'utf8'));
const srcBT = semCR(fs.readFileSync(path.join(raiz, 'js', 'bt', 'player_bt.js'), 'utf8'));
const srcFSM = semCR(fs.readFileSync(path.join(raiz, 'js', 'fsm.js'), 'utf8'));

const CAMPO_COMP = 106, CAMPO_LARG = 68, LINHA_FUNDO = CAMPO_COMP / 2;
const ALTURA_CABECA = 1.72;

function extrairObjecto(src, nome, extras) {
    const ini = src.indexOf(`const ${nome} = {`);
    if (ini < 0) throw new Error(`${nome} não encontrado`);
    const fim = src.indexOf(LF + '};', ini);
    const nomes = Object.keys(extras || {});
    return new Function(...nomes, `${src.slice(ini, fim + 3)}; return ${nome};`)
        (...nomes.map(n => extras[n]));
}
function extrairFuncao(src, nome) {
    const ini = src.indexOf(`function ${nome}(`);
    if (ini < 0) throw new Error(`${nome} não encontrada`);
    const fim = src.indexOf(LF + '}' + LF, ini);
    return src.slice(ini, fim + 3);
}

const RunIntoSpaceModel = extrairObjecto(srcPass, 'RunIntoSpaceModel',
    { CAMPO_COMP, CAMPO_LARG, ALTURA_CABECA, Math });
const stubs = { CAMPO_COMP, CAMPO_LARG, LINHA_FUNDO, RunIntoSpaceModel, Math };
const avancoLegalDeCorrida = new Function(...Object.keys(stubs),
    extrairFuncao(srcUtils, 'avancoLegalDeCorrida') + '; return avancoLegalDeCorrida;')
    (...Object.values(stubs));
const avancoDeInfiltracao = new Function(...Object.keys(stubs), 'avancoLegalDeCorrida',
    extrairFuncao(srcUtils, 'avancoDeInfiltracao') + '; return avancoDeInfiltracao;')
    (...Object.values(stubs), avancoLegalDeCorrida);

const G = RunIntoSpaceModel.ganhoMinimo;

test('o ganho mínimo vive no config', () => {
    assert.strictEqual(typeof G, 'number');
    assert.ok(G > 0, 'uma infiltração tem de GANHAR terreno, não empatar');
});

test('no meio do campo a infiltração vale, e é para a frente', () => {
    const destino = avancoDeInfiltracao({ avancoActual: 0, avancoPedido: 20 });
    assert.strictEqual(destino, 20);
    assert.ok(destino > 0, 'o destino tem de estar à frente dele');
});

test('junto à linha de fundo NÃO há infiltração (era o caso do tecto do campo)', () => {
    // A 1 m da linha de fundo: min(CAMPO_COMP/2 - 2, avanço + 20) dava 51, que
    // está 1 m ATRÁS dele. Era isto que o punha a correr para a própria baliza.
    const avanco = LINHA_FUNDO - 1.0;                      // 52
    const antigo = Math.min(CAMPO_COMP / 2 - 2.0, avanco + 20.0);
    assert.ok(antigo < avanco, 'o cenário tem de reproduzir o alvo para trás');
    assert.strictEqual(avancoDeInfiltracao({ avancoActual: avanco, avancoPedido: avanco + 20 }), null);
});

test('o tecto do fora-de-jogo não o manda para trás', () => {
    // Ele já está 3 m em posição irregular: a linha está ATRÁS dele.
    const destino = avancoDeInfiltracao({
        avancoActual: 30, avancoPedido: 50, offsideLimitDir: 27
    });
    assert.strictEqual(destino, null, 'recuar até à linha não é infiltrar — é voltar');
});

test('com a linha à frente, corta nela e continua a valer', () => {
    const destino = avancoDeInfiltracao({
        avancoActual: 10, avancoPedido: 30, offsideLimitDir: 25
    });
    assert.strictEqual(destino, 24.5, 'corta em offsideLimitDir - 0.5');
    assert.ok(destino >= 10 + G);
});

test('um ganho abaixo do mínimo não é uma infiltração', () => {
    assert.strictEqual(avancoDeInfiltracao({ avancoActual: 0, avancoPedido: G - 0.5 }), null);
    assert.strictEqual(avancoDeInfiltracao({ avancoActual: 0, avancoPedido: G }), G);
});

test('as duas folhas que calculavam o alvo à mão usam a função', () => {
    for (const nome of ['actInfiltrar', 'actOverlap']) {
        const corpo = extrairFuncao(srcBT, nome);
        assert.ok(corpo.includes('avancoDeInfiltracao'),
            `${nome} voltou a calcular o avanço à mão`);
        assert.ok(/=== null\)/.test(corpo),
            `${nome} tem de DESISTIR quando não há espaço à frente, não seguir com o alvo`);
    }
});

test('a condição da infiltração desiste antes de gastar o frame', () => {
    const corpo = extrairFuncao(srcBT, 'podeInfiltrar');
    assert.ok(corpo.includes('avancoDeInfiltracao'),
        'sem isto a condição diz SIM, a acção recusa, e o ramo devolve SUCCESS à mesma');
});

test('a FSM aborta uma corrida cujo alvo esteja atrás', () => {
    const ini = srcFSM.indexOf("case 'RUN_INTO_SPACE'");
    const corpo = srcFSM.slice(ini, ini + 3000);
    assert.ok(corpo.includes('alvoAtras'), 'a rede de segurança do estado desapareceu');
    assert.ok(corpo.includes('* p.dirZ) < -1.0'),
        'o teste do alvo atrás tem de ser no referencial de ataque do jogador');
});
