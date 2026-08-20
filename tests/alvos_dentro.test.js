/*
Nenhum alvo do nivel 2 pode ficar fora do campo nem fora do rectangulo do
bloco. O anel grande do debug e o `slotTarget`, e via-se no ecra a sair pela
linha lateral: o slotNoBloco mapeia o `u` para dentro do bloco e DEPOIS soma
os deslocamentos de corredor (2, 6 ou 8 m) sem voltar a limitar nada.

Medido antes da correccao: 3.2% das amostras fora do campo, maximo |x| = 37.6
com a meia-largura do campo em 34 (ex.: TeamA RB em -35.6 com o bloco em
[-34.0, 20.4]).
*/
const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const { ctx, novoJogo } = require('./headless.js');

function medir(setores) {
    return vm.runInContext(`
        (function () {
            Tatics.setores = ${JSON.stringify(setores)};
            let s = 4242 >>> 0;
            Math.random = function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
            Match.resetPlay(true);
            for (let i = 0; i < 180; i++) Match.update(0.016);

            const MEIA = CAMPO_LARG / 2;
            const r = { n: 0, foraCampo: 0, foraBloco: 0, maxX: 0, pior: '' };

            for (let i = 0; i < 900; i++) {
                Match.update(0.016);
                for (const eq of [['TeamA', Match.players], ['TeamB', Match.opponents]]) {
                    const bb = TeamAI.get(eq[0]);
                    for (const p of eq[1]) {
                        if (p.role === 'gk' || !p.slotTarget) continue;
                        r.n++;
                        const x = p.slotTarget.x;
                        if (Math.abs(x) > r.maxX) {
                            r.maxX = Math.abs(x);
                            r.pior = p.team + ' ' + p.pos + ' x=' + x.toFixed(1);
                        }
                        if (Math.abs(x) > MEIA) r.foraCampo++;
                        if (bb && bb.bloco && (x < bb.bloco.x0 - 0.01 || x > bb.bloco.x1 + 0.01)) {
                            r.foraBloco++;
                        }
                    }
                }
            }
            return r;
        })();
    `, ctx);
}

test('nenhum slot sai do campo, com as alas ligadas', () => {
    novoJogo();
    const r = medir(['esq', 'dir']);
    assert.ok(r.n > 1000, 'poucas amostras: ' + r.n);
    assert.strictEqual(r.foraCampo, 0,
        r.foraCampo + ' de ' + r.n + ' fora do campo; pior: ' + r.pior);
});

test('nenhum slot sai do rectângulo do bloco', () => {
    novoJogo();
    const r = medir(['esq', 'dir']);
    assert.strictEqual(r.foraBloco, 0,
        r.foraBloco + ' de ' + r.n + ' fora do bloco; pior: ' + r.pior);
});

test('nem com o centro ligado sozinho', () => {
    novoJogo();
    const r = medir(['cen']);
    assert.strictEqual(r.foraCampo, 0, 'pior: ' + r.pior);
    assert.strictEqual(r.foraBloco, 0, 'pior: ' + r.pior);
});
