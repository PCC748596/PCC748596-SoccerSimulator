/*
Teste unitário para os prazos de bola parada (SetPiecePrazos) e integridade de constantes.
Corre com: node --test tests/prazos_bola_parada.test.js
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcTactics = semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'tactics.js'), 'utf8'));
const srcMatchLoop = semCR(fs.readFileSync(path.join(raiz, 'js', 'match', 'match_loop.js'), 'utf8'));

// Executa tactics.js num sandbox mínimo
const sandbox = {
    window: {},
    cameraMode: '',
    cameraZoom: 1.0,
    isPaused: false,
    CAMPO_COMP: 106,
    CAMPO_LARG: 68
};

const fn = new Function('window', 'CAMPO_COMP', 'CAMPO_LARG', `${srcTactics}; return { SetPiecePrazos, ESPERA_APOS_REPOSICAO, APITO_ANTES_DA_SAIDA };`);
const { SetPiecePrazos, ESPERA_APOS_REPOSICAO, APITO_ANTES_DA_SAIDA } = fn(sandbox.window, sandbox.CAMPO_COMP, sandbox.CAMPO_LARG);

test('1 — SetPiecePrazos existe e tem todos os valores canónicos', () => {
    assert.ok(SetPiecePrazos, 'SetPiecePrazos está definido');
    assert.strictEqual(SetPiecePrazos.canto, 20.0, 'prazo do canto é 20s');
    assert.strictEqual(SetPiecePrazos.falta, 15.0, 'prazo da falta é 15s');
    assert.strictEqual(SetPiecePrazos.penalti, 15.0, 'prazo do penálti é 15s');
    assert.strictEqual(SetPiecePrazos.lateral, 15.0, 'prazo do lateral é 15s');
    assert.strictEqual(SetPiecePrazos.tiroDeMeta, 20.0, 'prazo do tiro de meta é 20s');
});

test('2 — match_loop.js lê SetPiecePrazos em todos os 5 timeouts de bola parada', () => {
    assert.ok(srcMatchLoop.includes('SetPiecePrazos.canto'), 'match_loop usa SetPiecePrazos.canto');
    assert.ok(srcMatchLoop.includes('SetPiecePrazos.falta'), 'match_loop usa SetPiecePrazos.falta');
    assert.ok(srcMatchLoop.includes('SetPiecePrazos.penalti'), 'match_loop usa SetPiecePrazos.penalti');
    assert.ok(srcMatchLoop.includes('SetPiecePrazos.lateral'), 'match_loop usa SetPiecePrazos.lateral');
    assert.ok(srcMatchLoop.includes('SetPiecePrazos.tiroDeMeta'), 'match_loop usa SetPiecePrazos.tiroDeMeta');
});
