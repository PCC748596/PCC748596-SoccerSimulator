# Condução de bola: espaço livre e sector do painel — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o portador conduzir para o espaço livre e respeitar os sectores activados do painel, em vez de correr sempre a direito para a baliza com adversários pela frente.

**Architecture:** A pontuação das direcções candidatas passa a somar três termos normalizados a 0..1 (`espaço`, `progresso`, `penalidade de sector`), com pesos comparáveis entre si; o peso do espaço cresce com a Técnica. O sector deixa de ser um X sorteado a cada segundo e passa a ser uma faixa: penalidade zero enquanto o candidato cair dentro de um sector activo. A pontuação sai do `case 'CARRY'` para funções puras em `js/utils.js`, testáveis isoladas.

**Tech Stack:** JavaScript de browser em scripts clássicos, sem build nem módulos. Three.js para vetores. Testes com `node:test` e `node:vm`, recortando as funções reais dos ficheiros de origem — ver `tests/gk_anchor.test.js` como referência do padrão.

## Global Constraints

- Sem passos de build. Os ficheiros em `js/` são carregados como `<script>` clássicos por `index.html`; tudo é global, nada de `import`/`export`.
- `pesoEspacoPorTecnica` e `notaDireccaoCarry` têm de ser puras: sem `Match`, sem `window`, só os argumentos.
- `Tatics.sectorDeX` e `Tatics.penalidadeSector` leem `Tatics.setores`, que é estado do painel, e por isso **não** são puras. Os testes montam um `Tatics` mínimo no sandbox.
- Os testes correm com `node --test tests/*.test.js` (o `node --test tests/` simples não resolve o diretório neste Node em Windows). Não há script `test` em `package.json`.
- O código e os comentários do repositório estão em português europeu. Segue o mesmo registo.
- Convenção de sector, já usada em dois sítios: no referencial de ataque (`x * dirZ`), `< -10` é `'esq'`, `> 10` é `'dir'`, o resto é `'cen'`. As fronteiras exactas (−10 e +10) contam como `'cen'`.
- `CAMPO_LARG` vale 68, logo a meia-largura do campo é 34.
- Os sectores válidos são exactamente as três strings `'esq'`, `'cen'`, `'dir'`. `Tatics.setores` nunca fica vazio (ver `toggleSector` em `js/config.js`).

---

### Task 1: Sector como faixa — sectorDeX e penalidadeSector

**Files:**
- Modify: `js/config.js:2039-2057` (substituir `Tatics.getWeightedSectorX`)
- Test: `tests/carry_direccao.test.js` (criar)

**Interfaces:**
- Consumes: `Tatics.setores` (array de strings), `CAMPO_LARG` (68).
- Produces:
  - `Tatics.sectorDeX(x, dirZ) → 'esq' | 'cen' | 'dir'`
  - `Tatics.penalidadeSector(x, dirZ) → number` entre 0 e 1.

- [ ] **Step 1: Escrever o teste que falha**

Cria `tests/carry_direccao.test.js` com este conteúdo exacto:

```js
/*
Direcção de condução: para onde o portador leva a bola. Corre as funções reais
de config.js e utils.js num sandbox — são globais de browser, por isso são
recortadas dos ficheiros em vez de importadas.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const CONFIG = fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8');

// Recorta um método de objecto escrito como `nome: function (...) { ... }`.
function recortarMetodo(src, nome) {
    const i = src.indexOf('    ' + nome + ': function (');
    assert.ok(i >= 0, 'metodo ' + nome + ' nao encontrado');
    let nivel = 0;
    for (let k = src.indexOf('{', i); k < src.length; k++) {
        if (src[k] === '{') nivel++;
        else if (src[k] === '}' && --nivel === 0) return src.slice(i, k + 1);
    }
    assert.fail('chavetas desequilibradas em ' + nome);
}

function recortarLinha(src, nome) {
    const re = new RegExp('^const ' + nome + '\\s*=.*$', 'm');
    const m = src.match(re);
    assert.ok(m, 'const ' + nome + ' nao encontrado');
    return m[0];
}

/*
Monta um Tatics mínimo com os dois métodos reais e os sectores pedidos. O
Tatics verdadeiro fala com o DOM no update(), por isso não se carrega inteiro.
*/
function montarTatics(setores) {
    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext(
        recortarLinha(CONFIG, 'LARGURA_BALIZA') + '\n' +
        'const CAMPO_LARG = 68;\n' +
        'const Tatics = {\n' +
        '    setores: ' + JSON.stringify(setores) + ',\n' +
        recortarMetodo(CONFIG, 'sectorDeX') + ',\n' +
        recortarMetodo(CONFIG, 'penalidadeSector') + '\n' +
        '};\n' +
        'this.T = Tatics;', sandbox);
    return sandbox.T;
}

test('sectorDeX classifica pelas faixas de 10 m', () => {
    const T = montarTatics(['esq', 'cen', 'dir']);
    assert.strictEqual(T.sectorDeX(-25, 1), 'esq');
    assert.strictEqual(T.sectorDeX(-11, 1), 'esq');
    assert.strictEqual(T.sectorDeX(0, 1), 'cen');
    assert.strictEqual(T.sectorDeX(25, 1), 'dir');
    assert.strictEqual(T.sectorDeX(11, 1), 'dir');
});

test('sectorDeX trata as fronteiras -10 e +10 como centro', () => {
    const T = montarTatics(['esq', 'cen', 'dir']);
    assert.strictEqual(T.sectorDeX(-10, 1), 'cen');
    assert.strictEqual(T.sectorDeX(10, 1), 'cen');
});

test('sectorDeX espelha para a equipa que ataca ao contrário', () => {
    const T = montarTatics(['esq', 'cen', 'dir']);
    assert.strictEqual(T.sectorDeX(25, 1), 'dir');
    assert.strictEqual(T.sectorDeX(25, -1), 'esq');
    assert.strictEqual(T.sectorDeX(0, -1), 'cen');
});

test('penalidade zero em qualquer ponto dentro de um sector activo', () => {
    const T = montarTatics(['esq', 'dir']);
    for (const x of [-33, -25, -19, -11, 11, 19, 25, 33]) {
        assert.strictEqual(T.penalidadeSector(x, 1), 0, 'x=' + x);
    }
});

test('o extremo bem colocado deixa de ser penalizado', () => {
    // Era este o bug: x=+25 com Right activo levava penalidade por não estar
    // exactamente no ponto +19 que o getWeightedSectorX sorteava.
    const T = montarTatics(['dir']);
    assert.strictEqual(T.penalidadeSector(25, 1), 0);
});

test('penalidade positiva fora dos sectores activos', () => {
    const T = montarTatics(['esq', 'dir']);
    // O centro está desactivado: qualquer x no centro é penalizado.
    assert.ok(T.penalidadeSector(0, 1) > 0);
    assert.ok(T.penalidadeSector(5, 1) > 0);
});

test('a penalidade cresce com a distância à borda do sector activo', () => {
    const T = montarTatics(['dir']);
    // Só a direita está activa: quanto mais à esquerda, pior.
    const perto = T.penalidadeSector(5, 1);
    const meio = T.penalidadeSector(-5, 1);
    const longe = T.penalidadeSector(-30, 1);
    assert.ok(perto < meio, 'perto=' + perto + ' meio=' + meio);
    assert.ok(meio < longe, 'meio=' + meio + ' longe=' + longe);
});

test('a penalidade está sempre entre 0 e 1', () => {
    for (const setores of [['esq'], ['cen'], ['dir'], ['esq', 'dir'], ['esq', 'cen', 'dir']]) {
        const T = montarTatics(setores);
        for (let x = -40; x <= 40; x += 2) {
            for (const dir of [1, -1]) {
                const p = T.penalidadeSector(x, dir);
                assert.ok(p >= 0 && p <= 1,
                    setores.join('+') + ' x=' + x + ' dir=' + dir + ' deu ' + p);
            }
        }
    }
});

test('com só o centro activo, quem está na ponta é penalizado', () => {
    const T = montarTatics(['cen']);
    assert.strictEqual(T.penalidadeSector(0, 1), 0);
    assert.ok(T.penalidadeSector(30, 1) > 0);
    assert.ok(T.penalidadeSector(-30, 1) > 0);
});

test('a penalidade é simétrica quando os dois lados estão activos', () => {
    const T = montarTatics(['esq', 'dir']);
    assert.ok(Math.abs(T.penalidadeSector(4, 1) - T.penalidadeSector(-4, 1)) < 1e-9);
});
```

- [ ] **Step 2: Correr o teste e confirmar que falha**

Run: `node --test tests/carry_direccao.test.js`
Expected: FAIL com `metodo sectorDeX nao encontrado`.

- [ ] **Step 3: Escrever a implementação**

Em `js/config.js`, substitui o comentário longo que começa em `Sector activado tem 80% de chance contra um desactivado` e a função `getWeightedSectorX` inteira (até à chaveta e vírgula que a fecham) por:

```js
    /*
    SECTOR DE CAMPO: a que faixa pertence um X, no referencial de ATAQUE
    (x * dirZ). A convenção dos 10 m já vivia em PassTypeModel.larguraCentro e,
    copiada à mão, dentro de findPassTarget (player.js). Agora é uma só.
    */
    sectorDeX: function (x, dirZ) {
        const xAtk = x * dirZ;
        if (xAtk < -10) return 'esq';
        if (xAtk > 10) return 'dir';
        return 'cen';
    },

    /*
    Quão FORA dos sectores activados está este X, de 0 (dentro de um deles) a 1
    (o mais longe que o campo permite). Normalizada pela meia-largura do campo.

    Substitui o getWeightedSectorX, que sorteava um X alvo dentro do grupo
    activo e o re-sorteava a cada ~1 s. Com Left e Right ligados isso era uma
    moeda ao ar: um extremo na direita saía metade das vezes com alvo em -19 e
    atravessava o campo pelo meio para lá chegar. E, por ser distância a um
    PONTO (±19), penalizava um extremo em x=+25 que já estava bem colocado.
    */
    penalidadeSector: function (x, dirZ) {
        const activos = this.setores;
        if (!activos || activos.length === 0) return 0;
        if (activos.indexOf(this.sectorDeX(x, dirZ)) >= 0) return 0;

        const xAtk = x * dirZ;
        let melhor = Infinity;
        for (const s of activos) {
            // Distância à BORDA do sector activo, não ao seu centro.
            let d;
            if (s === 'esq') d = xAtk - (-10);
            else if (s === 'dir') d = 10 - xAtk;
            else d = Math.abs(xAtk) - 10;
            if (d < melhor) melhor = d;
        }

        const meiaLarg = CAMPO_LARG / 2;
        return Math.max(0, Math.min(1, melhor / meiaLarg));
    },
```

- [ ] **Step 4: Correr os testes e confirmar que passam**

Run: `node --test tests/carry_direccao.test.js`
Expected: PASS, 10 testes.

- [ ] **Step 5: Confirmar que ninguém ficou a chamar a função removida**

Run: `grep -rn "getWeightedSectorX" js/ tests/`
Expected: só a linha do índice de comentário no topo de `js/config.js`, que a Task 4 trata. Nenhuma chamada real.

- [ ] **Step 6: Verificar sintaxe**

Run: `node --check js/config.js`
Expected: sem saída, código de saída 0.

- [ ] **Step 7: Commit**

```bash
git add js/config.js tests/carry_direccao.test.js
git commit -m "feat: treat tactical sectors as bands instead of a sampled point"
```

---

### Task 2: Pontuação normalizada em funções puras

**Files:**
- Modify: `js/config.js:1216` em diante (o objecto `CarryModel`)
- Modify: `js/utils.js` (acrescentar duas funções no fim)
- Test: `tests/carry_direccao.test.js` (o mesmo ficheiro, a crescer)

**Interfaces:**
- Consumes: nada da Task 1 — estas funções recebem a penalidade já calculada, como número.
- Produces:
  - `pesoEspacoPorTecnica(tec) → number`
  - `notaDireccaoCarry(espaco, progresso, sectorPen, tec) → number`, onde `espaco`, `progresso` e `sectorPen` estão todos entre 0 e 1.
  - Em `CarryModel`: `pesoEspacoMin`, `pesoEspacoMax`, `tecEspacoMin`, `tecEspacoMax`, `pesoProgresso`, `pesoSector`.

- [ ] **Step 1: Escrever o teste que falha**

Acrescenta ao fim de `tests/carry_direccao.test.js`:

```js
/* ===================================================================
   Pontuação da direcção de condução
   =================================================================== */

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

function montarNota() {
    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext(
        recortarConst(CONFIG, 'CarryModel') + '\n' +
        recortarFuncao(UTILS, 'pesoEspacoPorTecnica') + '\n' +
        recortarFuncao(UTILS, 'notaDireccaoCarry') + '\n' +
        'this.peso = pesoEspacoPorTecnica; this.nota = notaDireccaoCarry;' +
        'this.C = CarryModel;', sandbox);
    return sandbox;
}

test('o peso do espaço satura nos extremos da técnica', () => {
    const s = montarNota();
    assert.strictEqual(s.peso(20), s.C.pesoEspacoMin);
    assert.strictEqual(s.peso(40), s.C.pesoEspacoMin);
    assert.strictEqual(s.peso(90), s.C.pesoEspacoMax);
    assert.strictEqual(s.peso(99), s.C.pesoEspacoMax);
});

test('o peso do espaço é o ponto médio a meio caminho da técnica', () => {
    const s = montarNota();
    const meio = (s.C.tecEspacoMin + s.C.tecEspacoMax) / 2;   // 65
    const esperado = (s.C.pesoEspacoMin + s.C.pesoEspacoMax) / 2;
    assert.ok(Math.abs(s.peso(meio) - esperado) < 1e-9,
        'esperava ' + esperado + ', deu ' + s.peso(meio));
});

test('o peso do espaço cresce com a técnica', () => {
    const s = montarNota();
    let anterior = -Infinity;
    for (let t = 0; t <= 100; t += 5) {
        const p = s.peso(t);
        assert.ok(p >= anterior - 1e-9, 'desceu em tec=' + t);
        anterior = p;
    }
});

test('mais espaço nunca baixa a nota', () => {
    const s = montarNota();
    let anterior = -Infinity;
    for (let e = 0; e <= 1.0001; e += 0.1) {
        const n = s.nota(Math.min(e, 1), 0.5, 0, 70);
        assert.ok(n >= anterior - 1e-9, 'desceu em espaco=' + e);
        anterior = n;
    }
});

test('mais progresso nunca baixa a nota', () => {
    const s = montarNota();
    let anterior = -Infinity;
    for (let g = 0; g <= 1.0001; g += 0.1) {
        const n = s.nota(0.5, Math.min(g, 1), 0, 70);
        assert.ok(n >= anterior - 1e-9, 'desceu em progresso=' + g);
        anterior = n;
    }
});

test('mais penalidade de sector nunca sobe a nota', () => {
    const s = montarNota();
    let anterior = Infinity;
    for (let p = 0; p <= 1.0001; p += 0.1) {
        const n = s.nota(0.5, 0.5, Math.min(p, 1), 70);
        assert.ok(n <= anterior + 1e-9, 'subiu em sector=' + p);
        anterior = n;
    }
});

/*
O bug relatado: extremo recebe na direita com Right activo, o caminho central
está fechado, e ele corta para o meio na mesma. Com os pesos antigos o termo do
progresso tinha 56 pontos de amplitude contra 32 do espaço, e a frontal ganhava
sempre.

Números da ponta livre: um candidato a 56° do eixo tem progresso cos(56°)=0.56 e
espaço 1.0 (nenhum adversário até ao spaceCap). O frontal tem progresso 1.0 e,
com um adversário a 2 m e spaceCap 16, espaço 2/16 = 0.125.
*/
test('regressão do bug: a ponta livre bate a frontal fechada a técnica 80', () => {
    const s = montarNota();
    const frontal = s.nota(0.125, 1.0, 0, 80);
    const ponta = s.nota(1.0, 0.56, 0, 80);
    assert.ok(ponta > frontal, 'ponta=' + ponta + ' frontal=' + frontal);
});

test('a ponta livre ainda ganha a técnica 40, quando ele a consegue ver', () => {
    const s = montarNota();
    const frontal = s.nota(0.125, 1.0, 0, 40);
    // A técnica 40 o cone é ±30°, logo o melhor lateral visível tem
    // progresso cos(30°) = 0.87.
    const ponta = s.nota(1.0, 0.87, 0, 40);
    assert.ok(ponta > frontal, 'ponta=' + ponta + ' frontal=' + frontal);
});

test('a vantagem da ponta é MAIOR a técnica alta do que a técnica baixa', () => {
    const s = montarNota();
    const margemAlta = s.nota(1.0, 0.56, 0, 90) - s.nota(0.125, 1.0, 0, 90);
    const margemBaixa = s.nota(1.0, 0.56, 0, 40) - s.nota(0.125, 1.0, 0, 40);
    assert.ok(margemAlta > margemBaixa,
        'alta=' + margemAlta + ' baixa=' + margemBaixa);
});

test('um sector desactivado chega para virar a escolha entre iguais', () => {
    const s = montarNota();
    const dentro = s.nota(0.6, 0.6, 0, 70);
    const fora = s.nota(0.6, 0.6, 0.5, 70);
    assert.ok(dentro > fora);
});

test('os pesos novos existem e os antigos desapareceram', () => {
    const s = montarNota();
    for (const k of ['pesoEspacoMin', 'pesoEspacoMax', 'tecEspacoMin',
                     'tecEspacoMax', 'pesoProgresso', 'pesoSector']) {
        assert.strictEqual(typeof s.C[k], 'number', k + ' em falta');
    }
    for (const k of ['spaceWeight', 'progressWeight', 'sectorWeight']) {
        assert.strictEqual(s.C[k], undefined, k + ' devia ter sido removido');
    }
});
```

- [ ] **Step 2: Correr e confirmar que falha**

Run: `node --test tests/carry_direccao.test.js`
Expected: FAIL com `function pesoEspacoPorTecnica nao encontrada`.

- [ ] **Step 3: Trocar os pesos no CarryModel**

Em `js/config.js`, dentro de `CarryModel`, substitui as linhas de `spaceCap`,
`spaceWeight`, `progressWeight`, o comentário longo sobre o `sectorWeight` e a
própria linha `sectorWeight: 4.5,` por:

```js
    spaceCap: 16.0,       // espaço acima disto já não conta mais

    /*
    PESOS DA DIRECÇÃO DE CONDUÇÃO. Os três termos chegam normalizados a 0..1
    (ver notaDireccaoCarry em utils.js), por isso estes números são comparáveis
    entre si — antes não eram, e era esse o bug.

    Os antigos spaceWeight/progressWeight/sectorWeight multiplicavam grandezas
    em escalas diferentes: o progresso valia visDist metros (40 m a técnica 80)
    e o espaço no máximo spaceCap (16). Amplitude real: 56 pontos para o
    progresso contra 32 para o espaço — a direcção frontal ganhava sempre, mesmo
    com um adversário colado e a ponta vazia. Subir o sectorWeight de 1.0 para
    4.5 em três tentativas nunca resolveu, porque o problema era a escala.

    pesoProgresso fica em 1.0 de propósito: é a unidade de referência.
    */
    pesoEspacoMin: 1.0,   // técnica <= tecEspacoMin
    pesoEspacoMax: 2.4,   // técnica >= tecEspacoMax
    tecEspacoMin: 40,
    tecEspacoMax: 90,
    pesoProgresso: 1.0,
    pesoSector: 1.6,
```

- [ ] **Step 4: Escrever as duas funções puras**

No fim de `js/utils.js`, acrescenta:

```js
/*
Quanto vale o espaço livre para este jogador, pela Técnica. Quem tem técnica lê
o espaço e desvia; quem não tem insiste no caminho para a baliza.

É uma das DUAS vias pelas quais a técnica manda na condução. A outra já existia:
o cone de visão em CARRY (fsm.js) abre com a técnica — ±30° a 40, ±56° a 80 — e
um jogador de técnica baixa nem chega a VER a ponta livre a 56°.
*/
function pesoEspacoPorTecnica(tec) {
    const C = CarryModel;
    const t = Math.max(0, Math.min(1,
        (tec - C.tecEspacoMin) / (C.tecEspacoMax - C.tecEspacoMin)));
    return C.pesoEspacoMin + (C.pesoEspacoMax - C.pesoEspacoMin) * t;
}

/*
Nota de uma direcção candidata de condução. Os três argumentos vêm normalizados
a 0..1 por quem chama (ver o case 'CARRY' em fsm.js):

    espaco     distância ao obstáculo mais próximo no corredor, sobre spaceCap
    progresso  avanço para a baliza sobre a distância de visão — cos(ângulo)
    sectorPen  Tatics.penalidadeSector do ponto candidato

Pura de propósito: sem Match, sem window, só os argumentos (ver
tests/carry_direccao.test.js).
*/
function notaDireccaoCarry(espaco, progresso, sectorPen, tec) {
    const C = CarryModel;
    return espaco * pesoEspacoPorTecnica(tec)
        + progresso * C.pesoProgresso
        - sectorPen * C.pesoSector;
}
```

- [ ] **Step 5: Correr os testes e confirmar que passam**

Run: `node --test tests/carry_direccao.test.js`
Expected: PASS, 21 testes.

- [ ] **Step 6: Verificar sintaxe**

Run: `node --check js/config.js && node --check js/utils.js`
Expected: sem saída, código de saída 0.

- [ ] **Step 7: Commit**

```bash
git add js/config.js js/utils.js tests/carry_direccao.test.js
git commit -m "feat: score carry directions on a normalised, technique-aware scale"
```

---

### Task 3: Ligar a pontuação nova ao case CARRY

**Files:**
- Modify: `js/fsm.js:401-476` (o `case 'CARRY'`)
- Modify: `js/player.js:53` (remover `this.carryTargetX`)

**Interfaces:**
- Consumes: `Tatics.penalidadeSector(x, dirZ)` da Task 1; `notaDireccaoCarry(espaco, progresso, sectorPen, tec)` da Task 2.
- Produces: nada de novo. O `case 'CARRY'` continua a escrever em `p.dynamicTarget` e `p.velocity`.

- [ ] **Step 1: Remover o sorteio do sector**

Em `js/fsm.js`, dentro do `case 'CARRY'`, no ramo `else` do `if (!p.hasBall)`, apaga o bloco inteiro:

```js
                    if (p.pos === 'LB' || p.pos === 'RB') {
                        p.carryTargetX = p.baseTarget.x * 1.05;
                    } else if (!p.carryTargetX || chancePorSegundo(1.2, dt)) {
                        p.carryTargetX = Tatics.getWeightedSectorX(p.dirZ);
                    }
```

Não fica nada no lugar. O ramo dos laterais também sai: com a penalidade por faixa, um lateral já está no seu sector e não é penalizado por lá ficar.

- [ ] **Step 2: Trocar a linha de inicialização do alvo**

Ainda no mesmo bloco, a linha

```js
                        let alvoX = p.carryTargetX, alvoZ = pz + 10 * p.dirZ;
```

passa a

```js
                        // Recuo seguro se nenhum candidato passar os filtros:
                        // dez metros a direito. Antes era o carryTargetX
                        // sorteado, que já não existe.
                        let alvoX = px, alvoZ = pz + 10 * p.dirZ;
```

- [ ] **Step 3: Trocar as três linhas da nota**

As três linhas que calculam a nota

```js
                            let nota = Math.min(maisPerto, CarryModel.spaceCap) * CarryModel.spaceWeight;
                            nota += (tz - pz) * p.dirZ * CarryModel.progressWeight;
                            nota -= Math.abs(tx - p.carryTargetX) * CarryModel.sectorWeight;
```

passam a

```js
                            /*
                            Três termos normalizados a 0..1 e só depois pesados
                            (ver notaDireccaoCarry em utils.js). Antes eram
                            grandezas cruas em escalas diferentes, e o progresso
                            ganhava sempre ao espaço.
                            */
                            const espacoNorm = Math.min(maisPerto, CarryModel.spaceCap) / CarryModel.spaceCap;
                            const progressoNorm = Math.max(0, Math.min(1, ((tz - pz) * p.dirZ) / visDist));
                            const sectorPen = Tatics.penalidadeSector(tx, p.dirZ);
                            const nota = notaDireccaoCarry(espacoNorm, progressoNorm, sectorPen, tec);
```

- [ ] **Step 4: Remover o campo do jogador**

Em `js/player.js`, apaga a linha

```js
        this.carryTargetX = 0;
```

- [ ] **Step 5: Confirmar que não ficou nenhuma referência**

Run: `grep -rn "carryTargetX\|getWeightedSectorX\|spaceWeight\|progressWeight\|sectorWeight" js/ tests/`
Expected: só a linha do índice de comentário no topo de `js/config.js` que menciona `getWeightedSectorX` — a Task 4 trata dela. Mais nada.

- [ ] **Step 6: Verificar sintaxe**

Run: `node --check js/fsm.js && node --check js/player.js`
Expected: sem saída, código de saída 0.

- [ ] **Step 7: Correr a suite toda**

Run: `node --test tests/*.test.js`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add js/fsm.js js/player.js
git commit -m "fix: carry towards open space instead of straight at the goal"
```

---

### Task 4: Centralizar o sector no findPassTarget e limpar a documentação

**Files:**
- Modify: `js/player.js:515-520` (o `getSectorOfX` inline)
- Modify: `js/config.js:17` (a linha do índice de comentário no topo)
- Modify: `filesSummary.md`

**Interfaces:**
- Consumes: `Tatics.sectorDeX(x, dirZ)` da Task 1.
- Produces: nada.

- [ ] **Step 1: Substituir a cópia local**

Em `js/player.js`, dentro de `findPassTarget`, substitui o bloco

```js
        const getSectorOfX = (x) => {
            const xAtk = x * dirZ;
            if (xAtk < -10) return 'esq';
            if (xAtk > 10) return 'dir';
            return 'cen';
        };
```

por

```js
        // Era uma cópia à mão da mesma regra dos 10 m que a condução usa. Uma
        // só, agora, em Tatics.sectorDeX — se as duas divergissem, o passe
        // premiava um flanco e a condução puxava para o outro.
        const getSectorOfX = (x) => Tatics.sectorDeX(x, dirZ);
```

O comentário longo imediatamente acima, que explica o referencial de ataque, fica como está — continua a valer, e menciona o `getWeightedSectorX` como referência histórica.

- [ ] **Step 2: Corrigir o índice no topo do config**

Em `js/config.js`, a linha

```
    * getWeightedSectorX: Returns an X coordinate favoring the chosen tactical sectors.
```

passa a

```
    * sectorDeX, penalidadeSector: Classifies an X into a tactical sector and scores how far outside the active ones it falls.
```

- [ ] **Step 3: Confirmar que a função antiga desapareceu por completo**

Run: `grep -rn "getWeightedSectorX" js/ tests/ index.html`
Expected: no máximo a menção histórica dentro do comentário de `js/player.js`. Nenhuma definição, nenhuma chamada, nada no índice.

- [ ] **Step 4: Verificar sintaxe**

Run: `node --check js/player.js && node --check js/config.js`
Expected: sem saída, código de saída 0.

- [ ] **Step 5: Correr a suite toda**

Run: `node --test tests/*.test.js`
Expected: PASS.

- [ ] **Step 6: Documentar em filesSummary.md**

Procura a entrada de `CarryModel` (`grep -n "CarryModel" filesSummary.md`) e substitui a descrição dos pesos pela nova. Se não houver entrada nenhuma, acrescenta uma na secção do `config.js`, no mesmo formato dos vizinhos:

```markdown
- **`CarryModel`** — **para onde o portador leva a bola.** A direcção sai de um
  leque de nove candidatos, pontuados com três termos **normalizados a 0..1** e
  só depois pesados (`notaDireccaoCarry` em `utils.js`):
  - `espaço` — distância ao obstáculo mais próximo no corredor, sobre `spaceCap`
    (16 m). Peso entre `pesoEspacoMin` (1.0) e `pesoEspacoMax` (2.4), pela
    Técnica — quem tem técnica lê o espaço, quem não tem insiste no caminho
    directo.
  - `progresso` — avanço para a baliza sobre a distância de visão, ou seja o
    cosseno do ângulo. Peso `pesoProgresso` (1.0), a unidade de referência.
  - `sector` — `Tatics.penalidadeSector`, **zero dentro de um sector activo** do
    painel. Peso `pesoSector` (1.6).

  Os antigos `spaceWeight`/`progressWeight`/`sectorWeight` multiplicavam
  grandezas em escalas diferentes (progresso até 56 pontos de amplitude, espaço
  32): a direcção frontal ganhava sempre, mesmo com um adversário colado e a
  ponta vazia, e subir o `sectorWeight` três vezes nunca teve efeito.
```

- [ ] **Step 7: Commit**

```bash
git add js/player.js js/config.js filesSummary.md
git commit -m "refactor: single source of truth for tactical sector classification"
```

---

### Task 5: Verificação no jogo a correr

**Files:**
- Nenhum a modificar. Isto é validação.

**Interfaces:**
- Consumes: tudo o que as Tasks 1 a 4 produziram.
- Produces: nada.

- [ ] **Step 1: Arrancar o servidor de desenvolvimento**

Run: `npm run dev`
Abre o endereço que ele imprime e carrega em Continue — o jogo abre em pausa de propósito.

- [ ] **Step 2: Confirmar que os sectores do painel se vêem**

Com `Left` e `Right` activos (é o valor por omissão, `Tatics.setores = ['esq','dir']`), observa alguns ataques. O portador deve manter-se nos corredores laterais e deixar de cortar para o meio. Um extremo que recebe na direita fica na direita.

- [ ] **Step 3: Trocar para só Center**

No painel, desliga `Left` e `Right` e liga `Center`. Os portadores devem passar a procurar o corredor central e a ser puxados para lá quando estão nas pontas. É o mesmo mecanismo, ao contrário — se um dos casos funciona e o outro não, a penalidade está assimétrica.

- [ ] **Step 4: Confirmar que ele desvia de aglomerados**

Procura uma jogada em que o caminho directo para a baliza tenha dois ou três adversários. O portador deve desviar para o lado livre em vez de correr para cima deles. Este é o comportamento central que faltava.

- [ ] **Step 5: Confirmar que ele não recua nem corre de lado**

O cone de candidatos vai de −56° a +56° em torno da direcção de ataque, portanto nenhuma direcção escolhida deve fazer o portador recuar. Se vires um portador a conduzir para trás, o `progressoNorm` está com o sinal trocado.

- [ ] **Step 6: Comparar jogadores de técnica diferente**

Repara nos extremos e nos médios criativos (técnica alta) contra os defesas centrais (técnica baixa). Os primeiros devem desviar-se mais cedo e mais longe para o espaço; os segundos devem insistir mais no caminho directo. Se todos se comportarem igual, `pesoEspacoPorTecnica` não está a ser chamado.
