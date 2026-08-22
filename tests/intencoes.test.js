/*
INTENCOES DE JOGADA — contratos entre passador e recetor.
Ver docs/superpowers/specs/2026-08-22-intencoes-de-jogada-design.md e
js/intentions.js.
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

const LIMPAR = `
    Intentions.limpar();
    Intentions.relogio = 0;
    for (const l of [Match.players, Match.opponents]) for (const j of l) j.intentCooldown = 0;
`;

test('a rota prometida e uma funcao pura do tempo', () => {
    const r = aval(`${LIMPAR}
        const p = Match.players.find(j => j.role !== 'gk');
        p.model.position.set(0, 0, 0);
        const c = Intentions.pedir(p, { x: 0, z: 1 }, 6.0, 4.0);
        return {
            em0: Intentions.posicaoEm(c, 0).z,
            em1: Math.round(Intentions.posicaoEm(c, 1).z * 100) / 100,
            em3: Math.round(Intentions.posicaoEm(c, 3).z * 100) / 100
        };
    `);
    assert.strictEqual(r.em0, 0);
    assert.strictEqual(r.em1, 6);
    assert.strictEqual(r.em3, 18);
});

test('um jogador so tem um contrato, e a equipa tem tecto', () => {
    const r = aval(`${LIMPAR}
        const campo = Match.players.filter(j => j.role !== 'gk');
        const p = campo[0];
        const c1 = Intentions.pedir(p, { x: 0, z: 1 }, 6, 4);
        const c2 = Intentions.pedir(p, { x: 0, z: 1 }, 6, 4);   // o mesmo jogador
        let extra = 0;
        for (let i = 1; i < campo.length; i++) {
            if (Intentions.pedir(campo[i], { x: 0, z: 1 }, 6, 4)) extra++;
        }
        return { c1: !!c1, c2: !!c2, abertos: Intentions.abertos('TeamA').length, extra };
    `);
    assert.ok(r.c1, 'o primeiro pedido devia passar');
    assert.strictEqual(r.c2, false, 'o mesmo jogador nao pode ter dois contratos');
    assert.ok(r.abertos <= 2, `abertos ${r.abertos} acima do tecto por equipa`);
});

test('servir so aceita um contrato aberto, e uma vez so', () => {
    const r = aval(`${LIMPAR}
        const p = Match.players.find(j => j.role !== 'gk');
        const outro = Match.players.filter(j => j.role !== 'gk')[1];
        const c = Intentions.pedir(p, { x: 0, z: 1 }, 6, 4);
        const primeiro = Intentions.servir(c, outro, { x: 5, z: 5 }, 1.0);
        const segundo = Intentions.servir(c, outro, { x: 9, z: 9 }, 1.0);
        return { primeiro, segundo, estado: c.estado, ponto: c.pontoEncontro };
    `);
    assert.strictEqual(r.primeiro, true);
    assert.strictEqual(r.segundo, false, 'dois passadores serviram o mesmo contrato');
    assert.strictEqual(r.estado, 'servido');
    assert.deepStrictEqual(r.ponto, { x: 5, z: 5 });
});

test('perder a posse derruba todos os contratos da equipa', () => {
    const r = aval(`${LIMPAR}
        const campo = Match.players.filter(j => j.role !== 'gk');
        Intentions.pedir(campo[0], { x: 0, z: 1 }, 6, 4);
        Intentions.pedir(campo[1], { x: 0, z: 1 }, 6, 4);
        const antes = Intentions.abertos('TeamA').length;

        const bb = TeamAI.get('TeamA');
        const eraAtacar = bb.isAttacking;
        bb.isAttacking = false;
        Intentions.tick(0.016);
        const depois = Intentions.abertos('TeamA').length;
        bb.isAttacking = eraAtacar;
        return { antes, depois };
    `);
    assert.ok(r.antes > 0, 'o teste nao chegou a criar contratos');
    assert.strictEqual(r.depois, 0, 'contratos sobreviveram a perda de posse');
});

test('um encontro que caia depois do fim do contrato nao e oferecido', () => {
    const r = aval(`${LIMPAR}
        const p = Match.players.find(j => j.role !== 'gk');
        p.model.position.set(0, 0, 0);
        // Contrato curtissimo: a bola nunca la chega a tempo.
        const c = Intentions.pedir(p, { x: 0, z: 1 }, 7, IntentModel.duracaoMin);
        c.tExpira = c.tPedido + 0.05;
        Match.ball.position.set(0, 0, -40);
        return { proj: Intentions.projetarEncontro(c, Match.ball.position) };
    `);
    assert.strictEqual(r.proj, null, 'ofereceu um encontro fora da janela do contrato');
});

test('o cooldown impede pedir outra vez no frame seguinte', () => {
    const r = aval(`${LIMPAR}
        const p = Match.players.find(j => j.role !== 'gk');
        const c = Intentions.pedir(p, { x: 0, z: 1 }, 6, 4);
        Intentions.cancelar(c, 'teste');
        const logoASeguir = Intentions.pedir(p, { x: 0, z: 1 }, 6, 4);
        return { cooldown: p.intentCooldown > 0, logoASeguir: !!logoASeguir };
    `);
    assert.ok(r.cooldown, 'o cancelamento nao pos o jogador em arrefecimento');
    assert.strictEqual(r.logoASeguir, false, 'pediu outra vez de imediato');
});

test('o braco so esta levantado com o contrato aberto', () => {
    const r = aval(`${LIMPAR}
        const p = Match.players.find(j => j.role !== 'gk');
        const c = Intentions.pedir(p, { x: 0, z: 1 }, 6, 4);

        p.pedirBolaIntens = 0;
        for (let i = 0; i < 40; i++) p.aplicarCamadaPedirBola(0.016);
        const aberto = p.pedirBolaIntens;

        Intentions.servir(c, Match.players[2], { x: 5, z: 5 }, 1.0);
        for (let i = 0; i < 60; i++) p.aplicarCamadaPedirBola(0.016);
        const servido = p.pedirBolaIntens;

        return { aberto: Math.round(aberto * 100) / 100, servido: Math.round(servido * 100) / 100 };
    `);
    assert.ok(r.aberto > 0.9, `braco nao subiu com o contrato aberto (${r.aberto})`);
    assert.ok(r.servido < 0.1, `braco ficou levantado depois de servido (${r.servido})`);
});
