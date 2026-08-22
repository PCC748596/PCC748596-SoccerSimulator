/*
VELOCIDADE DE CONDUCAO — o portador nao pode ser o mais lento do campo.

Medido antes (4 sementes x 150 s, mediana da velocidade por estado):

    RUN_INTO_SPACE  8.61      SUPPORT_PASS  7.62
    INTERCEPT       6.85      COM bola      6.59

Quem corre ao espaco ia 31% mais depressa do que quem tinha a bola, e ate quem
interceptava andava mais. A causa: o `actCarry` nao definia velocidade nenhuma
— so fazia changeState('CARRY') — e a FSM aplicava `speedMult * 0.95` ao valor
que sobrasse do ramo anterior. A velocidade de conducao era o resto do estado
anterior, e por isso variava de 4.7 a 8.
*/
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const { ctx } = require(path.join(raiz, 'tests', 'headless.js'));

vm.runInContext('if (!Match.players.length) { Match.init(new THREE.Scene()); for (let i=0;i<60;i++) Match.update(0.016); }', ctx);

function aval(expr) {
    return JSON.parse(vm.runInContext(`JSON.stringify((() => { ${expr} })())`, ctx));
}

test('conduzir tem velocidade propria, nao herdada do ramo anterior', () => {
    const r = aval(`
        const p = Match.players.find(j => j.role !== 'gk');
        const ctxFake = { p: p, skillSpeed: 50 };

        // Dois ramos com velocidades bem diferentes antes de conduzir.
        p.speedMult = 4.0;
        actCarry(ctxFake);
        const depoisDeLento = p.speedMult;

        p.speedMult = 9.0;
        actCarry(ctxFake);
        const depoisDeRapido = p.speedMult;

        return { depoisDeLento, depoisDeRapido };
    `);
    assert.strictEqual(r.depoisDeLento, r.depoisDeRapido,
        `a velocidade de conducao ainda depende do ramo anterior (${r.depoisDeLento} vs ${r.depoisDeRapido})`);
});

test('o portador anda a ~92% de quem corre ao espaco, e acima de quem intercepta', () => {
    const r = aval(`
        const p = Match.players.find(j => j.role !== 'gk');
        const ctxFake = { p: p, skillSpeed: 50 };

        actCarry(ctxFake);
        const carry = p.speedMult;

        // actRunIntoSpace precisa de runTarget; usa-se a formula directamente,
        // que e a mesma que ele aplica.
        const corridaAoEspaco = (7.0 + ((50 - 50) / 50) * 1.5) * 1.25 * 0.9;
        const intercepta = (5.8 + ((50 - 50) / 50) * 1.5) * 1.25 * 0.9;

        return { carry, corridaAoEspaco, intercepta, razao: carry / corridaAoEspaco };
    `);
    assert.ok(r.razao > 0.86 && r.razao < 0.98,
        `conduzir devia andar a ~92% da corrida livre, esta a ${(r.razao * 100).toFixed(0)}%`);
    assert.ok(r.carry > r.intercepta,
        `quem conduz (${r.carry.toFixed(2)}) devia andar mais do que quem intercepta (${r.intercepta.toFixed(2)})`);
});

test('a velocidade de conducao responde ao skill de velocidade', () => {
    const r = aval(`
        const p = Match.players.find(j => j.role !== 'gk');
        actCarry({ p: p, skillSpeed: 30 });
        const lento = p.speedMult;
        actCarry({ p: p, skillSpeed: 90 });
        const rapido = p.speedMult;
        return { lento, rapido };
    `);
    assert.ok(r.rapido > r.lento,
        `um jogador rapido devia conduzir mais depressa (${r.lento} vs ${r.rapido})`);
});
