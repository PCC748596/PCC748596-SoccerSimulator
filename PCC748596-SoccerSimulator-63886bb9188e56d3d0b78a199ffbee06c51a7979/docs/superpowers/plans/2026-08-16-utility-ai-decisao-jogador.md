# Utility AI para a decisão do jogador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o `Selector` do nível 3 de decisão (`js/bt/player_bt.js`) por um sistema de Utility AI que pontua todas as acções aplicáveis no mesmo frame e escolhe entre elas, com os PlayingStyles a actuar como multiplicadores de score por acção.

**Architecture:** Três ficheiros novos em `js/utility/`. O `core.js` é o motor puro (curvas de resposta, combinação de considerandos, selecção top-N) e não sabe nada de futebol — é o único totalmente testável em Node. O `actions.js` declara o catálogo de acções como dados: cada acção tem uma pré-condição dura, uma lista de considerandos, uma chave de peso de estilo, e uma função de execução que é reaproveitada do BT actual. O `player_utility.js` liga tudo e substitui `PlayerAI.tick`. Uma flag de runtime (`window.usarUtilityAI`) alterna entre BT e Utility para comparação em jogo.

**Tech Stack:** JavaScript ES6 em scripts clássicos (sem build, sem módulos ES). Three.js r128 via CDN. Testes com o runner nativo do Node (`node --test`), sem dependências novas.

## Global Constraints

- **Sem dependências novas.** O `package.json` não ganha nenhuma entrada em `dependencies` nem `devDependencies`. O runner de testes é o `node --test` nativo (Node v22.19.0 confirmado no ambiente).
- **Scripts clássicos, não módulos ES.** Os ficheiros de `js/` são carregados por `<script src>` em `index.html` e declaram globais com `const`. Nunca usar `import`/`export`. Para testar em Node, cada ficheiro testável termina com o guarda:
  ```js
  if (typeof module !== 'undefined' && module.exports) module.exports = { /* ... */ };
  ```
  `module` é `undefined` no browser, portanto a linha é inerte lá.
- **`js/utility/core.js` não pode referir `THREE`, `Match`, `window`, nem qualquer constante de `js/config.js`.** É o único ficheiro que corre em Node sem stubs. Qualquer dependência do jogo entra por argumento.
- **A FSM continua a ser quem executa.** Nenhum considerando ou acção pode conter lógica que dure mais de um frame. Regra do projecto, declarada em `js/bt/core.js:11`.
- **Português de Portugal nos comentários e nomes de domínio**, seguindo o resto do código (`estiloAtivoDe`, `campoAberto`, `underPressure`). Nomes já existentes não são renomeados.
- **Os scripts novos entram no `index.html` depois de `js/bt/player_bt.js`** e antes de `js/player.js`, porque reutilizam `actPass`, `actShoot`, `PlayerContext` e restantes símbolos declarados lá.
- Spec de referência: `docs/superpowers/specs/2026-08-16-utility-ai-decisao-jogador-design.md`

## Estrutura de ficheiros

| Ficheiro | Responsabilidade | Estado |
|---|---|---|
| `js/utility/core.js` | Curvas de resposta, `combinarConsiderandos`, `escolherAccao`, `avaliarAccao`. Sem futebol. | Criar (Task 1) |
| `js/utility/actions.js` | Catálogo `AccoesComBola` e `AccoesSemBola`. Cada acção: `nome`, `pre`, `considerandos`, `estilo`, `executar`. | Criar (Tasks 3, 4, 5) |
| `js/utility/player_utility.js` | `UtilityAI.tick(p, dt)`: gates duros, monta candidatas, pontua, escolhe, executa. Inércia. | Criar (Tasks 3, 6) |
| `tests/helpers/stubs.js` | Globais falsos (`Match`, `SpatialGrid`, modelos de config, `estiloAtivoDe`) para testar `actions.js` em Node. | Criar (Task 3) |
| `tests/utility_core.test.js` | Testes do motor. | Criar (Task 1) |
| `tests/utility_actions.test.js` | Testes de pontuação das acções. | Criar (Tasks 3, 4, 5) |
| `js/config.js` | `UtilityModel`, novos campos de `EstiloBase`, pesos `driblar`. Remoção de parâmetros mortos. | Modificar (Tasks 2, 8) |
| `js/player.js` | Ponto de comutação BT/Utility. | Modificar (Task 3) |
| `js/bt/player_bt.js` | `dribbleCooldownTimer` no `prepare()`; remoção do bloco `CalculaDebug`. | Modificar (Tasks 5, 7) |
| `js/fsm.js` | Remoção do `changeState('DRIBBLE')` de dentro do `case 'CARRY'`. | Modificar (Task 5) |
| `js/main.js`, `index.html` | Botão `btn-utility`; remoção do `btn-passgrid`; `PassCandidates.update` no `animate()`. | Modificar (Tasks 3, 7, 8) |
| `js/pass_candidates.js` | Correcção do docstring mentiroso. | Modificar (Task 8) |
| `decisionSummary.md` | Reescrita das secções 2-4. | Modificar (Task 8) |

---

### Task 1: Motor de utilidade

Cria o núcleo puro e a infra-estrutura de testes. Nada disto sabe o que é um passe.

**Files:**
- Create: `js/utility/core.js`
- Create: `tests/utility_core.test.js`
- Modify: `package.json:6-11` (adicionar o script `test`)
- Modify: `index.html:329` (adicionar `<script src="js/utility/core.js"></script>` a seguir a `js/bt/player_bt.js`)

**Interfaces:**
- Consumes: nada.
- Produces:
  - `Curvas.linear(x, m, k)`, `Curvas.quad(x, m, k)`, `Curvas.inv(x, m, k)`, `Curvas.logistica(x, k, c)` — todas devolvem `number` em `[0, 1]`.
  - `combinarConsiderandos(valores: number[]) -> number` em `[0, 1]`.
  - `avaliarAccao(accao, ctx) -> { nome: string, score: number, accao: object, considerandos: object }`.
  - `escolherAccao(candidatas: object[], margem: number, tamanhoPool: number, rng?: () => number) -> object | null`.
  - Formato de uma acção (consumido pelas Tasks 3-5):
    ```js
    {
        nome: 'SHOOT',
        estilo: 'remate',                       // chave em EstiloBase, ou null
        pre: (ctx) => boolean,                  // pré-condição dura
        considerandos: {
            nomeDoConsiderando: (ctx) => number  // 0..1
        },
        executar: (ctx) => void
    }
    ```

- [ ] **Step 1: Escrever os testes que falham**

Criar `tests/utility_core.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { Curvas, combinarConsiderandos, avaliarAccao, escolherAccao } =
    require('../js/utility/core.js');

test('Curvas.linear satura em 0 e 1', () => {
    assert.strictEqual(Curvas.linear(0.5), 0.5);
    assert.strictEqual(Curvas.linear(-3), 0);
    assert.strictEqual(Curvas.linear(3), 1);
});

test('Curvas.inv decresce', () => {
    assert.strictEqual(Curvas.inv(0), 1);
    assert.strictEqual(Curvas.inv(1), 0);
    assert.ok(Curvas.inv(0.25) > Curvas.inv(0.75));
});

test('Curvas.quad cresce mais devagar perto de zero do que a linear', () => {
    assert.ok(Curvas.quad(0.3) < Curvas.linear(0.3));
    assert.ok(Math.abs(Curvas.quad(1) - 1) < 1e-9);
});

test('Curvas.logistica cruza 0.5 no centro e é monotona', () => {
    assert.ok(Math.abs(Curvas.logistica(0.5) - 0.5) < 1e-9);
    assert.ok(Curvas.logistica(0.8) > Curvas.logistica(0.2));
    assert.ok(Curvas.logistica(0) > 0 && Curvas.logistica(1) < 1);
});

test('combinarConsiderandos: um zero mata a accao', () => {
    assert.strictEqual(combinarConsiderandos([0.9, 0.9, 0]), 0);
});

test('combinarConsiderandos: lista vazia vale 0', () => {
    assert.strictEqual(combinarConsiderandos([]), 0);
});

test('combinarConsiderandos: um unico valor passa intacto', () => {
    assert.ok(Math.abs(combinarConsiderandos([0.7]) - 0.7) < 1e-9);
});

test('combinarConsiderandos compensa o numero de termos', () => {
    // Sem compensacao, 0.8^4 = 0.4096 — quatro considerandos bons dariam um
    // score pior do que dois medianos. A compensacao tem de o corrigir.
    const dois = combinarConsiderandos([0.8, 0.8]);
    const quatro = combinarConsiderandos([0.8, 0.8, 0.8, 0.8]);
    assert.ok(quatro > Math.pow(0.8, 4));
    assert.ok(quatro > 0.5);
    assert.ok(dois > quatro);           // mais termos ainda penaliza, mas pouco
});

test('combinarConsiderandos nunca sai de [0,1]', () => {
    for (const v of [[1, 1, 1], [0.001, 0.001], [1], [0, 0]]) {
        const r = combinarConsiderandos(v);
        assert.ok(r >= 0 && r <= 1, 'fora de [0,1]: ' + r);
    }
});

test('avaliarAccao devolve 0 quando a pre-condicao falha', () => {
    const accao = {
        nome: 'X', estilo: null,
        pre: () => false,
        considerandos: { a: () => 1 },
        executar: () => {}
    };
    const r = avaliarAccao(accao, {});
    assert.strictEqual(r.score, 0);
});

test('avaliarAccao recolhe os considerandos para debug', () => {
    const accao = {
        nome: 'X', estilo: null,
        pre: () => true,
        considerandos: { perto: () => 0.8, livre: () => 0.6 },
        executar: () => {}
    };
    const r = avaliarAccao(accao, {});
    assert.strictEqual(r.nome, 'X');
    assert.strictEqual(r.considerandos.perto, 0.8);
    assert.strictEqual(r.considerandos.livre, 0.6);
    assert.ok(r.score > 0);
});

test('avaliarAccao sem considerandos vale 0', () => {
    const accao = {
        nome: 'HOLD', estilo: null,
        pre: () => true, considerandos: {}, executar: () => {}
    };
    assert.strictEqual(avaliarAccao(accao, {}).score, 0);
});

test('escolherAccao descarta scores residuais', () => {
    const r = escolherAccao([{ nome: 'A', score: 0.01 }], 0.65, 3, () => 0);
    assert.strictEqual(r, null);
});

test('escolherAccao devolve null para lista vazia', () => {
    assert.strictEqual(escolherAccao([], 0.65, 3, () => 0), null);
});

test('escolherAccao com margem 1.0 e argmax puro', () => {
    const cands = [{ nome: 'A', score: 0.5 }, { nome: 'B', score: 0.9 }];
    for (let i = 0; i < 20; i++) {
        assert.strictEqual(escolherAccao(cands, 1.0, 3, Math.random).nome, 'B');
    }
});

test('escolherAccao nunca escolhe fora da margem', () => {
    const cands = [
        { nome: 'BOA', score: 0.9 },
        { nome: 'MEDIA', score: 0.7 },
        { nome: 'MA', score: 0.2 }
    ];
    for (let i = 0; i < 200; i++) {
        const nome = escolherAccao(cands, 0.65, 3, Math.random).nome;
        assert.notStrictEqual(nome, 'MA');   // 0.2 < 0.9*0.65 = 0.585
    }
});

test('escolherAccao respeita o tamanho do pool', () => {
    const cands = [
        { nome: 'A', score: 1.0 }, { nome: 'B', score: 0.95 },
        { nome: 'C', score: 0.9 }, { nome: 'D', score: 0.85 }
    ];
    for (let i = 0; i < 200; i++) {
        assert.notStrictEqual(escolherAccao(cands, 0.65, 3, Math.random).nome, 'D');
    }
});

test('escolherAccao sorteia proporcionalmente ao score', () => {
    const cands = [{ nome: 'A', score: 0.9 }, { nome: 'B', score: 0.9 }];
    let a = 0;
    for (let i = 0; i < 1000; i++) {
        if (escolherAccao(cands, 0.65, 3, Math.random).nome === 'A') a++;
    }
    assert.ok(a > 380 && a < 620, 'distribuicao enviesada: ' + a);
});
```

- [ ] **Step 2: Correr para confirmar que falha**

Adicionar a `package.json`, no bloco `"scripts"`, a seguir a `"build"`:

```json
    "test": "node --test tests/",
```

Run: `npm test`
Expected: FAIL — `Cannot find module '../js/utility/core.js'`

- [ ] **Step 3: Implementar o motor**

Criar `js/utility/core.js`:

```js
/*
=============================================================================
UTILITY AI — MOTOR
=============================================================================
Motor de decisão por pontuação, partilhado pelo nível 3. Substitui o Selector
do Behavior Tree, que testava os ramos por ordem e executava o primeiro que
passasse — nunca comparando opções entre si.

Aqui todas as acções aplicáveis são pontuadas no MESMO frame, na MESMA escala
(0..1), e a escolha é feita entre elas.

Este ficheiro não sabe nada de futebol: não refere THREE, Match, window nem
nenhuma constante de config.js. É por isso o único testável em Node sem stubs
(ver tests/utility_core.test.js). Tudo o que é do jogo entra por `ctx`.
=============================================================================
*/

function clamp01(x) {
    if (!(x > 0)) return 0;        // apanha NaN também
    return x > 1 ? 1 : x;
}

/*
Curvas de resposta. Cada considerando normaliza uma medida do jogo para 0..1
e passa-a por uma destas.

A `logistica` é a que substitui a maior parte dos `if` binários do BT antigo:
uma zona de remate deixa de ser sim/não e passa a valer 0.35 aos 24 m e 0.9
aos 12 m.
*/
const Curvas = {
    linear: function (x, m, k) {
        return clamp01((m === undefined ? 1 : m) * x + (k === undefined ? 0 : k));
    },
    quad: function (x, m, k) {
        return clamp01((m === undefined ? 1 : m) * x * x + (k === undefined ? 0 : k));
    },
    inv: function (x, m, k) {
        return clamp01((k === undefined ? 1 : k) - (m === undefined ? 1 : m) * x);
    },
    logistica: function (x, k, c) {
        const kk = (k === undefined) ? 10 : k;
        const cc = (c === undefined) ? 0.5 : c;
        return clamp01(1 / (1 + Math.exp(-kk * (x - cc))));
    }
};

/*
Combina os considerandos por PRODUTO, não por soma.

Com soma, um considerando a zero é abafado pelos outros — é assim que se chega
a rematar de 40 m porque "estou livre" e "estou virado para o golo" somam alto.
Com produto, um zero mata a acção, que é o comportamento pretendido.

O produto puro tem o defeito simétrico: uma acção com quatro considerandos a
0.8 daria 0.41, pior do que duas a 0.7 (0.49), só por ter mais termos. A
compensação (Dave Mark, "Behavioral Mathematics") corrige isso — quantos mais
termos, mais o resultado é puxado de volta para cima.
*/
function combinarConsiderandos(valores) {
    const n = valores.length;
    if (!n) return 0;

    let produto = 1;
    for (let i = 0; i < n; i++) produto *= valores[i];
    if (produto === 0) return 0;

    const compensacao = 1 - 1 / n;
    const modificacao = (1 - produto) * compensacao;
    return clamp01(produto + modificacao * produto);
}

/*
Pontua UMA acção. A pré-condição é dura: se falhar, score 0 e nem se avaliam
os considerandos (é o que impede, por exemplo, calcular o alvo de cruzamento
para um central dentro da sua própria área).

Devolve sempre o mapa de considerandos avaliados — é o que o painel de debug
mostra para se perceber POR QUE é que uma acção perdeu, e não só que perdeu.
*/
function avaliarAccao(accao, ctx) {
    const detalhe = {};
    if (accao.pre && !accao.pre(ctx)) {
        return { nome: accao.nome, score: 0, accao: accao, considerandos: detalhe };
    }

    const valores = [];
    for (const chave in accao.considerandos) {
        const v = clamp01(accao.considerandos[chave](ctx));
        detalhe[chave] = v;
        valores.push(v);
    }

    return {
        nome: accao.nome,
        score: combinarConsiderandos(valores),
        accao: accao,
        considerandos: detalhe
    };
}

/*
Escolhe entre as candidatas: top-N dentro de uma margem do topo, e depois
sorteio ponderado pelo próprio score.

Isto substitui todos os `Math.random()` espalhados pelas folhas do BT antigo
(CrossModel.chanceMax, PassModel.carryChance, PassModel.throughBallChance, as
taxas por segundo do carrinho e do desarme). Lá, o sorteio decidia SE uma
opção acontecia, sem saber se era boa. Aqui só entram no sorteio as opções que
já provaram ser boas — a aleatoriedade dá variedade, não decide.

`margem = 1.0` reduz isto a argmax puro, útil para depurar sem tocar no código.
`rng` é injectável para os testes serem determinísticos.
*/
function escolherAccao(candidatas, margem, tamanhoPool, rng) {
    const sortear = rng || Math.random;

    const validas = candidatas.filter(c => c.score > 0.02);
    if (!validas.length) return null;

    validas.sort((a, b) => b.score - a.score);

    const corte = validas[0].score * margem;
    const pool = validas.filter(c => c.score >= corte).slice(0, tamanhoPool);
    if (pool.length === 1) return pool[0];

    let total = 0;
    for (const c of pool) total += c.score;

    let r = sortear() * total;
    for (const c of pool) {
        r -= c.score;
        if (r <= 0) return c;
    }
    return pool[0];
}

// Inerte no browser (`module` é undefined); serve o runner de testes do Node.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { clamp01, Curvas, combinarConsiderandos, avaliarAccao, escolherAccao };
}
```

- [ ] **Step 4: Correr os testes**

Run: `npm test`
Expected: PASS — 18 testes.

Se `combinarConsiderandos compensa o numero de termos` falhar no `dois > quatro`, é sinal de que a compensação foi escrita ao contrário; a fórmula correcta puxa para cima mas nunca acima do produto de menos termos com os mesmos valores.

- [ ] **Step 5: Registar o script no index.html**

Em `index.html`, imediatamente a seguir à linha `<script src="js/bt/player_bt.js"></script>` (linha 329):

```html
    <script src="js/utility/core.js"></script>
```

- [ ] **Step 6: Confirmar que a página continua a carregar**

Run: `npm run dev`
Abrir a página, abrir a consola do browser.
Expected: nenhum erro novo; `typeof Curvas` na consola devolve `'object'`.

- [ ] **Step 7: Commit**

```bash
git add js/utility/core.js tests/utility_core.test.js package.json index.html
git commit -m "feat: motor de Utility AI (curvas, combinacao, seleccao top-N)"
```

---

### Task 2: Configuração — pesos de estilo e parâmetros do Utility

Os multiplicadores por acção já existem em `EstiloBase` mas estão incompletos (falta `driblar`, e o ramo sem bola não tem chaves nenhumas). Esta task fecha o vocabulário antes de haver acções a lê-lo.

**Files:**
- Modify: `js/config.js:626-633` (`EstiloBase`)
- Modify: `js/config.js:635+` (`PlayingStyles` — acrescentar `driblar` a oito estilos)
- Modify: `js/config.js` (novo `UtilityModel`, a seguir a `CadenceModel`, linha 1486)
- Test: `tests/utility_config.test.js`

**Interfaces:**
- Consumes: nada.
- Produces: `EstiloBase.driblar`, `EstiloBase.marcar`, `EstiloBase.intercetar`, `EstiloBase.apoiar` (todos `1.0`); `UtilityModel.margemTopN`, `UtilityModel.tamanhoPool`, `UtilityModel.inerciaBase`, `UtilityModel.inerciaDecai`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/utility_config.test.js`. O `js/config.js` inteiro não é carregável em Node (usa `THREE` e `document` no topo), por isso o teste lê o ficheiro como texto e verifica os blocos por regex. É um teste de contrato, não de comportamento — chega para apanhar a chave esquecida, que é o erro real que se quer prevenir.

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const CONFIG = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'config.js'), 'utf8');

function bloco(nome) {
    const i = CONFIG.indexOf('const ' + nome + ' = {');
    assert.ok(i >= 0, 'bloco ' + nome + ' nao encontrado');
    return CONFIG.slice(i, CONFIG.indexOf('};', i));
}

test('EstiloBase declara as chaves de peso do Utility', () => {
    const b = bloco('EstiloBase');
    for (const chave of ['driblar', 'marcar', 'intercetar', 'apoiar',
                         'passe', 'remate', 'cruzar', 'lancar', 'conduzir',
                         'pressao', 'cadencia']) {
        assert.ok(new RegExp('\\b' + chave + '\\s*:').test(b),
            'EstiloBase sem a chave ' + chave);
    }
});

test('EstiloBase da 1.0 neutro as chaves novas', () => {
    const b = bloco('EstiloBase');
    for (const chave of ['driblar', 'marcar', 'intercetar', 'apoiar']) {
        assert.ok(new RegExp(chave + '\\s*:\\s*1\\.0').test(b),
            chave + ' deve ser neutro (1.0) na base');
    }
});

test('UtilityModel existe com os quatro parametros', () => {
    const b = bloco('UtilityModel');
    for (const chave of ['margemTopN', 'tamanhoPool', 'inerciaBase', 'inerciaDecai']) {
        assert.ok(new RegExp('\\b' + chave + '\\s*:').test(b),
            'UtilityModel sem ' + chave);
    }
});

test('os estilos com identidade de drible declaram o peso', () => {
    const esperado = {
        prolific_winger: 1.5, creative_playmaker: 1.4, roaming_flank: 1.4,
        orchestrator: 0.5, target_man: 0.5, fox_in_the_box: 0.4,
        the_destroyer: 0.4, anchor_man: 0.3
    };
    for (const estilo in esperado) {
        const i = CONFIG.indexOf(estilo + ': {');
        assert.ok(i >= 0, 'estilo ' + estilo + ' nao encontrado');
        const corpo = CONFIG.slice(i, CONFIG.indexOf('},', i));
        const m = corpo.match(/driblar\s*:\s*([0-9.]+)/);
        assert.ok(m, estilo + ' sem peso driblar');
        assert.strictEqual(parseFloat(m[1]), esperado[estilo],
            estilo + ' com peso driblar errado');
    }
});
```

- [ ] **Step 2: Correr para confirmar que falha**

Run: `npm test`
Expected: FAIL — `EstiloBase sem a chave driblar`, `bloco UtilityModel nao encontrado`.

- [ ] **Step 3: Alterar o `EstiloBase`**

Em `js/config.js:626`, substituir o bloco:

```js
const EstiloBase = {
    avanco: 0, largura: 0, avancoComBola: 0, amplitudeZ: 1.0,
    passe: 1.0, remate: 1.0, cruzar: 1.0, lancar: 1.0, conduzir: 1.0,
    pressao: 1.0, cadencia: 1.0,
    ombroDefesa: false, dentroArea: false, seguraBola: false,
    atraiDefesa: false, cortaParaDentro: false, colaNaLinha: false,
    juntaSeAoAtaque: false
};
```

por:

```js
const EstiloBase = {
    avanco: 0, largura: 0, avancoComBola: 0, amplitudeZ: 1.0,
    /*
    Multiplicadores de decisão. Cada um corresponde a uma acção do Utility AI
    (ver js/utility/actions.js) e multiplica o score dela. 1.0 é neutro.

    Antes do Utility estes pesos eram lidos de forma inconsistente — `cruzar` e
    `lancar` só mexiam num Math.random(), `remate` não era lido de todo, e
    `conduzir` não tinha consumidor nenhum. Agora todos entram no mesmo sítio,
    da mesma maneira.
    */
    passe: 1.0, remate: 1.0, cruzar: 1.0, lancar: 1.0, conduzir: 1.0,
    driblar: 1.0, pressao: 1.0, marcar: 1.0, intercetar: 1.0, apoiar: 1.0,
    cadencia: 1.0,
    ombroDefesa: false, dentroArea: false, seguraBola: false,
    atraiDefesa: false, cortaParaDentro: false, colaNaLinha: false,
    juntaSeAoAtaque: false
};
```

- [ ] **Step 4: Acrescentar o peso `driblar` aos estilos com identidade de drible**

Em `js/config.js`, dentro de `PlayingStyles`, acrescentar o campo `driblar` a estes oito estilos (manter todos os campos já existentes, só acrescentar):

| Estilo | Valor | Razão |
|---|---|---|
| `prolific_winger` | `driblar: 1.5` | Extremo de 1v1 — é a identidade dele |
| `creative_playmaker` | `driblar: 1.4` | Sai da pressão com condução |
| `roaming_flank` | `driblar: 1.4` | Fecha para dentro a driblar |
| `orchestrator` | `driblar: 0.5` | Constrói de trás; perder a bola ali é golo |
| `target_man` | `driblar: 0.5` | Segura e descarrega, não passa gente |
| `fox_in_the_box` | `driblar: 0.4` | Resolve num toque |
| `the_destroyer` | `driblar: 0.4` | Recupera e entrega |
| `anchor_man` | `driblar: 0.3` | Trinco à frente da defesa; nunca arrisca |

Exemplo do formato, para `prolific_winger` (os outros seguem o mesmo padrão — acrescentar `driblar: <valor>,` à lista de campos numéricos existente):

```js
    prolific_winger: {
        nome: 'Prolific Winger', posicoes: ['LW', 'RW', 'LM', 'RM'],
        largura: 6, cruzar: 1.5, conduzir: 1.25, driblar: 1.5,
        colaNaLinha: true
    },
```

Atenção: os campos exactos de cada estilo variam. Ler o bloco antes de editar e preservar tudo o que lá está.

- [ ] **Step 5: Acrescentar o `UtilityModel`**

Em `js/config.js`, imediatamente a seguir ao bloco `CadenceModel` (que termina na linha 1486):

```js
/*
Utility AI — parâmetros da decisão do nível 3 (ver js/utility/core.js).

`margemTopN` é a fracção do melhor score abaixo da qual uma acção nem entra no
sorteio final. A 0.65, uma acção precisa de valer pelo menos 65% da melhor para
ser considerada. Pôr a 1.0 dá argmax puro (sempre a melhor) — útil para
depurar comportamento sem tocar em código.

`inerciaBase`/`inerciaDecai` substituem o ramo `Dominar` do BT antigo, que
cegava o portador durante ~3 s (CadenceModel.posseBase) enquanto ele "pensava".
Agora ele avalia todos os frames, mas a acção que já escolheu recebe um bónus
que decai: recém-decidido vale mais 45%, e ao fim de ~2 s o bónus é residual.
Isto mata a oscilação sem cegar o jogador.
*/
const UtilityModel = {
    margemTopN: 0.65,
    tamanhoPool: 3,
    inerciaBase: 0.45,
    inerciaDecai: 0.8
};
```

- [ ] **Step 6: Correr os testes**

Run: `npm test`
Expected: PASS — todos os testes das Tasks 1 e 2.

- [ ] **Step 7: Commit**

```bash
git add js/config.js tests/utility_config.test.js
git commit -m "feat: pesos de estilo por accao e UtilityModel na config"
```

---

### Task 3: Acções com bola e comutação BT/Utility

Primeira versão funcional. No fim desta task o jogo corre com Utility se a flag for ligada à mão, mas o default continua a ser o BT — o ramo sem bola ainda não existe.

**Files:**
- Create: `js/utility/actions.js`
- Create: `js/utility/player_utility.js`
- Create: `tests/helpers/stubs.js`
- Create: `tests/utility_actions.test.js`
- Modify: `js/bt/player_bt.js:294-376` (`findCross`: expor `alvos`, `largura`, `fundo`)
- Modify: `js/bt/player_bt.js:156-251` (`findThroughBall`: expor `nota`)
- Modify: `js/player.js:581-586` (`findPassTarget`: guardar as métricas do vencedor)
- Modify: `js/player.js:417`
- Modify: `js/main.js` (nova função `toggleUtilityAI`)
- Modify: `index.html` (dois `<script>` novos, um botão novo)

**Nota sobre as funções de procura:** as três já calculam internamente os
números de que os considerandos precisam, mas deitam-nos fora ao devolver.
`findCross` devolve `{alvo, chance, alto, bloqueadores}` e descarta `alvos`,
`largura` e `fundo`; `findThroughBall` devolve `{mate, alvoX, alvoZ, alto}` e
descarta `melhorNota`; `findPassTarget` devolve o jogador e descarta o `score`
que acabou de calcular. O Step 4 expõe-nos — são adições ao valor de retorno,
sem alterar nenhum cálculo nem nenhum caminho de decisão existente.

**Interfaces:**
- Consumes: `Curvas`, `combinarConsiderandos`, `avaliarAccao`, `escolherAccao` (Task 1); `UtilityModel`, `EstiloBase` (Task 2); e, do código existente: `PlayerContext` e `ctx.campoAberto`/`ctx.underPressure`/`ctx.espacoAFrente`/`ctx.zoneAhead`/`ctx.skillTec`/`ctx.distToBall` (`js/bt/player_bt.js:21-141`), `emZonaDeRemate(ctx)`, `findCross(ctx)`, `findThroughBall(ctx)`, `bestPassTarget(ctx, preferida)`, `actShoot`, `actCross`, `actThroughBall`, `actPass`, `actCarry`, `estiloAtivoDe(p)`.
- Produces:
  - `AccoesComBola` — array de acções no formato da Task 1, na ordem `SHOOT`, `CROSS`, `THROUGH_BALL`, `PASS`, `CARRY`, `HOLD`.
  - `UtilityAI.tick(player, dt)`.
  - `window.usarUtilityAI` — flag booleana.
  - `findCross(ctx)` passa a devolver também `alvos: number`, `largura: number` (0..1), `fundo: number` (0..1).
  - `findThroughBall(ctx)` passa a devolver também `nota: number` (escala 0-150).
  - `p.ultimoAlvoPasse = { player, nota, progressao, folga } | null`, escrito por `findPassTarget()` a cada chamada.

- [ ] **Step 1: Escrever os stubs de teste**

Criar `tests/helpers/stubs.js`. O `actions.js` lê globais do jogo dentro das funções de considerando (nunca no topo do ficheiro), o que permite injectá-los aqui antes do `require`.

```js
/*
Globais falsos para testar js/utility/actions.js em Node.

O actions.js lê Match, SpatialGrid, os modelos de config e estiloAtivoDe SEMPRE
dentro das funcoes de considerando, nunca no topo do ficheiro. E' isso que
permite montar o mundo aqui antes de o carregar.
*/

function vec(x, y, z) {
    return {
        x: x, y: y, z: z,
        distanceTo: function (o) {
            return Math.hypot(this.x - o.x, this.y - o.y, this.z - o.z);
        }
    };
}

function jogador(opts) {
    const o = opts || {};
    return {
        id: o.id === undefined ? 1 : o.id,
        team: o.team || 'TeamA',
        pos: o.pos || 'CF',
        role: o.role || 'atk',
        dirZ: o.dirZ === undefined ? 1 : o.dirZ,
        targetGoalZ: o.targetGoalZ === undefined ? 52 : o.targetGoalZ,
        hasBall: !!o.hasBall,
        carryDist: o.carryDist || 0,
        carryTouchGrace: 0,
        decisionTimer: o.decisionTimer || 0,
        dribbleCooldownTimer: o.dribbleCooldownTimer === undefined ? 99 : o.dribbleCooldownTimer,
        tempoPertoDoPortador: o.tempoPertoDoPortador || 0,
        playingStyle: o.playingStyle || null,
        styleAtivo: o.styleAtivo === undefined ? true : o.styleAtivo,
        model: { position: vec(o.x || 0, 0, o.z || 0) },
        velocity: { x: 0, y: 0, z: 0, lengthSq: () => 0 },
        skills: o.skills || {},
        skillFor: function (campo) { return (o.skills && o.skills[campo]) || 50; },
        shootingRange: function () { return o.shootingRange === undefined ? 24 : o.shootingRange; },
        fsm: { currentState: o.estado || 'CARRY', changeState: function (s) { this.currentState = s; } }
    };
}

/*
Monta o mundo minimo e devolve o modulo actions.js ja carregado.
Chamar UMA vez por ficheiro de teste; usar `montarMundo` para reconfigurar
entre testes.
*/
function carregarActions() {
    globalThis.ShootingModel = { baseRange: 12.0, skillRange: 12.0, maxOffsetX: 24.0, angleFloor: 0.66, defenderFactor: 0.55 };
    globalThis.CrossModel = { alaX: 15.0, zonaZ: 14.0, areaZ: 34.0, areaX: 20.5, fundoZ: 50.0, distMin: 10.0 };
    globalThis.CarryModel = { corredor: 4.0, abertura: 0.35, espacoLivre: 12.0, distanciaMax: 25.0 };
    globalThis.PassModel = { throughBallGap: 14.0, throughBallDepth: 9.0, throughBallMaxDist: 45.0 };
    globalThis.DribbleModel = { triggerDist: 5.0, cooldown: 1.5 };
    globalThis.DefensivePressureModel = { low: 6.0, balanced: 4.0, high: 2.0 };
    globalThis.CadenceModel = { posseBase: 3.0, posseSobPressao: 0.6 };
    globalThis.UtilityModel = { margemTopN: 0.65, tamanhoPool: 3, inerciaBase: 0.45, inerciaDecai: 0.8 };
    globalThis.EstiloBase = {
        passe: 1.0, remate: 1.0, cruzar: 1.0, lancar: 1.0, conduzir: 1.0,
        driblar: 1.0, pressao: 1.0, marcar: 1.0, intercetar: 1.0, apoiar: 1.0,
        cadencia: 1.0
    };
    globalThis.estiloAtivoDe = function (p) {
        return Object.assign({}, globalThis.EstiloBase, (p && p._estilo) || {});
    };

    /*
    Funcoes de procura e de execucao do BT — substituidas por espioes.

    bestPassTarget devolve o JOGADOR alvo (e' esse o contrato real do
    findPassTarget); as metricas do passe vao para p.ultimoAlvoPasse, como no
    codigo verdadeiro.
    */
    globalThis.emZonaDeRemate = () => globalThis._emZona;
    globalThis.findCross = () => globalThis._cross;
    globalThis.findThroughBall = () => globalThis._through;
    globalThis.bestPassTarget = function (ctx) {
        ctx.p.ultimoAlvoPasse = globalThis._passInfo || null;
        return globalThis._pass;
    };
    for (const nome of ['actShoot', 'actCross', 'actThroughBall', 'actPass',
                        'actCarry', 'actSlideTackle', 'actTackle', 'actChaseBall',
                        'actIntercept', 'actReceivePass', 'actHoldPosition',
                        'actDribble']) {
        globalThis[nome] = function () { globalThis._executou = nome; };
    }

    globalThis.SpatialGrid = {
        cells: true,
        layerValueAt: function () { return globalThis._gridVal === undefined ? 50 : globalThis._gridVal; },
        findFreeSpace: function () { return null; }
    };
    globalThis.Match = { ball: { position: vec(0, 0, 0) }, ballCarrier: null,
                         intendedReceiver: null, players: [], opponents: [],
                         chaserA: null, chaserB: null, state: 'PLAY' };

    const core = require('../../js/utility/core.js');
    Object.assign(globalThis, core);

    return require('../../js/utility/actions.js');
}

/* Contexto minimo, no formato que o PlayerContext real produz. */
function contexto(p, extra) {
    return Object.assign({
        p: p,
        dt: 1 / 60,
        underPressure: false,
        espacoAFrente: Infinity,
        distToBall: 0,
        skillTec: 70,
        skillSpeed: 70,
        campoAberto: true,
        zoneAhead: p.model.position.z * p.dirZ,
        opponents: [],
        teammates: []
    }, extra || {});
}

function accao(lista, nome) {
    const a = lista.find(x => x.nome === nome);
    if (!a) throw new Error('accao ' + nome + ' nao existe');
    return a;
}

module.exports = { vec, jogador, carregarActions, contexto, accao };
```

- [ ] **Step 2: Escrever os testes que falham**

Criar `tests/utility_actions.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { jogador, carregarActions, contexto, accao } = require('./helpers/stubs.js');
const { AccoesComBola } = carregarActions();
const { avaliarAccao } = require('../js/utility/core.js');

function score(nome, p, extra) {
    return avaliarAccao(accao(AccoesComBola, nome), contexto(p, extra)).score;
}

test('o catalogo com bola tem as seis accoes', () => {
    const nomes = AccoesComBola.map(a => a.nome);
    assert.deepStrictEqual(nomes.sort(),
        ['CARRY', 'CROSS', 'HOLD', 'PASS', 'SHOOT', 'THROUGH_BALL'].sort());
});

test('SHOOT vale 0 fora da zona de remate', () => {
    globalThis._emZona = false;
    assert.strictEqual(score('SHOOT', jogador({ z: 45, hasBall: true })), 0);
});

test('SHOOT vale mais perto do que longe', () => {
    globalThis._emZona = true;
    const perto = score('SHOOT', jogador({ z: 44, hasBall: true }));
    const longe = score('SHOOT', jogador({ z: 30, hasBall: true }));
    assert.ok(perto > longe, 'perto=' + perto + ' longe=' + longe);
});

test('SHOOT desce com o angulo mau', () => {
    globalThis._emZona = true;
    const central = score('SHOOT', jogador({ x: 0, z: 44, hasBall: true }));
    const lateral = score('SHOOT', jogador({ x: 20, z: 44, hasBall: true }));
    assert.ok(central > lateral, 'central=' + central + ' lateral=' + lateral);
});

test('SHOOT desce sob pressao', () => {
    globalThis._emZona = true;
    const livre = score('SHOOT', jogador({ z: 44, hasBall: true }));
    const sob = score('SHOOT', jogador({ z: 44, hasBall: true }), { underPressure: true });
    assert.ok(livre > sob);
});

test('CROSS vale 0 sem alvo na area', () => {
    globalThis._cross = null;
    assert.strictEqual(score('CROSS', jogador({ x: 18, z: 30, hasBall: true })), 0);
});

test('CROSS sobe com o numero de alvos na area', () => {
    globalThis._cross = { alvo: {}, alvos: 1, largura: 0.5, fundo: 0.5 };
    const um = score('CROSS', jogador({ x: 18, z: 30, hasBall: true }));
    globalThis._cross = { alvo: {}, alvos: 3, largura: 0.5, fundo: 0.5 };
    const tres = score('CROSS', jogador({ x: 18, z: 30, hasBall: true }));
    assert.ok(tres > um, 'um=' + um + ' tres=' + tres);
});

test('CROSS sobe junto a linha lateral', () => {
    globalThis._cross = { alvo: {}, alvos: 2, largura: 0.1, fundo: 0.5 };
    const dentro = score('CROSS', jogador({ x: 16, z: 30, hasBall: true }));
    globalThis._cross = { alvo: {}, alvos: 2, largura: 0.9, fundo: 0.5 };
    const naLinha = score('CROSS', jogador({ x: 26, z: 30, hasBall: true }));
    assert.ok(naLinha > dentro, 'dentro=' + dentro + ' naLinha=' + naLinha);
});

test('THROUGH_BALL vale 0 sem espaco encontrado', () => {
    globalThis._through = null;
    assert.strictEqual(score('THROUGH_BALL', jogador({ z: 10, hasBall: true })), 0);
});

test('THROUGH_BALL sobe com a nota do espaco encontrado', () => {
    const p = jogador({ z: 10, hasBall: true });
    globalThis._through = { mate: {}, alvoX: 0, alvoZ: 40, nota: 140 };
    const bom = score('THROUGH_BALL', p);
    globalThis._through = { mate: {}, alvoX: 0, alvoZ: 40, nota: 30 };
    const mau = score('THROUGH_BALL', p);
    assert.ok(bom > mau, 'bom=' + bom + ' mau=' + mau);
});

test('THROUGH_BALL vale 0 sob pressao', () => {
    globalThis._through = { mate: {}, alvoX: 0, alvoZ: 40, nota: 140 };
    const p = jogador({ z: 10, hasBall: true });
    assert.strictEqual(score('THROUGH_BALL', p, { underPressure: true }), 0);
});

test('PASS vale 0 sem alvo', () => {
    globalThis._pass = null;
    globalThis._passInfo = null;
    assert.strictEqual(score('PASS', jogador({ z: 10, hasBall: true })), 0);
});

test('PASS sobe com a qualidade do alvo', () => {
    const p = jogador({ z: 10, hasBall: true });
    globalThis._pass = jogador({ id: 7, z: 25 });
    globalThis._passInfo = { nota: 260, progressao: 20, folga: 6 };
    const bom = score('PASS', p);
    globalThis._passInfo = { nota: 90, progressao: 2, folga: 0.5 };
    const mau = score('PASS', p);
    assert.ok(bom > mau, 'bom=' + bom + ' mau=' + mau);
});

test('PASS sobe sob pressao (descarregar e melhor do que segurar)', () => {
    const p = jogador({ z: 10, hasBall: true });
    globalThis._pass = jogador({ id: 7, z: 25 });
    globalThis._passInfo = { nota: 180, progressao: 10, folga: 3 };
    const livre = score('PASS', p);
    const sob = score('PASS', p, { underPressure: true });
    assert.ok(sob > livre, 'livre=' + livre + ' sob=' + sob);
});

test('PASS aguenta um alvo sem metricas registadas', () => {
    const p = jogador({ z: 10, hasBall: true });
    globalThis._pass = jogador({ id: 7, z: 25 });
    globalThis._passInfo = null;
    const s = score('PASS', p);
    assert.ok(s > 0 && s <= 1, 'score invalido sem metricas: ' + s);
});

test('CARRY desce quando o orcamento de conducao se esgota', () => {
    const fresco = score('CARRY', jogador({ z: 10, hasBall: true, carryDist: 0 }));
    const gasto = score('CARRY', jogador({ z: 10, hasBall: true, carryDist: 24 }));
    assert.ok(fresco > gasto, 'fresco=' + fresco + ' gasto=' + gasto);
});

test('CARRY desce sem espaco a frente', () => {
    const p = jogador({ z: 10, hasBall: true });
    const aberto = score('CARRY', p, { espacoAFrente: 30 });
    const fechado = score('CARRY', p, { espacoAFrente: 2 });
    assert.ok(aberto > fechado);
});

test('CARRY vale 0 para o guarda-redes', () => {
    assert.strictEqual(score('CARRY', jogador({ role: 'gk', hasBall: true })), 0);
});

test('HOLD tem sempre score baixo mas nao nulo', () => {
    const s = score('HOLD', jogador({ hasBall: true }));
    assert.ok(s > 0 && s < 0.3, 'HOLD=' + s);
});

test('cada accao declara a chave de estilo certa', () => {
    const esperado = {
        SHOOT: 'remate', CROSS: 'cruzar', THROUGH_BALL: 'lancar',
        PASS: 'passe', CARRY: 'conduzir', HOLD: null
    };
    for (const a of AccoesComBola) {
        assert.strictEqual(a.estilo, esperado[a.nome], a.nome + ' com estilo errado');
    }
});
```

- [ ] **Step 3: Correr para confirmar que falha**

Run: `npm test`
Expected: FAIL — `Cannot find module '../../js/utility/actions.js'`

- [ ] **Step 4: Expor os números que os considerandos precisam**

As três funções de procura já calculam tudo o que é preciso, mas descartam-no ao devolver. Estas alterações são só de valor de retorno — nenhum cálculo muda, nenhum caminho de decisão existente é afectado.

**`findCross`** (`js/bt/player_bt.js:370`). O `alvos`, o `largura` e o `fundo` já existem como variáveis locais logo acima. Substituir o `return`:

```js
    return {
        alvo: alvo,
        chance: THREE.MathUtils.clamp(chance, 0, C.chanceMax),
        alto: notaAlto >= 0.5,
        bloqueadores: bloqueadores,
        // Expostos para os considerandos da acção CROSS (js/utility/actions.js).
        // Já eram calculados aqui em cima; só não saíam da função.
        alvos: alvos,
        largura: largura,
        fundo: fundo
    };
```

**`findThroughBall`** (`js/bt/player_bt.js:227`). A `melhorNota` é local e perde-se. Alterar a linha que guarda o melhor candidato:

```js
        if (nota > melhorNota) {
            melhorNota = nota;
            // `nota` sai com o resultado: é o considerando `qualidade` da
            // acção THROUGH_BALL (js/utility/actions.js).
            melhor = { mate: mate, alvoX: alvoX, alvoZ: alvoZ, nota: nota };
        }
```

**`findPassTarget`** (`js/player.js:581-586`). Devolve o jogador e deita fora o `score` que acabou de calcular. Guardar as métricas do vencedor no passador, sem mudar o valor de retorno — `js/fsm.js:386` e o resto do BT continuam a receber um jogador, como sempre.

Primeiro, dentro do ciclo, ao empurrar o candidato (linha 578), passar a guardar também a progressão e a folga (ambas já calculadas acima como `progression` e `minOppDist`):

```js
            ratedCandidates.push({
                player: opt, score: score,
                progressao: progression, folga: minOppDist
            });
```

Depois, o bloco final:

```js
        if (ratedCandidates.length > 0) {
            ratedCandidates.sort((a, b) => b.score - a.score);
            const vencedor = ratedCandidates[0];
            /*
            Métricas do passe escolhido, para os considerandos da acção PASS
            (js/utility/actions.js). Ficam no passador e não no alvo porque
            descrevem ESTE passe, não aquele jogador — o mesmo colega pode ser
            um bom alvo para um companheiro e mau para outro.
            */
            this.ultimoAlvoPasse = {
                player: vencedor.player,
                nota: vencedor.score,
                progressao: vencedor.progressao,
                folga: vencedor.folga
            };
            return vencedor.player;
        }

        this.ultimoAlvoPasse = null;
        return null;
```

Nota: `findPassTargetRelaxed` e `findPassTargetDesperate` não são alteradas. Quando o alvo vem de uma delas, `ultimoAlvoPasse` fica com o `null` desta chamada e a acção `PASS` usa os valores neutros da sua pré-condição — que é o comportamento certo, porque esses dois caminhos são de recurso e não produzem uma pontuação comparável.

- [ ] **Step 5: Implementar o catálogo com bola**

Criar `js/utility/actions.js`:

```js
/*
=============================================================================
UTILITY AI — CATÁLOGO DE ACÇÕES
=============================================================================
Cada acção é declarada como DADOS: uma pré-condição dura, um mapa de
considerandos, a chave do peso de estilo, e a função que a executa.

A função de execução vem, sem alterações, do Behavior Tree que este sistema
substitui (js/bt/player_bt.js). O que muda não é o QUE se faz — é COMO se
escolhe: o BT testava os ramos por ordem e executava o primeiro que passasse;
aqui todos são pontuados e comparados.

Regra dos considerandos: cada um devolve 0..1 e lê o mundo SEMPRE dentro da
função, nunca no topo do ficheiro. É isso que permite testá-los em Node com
globais falsos (ver tests/helpers/stubs.js).
=============================================================================
*/

/* --- Auxiliares partilhados --------------------------------------------- */

// Distância do portador à baliza que ataca.
function _distAoGolo(p) {
    const dx = p.model.position.x;
    const dz = p.model.position.z - p.targetGoalZ;
    return Math.hypot(dx, dz);
}

/*
Perigo da zona onde o jogador está, no referencial DEFENSIVO: 1 junto à própria
baliza, 0 no meio-campo adversário. Serve para penalizar risco (driblar, entrar
em carrinho) perto da própria área, e para valorizar recuperar a bola lá.
*/
function _perigoDaZona(p) {
    const recuo = -(p.model.position.z * p.dirZ);   // metros atrás do meio-campo
    return Math.max(0, Math.min(1, recuo / 40));
}

/* --- Acções com bola ----------------------------------------------------- */

const AccoesComBola = [
    {
        nome: 'SHOOT',
        estilo: 'remate',
        // A zona de remate continua a ser um gate duro: a camada CHUTE do
        // SpatialGrid é autoria do utilizador e um 0 lá significa "daqui não".
        pre: (ctx) => emZonaDeRemate(ctx),
        considerandos: {
            distancia: (ctx) => Curvas.inv(_distAoGolo(ctx.p) / ctx.p.shootingRange()),
            angulo: (ctx) => Curvas.inv(
                Math.abs(ctx.p.model.position.x) / ShootingModel.maxOffsetX),
            pressao: (ctx) => ctx.underPressure ? 0.45 : 1.0,
            skill: (ctx) => Curvas.linear(ctx.p.skillFor('TEC') / 100, 0.7, 0.3)
        },
        executar: (ctx) => actShoot(ctx)
    },

    {
        nome: 'CROSS',
        estilo: 'cruzar',
        // findCross já filtra ala + profundidade + existência de alvo na área.
        pre: (ctx) => {
            ctx.cross = findCross(ctx);
            return ctx.cross !== null && ctx.cross !== undefined;
        },
        considerandos: {
            // Satura a 3 alvos: o quarto homem na área não melhora nada.
            alvos: (ctx) => Curvas.linear((ctx.cross.alvos || 1) / 3, 1, 0),
            // `largura` e `fundo` já vêm normalizados 0..1 do findCross —
            // um piso de 0.25 impede que estar a meio da ala mate a acção.
            largura: (ctx) => Curvas.linear(ctx.cross.largura || 0, 0.75, 0.25),
            fundo: (ctx) => Curvas.linear(ctx.cross.fundo || 0, 0.75, 0.25),
            pressao: (ctx) => ctx.underPressure ? 0.4 : 1.0
        },
        executar: (ctx) => actCross(ctx)
    },

    {
        nome: 'THROUGH_BALL',
        estilo: 'lancar',
        pre: (ctx) => {
            if (ctx.underPressure) return false;
            ctx.throughBall = findThroughBall(ctx);
            return ctx.throughBall !== null && ctx.throughBall !== undefined;
        },
        considerandos: {
            // `nota` é a pontuação do espaço encontrado (js/bt/player_bt.js:222),
            // tipicamente 0-150.
            qualidade: (ctx) => Curvas.linear((ctx.throughBall.nota || 60) / 150),
            skill: (ctx) => Curvas.linear(ctx.p.skillFor('PASS') / 100, 0.8, 0.2)
        },
        executar: (ctx) => actThroughBall(ctx)
    },

    {
        nome: 'PASS',
        estilo: 'passe',
        pre: (ctx) => {
            const preferida = (ctx.p.role === 'def') ? 'mid' : 'atk';
            ctx.passTarget = bestPassTarget(ctx, preferida);
            if (!ctx.passTarget) return false;
            /*
            bestPassTarget devolve o JOGADOR. As métricas do passe escolhido
            ficam em p.ultimoAlvoPasse (escrito pelo findPassTarget). Pode não
            existir quando o alvo veio do caminho Relaxed/Desperate — daí os
            valores neutros.
            */
            ctx.passeInfo = ctx.p.ultimoAlvoPasse || { nota: 100, progressao: 0, folga: 2 };
            return true;
        },
        considerandos: {
            // A nota de findPassTarget vai tipicamente até ~260 (100 de base
            // + bónus de estar livre, de sector e de progressão).
            alvo: (ctx) => Curvas.linear(ctx.passeInfo.nota / 260),
            // Metros ganhos na direcção do ataque. Um passe para trás não
            // anula a acção (às vezes é a jogada certa), mas vale menos.
            progressao: (ctx) => Curvas.linear((ctx.passeInfo.progressao + 10) / 40),
            // Folga: metros entre a linha de passe e o adversário mais perto
            // dela. Satura aos 6 m — mais do que isso já é passe livre.
            seguranca: (ctx) => Curvas.linear(ctx.passeInfo.folga / 6, 0.85, 0.15),
            // Ao contrário de todas as outras, esta SOBE sob pressão:
            // descarregar é melhor do que segurar com um adversário em cima.
            pressao: (ctx) => ctx.underPressure ? 1.0 : 0.75
        },
        executar: (ctx) => actPass(ctx)
    },

    {
        nome: 'CARRY',
        estilo: 'conduzir',
        pre: (ctx) => ctx.p.role !== 'gk',
        considerandos: {
            espaco: (ctx) => Curvas.logistica(
                Math.min(ctx.espacoAFrente, 40) / CarryModel.espacoLivre, 6, 0.7),
            // Orçamento de condução: sem isto o portador conduz enquanto houver
            // espaço, e como é ele que abre espaço ao correr, isso é sempre.
            orcamento: (ctx) => Curvas.inv(
                (ctx.p.carryDist || 0) / CarryModel.distanciaMax),
            pressao: (ctx) => ctx.underPressure ? 0.35 : 1.0,
            skill: (ctx) => Curvas.linear(ctx.skillTec / 100, 0.6, 0.4)
        },
        executar: (ctx) => actCarry(ctx)
    },

    {
        nome: 'HOLD',
        estilo: null,
        // Fallback: garante que o portador nunca fica sem acção escolhida.
        // Score fixo baixo — qualquer opção real ganha disto.
        pre: () => true,
        considerandos: { base: () => 0.15 },
        executar: (ctx) => actCarry(ctx)
    }
];

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AccoesComBola, _distAoGolo, _perigoDaZona };
}
```

- [ ] **Step 6: Correr os testes**

Run: `npm test`
Expected: PASS — todos, incluindo os 20 novos de `utility_actions.test.js`.

- [ ] **Step 7: Implementar o ponto de entrada**

Criar `js/utility/player_utility.js`:

```js
/*
=============================================================================
UTILITY AI — PONTO DE ENTRADA DO NÍVEL 3
=============================================================================
Substitui o PlayerAI (js/bt/player_bt.js) enquanto window.usarUtilityAI estiver
ligado. Reutiliza o PlayerContext do BT — o contexto por jogador já calculava
tudo o que é preciso (pressão, espaço à frente, skills, orçamento de condução).

Três gates duros correm ANTES de qualquer pontuação. Não são questões de
utilidade, são regras do jogo, e metê-las na pontuação abriria a porta a uma
acção em curso ser interrompida por um score marginal:

    1. jogo parado           -> comportamento de bola parada
    2. acção em curso na FSM -> deixa terminar
    3. guarda-redes          -> conjunto de acções próprio

O resto é: pontuar todas as candidatas, multiplicar pelo peso do estilo,
escolher, executar.
=============================================================================
*/

const UtilityAI = {

    tick: function (player, dt) {
        if (!player.btCtx) player.btCtx = new PlayerContext(player);
        const ctx = player.btCtx.prepare(dt);

        if (this.gatesDuros(ctx)) return;

        const comBola = player.hasBall || player.carryTouchGrace > 0;
        const lista = comBola ? AccoesComBola : AccoesSemBola;

        const candidatas = [];
        for (const accao of lista) {
            const r = avaliarAccao(accao, ctx);
            if (r.score <= 0) continue;
            r.score *= this.pesoDoEstilo(player, accao);
            candidatas.push(r);
        }

        if (window.showPlayerPoints) {
            player.utilityTrace = candidatas.slice().sort((a, b) => b.score - a.score);
        }

        const escolhida = escolherAccao(
            candidatas, UtilityModel.margemTopN, UtilityModel.tamanhoPool);
        if (!escolhida) return;

        player.utilityAccao = escolhida.nome;
        escolhida.accao.executar(ctx);
    },

    /*
    Devolve true se um gate tratou o frame e não há nada a pontuar.
    O comportamento de cada gate é o mesmo dos ramos homónimos do BT.
    */
    gatesDuros: function (ctx) {
        const p = ctx.p;

        if (Match.state !== 'PLAY') {
            const fsm = p.fsm;
            if (Match.state === 'CORNER_KICK') {
                if (fsm.currentState !== 'SET_PIECE_TAKER' && fsm.currentState !== 'SET_PIECE_WAIT') {
                    fsm.changeState('SET_PIECE_WAIT');
                }
            } else if (Match.state === 'GOAL_KICK') {
                if (fsm.currentState !== 'SET_PIECE_TAKER' &&
                    fsm.currentState !== 'SET_PIECE_WAIT' &&
                    fsm.currentState !== 'MOVE_TO_POS') {
                    fsm.changeState('SET_PIECE_WAIT');
                }
            } else {
                fsm.changeState('IDLE');
            }
            return true;
        }

        const s = p.fsm.currentState;
        if (s === 'PASS' || s === 'SHOOT' || s === 'TACKLE' || s === 'SLIDE_TACKLE' ||
            s === 'CUT' || s === 'CHEST_CONTROL' || s === 'DRIBBLE') {
            return true;
        }

        // Guarda-redes: mantém a lógica do BT, que é um caso à parte e não
        // beneficia de pontuação (as opções dele são mutuamente exclusivas).
        if (p.role === 'gk') {
            if (p.hasBall || p.carryTouchGrace > 0) {
                ctx.passTarget = p.findPassTarget('def') || p.findPassTarget('mid') ||
                    (ctx.underPressure ? p.findPassTargetRelaxed() : null);
                if (ctx.passTarget) actPass(ctx);
                else if (p.decisionTimer > 1.2) p.puntBall();
                else actCarry(ctx);
            } else {
                actGoalkeeperPosition(ctx);
            }
            return true;
        }

        return false;
    },

    pesoDoEstilo: function (p, accao) {
        if (!accao.estilo) return 1.0;
        const est = estiloAtivoDe(p);
        const w = est[accao.estilo];
        return (w === undefined) ? 1.0 : w;
    }
};
```

- [ ] **Step 8: Ligar a comutação**

Em `js/player.js:417`, substituir:

```js
        PlayerAI.tick(this, dt);
```

por:

```js
        // Nível 3. A flag alterna entre o Behavior Tree original e o Utility AI
        // (ver js/utility/player_utility.js) para se poderem comparar em jogo.
        if (window.usarUtilityAI) UtilityAI.tick(this, dt);
        else PlayerAI.tick(this, dt);
```

- [ ] **Step 9: Botão no painel**

Em `js/main.js`, a seguir à função `togglePasseGrid` (linha 188), acrescentar:

```js
function toggleUtilityAI() {
    window.usarUtilityAI = !window.usarUtilityAI;
    document.getElementById('btn-utility').innerText = 'Utility AI: ' + (window.usarUtilityAI ? 'ON' : 'OFF');
    document.getElementById('btn-utility').classList.toggle('active', window.usarUtilityAI);
}
```

Em `index.html`, junto do botão `btn-passgrid`, acrescentar (copiar as classes exactas do botão vizinho):

```html
    <button id="btn-utility" onclick="toggleUtilityAI()">Utility AI: OFF</button>
```

E os dois scripts novos, a seguir a `js/utility/core.js`:

```html
    <script src="js/utility/actions.js"></script>
    <script src="js/utility/player_utility.js"></script>
```

Atenção à ordem: `player_utility.js` refere `AccoesSemBola`, que só existe a partir da Task 4. Até lá, ligar a flag com um jogador sem bola dá `ReferenceError`. É esperado e é por isso que o default é OFF nesta task.

- [ ] **Step 10: Verificar em jogo**

Run: `npm run dev`
Na consola do browser:
```js
window.showPlayerPoints = true;
const p = Match.players.find(x => x.hasBall);
```
Expected: a página carrega sem erros, `typeof UtilityAI.tick === 'function'`, `AccoesComBola.length === 6`. O jogo continua a correr no BT (botão a OFF).

- [ ] **Step 11: Commit**

```bash
git add js/utility/actions.js js/utility/player_utility.js tests/helpers/stubs.js tests/utility_actions.test.js js/player.js js/bt/player_bt.js js/main.js index.html
git commit -m "feat: accoes com bola do Utility AI e comutacao BT/Utility"
```

---

### Task 4: Acções sem bola

Fecha o catálogo. No fim desta task o Utility passa a default.

**Files:**
- Modify: `js/utility/actions.js` (novo array `AccoesSemBola`)
- Modify: `tests/utility_actions.test.js` (novos testes)
- Modify: `index.html` (o botão passa a `Utility AI: ON`)
- Modify: `js/main.js` (inicializar `window.usarUtilityAI = true`)

**Interfaces:**
- Consumes: tudo o da Task 3, mais `podeIntercetar(ctx)`, `actSlideTackle`, `actTackle`, `actChaseBall`, `actIntercept`, `actReceivePass`, `actHoldPosition` (todos em `js/bt/player_bt.js`), `DefensivePressureModel`, `Tatics.pressaoDefensiva`, `Match.ballCarrier`, `Match.chaserA`, `Match.chaserB`, `Match.intendedReceiver`.
- Produces: `AccoesSemBola` — array com `SLIDE_TACKLE`, `TACKLE`, `INTERCEPT`, `CHASE_BALL`, `RECEIVE_PASS`, `ATTACK_BOX`, `HOLD_POSITION`.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao fim de `tests/utility_actions.test.js`:

```js
const { AccoesSemBola } = require('../js/utility/actions.js');

function scoreSem(nome, p, extra) {
    return avaliarAccao(accao(AccoesSemBola, nome), contexto(p, extra)).score;
}

function porPortador(opts) {
    const c = jogador(Object.assign({ team: 'TeamB', id: 99 }, opts));
    globalThis.Match.ballCarrier = c;
    return c;
}

test('o catalogo sem bola tem as sete accoes', () => {
    assert.deepStrictEqual(AccoesSemBola.map(a => a.nome).sort(),
        ['ATTACK_BOX', 'CHASE_BALL', 'HOLD_POSITION', 'INTERCEPT',
         'RECEIVE_PASS', 'SLIDE_TACKLE', 'TACKLE'].sort());
});

test('TACKLE vale 0 sem portador adversario', () => {
    globalThis.Match.ballCarrier = null;
    assert.strictEqual(scoreSem('TACKLE', jogador({ role: 'def' })), 0);
});

test('TACKLE vale 0 contra um colega de equipa', () => {
    globalThis.Match.ballCarrier = jogador({ team: 'TeamA', x: 1, z: 0 });
    const p = jogador({ team: 'TeamA', role: 'def', tempoPertoDoPortador: 9 });
    assert.strictEqual(scoreSem('TACKLE', p), 0);
});

test('TACKLE vale 0 antes do tempo do Defensive Pressure', () => {
    porPortador({ x: 1, z: 0 });
    const cedo = jogador({ role: 'def', tempoPertoDoPortador: 0.2 });
    assert.strictEqual(scoreSem('TACKLE', cedo, { distToBall: 1 }), 0);
});

test('TACKLE pontua depois do tempo do Defensive Pressure', () => {
    porPortador({ x: 1, z: 0 });
    const tarde = jogador({ role: 'def', tempoPertoDoPortador: 9 });
    assert.ok(scoreSem('TACKLE', tarde, { distToBall: 1 }) > 0);
});

test('TACKLE vale 0 fora do alcance', () => {
    porPortador({ x: 6, z: 0 });
    const p = jogador({ role: 'def', tempoPertoDoPortador: 9 });
    assert.strictEqual(scoreSem('TACKLE', p, { distToBall: 6 }), 0);
});

test('SLIDE_TACKLE so na faixa 2.5-4.5m', () => {
    const p = jogador({ role: 'def', tempoPertoDoPortador: 9 });
    porPortador({ x: 1.0, z: 0 });     // demasiado perto: e' TACKLE
    assert.strictEqual(scoreSem('SLIDE_TACKLE', p, { distToBall: 1 }), 0);
    porPortador({ x: 3.5, z: 0 });     // na faixa
    assert.ok(scoreSem('SLIDE_TACKLE', p, { distToBall: 3.5 }) > 0);
    porPortador({ x: 8.0, z: 0 });     // longe demais
    assert.strictEqual(scoreSem('SLIDE_TACKLE', p, { distToBall: 8 }), 0);
});

test('desarmar vale mais perto da propria baliza', () => {
    const p = jogador({ role: 'def', tempoPertoDoPortador: 9, z: -35 });
    porPortador({ x: 1, z: -35 });
    const perigo = scoreSem('TACKLE', p, { distToBall: 1 });

    const q = jogador({ role: 'def', tempoPertoDoPortador: 9, z: 20 });
    porPortador({ x: 1, z: 20 });
    const seguro = scoreSem('TACKLE', q, { distToBall: 1 });

    assert.ok(perigo > seguro, 'perigo=' + perigo + ' seguro=' + seguro);
});

test('INTERCEPT vale 0 quando podeIntercetar recusa', () => {
    globalThis.podeIntercetar = () => false;
    assert.strictEqual(scoreSem('INTERCEPT', jogador({})), 0);
});

test('INTERCEPT vale mais quando se chega mais depressa', () => {
    globalThis.podeIntercetar = () => true;
    const rapido = jogador({}); rapido.timeToIntercept = 0.2;
    const lento = jogador({}); lento.timeToIntercept = 1.1;
    assert.ok(scoreSem('INTERCEPT', rapido) > scoreSem('INTERCEPT', lento));
});

test('CHASE_BALL vale muito mais para o chaser designado', () => {
    const p = jogador({});
    globalThis.Match.chaserA = p;
    const designado = scoreSem('CHASE_BALL', p, { distToBall: 6 });
    globalThis.Match.chaserA = null;
    const qualquer = scoreSem('CHASE_BALL', p, { distToBall: 6 });
    assert.ok(designado > qualquer * 2, 'designado=' + designado + ' qualquer=' + qualquer);
});

test('CHASE_BALL vale 0 a mais de 12m', () => {
    const p = jogador({});
    globalThis.Match.chaserA = p;
    assert.strictEqual(scoreSem('CHASE_BALL', p, { distToBall: 15 }), 0);
});

test('RECEIVE_PASS domina quando o passe vem para mim', () => {
    const p = jogador({});
    globalThis.Match.intendedReceiver = p;
    assert.ok(scoreSem('RECEIVE_PASS', p) > 0.9);
    globalThis.Match.intendedReceiver = null;
    assert.strictEqual(scoreSem('RECEIVE_PASS', p), 0);
});

test('ATTACK_BOX vale 0 para defesas', () => {
    const c = jogador({ team: 'TeamA', x: 18, z: 30 });
    globalThis.Match.ballCarrier = c;
    assert.strictEqual(scoreSem('ATTACK_BOX', jogador({ role: 'def' })), 0);
});

test('ATTACK_BOX vale 0 se o colega nao esta em posicao de cruzar', () => {
    globalThis.Match.ballCarrier = jogador({ team: 'TeamA', x: 2, z: 5 });
    assert.strictEqual(scoreSem('ATTACK_BOX', jogador({ role: 'atk' })), 0);
});

test('HOLD_POSITION tem sempre score baixo mas nao nulo', () => {
    const s = scoreSem('HOLD_POSITION', jogador({}));
    assert.ok(s > 0 && s < 0.35, 'HOLD_POSITION=' + s);
});

test('cada accao sem bola declara a chave de estilo certa', () => {
    const esperado = {
        SLIDE_TACKLE: 'pressao', TACKLE: 'pressao', INTERCEPT: 'intercetar',
        CHASE_BALL: null, RECEIVE_PASS: null, ATTACK_BOX: 'apoiar',
        HOLD_POSITION: 'marcar'
    };
    for (const a of AccoesSemBola) {
        assert.strictEqual(a.estilo, esperado[a.nome], a.nome + ' com estilo errado');
    }
});
```

Acrescentar também ao `tests/helpers/stubs.js`, dentro de `carregarActions`, antes do `require` do actions:

```js
    globalThis.podeIntercetar = () => globalThis._podeIntercetar;
    globalThis.Tatics = { pressaoDefensiva: 'balanced' };
```

- [ ] **Step 2: Correr para confirmar que falha**

Run: `npm test`
Expected: FAIL — `accao TACKLE nao existe` (e `AccoesSemBola` a vir `undefined`).

- [ ] **Step 3: Implementar o catálogo sem bola**

Em `js/utility/actions.js`, antes do bloco `module.exports`, acrescentar:

```js
/* --- Acções sem bola ----------------------------------------------------- */

/*
Alcance de desarme de pé. Um central chega mais longe — braços e passada
maiores, e é a função dele. Valores herdados do BT (js/bt/player_bt.js:868).
*/
function _alcanceDesarme(p) {
    return (p.pos === 'CB') ? 2.8 : 2.5;
}

/*
Gate do Defensive Pressure: o jogador tem de estar perto do portador há pelo
menos este tempo antes de tentar roubar. É regra táctica do painel (Low 6s /
Balanced 4s / High 2s), não ruído — por isso continua a ser pré-condição dura
e não considerando.
*/
function _esperouOSuficiente(p) {
    const esperaMin = DefensivePressureModel[Tatics.pressaoDefensiva] ||
                      DefensivePressureModel.balanced;
    return (p.tempoPertoDoPortador || 0) >= esperaMin;
}

// Portador adversário válido, ou null.
function _portadorAdversario(p) {
    const c = Match.ballCarrier;
    if (!c || c.team === p.team || c.role === 'gk') return null;
    return c;
}

const AccoesSemBola = [
    {
        nome: 'SLIDE_TACKLE',
        estilo: 'pressao',
        pre: (ctx) => {
            const p = ctx.p;
            const c = _portadorAdversario(p);
            if (!c || ctx.distToBall >= 12) return false;
            const d = p.model.position.distanceTo(c.model.position);
            if (d < _alcanceDesarme(p) || d >= 4.5) return false;
            if (!_esperouOSuficiente(p)) return false;
            ctx.alvoDefensivo = c;
            ctx.distAoPortador = d;
            return true;
        },
        considerandos: {
            distancia: (ctx) => Curvas.inv((ctx.distAoPortador - 2.5) / 2.0),
            // Entrar em carrinho perto da própria baliza vale mais: falhar ali
            // já era golo na mesma.
            perigo: (ctx) => Curvas.quad(_perigoDaZona(ctx.p), 0.7, 0.3),
            duelo: (ctx) => Curvas.logistica(
                (ctx.p.skillFor('MARKING') - ctx.alvoDefensivo.skillFor('TEC') + 50) / 100, 6, 0.5)
        },
        executar: (ctx) => actSlideTackle(ctx)
    },

    {
        nome: 'TACKLE',
        estilo: 'pressao',
        pre: (ctx) => {
            const p = ctx.p;
            const c = _portadorAdversario(p);
            if (!c || ctx.distToBall >= 12) return false;
            const d = p.model.position.distanceTo(c.model.position);
            if (d >= _alcanceDesarme(p)) return false;
            if (!_esperouOSuficiente(p)) return false;
            ctx.alvoDefensivo = c;
            ctx.distAoPortador = d;
            return true;
        },
        considerandos: {
            distancia: (ctx) => Curvas.inv(ctx.distAoPortador / _alcanceDesarme(ctx.p)),
            perigo: (ctx) => Curvas.quad(_perigoDaZona(ctx.p), 0.7, 0.3),
            // O duelo real é (VELOCIDADE+FORÇA) contra (VELOCIDADE+FORÇA); aqui
            // antecipa-se para a DECISÃO, não só para o resultado.
            duelo: (ctx) => {
                const meu = ctx.p.skillFor('SPEED') + ctx.p.skillFor('STRENGTH');
                const dele = ctx.alvoDefensivo.skillFor('SPEED') + ctx.alvoDefensivo.skillFor('STRENGTH');
                return Curvas.logistica((meu - dele + 100) / 200, 6, 0.5);
            }
        },
        executar: (ctx) => actTackle(ctx)
    },

    {
        nome: 'INTERCEPT',
        estilo: 'intercetar',
        pre: (ctx) => podeIntercetar(ctx),
        considerandos: {
            tempo: (ctx) => Curvas.inv(
                (ctx.p.timeToIntercept || 0.5) / PerceptionModel.janelaIntercetar),
            distancia: (ctx) => Curvas.inv(ctx.distToBall / 25)
        },
        executar: (ctx) => actIntercept(ctx)
    },

    {
        nome: 'CHASE_BALL',
        estilo: null,
        pre: (ctx) => ctx.distToBall < 12,
        considerandos: {
            // O chaser é UM por equipa, escolhido pelo nível 1. Quem não for
            // ainda pode ir, mas só se mais nada valer a pena.
            designado: (ctx) => (Match.chaserA === ctx.p || Match.chaserB === ctx.p) ? 1.0 : 0.2,
            distancia: (ctx) => Curvas.inv(ctx.distToBall / 12)
        },
        executar: (ctx) => actChaseBall(ctx)
    },

    {
        nome: 'RECEIVE_PASS',
        estilo: null,
        pre: (ctx) => Match.intendedReceiver === ctx.p,
        // Praticamente incondicional: se o passe vem para mim, vou buscá-lo.
        considerandos: { destinatario: () => 0.95 },
        executar: (ctx) => actReceivePass(ctx)
    },

    {
        nome: 'ATTACK_BOX',
        estilo: 'apoiar',
        pre: (ctx) => {
            const p = ctx.p;
            if (p.role === 'def' || p.role === 'gk') return false;
            const c = Match.ballCarrier;
            if (!c || c.team !== p.team || c === p) return false;
            // Mesmos limiares do findCross: sem isto o cruzamento nunca teria
            // ninguém na área para mirar.
            const carrierX = Math.abs(c.model.position.x);
            const carrierZ = c.model.position.z * c.dirZ;
            if (carrierX < CrossModel.alaX || carrierZ < CrossModel.zonaZ) return false;
            ctx.cruzador = c;
            return true;
        },
        considerandos: {
            // Quem já está perto da área tem mais hipótese de lá chegar a tempo.
            proximidade: (ctx) => Curvas.inv(
                Math.abs(CrossModel.areaZ - ctx.zoneAhead) / 30),
            avancado: (ctx) => (ctx.p.role === 'atk') ? 1.0 : 0.6
        },
        executar: (ctx) => {
            const p = ctx.p;
            const c = ctx.cruzador;
            const side = Math.sign(c.model.position.x) || 1;
            // Metade ataca o 1º poste, a outra metade o 2º.
            const targetX = (p.id % 2 === 0) ? -side * 5.0 : side * 9.0;
            const targetZ = (CrossModel.areaZ + 6.0) * p.dirZ;
            p.dynamicTarget.set(targetX, ALTURA_BASE_Y, targetZ);
            p.speedMult = (5.5 + ((ctx.skillSpeed - 50) / 50) * 1.2) * 1.25 * 0.9;
            p.fsm.changeState('MOVE_TO_POS');
        }
    },

    {
        nome: 'HOLD_POSITION',
        estilo: 'marcar',
        // Fallback. actHoldPosition mantém-se intacto: é lá dentro que se
        // escolhe entre MARKING / BLOCKING / FWR_SUPPORT / AFT_SUPPORT /
        // MOVE_TO_POS, com o dynamicTarget que o nível 2 já calculou.
        pre: () => true,
        considerandos: { base: () => 0.2 },
        executar: (ctx) => actHoldPosition(ctx)
    }
];
```

E actualizar o `module.exports` no fim do ficheiro:

```js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AccoesComBola, AccoesSemBola, _distAoGolo, _perigoDaZona };
}
```

Acrescentar também ao `tests/helpers/stubs.js`, dentro de `carregarActions`:

```js
    globalThis.PerceptionModel = { janelaIntercetar: 1.2, margemMelhor: 0.15 };
    globalThis.ALTURA_BASE_Y = 0;
```

- [ ] **Step 4: Correr os testes**

Run: `npm test`
Expected: PASS — todos.

- [ ] **Step 5: Passar o Utility a default**

Em `js/main.js`, junto às outras inicializações de flags de `window`, acrescentar:

```js
window.usarUtilityAI = true;
```

Em `index.html`, o botão passa a:

```html
    <button id="btn-utility" class="active" onclick="toggleUtilityAI()">Utility AI: ON</button>
```

- [ ] **Step 6: Verificar em jogo**

Run: `npm run dev`
Deixar correr um jogo completo. Verificar na consola que não há erros, e no painel de estatísticas que os números não colapsaram: passes, remates e desarmes devem estar na mesma ordem de grandeza de antes. Alternar o botão para OFF e ON para confirmar que os dois sistemas coexistem.

Expected: jogo joga. Se os jogadores ficarem parados, o suspeito é `HOLD_POSITION` a ganhar sempre — verificar no painel `showPlayerPoints` se as outras acções estão a dar 0 por pré-condição.

- [ ] **Step 7: Commit**

```bash
git add js/utility/actions.js tests/utility_actions.test.js tests/helpers/stubs.js js/main.js index.html
git commit -m "feat: accoes sem bola do Utility AI; passa a default"
```

---

### Task 5: Drible como decisão

O drible é hoje decidido dentro da FSM (`js/fsm.js:434-441`): qualquer adversário no cone frontal a menos de 5 m dispara `changeState('DRIBBLE')`, sempre, sem comparação com nada e sem consultar o estilo. Esta task tira a decisão de lá e põe-na no Utility, onde compete com passar, rematar e conduzir.

**Files:**
- Modify: `js/utility/actions.js` (nova acção `DRIBBLE` em `AccoesComBola`)
- Modify: `js/fsm.js:433-442`
- Modify: `js/bt/player_bt.js:32-118` (`prepare()`: contar o cooldown)
- Modify: `tests/utility_actions.test.js`

**Interfaces:**
- Consumes: `DribbleModel.triggerDist`, `DribbleModel.cooldown`, `MatchStats`.
- Produces: acção `DRIBBLE` com `estilo: 'driblar'`; `p.dribbleCooldownTimer` passa a ser incrementado em `PlayerContext.prepare`; `ctx.adversarioAFrente` fica preenchido quando a pré-condição passa.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar a `tests/utility_actions.test.js`:

```js
test('DRIBBLE existe no catalogo com bola', () => {
    assert.ok(AccoesComBola.some(a => a.nome === 'DRIBBLE'));
    assert.strictEqual(accao(AccoesComBola, 'DRIBBLE').estilo, 'driblar');
});

test('DRIBBLE vale 0 sem adversario a frente', () => {
    const p = jogador({ z: 10, hasBall: true });
    assert.strictEqual(score('DRIBBLE', p, { opponents: [] }), 0);
});

test('DRIBBLE vale 0 com o adversario longe demais', () => {
    const p = jogador({ z: 10, hasBall: true });
    const opp = jogador({ team: 'TeamB', z: 20 });     // 10m > triggerDist 5m
    assert.strictEqual(score('DRIBBLE', p, { opponents: [opp] }), 0);
});

test('DRIBBLE vale 0 com o adversario colado (menos de 1.5m)', () => {
    const p = jogador({ z: 10, hasBall: true });
    const opp = jogador({ team: 'TeamB', z: 11 });
    assert.strictEqual(score('DRIBBLE', p, { opponents: [opp] }), 0);
});

test('DRIBBLE vale 0 durante o cooldown', () => {
    const p = jogador({ z: 10, hasBall: true, dribbleCooldownTimer: 0.5 });
    const opp = jogador({ team: 'TeamB', z: 13 });
    assert.strictEqual(score('DRIBBLE', p, { opponents: [opp] }), 0);
});

test('DRIBBLE pontua com adversario na faixa e cooldown expirado', () => {
    const p = jogador({ z: 10, hasBall: true, dribbleCooldownTimer: 9 });
    const opp = jogador({ team: 'TeamB', z: 13 });
    assert.ok(score('DRIBBLE', p, { opponents: [opp] }) > 0);
});

test('DRIBBLE vale mais para quem tem mais tecnica', () => {
    const opp = jogador({ team: 'TeamB', z: 13, skills: { MARKING: 50 } });
    const craque = jogador({ z: 10, hasBall: true, dribbleCooldownTimer: 9, skills: { TEC: 90 } });
    const perna = jogador({ z: 10, hasBall: true, dribbleCooldownTimer: 9, skills: { TEC: 30 } });
    assert.ok(score('DRIBBLE', craque, { opponents: [opp] }) >
              score('DRIBBLE', perna, { opponents: [opp] }));
});

test('DRIBBLE vale menos perto da propria baliza', () => {
    const seguro = jogador({ z: 20, hasBall: true, dribbleCooldownTimer: 9 });
    const arriscado = jogador({ z: -35, hasBall: true, dribbleCooldownTimer: 9 });
    const oppS = jogador({ team: 'TeamB', z: 23 });
    const oppA = jogador({ team: 'TeamB', z: -32 });
    assert.ok(score('DRIBBLE', seguro, { opponents: [oppS] }) >
              score('DRIBBLE', arriscado, { opponents: [oppA] }));
});

test('DRIBBLE vale menos com varios adversarios por perto', () => {
    const p = jogador({ z: 10, hasBall: true, dribbleCooldownTimer: 9 });
    const um = [jogador({ team: 'TeamB', z: 13 })];
    const tres = [jogador({ team: 'TeamB', z: 13 }),
                  jogador({ team: 'TeamB', x: 3, z: 13 }),
                  jogador({ team: 'TeamB', x: -3, z: 12 })];
    assert.ok(score('DRIBBLE', p, { opponents: um }) >
              score('DRIBBLE', p, { opponents: tres }));
});

test('a FSM ja nao decide driblar', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const fsmSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'fsm.js'), 'utf8');
    const carry = fsmSrc.slice(fsmSrc.indexOf("case 'CARRY':"),
                               fsmSrc.indexOf("case 'DRIBBLE':"));
    assert.ok(!/changeState\(\s*'DRIBBLE'\s*\)/.test(carry),
        "o case 'CARRY' da FSM ainda decide entrar em DRIBBLE");
});
```

- [ ] **Step 2: Correr para confirmar que falha**

Run: `npm test`
Expected: FAIL — `accao DRIBBLE nao existe` e `o case 'CARRY' da FSM ainda decide entrar em DRIBBLE`.

- [ ] **Step 3: Implementar a acção `DRIBBLE`**

Em `js/utility/actions.js`, acrescentar este auxiliar junto dos outros:

```js
/*
Adversário mais próximo no cone frontal, dentro da faixa em que driblar faz
sentido. Abaixo de 1.5 m já não há espaço para o toque lateral; acima de
DribbleModel.triggerDist não há ninguém a passar.
*/
function _adversarioParaDriblar(ctx) {
    const p = ctx.p;
    let melhor = null, melhorD = Infinity;
    for (const o of ctx.opponents) {
        if (o.role === 'gk') continue;
        const dz = (o.model.position.z - p.model.position.z) * p.dirZ;
        if (dz <= 0) continue;                        // está atrás
        const d = p.model.position.distanceTo(o.model.position);
        if (d < 1.5 || d > DribbleModel.triggerDist) continue;
        if (d < melhorD) { melhorD = d; melhor = o; }
    }
    return melhor;
}

// Quantos adversários há num raio de 6 m — 1v1 vale, 1v3 não.
function _adversariosPerto(ctx, raio) {
    let n = 0;
    for (const o of ctx.opponents) {
        if (o.role === 'gk') continue;
        if (ctx.p.model.position.distanceTo(o.model.position) <= raio) n++;
    }
    return n;
}
```

E acrescentar a acção ao array `AccoesComBola`, entre `SHOOT` e `CROSS`:

```js
    {
        nome: 'DRIBBLE',
        estilo: 'driblar',
        /*
        Até esta versão o drible NÃO era uma decisão: o changeState('DRIBBLE')
        vivia dentro do case 'CARRY' da FSM (js/fsm.js) e disparava sempre que
        houvesse um adversário no cone frontal a menos de triggerDist. Não era
        comparado com passar nem rematar, e o estilo do jogador não lhe tocava
        — um Anchor Man driblava tanto como um Prolific Winger.

        O DribbleModel.cooldown também era letra morta: dribbleCooldownTimer era
        posto a zero mas nunca incrementado nem lido. Agora é ambas as coisas
        (ver PlayerContext.prepare).
        */
        pre: (ctx) => {
            if ((ctx.p.dribbleCooldownTimer || 0) < DribbleModel.cooldown) return false;
            ctx.adversarioAFrente = _adversarioParaDriblar(ctx);
            return ctx.adversarioAFrente !== null;
        },
        considerandos: {
            // O duelo TEC x MARKING que a FSM já resolve DEPOIS do gesto,
            // antecipado para a decisão: um jogador fraco deixa de tentar
            // aquilo que ia falhar.
            duelo: (ctx) => Curvas.logistica(
                (ctx.p.skillFor('TEC') - ctx.adversarioAFrente.skillFor('MARKING') + 50) / 100,
                6, 0.5),
            // Driblar à entrada da própria área é como se perde jogos.
            risco: (ctx) => Curvas.inv(_perigoDaZona(ctx.p), 0.85, 1.0),
            // 1v1 sim; rodeado, não.
            isolamento: (ctx) => Curvas.inv((_adversariosPerto(ctx, 6.0) - 1) / 3)
        },
        executar: (ctx) => {
            const p = ctx.p;
            p.dribbleOpponent = ctx.adversarioAFrente;
            p.dribbleCooldownTimer = 0;
            if (typeof MatchStats !== 'undefined') MatchStats[p.team].dribles.tentados++;
            p.fsm.changeState('DRIBBLE');
        }
    },
```

- [ ] **Step 4: Tirar a decisão da FSM**

Em `js/fsm.js`, dentro do `case 'CARRY'`, substituir o bloco das linhas 433-442:

```js
                    } else {
                        // Adversário muito perto — transição para DRIBBLE 1v1
                        if (nearestOpp && nearestOppDist > 1.5) {
                            p.dribbleOpponent = nearestOpp;
                            p.dribbleCooldownTimer = 0;
                            if (typeof MatchStats !== 'undefined') MatchStats[p.team].dribles.tentados++;
                            this.changeState('DRIBBLE');
                        }
                        break;
                    }
```

por:

```js
                    } else {
                        /*
                        Adversário muito perto. A FSM NÃO decide driblar — quem
                        decide é o nível 3 (acção DRIBBLE em
                        js/utility/actions.js), que compara o drible com passar,
                        rematar e conduzir em vez de o disparar sempre.

                        Aqui só se retém o toque: sem espaço à frente, não vale
                        a pena empurrar a bola.
                        */
                        break;
                    }
```

A variável `nearestOpp` continua a ser usada acima, na escolha de `touchPow`; não a remover.

- [ ] **Step 5: Contar o cooldown**

Em `js/bt/player_bt.js`, dentro de `PlayerContext.prepare()`, imediatamente a seguir ao bloco do `carryDist` (linha 65, depois de `p.ultimaPosCarry.copy(p.model.position);`):

```js
        /*
        Cooldown do drible. O DribbleModel.cooldown existia na config desde o
        início mas era letra morta: dribbleCooldownTimer era posto a zero em
        fsm.js e nunca incrementado nem lido por ninguém. Agora conta aqui e é
        lido pela pré-condição da acção DRIBBLE — sem isto, um jogador que
        acabou de driblar tentava outra vez no frame seguinte.
        */
        p.dribbleCooldownTimer = (p.dribbleCooldownTimer || 0) + dt;
```

- [ ] **Step 6: Correr os testes**

Run: `npm test`
Expected: PASS — todos, incluindo os 10 novos.

- [ ] **Step 7: Verificar em jogo**

Run: `npm run dev`
Jogar um jogo completo com o Utility ligado e comparar a estatística de dribles (painel de stats, `dribles: tentados/sucesso`) com um jogo no BT.

Expected: os dribles tentados descem — antes disparavam sempre que havia um adversário perto; agora só quando compensam. A taxa de sucesso deve subir, porque os dribles perdidos à partida deixam de ser tentados.

- [ ] **Step 8: Commit**

```bash
git add js/utility/actions.js js/fsm.js js/bt/player_bt.js tests/utility_actions.test.js
git commit -m "feat: drible passa a decisao do nivel 3 em vez de reflexo da FSM"
```

---

### Task 6: Inércia de decisão

Substitui o ramo `Dominar`, que cegava o portador durante até três segundos (`CadenceModel.posseBase`) enquanto ele "pensava".

**Files:**
- Modify: `js/utility/player_utility.js` (`tick` e novo método `bonusDeInercia`)
- Create: `tests/utility_inercia.test.js`

**Interfaces:**
- Consumes: `UtilityModel.inerciaBase`, `UtilityModel.inerciaDecai`, `CadenceModel.posseBase`, `CadenceModel.posseSobPressao`, `estiloAtivoDe(p).cadencia`.
- Produces: `UtilityAI.bonusDeInercia(p, nomeDaAccao, ctx) -> number` (>= 1.0); `p.utilityAccao` e `p.utilityTempoNaAccao` mantidos entre frames.

- [ ] **Step 1: Escrever os testes que falham**

Criar `tests/utility_inercia.test.js`. A função é extraída para ser testável isoladamente, sem o resto do `tick`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { jogador, carregarActions, contexto } = require('./helpers/stubs.js');
carregarActions();
const { bonusDeInercia } = require('../js/utility/player_utility.js');

test('accao diferente da actual nao recebe bonus', () => {
    const p = jogador({});
    p.utilityAccao = 'PASS';
    p.utilityTempoNaAccao = 0.1;
    assert.strictEqual(bonusDeInercia(p, 'SHOOT', contexto(p)), 1.0);
});

test('accao sem historico nao recebe bonus', () => {
    const p = jogador({});
    assert.strictEqual(bonusDeInercia(p, 'PASS', contexto(p)), 1.0);
});

test('accao recem-escolhida recebe quase todo o bonus', () => {
    const p = jogador({});
    p.utilityAccao = 'CARRY';
    p.utilityTempoNaAccao = 0;
    const b = bonusDeInercia(p, 'CARRY', contexto(p));
    assert.ok(Math.abs(b - 1.45) < 0.01, 'bonus=' + b);
});

test('o bonus decai com o tempo', () => {
    const p = jogador({});
    p.utilityAccao = 'CARRY';
    p.utilityTempoNaAccao = 0;
    const cedo = bonusDeInercia(p, 'CARRY', contexto(p));
    p.utilityTempoNaAccao = 2.5;
    const tarde = bonusDeInercia(p, 'CARRY', contexto(p));
    assert.ok(cedo > tarde, 'cedo=' + cedo + ' tarde=' + tarde);
    assert.ok(tarde < 1.05, 'ao fim de 2.5s o bonus devia ser residual: ' + tarde);
});

test('o bonus nunca desce abaixo de 1.0', () => {
    const p = jogador({});
    p.utilityAccao = 'CARRY';
    p.utilityTempoNaAccao = 60;
    assert.ok(bonusDeInercia(p, 'CARRY', contexto(p)) >= 1.0);
});

test('sob pressao o bonus decai mais depressa', () => {
    const p = jogador({});
    p.utilityAccao = 'CARRY';
    p.utilityTempoNaAccao = 0.5;
    const livre = bonusDeInercia(p, 'CARRY', contexto(p));
    const sob = bonusDeInercia(p, 'CARRY', contexto(p, { underPressure: true }));
    assert.ok(livre > sob, 'livre=' + livre + ' sob=' + sob);
});

test('a cadencia do estilo escala o decaimento', () => {
    const lento = jogador({});           // Target Man: cadencia 1.6
    lento._estilo = { cadencia: 1.6 };
    lento.utilityAccao = 'CARRY';
    lento.utilityTempoNaAccao = 0.8;

    const rapido = jogador({});          // Fox in the Box: cadencia 0.6
    rapido._estilo = { cadencia: 0.6 };
    rapido.utilityAccao = 'CARRY';
    rapido.utilityTempoNaAccao = 0.8;

    assert.ok(bonusDeInercia(lento, 'CARRY', contexto(lento)) >
              bonusDeInercia(rapido, 'CARRY', contexto(rapido)),
        'quem segura a bola devia manter o bonus mais tempo');
});
```

- [ ] **Step 2: Correr para confirmar que falha**

Run: `npm test`
Expected: FAIL — `bonusDeInercia is not a function`.

- [ ] **Step 3: Implementar a inércia**

Em `js/utility/player_utility.js`, acrescentar antes do `const UtilityAI`:

```js
/*
Bónus de permanência da acção actual.

Substitui o ramo `Dominar` do Behavior Tree, que bloqueava o portador durante
CadenceModel.posseBase (3 s) a "pensar": nesse tempo ele só conduzia e não
avaliava nada, e por isso entrava na área com o guarda-redes batido a contar os
segundos (havia uma excepção só para o remate, precisamente por isso).

Agora ele avalia todos os frames. O que impede a oscilação é este bónus: a
acção que já escolheu vale mais 45% enquanto for recente, e só perde para outra
que seja claramente melhor. Ao fim de ~2 s o bónus é residual e ele reavalia de
livre vontade.

O decaimento escala com a cadência: sob pressão encurta (decide mais depressa,
como o CadenceModel.posseSobPressao fazia), e o estilo estica ou encolhe
(Target Man 1.6 segura a bola, Fox in the Box 0.6 resolve num toque).
*/
function bonusDeInercia(p, nome, ctx) {
    if (p.utilityAccao !== nome) return 1.0;

    const ritmo = ctx.underPressure
        ? (CadenceModel.posseSobPressao / CadenceModel.posseBase)
        : 1.0;
    const cadencia = (typeof estiloAtivoDe === 'function')
        ? (estiloAtivoDe(p).cadencia || 1.0) : 1.0;

    const decaimento = Math.max(0.05, UtilityModel.inerciaDecai * ritmo * cadencia);
    const t = p.utilityTempoNaAccao || 0;

    return 1 + UtilityModel.inerciaBase * Math.exp(-t / decaimento);
}
```

Alterar o `tick` para aplicar o bónus e manter o contador. Substituir o bloco que monta as candidatas e o que executa:

```js
        const candidatas = [];
        for (const accao of lista) {
            const r = avaliarAccao(accao, ctx);
            if (r.score <= 0) continue;
            r.score *= this.pesoDoEstilo(player, accao);
            r.score *= bonusDeInercia(player, accao.nome, ctx);
            candidatas.push(r);
        }

        if (window.showPlayerPoints) {
            player.utilityTrace = candidatas.slice().sort((a, b) => b.score - a.score);
        }

        const escolhida = escolherAccao(
            candidatas, UtilityModel.margemTopN, UtilityModel.tamanhoPool);
        if (!escolhida) return;

        // Contador de permanência: zera na troca, acumula enquanto se mantém.
        if (player.utilityAccao === escolhida.nome) {
            player.utilityTempoNaAccao = (player.utilityTempoNaAccao || 0) + dt;
        } else {
            player.utilityTempoNaAccao = 0;
        }
        player.utilityAccao = escolhida.nome;

        escolhida.accao.executar(ctx);
```

E, no fim do ficheiro, o guarda de exportação:

```js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { UtilityAI, bonusDeInercia };
}
```

- [ ] **Step 4: Correr os testes**

Run: `npm test`
Expected: PASS — todos, incluindo os 7 novos.

O teste `accao recem-escolhida recebe quase todo o bonus` espera 1.45 exacto (`1 + 0.45 * e^0`). Se der outro valor, o `inerciaBase` na config não é 0.45.

- [ ] **Step 5: Verificar em jogo**

Run: `npm run dev`
Com `window.showPlayerPoints = true`, seguir um portador. A acção escolhida deve manter-se estável durante cerca de um segundo e depois poder mudar. Não deve haver troca de acção em frames consecutivos (o sintoma seria a animação a piscar entre gestos).

Expected: comportamento estável, e o portador deixa de atravessar o meio-campo "sem pensar" — reavalia continuamente.

- [ ] **Step 6: Commit**

```bash
git add js/utility/player_utility.js tests/utility_inercia.test.js
git commit -m "feat: inercia de decisao substitui a janela cega de cadencia"
```

---

### Task 7: Debug — trace de utilidade no painel

O painel `showPlayerPoints` já existe e desenha valores por jogador. Passa a mostrar o score de cada acção, ordenado — que é o que falta hoje para se conseguir afinar.

**Files:**
- Modify: `js/player.js:951-965` (bloco de desenho de debug)
- Modify: `js/bt/player_bt.js:697-710` (remover o `CalculaDebug`)
- Modify: `js/main.js` (`animate()`: `PassCandidates.update`)

**Interfaces:**
- Consumes: `p.utilityTrace` (Task 3), `PassCandidates.update(dt)` (já existe em `js/pass_candidates.js:69`).
- Produces: nada de novo.

- [ ] **Step 1: Ler o bloco de desenho actual**

Ler `js/player.js:951-970` para ver como `debugPoints` é renderizado (fonte, posição, formato de linha). O `utilityTrace` deve seguir exactamente o mesmo estilo — esta task não redesenha o painel, só muda a fonte dos dados.

- [ ] **Step 2: Alimentar o painel com o trace**

Em `js/player.js`, dentro do bloco `if (window.showPlayerPoints && this.debugPoints)`, acrescentar antes dele a conversão do trace para o formato que o desenho já consome:

```js
            /*
            Com Utility AI, a pontuação mostrada é a real — não um recálculo só
            para debug (era o que o nó `CalculaDebug` do BT fazia, e por isso
            podia divergir do que o jogador de facto avaliava).

            A acção vencedora leva '*' à frente.
            */
            if (window.usarUtilityAI && this.utilityTrace) {
                this.debugPoints = {};
                for (const c of this.utilityTrace) {
                    const marca = (c.nome === this.utilityAccao) ? '*' : '';
                    this.debugPoints[marca + c.nome] = c.score.toFixed(2);
                }
            }
```

- [ ] **Step 3: Remover o `CalculaDebug` do BT**

Em `js/bt/player_bt.js`, remover por completo o nó `cond('CalculaDebug', ...)` (linhas 697-710), que é o primeiro filho do selector `DecisaoComBola`. Recalculava `findCross`, `findThroughBall` e `findPassTarget` todos os frames só para o painel, e devolvia sempre `false`.

O selector passa a começar directamente em `seq('Dominar', ...)`.

- [ ] **Step 4: Ligar o `PassCandidates.update`**

Em `js/main.js`, dentro de `animate()`, a seguir ao bloco `if (!window.isPaused) { Match.update(...) }` (linha 453):

```js
    // Marcas de candidatos a passe (botão PlayerPassTarget). A função existia
    // mas nunca era chamada: as marcas eram desenhadas uma vez ao ligar o botão
    // e ficavam congeladas no relvado enquanto o jogo continuava.
    if (typeof PassCandidates !== 'undefined') PassCandidates.update(delta);
```

Não pode ir para `js/simulate.js`: esse é o simulador em lote, que conduz `Match.update()` sem desenhar nada.

- [ ] **Step 5: Correr os testes**

Run: `npm test`
Expected: PASS — nenhum teste desta task, mas a suite tem de continuar verde (o `CalculaDebug` removido não é referido por nenhum teste).

- [ ] **Step 6: Verificar em jogo**

Run: `npm run dev`
Ligar `PlayerPoints` e `PlayerPassTarget` no painel.

Expected:
- Sobre cada jogador aparecem as acções pontuadas, ordenadas, com `*` na escolhida.
- Os pontos laranja de candidatos a passe seguem o jogo em vez de ficarem congelados.

- [ ] **Step 7: Commit**

```bash
git add js/player.js js/bt/player_bt.js js/main.js
git commit -m "feat: painel de debug mostra os scores reais do Utility AI"
```

---

### Task 8: Limpeza de código morto e documentação

Fecha os defeitos encontrados durante o desenho e põe a documentação a descrever o sistema que existe.

**Files:**
- Modify: `js/main.js:188-192` (remover `togglePasseGrid`)
- Modify: `index.html` (remover o botão `btn-passgrid`)
- Modify: `js/pass_candidates.js:77-81` (docstring)
- Modify: `js/config.js` (remover parâmetros de sorteio sem consumidor)
- Modify: `decisionSummary.md`
- Test: `tests/utility_limpeza.test.js`

**Interfaces:**
- Consumes: nada.
- Produces: nada.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/utility_limpeza.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

function ler(rel) {
    return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

test('o toggle PassGrid morto foi removido', () => {
    assert.ok(!/usarPasseGrid/.test(ler('js/main.js')), 'js/main.js ainda escreve usarPasseGrid');
    assert.ok(!/btn-passgrid/.test(ler('index.html')), 'index.html ainda tem o botao');
});

test('o docstring de pass_candidates nao promete uma funcao inexistente', () => {
    assert.ok(!/findGridPassTarget/.test(ler('js/pass_candidates.js')));
});

test('os parametros de sorteio substituidos pelo Utility foram removidos', () => {
    const cfg = ler('js/config.js');
    for (const morto of ['carryChance', 'carryChanceShort', 'carryChanceLong',
                         'throughBallChance', 'chanceMax']) {
        assert.ok(!new RegExp('^\\s*' + morto + '\\s*:', 'm').test(cfg),
            'config.js ainda declara ' + morto);
    }
});

test('nada no codigo consome os parametros removidos', () => {
    for (const f of ['js/bt/player_bt.js', 'js/utility/actions.js', 'js/player.js', 'js/fsm.js']) {
        const src = ler(f);
        for (const morto of ['carryChance', 'throughBallChance', 'chanceMax']) {
            assert.ok(!new RegExp('\\.' + morto + '\\b').test(src),
                f + ' ainda lê ' + morto);
        }
    }
});

test('decisionSummary nao documenta o ramo PassarGrid inexistente', () => {
    assert.ok(!/PassarGrid/.test(ler('decisionSummary.md')));
});
```

- [ ] **Step 2: Correr para confirmar que falha**

Run: `npm test`
Expected: FAIL — os cinco testes desta task.

- [ ] **Step 3: Remover o toggle PassGrid**

`window.usarPasseGrid` é escrito em `js/main.js:189` e não é lido em lado nenhum. O ramo que o consumia (`findGridPassTarget`) nunca chegou a existir no ficheiro actual.

Em `js/main.js`, remover a função `togglePasseGrid` inteira (linhas 188-192).
Em `index.html`, remover o `<button id="btn-passgrid" ...>`.

- [ ] **Step 4: Corrigir o docstring mentiroso**

Em `js/pass_candidates.js`, no comentário de `gerarCandidatos` (linhas 77-81), substituir:

```js
    /*
    Gera a lista de candidatos sobreviventes para o `carrier` — pura, sem
    THREE, usada tanto pelo desenho de debug como pela decisão de passe real
    (ver findGridPassTarget em player_bt.js). Devolve [{x, z, mate}, ...].
    */
```

por:

```js
    /*
    Gera a lista de candidatos sobreviventes para o `carrier` — pura, sem THREE.

    Só debug visual. A decisão de passe real é a acção PASS do Utility AI
    (js/utility/actions.js), que pontua COMPANHEIROS, não pontos do relvado.
    Houve a intenção de decidir sobre pontos (a antiga findGridPassTarget), mas
    essa função nunca existiu neste ficheiro — só o comentário sobreviveu.

    Devolve [{x, z, mate}, ...].
    */
```

- [ ] **Step 5: Remover os parâmetros de sorteio sem consumidor**

Em `js/config.js`:
- Em `PassModel`, remover `carryChance`, `carryChanceShort`, `carryChanceLong` e `throughBallChance` (e ajustar o comentário do bloco, que ainda explica o `carryChance*`).
- Em `CrossModel`, remover `chanceMax`.

Antes de remover, confirmar que já não há consumidores:

```bash
grep -rn "carryChance\|throughBallChance\|chanceMax" js/
```

Se ainda houver referências em `js/bt/player_bt.js` (folhas `Passar`, `Lancar`, `Cruzar`), essas folhas continuam a existir enquanto o BT for comparador. Nesse caso, substituir cada leitura por uma constante local no topo de `player_bt.js`:

```js
// Sorteios do BT antigo. O Utility AI substituiu-os por pontuação (ver
// js/utility/core.js); ficam aqui, locais, só enquanto o BT servir de
// comparador no botão "Utility AI".
const BT_CARRY_CHANCE = { normal: 0.20, curto: 0.10, longo: 0.30 };
const BT_THROUGH_BALL_CHANCE = 0.675;
const BT_CROSS_CHANCE_MAX = 0.97;
```

- [ ] **Step 6: Actualizar o `decisionSummary.md`**

Reescrever as secções 2, 3 e 4 para descreverem o Utility AI. Substituir o diagrama da árvore da secção 2 por:

```
Gates duros (BT)
├── jogo parado          -> IDLE / SET_PIECE_*
├── acção em curso       -> deixa terminar
└── guarda-redes         -> ciclo próprio

Utility AI — todas pontuadas 0..1 no mesmo frame, a melhor ganha

COM BOLA                          SEM BOLA
  SHOOT         remate              SLIDE_TACKLE   pressao
  DRIBBLE       driblar             TACKLE         pressao
  CROSS         cruzar              INTERCEPT      intercetar
  THROUGH_BALL  lancar              CHASE_BALL     —
  PASS          passe               RECEIVE_PASS   —
  CARRY         conduzir            ATTACK_BOX     apoiar
  HOLD          —                   HOLD_POSITION  marcar
```

Remover a linha 49, que documenta um ramo `PassarGrid` que não existe.

Actualizar a tabela da secção 5 ("Onde mexer, por sintoma"): as entradas
`Conduz demais em vez de passar`, `Lança pouco (through ball)` e
`Cruza pouco/demais` passam a apontar para os pesos de estilo em `EstiloBase` e
para os considerandos em `js/utility/actions.js`, não para os parâmetros de
sorteio removidos.

- [ ] **Step 7: Correr os testes**

Run: `npm test`
Expected: PASS — toda a suite.

- [ ] **Step 8: Verificar em jogo**

Run: `npm run dev`
Expected: a página carrega sem erros de consola, o botão PassGrid desapareceu, o botão Utility AI continua a alternar, e o jogo joga nos dois modos.

- [ ] **Step 9: Commit**

```bash
git add js/main.js index.html js/pass_candidates.js js/config.js js/bt/player_bt.js decisionSummary.md tests/utility_limpeza.test.js
git commit -m "chore: remove toggle PassGrid morto e sorteios substituidos pelo Utility"
```

---

## Depois do plano

O BT do nível 3 fica no sítio, atrás do botão, como comparador. A decisão de o
remover fica para depois da afinação em jogo — é aí que se vê se os
considerandos e os pesos de estilo dão o comportamento pretendido. Os pontos de
afinação, por ordem de impacto provável:

1. `UtilityModel.margemTopN` — mais alto, jogo mais determinístico.
2. Os multiplicadores por estilo em `PlayingStyles` — é o objectivo do
   trabalho todo; só depois de tudo montado é que fazem sentido a sério.
3. As constantes das curvas em `js/utility/actions.js` (os `6, 0.5` da
   `logistica`, os divisores das normalizações).
4. `UtilityModel.inerciaBase` / `inerciaDecai`, se houver oscilação ou
   teimosia a mais.
