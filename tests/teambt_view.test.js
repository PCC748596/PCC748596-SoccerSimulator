/*
A aba do fluxograma (teamBtView.html) espelha A MAO a arvore do TeamBT. Nada
a obriga a acompanhar js/bt/team_bt.js, por isso o teste vai buscar os nomes
aos dois lados e compara — se alguem renomear um ramo no jogo e esquecer a
pagina, o fluxograma passa a mostrar um no que nunca acende, e isso ate agora
so se descobria a olho.

Corre tambem o script da pagina num DOM falso, para apanhar erros de sintaxe e
verificar que o trace pinta os nos certos.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const raiz = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(raiz, 'teamBtView.html'), 'utf8');
const TEAM_BT = fs.readFileSync(path.join(raiz, 'js', 'bt', 'team_bt.js'), 'utf8');

// A arvore do jogo: tudo entre `const TeamBT = sel('TeamRoot',` e o `);` final.
function arvoreDoJogo() {
    const i = TEAM_BT.indexOf("const TeamBT = sel('TeamRoot'");
    assert.ok(i >= 0, 'const TeamBT nao encontrado em team_bt.js');
    const corpo = TEAM_BT.slice(i, TEAM_BT.indexOf('\n);', i));

    const nomes = new Set(['TeamRoot']);
    for (const m of corpo.matchAll(/\b(?:sel|seq|cond|act)\(\s*'([^']+)'/g)) nomes.add(m[1]);
    // setPosture(TeamPosture.X) aparece no trace como "posture:X"
    for (const m of corpo.matchAll(/setPosture\(TeamPosture\.(\w+)\)/g)) nomes.add('posture:' + m[1]);
    return nomes;
}

function paginaCarregada() {
    const dom = new JSDOM(HTML, { runScripts: 'dangerously', pretendToBeVisual: true });
    return dom;
}

test('a pagina do fluxograma corre sem erros e desenha a arvore', () => {
    const dom = paginaCarregada();
    const nos = dom.window.document.querySelectorAll('#tree li');
    assert.ok(nos.length > 10, `so ${nos.length} nos desenhados`);
    assert.strictEqual(
        dom.window.document.getElementById('info-nos').textContent,
        String(nos.length),
        'o contador de nos no rodape nao bate com o que esta desenhado');
});

test('os nomes do fluxograma sao os mesmos da arvore do jogo', () => {
    const dom = paginaCarregada();
    const noEcra = new Set(
        [...dom.window.document.querySelectorAll('#tree li')].map(li => li.dataset.name));
    const noJogo = arvoreDoJogo();

    const aMais = [...noEcra].filter(n => !noJogo.has(n));
    const aMenos = [...noJogo].filter(n => !noEcra.has(n));

    assert.deepStrictEqual(aMais, [], 'nos no fluxograma que ja nao existem no jogo');
    assert.deepStrictEqual(aMenos, [], 'nos do jogo que faltam no fluxograma');
});

test('o trace acende o ramo percorrido e apaga o resto', () => {
    const dom = paginaCarregada();
    const doc = dom.window.document;

    dom.window.applyTrace([
        'TeamRoot:SUCCESS',
        'BolaParada:FAILURE',
        'jogoParado:FAILURE',
        'ComBola:SUCCESS',
        'temPosse:SUCCESS',
        'FaseOfensiva:SUCCESS',
        'UltimoTerco:SUCCESS',
        'bolaNoUltimoTerco:SUCCESS'
    ]);

    const classe = (nome) => doc.querySelector(`#tree li[data-name="${nome}"]`).className;
    assert.match(classe('ComBola'), /st-SUCCESS/);
    assert.match(classe('UltimoTerco'), /st-SUCCESS/, 'o ramo percorrido devia estar aceso');
    assert.match(classe('BolaParada'), /st-FAILURE/);
    assert.match(classe('SemBola'), /st-none/, 'um ramo nao percorrido nao pode aparecer aceso');
    assert.strictEqual(doc.getElementById('info-ativos').textContent, '8');
});

test('o estado tactico recebido aparece no topo e no painel de informacoes', () => {
    const dom = paginaCarregada();
    const doc = dom.window.document;
    // Simula o efeito da mensagem que js/main.js publica no BroadcastChannel
    // (o canal em si nao atravessa janelas dentro do jsdom).
    dom.window.eval(`
        lastPayload = { TeamA: { state: 'Offensive', trace: ['TeamRoot:SUCCESS'] }, TeamB: null };
        ultimaMensagem = Date.now();
        render();
    `);
    assert.strictEqual(doc.getElementById('postura-valor').textContent, 'Offensive');
    assert.strictEqual(doc.getElementById('info-postura').textContent, 'Offensive');
    assert.strictEqual(doc.getElementById('info-equipa').textContent, 'TeamA');
});

test('as posturas nao voltam a aparecer', () => {
    assert.ok(!/TeamPosture\.|setPosture\(/.test(TEAM_BT),
        'setPosture/TeamPosture reapareceram em team_bt.js');
    assert.ok(!/posture:/.test(HTML),
        'a pagina voltou a desenhar nos de postura');
});
