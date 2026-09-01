# Marcação posicional e tecto do bloco pela Mentalidade — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Baixar o bloco em Mentalidade Equilibrada para não passar do meio-campo, e fazer cada jogador acompanhar o adversário que entra no seu setor, à distância que o Defensive Pressure manda.

**Architecture:** Duas mudanças separadas. O tecto do avanço do bloco muda de dono — sai do Defensive Pressure e passa a ser um campo `tectoBloco` de cada Mentalidade. E entra um quinto passo no `PosicionamentoAI.tick`: depois do estilo inclinar o slot, um desvio de marcação puxa o jogador na direção do adversário mais próximo do seu slot, limitado pelo `biasMaxPorSetor` que já existe, com histerese de 3 s na decisão.

**Tech Stack:** JavaScript de browser em scripts clássicos, sem build nem módulos. Testes com `node:test` e `node:vm`, recortando as funções e constantes reais dos ficheiros de origem — ver `tests/gk_anchor.test.js` como referência do padrão.

## Global Constraints

- Sem passos de build. Os ficheiros em `js/` são carregados como `<script>` clássicos por `index.html`; tudo é global, nada de `import`/`export`.
- `pontoDeMarcacao` e `escolherReferencia` têm de ser puras: sem `Match`, sem `Tatics`, sem `THREE`, só os argumentos. É isso que as torna testáveis.
- Os testes correm com `node --test tests/*.test.js` (o `node --test tests/` simples não resolve o diretório neste Node em Windows). Não há script `test` em `package.json`.
- O código e os comentários do repositório estão em português europeu. Segue o mesmo registo.
- **Marcação é acompanhar, não roubar a bola.** Nada neste plano toca em `actTackle`, `actSlideTackle`, `SlideTackleModel` ou nos estados `TACKLE` / `SLIDE_TACKLE`. O desvio de marcação nunca muda o estado da FSM nem manda ninguém à bola.
- **Não ressuscitar `markingTarget` nem o estado `MARKING`.** Continuam mortos. A marcação posicional é um desvio no alvo, e não usa nenhum dos dois.
- `CAMPO_COMP` vale 106, logo o meio-campo é 53 (`js/config.js:127`).
- Referencial de ataque: `z * dirZ`. O tecto e o `blocoZ` estão nesse referencial, com valores positivos a apontar para a baliza adversária.

---

### Task 1: O tecto do bloco passa para a Mentalidade

**Files:**
- Modify: `js/config.js:438-442` (remover `TeamShape.pressaoLineCap`)
- Modify: `js/config.js:2114-2135` (`MentalidadeModel` ganha `tectoBloco`)
- Modify: `js/bt/team_bt.js:612-622` (`computeBlock` lê o tecto novo)
- Test: `tests/marcacao_posicional.test.js` (criar)

**Interfaces:**
- Consumes: nada de tarefas anteriores.
- Produces: `MentalidadeModel[estilo].tectoBloco` — número, em metros, no referencial de ataque, para os cinco estilos `muito_defensiva`, `defesa`, `balanceado`, `ataque`, `muito_ofensiva`.

- [ ] **Step 1: Escrever o teste que falha**

Cria `tests/marcacao_posicional.test.js` com este conteúdo exacto:

```js
/*
Marcação posicional e o tecto do bloco. As constantes e as funções puras vivem
em js/config.js (script de browser, sem exports), por isso são recortadas do
ficheiro e avaliadas num sandbox.
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

function montarMentalidade() {
    const sandbox = { Math: Math };
    vm.createContext(sandbox);
    vm.runInContext(
        'const CAMPO_COMP = 106;\n' +
        recortarConst(CONFIG, 'MentalidadeModel') + '\n' +
        'this.M = MentalidadeModel;', sandbox);
    return sandbox.M;
}

const ORDEM = ['muito_defensiva', 'defesa', 'balanceado', 'ataque', 'muito_ofensiva'];

test('as cinco mentalidades têm tectoBloco', () => {
    const M = montarMentalidade();
    for (const nome of ORDEM) {
        assert.ok(M[nome], 'falta a mentalidade ' + nome);
        assert.strictEqual(typeof M[nome].tectoBloco, 'number', nome + '.tectoBloco');
    }
});

test('o tecto cresce da mais defensiva para a mais ofensiva', () => {
    const M = montarMentalidade();
    for (let i = 1; i < ORDEM.length; i++) {
        assert.ok(M[ORDEM[i]].tectoBloco > M[ORDEM[i - 1]].tectoBloco,
            ORDEM[i] + ' devia ser maior que ' + ORDEM[i - 1]);
    }
});

test('equilibrado trava exactamente no meio-campo', () => {
    const M = montarMentalidade();
    assert.strictEqual(M.balanceado.tectoBloco, 0,
        'era este o pedido: bloco médio, a partir do meio-campo');
});

test('o tecto acompanha o sinal do blocoZ', () => {
    const M = montarMentalidade();
    for (const nome of ORDEM) {
        const b = M[nome].blocoZ, t = M[nome].tectoBloco;
        if (b === 0) assert.strictEqual(t, 0, nome);
        else assert.ok(Math.sign(b) === Math.sign(t), nome + ': blocoZ ' + b + ', tecto ' + t);
    }
});

test('o pressaoLineCap deixou de existir', () => {
    // Se voltar, há dois donos do mesmo tecto e voltam a divergir.
    assert.ok(CONFIG.indexOf('pressaoLineCap') < 0,
        'ainda há pressaoLineCap em config.js');
});
```

- [ ] **Step 2: Correr o teste e confirmar que falha**

Run: `node --test tests/marcacao_posicional.test.js`
Expected: FAIL — `muito_defensiva.tectoBloco` é `undefined`, e o último teste encontra `pressaoLineCap`.

- [ ] **Step 3: Acrescentar o tectoBloco às mentalidades**

Em `js/config.js`, substitui o objecto `MentalidadeModel` inteiro por:

```js
const MentalidadeModel = {
    /*
    `blocoZ` desloca o centro do bloco em relação à BOLA; `tectoBloco` é o mais
    longe que esse centro pode ir, medido do meio-campo, no referencial de
    ataque.

    O tecto era do Defensive Pressure (TeamShape.pressaoLineCap, removido), e
    por isso a Mentalidade não tinha palavra nenhuma sobre até onde a equipa
    subia: com Equilibrada e pressão Balanced o bloco ia buscar a bola a 17.7 m
    DENTRO do meio-campo adversário. O Defensive Pressure passou a ser a
    distância de marcação (ver MarkingModel.distanciaPorPressao).

    Frações do meio-campo (53 m): um terço, um sexto, zero, um terço, dois
    terços.
    */
    muito_defensiva: {
        agressao: 0.20,
        blocoZ: -10.0,
        tectoBloco: -(CAMPO_COMP / 2) / 3
    },
    defesa: {
        agressao: 0.35,
        blocoZ: -5.0,
        tectoBloco: -(CAMPO_COMP / 2) / 6
    },
    balanceado: {
        agressao: 0.50,
        blocoZ: 0.0,
        tectoBloco: 0.0
    },
    ataque: {
        agressao: 0.65,
        blocoZ: 7.0,
        tectoBloco: (CAMPO_COMP / 2) / 3
    },
    muito_ofensiva: {
        agressao: 0.80,
        blocoZ: 12.0,
        tectoBloco: (CAMPO_COMP / 2) * 2 / 3
    }
```

Mantém a chaveta e o `};` que já fechavam o objecto.

- [ ] **Step 4: Remover o pressaoLineCap**

Em `js/config.js`, apaga o bloco inteiro dentro de `TeamShape`:

```js
    pressaoLineCap: {
        low: 0.0,                      // nunca passa do meio-campo
        balanced: (CAMPO_COMP / 2) / 3,       // 1/3 do campo de ataque (~17.7)
        high: (CAMPO_COMP / 2) * 2 / 3         // 2/3 do campo de ataque (~35.3)
    },
```

incluindo o comentário imediatamente acima, se houver.

- [ ] **Step 5: Fazer o computeBlock ler o tecto novo**

Em `js/bt/team_bt.js`, substitui o comentário e a linha do `pressCap`:

```js
        /*
        Limite duro do avanco sem bola, por Defensive Pressure: meio-campo
        (Low), 1/3 do campo de ataque (Balanced), 2/3 (High). E o ULTIMO a
        falar - e ele que decide ate onde a equipa acompanha uma bola que
        esta no campo adversario, e por isso ganha ao escape acima.
        */
        const pressCap = TeamShape.pressaoLineCap[Tatics.pressaoDefensiva] ?? TeamShape.pressaoLineCap.balanced;
```

por:

```js
        /*
        Limite duro do avanço sem bola, agora pela MENTALIDADE: é ela que manda
        onde o bloco se põe em relação à bola, e o tecto é a outra metade dessa
        decisão. É o ÚLTIMO a falar — decide até onde a equipa acompanha uma
        bola que está no campo adversário — e por isso ganha ao escape acima.

        Era do Defensive Pressure, que passou a ser a distância de marcação. Com
        Equilibrada o tecto é 0: o bloco não passa do meio-campo.
        */
        const pressCap = ment.tectoBloco;
```

`ment` já está declarado mais acima nesta função (`const ment = MentalidadeModel[Tatics.estilo] || MentalidadeModel.balanceado;`), por isso não é preciso declarar nada.

- [ ] **Step 6: Confirmar que ninguém mais lê o pressaoLineCap**

Run: `grep -rn "pressaoLineCap" js/ tests/`
Expected: nenhum resultado.

- [ ] **Step 7: Verificar sintaxe**

Run: `node --check js/config.js && node --check js/bt/team_bt.js`
Expected: sem saída, código de saída 0.

- [ ] **Step 8: Correr os testes**

Run: `node --test tests/marcacao_posicional.test.js`
Expected: PASS, 5 testes.

- [ ] **Step 9: Correr a suite toda**

Run: `node --test tests/*.test.js`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add js/config.js js/bt/team_bt.js tests/marcacao_posicional.test.js
git commit -m "feat: let the mentality own how high the block climbs"
```

---

### Task 2: As funções puras da marcação

**Files:**
- Modify: `js/config.js` — `MarkingModel` (constantes novas e duas funções)
- Test: `tests/marcacao_posicional.test.js`

**Interfaces:**
- Consumes: nada da Task 1.
- Produces:
  - `MarkingModel.raioSetor`, `.histerese`, `.distanciaPorPressao` (`{ low, balanced, high }`).
  - `escolherReferencia(slotX, slotZ, adversarios, raio) → adversário | null`, onde cada adversário é `{ model: { position: { x, z } } }`.
  - `pontoDeMarcacao(slotX, slotZ, alvoX, alvoZ, ownGoalZ, distancia, biasMax) → { x, z }`.

- [ ] **Step 1: Escrever os testes que falham**

Acrescenta ao fim de `tests/marcacao_posicional.test.js`:

```js
/* ------------------------------------------------------------------
   Funções puras da marcação posicional.
   ------------------------------------------------------------------ */

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

function montarMarcacao() {
    const sandbox = { Math: Math };
    vm.createContext(sandbox);
    vm.runInContext(
        'const CAMPO_COMP = 106;\n' +
        recortarConst(CONFIG, 'MarkingModel') + '\n' +
        recortarFuncao(CONFIG, 'escolherReferencia') + '\n' +
        recortarFuncao(CONFIG, 'pontoDeMarcacao') + '\n' +
        'this.M = MarkingModel; this.escolher = escolherReferencia;' +
        'this.ponto = pontoDeMarcacao;', sandbox);
    return sandbox;
}

const adv = (x, z, id) => ({ id: id, model: { position: { x: x, z: z } } });

test('as constantes da marcação existem', () => {
    const s = montarMarcacao();
    assert.strictEqual(typeof s.M.raioSetor, 'number');
    assert.strictEqual(typeof s.M.histerese, 'number');
    for (const k of ['low', 'balanced', 'high']) {
        assert.strictEqual(typeof s.M.distanciaPorPressao[k], 'number', k);
    }
});

test('mais pressão é marcar mais perto', () => {
    const s = montarMarcacao();
    const d = s.M.distanciaPorPressao;
    assert.ok(d.high < d.balanced, 'high devia ser menor que balanced');
    assert.ok(d.balanced < d.low, 'balanced devia ser menor que low');
});

test('escolhe o adversário mais perto do slot', () => {
    const s = montarMarcacao();
    const lista = [adv(10, 0, 'longe'), adv(2, 1, 'perto'), adv(6, 0, 'medio')];
    assert.strictEqual(s.escolher(0, 0, lista, s.M.raioSetor).id, 'perto');
});

test('devolve null quando o mais perto está fora do raio', () => {
    const s = montarMarcacao();
    const fora = s.M.raioSetor + 5;
    assert.strictEqual(s.escolher(0, 0, [adv(fora, 0, 'a')], s.M.raioSetor), null);
});

test('devolve null com a lista vazia', () => {
    const s = montarMarcacao();
    assert.strictEqual(s.escolher(0, 0, [], s.M.raioSetor), null);
});

test('guarda-redes não é candidato a ser acompanhado', () => {
    const s = montarMarcacao();
    const gk = { id: 'gk', role: 'gk', model: { position: { x: 1, z: 0 } } };
    const campo = adv(5, 0, 'campo');
    assert.strictEqual(s.escolher(0, 0, [gk, campo], s.M.raioSetor).id, 'campo');
});

/*
O raio mede-se a partir do SLOT, não da posição do jogador. Medir da posição
realimenta-se: ele desloca-se para o adversário, isso aproxima-o de outros, que
passam a estar no raio, e a referência foge em cadeia.
*/
test('a escolha não depende de onde o jogador está', () => {
    const s = montarMarcacao();
    const lista = [adv(3, 0, 'perto'), adv(9, 0, 'longe')];
    // Mesma lista, mesmo slot: o resultado é o mesmo, venha o jogador de onde vier.
    assert.strictEqual(s.escolher(0, 0, lista, s.M.raioSetor).id, 'perto');
});

test('o ponto fica entre o adversário e a própria baliza', () => {
    const s = montarMarcacao();
    // Baliza própria em z = -53; adversário em z = 0; slot em cima dele.
    const pt = s.ponto(0, 0, 0, 0.0001, -53, 3.0, 10.0);
    assert.ok(pt.z < 0.0001, 'devia estar do lado da própria baliza: z = ' + pt.z);
});

test('o ponto fica à distância pedida do adversário', () => {
    const s = montarMarcacao();
    const dist = 3.0;
    const pt = s.ponto(0, -10, 0, 0, -53, dist, 50.0);
    const d = Math.hypot(pt.x - 0, pt.z - 0);
    assert.ok(Math.abs(d - dist) < 1e-6, 'distância ao homem = ' + d);
});

test('nunca desloca mais do que biasMax a partir do slot', () => {
    const s = montarMarcacao();
    const biasMax = 4.0;
    // Adversário a 30 m do slot: sem o limite, o jogador saltava para lá.
    const pt = s.ponto(0, 0, 0, 30, -53, 3.0, biasMax);
    const desvio = Math.hypot(pt.x - 0, pt.z - 0);
    assert.ok(desvio <= biasMax + 1e-6, 'desviou ' + desvio + ', limite ' + biasMax);
});

test('com biasMax zero devolve o slot intacto', () => {
    const s = montarMarcacao();
    const pt = s.ponto(5, -7, 20, 10, -53, 3.0, 0);
    assert.ok(Math.abs(pt.x - 5) < 1e-9, 'x = ' + pt.x);
    assert.ok(Math.abs(pt.z - (-7)) < 1e-9, 'z = ' + pt.z);
});

test('adversário em cima do slot não dá NaN', () => {
    const s = montarMarcacao();
    const pt = s.ponto(4, 4, 4, 4, -53, 3.0, 10.0);
    assert.ok(Number.isFinite(pt.x), 'x = ' + pt.x);
    assert.ok(Number.isFinite(pt.z), 'z = ' + pt.z);
});

test('menos pressão deixa o ponto mais longe do homem', () => {
    const s = montarMarcacao();
    const D = s.M.distanciaPorPressao;
    const alto = s.ponto(0, -10, 0, 0, -53, D.high, 50.0);
    const baixo = s.ponto(0, -10, 0, 0, -53, D.low, 50.0);
    const dAlto = Math.hypot(alto.x, alto.z);
    const dBaixo = Math.hypot(baixo.x, baixo.z);
    assert.ok(dBaixo > dAlto, 'low=' + dBaixo + ' devia ser maior que high=' + dAlto);
});
```

- [ ] **Step 2: Correr e confirmar que falha**

Run: `node --test tests/marcacao_posicional.test.js`
Expected: FAIL com `function escolherReferencia nao encontrada`.

- [ ] **Step 3: Acrescentar as constantes ao MarkingModel**

Em `js/config.js`, dentro de `MarkingModel`, logo a seguir a `coberturaBiasMax`, acrescenta:

```js
    /*
    MARCAÇÃO POSICIONAL — acompanhar, não roubar a bola.

    Ninguém tem um homem atribuído: cada jogador olha para o adversário mais
    perto do SEU SLOT e desloca-se na direcção dele, sem nunca sair mais do que
    o biasMaxPorSetor manda. Se o homem sai do raio, ele volta ao slot; a mesma
    referência pode ser largada por um e apanhada por outro.

    Isto não é o tackling (actTackle/actSlideTackle, em bt/player_bt.js), que
    continua a ser outro sistema e a decidir sozinho quando ir à bola.
    */
    raioSetor: 12.0,     // procura a referência a esta distância do SLOT

    /*
    Segundos a manter a decisão antes de reavaliar, nos dois sentidos: quem
    acompanha continua a acompanhar, quem está no slot fica no slot. Sem isto a
    referência trocava a cada frame com dois adversários a distância parecida, e
    o jogador oscilava entre os dois.
    */
    histerese: 3.0,

    /*
    A que distância se acompanha o homem, por Defensive Pressure. É este o novo
    significado do controlo do painel: era ele que mandava até onde o bloco
    subia (TeamShape.pressaoLineCap, removido), e isso passou para a
    Mentalidade.
    */
    distanciaPorPressao: { low: 4.5, balanced: 3.0, high: 1.5 },
```

- [ ] **Step 4: Escrever as duas funções puras**

Em `js/config.js`, imediatamente a seguir ao fecho do `MarkingModel` (a linha `};`), acrescenta:

```js
/*
Qual adversário este jogador acompanha: o mais próximo do SLOT dele, dentro do
raio. Devolve null se não houver nenhum lá dentro — nesse caso ele fica no slot.

Mede a partir do slot e não da posição actual de propósito. Da posição, isto
realimenta-se: ele desloca-se para o adversário, o que o aproxima de outros, que
passam a entrar no raio, e a referência foge em cadeia. O slot é o setor que o
bloco lhe deu, e esse não se move sozinho.

Pura: sem Match, sem Tatics, sem THREE (ver tests/marcacao_posicional.test.js).
*/
function escolherReferencia(slotX, slotZ, adversarios, raio) {
    if (!adversarios || !adversarios.length) return null;

    let melhor = null, melhorD2 = raio * raio;
    for (const o of adversarios) {
        // O guarda-redes não se acompanha: fica na baliza dele.
        if (!o || o.role === 'gk' || !o.model) continue;
        const dx = o.model.position.x - slotX;
        const dz = o.model.position.z - slotZ;
        const d2 = dx * dx + dz * dz;
        if (d2 < melhorD2) { melhorD2 = d2; melhor = o; }
    }
    return melhor;
}

/*
Onde este jogador se põe para acompanhar o homem: entre ele e a PRÓPRIA baliza,
a `distancia` metros dele, e nunca mais de `biasMax` fora do slot.

O limite é o que mantém a marcação dentro do setor — acompanha quem lhe entra na
zona, não sai a correr o campo atrás dele.

Pura: sem Match, sem Tatics, sem THREE.
*/
function pontoDeMarcacao(slotX, slotZ, alvoX, alvoZ, ownGoalZ, distancia, biasMax) {
    if (biasMax <= 0) return { x: slotX, z: slotZ };

    // Do homem para a própria baliza: é deste lado que se fica.
    let gx = 0 - alvoX;
    let gz = ownGoalZ - alvoZ;
    const gl = Math.hypot(gx, gz);
    if (gl > 0.0001) { gx /= gl; gz /= gl; } else { gx = 0; gz = 0; }

    const desejadoX = alvoX + gx * distancia;
    const desejadoZ = alvoZ + gz * distancia;

    // Desvio a partir do slot, cortado ao tecto.
    let dx = desejadoX - slotX;
    let dz = desejadoZ - slotZ;
    const d = Math.hypot(dx, dz);
    if (d > biasMax && d > 0.0001) {
        dx = (dx / d) * biasMax;
        dz = (dz / d) * biasMax;
    }

    return { x: slotX + dx, z: slotZ + dz };
}
```

- [ ] **Step 5: Correr os testes e confirmar que passam**

Run: `node --test tests/marcacao_posicional.test.js`
Expected: PASS, 18 testes.

- [ ] **Step 6: Verificar sintaxe**

Run: `node --check js/config.js`
Expected: sem saída, código de saída 0.

- [ ] **Step 7: Correr a suite toda**

Run: `node --test tests/*.test.js`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add js/config.js tests/marcacao_posicional.test.js
git commit -m "feat: add pure helpers for positional marking"
```

---

### Task 3: Ligar a marcação ao posicionamento

**Files:**
- Modify: `js/player.js:110` (estado da histerese no construtor)
- Modify: `js/bt/team_bt.js` (`aplicarMarcacaoPosicional` nova, e a chamada no `PosicionamentoAI.tick`)

**Interfaces:**
- Consumes: `escolherReferencia`, `pontoDeMarcacao`, `MarkingModel.raioSetor`, `.histerese`, `.distanciaPorPressao`, `.biasMaxPara` — todos da Task 2 ou já existentes.
- Produces: `aplicarMarcacaoPosicional(p, bb, targetX, targetZ) → { x, z }`, com a mesma forma de `aplicarEstiloPosicional`.

- [ ] **Step 1: Acrescentar o estado ao jogador**

Em `js/player.js`, a linha

```js
        this.markingTarget = null;
```

passa a

```js
        // markingTarget e o estado MARKING da FSM continuam mortos (ninguém os
        // escreve). A marcação posicional usa os dois campos abaixo e nunca
        // muda de estado na FSM — ver aplicarMarcacaoPosicional em team_bt.js.
        this.markingTarget = null;
        this.marcRef = null;      // adversário que está a acompanhar, ou null
        this.marcTimer = 0;       // segundos desde a última mudança de decisão
```

- [ ] **Step 2: Escrever a função de marcação**

Em `js/bt/team_bt.js`, imediatamente antes de `const PosicionamentoAI = {`, acrescenta:

```js
/*
MARCAÇÃO POSICIONAL — o desvio que faz o jogador acompanhar quem lhe entra no
setor. Corre depois do estilo inclinar o slot e antes do clamp do campo.

Não é tackling: isto só desloca o ALVO de posicionamento. Nunca muda o estado da
FSM, nunca manda ninguém à bola. Quem decide ir à bola continua a ser o chaser e
as folhas actTackle/actSlideTackle da árvore do jogador.

A decisão tem histerese de MarkingModel.histerese segundos, nos dois sentidos —
quem acompanha continua, quem está no slot fica — com duas saídas de emergência:
a referência afastar-se para lá de metade do raio, ou desaparecer do campo.
*/
function aplicarMarcacaoPosicional(p, bb, targetX, targetZ) {
    if (typeof MarkingModel === 'undefined' ||
        typeof escolherReferencia !== 'function') {
        return { x: targetX, z: targetZ };
    }

    const M = MarkingModel;
    const dt = (typeof Match !== 'undefined' && Match.delta) ? Match.delta : 0.016;
    const adversarios = (bb && bb.opp) ? bb.opp : [];

    p.marcTimer = (p.marcTimer || 0) + dt;

    // A referência ainda serve? Sai já se desapareceu do campo ou se fugiu do
    // setor — manter a decisão nesses casos era pior do que trocar.
    if (p.marcRef) {
        const vivo = adversarios.indexOf(p.marcRef) >= 0;
        const dx = p.marcRef.model.position.x - targetX;
        const dz = p.marcRef.model.position.z - targetZ;
        const fugiu = Math.hypot(dx, dz) > M.raioSetor * 1.5;
        if (!vivo || fugiu) { p.marcRef = null; p.marcTimer = 0; }
    }

    if (p.marcTimer >= M.histerese) {
        p.marcRef = escolherReferencia(targetX, targetZ, adversarios, M.raioSetor);
        p.marcTimer = 0;
    }

    if (!p.marcRef) return { x: targetX, z: targetZ };

    const distancia = M.distanciaPorPressao[Tatics.pressaoDefensiva]
        ?? M.distanciaPorPressao.balanced;
    const biasMax = M.biasMaxPara(targetZ * p.dirZ);
    const ownGoalZ = p.ownGoalZ;

    return pontoDeMarcacao(targetX, targetZ,
        p.marcRef.model.position.x, p.marcRef.model.position.z,
        ownGoalZ, distancia, biasMax);
}
```

- [ ] **Step 3: Chamar a função no PosicionamentoAI.tick**

Em `js/bt/team_bt.js`, dentro de `PosicionamentoAI.tick`, a linha

```js
        const tx = THREE.MathUtils.clamp(comEstilo.x, -32, 32);
        const tz = THREE.MathUtils.clamp(comEstilo.z, -50, 50);
```

passa a

```js
        // Quinto passo: acompanhar quem entra no setor. Depois do estilo, para
        // a marcação partir do slot que o estilo já inclinou.
        const comMarcacao = (typeof aplicarMarcacaoPosicional === 'function')
            ? aplicarMarcacaoPosicional(p, bb, comEstilo.x, comEstilo.z)
            : comEstilo;

        const tx = THREE.MathUtils.clamp(comMarcacao.x, -32, 32);
        const tz = THREE.MathUtils.clamp(comMarcacao.z, -50, 50);
```

- [ ] **Step 4: Confirmar que a marcação não mexe no debug do slot**

Run: `grep -n "slotTarget.set" js/bt/team_bt.js`

`p.slotTarget` é escrito antes do estilo e da marcação, e continua a ser o slot puro — o anel grande do debug não deve mudar de sítio. Confirma que a linha continua acima de `aplicarEstiloPosicional`.

- [ ] **Step 5: Confirmar que nada disto toca no tackling**

Run: `grep -rn "TACKLE\|actTackle\|actSlideTackle" js/bt/team_bt.js js/config.js`
Expected: nenhum resultado nestes dois ficheiros. O tackling vive em `js/bt/player_bt.js` e em `js/fsm.js`, e não foi tocado.

- [ ] **Step 6: Confirmar que o markingTarget continua morto**

Run: `grep -rn "markingTarget" js/ | grep -v "= null"`
Expected: só as leituras em `js/fsm.js` (estado `MARKING`, que ninguém activa) e o comentário em `js/bt/team_bt.js`. Nenhuma escrita nova.

- [ ] **Step 7: Verificar sintaxe**

Run: `node --check js/bt/team_bt.js && node --check js/player.js`
Expected: sem saída, código de saída 0.

- [ ] **Step 8: Correr a suite toda**

Run: `node --test tests/*.test.js`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add js/bt/team_bt.js js/player.js
git commit -m "feat: mark whoever enters the zone, within the block's shape"
```

---

### Task 4: Documentação e verificação no jogo

**Files:**
- Modify: `docs/filesSummary.md`

**Interfaces:**
- Consumes: tudo o que as Tasks 1 a 3 produziram.
- Produces: nada.

- [ ] **Step 1: Documentar**

Procura a entrada do `MarkingModel` (`grep -n "MarkingModel" docs/filesSummary.md`) e substitui-a por, ou acrescenta no formato dos vizinhos:

```markdown
- **`MarkingModel`** — **marcação posicional: acompanhar quem entra no setor.**
  Ninguém tem um homem atribuído. Cada jogador olha para o adversário mais perto
  do seu SLOT (`raioSetor`, 12 m) e desloca-se na direcção dele, parando à
  `distanciaPorPressao` do Defensive Pressure (`low` 4.5 / `balanced` 3.0 /
  `high` 1.5 m), sem nunca sair mais do que o `biasMaxPorSetor` manda (3 a 10 m,
  por terço do campo).
  - O raio mede-se do **slot**, não da posição actual: da posição, isto
    realimenta-se — ele aproxima-se do homem, entram outros no raio, e a
    referência foge em cadeia.
  - `histerese` (3 s) trava a decisão nos dois sentidos, com duas saídas: a
    referência fugir para lá de 1.5× o raio, ou sair de campo.
  - **Não é tackling.** Isto só desloca o alvo de posicionamento; nunca muda o
    estado da FSM nem manda ninguém à bola. Roubar a bola é `actTackle` /
    `actSlideTackle` (`bt/player_bt.js`), outro sistema.
  - `markingTarget` e o estado `MARKING` da FSM continuam **mortos** — foram
    apagados com o antigo nível 2 e a marcação posicional não os usa.
- **`MentalidadeModel`** — `blocoZ` desloca o centro do bloco em relação à bola;
  `tectoBloco` é o mais longe que esse centro chega, medido do meio-campo
  (−17.7 / −8.8 / **0** / +17.7 / +35.3). Com Equilibrada o bloco **não passa do
  meio-campo**. O tecto era do Defensive Pressure (`TeamShape.pressaoLineCap`,
  removido), e por isso a Mentalidade não tinha palavra nenhuma sobre até onde a
  equipa subia.
```

- [ ] **Step 2: Commit da documentação**

```bash
git add docs/filesSummary.md
git commit -m "docs: describe positional marking and the mentality block ceiling"
```

- [ ] **Step 3: Arrancar o servidor**

Run: `npm run dev`
Abre o endereço que ele imprime e carrega em Continue — o jogo abre em pausa de propósito.

- [ ] **Step 4: Confirmar o bloco médio com Equilibrada**

Com a Mentalidade em Equilibrada (o valor por omissão), liga o **Team BT POS** no painel e observa o rectângulo da equipa sem bola. Com a bola no meio-campo adversário, o centro do rectângulo não deve passar da linha do meio-campo. Era este o pedido.

- [ ] **Step 5: Comparar as mentalidades**

Passa a Mentalidade para Muito Defensiva e depois para Muito Ofensiva, com a bola no mesmo sítio. O rectângulo deve descer até ao terço defensivo e subir até dois terços do campo de ataque. Se não mudar nada, o `computeBlock` não está a ler o `tectoBloco`.

- [ ] **Step 6: Ver a marcação a acontecer**

Observa a equipa sem bola. Os jogadores devem sair um pouco do slot em direcção aos adversários que lhes passam perto, e voltar quando eles se afastam — sem nunca atravessar o campo atrás de ninguém.

- [ ] **Step 7: Comparar os níveis de Defensive Pressure**

Passa o Defensive Pressure de Low para High. Em High os marcadores devem colar-se bem mais (1.5 m contra 4.5 m). Repara que a forma do bloco **não** deve mudar com este controlo — quem manda na forma é agora a Mentalidade.

- [ ] **Step 8: Confirmar que ninguém vibra entre dois homens**

Procura uma zona com dois adversários próximos. O jogador deve escolher um e ficar com ele uns segundos, em vez de oscilar. Se vibrar, a histerese não está a correr: verifica que `p.marcTimer` está a ser somado com o `Match.delta` e não reposto a cada frame.

- [ ] **Step 9: Confirmar que o desarme continua a funcionar**

Ao longo de alguns minutos, confirma que continua a haver desarmes e carrinhos. Marcação e tackling são sistemas separados; se os desarmes desapareceram, alguma coisa neste trabalho tocou onde não devia.
