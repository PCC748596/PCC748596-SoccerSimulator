# Posicionamento do guarda-redes: fórmula gkAnchor — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir as quatro fórmulas dispersas de posicionamento do guarda-redes por uma única função pura, `gkAnchor`, em que a distância à linha de golo diminui de forma monótona à medida que a bola se aproxima da baliza.

**Architecture:** `gkAnchor(ballX, ballZ, ownGoalZ, dirZ, style)` vive em `js/config.js`, é pura e não toca em `Match` nem em qualquer global de estado. `updateGK()` em `js/player.js` passa a chamá-la nos ramos de repouso e de posicionamento defensivo; os estados reativos (mergulho, mãos, apanhar, salto, cruzamento) ficam intactos. O gatilho de sweeper, hoje confundido com o estilo `offensive`, ganha um alvo próprio de interceptação.

**Tech Stack:** JavaScript de browser em scripts clássicos, sem build nem módulos. Three.js para vetores. Testes com `node:test` e `node:vm`, recortando as funções reais dos ficheiros de origem — ver `tests/gk_saida.test.js` como referência do padrão.

## Global Constraints

- Sem passos de build. Os ficheiros em `js/` são carregados como `<script>` clássicos por `index.html`; tudo é global, nada de `import`/`export`.
- `gkAnchor` tem de ser pura: sem leituras de `Match`, `window` ou de qualquer outro global mutável. Só os cinco argumentos.
- Os testes correm com `node --test tests/`. Não há script `test` em `package.json`; usa o comando completo.
- O código e os comentários do repositório estão em português europeu. Segue o mesmo registo.
- Convenção de eixos já existente: `dirZ` é `+1` para `TeamA` e `-1` para `TeamB`; `ownGoalZ = -(CAMPO_COMP / 2) * dirZ`. Avançar para o campo adversário é somar `depth * dirZ` a `ownGoalZ`.
- `LARGURA_BALIZA` vale `7.32`, logo `limitGKX = 7.32 / 2 - 0.5 = 3.16`.

---

### Task 1: A função pura gkAnchor

**Files:**
- Modify: `js/config.js:998-1001` (o objeto `GoalkeeperStyle`)
- Test: `tests/gk_anchor.test.js` (criar)

**Interfaces:**
- Consumes: nada de tarefas anteriores. Usa `LARGURA_BALIZA`, já definida em `js/config.js:59`.
- Produces:
  - `GoalkeeperStyle[nome] = { depthMin: number, depthMax: number, sweepOut: number }` para os nomes `defensive` e `offensive`.
  - `GK_D_NEAR: number` e `GK_D_FAR: number`, constantes de topo de ficheiro.
  - `gkAnchor(ballX, ballZ, ownGoalZ, dirZ, style) → { x: number, z: number }`, onde `style` é um dos objetos de `GoalkeeperStyle`. Tarefas seguintes chamam-na exatamente com esta assinatura.

- [ ] **Step 1: Escrever o teste que falha**

Cria `tests/gk_anchor.test.js` com este conteúdo exato:

```js
/*
Ancoragem do guarda-redes: quanto mais perto a bola está da baliza, mais perto
da linha ele fica. Corre a função real de config.js num sandbox — é uma global
de browser, por isso é recortada do ficheiro em vez de importada.
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

function recortarLinha(src, nome) {
    const re = new RegExp('^const ' + nome + '\\s*=.*$', 'm');
    const m = src.match(re);
    assert.ok(m, 'const ' + nome + ' nao encontrado');
    return m[0];
}

function montar() {
    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext(
        recortarLinha(CONFIG, 'LARGURA_BALIZA') + '\n' +
        recortarLinha(CONFIG, 'GK_D_NEAR') + '\n' +
        recortarLinha(CONFIG, 'GK_D_FAR') + '\n' +
        recortarConst(CONFIG, 'GoalkeeperStyle') + '\n' +
        recortarFuncao(CONFIG, 'gkAnchor') + '\n' +
        'this.gkAnchor = gkAnchor; this.S = GoalkeeperStyle;' +
        'this.NEAR = GK_D_NEAR; this.FAR = GK_D_FAR;', sandbox);
    return sandbox;
}

// TeamA defende em z = -52.5 e ataca para +z.
const GOL_A = -52.5, DIR_A = 1;
// TeamB defende em z = +52.5 e ataca para -z.
const GOL_B = 52.5, DIR_B = -1;

// Limite lateral do guarda-redes, igual ao de updateGK: meio-poste menos 0.5 m.
const LIMITE_X = (7.32 / 2) - 0.5;

// Profundidade = distância da posição devolvida à própria linha de golo.
function depth(r, ownGoalZ, dirZ) {
    return (r.z - ownGoalZ) * dirZ;
}

test('a profundidade nunca aumenta quando a bola se aproxima da baliza', () => {
    const s = montar();
    let anterior = Infinity;
    // Bola no eixo, a percorrer o campo desde longe até à linha.
    for (let d = 100; d >= 0; d -= 1) {
        const r = s.gkAnchor(0, GOL_A + d * DIR_A, GOL_A, DIR_A, s.S.defensive);
        const p = depth(r, GOL_A, DIR_A);
        assert.ok(p <= anterior + 1e-9, 'subiu de ' + anterior + ' para ' + p + ' a d=' + d);
        anterior = p;
    }
});

test('bola colada à baliza dá depthMin, bola muito longe dá depthMax', () => {
    const s = montar();
    const perto = s.gkAnchor(0, GOL_A, GOL_A, DIR_A, s.S.defensive);
    assert.ok(Math.abs(depth(perto, GOL_A, DIR_A) - s.S.defensive.depthMin) < 1e-9);

    const longe = s.gkAnchor(0, GOL_A + 200 * DIR_A, GOL_A, DIR_A, s.S.defensive);
    assert.ok(Math.abs(depth(longe, GOL_A, DIR_A) - s.S.defensive.depthMax) < 1e-9);
});

test('dentro da grande área ele está sempre em depthMin', () => {
    const s = montar();
    for (const d of [0, 5, 10, 16.5]) {
        const r = s.gkAnchor(0, GOL_A + d * DIR_A, GOL_A, DIR_A, s.S.defensive);
        assert.ok(Math.abs(depth(r, GOL_A, DIR_A) - s.S.defensive.depthMin) < 1e-9,
            'd=' + d);
    }
});

test('regressão do bug: bola a 16 m deixa-o mais recuado do que bola a 40 m', () => {
    const s = montar();
    const perto = s.gkAnchor(0, GOL_A + 16 * DIR_A, GOL_A, DIR_A, s.S.defensive);
    const longe = s.gkAnchor(0, GOL_A + 40 * DIR_A, GOL_A, DIR_A, s.S.defensive);
    assert.ok(depth(perto, GOL_A, DIR_A) < depth(longe, GOL_A, DIR_A));
});

test('o desvio lateral nunca passa do poste', () => {
    const s = montar();
    for (const bx of [-40, -20, -5, 0, 5, 20, 40]) {
        for (const d of [2, 16.5, 30, 60]) {
            const r = s.gkAnchor(bx, GOL_A + d * DIR_A, GOL_A, DIR_A, s.S.offensive);
            assert.ok(Math.abs(r.x) <= LIMITE_X + 1e-9,
                'x=' + r.x + ' para bx=' + bx + ' d=' + d);
        }
    }
});

test('o desvio lateral segue o lado da bola', () => {
    const s = montar();
    const dir = s.gkAnchor(20, GOL_A + 30 * DIR_A, GOL_A, DIR_A, s.S.defensive);
    const esq = s.gkAnchor(-20, GOL_A + 30 * DIR_A, GOL_A, DIR_A, s.S.defensive);
    assert.ok(dir.x > 0);
    assert.ok(esq.x < 0);
    assert.ok(Math.abs(dir.x + esq.x) < 1e-9, 'devia ser simétrico');
});

test('TeamA e TeamB produzem posições espelhadas', () => {
    const s = montar();
    const a = s.gkAnchor(12, GOL_A + 35 * DIR_A, GOL_A, DIR_A, s.S.defensive);
    const b = s.gkAnchor(12, GOL_B + 35 * DIR_B, GOL_B, DIR_B, s.S.defensive);
    assert.ok(Math.abs(a.x - b.x) < 1e-9, 'o x não depende do lado');
    assert.ok(Math.abs(depth(a, GOL_A, DIR_A) - depth(b, GOL_B, DIR_B)) < 1e-9);
});

test('offensive fica mais adiantado que defensive à mesma distância', () => {
    const s = montar();
    const d = 45;
    const def = s.gkAnchor(0, GOL_A + d * DIR_A, GOL_A, DIR_A, s.S.defensive);
    const off = s.gkAnchor(0, GOL_A + d * DIR_A, GOL_A, DIR_A, s.S.offensive);
    assert.ok(depth(off, GOL_A, DIR_A) > depth(def, GOL_A, DIR_A));
});

test('nunca devolve NaN, mesmo com a bola exactamente sobre a baliza', () => {
    const s = montar();
    const r = s.gkAnchor(0, GOL_A, GOL_A, DIR_A, s.S.defensive);
    assert.ok(Number.isFinite(r.x), 'x = ' + r.x);
    assert.ok(Number.isFinite(r.z), 'z = ' + r.z);
});

test('os estilos têm todas as chaves esperadas', () => {
    const s = montar();
    for (const nome of ['defensive', 'offensive']) {
        const e = s.S[nome];
        assert.ok(e, nome + ' em falta');
        for (const k of ['depthMin', 'depthMax', 'sweepOut']) {
            assert.strictEqual(typeof e[k], 'number', nome + '.' + k);
        }
        assert.ok(e.depthMin < e.depthMax, nome + ': depthMin tem de ser menor');
    }
});

test('as distâncias de referência são a área e o meio-campo adversário', () => {
    const s = montar();
    assert.strictEqual(s.NEAR, 16.5);
    assert.strictEqual(s.FAR, 55.0);
});
```

- [ ] **Step 2: Correr o teste e confirmar que falha**

Run: `node --test tests/gk_anchor.test.js`
Expected: FAIL. A mensagem será `const GK_D_NEAR nao encontrado` ou `function gkAnchor nao encontrada`, vinda dos `assert.ok` dos recortadores.

- [ ] **Step 3: Escrever a implementação mínima**

Em `js/config.js`, substitui o bloco `GoalkeeperStyle` (linhas 998-1001) por:

```js
/*
Ancoragem do guarda-redes.

depthMin/depthMax: distância à própria linha de golo, em metros. O valor real
sai da curva em gkAnchor() — depthMin com a bola dentro da grande área,
depthMax com ela no meio-campo adversário.

sweepOut: quão longe da linha ele pode ir a varrer, e SÓ a varrer. É o gatilho
pontual de updateGkStyle() (team_bt.js), não uma postura de repouso.

Antes disto havia um único maxOut e quatro fórmulas espalhadas por updateGK(),
com coeficientes que SUBIAM (0.15, 0.35, 0.55) à medida que o atacante se
aproximava: quanto maior o perigo, mais ele saía da baliza.
*/
const GoalkeeperStyle = {
    defensive: { depthMin: 1.2, depthMax: 6.0, sweepOut: 6.0 },
    offensive: { depthMin: 1.8, depthMax: 11.0, sweepOut: 20.0 }
};

// Referências da curva de profundidade: borda da grande área e meio-campo
// adversário. Entre elas a profundidade cresce; fora delas está saturada.
const GK_D_NEAR = 16.5;
const GK_D_FAR = 55.0;

/*
Posição de ancoragem do guarda-redes, em repouso e a defender.

Função PURA de propósito: não lê Match nem window, só os cinco argumentos, e
por isso é testável isolada (ver tests/gk_anchor.test.js).

Profundidade: cresce com a distância da bola à baliza, com easing quadrático —
o recuo acelera junto da área, que é onde importa.

Lateral: bissetriz do ângulo bola-postes, recuada de depth. O desvio encolhe
sozinho conforme ele recua para a linha; é geometria, não uma constante à mão.
*/
function gkAnchor(ballX, ballZ, ownGoalZ, dirZ, style) {
    const e = style || GoalkeeperStyle.defensive;

    const dx = ballX;
    const dz = ballZ - ownGoalZ;
    const d = Math.hypot(dx, dz);

    let t = (d - GK_D_NEAR) / (GK_D_FAR - GK_D_NEAR);
    t = Math.max(0, Math.min(1, t));
    const depth = e.depthMin + (e.depthMax - e.depthMin) * t * t;

    // d === 0 é a bola em cima do centro da baliza: sem direção definida, fica
    // no eixo. Sem esta guarda, depth/d dava NaN.
    const limitGKX = (LARGURA_BALIZA / 2) - 0.5;
    let x = (d > 0.0001) ? (ballX * (depth / d)) : 0;
    x = Math.max(-limitGKX, Math.min(limitGKX, x));

    return { x: x, z: ownGoalZ + depth * dirZ };
}
```

- [ ] **Step 4: Correr os testes e confirmar que passam**

Run: `node --test tests/gk_anchor.test.js`
Expected: PASS, 11 testes.

- [ ] **Step 5: Confirmar que não partiste os outros testes**

Run: `node --test tests/`
Expected: PASS. Repara em `tests/gk_saida.test.js` em particular — também recorta de `config.js`.

- [ ] **Step 6: Commit**

```bash
git add tests/gk_anchor.test.js js/config.js
git commit -m "feat: add pure gkAnchor goalkeeper positioning function"
```

---

### Task 2: Ligar gkAnchor aos ramos de posicionamento de updateGK

**Files:**
- Modify: `js/player.js:1808-2000` (dentro de `updateGK`, no ramo `this.gkEstado === 'idle'`)
- Test: `tests/gk_anchor.test.js` (o mesmo ficheiro, a crescer)

**Interfaces:**
- Consumes: `gkAnchor(ballX, ballZ, ownGoalZ, dirZ, style)` e `GoalkeeperStyle`, da Task 1.
- Produces: nada de novo para tarefas seguintes. `updateGK` continua a escrever em `alvoGkX`, `alvoGkZ` e `speedLerp`, exatamente como hoje.

- [ ] **Step 1: Escrever o teste que fixa o contrato**

Acrescenta ao fim de `tests/gk_anchor.test.js`:

```js
/*
O ramo de repouso de updateGK() é código embebido num método de 800 linhas, não
uma função isolável. O que se testa aqui é o contrato de que ele depende: a
âncora com um atacante colado à área tem de deixar o guarda-redes MAIS recuado
do que a âncora com a bola no meio-campo. Era exactamente isto que o coeficiente
0.55 de player.js:1938-1942 violava.
*/
test('atacante à entrada da área recua-o mais do que bola no meio-campo', () => {
    const s = montar();
    // Atacante com bola a 18 m da baliza, ligeiramente à direita.
    const ataque = s.gkAnchor(6, GOL_A + 18 * DIR_A, GOL_A, DIR_A, s.S.defensive);
    // Mesma equipa, bola no meio-campo.
    const meio = s.gkAnchor(6, GOL_A + 52.5 * DIR_A, GOL_A, DIR_A, s.S.defensive);

    assert.ok(depth(ataque, GOL_A, DIR_A) < depth(meio, GOL_A, DIR_A),
        'com o ataque perto ele tem de estar mais perto da linha');
});

test('a âncora cabe sempre dentro da grande área', () => {
    const s = montar();
    for (const nome of ['defensive', 'offensive']) {
        for (const d of [0, 10, 30, 60, 110]) {
            for (const bx of [-30, 0, 30]) {
                const r = s.gkAnchor(bx, GOL_A + d * DIR_A, GOL_A, DIR_A, s.S[nome]);
                const p = depth(r, GOL_A, DIR_A);
                assert.ok(p >= 0 && p <= 16.5,
                    nome + ': profundidade ' + p + ' fora da área a d=' + d);
            }
        }
    }
});
```

- [ ] **Step 2: Correr e confirmar que passa já**

Run: `node --test tests/gk_anchor.test.js`
Expected: PASS. Estes dois testes passam com a implementação da Task 1 — são a rede de segurança que fixa o contrato antes de mexer em `player.js`, não um teste de código por escrever. Se falharem, a Task 1 está errada; corrige-a antes de seguir.

- [ ] **Step 3: Substituir o ramo de repouso**

Em `js/player.js`, dentro de `updateGK`, no bloco `if (this.gkEstado === 'idle')`, localiza o comentário longo que começa em `Posição de repouso: 5 m à frente da própria linha` e todo o cálculo até à linha que atribui `alvoGkZ`. Substitui o comentário e as três instruções (`const gkStyleAtual`, `const avancoGk`, `let alvoGkZ`) por:

```js
            /*
            Posição de repouso: sai toda de gkAnchor() (config.js), a mesma
            função que os ramos defensivos usam mais abaixo. Antes eram quatro
            fórmulas diferentes, e a de repouso partia de 5 m fora da linha.
            */
            const gkStyleAtual = GoalkeeperStyle[this.gkStyle] || GoalkeeperStyle.defensive;
            const ancora = gkAnchor(Match.ball.position.x, Match.ball.position.z,
                this.ownGoalZ, this.dirZ, gkStyleAtual);

            let alvoGkZ = (typeof Match !== 'undefined' && Match.state === 'GOAL')
                ? (-48 * this.dirZ)
                : ancora.z;
```

A linha anterior, `let alvoGkX = ...`, fica como está: em `GOAL`/`OUT` ele vai ao eixo, caso contrário mantém o x atual, e os ramos abaixo sobrepõem-no.

- [ ] **Step 4: Substituir os três ramos defensivos**

No mesmo bloco, dentro de `else if (Match.state === 'PLAY')`, no ramo `else if (!isAttacking)`:

Substitui o par de atribuições do caso "portador perto" — hoje `alvoGkZ = ownGoalZCenter(this.team) + (Match.ball.position.z - ownGoalZCenter(this.team)) * 0.55;` seguido de `alvoGkX = Match.ball.position.x * 0.6;` — e também o par do `else` seguinte, que usa `0.35` e `0.7`, por uma única atribuição comum. O `if (carrier && ...)` inteiro desaparece: os dois casos passam a ser o mesmo.

```js
                            } else {
                                /*
                                Um só alvo, venha o portador de onde vier. Antes
                                havia dois ramos, com coeficientes 0.55 e 0.35: o
                                mais adiantado era o do atacante MAIS perto.
                                */
                                alvoGkX = ancora.x;
                                alvoGkZ = ancora.z;
                                speedLerp = 3.5;
                            }
```

E o ramo `else` de fora, o de bola fora da área — hoje com `* 0.15` e `* 0.5` — passa a:

```js
                    } else {
                        alvoGkX = ancora.x;
                        alvoGkZ = ancora.z;
                        speedLerp = 2.2;
                    }
```

Não mexas em mais nada dentro de `!isAttacking`: os ramos de bola solta na área, de espalmar e de apanhar ficam exatamente como estão.

- [ ] **Step 5: Confirmar que os ramos intactos continuam intactos**

Run: `grep -n "0.55\|0.35\|0.15" js/player.js`
Expected: nenhuma destas constantes aparece já entre as linhas 1808 e 2000, o corpo de `updateGK`. Podem continuar a existir noutras partes do ficheiro — isso é esperado.

Run: `grep -n "isCross\|salto_alto\|possoEspalmar\|gkEstado = 'apanhar'" js/player.js`
Expected: todos continuam presentes, inalterados.

- [ ] **Step 6: Verificar sintaxe**

Run: `node --check js/player.js`
Expected: sem saída, código de saída 0.

- [ ] **Step 7: Correr a suite toda**

Run: `node --test tests/`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add js/player.js tests/gk_anchor.test.js
git commit -m "fix: goalkeeper drops back as the attack closes in"
```

---

### Task 3: Alvo de sweeper separado do estilo offensive

**Files:**
- Modify: `js/config.js` (acrescentar `gkSweepTarget`, junto de `gkAnchor`)
- Modify: `js/player.js` (o ramo `!isAttacking` de `updateGK`, logo depois das mudanças da Task 2)
- Test: `tests/gk_anchor.test.js`

**Interfaces:**
- Consumes: `gkAnchor` e `GoalkeeperStyle` da Task 1.
- Produces: `gkSweepTarget(ballX, ballZ, ownGoalZ, dirZ, style) → { x: number, z: number }`, pura, com a mesma assinatura de `gkAnchor`.

- [ ] **Step 1: Escrever o teste que falha**

Acrescenta ao fim de `tests/gk_anchor.test.js`:

```js
/*
Sweeper. updateGkStyle() (team_bt.js) só liga o estilo offensive quando um
adversário com bola corre pelo corredor central sem defensor pela frente — é um
gatilho pontual, não uma postura. Nesse caso, e só nesse, o guarda-redes vai à
bola em vez de recuar; sweepOut limita quão longe.
*/
function montarSweep() {
    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext(
        recortarLinha(CONFIG, 'LARGURA_BALIZA') + '\n' +
        recortarLinha(CONFIG, 'GK_D_NEAR') + '\n' +
        recortarLinha(CONFIG, 'GK_D_FAR') + '\n' +
        recortarConst(CONFIG, 'GoalkeeperStyle') + '\n' +
        recortarFuncao(CONFIG, 'gkAnchor') + '\n' +
        recortarFuncao(CONFIG, 'gkSweepTarget') + '\n' +
        'this.sweep = gkSweepTarget; this.gkAnchor = gkAnchor;' +
        'this.S = GoalkeeperStyle;', sandbox);
    return sandbox;
}

test('a varrida nunca passa de sweepOut metros da linha', () => {
    const s = montarSweep();
    for (const nome of ['defensive', 'offensive']) {
        for (const d of [5, 20, 40, 80]) {
            const r = s.sweep(0, GOL_A + d * DIR_A, GOL_A, DIR_A, s.S[nome]);
            const p = (r.z - GOL_A) * DIR_A;
            assert.ok(p <= s.S[nome].sweepOut + 1e-9,
                nome + ': saiu ' + p + ' m, limite ' + s.S[nome].sweepOut);
            assert.ok(p >= 0, nome + ': profundidade negativa ' + p);
        }
    }
});

test('a varrida vai na direcção da bola, não para o eixo', () => {
    const s = montarSweep();
    const r = s.sweep(15, GOL_A + 25 * DIR_A, GOL_A, DIR_A, s.S.offensive);
    assert.ok(r.x > 0, 'devia deslocar-se para o lado da bola, x = ' + r.x);
});

test('bola perto: a varrida vai à bola em vez de a ultrapassar', () => {
    const s = montarSweep();
    const bolaZ = GOL_A + 4 * DIR_A;
    const r = s.sweep(0, bolaZ, GOL_A, DIR_A, s.S.offensive);
    const p = (r.z - GOL_A) * DIR_A;
    assert.ok(p <= 4 + 1e-9, 'passou a bola: ' + p);
});

test('a varrida é sempre mais adiantada que a âncora com a bola longe', () => {
    const s = montarSweep();
    const d = 30;
    const varrida = s.sweep(0, GOL_A + d * DIR_A, GOL_A, DIR_A, s.S.offensive);
    const ancora = s.gkAnchor(0, GOL_A + d * DIR_A, GOL_A, DIR_A, s.S.offensive);
    assert.ok((varrida.z - GOL_A) * DIR_A > (ancora.z - GOL_A) * DIR_A);
});
```

- [ ] **Step 2: Correr e confirmar que falha**

Run: `node --test tests/gk_anchor.test.js`
Expected: FAIL com `function gkSweepTarget nao encontrada`.

- [ ] **Step 3: Escrever a implementação mínima**

Em `js/config.js`, logo a seguir a `gkAnchor`:

```js
/*
Alvo de varrida. Ao contrário de gkAnchor(), vai NA DIRECÇÃO da bola: é a
situação em que o guarda-redes sai mesmo, porque não há defensor entre o
atacante e a baliza. sweepOut trava quão longe.

Também pura, pelas mesmas razões de gkAnchor().
*/
function gkSweepTarget(ballX, ballZ, ownGoalZ, dirZ, style) {
    const e = style || GoalkeeperStyle.defensive;

    const dx = ballX;
    const dz = ballZ - ownGoalZ;
    const d = Math.hypot(dx, dz);
    if (d < 0.0001) return { x: 0, z: ownGoalZ };

    // Nunca ultrapassa a bola, nem sai mais do que sweepOut.
    const alcance = Math.min(d, e.sweepOut);
    return {
        x: (dx / d) * alcance,
        z: ownGoalZ + (dz / d) * alcance
    };
}
```

- [ ] **Step 4: Correr os testes e confirmar que passam**

Run: `node --test tests/gk_anchor.test.js`
Expected: PASS.

- [ ] **Step 5: Ligar a varrida em updateGK**

Em `js/player.js`, dentro do ramo `!isAttacking` que a Task 2 deixou a atribuir `ancora.x` / `ancora.z` no caso do portador, substitui esse bloco por:

```js
                            } else {
                                /*
                                Varre só quando updateGkStyle() (team_bt.js) diz
                                que não há defensor entre o portador e a baliza —
                                é isso, e só isso, que o estilo offensive
                                significa. Fora daí, recua como sempre.
                                */
                                const varrer = (this.gkStyle === 'offensive' && carrier &&
                                    carrier.team !== this.team);
                                const alvo = varrer
                                    ? gkSweepTarget(Match.ball.position.x, Match.ball.position.z,
                                        this.ownGoalZ, this.dirZ, gkStyleAtual)
                                    : ancora;
                                alvoGkX = alvo.x;
                                alvoGkZ = alvo.z;
                                speedLerp = varrer ? 5.0 : 3.5;
                            }
```

- [ ] **Step 6: Verificar sintaxe**

Run: `node --check js/player.js && node --check js/config.js`
Expected: sem saída, código de saída 0.

- [ ] **Step 7: Correr a suite toda**

Run: `node --test tests/`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add js/config.js js/player.js tests/gk_anchor.test.js
git commit -m "feat: give the sweeper trigger its own target, separate from resting depth"
```

---

### Task 4: Alinhar a folha morta da árvore de comportamento

**Files:**
- Modify: `js/bt/player_bt.js:1073-1084` (`actGoalkeeperPosition`)

**Interfaces:**
- Consumes: `gkAnchor` da Task 1.
- Produces: nada. `actGoalkeeperPosition(ctx)` mantém a assinatura; continua chamada de `js/bt/player_bt.js:1028`, `:1162` e `:1434`.

- [ ] **Step 1: Substituir o corpo da função**

Esta folha repete a fórmula antiga e hoje nunca corre, porque `update()` encaminha os guarda-redes para `updateGK()` e nunca para `runBehaviorTree()`. Não a apagues — continua referenciada em três pontos da árvore. Faz o corpo delegar, para que as duas vias não possam divergir se a árvore vier a correr para guarda-redes.

Substitui a linha de `targetX` e as duas de `targetZ`, mais a linha `p.dynamicTarget.set(...)`, por:

```js
    const style = GoalkeeperStyle[p.gkStyle] || GoalkeeperStyle.defensive;
    const alvo = gkAnchor(Match.ball.position.x, Match.ball.position.z,
        p.ownGoalZ, p.dirZ, style);
    p.dynamicTarget.set(alvo.x, ALTURA_BASE_Y, alvo.z);
```

A linha `p.fsm.changeState('MOVE_TO_POS');` e as duas primeiras da função (`p.apoioAtivo` e `p.speedMult`) ficam como estão.

- [ ] **Step 2: Confirmar que a fórmula antiga desapareceu**

Run: `grep -rn "maxOut" js/`
Expected: nenhum resultado. `maxOut` foi substituído por `depthMin`/`depthMax`/`sweepOut` na Task 1; se ainda aparecer, ficou uma referência por converter.

- [ ] **Step 3: Verificar sintaxe**

Run: `node --check js/bt/player_bt.js`
Expected: sem saída, código de saída 0.

- [ ] **Step 4: Correr a suite toda**

Run: `node --test tests/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/bt/player_bt.js
git commit -m "refactor: route the goalkeeper BT leaf through gkAnchor"
```

---

### Task 5: Verificação no jogo a correr

**Files:**
- Modify: `filesSummary.md` (a secção do guarda-redes)

**Interfaces:**
- Consumes: tudo o que as Tasks 1 a 4 produziram.
- Produces: nada.

- [ ] **Step 1: Arrancar o servidor de desenvolvimento**

Run: `npm run dev`
Abre o endereço que ele imprime.

- [ ] **Step 2: Ver o guarda-redes com a bola longe**

Carrega em Continue para o jogo arrancar — ele abre em pausa de propósito. Com a bola no meio-campo adversário, o guarda-redes deve estar perto do limite da pequena área: uns 6 m da linha para um guarda-redes `defensive`, até 11 m para um `offensive`.

- [ ] **Step 3: Ver o guarda-redes com o ataque a chegar**

Espera por um ataque à baliza dele. À medida que a bola entra nos últimos 30 m, ele tem de ir recuando de forma contínua, e estar praticamente em cima da linha quando a bola chega à área. Este é o comportamento que faltava.

- [ ] **Step 4: Confirmar que as defesas continuam a funcionar**

Verifica, ao longo de alguns minutos de jogo: mergulhos aos cantos, defesas de pé com as mãos em bolas ao corpo, saídas aos cruzamentos, e o apanhar de bolas soltas na área. Nenhum destes ramos foi alterado; se algum se partiu, foi uma edição a mais numa das tarefas anteriores.

- [ ] **Step 5: Confirmar que ele nunca sai da área**

Vê os dois guarda-redes durante um ataque prolongado a cada baliza. O clamp de `updateGK` continua lá, mas a âncora também nunca devia pedir mais de 16.5 m — o teste `a âncora cabe sempre dentro da grande área` cobre isto matematicamente.

- [ ] **Step 6: Atualizar a documentação**

Se o comportamento estiver correto, atualiza a secção do guarda-redes em `filesSummary.md` para descrever `gkAnchor` e `gkSweepTarget` em vez do antigo `maxOut`.

```bash
git add filesSummary.md
git commit -m "docs: describe the new goalkeeper positioning in filesSummary"
```
