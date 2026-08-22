/*
MOVIMENTACAO DOS PLAYING STYLES — pedido explicito do dono do projecto.

Quatro queixas, uma por estilo, e o teste de cada uma e a correccao dela:

  offensive_fullback  fechava para o meio e nao apoiava pela ala; tem de subir
                      ate a intermediaria contraria e ficar na linha
  roaming_flank       infiltrava-se pelo meio por sistema; so pode fechar se o
                      corredor estiver tapado OU houver linha interior aberta
  box_to_box          entrava na area; o tecto e a entrada da area, e vale
                      tambem para o ponto de apoio e para a corrida ao espaco
  dummy_runner        deslocava-se demais e para o lado do outro atacante;
                      tem de puxar menos e para o lado OPOSTO ao parceiro

Corre sobre o jogo a serio (harness headless), nao sobre uma copia da funcao:
o que interessa aqui e o alvo que sai do aplicarEstiloPosicional com um
blackboard realista.
*/
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const { ctx } = require(path.join(raiz, 'tests', 'headless.js'));

vm.runInContext('if (!Match.players.length) { Match.init(new THREE.Scene()); for (let i=0;i<60;i++) Match.update(0.016); }', ctx);

// Avalia uma expressao no contexto do jogo e devolve o resultado em JSON.
function aval(expr) {
    return JSON.parse(vm.runInContext(`JSON.stringify((() => { ${expr} })())`, ctx));
}

/*
Jogador de laboratorio: so os campos que o aplicarEstiloPosicional le. Fabricar
e mais fiavel do que ir buscar um titular ao onze, que traz o estilo e o slot
que a formacao lhe deu.
*/
const JOGADOR = `
    function jog(o) {
        return {
            role: o.role || 'mid', pos: o.pos, team: o.team || 'TeamA',
            dirZ: o.dirZ === undefined ? 1 : o.dirZ,
            playingStyle: o.estilo,
            playingStyleDesligado: false, styleAtivo: true,
            baseTarget: { x: o.ladoBase === undefined ? 20 : o.ladoBase, z: 0 },
            model: { position: { x: o.x || 0, y: 0, z: o.z || 0 } }
        };
    }
    function bb(o) {
        o = o || {};
        return {
            isAttacking: o.isAttacking === undefined ? true : o.isAttacking,
            dir: 1,
            bloco: o.bloco || { x0: -23.8, x1: 23.8, z0: -20, z1: 20 },
            carrier: o.carrier || null,
            opp: o.opp || [],
            mates: o.mates || [],
            offsideLimitDir: o.offsideLimitDir === undefined ? 30 : o.offsideLimitDir
        };
    }
`;

test('offensive full-back: com bola sobe para alem do meio-campo', () => {
    const r = aval(`${JOGADOR}
        const p = jog({ pos: 'LB', role: 'def', estilo: 'offensive_fullback', x: 20, z: -10, ladoBase: 20 });
        const semBola = aplicarEstiloPosicional(p, bb({ isAttacking: false }), 20, -10);
        const comBola = aplicarEstiloPosicional(p, bb({ isAttacking: true }), 20, -10);
        return { semBola, comBola };
    `);
    // Com a bola tem de ganhar terreno de verdade: a queixa era ficar a -9 m
    // do meio-campo com a equipa instalada no ataque.
    assert.ok(r.comBola.z - r.semBola.z >= 10,
        `avanco com bola insuficiente: ${r.semBola.z} -> ${r.comBola.z}`);
});

test('offensive full-back: fica na ala mesmo com o bloco estreito', () => {
    const r = aval(`${JOGADOR}
        const p = jog({ pos: 'LB', role: 'def', estilo: 'offensive_fullback', x: 14, z: 0, ladoBase: 20 });
        // Bloco deslocado para o lado contrario — era isto que o encolhia
        // para dentro, porque o tecto da ala era a borda do bloco.
        return aplicarEstiloPosicional(p, bb({ bloco: { x0: -30, x1: 12, z0: -20, z1: 20 } }), 8, 0);
    `);
    assert.ok(r.x >= 18, `o lateral ofensivo devia ficar na ala, ficou em x=${r.x}`);
});

test('roaming flank: com o corredor livre NAO fecha para o meio', () => {
    const r = aval(`${JOGADOR}
        const p = jog({ pos: 'RM', estilo: 'roaming_flank', x: 20, z: 0, ladoBase: 20 });
        return aplicarEstiloPosicional(p, bb({ opp: [] }), 20, 0);
    `);
    assert.ok(r.x >= 19, `fechou para o meio sem motivo: x=${r.x}`);
});

test('roaming flank: com o corredor tapado fecha para dentro', () => {
    const r = aval(`${JOGADOR}
        const p = jog({ pos: 'RM', estilo: 'roaming_flank', x: 20, z: 0, ladoBase: 20 });
        const opp = [{ role: 'def', model: { position: { x: 22, y: 0, z: 6 } } }];
        return aplicarEstiloPosicional(p, bb({ opp: opp }), 20, 0);
    `);
    assert.ok(r.x < 18, `com o corredor tapado devia procurar o meio: x=${r.x}`);
});

test('roaming flank: sem bola nao se infiltra pelo meio', () => {
    const r = aval(`${JOGADOR}
        const p = jog({ pos: 'RM', estilo: 'roaming_flank', x: 20, z: -5, ladoBase: 20 });
        return aplicarEstiloPosicional(p, bb({ isAttacking: false }), 20, -5);
    `);
    assert.ok(r.x >= 19.5, `a defender fechou para o eixo: x=${r.x}`);
});

test('box-to-box: o tecto e a entrada da area, e vale para o apoio e a corrida', () => {
    const r = aval(`${JOGADOR}
        const p = jog({ pos: 'CM', estilo: 'box_to_box', x: 0, z: 30, ladoBase: 5 });
        const alvo = aplicarTectoDoEstilo(p, 45);
        const apoio = limitarPontoAoEstilo(p, { x: 4, z: 44 });
        return { alvo, apoio };
    `);
    assert.ok(r.alvo <= 34.001, `alvo posicional passou a entrada da area: ${r.alvo}`);
    assert.ok(r.apoio.z <= 34.001, `ponto de apoio dentro da area: ${r.apoio.z}`);
});

test('dummy runner: vai para o lado OPOSTO ao do outro atacante', () => {
    const r = aval(`${JOGADOR}
        const parceiro = jog({ pos: 'CF', role: 'atk', estilo: 'fox_in_the_box', x: 12, z: 30, ladoBase: -8 });
        const p = jog({ pos: 'CF', role: 'atk', estilo: 'dummy_runner', x: 8, z: 30, ladoBase: 8 });
        const carrier = jog({ pos: 'CM', estilo: 'box_to_box', x: 0, z: 10, ladoBase: 5 });
        return aplicarEstiloPosicional(p, bb({ carrier: carrier, mates: [parceiro, carrier] }), 8, 30);
    `);
    assert.ok(r.x < 0, `foi para o mesmo lado do parceiro (x=${r.x}), devia ir para o oposto`);
});

test('dummy runner: puxa menos do que puxava (6 m eram demais)', () => {
    const r = aval(`${JOGADOR}
        const p = jog({ pos: 'CF', role: 'atk', estilo: 'dummy_runner', x: 8, z: 30, ladoBase: 8 });
        const carrier = jog({ pos: 'CM', estilo: 'box_to_box', x: 0, z: 10, ladoBase: 5 });
        // Sem parceiro: fica so o afastamento ao portador.
        const r1 = aplicarEstiloPosicional(p, bb({ carrier: carrier, mates: [carrier] }), 8, 30);
        return { desvio: Math.abs(r1.x - 8) };
    `);
    assert.ok(r.desvio <= 6.5, `deslocamento lateral ainda excessivo: ${r.desvio} m`);
});

test('cada equipa tem um lateral defensivo, e os estilos pedidos estao em campo', () => {
    const r = aval(`
        const porEquipa = {};
        for (const lado of [['TeamA', Match.players], ['TeamB', Match.opponents]]) {
            porEquipa[lado[0]] = lado[1].map(p => p.pos + ':' + (p.playingStyle || '-'));
        }
        return porEquipa;
    `);
    const todos = [...r.TeamA, ...r.TeamB].join(' ');
    for (const eq of ['TeamA', 'TeamB']) {
        assert.ok(r[eq].some(s => s.endsWith(':defensive_fullback')),
            `${eq} sem lateral defensivo: ${r[eq].join(' ')}`);
        assert.ok(r[eq].some(s => s.endsWith(':offensive_fullback')),
            `${eq} sem lateral ofensivo: ${r[eq].join(' ')}`);
    }
    for (const est of ['creative_playmaker', 'cross_specialist', 'prolific_winger',
        'the_destroyer', 'classic_no10']) {
        assert.ok(todos.includes(':' + est), `estilo ${est} nao foi atribuido a ninguem`);
    }
});
