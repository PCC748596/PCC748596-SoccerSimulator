/*
APOIO DE CIRCULACAO — quem se oferece a distancia de passe, e onde.

Medido antes de isto existir: o unico apoio do jogo punha 1.3 jogadores por
frame a 6.1 +/- 4.6 m do portador (SupportModel.raioMin/raioMax = 3.5 a 7 m,
maxPorLado 1). Ou seja, o jogo colocava duas pessoas na faixa do toquinho e
NINGUEM na faixa dos 12-18 m. Os 42% de companheiros que estavam a 10-22 m
estavam la por acaso, parados no slot, e so 1.7 tinham linha aberta.

A atribuicao e de EQUIPA e nao de jogador: sem isso, todos escolhem o mesmo
melhor ponto — foi o mesmo erro que a marcacao tinha (ver atribuirMarcacoes).
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const CONFIG = fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8');
const UTILS = fs.readFileSync(path.join(raiz, 'js', 'utils.js'), 'utf8');

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

function montar() {
    const sandbox = { Math: Math, Set: Set, Array: Array };
    vm.createContext(sandbox);
    vm.runInContext(
        'const CAMPO_LARG = 68; const CAMPO_COMP = 106;\n' +
        recortarFuncao(UTILS, 'linhaLivre') + '\n' +
        recortarFuncao(CONFIG, 'atribuirApoios') + '\n' +
        'this.atribuir = atribuirApoios;', sandbox);
    return sandbox.atribuir;
}

const OPTS = {
    maxApoios: 3, raioMin: 10, raioMax: 18, desvioMax: 8,
    margemLinha: 2.0, margemAdversario: 3.0
};

// Portador do TeamA (ataca +z) no meio-campo.
function caso(extra) {
    return Object.assign({
        portador: { x: 0, z: 0, dirZ: 1 },
        candidatos: [
            { id: 1, slotX: -14, slotZ: 2 },
            { id: 2, slotX: 14, slotZ: 2 },
            { id: 3, slotX: 0, slotZ: -13 },
            { id: 4, slotX: 0, slotZ: 14 }
        ],
        adversarios: [],
        offsideLimitDir: 40
    }, OPTS, extra || {});
}

test('atribui apoios a quem tem slot por perto', () => {
    const a = montar();
    const r = a(caso());
    assert.ok(r.length > 0, 'ninguem foi chamado a apoiar');
});

test('nunca mais do que o tecto', () => {
    const a = montar();
    const r = a(caso({ maxApoios: 2 }));
    assert.ok(r.length <= 2, 'atribuiu ' + r.length);
});

test('cada jogador recebe um ponto só', () => {
    const a = montar();
    const r = a(caso());
    const ids = r.map(x => x.id);
    assert.strictEqual(new Set(ids).size, ids.length, 'id repetido: ' + ids.join(','));
});

test('dois apoios não caem no mesmo sítio', () => {
    const a = montar();
    const r = a(caso());
    for (let i = 0; i < r.length; i++) {
        for (let j = i + 1; j < r.length; j++) {
            const d = Math.hypot(r[i].x - r[j].x, r[i].z - r[j].z);
            assert.ok(d > 6.0, 'dois apoios a ' + d.toFixed(1) + ' m um do outro');
        }
    }
});

test('todos os pontos ficam na faixa de passe pedida', () => {
    const a = montar();
    for (const p of a(caso())) {
        const d = Math.hypot(p.x - 0, p.z - 0);
        assert.ok(d >= OPTS.raioMin - 0.1 && d <= OPTS.raioMax + 0.1,
            'apoio a ' + d.toFixed(1) + ' m do portador');
    }
});

test('ninguém é arrancado a mais de desvioMax do seu slot', () => {
    const a = montar();
    const caso1 = caso();
    for (const p of a(caso1)) {
        const c = caso1.candidatos.find(x => x.id === p.id);
        const d = Math.hypot(p.x - c.slotX, p.z - c.slotZ);
        assert.ok(d <= OPTS.desvioMax + 0.1,
            'jogador ' + p.id + ' arrancado ' + d.toFixed(1) + ' m do slot');
    }
});

test('um adversário em cima da linha tira esse ponto da lista', () => {
    const a = montar();
    // Sem adversarios, alguem apoia pela direita.
    const semNinguem = a(caso({ candidatos: [{ id: 2, slotX: 14, slotZ: 2 }] }));
    assert.strictEqual(semNinguem.length, 1);

    // Com a linha tapada em todo o arco da direita, ja nao.
    const tapado = [];
    for (let z = -8; z <= 8; z += 2) tapado.push({ x: 6, z: z });
    const comBloqueio = a(caso({
        candidatos: [{ id: 2, slotX: 14, slotZ: 2 }],
        adversarios: tapado
    }));
    assert.strictEqual(comBloqueio.length, 0, 'apoiou com a linha tapada');
});

test('não manda ninguém para fora de jogo', () => {
    const a = montar();
    const r = a(caso({ offsideLimitDir: 12, candidatos: [{ id: 4, slotX: 0, slotZ: 14 }] }));
    for (const p of r) {
        assert.ok(p.z * 1 <= 12, 'apoio em fora de jogo: z=' + p.z.toFixed(1));
    }
});

test('sem candidatos devolve lista vazia', () => {
    const a = montar();
    // length e nao deepStrictEqual: o array vem de outro realm (vm) e o
    // deepStrictEqual compara tambem o construtor.
    assert.strictEqual(a(caso({ candidatos: [] })).length, 0);
});

test('espelha para a equipa que ataca no outro sentido', () => {
    const a = montar();
    const r = a(caso({
        portador: { x: 0, z: 0, dirZ: -1 },
        offsideLimitDir: 40,
        candidatos: [{ id: 9, slotX: 0, slotZ: -14 }]
    }));
    assert.strictEqual(r.length, 1);
    assert.ok(r[0].z < 0, 'devia apoiar no sentido de ataque dele: z=' + r[0].z);
});

/* ------------------------------------------------------------------
   Histerese: quem ja esta a apoiar mantem o encargo.

   Medido sem isto: a duracao media de um apoio era 0.2 s (327 apoios em
   96 s) e o jogador so estava dentro de 2 m do seu ponto em 7.7% dos
   frames. A atribuicao era refeita do zero a cada frame, o encargo saltava
   de pessoa para pessoa, e ninguem chegava a oferecer-se de facto.
   ------------------------------------------------------------------ */

test('quem já apoia num ponto ainda válido mantém-no', () => {
    const a = montar();
    const c1 = caso({ candidatos: [{ id: 1, slotX: -14, slotZ: 2 }] });
    const primeiro = a(c1);
    assert.strictEqual(primeiro.length, 1);

    const c2 = caso({
        candidatos: [{
            id: 1, slotX: -14, slotZ: 2,
            apoioActual: { x: primeiro[0].x, z: primeiro[0].z }
        }]
    });
    const segundo = a(c2);
    assert.strictEqual(segundo.length, 1);
    assert.ok(Math.abs(segundo[0].x - primeiro[0].x) < 0.01 &&
              Math.abs(segundo[0].z - primeiro[0].z) < 0.01,
        'o ponto mudou: ' + JSON.stringify(segundo[0]) + ' vs ' + JSON.stringify(primeiro[0]));
});

test('um ponto que deixou de ser válido é largado', () => {
    const a = montar();
    // Ponto actual longe do portador (fora da faixa de passe): ja nao serve.
    const r = a(caso({
        candidatos: [{ id: 1, slotX: -14, slotZ: 2, apoioActual: { x: -30, z: -25 } }]
    }));
    assert.strictEqual(r.length, 1);
    assert.ok(Math.hypot(r[0].x + 30, r[0].z + 25) > 1.0, 'manteve um ponto invalido');
});

test('um ponto actual com a linha tapada é largado', () => {
    const a = montar();
    const tapado = [];
    for (let z = -8; z <= 8; z += 2) tapado.push({ x: 6, z: z });
    const r = a(caso({
        candidatos: [{ id: 2, slotX: 14, slotZ: 2, apoioActual: { x: 12, z: 0 } }],
        adversarios: tapado
    }));
    for (const p of r) {
        assert.ok(Math.hypot(p.x - 12, p.z - 0) > 1.0, 'manteve um ponto com a linha tapada');
    }
});

test('o ocupante não é despejado por um colega ligeiramente mais perto', () => {
    const a = montar();
    const primeiro = a(caso({ candidatos: [{ id: 1, slotX: -14, slotZ: 2 }] }));
    const ponto = primeiro[0];

    // O id 5 tem o slot em cima do ponto: sem histerese, ficava com ele.
    const r = a(caso({
        maxApoios: 1,
        candidatos: [
            { id: 1, slotX: -14, slotZ: 2, apoioActual: { x: ponto.x, z: ponto.z } },
            { id: 5, slotX: ponto.x, slotZ: ponto.z }
        ]
    }));
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].id, 1, 'o ocupante foi despejado');
});

test('quem perde o ponto é reancorado, não despedido', () => {
    const a = montar();
    /*
    O ponto actual esta obsoleto (a bola andou), mas ha pontos validos ao
    alcance dele. Antes ficava sem encargo e voltava a concorrer do zero com
    todos os outros — e a duracao media de um apoio nao passava de 0.5 s.
    */
    const r = a(caso({
        maxApoios: 1,
        candidatos: [
            { id: 1, slotX: -14, slotZ: 2, apoioActual: { x: -14, z: 30 } },
            { id: 7, slotX: -13, slotZ: 1 }
        ]
    }));
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].id, 1, 'o ocupante perdeu o encargo em vez de ser reancorado');
});
