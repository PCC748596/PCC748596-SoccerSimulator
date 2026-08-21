/*
Quem marca acompanha o homem — não vai à bola.

O marcador continuava elegível para interceptar e desarmar; bastava a bola
passar-lhe perto para largar a marca. Onze jogadores com essa liberdade dão
o jogo todo em bloco atrás da bola.

A bola é tarefa do perseguidor designado (um por equipa). Os outros seguram
a estrutura.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const BT = fs.readFileSync(path.join(raiz, 'js', 'bt', 'player_bt.js'), 'utf8');

function recortarFuncao(src, nome) {
    const i = src.indexOf('function ' + nome + '(');
    assert.ok(i >= 0, 'function ' + nome + ' nao encontrada');
    let nivel = 0;
    for (let k = src.indexOf('{', i); k < src.length; k++) {
        if (src[k] === '{') nivel++;
        else if (src[k] === '}' && --nivel === 0) return src.slice(i, k + 1);
    }
    assert.fail('chavetas desequilibradas em ' + nome);
}

function montar(chaserA, chaserB) {
    const sandbox = { Math, Match: { chaserA: chaserA || null, chaserB: chaserB || null } };
    vm.createContext(sandbox);
    vm.runInContext(recortarFuncao(BT, 'estouAMarcar') +
        '\nthis.f = estouAMarcar; this.Match = Match;', sandbox);
    return sandbox;
}

const homem = { id: 99 };

test('quem tem marca atribuída está a marcar', () => {
    const s = montar();
    assert.strictEqual(s.f({ markingTarget: homem }), true);
});

test('quem não tem marca não está a marcar', () => {
    const s = montar();
    assert.strictEqual(s.f({ markingTarget: null }), false);
});

test('o perseguidor designado não conta como marcador', () => {
    const p = { markingTarget: homem };
    const s = montar(p, null);
    assert.strictEqual(s.f(p), false, 'o chaser vai a bola, mesmo com marca');
});

test('o perseguidor da outra equipa também é reconhecido', () => {
    const p = { markingTarget: homem };
    const s = montar(null, p);
    assert.strictEqual(s.f(p), false);
});

/* ---------------------------------------------------------------- */

/*
A escolha do intercetor passou para o nível 1 (pickIntercetor, team_bt.js),
para não haver dois jogadores da mesma equipa a interceptar ao mesmo tempo —
ver tests/intercetor.test.js. A exclusão de quem marca foi com ela, e é lá
que tem de continuar a existir.
*/
test('a escolha do intercetor exclui quem está a marcar', () => {
    const TEAM = fs.readFileSync(path.join(raiz, 'js', 'bt', 'team_bt.js'), 'utf8');
    const corpo = recortarFuncao(TEAM, 'pickIntercetor');
    assert.ok(/estouAMarcar\(p\)/.test(corpo),
        'a escolha do intercetor nao verifica se o jogador esta a marcar');
});

test('podeIntercetar limita-se a obedecer à escolha da equipa', () => {
    const corpo = recortarFuncao(BT, 'podeIntercetar');
    assert.ok(/bb\.intercetor !== p/.test(corpo),
        'a folha da arvore voltou a decidir sozinha quem intercepta');
});

