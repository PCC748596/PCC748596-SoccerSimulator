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

test('podeIntercetar recusa quem está a marcar', () => {
    const corpo = recortarFuncao(BT, 'podeIntercetar');
    assert.ok(/estouAMarcar\(p\)/.test(corpo),
        'a interceptacao nao verifica se o jogador esta a marcar');
});

