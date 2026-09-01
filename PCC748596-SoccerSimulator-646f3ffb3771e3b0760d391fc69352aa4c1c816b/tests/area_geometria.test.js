/*
Teste unitário para a geometria e predicados da grande e pequena área (Area / LINHA_FUNDO).
Corre com: node --test tests/area_geometria.test.js
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcPhysics = semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'physics.js'), 'utf8'));

// Executa physics.js em sandbox mínimo
const sandbox = {
    THREE: {
        Vector3: function (x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; },
        Matrix4: function () { },
        Quaternion: function () { },
        Line3: function () { },
        MathUtils: { clamp: (v, min, max) => Math.max(min, Math.min(max, v)) }
    },
    window: {}
};

const fn = new Function('THREE', 'window', `${srcPhysics}; return { Area, LINHA_FUNDO, MEIA_LARGURA_CAMPO, CAMPO_COMP, CAMPO_LARG, AREA_GRANDE_PROF, AREA_GRANDE_MEIA_LARG };`);
const { Area, LINHA_FUNDO, MEIA_LARGURA_CAMPO, CAMPO_COMP, CAMPO_LARG, AREA_GRANDE_PROF, AREA_GRANDE_MEIA_LARG } = fn(sandbox.THREE, sandbox.window);

test('1 — dimensões canónicas da área', () => {
    assert.strictEqual(CAMPO_COMP, 106, 'comprimento do campo é 106 m');
    assert.strictEqual(CAMPO_LARG, 68, 'largura do campo é 68 m');
    assert.strictEqual(LINHA_FUNDO, 53.0, 'linha de fundo fica a 53.0 m do centro');
    assert.strictEqual(MEIA_LARGURA_CAMPO, 34.0, 'linha lateral fica a 34.0 m do centro');

    assert.strictEqual(Area.profundidade, 16.5, 'profundidade da grande área é 16.5 m');
    assert.strictEqual(Area.meiaLargura, 20.16, 'meia-largura da grande área é 20.16 m');
    assert.strictEqual(Area.largura, 40.32, 'largura total da grande área é 40.32 m');

    assert.strictEqual(Area.pequenaProfundidade, 5.5, 'profundidade da pequena área é 5.5 m');
    assert.strictEqual(Area.pequenaMeiaLargura, 9.16, 'meia-largura da pequena área é 9.16 m');
    assert.strictEqual(Area.pequenaLargura, 18.32, 'largura total da pequena área é 18.32 m');

    assert.strictEqual(Area.distanciaPenalti, 11.0, 'marca de penálti a 11.0 m');
    assert.strictEqual(Area.raioMeiaLua, 9.15, 'raio da meia-lua é 9.15 m');

    assert.strictEqual(AREA_GRANDE_PROF, Area.profundidade, 'alias AREA_GRANDE_PROF consistente');
    assert.strictEqual(AREA_GRANDE_MEIA_LARG, Area.meiaLargura, 'alias AREA_GRANDE_MEIA_LARG consistente');
});

test('2 — Area.contem sem lado especificado (qualquer baliza)', () => {
    // Baliza em Z negativo (TeamA defende Z = -53: área vai de -53 a -36.5)
    assert.strictEqual(Area.contem(0, -50), true, 'centro da área Z-');
    assert.strictEqual(Area.contem(15, -40), true, 'dentro da área Z- lateral');
    assert.strictEqual(Area.contem(20.16, -36.5), true, 'quina da grande área Z-');
    assert.strictEqual(Area.contem(20.17, -40), false, 'fora da largura da área Z-');
    assert.strictEqual(Area.contem(0, -36.4), false, 'fora da profundidade da área Z- (mais perto do meio-campo)');
    assert.strictEqual(Area.contem(0, -53.1), false, 'atrás da linha de fundo Z-');

    // Baliza em Z positivo (TeamB defende Z = +53: área vai de +36.5 a +53)
    assert.strictEqual(Area.contem(0, 50), true, 'centro da área Z+');
    assert.strictEqual(Area.contem(-15, 40), true, 'dentro da área Z+ lateral');
    assert.strictEqual(Area.contem(20.16, 36.5), true, 'quina da grande área Z+');
    assert.strictEqual(Area.contem(20.17, 40), false, 'fora da largura da área Z+');
    assert.strictEqual(Area.contem(0, 36.4), false, 'fora da profundidade da área Z+ (mais perto do meio-campo)');
    assert.strictEqual(Area.contem(0, 53.1), false, 'atrás da linha de fundo Z+');

    // Meio-campo
    assert.strictEqual(Area.contem(0, 0), false, 'meio-campo');
});

test('3 — Area.contem com lado especificado (+1 ou -1)', () => {
    // ladoZ = -1 (baliza em Z = -53)
    assert.strictEqual(Area.contem(0, -45, -1), true, 'dentro da baliza Z- com ladoZ=-1');
    assert.strictEqual(Area.contem(0, 45, -1), false, 'dentro da baliza Z+ com ladoZ=-1 deve ser false');

    // ladoZ = +1 (baliza em Z = +53)
    assert.strictEqual(Area.contem(0, 45, 1), true, 'dentro da baliza Z+ com ladoZ=+1');
    assert.strictEqual(Area.contem(0, -45, 1), false, 'dentro da baliza Z- com ladoZ=+1 deve ser false');

    // ladoZ com coordenadas explícitas (-53 ou +53)
    assert.strictEqual(Area.contem(0, -45, -53), true, 'com -53 como linha');
    assert.strictEqual(Area.contem(0, 45, 53), true, 'com +53 como linha');
});

test('4 — Area.contemPequena', () => {
    // Pequena área Z- (Z de -53 a -47.5, X de -9.16 a 9.16)
    assert.strictEqual(Area.contemPequena(0, -50), true, 'centro da pequena área Z-');
    assert.strictEqual(Area.contemPequena(9.16, -47.5), true, 'quina da pequena área Z-');
    assert.strictEqual(Area.contemPequena(10.0, -50), false, 'fora da largura da pequena área');
    assert.strictEqual(Area.contemPequena(0, -47.4), false, 'fora da profundidade da pequena área');

    // Pequena área com ladoZ
    assert.strictEqual(Area.contemPequena(0, -50, -1), true);
    assert.strictEqual(Area.contemPequena(0, 50, -1), false);
    assert.strictEqual(Area.contemPequena(0, 50, 1), true);
});
