/*
NA TRANSIÇÃO DEFENSIVA NINGUÉM SOBE.

Team State `T.Defensive` são os primeiros 3 s depois de perder a bola (ver
`TeamBlackboard.tick`, js/bt/team_bt.js). Nesses segundos o bloco continua
desenhado à volta da BOLA — e se ela ficou no meio-campo adversário, o slot de
quem estava recuado fica À FRENTE dele: o jogador sobe enquanto a equipa devia
estar a recuperar. Medido antes da regra, a 0.05 s da troca de posse: quatro
defesas com o alvo alisado 10 a 21 m à frente, mais cinco jogadores em MARKING
a subir para colar aos seus homens.

A regra tem de existir em TRÊS sítios, e é isso que este teste fixa:

  1. no alvo CRU da camada posicional (computeBlock/posicionar, team_bt.js);
  2. DEPOIS do alisamento — o `PositionSmoothing` traz o valor da fase
     ofensiva durante mais de um segundo;
  3. na MARCAÇÃO (actMarcar, player_bt.js), que corre depois e reescreve o
     alvo.

Corre com: node --test tests/transicao_defensiva.test.js
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcTeam = semCR(fs.readFileSync(path.join(raiz, 'js', 'bt', 'team_bt.js'), 'utf8'));
const srcPlayer = semCR(fs.readFileSync(path.join(raiz, 'js', 'bt', 'player_bt.js'), 'utf8'));
const srcTac = semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'tactics.js'), 'utf8'));

function valorDoConfig(nome) {
    const i = srcTac.indexOf(nome + ':');
    if (i < 0) throw new Error(nome + ' não encontrado no config');
    return srcTac.slice(i + nome.length + 1).trim().split(/[,\n]/)[0].trim();
}

test('as constantes da regra estão no config', () => {
    assert.strictEqual(valorDoConfig('transicaoDefensivaRecuaSo'), 'true',
        'a regra da transição defensiva está desligada');
    const folga = parseFloat(valorDoConfig('folgaTransicao'));
    assert.ok(folga >= 0 && folga <= 3,
        `folgaTransicao=${folga}: fora do que é tolerar meio passo`);
});

test('a camada posicional corta o alvo cru e o alvo alisado', () => {
    const cortes = srcTeam.split('BlockShape.transicaoDefensivaRecuaSo').length - 1;
    assert.ok(cortes >= 2,
        `só ${cortes} corte(s) no team_bt: falta o de depois do alisamento (o alvo ` +
        'alisado traz o valor da fase ofensiva durante mais de um segundo)');
    assert.ok(srcTeam.includes('TeamState.TRANSITION_DEFENSIVE'),
        'o corte não está preso ao Team State T.Defensive');
});

test('a marcação também não sobe na transição', () => {
    const ini = srcPlayer.indexOf('function actMarcar(');
    const fim = srcPlayer.indexOf(LF + '}' + LF, ini);
    const corpo = srcPlayer.slice(ini, fim);
    assert.ok(corpo.includes('TRANSITION_DEFENSIVE'),
        'o actMarcar volta a mandar o marcador subir para o homem na transição');
    assert.ok(corpo.includes('bbM.chaser !== p'),
        'a guarda da marcação tem de deixar passar quem vai à bola');
});

test('quem vai à bola fica de fora da regra, nos dois sítios', () => {
    // Sem esta excepção a pressão deixava de existir: o chaser é o único que
    // TEM de ir para a frente com a equipa a recuperar.
    const ocorrencias = srcTeam.split('bb.chaser !== p').length - 1;
    assert.ok(ocorrencias >= 2,
        `o chaser só está excluído em ${ocorrencias} dos cortes do team_bt`);
});
