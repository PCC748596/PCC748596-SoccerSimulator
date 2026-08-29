/*
O DESENHO DA EQUIPA NA FALTA, POR SECTOR — e quem bate.

Antes: quem batia era o jogador mais PERTO da bola (a cobrança calhava a quem a
jogada tinha deixado ali — um central a bater uma falta na entrada da área
adversária), e dos outros dez só cinco eram colocados, e só no terço ofensivo.
Uma falta na própria defesa não tinha desenho nenhum.

Agora há cinco sectores, cada um com o seu desenho e o seu critério de batedor
(ver FreeKickModel.setores / .batedorPorSetor / .formacaoPorSetor, e
setorDaFalta / batedorDaFalta / lugaresDaFalta em utils.js).

Corre com: node --test tests/falta_setores.test.js
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const src = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const srcCfg = src('js/config/shooting.js');
const srcUtils = src('js/utils.js');

function extrairObjecto(s, nome) {
    const ini = s.indexOf('const ' + nome + ' = {');
    assert.ok(ini > 0, nome + ' não encontrado');
    const fim = s.indexOf(LF + '};', ini);
    return new Function(s.slice(ini, fim + 3) + '; return ' + nome + ';')();
}
function extrairFuncao(s, nome) {
    const ini = s.indexOf('function ' + nome + '(');
    assert.ok(ini > 0, nome + ' não encontrada');
    const fim = s.indexOf(LF + '}', ini);
    return s.slice(ini, fim + 2);
}

const FreeKickModel = extrairObjecto(srcCfg, 'FreeKickModel');
const CAMPO_COMP = 106, CAMPO_LARG = 68, LARGURA_BALIZA = 7.32;

const ambiente = { FreeKickModel, CAMPO_COMP, CAMPO_LARG, LARGURA_BALIZA };
const codigo = ['decisaoDeFalta', 'setorDaFalta', 'grupoNaBolaParada',
    'batedorDaFalta', 'lugaresDaFalta']
    .map(n => extrairFuncao(srcUtils, n)).join(LF) + LF +
    'return { decisaoDeFalta, setorDaFalta, grupoNaBolaParada, batedorDaFalta, lugaresDaFalta };';
const U = new Function(...Object.keys(ambiente), codigo)(...Object.values(ambiente));

const dir = 1;
// `avanco` é medido do meio-campo, na direcção de ataque.
const zDe = (avanco) => avanco * dir;

// Um plantel de campo com as posições que as formações usam.
function plantel() {
    const fazer = (pos, role, tec) => ({
        pos: pos, role: role, skillFor: () => tec,
        model: { position: { x: 0, z: 0 } }
    });
    return [
        fazer('CB', 'def', 74), fazer('CB', 'def', 70),
        fazer('LB', 'def', 85), fazer('RB', 'def', 80),
        fazer('DM', 'mid', 76), fazer('CM', 'mid', 88),
        fazer('LM', 'mid', 92), fazer('RM', 'mid', 79),
        fazer('CF', 'atk', 84), fazer('CF', 'atk', 81)
    ];
}

test('os cinco sectores saem do avanço, e o ataque segue a decisão', () => {
    assert.strictEqual(U.setorDaFalta(0, zDe(-40), dir), 'defesa');
    assert.strictEqual(U.setorDaFalta(0, zDe(-8), dir), 'meio_recuado');
    assert.strictEqual(U.setorDaFalta(0, zDe(10), dir), 'meio_avancado');

    // No terço ofensivo manda a decisão: de frente é cobrança directa,
    // ao lado da área é cruzamento.
    assert.strictEqual(U.setorDaFalta(0, zDe(40), dir), 'ataque_entrada',
        'de frente à baliza o desenho é o da cobrança directa');
    assert.strictEqual(U.setorDaFalta(24, zDe(40), dir), 'ataque_lateral',
        'ao lado da área o desenho é o do cruzamento');

    // E não discorda da decisão da bola.
    for (const [x, av] of [[0, 40], [24, 40], [18, 36], [3, 44]]) {
        const d = U.decisaoDeFalta(x, zDe(av), dir);
        const s = U.setorDaFalta(x, zDe(av), dir);
        if (d === 'cruzamento') assert.strictEqual(s, 'ataque_lateral');
        else assert.strictEqual(s, 'ataque_entrada');
    }
});

test('quem bate sai do critério do sector, e o desempate é a Técnica', () => {
    const eq = plantel();

    // Na defesa bate o ZAGUEIRO de melhor Técnica — não o lateral, que também
    // é `role: 'def'` e aqui tem mais Técnica (85 contra 74).
    const naDefesa = U.batedorDaFalta(eq, 'central', p => p.skillFor('TEC'));
    assert.strictEqual(naDefesa.pos, 'CB', 'na defesa bate o zagueiro');
    assert.strictEqual(naDefesa.skillFor('TEC'), 74, 'e é o de melhor Técnica dos dois');

    // Do meio para a frente, o melhor técnico NÃO-defensor.
    const naFrente = U.batedorDaFalta(eq, 'naoDef', p => p.skillFor('TEC'));
    assert.strictEqual(naFrente.pos, 'LM');
    assert.strictEqual(naFrente.skillFor('TEC'), 92);
    assert.notStrictEqual(naFrente.role, 'def', 'o critério é NÃO-defensor');

    // No cruzamento pela ala bate o lateral.
    const naAla = U.batedorDaFalta(eq, 'lateral', p => p.skillFor('TEC'));
    assert.ok(naAla.pos === 'LB' || naAla.pos === 'RB', 'ao lado da área bate o lateral');
    assert.strictEqual(naAla.skillFor('TEC'), 85);
});

test('os critérios têm reserva quando não há quem os cumpra', () => {
    const semCentrais = plantel().filter(p => p.pos !== 'CB');
    const b = U.batedorDaFalta(semCentrais, 'central', p => p.skillFor('TEC'));
    assert.ok(b, 'sem centrais tem de bater alguém');
    assert.strictEqual(b.role, 'def', 'a reserva do zagueiro é outro defensor');

    const semLaterais = plantel().filter(p => p.pos !== 'LB' && p.pos !== 'RB');
    const c = U.batedorDaFalta(semLaterais, 'lateral', p => p.skillFor('TEC'));
    assert.ok(c && c.role !== 'def', 'sem laterais bate o melhor técnico não-defensor');

    assert.strictEqual(U.batedorDaFalta([], 'naoDef', () => 0), null);
});

test('na própria defesa a equipa faz uma escada à frente da bola', () => {
    const av = -40, bolaZ = zDe(av);
    const eq = plantel();
    const lug = U.lugaresDaFalta(0, bolaZ, dir, eq, 'defesa');
    assert.strictEqual(lug.length, eq.length, 'ficou gente sem lugar');

    const avancoDe = (pos) => {
        const l = lug.filter(o => o.p.pos === pos);
        return l.reduce((s, o) => s + o.z * dir, 0) / l.length;
    };

    // A escada: centrais junto à bola, médios à frente, ataque mais à frente.
    assert.ok(avancoDe('CB') < avancoDe('CM'), 'os médios têm de estar à frente dos centrais');
    assert.ok(avancoDe('CM') < avancoDe('CF'), 'o ataque tem de estar à frente dos médios');
    assert.ok(avancoDe('CF') - av > 25, 'o ataque tem de estar bem à frente da bola');
});

test('no meio-campo adversário os centrais ficam ATRÁS e a largura abre', () => {
    const av = 10, bolaZ = zDe(av);
    const eq = plantel();
    const lug = U.lugaresDaFalta(-12, bolaZ, dir, eq, 'meio_avancado');

    const cb = lug.filter(o => o.p.pos === 'CB');
    for (const o of cb) {
        assert.ok(o.z * dir < av, 'o central tem de ficar atrás da bola — é dali que se defende o contra-ataque');
    }
    const lat = lug.filter(o => o.p.pos === 'LB' || o.p.pos === 'RB');
    for (const o of lat) assert.ok(Math.abs(o.x) > 20, 'os laterais têm de abrir na largura');

    const ml = lug.filter(o => ['LM', 'RM'].indexOf(o.p.pos) >= 0);
    for (const o of ml) assert.ok(Math.abs(o.x) > 20, 'os meias-laterais também abrem');

    const cf = lug.filter(o => o.p.pos === 'CF');
    for (const o of cf) assert.ok(o.z * dir > av, 'os avançados ficam à frente da bola');
});

test('ao lado da área os centrais SOBEM para cabecear e os médios ficam na entrada', () => {
    const bolaZ = zDe(40);
    const eq = plantel();
    const lug = U.lugaresDaFalta(24, bolaZ, dir, eq, 'ataque_lateral');
    const linhaFundo = dir * (CAMPO_COMP / 2);
    const aoGolo = (o) => Math.abs(linhaFundo - o.z);

    for (const o of lug.filter(o => o.p.pos === 'CB')) {
        assert.ok(aoGolo(o) < 16.5, 'o central tem de estar DENTRO da área para cabecear');
    }
    for (const o of lug.filter(o => o.p.pos === 'CF')) {
        assert.ok(aoGolo(o) < 9.0, 'os avançados atacam a primeira e a segunda trave');
    }
    for (const o of lug.filter(o => ['DM', 'CM'].indexOf(o.p.pos) >= 0)) {
        const d = aoGolo(o);
        assert.ok(d > 16.0 && d < 24.0,
            'os médios centrais ficam RECUADOS na entrada da área, deu ' + d.toFixed(1) + ' m');
    }
});

test('na entrada da área os centrais recuam e os avançados esperam o ressalto', () => {
    const bolaZ = zDe(42);
    const eq = plantel();
    const lug = U.lugaresDaFalta(2, bolaZ, dir, eq, 'ataque_entrada');
    const linhaFundo = dir * (CAMPO_COMP / 2);
    const aoGolo = (o) => Math.abs(linhaFundo - o.z);

    for (const o of lug.filter(o => o.p.pos === 'CB')) {
        assert.ok(aoGolo(o) > 25, 'numa cobrança directa o central fica recuado');
    }
    for (const o of lug.filter(o => o.p.pos === 'CF')) {
        const d = aoGolo(o);
        assert.ok(d > 10 && d < 18, 'os avançados esperam o ressalto à entrada da área, deu ' + d.toFixed(1));
    }
    // Apoio: laterais e médios perto da bola, para a alternativa curta existir.
    for (const o of lug.filter(o => ['CM', 'DM', 'LB', 'RB'].indexOf(o.p.pos) >= 0)) {
        const d = Math.hypot(o.x - 2, o.z - bolaZ);
        assert.ok(d < 22, 'o apoio tem de estar ao alcance de um passe, deu ' + d.toFixed(1) + ' m');
    }
});

test('ninguém é colocado fora do campo', () => {
    const eq = plantel();
    for (const setor of Object.keys(FreeKickModel.formacaoPorSetor)) {
        for (const [x, av] of [[0, -45], [30, -20], [-28, 5], [26, 44], [0, 46]]) {
            const lug = U.lugaresDaFalta(x, zDe(av), dir, eq, setor);
            for (const o of lug) {
                assert.ok(Math.abs(o.x) <= CAMPO_LARG / 2,
                    setor + ': x=' + o.x.toFixed(1) + ' está fora do campo');
                assert.ok(Math.abs(o.z) <= CAMPO_COMP / 2,
                    setor + ': z=' + o.z.toFixed(1) + ' está fora do campo');
            }
        }
    }
});
