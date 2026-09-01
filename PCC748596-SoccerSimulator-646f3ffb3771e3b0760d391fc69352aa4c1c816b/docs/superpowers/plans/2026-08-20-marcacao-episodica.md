# Marcação episódica — o encargo tem prazo, e o painel manda mesmo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a marcação ser um encargo temporário de poucos jogadores, em vez de um viés posicional permanente de dois terços da equipa — para que exista bloco, e para que os três valores do Defensive Pressure se vejam em campo.

**Architecture:** Três mudanças na mesma camada. A elegibilidade passa a exigir estado de equipa defensivo e ausência de outra função. O encargo ganha prazo (do Defensive Pressure) e arrefecimento, findo o qual o jogador larga e volta ao slot do TeamBT. E, como passam a ser poucos e por pouco tempo, o tecto que estrangulava o desvio (`biasMax`) deixa de precisar de o cortar — é isso que faz os 4.5/3.0/1.5 m chegarem ao campo.

**Tech Stack:** JavaScript de browser em scripts clássicos (sem módulos ES, sem build). Testes com `node --test` + `vm` sandbox sobre a função recortada. Medição de comportamento com o harness headless (`tests/headless.js`, jsdom + three).

## Global Constraints

- **Scripts clássicos, scope global.** Nada de `import`/`export`.
- **Comentários e nomes em português**, como o resto do repositório. Explicam o PORQUÊ e o que já se tentou antes, não o quê.
- **A física da bola não se toca.** `BallPhysics` é território proibido neste plano.
- **Correr os testes com:** `node --test "tests/*.test.js"` — o glob com aspas é obrigatório neste Git Bash; `node --test tests/` falha.
- **Aleatoriedade injectada nas funções puras**, nunca embutida.
- **Duas corridas antes de acreditar num número**, com 10 sementes no mínimo, e o desvio vai sempre no relatório. Um efeito que muda de sinal entre corridas não é efeito.
- **A/B no mesmo binário:** ligar/desligar por constante em runtime, nunca comparar duas versões do ficheiro.
- **A divisão de responsabilidades que este plano respeita:** a **Mentalidade** manda no bloco (TeamBT); o **Defensive Pressure** manda na marcação — distância, tempo de reacção e agora também duração do encargo.

## Estado medido antes de começar

Números de referência, 4 sementes × 30 s, para as tarefas poderem provar que mudaram alguma coisa:

```
jogadores com marcação atribuída:   6.41 a 6.82 de 10, em permanência
distância REAL ao homem marcado:    low 9.03 ± 5.95 | balanced 8.89 ± 6.01 | high 8.05 ± 5.72 m
                                    (o painel pede 4.5 / 3.0 / 1.5)
estados da FSM:                     MOVE_TO_POS 99-100%, tudo o resto ~0%
centro do bloco (avanço):           defensiva 0.18 ± 20.84 | ofensiva 6.20 ± 15.58 m
```

## Ficheiros e responsabilidades

| Ficheiro | O que muda |
|---|---|
| `js/config.js` | `MarkingModel` ganha `duracaoPorPressao` e `arrefecimento`; comentário do `histerese` corrigido |
| `js/bt/team_bt.js` | `atribuirMarcacoesDaEquipa` passa a filtrar por estado e função, e a gerir prazo/arrefecimento; `aplicarMarcacaoPosicional` deixa de estrangular o desvio |
| `tests/marcacao_episodica.test.js` | novo, puro: elegibilidade e ciclo de vida do encargo |
| `tests/marcacao_bloco.test.js` | novo, headless: quantos marcam, a que distância, e o bloco aguenta |

---

### Task 1: Elegibilidade — quem pode marcar

Hoje qualquer jogador de campo com `postoBase` entra no leilão, em qualquer fase do jogo. Daí os ~6.7 de 10 permanentes, e daí não haver ninguém a segurar a forma.

Regra pedida: **só defesas, só sem outra função, e só com a equipa em estado defensivo.**

**Files:**
- Create: `tests/marcacao_episodica.test.js`
- Modify: `js/bt/team_bt.js` (`atribuirMarcacoesDaEquipa`, o laço que monta `candidatos`)

**Interfaces:**
- Produces: `podeMarcar(p, bb, match)` em `js/bt/team_bt.js` → `true`/`false`. Função pura em relação a `Match`: recebe o que precisa por argumento (`match`) para o teste a poder correr sem jogo.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/marcacao_episodica.test.js
/*
Elegibilidade e ciclo de vida do encargo de marcacao.

Medido antes disto: 6.41 a 6.82 de 10 jogadores com marcacao atribuida EM
PERMANENCIA. Com dois tercos da equipa agarrados a alguem o tempo todo nao
sobra ninguem para segurar a forma — e e por isso que o bloco medio/baixo
nao existe e o marcador acaba a 9 m do homem (o biasMax corta-lhe o desvio,
porque sem cortar a formacao desfazia-se).

Regra pedida: so defesas, so sem outra funcao, e so com a equipa em estado
defensivo (T.Defensive ou Defensive).
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
    vm.runInContext(
        'const TeamState = { OFFENSIVE: "Offensive", DEFENSIVE: "Defensive",' +
        ' TRANSITION_OFFENSIVE: "T.Offensive", TRANSITION_DEFENSIVE: "T.Defensive" };\n' +
        recortarFuncao(TEAM, 'podeMarcar') +
        '\nthis.podeMarcar = podeMarcar; this.TeamState = TeamState;', sandbox);
    return sandbox;
}

const jogador = (extra) => Object.assign({
    role: 'def', pos: 'CB', postoBase: { x: 0, z: -20 }
}, extra || {});

const bb = (estado, extra) => Object.assign({
    state: estado, chaser: null, supportMid: null
}, extra || {});

const match = (extra) => Object.assign({ intendedReceiver: null }, extra || {});

test('um defesa sem função marca, com a equipa a defender', () => {
    const s = montar();
    assert.strictEqual(s.podeMarcar(jogador(), bb(s.TeamState.DEFENSIVE), match()), true);
    assert.strictEqual(s.podeMarcar(jogador(), bb(s.TeamState.TRANSITION_DEFENSIVE), match()), true);
});

test('com a equipa a atacar, ninguém marca', () => {
    const s = montar();
    assert.strictEqual(s.podeMarcar(jogador(), bb(s.TeamState.OFFENSIVE), match()), false);
    assert.strictEqual(s.podeMarcar(jogador(), bb(s.TeamState.TRANSITION_OFFENSIVE), match()), false);
});

test('quem não é defesa não marca', () => {
    const s = montar();
    for (const role of ['mid', 'atk', 'gk']) {
        assert.strictEqual(
            s.podeMarcar(jogador({ role: role }), bb(s.TeamState.DEFENSIVE), match()), false,
            role + ' nao devia marcar');
    }
});

test('quem tem outra função não marca', () => {
    const s = montar();
    const p = jogador();

    assert.strictEqual(s.podeMarcar(p, bb(s.TeamState.DEFENSIVE, { chaser: p }), match()), false,
        'o 1o defensor vai a bola, nao marca');
    assert.strictEqual(s.podeMarcar(p, bb(s.TeamState.DEFENSIVE, { supportMid: p }), match()), false,
        'quem da apoio na construcao nao marca');
    assert.strictEqual(s.podeMarcar(p, bb(s.TeamState.DEFENSIVE), match({ intendedReceiver: p })), false,
        'quem vai receber a bola nao marca');
});

test('sem posto base ainda não há de onde marcar', () => {
    const s = montar();
    assert.strictEqual(
        s.podeMarcar(jogador({ postoBase: null }), bb(s.TeamState.DEFENSIVE), match()), false);
});

test('um estado desconhecido não deixa marcar', () => {
    const s = montar();
    assert.strictEqual(s.podeMarcar(jogador(), bb('QualquerCoisa'), match()), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/marcacao_episodica.test.js`
Expected: FAIL com `function podeMarcar nao encontrada`.

- [ ] **Step 3: Write the implementation**

Em `js/bt/team_bt.js`, imediatamente antes de `function atribuirMarcacoesDaEquipa(`:

```javascript
/*
Quem pode marcar. Tres condicoes, todas pedidas explicitamente:

  defesa          so a ultima linha acompanha homem. Um medio a largar a
                  zona atras de alguem e o que abria os buracos por onde a
                  jogada passava.
  sem funcao      o 1o defensor (chaser) vai a bola, o supportMid da a
                  saida, o destinatario do passe vai receber — esses ja tem
                  tarefa, e marcar seria uma segunda.
  a defender      so em T.Defensive e Defensive. Com a bola na equipa nao ha
                  homem para acompanhar; a forma e que manda.

Medido antes desta porta existir: 6.41 a 6.82 de 10 jogadores com marcacao
atribuida em permanencia, em qualquer fase do jogo. Nao sobrava ninguem para
segurar o bloco.

Pura em relacao ao Match: recebe-o por argumento para o teste a poder correr
sem jogo montado.
*/
function podeMarcar(p, bb, match) {
    if (!p || !bb) return false;
    if (p.role !== 'def') return false;
    if (!p.postoBase) return false;

    const aDefender = (bb.state === TeamState.DEFENSIVE ||
                       bb.state === TeamState.TRANSITION_DEFENSIVE);
    if (!aDefender) return false;

    if (bb.chaser === p) return false;
    if (bb.supportMid === p) return false;
    if (match && match.intendedReceiver === p) return false;

    return true;
}
```

E no laço que monta `candidatos` dentro de `atribuirMarcacoesDaEquipa`, substituir as duas guardas actuais

```javascript
        if (!p || p.role === 'gk' || !p.postoBase) continue;
        if (portador && p === portador) continue;
        // Quem vai receber a bola tem tarefa; oferecer-se e para os outros.
        if (typeof Match !== 'undefined' && Match.intendedReceiver === p) continue;
```

por

```javascript
        if (!podeMarcar(p, bb, (typeof Match !== 'undefined') ? Match : null)) continue;
        if (portador && p === portador) continue;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/marcacao_episodica.test.js`
Expected: PASS, 6 testes.

- [ ] **Step 5: Correr a suite toda**

Run: `node --test "tests/*.test.js"`
Expected: todos passam. Se `tests/marcacao_exclusiva.test.js` ou `tests/marcacao_posicional.test.js` falharem, ler a falha: podem estar a assumir que qualquer jogador é candidato. Reportar antes de mexer.

- [ ] **Step 6: Commit**

```bash
git add js/bt/team_bt.js tests/marcacao_episodica.test.js
git commit -m "feat: so defesas sem funcao marcam, e so a defender"
```

---

### Task 2: O encargo tem prazo, e o prazo vem do painel

Hoje o `MarkingModel.histerese` (3 s) é **anti-oscilação**, não compromisso: a cada 3 s há um leilão que **reatribui** os homens. Ninguém larga — só troca de homem. O comentário no `config.js` di-lo: *"quem acompanha continua a acompanhar, quem está no slot fica no slot"*.

O que se quer é outra coisa: marcar durante N segundos e **voltar** ao TeamBT/PlayingStyleBT, com um arrefecimento antes de poder voltar a pegar alguém. E o N vem do Defensive Pressure.

**Files:**
- Modify: `js/config.js` (`MarkingModel`: novos campos e comentário corrigido)
- Modify: `js/bt/team_bt.js` (`atribuirMarcacoesDaEquipa`)
- Test: `tests/marcacao_episodica.test.js` (acrescentar)

**Interfaces:**
- Consumes: `podeMarcar(p, bb, match)` (Task 1).
- Produces: `MarkingModel.duracaoPorPressao` = `{ low: 2.0, balanced: 3.5, high: 5.0 }` e `MarkingModel.arrefecimento` = `1.5`.
- Produces: `cicloDeMarcacao(estado, dt, opcoes)` em `js/bt/team_bt.js` — função pura que avança o relógio de um encargo e diz o que fazer.
  `estado` = `{ marcRef, marcTimer, marcCooldown }`, mutado no lugar.
  `opcoes` = `{ duracao, arrefecimento, referenciaValida }` (`referenciaValida` é um booleano: o homem ainda existe e ainda está no sector).
  Devolve `'mantem'`, `'larga'` ou `'livre'`.

- [ ] **Step 1: Write the failing test**

Acrescentar ao fim de `tests/marcacao_episodica.test.js`:

```javascript

/* ------------------------------------------------------------------
   Ciclo de vida do encargo: agarra, aguenta o prazo, larga, arrefece.
   ------------------------------------------------------------------ */

function montarCiclo() {
    const sandbox = { Math: Math };
    vm.createContext(sandbox);
    vm.runInContext(recortarFuncao(TEAM, 'cicloDeMarcacao') +
        '\nthis.ciclo = cicloDeMarcacao;', sandbox);
    return sandbox.ciclo;
}

const HOMEM = { id: 7 };
const estadoNovo = () => ({ marcRef: null, marcTimer: 0, marcCooldown: 0 });
const opts = (extra) => Object.assign({
    duracao: 3.5, arrefecimento: 1.5, referenciaValida: true
}, extra || {});

// Corre o ciclo N segundos e devolve a sequencia de veredictos.
function correr(ciclo, estado, segundos, o) {
    const dt = 1 / 60;
    const saida = [];
    for (let t = 0; t < segundos; t += dt) saida.push(ciclo(estado, dt, o));
    return saida;
}

test('sem homem agarrado, o veredicto é "livre"', () => {
    const ciclo = montarCiclo();
    assert.strictEqual(ciclo(estadoNovo(), 1 / 60, opts()), 'livre');
});

test('com homem agarrado, mantém-se dentro do prazo', () => {
    const ciclo = montarCiclo();
    const est = estadoNovo();
    est.marcRef = HOMEM;
    const r = correr(ciclo, est, 3.0, opts({ duracao: 3.5 }));
    assert.ok(r.every(v => v === 'mantem'), 'largou antes do prazo');
    assert.strictEqual(est.marcRef, HOMEM);
});

test('passado o prazo, larga', () => {
    const ciclo = montarCiclo();
    const est = estadoNovo();
    est.marcRef = HOMEM;
    const r = correr(ciclo, est, 5.0, opts({ duracao: 3.5 }));
    assert.ok(r.includes('larga'), 'nunca largou');
    assert.strictEqual(est.marcRef, null, 'largou mas ficou com a referencia');
});

test('depois de largar, arrefece antes de poder voltar a marcar', () => {
    const ciclo = montarCiclo();
    const est = estadoNovo();
    est.marcRef = HOMEM;
    correr(ciclo, est, 3.6, opts({ duracao: 3.5, arrefecimento: 1.5 }));
    assert.ok(est.marcCooldown > 0, 'nao arrefeceu');

    // Enquanto arrefece nao volta a estar livre para pegar em ninguem.
    const durante = correr(ciclo, est, 1.0, opts({ arrefecimento: 1.5 }));
    assert.ok(durante.every(v => v === 'arrefece'), 'aceitou marcar durante o arrefecimento');

    const depois = correr(ciclo, est, 1.0, opts({ arrefecimento: 1.5 }));
    assert.strictEqual(depois[depois.length - 1], 'livre', 'nunca voltou a ficar livre');
});

test('referência inválida larga já, sem esperar o prazo', () => {
    const ciclo = montarCiclo();
    const est = estadoNovo();
    est.marcRef = HOMEM;
    const v = ciclo(est, 1 / 60, opts({ referenciaValida: false }));
    assert.strictEqual(v, 'larga');
    assert.strictEqual(est.marcRef, null);
});

test('mais Defensive Pressure, mais tempo agarrado ao homem', () => {
    const ciclo = montarCiclo();
    const aguenta = (duracao) => {
        const est = estadoNovo();
        est.marcRef = HOMEM;
        let t = 0;
        const dt = 1 / 60;
        while (t < 10 && ciclo(est, dt, opts({ duracao: duracao })) === 'mantem') t += dt;
        return t;
    };
    assert.ok(aguenta(5.0) > aguenta(3.5), 'high devia aguentar mais que balanced');
    assert.ok(aguenta(3.5) > aguenta(2.0), 'balanced devia aguentar mais que low');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/marcacao_episodica.test.js`
Expected: FAIL com `function cicloDeMarcacao nao encontrada`.

- [ ] **Step 3: Acrescentar as constantes**

Em `js/config.js`, dentro do `MarkingModel`, substituir o bloco do `histerese` por:

```javascript
    /*
    Segundos a manter a decisao antes de reavaliar QUEM se acompanha. Isto e
    anti-oscilacao: sem ele a referencia trocava a cada frame com dois
    adversarios a distancia parecida.

    NAO e o prazo do encargo — esse e o duracaoPorPressao logo abaixo. Os
    dois foram confundidos: o `histerese` sozinho mantinha toda a gente a
    marcar para sempre, trocando de homem de 3 em 3 segundos, e media-se
    6.41 a 6.82 de 10 jogadores com marcacao atribuida em permanencia.
    */
    histerese: 3.0,

    /*
    Quanto tempo se acompanha um homem antes de LARGAR e voltar ao slot do
    TeamBT. E o segundo significado do Defensive Pressure — o painel manda na
    distancia (distanciaPorPressao), no tempo de reaccao
    (DefensivePressureModel) e agora na duracao do encargo.

    Mais pressao, mais tempo agarrado ao homem. Com pressao baixa larga-se
    depressa e volta-se a forma.
    */
    duracaoPorPressao: { low: 2.0, balanced: 3.5, high: 5.0 },

    /*
    Segundos que um jogador fica sem poder voltar a marcar depois de largar.
    Sem isto ele largava e voltava a agarrar o mesmo homem no frame seguinte,
    e o prazo nao valia nada.
    */
    arrefecimento: 1.5,
```

- [ ] **Step 4: Escrever a função do ciclo**

Em `js/bt/team_bt.js`, imediatamente antes de `function atribuirMarcacoesDaEquipa(`:

```javascript
/*
Um passo do relogio de um encargo de marcacao. Muta `estado` no lugar e diz
o que fazer com ele:

    'mantem'    continua agarrado ao homem
    'larga'     acabou (prazo cumprido, ou a referencia deixou de servir):
                a referencia foi limpa e o arrefecimento arrancou
    'arrefece'  largou ha pouco, ainda nao pode pegar em ninguem
    'livre'     sem homem e sem arrefecimento: pode entrar no leilao

O encargo TEM DE ACABAR. Antes disto a marcacao era um vies posicional
permanente: o jogador nunca largava, so trocava de homem de 3 em 3 segundos
(MarkingModel.histerese), e dois tercos da equipa estavam sempre agarrados a
alguem. Sem ninguem a segurar a forma, nao havia bloco — e o desvio da
marcacao tinha de ser estrangulado pelo biasMax para a formacao nao se
desfazer, o que punha o marcador a 9 m do homem quando o painel pedia 1.5.

Pura: sem Match, sem Tatics, sem THREE.
*/
function cicloDeMarcacao(estado, dt, o) {
    if (estado.marcRef) {
        estado.marcTimer += dt;

        const expirou = estado.marcTimer >= o.duracao;
        if (expirou || !o.referenciaValida) {
            estado.marcRef = null;
            estado.marcTimer = 0;
            estado.marcCooldown = o.arrefecimento;
            return 'larga';
        }
        return 'mantem';
    }

    if (estado.marcCooldown > 0) {
        estado.marcCooldown = Math.max(0, estado.marcCooldown - dt);
        if (estado.marcCooldown > 0) return 'arrefece';
    }

    return 'livre';
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/marcacao_episodica.test.js`
Expected: PASS, 12 testes.

- [ ] **Step 6: Ligar o ciclo à atribuição**

Em `js/bt/team_bt.js`, dentro de `atribuirMarcacoesDaEquipa`, substituir o bloco que hoje faz a validação da referência e monta o `marcadores` (desde `p.marcTimer = (p.marcTimer || 0) + dt;` até ao `marcadores.push({...})`) por:

```javascript
        /*
        O relogio do encargo corre PRIMEIRO: quem expirou larga aqui e nao
        chega a entrar no leilao deste frame. Ver cicloDeMarcacao.
        */
        const dur = M.duracaoPorPressao[Tatics.pressaoDefensiva] ?? M.duracaoPorPressao.balanced;

        let referenciaValida = false;
        if (p.marcRef) {
            const vivo = adversarios.indexOf(p.marcRef) >= 0;
            const dx = p.marcRef.model.position.x - p.postoBase.x;
            const dz = p.marcRef.model.position.z - p.postoBase.z;
            referenciaValida = vivo && Math.hypot(dx, dz) <= M.raioSetor * 1.5;
        }

        const veredicto = cicloDeMarcacao(p, dt, {
            duracao: dur,
            arrefecimento: M.arrefecimento,
            referenciaValida: referenciaValida
        });

        if (veredicto === 'larga' || veredicto === 'arrefece') continue;

        jogadores.push(p);
        marcadores.push({
            x: p.postoBase.x,
            z: p.postoBase.z,
            manter: (veredicto === 'mantem'),
            ref: p.marcRef
        });
```

**Nota:** `cicloDeMarcacao` usa `p.marcTimer` e `p.marcCooldown` directamente no jogador — os dois já existem ou são criados aqui. Confirmar que `marcCooldown` é inicializado a `0` no construtor do `FootballPlayer` (`js/player.js`, ao lado de `marcTimer`), acrescentando-o se não estiver.

E a seguir ao leilão, onde hoje se faz `if (!marcadores[i].manter) p.marcTimer = 0;`, substituir por:

```javascript
    for (let i = 0; i < jogadores.length; i++) {
        const p = jogadores[i];
        const antes = p.marcRef;
        p.marcRef = escolha[i];
        // Encargo NOVO: o relogio do prazo comeca agora.
        if (p.marcRef && p.marcRef !== antes) p.marcTimer = 0;
    }
```

- [ ] **Step 7: Correr a suite toda**

Run: `node --test "tests/*.test.js"`
Expected: todos passam.

- [ ] **Step 8: Commit**

```bash
git add js/config.js js/bt/team_bt.js js/player.js tests/marcacao_episodica.test.js
git commit -m "feat: a marcacao passa a ter prazo, vindo do Defensive Pressure"
```

---

### Task 3: Deixar a marcação chegar ao homem

Com poucos marcadores e por pouco tempo, o tecto que estrangulava o desvio deixa de ser necessário — e é ele que hoje põe o marcador a 9 m do homem quando o painel pede 1.5.

O `biasMax` não desaparece: passa a ser um limite generoso (o raio do sector), e o `× 0.3` dos centrais sai, porque a razão dele era impedir que a última linha se desfizesse — coisa que agora o prazo e o número já garantem.

**Files:**
- Modify: `js/bt/team_bt.js` (`aplicarMarcacaoPosicional`)
- Test: `tests/marcacao_bloco.test.js` (novo, headless)

**Interfaces:**
- Consumes: `podeMarcar` (Task 1), `cicloDeMarcacao` (Task 2).

- [ ] **Step 1: Write the failing test**

```javascript
// tests/marcacao_bloco.test.js
/*
A marcacao em jogo: poucos, por pouco tempo, e a distancia que o painel pede.

Medido ANTES deste plano, 4 sementes x 30 s:
    jogadores com marcacao:   6.41 a 6.82 de 10, em permanencia
    distancia REAL ao homem:  low 9.03 | balanced 8.89 | high 8.05 m
    (o painel pede             low 4.5  | balanced 3.0  | high 1.5)

Tres metros de amplitude no pedido viravam um metro em campo, dentro de um
desvio de seis: o pontoDeMarcacao calculava o ponto certo e o biasMax
cortava-o a seguir.
*/
const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const { ctx, novoJogo } = require('./headless.js');

function medir(pressao) {
    return vm.runInContext(`
        (function () {
            let _s = 20260820 >>> 0;
            Math.random = function () { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967296; };

            Tatics.estilo = 'balanceado';
            Tatics.pressaoDefensiva = '${pressao}';
            Match.resetPlay(true);
            for (let i = 0; i < 240; i++) Match.update(0.016);

            const dists = [], quantos = [], naoDefesas = [];
            let comMarcacaoAAtacar = 0, framesAAtacar = 0;

            for (let i = 0; i < 1800; i++) {
                Match.update(0.016);
                for (const eq of [['TeamA', Match.players], ['TeamB', Match.opponents]]) {
                    const bb = TeamAI.get(eq[0]);
                    let n = 0;
                    for (const p of eq[1]) {
                        if (p.role === 'gk') continue;
                        if (!p.marcRef) continue;
                        n++;
                        dists.push(p.model.position.distanceTo(p.marcRef.model.position));
                        if (p.role !== 'def') naoDefesas.push(p.pos);
                    }
                    quantos.push(n);
                    if (bb.isAttacking) {
                        framesAAtacar++;
                        if (n > 0) comMarcacaoAAtacar++;
                    }
                }
            }
            const media = (v) => v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
            return {
                distMedia: media(dists),
                quantosMedia: media(quantos),
                naoDefesas: naoDefesas.length,
                aAtacarComMarcacao: framesAAtacar ? 100 * comMarcacaoAAtacar / framesAAtacar : 0,
                amostras: dists.length
            };
        })();
    `, ctx);
}

test('a equipa que ataca não marca ninguém', () => {
    novoJogo();
    const r = medir('balanced');
    assert.strictEqual(r.aAtacarComMarcacao, 0,
        'com a bola, ' + r.aAtacarComMarcacao.toFixed(0) + '% dos frames tinham marcacao atribuida');
});

test('só defesas marcam', () => {
    novoJogo();
    const r = medir('balanced');
    assert.strictEqual(r.naoDefesas, 0, r.naoDefesas + ' amostras de nao-defesas a marcar');
});

test('marcam poucos de cada vez', () => {
    novoJogo();
    const r = medir('balanced');
    assert.ok(r.quantosMedia < 3.0,
        'media de ' + r.quantosMedia.toFixed(2) + ' marcadores por equipa (antes: 6.4 a 6.8)');
});

test('o Defensive Pressure decide a distância ao homem', () => {
    novoJogo();
    const alto = medir('high').distMedia;
    novoJogo();
    const baixo = medir('low').distMedia;

    assert.ok(alto < baixo - 1.0,
        'high=' + alto.toFixed(2) + ' m, low=' + baixo.toFixed(2) + ' m — o painel nao se ve em campo');
    assert.ok(alto < 4.0,
        'com high o marcador fica a ' + alto.toFixed(2) + ' m (o painel pede 1.5)');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/marcacao_bloco.test.js`
Expected: FAIL no teste da distância (o `biasMax` ainda estrangula), e possivelmente nos outros se as Tasks 1 e 2 não estiverem feitas.

- [ ] **Step 3: Alargar o tecto**

Em `js/bt/team_bt.js`, na `aplicarMarcacaoPosicional`, substituir

```javascript
    let biasMax = M.biasMaxPara(targetZ * p.dirZ);
    if (p.pos === 'CB') biasMax *= 0.3;
```

por

```javascript
    /*
    O tecto do desvio deixou de estrangular a distancia pedida.

    Media antes: o painel pedia 4.5/3.0/1.5 m e o marcador ficava a
    9.03/8.89/8.05 — tres metros de amplitude no pedido viravam um em campo.
    O pontoDeMarcacao calculava o ponto certo e este tecto cortava-o logo a
    seguir, porque com dois tercos da equipa a marcar em permanencia era ele
    que impedia a formacao de se desfazer.

    Com o encargo limitado a defesas sem funcao (podeMarcar) e com prazo
    (cicloDeMarcacao), essa defesa deixou de ser necessaria: sao poucos, e
    voltam. O tecto passa a ser o raio do sector — o marcador vai onde
    precisa DENTRO da zona dele, e o `x 0.3` dos centrais sai, que era a
    parte mais apertada de todas.
    */
    const biasMax = M.raioSetor;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/marcacao_bloco.test.js`
Expected: PASS, 4 testes.

Se o teste da distância continuar a falhar, **não alargar mais o tecto às cegas**: instrumentar `pontoDeMarcacao` para imprimir o ponto pedido e o ponto devolvido num caso concreto, e reportar onde os dois divergem. Pode haver um segundo corte a jusante (o clamp de `±32` no `tickFinal`, ou o alisamento do `PositionSmoothing`).

- [ ] **Step 5: Correr a suite toda, várias vezes**

Run: `node --test "tests/*.test.js"` — correr **cinco vezes**.
Expected: todos passam, nas cinco. Testes de comportamento neste repositório já se revelaram intermitentes; uma corrida verde não chega.

- [ ] **Step 6: Commit**

```bash
git add js/bt/team_bt.js tests/marcacao_bloco.test.js
git commit -m "fix: deixar a marcacao chegar a distancia que o painel pede"
```

---

### Task 4: Medir o bloco, que é a queixa original

As três tarefas anteriores mexem na marcação. A queixa que as motivou é outra: *"não conseguem manter bloco médio/baixo"* e *"não sabem acompanhar as jogadas"*. Esta tarefa mede se aconteceu — e regista o resultado seja ele qual for.

**Files:**
- Modify: `docs/filesSummary.md` (entrada nova)
- Nenhum ficheiro de código. Se a medição disser que o bloco não melhorou, isso é um resultado a registar, não um bug a esconder.

**Interfaces:**
- Consumes: tudo o que as Tasks 1-3 entregaram.

- [ ] **Step 1: Escrever o script de medição**

Criar `_diag_bloco.js` na raiz (temporário — apagado no fim):

```javascript
const { ctx, novoJogo } = require('./tests/headless.js');
const vm = require('vm');
novoJogo();
console.log(vm.runInContext(`
(function () {
    const est = (v) => {
        const m = v.reduce((a, b) => a + b, 0) / v.length;
        const dp = Math.sqrt(v.reduce((a, b) => a + (b - m) * (b - m), 0) / v.length);
        return m.toFixed(2) + ' +/- ' + dp.toFixed(2);
    };
    const linhas = [];
    for (const mentalidade of ['muito_defensiva', 'balanceado', 'muito_ofensiva']) {
        Tatics.estilo = mentalidade;
        Tatics.pressaoDefensiva = 'balanced';
        const centro = [], largura = [], perto6 = [], marcadores = [];
        for (let seed = 0; seed < 10; seed++) {
            let s = (2000 + seed * 7919) >>> 0;
            Math.random = function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
            Match.resetPlay(true);
            for (let i = 0; i < 240; i++) Match.update(0.016);
            for (let i = 0; i < 1800; i++) {
                Match.update(0.016);
                const c = Match.ballCarrier;
                if (!c) continue;
                const defensores = (c.team === 'TeamA') ? Match.opponents : Match.players;
                const bb = TeamAI.get(defensores[0].team);
                if (bb.bloco) {
                    centro.push(((bb.bloco.z0 + bb.bloco.z1) / 2) * bb.dir);
                    const xs = defensores.filter(p => p.role !== 'gk').map(p => p.model.position.x);
                    largura.push(Math.max(...xs) - Math.min(...xs));
                }
                let n6 = 0, nm = 0;
                for (const d of defensores) {
                    if (d.role === 'gk') continue;
                    if (d.model.position.distanceTo(c.model.position) < 6) n6++;
                    if (d.marcRef) nm++;
                }
                perto6.push(n6);
                marcadores.push(nm);
            }
        }
        linhas.push(mentalidade.padEnd(16) +
            ' centro do bloco ' + est(centro) + ' m' +
            ' | largura ' + est(largura) + ' m' +
            ' | defesas a <6m do portador ' + est(perto6) +
            ' | marcadores ' + est(marcadores));
    }
    return linhas.join(String.fromCharCode(10));
})();
`, ctx));
```

- [ ] **Step 2: Correr, duas vezes**

Run: `node _diag_bloco.js` — duas vezes.

Referência do estado ANTES deste plano (4 sementes, mesma métrica):

```
muito_defensiva   centro 0.18 +/- 20.84 m   | defesas a <6m 1.20 +/- 0.96
balanceado        centro 1.74 +/- 12.19 m   | defesas a <6m 1.56 +/- 0.93
muito_ofensiva    centro 6.20 +/- 15.58 m   | defesas a <6m 1.30 +/- 0.93
marcadores: 6.41 a 6.82 de 10, em permanencia
```

O que se quer ver mexer, por ordem de importância:

1. **marcadores** — de ~6.7 para menos de 3;
2. **desvio do centro do bloco** — os ±12 a ±20 m são o "não acompanha as jogadas": um bloco que oscila 20 m não é um bloco. Se o desvio não descer, dizer isso.
3. **defesas a <6m do portador** — se descer, é o "sempre alguém perseguindo" a ceder.

- [ ] **Step 3: Documentar, incluindo o que não melhorou**

Acrescentar ao topo da secção "Últimas Actualizações" do `docs/filesSummary.md` uma entrada com: o que mudou nas três tarefas, os valores do `MarkingModel` novos, e a tabela antes/depois das duas corridas. **Se o desvio do centro do bloco não tiver descido, escrever isso explicitamente** e mover a linha correspondente da secção "Problemas conhecidos" em vez de a apagar.

Apagar o script: `rm _diag_bloco.js`.

- [ ] **Step 4: Commit**

```bash
git add docs/filesSummary.md
git commit -m "docs: medicao do bloco depois da marcacao episodica"
```

---

## Fora de âmbito

O que esta queixa destapou e este plano **não** resolve:

- **Não há alívio.** O estado `CLEARANCE` não aparece uma única vez em 4 sementes × 40 s; o `actClearance` existe mas a condição que lhe dá acesso (`underPressure || decisionTimer > 1.2`) nunca ganha aos ramos acima.
- **Não há tackling.** O `TacklingModel` não existe no `config.js`; `actTackle`/`actSlideTackle` são execução à espera de quem os dispare.
- **Não há 2º defensor.** O `isCovering` é lido pela FSM para o estado `BLOCKING` e escrito por ninguém.
- **A intensidade é sempre máxima.** 48% do jogo acima de 5.5 m/s, velocidade média 4.94 m/s — com stamina ligada ninguém acaba o jogo. Falta velocidade como decisão (parar / andar / trotar / sprintar); é a peça que torna um bloco médio exprimível, porque um bloco é gente **parada** numa forma.
- **O centro do bloco segue a bola 1:1** (`computeBlock`), e é essa a causa provável do desvio de ±20 m. Se a Task 4 mostrar que o desvio não desceu, é aqui que se vai a seguir.
