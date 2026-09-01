# Escolha do recetor — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar de passar sistematicamente para o companheiro isolado na lateral, e dar ao portador uma saída quando não há bom recetor.

**Architecture:** A pontuação do recetor passa a somar três termos normalizados a 0..1, com pesos que variam conforme a pressão sobre o portador. Quando a melhor nota fica abaixo de um limiar, `actPass` desce uma cascata: driblar, passar para trás a alguém perto, ou conduzir para trás — este último reutilizando o cone de visão do carry com o eixo invertido.

**Tech Stack:** JavaScript de browser em scripts clássicos, sem build nem módulos. `js/pass_types.js` já exporta em Node por `module.exports`. Testes com `node:test` e `node:vm`.

## Global Constraints

- Sem passos de build. Os ficheiros em `js/` são carregados como `<script>` clássicos por `index.html`; tudo é global, nada de `import`/`export` fora do `module.exports` condicional que o `pass_types.js` já tem no fim.
- **Nada em `js/pass_types.js` pode usar `THREE`.** É importado directamente pelos testes em Node, onde `THREE` não existe.
- Os testes correm com `node --test tests/*.test.js`. Não há script `test` em `package.json`.
- O código e os comentários do repositório estão em português europeu.
- **O cone de visão é `max(30, TEC × 0.7)` graus para cada lado, e a distância de leitura `max(12, TEC × 0.5)` metros.** Já é assim em três sítios — `js/fsm.js:423`, `js/fsm.js:506` e `js/bt/player_bt.js:114` — e o recuo com bola reutiliza o mesmo cone, sem inventar números novos.
- `PassCandidates.arcos` vale 7 e `pontosPorArco` 7, logo o leque tem 49 pontos por companheiro. Esse 49 nunca é escrito à mão: sai sempre do produto dos dois.

---

### Task 1: As funções puras da pontuação

**Files:**
- Modify: `js/config.js` — `PassTypeModel.escolha`
- Modify: `js/pass_types.js` — três funções novas
- Test: `tests/escolha_recetor.test.js` (criar)

**Interfaces:**
- Consumes: nada de tarefas anteriores.
- Produces:
  - `PassTypeModel.escolha` com `bonusSugerido`, `progressoRef`, `distanciaMax`, `raioPressao`, `notaMinima`, `tecnicaDrible`, `raioRecuo`, `pesosSemPressao`, `pesosSobPressao`.
  - `PassTypes.pressaoSobrePortador(distMaisPerto, raio) → 0..1`
  - `PassTypes.pesosPorPressao(pressao) → { progresso, espaco, distancia }`
  - `PassTypes.notaCandidato(progressoNorm, espacoNorm, distNorm, pesos) → number`
  - `PassTypes.maxPontosLeque() → number`

- [ ] **Step 1: Escrever o teste que falha**

Cria `tests/escolha_recetor.test.js`:

```js
/*
Escolha de quem recebe o passe. O PassTypeModel vive em js/config.js (script de
browser, sem exports), por isso é recortado do ficheiro e avaliado; o PassTypes
já exporta em Node.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const CONFIG = fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8');

global.CAMPO_COMP = 105;

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

const sandbox = { CAMPO_COMP: 105, Math };
vm.createContext(sandbox);
vm.runInContext(recortarConst(CONFIG, 'PassTypeModel') + '\nthis.M = PassTypeModel;', sandbox);
global.PassTypeModel = sandbox.M;

// O leque real, para maxPontosLeque não ser um 49 à mão.
global.PassCandidates = { arcos: 7, pontosPorArco: 7 };

const { PassTypes } = require('../js/pass_types.js');
const E = () => PassTypeModel.escolha;

test('as constantes da escolha existem', () => {
    for (const k of ['bonusSugerido', 'progressoRef', 'distanciaMax',
                     'raioPressao', 'notaMinima', 'tecnicaDrible', 'raioRecuo']) {
        assert.strictEqual(typeof E()[k], 'number', k + ' em falta');
    }
    for (const conj of ['pesosSemPressao', 'pesosSobPressao']) {
        for (const k of ['progresso', 'espaco', 'distancia']) {
            assert.strictEqual(typeof E()[conj][k], 'number', conj + '.' + k);
        }
    }
});

test('os pesos antigos desapareceram', () => {
    // Ficavam numa escala incomparável com a nova e voltariam a desequilibrar.
    for (const k of ['pesoProgresso', 'pesoEspaco', 'pesoDistancia']) {
        assert.strictEqual(E()[k], undefined, k + ' devia ter sido removido');
    }
});

test('maxPontosLeque sai do PassCandidates, não de um 49 à mão', () => {
    assert.strictEqual(PassTypes.maxPontosLeque(), 49);
    const antes = PassCandidates.arcos;
    PassCandidates.arcos = 3;
    assert.strictEqual(PassTypes.maxPontosLeque(), 21, 'devia acompanhar os arcos');
    PassCandidates.arcos = antes;
});

test('pressão é 1 com o adversário em cima e 0 no limite do raio', () => {
    assert.strictEqual(PassTypes.pressaoSobrePortador(0, 8), 1);
    assert.strictEqual(PassTypes.pressaoSobrePortador(8, 8), 0);
    assert.strictEqual(PassTypes.pressaoSobrePortador(40, 8), 0);
});

test('a pressão desce à medida que o adversário se afasta', () => {
    let anterior = Infinity;
    for (let d = 0; d <= 10; d += 0.5) {
        const p = PassTypes.pressaoSobrePortador(d, 8);
        assert.ok(p <= anterior + 1e-9, 'subiu em d=' + d);
        assert.ok(p >= 0 && p <= 1, 'fora de [0,1] em d=' + d);
        anterior = p;
    }
});

test('sem adversário à vista não há pressão', () => {
    assert.strictEqual(PassTypes.pressaoSobrePortador(Infinity, 8), 0);
});

test('os pesos nos extremos são os dois conjuntos declarados', () => {
    assert.deepStrictEqual(
        Object.assign({}, PassTypes.pesosPorPressao(0)),
        Object.assign({}, E().pesosSemPressao));
    assert.deepStrictEqual(
        Object.assign({}, PassTypes.pesosPorPressao(1)),
        Object.assign({}, E().pesosSobPressao));
});

test('a meia pressão os pesos são a média dos dois conjuntos', () => {
    const meio = PassTypes.pesosPorPressao(0.5);
    for (const k of ['progresso', 'espaco', 'distancia']) {
        const esperado = (E().pesosSemPressao[k] + E().pesosSobPressao[k]) / 2;
        assert.ok(Math.abs(meio[k] - esperado) < 1e-9, k + ': ' + meio[k]);
    }
});

test('sob pressão o espaço passa a pesar mais que o progresso', () => {
    const semP = PassTypes.pesosPorPressao(0);
    const sobP = PassTypes.pesosPorPressao(1);
    assert.ok(semP.progresso > semP.espaco, 'livre devia procurar progresso');
    assert.ok(sobP.espaco > sobP.progresso, 'pressionado devia procurar espaço');
});

test('a nota é monótona em cada termo', () => {
    const w = PassTypes.pesosPorPressao(0.5);
    let ant = -Infinity;
    for (let g = 0; g <= 1.0001; g += 0.1) {
        const n = PassTypes.notaCandidato(Math.min(g, 1), 0.5, 0.5, w);
        assert.ok(n >= ant - 1e-9, 'progresso desceu em ' + g);
        ant = n;
    }
    ant = -Infinity;
    for (let e = 0; e <= 1.0001; e += 0.1) {
        const n = PassTypes.notaCandidato(0.5, Math.min(e, 1), 0.5, w);
        assert.ok(n >= ant - 1e-9, 'espaço desceu em ' + e);
        ant = n;
    }
    ant = Infinity;
    for (let d = 0; d <= 1.0001; d += 0.1) {
        const n = PassTypes.notaCandidato(0.5, 0.5, Math.min(d, 1), w);
        assert.ok(n <= ant + 1e-9, 'distância subiu em ' + d);
        ant = d === 0 ? n : Math.min(ant, n);
    }
});

/*
O bug relatado: o portador na lateral toca ainda mais para a lateral, para um
companheiro isolado, tendo alguém à frente. O isolado ganhava porque o termo do
espaço era a CONTAGEM de pontos vivos do leque (até 49), e o progresso raramente
passava de 40 — escalas incomparáveis.

Frente marcado: 20 m de progresso, 10 pontos vivos, a 20 m.
Lateral isolado: 0 m de progresso, 49 pontos vivos, a 20 m.
*/
const frente = { g: 20 / 30, e: 10 / 49, d: 20 / 45 };
const lateral = { g: 0, e: 49 / 49, d: 20 / 45 };

test('regressão: sem pressão o passe à frente ganha ao isolado na lateral', () => {
    const w = PassTypes.pesosPorPressao(0);
    const nf = PassTypes.notaCandidato(frente.g, frente.e, frente.d, w);
    const nl = PassTypes.notaCandidato(lateral.g, lateral.e, lateral.d, w);
    assert.ok(nf > nl, 'frente=' + nf.toFixed(3) + ' lateral=' + nl.toFixed(3));
});

test('sob pressão o isolado volta a ganhar', () => {
    const w = PassTypes.pesosPorPressao(1);
    const nf = PassTypes.notaCandidato(frente.g, frente.e, frente.d, w);
    const nl = PassTypes.notaCandidato(lateral.g, lateral.e, lateral.d, w);
    assert.ok(nl > nf, 'frente=' + nf.toFixed(3) + ' lateral=' + nl.toFixed(3));
});
```

- [ ] **Step 2: Correr e confirmar que falha**

Run: `node --test tests/escolha_recetor.test.js`
Expected: FAIL — `bonusSugerido` continua 30 e `pesoProgresso` ainda existe; `PassTypes.pressaoSobrePortador is not a function`.

- [ ] **Step 3: Trocar as constantes**

Em `js/config.js`, substitui o bloco `escolha` de `PassTypeModel` inteiro por:

```js
    escolha: {
        /*
        Os três termos chegam normalizados a 0..1 (ver notaCandidato em
        pass_types.js), por isso estes pesos são comparáveis entre si.

        Os antigos pesoProgresso/pesoEspaco/pesoDistancia multiplicavam
        grandezas em escalas diferentes, e o do espaço era a CONTAGEM de pontos
        vivos do leque — até 49, contra um progresso que raramente passava de
        40. Um companheiro isolado na lateral tinha o leque quase todo vivo e
        ganhava a escolha por estar isolado: 37 pontos contra 22 de quem estava
        bem colocado à frente. Daí o passe eterno para a lateral.
        */
        bonusSugerido: 0.5,      // vantagem de partida do alvo que o BT propôs
        progressoRef: 30.0,      // metros ganhos que valem 1.0 de progresso
        distanciaMax: 45.0,      // acima disto nem é candidato

        /*
        Os pesos variam com a PRESSÃO sobre o portador: livre, procura quem
        progride; com um adversário em cima, procura quem está livre. É o que
        torna o passe lateral para o isolado a jogada certa quando é mesmo a
        única, em vez de ser a regra.
        */
        raioPressao: 8.0,
        pesosSemPressao: { progresso: 1.0, espaco: 0.30, distancia: 0.35 },
        pesosSobPressao: { progresso: 0.45, espaco: 1.00, distancia: 0.20 },

        /*
        Abaixo desta nota não vale a pena passar a ninguém: o actPass desce a
        cascata driblar -> atrasar a alguém perto -> conduzir para trás.
        `tecnicaDrible` é o mesmo 75 que o podeDriblar já usa.
        */
        notaMinima: 0.35,
        tecnicaDrible: 75,

        /*
        Até onde se atrasa a bola. Sem este limite, um médio sob pressão
        atrasava para o guarda-redes a quarenta metros — isso não é reiniciar a
        jogada, é fugir dela.
        */
        raioRecuo: 18.0
    }
```

- [ ] **Step 4: Escrever as funções puras**

Em `js/pass_types.js`, dentro do objecto `PassTypes`, antes de `escolher`, acrescenta:

```js
    /*
    Quantos pontos tem o leque de UM companheiro, no máximo. Sai do
    PassCandidates e não de um 49 escrito à mão: mexer na densidade do leque não
    pode voltar a desequilibrar a escolha em silêncio.
    */
    maxPontosLeque: function () {
        if (typeof PassCandidates === 'undefined') return 49;
        return PassCandidates.arcos * PassCandidates.pontosPorArco;
    },

    /*
    Quão pressionado está o portador, de 0 (ninguém por perto) a 1 (adversário
    em cima). `distMaisPerto` é a distância ao adversário mais próximo dele.
    */
    pressaoSobrePortador: function (distMaisPerto, raio) {
        if (!isFinite(distMaisPerto)) return 0;
        const t = Math.max(0, Math.min(1, distMaisPerto / raio));
        return 1 - t;
    },

    /*
    Interpola entre os dois conjuntos de pesos conforme a pressão.
    */
    pesosPorPressao: function (pressao) {
        const E = PassTypeModel.escolha;
        const t = Math.max(0, Math.min(1, pressao));
        const a = E.pesosSemPressao, b = E.pesosSobPressao;
        return {
            progresso: a.progresso + (b.progresso - a.progresso) * t,
            espaco: a.espaco + (b.espaco - a.espaco) * t,
            distancia: a.distancia + (b.distancia - a.distancia) * t
        };
    },

    /*
    Nota de um candidato a receber. Os três argumentos vêm normalizados a 0..1
    por quem chama — o progresso pode ser negativo num passe para trás.
    */
    notaCandidato: function (progressoNorm, espacoNorm, distNorm, pesos) {
        return progressoNorm * pesos.progresso
            + espacoNorm * pesos.espaco
            - distNorm * pesos.distancia;
    },
```

- [ ] **Step 5: Correr os testes e confirmar que passam**

Run: `node --test tests/escolha_recetor.test.js`
Expected: PASS, 12 testes.

- [ ] **Step 6: Verificar sintaxe e carregamento**

Run: `node --check js/config.js && node --check js/pass_types.js && node -e "require('./js/pass_types.js'); console.log('ok')"`
Expected: imprime `ok`.

- [ ] **Step 7: Commit**

```bash
git add js/config.js js/pass_types.js tests/escolha_recetor.test.js
git commit -m "feat: score pass receivers on a normalised, pressure-aware scale"
```

---

### Task 2: `escolher` usa a escala nova e devolve a nota

**Files:**
- Modify: `js/pass_types.js` — `escolher`, e `melhorRecuo` nova
- Test: `tests/escolha_recetor.test.js`

**Interfaces:**
- Consumes: as quatro funções da Task 1.
- Produces:
  - `PassTypes.escolher(carrier, sugerido, rnd)` devolve `{ mate, tipo, ponto, nota }` — o campo `nota` é novo.
  - `PassTypes.melhorRecuo(carrier) → mate | null`
  - `PassTypes.distAdversarioMaisPerto(carrier) → number`

- [ ] **Step 1: Escrever os testes que falham**

Acrescenta ao fim de `tests/escolha_recetor.test.js`:

```js
/* ------------------------------------------------------------------
   Passe para trás: só a quem está perto da jogada.
   ------------------------------------------------------------------ */

// Match falso, com o mínimo que o melhorRecuo lê.
function montarMatch(carrierZ, companheiros) {
    global.Match = {
        players: companheiros,
        opponents: [],
        ball: { position: { x: 0, y: 0, z: carrierZ } }
    };
}

const jog = (x, z, id, role) => ({
    id: id, role: role || 'mid', team: 'TeamA', dirZ: 1,
    model: { position: { x: x, z: z } }
});

test('o recuo só olha para quem está atrás da linha da bola', () => {
    const carrier = jog(0, 0, 'c');
    const atras = jog(0, -8, 'atras');
    const frente = jog(0, 8, 'frente');
    montarMatch(0, [carrier, atras, frente]);
    const r = PassTypes.melhorRecuo(carrier);
    assert.ok(r, 'devia ter encontrado alguém');
    assert.strictEqual(r.id, 'atras');
});

test('o recuo ignora quem está longe, mesmo estando atrás', () => {
    const carrier = jog(0, 0, 'c');
    const longe = jog(0, -(PassTypeModel.escolha.raioRecuo + 10), 'longe');
    montarMatch(0, [carrier, longe]);
    assert.strictEqual(PassTypes.melhorRecuo(carrier), null,
        'era este o atraso para o guarda-redes a meio-campo');
});

test('o guarda-redes serve, se estiver perto', () => {
    const carrier = jog(0, -30, 'c');
    const gk = jog(0, -40, 'gk', 'gk');
    montarMatch(-30, [carrier, gk]);
    const r = PassTypes.melhorRecuo(carrier);
    assert.ok(r, 'não é o papel que exclui, é a distância');
    assert.strictEqual(r.id, 'gk');
});

test('sem ninguém atrás e perto, devolve null', () => {
    const carrier = jog(0, 0, 'c');
    const frente = jog(0, 10, 'frente');
    montarMatch(0, [carrier, frente]);
    assert.strictEqual(PassTypes.melhorRecuo(carrier), null,
        'é este o caso que manda conduzir para trás');
});

test('entre dois atrás, escolhe o mais perto', () => {
    const carrier = jog(0, 0, 'c');
    const perto = jog(0, -5, 'perto');
    const meio = jog(0, -14, 'meio');
    montarMatch(0, [carrier, perto, meio]);
    assert.strictEqual(PassTypes.melhorRecuo(carrier).id, 'perto');
});

test('a equipa que ataca ao contrário recua para o outro lado', () => {
    const carrier = jog(0, 0, 'c');
    carrier.dirZ = -1;
    const atras = jog(0, 8, 'atras');   // atrás, para quem ataca em -z
    atras.dirZ = -1;
    montarMatch(0, [carrier, atras]);
    assert.strictEqual(PassTypes.melhorRecuo(carrier).id, 'atras');
});
```

- [ ] **Step 2: Correr e confirmar que falha**

Run: `node --test tests/escolha_recetor.test.js`
Expected: FAIL com `PassTypes.melhorRecuo is not a function`.

- [ ] **Step 3: Escrever melhorRecuo e distAdversarioMaisPerto**

Em `js/pass_types.js`, dentro de `PassTypes`, a seguir a `notaCandidato`:

```js
    // Distância do portador ao adversário mais próximo. Infinity se não houver.
    distAdversarioMaisPerto: function (carrier) {
        if (typeof Match === 'undefined') return Infinity;
        const opps = (carrier.team === 'TeamA') ? Match.opponents : Match.players;
        const cx = carrier.model.position.x, cz = carrier.model.position.z;

        let melhor = Infinity;
        for (const o of opps) {
            if (!o || !o.model) continue;
            const d = Math.hypot(o.model.position.x - cx, o.model.position.z - cz);
            if (d < melhor) melhor = d;
        }
        return melhor;
    },

    /*
    Melhor companheiro para atrasar a bola: atrás da linha do portador e a menos
    de `raioRecuo`. Entre os que servem, o mais perto.

    O raio é o que interessa aqui. Sem ele, um médio sob pressão atrasava para o
    guarda-redes a quarenta metros, e isso não é reiniciar a jogada — é fugir
    dela. Qualquer jogador serve, guarda-redes incluído: não é o papel que
    exclui, é a distância.
    */
    melhorRecuo: function (carrier) {
        if (typeof Match === 'undefined' || typeof PassTypeModel === 'undefined') return null;

        const raio = PassTypeModel.escolha.raioRecuo;
        const mates = (carrier.team === 'TeamA') ? Match.players : Match.opponents;
        const cx = carrier.model.position.x, cz = carrier.model.position.z;
        const dirZ = carrier.dirZ;

        let melhor = null, melhorD = Infinity;
        for (const m of mates) {
            if (m === carrier || !m.model) continue;

            // Atrás no referencial de ataque do portador.
            const avanco = (m.model.position.z - cz) * dirZ;
            if (avanco >= 0) continue;

            const d = Math.hypot(m.model.position.x - cx, m.model.position.z - cz);
            if (d > raio) continue;
            if (d < melhorD) { melhorD = d; melhor = m; }
        }
        return melhor;
    },
```

- [ ] **Step 4: Correr os testes e confirmar que passam**

Run: `node --test tests/escolha_recetor.test.js`
Expected: PASS, 18 testes.

- [ ] **Step 5: Passar `escolher` para a escala nova**

Em `js/pass_types.js`, dentro de `escolher`, substitui o bloco que calcula a nota:

```js
            // Progresso: quanto o PONTO DE MIRA adianta a bola para a
            // baliza. Num passe directo o ponto é o próprio companheiro.
            const alvoZ = res.ponto ? res.ponto.z : mz;
            const progresso = (alvoZ - cz) * dirZ;

            let nota = progresso * E.pesoProgresso
                + pontos.length * E.pesoEspaco
                - dist * E.pesoDistancia;
            if (mate === sugerido) nota += E.bonusSugerido;

            if (nota > melhorNota) {
                melhorNota = nota;
                melhor = { mate: mate, tipo: res.tipo, ponto: res.ponto };
            }
```

por:

```js
            // Progresso: quanto o PONTO DE MIRA adianta a bola para a
            // baliza. Num passe directo o ponto é o próprio companheiro.
            const alvoZ = res.ponto ? res.ponto.z : mz;
            const progresso = (alvoZ - cz) * dirZ;

            /*
            Três termos normalizados a 0..1 e só depois pesados. O do espaço era
            a CONTAGEM de pontos vivos do leque (até 49), contra um progresso
            que raramente passava de 40: um companheiro isolado na lateral
            ganhava por estar isolado.

            O progresso pode ser negativo — um passe para trás perde terreno —
            e por isso o clamp é a -1, não a 0.
            */
            const progressoNorm = Math.max(-1, Math.min(1, progresso / E.progressoRef));
            const espacoNorm = Math.min(1, pontos.length / this.maxPontosLeque());
            const distNorm = Math.max(0, Math.min(1, dist / E.distanciaMax));

            let nota = this.notaCandidato(progressoNorm, espacoNorm, distNorm, pesos);
            if (mate === sugerido) nota += E.bonusSugerido;

            if (nota > melhorNota) {
                melhorNota = nota;
                melhor = { mate: mate, tipo: res.tipo, ponto: res.ponto, nota: nota };
            }
```

E, logo antes do laço `for (const mate of teammates)`, acrescenta o cálculo dos pesos:

```js
        // Os pesos dependem de quão pressionado está QUEM PASSA, e por isso
        // calculam-se uma vez, fora do laço dos candidatos.
        const pressao = this.pressaoSobrePortador(
            this.distAdversarioMaisPerto(carrier), E.raioPressao);
        const pesos = this.pesosPorPressao(pressao);
```

- [ ] **Step 6: Verificar sintaxe e carregamento**

Run: `node --check js/pass_types.js && node -e "require('./js/pass_types.js'); console.log('ok')"`
Expected: imprime `ok`.

- [ ] **Step 7: Correr a suite toda**

Run: `node --test tests/*.test.js`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add js/pass_types.js tests/escolha_recetor.test.js
git commit -m "feat: pick the receiver on the normalised scale and report the score"
```

---

### Task 3: Conduzir para trás

**Files:**
- Modify: `js/player.js` — `this.carryRecuo = false` no construtor
- Modify: `js/fsm.js` — o `case 'CARRY'` inverte o cone
- Modify: `js/bt/player_bt.js` — repor a bandeira ao largar a bola

**Interfaces:**
- Consumes: nada das tarefas anteriores.
- Produces: `p.carryRecuo` — booleano. Com ele a `true`, o `case 'CARRY'` procura direcção no cone oposto.

- [ ] **Step 1: Acrescentar a bandeira ao jogador**

Em `js/player.js`, a seguir a `this.dribbleTargetX = 0;`, acrescenta:

```js
        /*
        Conduzir PARA TRÁS. Levantada pelo actPass quando não há bom recetor nem
        ninguém perto para atrasar: volta com a bola e espera que apareça linha,
        em vez de a atirar para a lateral. Ver o case CARRY em fsm.js.
        */
        this.carryRecuo = false;
```

- [ ] **Step 2: Inverter o cone no CARRY**

Em `js/fsm.js`, dentro do `case 'CARRY'`, a linha

```js
                        const tec = p.skillFor ? p.skillFor('TEC') : 50;
```

fica onde está. Logo a seguir a ela, acrescenta:

```js
                        /*
                        Sentido da condução. O cone de visão é o mesmo — a
                        técnica manda nele por igual, para a frente e para
                        trás — só o eixo em torno do qual abre é que muda.

                        Assim ele recua pelo corredor mais livre, com o mesmo
                        peso de espaço e o mesmo respeito pelo sector, em vez de
                        recuar às cegas.
                        */
                        const sentido = p.carryRecuo ? -p.dirZ : p.dirZ;
```

Depois, nas três linhas que usam `p.dirZ` para gerar e pontuar os candidatos, troca `p.dirZ` por `sentido`:

```js
                            let tz = pz + Math.cos(ang) * sentido * visDist;
```

```js
                            if (tz * sentido > avancoMax) tz = avancoMax * sentido;
```

```js
                            const progressoNorm = Math.max(0, Math.min(1, ((tz - pz) * sentido) / visDist));
```

E a linha do recuo seguro, mais acima:

```js
                        let alvoX = px, alvoZ = pz + 10 * p.dirZ;
```

passa a

```js
                        let alvoX = px, alvoZ = pz + 10 * sentido;
```

**Não** troques o `p.dirZ` da penalidade de sector (`Tatics.penalidadeSector(tx, p.dirZ)`): o sector do painel é sempre no referencial de ataque da equipa, venha o jogador a avançar ou a recuar.

- [ ] **Step 3: Repor a bandeira ao largar a bola**

Em `js/bt/player_bt.js`, no bloco que repõe `p.carryDist` quando o jogador deixa de ter a bola, a linha

```js
            p.carryDist = 0;
```

passa a

```js
            p.carryDist = 0;
            // A bola mudou de pé: o recuo com bola acabou.
            p.carryRecuo = false;
```

- [ ] **Step 4: Verificar sintaxe**

Run: `node --check js/player.js && node --check js/fsm.js && node --check js/bt/player_bt.js`
Expected: sem saída, código de saída 0.

- [ ] **Step 5: Confirmar que o sector não foi invertido**

Run: `grep -n "penalidadeSector" js/fsm.js`
Expected: a chamada continua com `p.dirZ`, não com `sentido`.

- [ ] **Step 6: Correr a suite toda**

Run: `node --test tests/*.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add js/player.js js/fsm.js js/bt/player_bt.js
git commit -m "feat: let the carrier drop back with the ball"
```

---

### Task 4: A cascata no actPass

**Files:**
- Modify: `js/bt/player_bt.js` — `actPass`

**Interfaces:**
- Consumes: `PassTypes.escolher` (com `nota`) e `PassTypes.melhorRecuo` da Task 2; `p.carryRecuo` da Task 3.
- Produces: nada de novo.

- [ ] **Step 1: Substituir o actPass**

Em `js/bt/player_bt.js`, substitui a função `actPass` inteira, e o comentário imediatamente acima dela, por:

```js
/*
O BT já escolheu um companheiro; o PassTypes decide COMO a bola lhe chega (aos
pés, no espaço à frente, ou no ponto mais adiantado do leque) e pode trocar o
receptor por outro claramente melhor para o tipo sorteado.

Quando nem o melhor candidato chega a `notaMinima`, desce-se a cascata em vez de
passar por passar — era daí que vinha o toque eterno para o companheiro isolado
na lateral, onde não havia jogada nenhuma:

    1. driblar, se a técnica der para isso e houver espaço à frente;
    2. atrasar a alguém PERTO, para reiniciar a jogada;
    3. voltar com a bola e esperar que apareça linha.

Sem PassTypes carregado, ou sem nada melhor a propor, fica o caminho antigo.
*/
function actPass(ctx) {
    const p = ctx.p;
    if (typeof PassTypes === 'undefined') {
        p.passAimPoint = null;
        p.passTipo = 'direct';
        p.initiatePass(ctx.passTarget);
        return;
    }

    const E = PassTypeModel.escolha;
    const escolha = PassTypes.escolher(p, ctx.passTarget);
    const boa = escolha && escolha.mate && escolha.nota >= E.notaMinima;

    if (boa) {
        p.carryRecuo = false;
        aplicarMiraDoPasse(p, escolha.tipo, escolha.ponto);
        p.initiatePass(escolha.mate);
        return;
    }

    // 1. Driblar: precisa de técnica e de espaço à frente.
    const tec = p.skillFor ? p.skillFor('TEC') : 50;
    if (tec >= E.tecnicaDrible && ctx.campoAberto) {
        p.carryRecuo = false;
        p.apoioAtivo = false;
        if (typeof MatchStats !== 'undefined') MatchStats[p.team].dribles.tentados++;
        p.fsm.changeState('DRIBBLE');
        return;
    }

    // 2. Atrasar a alguém perto, para reiniciar a jogada.
    const recuo = PassTypes.melhorRecuo(p);
    if (recuo) {
        p.carryRecuo = false;
        const r = PassTypes.paraMate(p, recuo);
        aplicarMiraDoPasse(p, r.tipo, r.ponto);
        p.initiatePass(recuo);
        return;
    }

    // 3. Voltar com a bola e esperar.
    if (escolha && escolha.mate) {
        p.carryRecuo = true;
        p.apoioAtivo = false;
        p.fsm.changeState('CARRY');
        return;
    }

    // Sem candidato nenhum: o caminho antigo, para nunca ficar sem saída.
    p.passAimPoint = null;
    p.passTipo = 'direct';
    p.initiatePass(ctx.passTarget);
}
```

- [ ] **Step 2: Confirmar que o dribbleOpponent não é preciso neste ramo**

Run: `grep -n "dribbleOpponent" js/fsm.js | head -3`

O estado `DRIBBLE` usa `p.dribbleOpponent` para saber por quem passar. No ramo 1 da cascata não há adversário nomeado — é condução em campo aberto, não um 1×1. Confirma que o `case 'DRIBBLE'` tolera `dribbleOpponent` nulo; se não tolerar, usa `p.fsm.changeState('CARRY')` neste ramo em vez de `'DRIBBLE'`, que dá o mesmo efeito de "levar a bola em vez de a passar" sem tocar no 1×1.

- [ ] **Step 3: Verificar sintaxe**

Run: `node --check js/bt/player_bt.js`
Expected: sem saída, código de saída 0.

- [ ] **Step 4: Correr a suite toda**

Run: `node --test tests/*.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/bt/player_bt.js
git commit -m "fix: stop passing sideways when there is no play there"
```

---

### Task 5: Documentação e verificação no jogo

**Files:**
- Modify: `docs/filesSummary.md`

- [ ] **Step 1: Documentar**

Na entrada do `PassTypeModel` em `docs/filesSummary.md`, acrescenta:

```markdown
  - **Quem recebe** (`escolha`): três termos normalizados a 0..1 — progresso
    sobre `progressoRef` (30 m), espaço sobre `maxPontosLeque` (49, lido do
    `PassCandidates`), distância sobre `distanciaMax` (45 m) — com pesos que
    variam pela **pressão sobre o portador** (`raioPressao` 8 m): livre procura
    quem progride, pressionado procura quem está livre.
  - O termo do espaço era a **contagem** de pontos vivos do leque, até 49, contra
    um progresso que raramente passava de 40. Um companheiro isolado na lateral
    tinha o leque quase todo vivo e ganhava a escolha **por estar isolado** — 37
    contra 22 de quem estava bem colocado à frente. Era daí que vinha o toque
    eterno para a lateral.
  - Abaixo de `notaMinima` (0.35) o `actPass` desce uma cascata: driblar (se
    TEC ≥ `tecnicaDrible`, 75, e houver campo aberto), atrasar a alguém a menos
    de `raioRecuo` (18 m), ou **conduzir para trás** (`p.carryRecuo`, que inverte
    o eixo do cone no `case 'CARRY'`). O raio do recuo é o que impede o atraso
    para o guarda-redes a meio-campo.
```

- [ ] **Step 2: Commit**

```bash
git add docs/filesSummary.md
git commit -m "docs: describe the receiver choice rework"
```

- [ ] **Step 3: Arrancar o servidor**

Run: `npm run dev`

- [ ] **Step 4: Confirmar que o passe lateral parou**

Observa jogadores a receber na lateral sem pressão. Devem procurar quem progride
— para dentro, para a frente — ou conduzir, em vez de tocar ainda mais para a
linha. É a queixa que motivou tudo isto.

- [ ] **Step 5: Confirmar que sob pressão o lateral volta**

Espera por um portador com um adversário colado. Aí o passe de segurança para
quem está livre deve voltar a acontecer — inclusive para a lateral, se for essa
a saída. Se nunca acontecer, `pressaoSobrePortador` não está a ser lida.

- [ ] **Step 6: Ver a cascata**

Procura um portador encurralado, sem linha à frente. Deve driblar (se tiver
técnica), atrasar a um companheiro perto, ou **recuar com a bola**. Nenhum destes
existia antes.

- [ ] **Step 7: Confirmar que o recuo com bola não é infinito**

Quem recua com a bola deve voltar a passar assim que aparecer linha. Se recuar
até à própria baliza, a bandeira `p.carryRecuo` não está a ser baixada — verifica
o ramo `boa` do `actPass` e o reset em `js/bt/player_bt.js`.

- [ ] **Step 8: Comparar as estatísticas**

Corre a **Simulação rápida** e compara a percentagem de passes certos e o número
de passes por posse com os de antes. Espera-se menos passes laterais estéreis e
mais progressão; uma queda grande na percentagem de acerto significa que
`notaMinima` está alta de mais e o jogo está a driblar quando devia passar.
