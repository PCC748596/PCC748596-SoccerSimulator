# Camada de Antecipação — motor, contrato e primeiro evento

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar aos jogadores a capacidade de agir sobre o que *vai* acontecer, com um registo de eventos previsíveis de contrato validado, e provar o motor com o evento do guarda-redes.

**Architecture:** Um registo (`AnticipationEvents`) onde cada evento é uma ficha de dados com detector e reacção no mesmo ficheiro. O motor corre dentro do tick do `Perception` que já existe (15 Hz, desfasado por jogador), filtra a confiança crua por um perfil de crença POR JOGADOR (latência, viés, limiar com histerese) e emite no `EventBus` quando um jogador passa a acreditar. A reacção empurra um viés posicional temporário, consumido no `PosicionamentoAI.tickBase`.

**Tech Stack:** JavaScript de browser em scripts clássicos (sem módulos ES, sem build). Testes com `node --test` + `vm` sandbox sobre o ficheiro recortado. Teste de integração headless com `jsdom` + `three@0.128` (ambos já em `node_modules`).

## Global Constraints

- **Scripts clássicos, scope global.** Nada de `import`/`export`. Ficheiros novos entram no `index.html` na ordem certa.
- **Nome de evento:** obrigatoriamente prefixo `PREV_`.
- **`ouvir` e `largar` são obrigatórios em par.** Quem empurra um viés tem de o saber tirar.
- **Comentários e nomes em português**, como o resto do repositório. Comentários explicam o PORQUÊ e o que já se tentou antes, não o quê.
- **O motor é o único a falar com o `EventBus`.** O autor de um evento nunca chama `EventBus.on`/`emit`.
- **Correr os testes com:** `node --test "tests/*.test.js"` (o glob com aspas é obrigatório no Git Bash deste ambiente; `node --test tests/` falha).
- **Física/campo:** `CAMPO_LARG = 68`, `CAMPO_COMP = 106`, `BallPhysics.raio = 0.11`.
- **Skills disponíveis por jogador** (`p.skillFor(campo)`, 0..100): `gk`, `tec`, `marking`, `speed`, `strength`, `pass`, `intercept`. **Não existe campo de "visão"** — a antecipação usa `intercept`.

---

### Task 1: Harness headless permanente

O repositório não tem forma de correr o jogo fora do browser. As últimas duas correcções foram validadas com um harness `jsdom` descartável, criado e apagado à mão. A Task 7 precisa dele outra vez. Fica permanente.

**Files:**
- Create: `tests/headless.js`
- Test: `tests/headless.test.js`

**Interfaces:**
- Produces: `require('./headless.js')` devolve `{ w, ctx, run, novoJogo }`.
  - `ctx` — o contexto `vm` com todos os globais do jogo (`Match`, `THREE`, `Tatics`, ...).
  - `novoJogo()` — cria a cena, chama `Match.init(scene)`, põe `Match.delta = 0.016` e corre 120 frames de aquecimento. Devolve `undefined`; o acesso é sempre por `ctx`.
  - `run(caminhoRelativo)` — avalia mais um ficheiro dentro do mesmo contexto.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/headless.test.js
/*
O harness headless: o jogo inteiro a correr em jsdom, sem browser. Existe
para os testes de comportamento (ex.: antecipacao_gk) poderem medir o que
acontece em campo ao fim de N frames, e nao so o que uma funcao pura devolve.
*/
const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const { ctx, novoJogo } = require('./headless.js');

test('o jogo arranca sem browser', () => {
    novoJogo();
    assert.strictEqual(vm.runInContext('Match.players.length', ctx), 11);
    assert.strictEqual(vm.runInContext('Match.opponents.length', ctx), 11);
});

test('o tempo corre e a bola continua no chao', () => {
    novoJogo();
    vm.runInContext('for (let i = 0; i < 60; i++) Match.update(0.016);', ctx);
    const y = vm.runInContext('Match.ball.position.y', ctx);
    assert.ok(y >= 0.10 && y < 3.0, 'y fora do razoavel: ' + y);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/headless.test.js`
Expected: FAIL com `Cannot find module './headless.js'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// tests/headless.js
/*
Carrega o jogo inteiro num contexto vm com jsdom por baixo, na MESMA ordem
de scripts do index.html (a ordem nao pode mudar: os ficheiros partilham
scope global e contam uns com os outros).

Nao e um mock: e o codigo de producao a correr. O que esta aqui a mais sao
so os buracos do browser que o jogo toca de passagem — canvas 2D (texturas
de camisola, relva, rede) e getElementById (HUD).

main.js e touch_controls.js ficam de fora de proposito: montam
requestAnimationFrame e listeners de toque, e o dono do tick nos testes tem
de ser o teste.
*/
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const raiz = path.join(__dirname, '..');

const dom = new JSDOM('<!doctype html><html><body><canvas id="c"></canvas></body></html>',
    { runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window;
w.requestAnimationFrame = () => 0;

// Canvas 2D falso: devolve uma funcao vazia para qualquer metodo e aceita
// qualquer propriedade (fillStyle, lineWidth, ...). Enumerar os metodos um a
// um dava sempre outro em falta a cada ficheiro novo.
w.HTMLCanvasElement.prototype.getContext = function () {
    const vazio = () => {};
    const base = {
        measureText: () => ({ width: 0 }),
        getImageData: () => ({ data: [] }),
        createImageData: () => [],
        createLinearGradient: () => ({ addColorStop: vazio }),
        createRadialGradient: () => ({ addColorStop: vazio }),
        createPattern: () => null
    };
    return new Proxy(base, {
        get(alvo, chave) { return (chave in alvo) ? alvo[chave] : vazio; },
        set() { return true; }
    });
};

// O HUD e lido com getElementById e escrito com .style/.textContent. Sem
// elemento, rebenta em resetPlay. Cria a pedido.
const getReal = w.document.getElementById.bind(w.document);
w.document.getElementById = function (id) {
    let el = getReal(id);
    if (!el) {
        el = w.document.createElement('div');
        el.id = id;
        w.document.body.appendChild(el);
    }
    return el;
};

const ctx = vm.createContext(w);

function run(rel) {
    vm.runInContext(fs.readFileSync(path.join(raiz, rel), 'utf8'), ctx, { filename: rel });
}

run('node_modules/three/build/three.min.js');

// A lista de scripts vem do index.html, nao de uma copia a mao: se alguem
// acrescentar um ficheiro la, os testes passam a carrega-lo sozinhos.
fs.readFileSync(path.join(raiz, 'index.html'), 'utf8')
    .split('\n')
    .map(linha => linha.match(/<script src="((?!http)[^"]+)"/))
    .filter(Boolean)
    .map(m => m[1])
    .filter(f => !f.endsWith('main.js') && !f.endsWith('touch_controls.js'))
    .forEach(run);

function novoJogo() {
    vm.runInContext(`
        const _cena = new THREE.Scene();
        Match.init(_cena);
        Match.delta = 0.016;
        for (let i = 0; i < 120; i++) Match.update(0.016);
    `, ctx);
}

module.exports = { w, ctx, run, novoJogo };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/headless.test.js`
Expected: PASS, 2 testes.

- [ ] **Step 5: Confirmar que não partiu a suite**

Run: `node --test "tests/*.test.js"`
Expected: todos passam.

- [ ] **Step 6: Commit**

```bash
git add tests/headless.js tests/headless.test.js
git commit -m "test: harness headless do jogo com jsdom"
```

---

### Task 2: Perfil e crença — a matemática pura

O núcleo do que faz o lateral bom abrir antes do mau. Funções puras, testáveis sem jogo.

**Files:**
- Create: `js/anticipation/core.js`
- Test: `tests/antecipacao_crenca.test.js`

**Interfaces:**
- Produces:
  - `perfilDeAntecipacao(skill)` → `{ latencia, limiar, viesMax, intervaloVies }`, com `skill` 0..100.
  - `actualizarCrenca(estado, crua, dt, perfil)` → muta e devolve `estado`.
    `estado` = `{ percebida, acredita, desde, vies, viesTimer }`.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/antecipacao_crenca.test.js
/*
O filtro de crenca: entre a confianca CRUA que o detector devolve e a accao
ha um perfil POR JOGADOR. E ele que faz o lateral bom antecipar e o mau
chegar tarde — sem isto os 22 jogadores reagiam todos no mesmo frame.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const CORE = fs.readFileSync(path.join(raiz, 'js', 'anticipation', 'core.js'), 'utf8');

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
    const sandbox = { Math: Math };
    vm.createContext(sandbox);
    vm.runInContext(
        recortarFuncao(CORE, 'perfilDeAntecipacao') + '\n' +
        recortarFuncao(CORE, 'actualizarCrenca') + '\n' +
        'this.perfil = perfilDeAntecipacao; this.crenca = actualizarCrenca;', sandbox);
    return sandbox;
}

const estadoNovo = () => ({ percebida: 0, acredita: false, desde: 0, vies: 0, viesTimer: 0 });

// Corre a crenca com confianca crua constante e devolve os segundos ate
// acreditar, ou null se nunca acreditou.
function segundosAteAcreditar(s, perfil, crua, limiteSeg) {
    const est = estadoNovo();
    est.vies = 0;                 // sem ruido: o teste mede a latencia, nao o vies
    const dt = 1 / 60;
    for (let t = 0; t < limiteSeg; t += dt) {
        s.crenca(est, crua, dt, perfil);
        if (est.acredita) return t;
    }
    return null;
}

test('mais skill dá menos latência e menos exigência', () => {
    const s = montar();
    const bom = s.perfil(90);
    const mau = s.perfil(20);
    assert.ok(bom.latencia < mau.latencia, 'o bom devia reagir mais depressa');
    assert.ok(bom.limiar < mau.limiar, 'o bom devia precisar de menos certeza');
    assert.ok(bom.viesMax < mau.viesMax, 'o bom devia errar menos');
});

test('o jogador bom acredita antes do mau, com a mesma leitura', () => {
    const s = montar();
    const tBom = segundosAteAcreditar(s, s.perfil(90), 1.0, 5);
    const tMau = segundosAteAcreditar(s, s.perfil(20), 1.0, 5);
    assert.ok(tBom !== null && tMau !== null, 'ambos deviam acabar por acreditar');
    assert.ok(tBom < tMau, 'bom=' + tBom + ' mau=' + tMau);
});

test('confiança baixa não convence ninguém', () => {
    const s = montar();
    assert.strictEqual(segundosAteAcreditar(s, s.perfil(90), 0.2, 5), null);
});

test('histerese: não pisca em cima do limiar', () => {
    const s = montar();
    const perfil = s.perfil(50);
    const est = estadoNovo();
    est.vies = 0;
    const dt = 1 / 60;

    for (let t = 0; t < 5; t += dt) s.crenca(est, 1.0, dt, perfil);
    assert.ok(est.acredita, 'devia acreditar com a crua no maximo');

    // Cai para MESMO em cima do limiar: nao pode largar.
    let trocas = 0;
    let antes = est.acredita;
    for (let t = 0; t < 3; t += dt) {
        s.crenca(est, perfil.limiar, dt, perfil);
        if (est.acredita !== antes) { trocas++; antes = est.acredita; }
    }
    assert.strictEqual(trocas, 0, 'a crenca piscou ' + trocas + ' vezes');
});

test('quando a leitura cai a sério, larga', () => {
    const s = montar();
    const perfil = s.perfil(50);
    const est = estadoNovo();
    est.vies = 0;
    const dt = 1 / 60;
    for (let t = 0; t < 5; t += dt) s.crenca(est, 1.0, dt, perfil);
    for (let t = 0; t < 5; t += dt) s.crenca(est, 0.0, dt, perfil);
    assert.strictEqual(est.acredita, false);
});

test('`desde` conta o tempo de crença e zera ao largar', () => {
    const s = montar();
    const perfil = s.perfil(90);
    const est = estadoNovo();
    est.vies = 0;
    const dt = 1 / 60;
    for (let t = 0; t < 3; t += dt) s.crenca(est, 1.0, dt, perfil);
    assert.ok(est.desde > 0.5, 'desde=' + est.desde);
    for (let t = 0; t < 5; t += dt) s.crenca(est, 0.0, dt, perfil);
    assert.strictEqual(est.desde, 0);
});

test('o viés é lento: não muda todos os frames', () => {
    const s = montar();
    const perfil = s.perfil(20);
    const est = estadoNovo();
    const dt = 1 / 60;
    const vistos = new Set();
    for (let t = 0; t < 1.0; t += dt) {
        s.crenca(est, 0.5, dt, perfil);
        vistos.add(est.vies);
    }
    assert.ok(vistos.size <= 3, 'o vies mudou ' + vistos.size + ' vezes num segundo');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/antecipacao_crenca.test.js`
Expected: FAIL — `ENOENT` em `js/anticipation/core.js`.

- [ ] **Step 3: Write minimal implementation**

Criar `js/anticipation/core.js` com só as duas funções puras (o registo vem na Task 3):

```javascript
/*
=============================================================================
ANTECIPAÇÃO — o motor
=============================================================================
O jogo só reagia a factos consumados: o Perception lê a cinemática da bola,
e os PlayingStyleTriggers são predicados sobre o presente ("s.bolaAvanco >
5"). O avançado arrancava porque a bola JÁ avançou, nunca porque ela VAI
avançar.

Esta camada dá a cada jogador uma leitura do que aí vem, com o erro dele
lá dentro. Ver docs/superpowers/specs/2026-08-20-antecipacao-design.md.
=============================================================================
*/

/*
O perfil de quem lê a jogada, a partir do skill (0..100).

Usa o skill `intercept` (leitura de jogo) porque não existe campo de visão
em data/player_skills.js — ver skillFor em player.js.

    latencia  segundos que a leitura demora a assentar. 0.6 (mau) a 0.15 (bom).
    limiar    quanta certeza precisa para agir. 0.75 (mau) a 0.45 (bom).
    viesMax   quanto pode ler mal. 0.35 (mau) a 0 (bom).

Pura: sem Match, sem THREE.
*/
function perfilDeAntecipacao(skill) {
    const s = Math.max(0, Math.min(100, skill || 0)) / 100;
    return {
        latencia: 0.60 - s * 0.45,
        limiar:   0.75 - s * 0.30,
        viesMax:  0.35 * (1 - s),
        intervaloVies: 0.8
    };
}

/*
Um passo do filtro de crença.

`crua` é o que o detector devolveu (0..1); `estado` é o que este jogador
acha deste evento e é MUTADO aqui.

Três coisas por cima da confiança crua:

  latência  a percebida persegue a crua com atraso exponencial. É isto que
            separa o lateral bom do mau com a MESMA leitura de campo.
  viés      um erro que dura ~0.8 s de cada vez. Sorteado por intervalos e
            não por frame: por frame era ruído branco, a percebida
            filtrava-o todo e o jogador mau ficava igual ao bom.
  histerese entra acima do limiar, sai abaixo de 70% dele. Sem a banda, um
            jogador com a leitura a pairar no valor de corte ligava e
            desligava a reacção várias vezes por segundo.

Pura: sem Match, sem THREE.
*/
function actualizarCrenca(estado, crua, dt, perfil) {
    estado.viesTimer -= dt;
    if (estado.viesTimer <= 0) {
        estado.viesTimer = perfil.intervaloVies;
        estado.vies = (Math.random() * 2 - 1) * perfil.viesMax;
    }

    const alvo = Math.max(0, Math.min(1, crua + estado.vies));
    const k = 1 - Math.exp(-dt / Math.max(perfil.latencia, 0.001));
    estado.percebida += (alvo - estado.percebida) * k;

    if (estado.acredita) {
        if (estado.percebida < perfil.limiar * 0.7) {
            estado.acredita = false;
            estado.desde = 0;
        } else {
            estado.desde += dt;
        }
    } else if (estado.percebida > perfil.limiar) {
        estado.acredita = true;
        estado.desde = 0;
    }

    return estado;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/antecipacao_crenca.test.js`
Expected: PASS, 7 testes.

- [ ] **Step 5: Commit**

```bash
git add js/anticipation/core.js tests/antecipacao_crenca.test.js
git commit -m "feat: filtro de crenca da antecipacao (latencia, vies, histerese)"
```

---

### Task 3: O registo e o seu contrato

O pedido explícito: uma maneira padrão de cadastrar eventos, validada por código e não por boa vontade.

**Files:**
- Modify: `js/anticipation/core.js` (acrescentar ao fim)
- Test: `tests/antecipacao_contrato.test.js`

**Interfaces:**
- Consumes: `perfilDeAntecipacao`, `actualizarCrenca` (Task 2).
- Produces: `AnticipationEvents` com
  - `registar(ficha)` — valida e atira `Error`; sem retorno.
  - `lista()` → array de fichas registadas.
  - `limpar()` — esvazia o registo (só para testes).
  - `tick(p, bb, match, dt)` — avalia todas as fichas para um jogador.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/antecipacao_contrato.test.js
/*
O contrato do registo de eventos. Existe para o ficheiro numero 20 ser
igual ao numero 1: sem isto, cada antecipacao nova acabava escrita a mao
num sitio diferente.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const CORE = fs.readFileSync(path.join(raiz, 'js', 'anticipation', 'core.js'), 'utf8');

function montar() {
    const sandbox = { Math: Math, console: console, Error: Error };
    sandbox.EventBus = {
        _l: {},
        on(e, f) { (this._l[e] = this._l[e] || []).push(f); },
        emit(e, d) { (this._l[e] || []).forEach(f => f(d)); }
    };
    vm.createContext(sandbox);
    vm.runInContext(CORE + '\nthis.AE = AnticipationEvents;', sandbox);
    return sandbox;
}

const fichaValida = (extra) => Object.assign({
    nome: 'PREV_TESTE',
    horizonte: 1.0,
    interessa: () => true,
    prever: () => 0.5,
    ouvir: () => {},
    largar: () => {}
}, extra || {});

test('uma ficha completa regista', () => {
    const s = montar();
    s.AE.registar(fichaValida());
    assert.strictEqual(s.AE.lista().length, 1);
});

test('falta de campo obrigatório atira', () => {
    for (const campo of ['nome', 'horizonte', 'prever', 'ouvir', 'largar']) {
        const s = montar();
        const ficha = fichaValida();
        delete ficha[campo];
        assert.throws(() => s.AE.registar(ficha), /falta|obrigat/i,
            'devia atirar sem ' + campo);
    }
});

test('nome sem prefixo PREV_ atira', () => {
    const s = montar();
    assert.throws(() => s.AE.registar(fichaValida({ nome: 'GK_SEGURA' })), /PREV_/);
});

test('nome repetido atira', () => {
    const s = montar();
    s.AE.registar(fichaValida());
    assert.throws(() => s.AE.registar(fichaValida()), /j.\ regist|repetid|duplicad/i);
});

test('horizonte não positivo atira', () => {
    const s = montar();
    assert.throws(() => s.AE.registar(fichaValida({ horizonte: 0 })), /horizonte/);
    assert.throws(() => s.AE.registar(fichaValida({ horizonte: -1 })), /horizonte/);
});

test('interessa é opcional e vale "toda a gente"', () => {
    const s = montar();
    const ficha = fichaValida();
    delete ficha.interessa;
    s.AE.registar(ficha);
    assert.strictEqual(s.AE.lista().length, 1);
});

/* --- o tick ------------------------------------------------------------- */

function jogadorFalso() {
    return {
        team: 'TeamA', pos: 'RB', role: 'def',
        skillFor: () => 90,
        blackboard: { antecipa: {} }
    };
}

test('prever fora de 0..1 atira, dizendo o nome do evento', () => {
    const s = montar();
    s.AE.registar(fichaValida({ prever: () => 1.7 }));
    assert.throws(() => s.AE.tick(jogadorFalso(), {}, {}, 0.016), /PREV_TESTE/);
});

test('quem não interessa nem chega a ser avaliado', () => {
    const s = montar();
    let avaliou = 0;
    s.AE.registar(fichaValida({
        interessa: (p) => p.pos === 'CF',
        prever: () => { avaliou++; return 1; }
    }));
    const p = jogadorFalso();
    for (let i = 0; i < 30; i++) s.AE.tick(p, {}, {}, 0.016);
    assert.strictEqual(avaliou, 0);
});

test('quando passa a acreditar, o ouvir corre uma vez só', () => {
    const s = montar();
    let ouviu = 0, largou = 0;
    s.AE.registar(fichaValida({
        prever: () => 1.0,
        ouvir: () => { ouviu++; },
        largar: () => { largou++; }
    }));
    const p = jogadorFalso();
    for (let i = 0; i < 120; i++) s.AE.tick(p, {}, {}, 0.016);
    assert.strictEqual(ouviu, 1, 'ouviu ' + ouviu + ' vezes');
    assert.strictEqual(largou, 0);
});

test('quando deixa de acreditar, o largar corre', () => {
    const s = montar();
    let largou = 0;
    let crua = 1.0;
    s.AE.registar(fichaValida({
        prever: () => crua,
        largar: () => { largou++; }
    }));
    const p = jogadorFalso();
    for (let i = 0; i < 120; i++) s.AE.tick(p, {}, {}, 0.016);
    crua = 0.0;
    for (let i = 0; i < 300; i++) s.AE.tick(p, {}, {}, 0.016);
    assert.strictEqual(largou, 1, 'largou ' + largou + ' vezes');
});

test('o estado da crença fica no blackboard do jogador', () => {
    const s = montar();
    s.AE.registar(fichaValida({ prever: () => 1.0 }));
    const p = jogadorFalso();
    for (let i = 0; i < 120; i++) s.AE.tick(p, {}, {}, 0.016);
    const est = p.blackboard.antecipa.PREV_TESTE;
    assert.ok(est, 'sem estado no blackboard');
    assert.strictEqual(est.acredita, true);
    assert.ok(est.percebida > 0.5);
});

test('o motor emite no EventBus com o jogador e a confiança', () => {
    const s = montar();
    const recebidos = [];
    s.EventBus.on('PREV_TESTE', d => recebidos.push(d));
    s.AE.registar(fichaValida({ prever: () => 1.0 }));
    const p = jogadorFalso();
    for (let i = 0; i < 120; i++) s.AE.tick(p, {}, {}, 0.016);
    assert.strictEqual(recebidos.length, 1);
    assert.strictEqual(recebidos[0].p, p);
    assert.ok(recebidos[0].confianca > 0.5);
    assert.strictEqual(recebidos[0].horizonte, 1.0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/antecipacao_contrato.test.js`
Expected: FAIL — `AnticipationEvents is not defined`.

- [ ] **Step 3: Write minimal implementation**

Acrescentar ao fim de `js/anticipation/core.js`:

```javascript
/*
O REGISTO — a única maneira de cadastrar uma antecipação.

Uma ficha por evento, um ficheiro por ficha (js/anticipation/*.js). Quem
escreve um evento novo não toca no EventBus, no Behavior Tree nem na FSM:

    AnticipationEvents.registar({
        nome:      'PREV_GK_SEGURA',            // único, prefixo PREV_
        horizonte: 1.5,                         // segundos de antecedência
        interessa: (p, bb) => p.role === 'def', // opcional; filtro barato
        prever:    (p, bb, match) => 0..1,      // confiança crua
        ouvir:     (p, dados) => { ... },       // reage quando acredita
        largar:    (p) => { ... }               // desfaz quando deixa de acreditar
    });

`largar` é obrigatório em par com `ouvir`. Quem empurra um viés tem de o
saber tirar: sem esta regra o lateral ficava aberto na ala para sempre,
porque o evento deixou de ser verdade e ninguém desfez nada.

A validação atira em vez de avisar. Um evento mal cadastrado que falha em
silêncio é pior do que nenhum: não se vê no campo e ninguém o vai procurar.
*/
const AnticipationEvents = {
    _fichas: [],
    _porNome: {},

    registar: function (ficha) {
        if (!ficha || typeof ficha !== 'object') {
            throw new Error('AnticipationEvents.registar: falta a ficha');
        }
        for (const campo of ['nome', 'horizonte', 'prever', 'ouvir', 'largar']) {
            if (ficha[campo] === undefined || ficha[campo] === null) {
                throw new Error('AnticipationEvents: falta o campo obrigatorio "' +
                    campo + '" (' + (ficha.nome || 'sem nome') + ')');
            }
        }
        if (typeof ficha.nome !== 'string' || ficha.nome.indexOf('PREV_') !== 0) {
            throw new Error('AnticipationEvents: o nome tem de comecar por PREV_ (' +
                ficha.nome + ')');
        }
        if (this._porNome[ficha.nome]) {
            throw new Error('AnticipationEvents: ' + ficha.nome + ' ja esta registado');
        }
        if (typeof ficha.horizonte !== 'number' || !(ficha.horizonte > 0)) {
            throw new Error('AnticipationEvents: horizonte tem de ser > 0 (' +
                ficha.nome + ')');
        }
        for (const campo of ['prever', 'ouvir', 'largar']) {
            if (typeof ficha[campo] !== 'function') {
                throw new Error('AnticipationEvents: "' + campo +
                    '" tem de ser funcao (' + ficha.nome + ')');
            }
        }
        if (ficha.interessa !== undefined && typeof ficha.interessa !== 'function') {
            throw new Error('AnticipationEvents: "interessa" tem de ser funcao (' +
                ficha.nome + ')');
        }

        // O motor é o único a falar com o EventBus: o autor do evento nunca
        // chama on/emit. Assim o ficheiro do evento é só detector + reacção.
        if (typeof EventBus !== 'undefined') {
            EventBus.on(ficha.nome, (d) => ficha.ouvir(d.p, d));
        }

        this._fichas.push(ficha);
        this._porNome[ficha.nome] = ficha;
    },

    lista: function () { return this._fichas.slice(); },

    // Só para os testes: o jogo regista uma vez, no arranque.
    limpar: function () { this._fichas = []; this._porNome = {}; },

    /*
    Um passo, para UM jogador. Chamado pelo Perception, que já tem o relógio
    de 15 Hz desfasado por jogador — um segundo relógio a percorrer os 22
    seria trabalho repetido.
    */
    tick: function (p, bb, match, dt) {
        if (!p.blackboard) return;
        if (!p.blackboard.antecipa) p.blackboard.antecipa = {};

        const skill = p.skillFor ? p.skillFor('intercept') : 50;
        const perfil = perfilDeAntecipacao(skill);

        for (const ficha of this._fichas) {
            if (ficha.interessa && !ficha.interessa(p, bb)) continue;

            let est = p.blackboard.antecipa[ficha.nome];
            if (!est) {
                est = { percebida: 0, acredita: false, desde: 0, vies: 0, viesTimer: 0, crua: 0 };
                p.blackboard.antecipa[ficha.nome] = est;
            }

            const crua = ficha.prever(p, bb, match);
            if (typeof crua !== 'number' || !(crua >= 0 && crua <= 1)) {
                throw new Error('AnticipationEvents: ' + ficha.nome +
                    '.prever devolveu ' + crua + ' (tem de ser 0..1)');
            }
            est.crua = crua;

            const antes = est.acredita;
            actualizarCrenca(est, crua, dt, perfil);

            if (!antes && est.acredita && typeof EventBus !== 'undefined') {
                EventBus.emit(ficha.nome, {
                    p: p,
                    confianca: est.percebida,
                    horizonte: ficha.horizonte
                });
            } else if (antes && !est.acredita) {
                ficha.largar(p);
            }
        }
    }
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/antecipacao_contrato.test.js`
Expected: PASS, 12 testes.

- [ ] **Step 5: Commit**

```bash
git add js/anticipation/core.js tests/antecipacao_contrato.test.js
git commit -m "feat: registo de eventos de antecipacao com contrato validado"
```

---

### Task 4: Ligar o motor ao jogo

**Files:**
- Modify: `js/player.js:96-107` (blackboard)
- Modify: `js/perception.js:29-38` (`updatePlayers`)
- Modify: `index.html:319` (a seguir a `js/perception.js`)
- Test: `tests/antecipacao_ligacao.test.js`

**Interfaces:**
- Consumes: `AnticipationEvents.tick(p, bb, match, dt)` (Task 3).
- Produces: `p.blackboard.antecipa` preenchido em jogo; `Perception.tickAntecipacao(p, match, dt)`.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/antecipacao_ligacao.test.js
/*
O motor tem de correr DENTRO do jogo, no relogio que ja existe. Este teste
prova a ligacao com o jogo a serio (headless), nao com um jogador falso.
*/
const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const { ctx, novoJogo } = require('./headless.js');

test('o blackboard de cada jogador tem a gaveta da antecipação', () => {
    novoJogo();
    const ok = vm.runInContext(
        'Match.players.every(p => p.blackboard && p.blackboard.antecipa)', ctx);
    assert.strictEqual(ok, true);
});

test('um evento registado é avaliado durante o jogo', () => {
    novoJogo();
    const contagem = vm.runInContext(`
        (function () {
            let n = 0;
            AnticipationEvents.registar({
                nome: 'PREV_SONDA',
                horizonte: 1.0,
                interessa: (p) => p.pos === 'RB',
                prever: () => { n++; return 0.0; },
                ouvir: () => {},
                largar: () => {}
            });
            for (let i = 0; i < 120; i++) Match.update(0.016);
            return n;
        })();
    `, ctx);
    // 2 s de jogo, 15 Hz, dois RB (um por equipa) => ~60 avaliacoes.
    assert.ok(contagem > 20, 'so ' + contagem + ' avaliacoes');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/antecipacao_ligacao.test.js`
Expected: FAIL no primeiro teste (`antecipa` é `undefined`).

- [ ] **Step 3: Write minimal implementation**

Em `js/player.js`, dentro do literal `this.blackboard = {`, a seguir à linha
`events: [], currentIntent: null`, mudar para:

```javascript
            events: [], currentIntent: null,
            // Uma gaveta por evento de antecipacao (ver js/anticipation/core.js),
            // preenchida pelo AnticipationEvents.tick: crua, percebida,
            // acredita, desde.
            antecipa: {}
```

Em `js/perception.js`, dentro de `updatePlayers`, a seguir a
`this.updateBallPerception(p, match);`:

```javascript
            this.updateBallPerception(p, match);
            this.tickAntecipacao(p, match);
```

E acrescentar o método a seguir a `updatePlayers`:

```javascript
    /*
    Antecipacao: o que VAI acontecer, por oposicao ao que esta a acontecer.

    Vive no relogio deste ficheiro de proposito. O tick corre a 15 Hz com o
    perceptionTimer ja desfasado por jogador; um segundo relogio a percorrer
    os 22 jogadores seria o mesmo trabalho outra vez, com o dobro do custo e
    sem o desfasamento.

    O `dt` que passa nao e o do frame: e o periodo entre duas passagens
    deste jogador (1/HZ). A latencia da crenca tem de contar o tempo real
    entre leituras, senao um jogador avaliado a 15 Hz "pensava" ao ritmo de
    60 Hz e acreditava quatro vezes mais depressa do que devia.
    */
    tickAntecipacao: function (p, match) {
        if (typeof AnticipationEvents === 'undefined') return;
        const bb = (typeof TeamAI !== 'undefined' && TeamAI.blackboards)
            ? TeamAI.blackboards[p.team]
            : null;
        AnticipationEvents.tick(p, bb, match, 1 / this.HZ);
    },
```

Em `index.html`, a seguir à linha `<script src="js/perception.js"></script>`:

```html
    <script src="js/anticipation/core.js"></script>
```

**Nota:** confirmar como o `TeamAI` expõe os blackboards antes de escrever a
linha do `bb`. Correr:
`grep -n "blackboards\|const TeamAI" js/bt/team_bt.js`
Se não existir um mapa `TeamAI.blackboards`, passar `null` no `bb` e deixar
um comentário a dizer porquê — o evento da Task 7 não precisa do blackboard
de equipa.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/antecipacao_ligacao.test.js`
Expected: PASS, 2 testes.

- [ ] **Step 5: Correr a suite toda**

Run: `node --test "tests/*.test.js"`
Expected: todos passam.

- [ ] **Step 6: Commit**

```bash
git add js/player.js js/perception.js index.html tests/antecipacao_ligacao.test.js
git commit -m "feat: motor de antecipacao a correr no tick do Perception"
```

---

### Task 5: Urgência a partir da Mentalidade

**Files:**
- Modify: `js/config.js` (`MentalidadeModel`, 5 entradas + função nova a seguir ao literal)
- Test: `tests/urgencia.test.js`

**Interfaces:**
- Produces: `urgenciaDaEquipa(team)` → `0..1`.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/urgencia.test.js
/*
Urgencia: o quanto a equipa esta com pressa. Nao vem do placar diretamente —
vem da Mentalidade, porque quem muda a urgencia e o tecnico ao mudar a
mentalidade (decisao registada no spec da antecipacao).
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const CONFIG = fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8');

function recortarConst(src, nome) {
    const i = src.indexOf('const ' + nome + ' = {');
    assert.ok(i >= 0, 'const ' + nome + ' nao encontrado');
    let nivel = 0;
    for (let k = src.indexOf('{', i); k < src.length; k++) {
        if (src[k] === '{') nivel++;
        else if (src[k] === '}' && --nivel === 0) return src.slice(i, k + 1) + ';';
    }
    assert.fail('chavetas desequilibradas em ' + nome);
}

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

function montar(estilo) {
    const sandbox = { Math: Math };
    vm.createContext(sandbox);
    vm.runInContext(
        'const CAMPO_COMP = 106;\n' +
        recortarConst(CONFIG, 'MentalidadeModel') + '\n' +
        'const Tatics = { estilo: "' + estilo + '" };\n' +
        recortarFuncao(CONFIG, 'urgenciaDaEquipa') + '\n' +
        'this.urgencia = urgenciaDaEquipa; this.M = MentalidadeModel;', sandbox);
    return sandbox;
}

const ORDEM = ['muito_defensiva', 'defesa', 'balanceado', 'ataque', 'muito_ofensiva'];

test('todas as mentalidades têm urgência', () => {
    const s = montar('balanceado');
    for (const nome of ORDEM) {
        assert.strictEqual(typeof s.M[nome].urgencia, 'number', nome);
    }
});

test('a urgência cresce da defensiva para a ofensiva', () => {
    const s = montar('balanceado');
    for (let i = 1; i < ORDEM.length; i++) {
        assert.ok(s.M[ORDEM[i]].urgencia > s.M[ORDEM[i - 1]].urgencia,
            ORDEM[i] + ' devia ser mais urgente que ' + ORDEM[i - 1]);
    }
});

test('urgência dentro de 0..1', () => {
    const s = montar('balanceado');
    for (const nome of ORDEM) {
        assert.ok(s.M[nome].urgencia >= 0 && s.M[nome].urgencia <= 1, nome);
    }
});

test('urgenciaDaEquipa lê a mentalidade corrente', () => {
    assert.strictEqual(montar('muito_ofensiva').urgencia('TeamA'), 1.0);
    assert.strictEqual(montar('muito_defensiva').urgencia('TeamA'), 0.0);
});

test('as duas equipas partilham a mentalidade, por enquanto', () => {
    const s = montar('ataque');
    assert.strictEqual(s.urgencia('TeamA'), s.urgencia('TeamB'));
});

test('mentalidade desconhecida não rebenta', () => {
    const s = montar('inexistente');
    const u = s.urgencia('TeamA');
    assert.ok(u >= 0 && u <= 1, 'u=' + u);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/urgencia.test.js`
Expected: FAIL — `function urgenciaDaEquipa nao encontrada`.

- [ ] **Step 3: Write minimal implementation**

Em `js/config.js`, acrescentar `urgencia` a cada entrada do `MentalidadeModel`
(a seguir a `agressao` em cada uma):

| entrada | valor |
|---|---|
| `muito_defensiva` | `urgencia: 0.0` |
| `defesa` | `urgencia: 0.2` |
| `balanceado` | `urgencia: 0.4` |
| `ataque` | `urgencia: 0.7` |
| `muito_ofensiva` | `urgencia: 1.0` |

E, logo a seguir ao fecho do literal `MentalidadeModel`:

```javascript
/*
URGÊNCIA — o quanto a equipa está com pressa, 0..1.

Não vem do placar nem do relógio directamente: quem muda a urgência é o
técnico, ao mudar a Mentalidade. Enquanto o técnico for o utilizador, o
painel é o volante.

Recebe `team` e ignora-o de propósito: hoje o painel é um só e o
`Tatics.estilo` é global às duas equipas. Quando houver um painel por equipa
(e uma delas na CPU), muda-se SÓ O CORPO desta função — nenhum listener de
evento precisa de saber.

É a urgência que inverte reacções: com a bola a caminho do guarda-redes,
urgência baixa abre os laterais para sair a jogar; urgência alta sobe-os,
porque o chutão vem aí.
*/
function urgenciaDaEquipa(team) {
    const m = MentalidadeModel[Tatics.estilo] || MentalidadeModel.balanceado;
    return (typeof m.urgencia === 'number') ? m.urgencia : 0.4;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/urgencia.test.js`
Expected: PASS, 6 testes.

- [ ] **Step 5: Commit**

```bash
git add js/config.js tests/urgencia.test.js
git commit -m "feat: urgencia da equipa derivada da Mentalidade"
```

---

### Task 6: Consumir os vieses posicionais

`buildOutBias`/`buildOutTimer` são escritos por três listeners (`js/match.js:60`,
`js/match.js:90`) e **lidos por ninguém**: o consumidor vivia no `position_bt.js`,
que foi apagado. Esta tarefa dá-lhes um consumidor — e é o mesmo por onde a
antecipação vai empurrar os dela.

**Files:**
- Modify: `js/bt/team_bt.js` (`PosicionamentoAI.tickBase`, no fim)
- Test: `tests/bias_posicional.test.js`

**Interfaces:**
- Produces: `aplicarBiasTemporario(p, dt, x, z)` → `{ x, z }`.
  Consome, por esta ordem, `p.buildOutBias`/`p.buildOutTimer` (saída de bola) e
  `p.antecipBias`/`p.antecipTimer` (antecipação). Ambos `{ x, z }` em metros, no
  referencial do mundo; o `timer` em segundos.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/bias_posicional.test.js
/*
Os vieses temporarios: um evento empurra o alvo de um jogador uns metros
durante uns segundos, e o empurrao expira sozinho.

Isto ja existia (buildOutBias, escrito pelos listeners CB_HAS_BALL/
CM_HAS_BALL em match.js) mas ninguem o LIA desde que o position_bt.js foi
apagado — os tres eventos nao mexiam um centimetro em campo.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const TEAM = fs.readFileSync(path.join(raiz, 'js', 'bt', 'team_bt.js'), 'utf8');

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
    const sandbox = { Math: Math };
    vm.createContext(sandbox);
    vm.runInContext(recortarFuncao(TEAM, 'aplicarBiasTemporario') +
        '\nthis.aplicar = aplicarBiasTemporario;', sandbox);
    return sandbox.aplicar;
}

test('sem viés nenhum, o alvo passa intacto', () => {
    const aplicar = montar();
    const r = aplicar({}, 0.016, 10, -20);
    assert.strictEqual(r.x, 10);
    assert.strictEqual(r.z, -20);
});

test('o viés da saída de bola desloca o alvo', () => {
    const aplicar = montar();
    const p = { buildOutBias: { x: 0, z: 5 }, buildOutTimer: 5.0 };
    const r = aplicar(p, 0.016, 10, -20);
    assert.strictEqual(r.z, -15);
});

test('o viés da antecipação desloca o alvo', () => {
    const aplicar = montar();
    const p = { antecipBias: { x: 6, z: -2 }, antecipTimer: 3.0 };
    const r = aplicar(p, 0.016, 10, -20);
    assert.strictEqual(r.x, 16);
    assert.strictEqual(r.z, -22);
});

test('os dois vieses somam', () => {
    const aplicar = montar();
    const p = {
        buildOutBias: { x: 0, z: 5 }, buildOutTimer: 5.0,
        antecipBias: { x: 6, z: 0 }, antecipTimer: 3.0
    };
    const r = aplicar(p, 0.016, 0, 0);
    assert.strictEqual(r.x, 6);
    assert.strictEqual(r.z, 5);
});

test('o viés expira sozinho', () => {
    const aplicar = montar();
    const p = { antecipBias: { x: 6, z: 0 }, antecipTimer: 0.5 };
    for (let t = 0; t < 1.0; t += 0.1) aplicar(p, 0.1, 0, 0);
    const r = aplicar(p, 0.1, 0, 0);
    assert.strictEqual(r.x, 0, 'o vies devia ter expirado');
    assert.strictEqual(p.antecipBias, null);
});

test('o timer nunca fica negativo', () => {
    const aplicar = montar();
    const p = { antecipBias: { x: 6, z: 0 }, antecipTimer: 0.05 };
    aplicar(p, 1.0, 0, 0);
    assert.ok(p.antecipTimer >= 0, 'timer=' + p.antecipTimer);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bias_posicional.test.js`
Expected: FAIL — `function aplicarBiasTemporario nao encontrada`.

- [ ] **Step 3: Write minimal implementation**

Em `js/bt/team_bt.js`, imediatamente antes de `const PosicionamentoAI = {`:

```javascript
/*
VIESES TEMPORÁRIOS — um evento empurra o alvo de um jogador uns metros
durante uns segundos, e o empurrão expira sozinho.

Dois canais, somados:

    buildOutBias / buildOutTimer   saída de bola (CB_HAS_BALL, CM_HAS_BALL,
                                   escritos em match.js)
    antecipBias / antecipTimer     antecipação (js/anticipation/*.js)

Canais separados de propósito: um evento de antecipação a expirar não pode
apagar o viés da saída de bola que outro evento pôs no mesmo jogador.

O `buildOutBias` estava a ser escrito por três listeners e lido por NINGUÉM
desde que o position_bt.js (onde vivia o `commit`) foi apagado — os três
eventos não mexiam um centímetro em campo. Isto devolve-lhes o consumidor.

Pura: sem Match, sem THREE.
*/
function aplicarBiasTemporario(p, dt, targetX, targetZ) {
    let x = targetX, z = targetZ;

    if (p.buildOutBias && p.buildOutTimer > 0) {
        x += p.buildOutBias.x;
        z += p.buildOutBias.z;
        p.buildOutTimer = Math.max(0, p.buildOutTimer - dt);
        if (p.buildOutTimer === 0) p.buildOutBias = null;
    }

    if (p.antecipBias && p.antecipTimer > 0) {
        x += p.antecipBias.x;
        z += p.antecipBias.z;
        p.antecipTimer = Math.max(0, p.antecipTimer - dt);
        if (p.antecipTimer === 0) p.antecipBias = null;
    }

    return { x: x, z: z };
}
```

E em `PosicionamentoAI.tickBase`, trocar o bloco final

```javascript
        if (!p.postoBase) p.postoBase = { x: 0, z: 0 };
        p.postoBase.x = comEstilo.x;
        p.postoBase.z = comEstilo.z;
```

por

```javascript
        // Os vieses de evento entram ANTES da marcação: quem foi empurrado
        // para a ala tem de escolher o homem a partir de onde vai estar, não
        // de onde estaria sem o evento.
        const dtBias = (typeof Match !== 'undefined' && Match.delta) ? Match.delta : 0.016;
        const comBias = aplicarBiasTemporario(p, dtBias, comEstilo.x, comEstilo.z);

        if (!p.postoBase) p.postoBase = { x: 0, z: 0 };
        p.postoBase.x = comBias.x;
        p.postoBase.z = comBias.z;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/bias_posicional.test.js`
Expected: PASS, 6 testes.

- [ ] **Step 5: Correr a suite toda**

Run: `node --test "tests/*.test.js"`
Expected: todos passam.

- [ ] **Step 6: Commit**

```bash
git add js/bt/team_bt.js tests/bias_posicional.test.js
git commit -m "fix: dar consumidor aos vieses posicionais de evento"
```

---

### Task 7: O evento `PREV_GK_SEGURA`

O exemplo do utilizador, ponta a ponta: a bola vai para o guarda-redes e os
laterais abrem **antes** de ele lhe tocar.

**Files:**
- Create: `js/anticipation/gk_segura.js`
- Modify: `index.html` (a seguir a `js/anticipation/core.js`)
- Test: `tests/antecipacao_gk.test.js`

**Interfaces:**
- Consumes: `AnticipationEvents.registar` (Task 3), `urgenciaDaEquipa` (Task 5),
  `p.antecipBias`/`p.antecipTimer` (Task 6).
- Produces: evento `PREV_GK_SEGURA`, horizonte `1.5`.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/antecipacao_gk.test.js
/*
O exemplo que motivou a camada toda: a bola vai para o guarda-redes e os
laterais abrem ANTES de ele lhe tocar, para serem opcao de passe.

Medido no jogo a serio (headless), nao numa funcao pura: o que interessa
provar e que o lateral se MEXEU, e que se mexeu a tempo.
*/
const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const { ctx, novoJogo } = require('./headless.js');

/*
Cenario: bola a rolar devagar para o guarda-redes do TeamA (baliza em
z = -53), sem ninguem entre ela e ele. Devolve a largura do TeamA (a
distancia em x entre o lateral esquerdo e o direito) antes e depois, e se o
GR ja tinha tocado na bola quando a largura mudou.
*/
function correrCenario(estilo) {
    return vm.runInContext(`
        (function () {
            Tatics.estilo = '${estilo}';
            Match.state = 'PLAY';
            Match.ballCarrier = null;
            Match.players.forEach(p => { p.hasBall = false; });
            Match.opponents.forEach(p => { p.hasBall = false; });

            // Bola a 20 m do GR do TeamA, a rolar para ele.
            Match.ball.position.set(0, 0.11, -33);
            Match.ballVel.set(0, 0, -12);
            Match.lastTouchedTeam = 'TeamA';

            const larguraA = () => {
                const rb = Match.players.find(p => p.pos === 'RB');
                const lb = Match.players.find(p => p.pos === 'LB');
                return Math.abs(rb.model.position.x - lb.model.position.x);
            };
            const avancoLaterais = () => {
                const rb = Match.players.find(p => p.pos === 'RB');
                const lb = Match.players.find(p => p.pos === 'LB');
                return (rb.model.position.z * rb.dirZ + lb.model.position.z * lb.dirZ) / 2;
            };

            const r = {
                larguraInicial: larguraA(),
                avancoInicial: avancoLaterais(),
                acreditouAntesDoToque: false,
                larguraFinal: 0,
                avancoFinal: 0
            };

            for (let i = 0; i < 90; i++) {
                Match.update(0.016);
                const rb = Match.players.find(p => p.pos === 'RB');
                const est = rb.blackboard.antecipa['PREV_GK_SEGURA'];
                if (est && est.acredita && !Match.gkHoldingBall.TeamA) {
                    r.acreditouAntesDoToque = true;
                }
            }
            r.larguraFinal = larguraA();
            r.avancoFinal = avancoLaterais();
            return r;
        })();
    `, ctx);
}

test('o lateral antecipa antes de o guarda-redes tocar na bola', () => {
    novoJogo();
    const r = correrCenario('balanceado');
    assert.strictEqual(r.acreditouAntesDoToque, true,
        'ninguem acreditou antes do toque');
});

test('com urgência baixa, os laterais abrem', () => {
    novoJogo();
    const r = correrCenario('balanceado');
    assert.ok(r.larguraFinal > r.larguraInicial + 2.0,
        'largura ' + r.larguraInicial.toFixed(1) + ' -> ' + r.larguraFinal.toFixed(1));
});

test('com urgência alta, os laterais sobem em vez de abrir', () => {
    novoJogo();
    const r = correrCenario('muito_ofensiva');
    assert.ok(r.avancoFinal > r.avancoInicial + 2.0,
        'avanco ' + r.avancoInicial.toFixed(1) + ' -> ' + r.avancoFinal.toFixed(1));
});

test('sem bola a caminho do GR, ninguém acredita', () => {
    novoJogo();
    const acreditou = vm.runInContext(`
        (function () {
            Match.state = 'PLAY';
            Match.ball.position.set(0, 0.11, 0);
            Match.ballVel.set(0, 0, 0);
            let algum = false;
            for (let i = 0; i < 90; i++) {
                Match.update(0.016);
                for (const p of Match.players) {
                    const est = p.blackboard.antecipa['PREV_GK_SEGURA'];
                    if (est && est.acredita) algum = true;
                }
            }
            return algum;
        })();
    `, ctx);
    assert.strictEqual(acreditou, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/antecipacao_gk.test.js`
Expected: FAIL — `est` é `undefined`, ninguém acreditou.

- [ ] **Step 3: Write minimal implementation**

```javascript
// js/anticipation/gk_segura.js
/*
=============================================================================
PREV_GK_SEGURA — "o nosso guarda-redes vai ficar com a bola"
=============================================================================
O caso que motivou a camada. Já existia o GK_CATCH_BALL, mas é um evento de
facto consumado: dispara quando o guarda-redes JÁ agarrou, e a equipa
reorganiza-se depois (com snapPosition, um teletransporte). Na vida real os
laterais começam a abrir enquanto a bola ainda rola para ele.

Detector e reacção no mesmo ficheiro, de propósito: o EventBus desacopla,
mas com o detector aqui e a reacção noutro sítio ninguém percebia o evento
inteiro sem abrir dois ficheiros.
=============================================================================
*/
(function () {
    const HORIZONTE = 1.5;   // segundos: o que se consegue mesmo ver a chegar

    // Metros de desvio. Abrir é lateral (x), subir é para a frente (z * dirZ).
    const ABRE_LATERAL = 7.0;
    const RECUA_CENTRAL = 3.0;
    const SOBE_LATERAL = 12.0;
    const SOBE_CENTRAL = 8.0;

    // Acima disto a equipa está com pressa: o guarda-redes vai chutar longo
    // e quem fica atrás a dar linha de passe só perde tempo.
    const URGENCIA_CHUTAO = 0.6;

    const DURACAO_BIAS = 2.5;   // segundos; renovado enquanto acreditar

    function guardaRedesDe(team) {
        const lista = (team === 'TeamA') ? Match.players : Match.opponents;
        return lista.find(j => j.role === 'gk') || null;
    }

    AnticipationEvents.registar({
        nome: 'PREV_GK_SEGURA',
        horizonte: HORIZONTE,

        // Só a última linha se reorganiza para a saída de bola. Poupa ~14 dos
        // 22 jogadores em cada avaliação.
        interessa: (p) => p.role === 'def',

        prever: function (p, bb, match) {
            if (typeof Match === 'undefined') return 0;

            // Já é facto consumado: o GK_CATCH_BALL trata daí para a frente.
            if (Match.gkHoldingBall && Match.gkHoldingBall[p.team]) return 0;
            if (Match.state !== 'PLAY') return 0;

            const gk = guardaRedesDe(p.team);
            if (!gk) return 0;

            const bola = Match.ball.position;
            const dx = gk.model.position.x - bola.x;
            const dz = gk.model.position.z - bola.z;
            const dist = Math.hypot(dx, dz);
            if (dist < 0.001) return 0;

            // Velocidade da bola projectada na direcção do guarda-redes: uma
            // bola rápida a passar AO LADO dele não conta.
            const vel = Math.hypot(Match.ballVel.x, Match.ballVel.z);
            if (vel < 0.5) return 0;
            const aproxima = (Match.ballVel.x * dx + Match.ballVel.z * dz) / dist;
            if (aproxima <= 0.5) return 0;

            const tempo = dist / aproxima;
            if (tempo > HORIZONTE) return 0;

            // Adversário mais perto da bola do que o nosso guarda-redes: ele
            // pode chegar primeiro, e a saída de bola não vai acontecer.
            const adversarios = (p.team === 'TeamA') ? Match.opponents : Match.players;
            let disputada = false;
            for (const o of adversarios) {
                if (o.role === 'gk') continue;
                const d = Math.hypot(o.model.position.x - bola.x, o.model.position.z - bola.z);
                if (d < dist) { disputada = true; break; }
            }

            const base = 1 - (tempo / HORIZONTE);
            return Math.max(0, Math.min(1, base * (disputada ? 0.3 : 1.0)));
        },

        ouvir: function (p, dados) {
            const urgente = (typeof urgenciaDaEquipa === 'function')
                ? urgenciaDaEquipa(p.team) > URGENCIA_CHUTAO
                : false;

            const lateral = (p.pos === 'LB' || p.pos === 'RB' ||
                             p.pos === 'LWB' || p.pos === 'RWB');

            if (urgente) {
                // Chutão à vista: ninguém fica atrás a dar linha de passe.
                const metros = lateral ? SOBE_LATERAL : SOBE_CENTRAL;
                p.antecipBias = { x: 0, z: metros * p.dirZ };
            } else if (lateral) {
                // Abre para a linha, do lado dele. O sinal vem do slot na
                // formação (baseTarget), não da posição actual: a meio de uma
                // recomposição ele pode estar do lado errado do campo.
                const lado = Math.sign(p.baseTarget.x) || 1;
                p.antecipBias = { x: lado * ABRE_LATERAL, z: -1.0 * p.dirZ };
            } else {
                // Central: abre um pouco e recua, para receber de frente.
                const lado = Math.sign(p.baseTarget.x) || 1;
                p.antecipBias = { x: lado * 2.0, z: -RECUA_CENTRAL * p.dirZ };
            }

            p.antecipTimer = DURACAO_BIAS;
        },

        largar: function (p) {
            p.antecipBias = null;
            p.antecipTimer = 0;
        }
    });
})();
```

Em `index.html`, a seguir a `<script src="js/anticipation/core.js"></script>`:

```html
    <script src="js/anticipation/gk_segura.js"></script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/antecipacao_gk.test.js`
Expected: PASS, 4 testes.

Se o segundo ou o terceiro teste falharem por o desvio ser pequeno de mais,
afinar `ABRE_LATERAL` / `SOBE_LATERAL` — **não** o limiar do teste. O teste
diz o que se quer ver em campo; as constantes é que servem o teste.

- [ ] **Step 5: Correr a suite toda**

Run: `node --test "tests/*.test.js"`
Expected: todos passam.

- [ ] **Step 6: Commit**

```bash
git add js/anticipation/gk_segura.js index.html tests/antecipacao_gk.test.js
git commit -m "feat: antecipacao PREV_GK_SEGURA - laterais abrem antes do toque"
```

---

### Task 8: A varredura da pasta

O guarda que impede a confusão daqui a seis meses: qualquer ficheiro novo em
`js/anticipation/` tem de cumprir o contrato, e o teste falha se não cumprir.

**Files:**
- Create: `tests/antecipacao_pasta.test.js`

**Interfaces:**
- Consumes: `AnticipationEvents` (Task 3), os ficheiros de evento (Task 7).

- [ ] **Step 1: Write the failing test**

```javascript
// tests/antecipacao_pasta.test.js
/*
Varredura da pasta js/anticipation/: cada ficheiro de evento tem de cumprir
o contrato do registo, e tem de estar carregado no index.html.

Este teste e o que impede a confusao no futuro. Um evento novo que se
esqueca do `largar`, ou que nunca chegue a ser carregado, falha aqui em vez
de falhar em campo daqui a tres meses.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ctx } = require('./headless.js');

const raiz = path.join(__dirname, '..');
const PASTA = path.join(raiz, 'js', 'anticipation');

const ficheirosDeEvento = fs.readdirSync(PASTA)
    .filter(f => f.endsWith('.js') && f !== 'core.js');

test('há pelo menos um evento na pasta', () => {
    assert.ok(ficheirosDeEvento.length > 0, 'nenhum evento em js/anticipation/');
});

test('todos os ficheiros da pasta estão carregados no index.html', () => {
    const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
    for (const f of ['core.js'].concat(ficheirosDeEvento)) {
        assert.ok(html.includes('js/anticipation/' + f),
            'js/anticipation/' + f + ' nao esta no index.html');
    }
});

test('o core.js vem antes dos eventos no index.html', () => {
    const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
    const iCore = html.indexOf('js/anticipation/core.js');
    for (const f of ficheirosDeEvento) {
        assert.ok(iCore < html.indexOf('js/anticipation/' + f),
            f + ' e carregado antes do core.js');
    }
});

test('cada evento registado cumpre o contrato', () => {
    const fichas = vm.runInContext(`
        AnticipationEvents.lista().map(f => ({
            nome: f.nome,
            horizonte: f.horizonte,
            temPrever: typeof f.prever === 'function',
            temOuvir: typeof f.ouvir === 'function',
            temLargar: typeof f.largar === 'function'
        }));
    `, ctx);

    assert.strictEqual(fichas.length, ficheirosDeEvento.length,
        'ficheiros na pasta: ' + ficheirosDeEvento.length +
        ', fichas registadas: ' + fichas.length);

    const vistos = new Set();
    for (const f of fichas) {
        assert.ok(f.nome.indexOf('PREV_') === 0, f.nome + ' sem prefixo PREV_');
        assert.ok(f.horizonte > 0, f.nome + ' com horizonte ' + f.horizonte);
        assert.ok(f.temPrever && f.temOuvir && f.temLargar, f.nome + ' incompleto');
        assert.ok(!vistos.has(f.nome), f.nome + ' registado duas vezes');
        vistos.add(f.nome);
    }
});
```

- [ ] **Step 2: Run test to verify it fails (se falhar, é bug real)**

Run: `node --test tests/antecipacao_pasta.test.js`
Expected: PASS já, se as Tasks 3 e 7 ficaram bem. Este teste é uma rede, não
um TDD: se falhar, o bug está no que as tarefas anteriores deixaram — corrigir
lá, não aqui.

- [ ] **Step 3: Correr a suite toda**

Run: `node --test "tests/*.test.js"`
Expected: todos passam.

- [ ] **Step 4: Actualizar a documentação**

Em `docs/filesSummary.md`, no topo da secção "Últimas Actualizações", acrescentar:

```markdown
- **Camada de Antecipação:** `js/anticipation/core.js` dá a cada jogador uma leitura do que VAI acontecer, com o erro dele lá dentro: latência, viés e limiar por skill (`perfilDeAntecipacao`/`actualizarCrenca`). Os eventos são fichas de dados registadas em `AnticipationEvents.registar`, uma por ficheiro em `js/anticipation/`, com contrato validado (prefixo `PREV_`, horizonte > 0, `ouvir`/`largar` em par) e varridas por `tests/antecipacao_pasta.test.js`. O motor corre no tick do `Perception` (15 Hz) e é o único a falar com o `EventBus`. Primeiro evento: `PREV_GK_SEGURA` — os laterais abrem antes de o guarda-redes tocar na bola, ou sobem se `urgenciaDaEquipa` (derivada da Mentalidade) passar de 0.6. `aplicarBiasTemporario` (team_bt.js) devolveu consumidor ao `buildOutBias`, que estava a ser escrito por três listeners e lido por ninguém desde que o `position_bt.js` foi apagado.
```

E na secção de testes/harness, se existir, mencionar `tests/headless.js`.

- [ ] **Step 5: Commit**

```bash
git add tests/antecipacao_pasta.test.js docs/filesSummary.md
git commit -m "test: varredura do contrato dos eventos de antecipacao"
```

---

## O que fica para os planos seguintes

Do spec, por implementar:

- `RUN_INTO_SPACE` na FSM e o evento `PREV_ESPACO_A_FRENTE` (o exemplo do
  médio-direito).
- `PREV_PASSE_SAI` e a ligação aos `PlayingStyleTriggers`.
- Perda iminente de posse e remate iminente.

Cada um é um plano próprio, sobre o motor que este plano entrega.
