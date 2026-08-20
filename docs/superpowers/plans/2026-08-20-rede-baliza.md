# Rede da baliza: malha deformável e ondulação — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a rede ondular durante cinco segundos quando a bola lhe bate, em vez de ficar uma chapa imóvel.

**Architecture:** Duas peças independentes. `criarFaceRede` passa a gerar uma grelha de vértices por interpolação bilinear dos mesmos quatro cantos, em vez de um quad de quatro. E um módulo novo, `NetWave`, guarda as posições de repouso de cada face e reescreve-as a cada frame com um deslocamento ao longo da normal, disparado pelo impacto e a decair até parar.

**Tech Stack:** JavaScript de browser em scripts clássicos, sem build nem módulos. Three.js para a geometria. Testes com `node:test` e `node:vm`, recortando as funções reais dos ficheiros de origem — ver `tests/gk_anchor.test.js` como referência do padrão.

## Global Constraints

- Sem passos de build. Os ficheiros em `js/` são carregados como `<script>` clássicos por `index.html`; tudo é global, nada de `import`/`export`.
- **A física da bola não se toca.** `GoalNet.restituicao` (0.12), `GoalNet.atrito` (0.72), `profTopo`, `profBase` e toda a `Match.colidirComRede` ficam como estão, à excepção da linha que dispara a onda. A trajectória da bola já foi validada pelo utilizador.
- `NetWave.deslocamento` tem de ser pura e não pode usar `THREE`: é recortada e corrida em Node pelos testes. As restantes funções do `NetWave` podem usar `THREE`, porque não são testadas isoladas.
- Os testes correm com `node --test tests/*.test.js` (o `node --test tests/` simples não resolve o diretório neste Node em Windows). Não há script `test` em `package.json`.
- O código e os comentários do repositório estão em português europeu. Segue o mesmo registo.
- A ordem dos cantos em `criarFaceRede(p1, p2, p3, p4, ...)` é `p1` em `(u=0, v=0)`, `p2` em `(1, 0)`, `p3` em `(0, 1)`, `p4` em `(1, 1)` — é o que os índices actuais `[0,1,2, 1,3,2]` implicam. Cada canto é um array `[x, y, z]`.
- `LARGURA_BALIZA` vale 7.32 e `ALTURA_BALIZA` 2.44 (`js/config.js:59`).

---

### Task 1: A matemática da onda, isolada

**Files:**
- Modify: `js/config.js:77-82` (`GoalNet` ganha as constantes)
- Create: `js/goal_net.js`
- Test: `tests/goal_net.test.js` (criar)

**Interfaces:**
- Consumes: nada de tarefas anteriores.
- Produces:
  - `GoalNet.segmentosU`, `.segmentosV`, `.segmentosLateralU`, `.duracaoOnda`, `.amplitudeMax`, `.frequencia`, `.ondasPorPano`, `.velocidadeCheia` — todos números.
  - `NetWave.deslocamento(t, u, v, amplitude) → number`, pura.
  - `NetWave.amplitudeDoImpacto(velocidadeNormal) → number` entre 0 e 1, pura.

- [ ] **Step 1: Escrever o teste que falha**

Cria `tests/goal_net.test.js` com este conteúdo exacto:

```js
/*
Ondulação da rede da baliza. A matemática vive em js/goal_net.js (script de
browser, sem exports) e as constantes em js/config.js, por isso são recortadas
dos ficheiros e avaliadas num sandbox. Nada disto usa THREE, de propósito.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const CONFIG = fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8');
const NET = fs.readFileSync(path.join(raiz, 'js', 'goal_net.js'), 'utf8');

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

// Recorta um método escrito como `nome: function (...) { ... }`.
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

function montar() {
    const sandbox = { Math: Math };
    vm.createContext(sandbox);
    vm.runInContext(
        recortarConst(CONFIG, 'GoalNet') + '\n' +
        'const NetWave = {\n' +
        recortarMetodo(NET, 'deslocamento') + ',\n' +
        recortarMetodo(NET, 'amplitudeDoImpacto') + '\n' +
        '};\n' +
        'this.W = NetWave; this.G = GoalNet;', sandbox);
    return sandbox;
}

test('as constantes da onda existem', () => {
    const s = montar();
    for (const k of ['segmentosU', 'segmentosV', 'segmentosLateralU',
                     'duracaoOnda', 'amplitudeMax', 'frequencia',
                     'ondasPorPano', 'velocidadeCheia']) {
        assert.strictEqual(typeof s.G[k], 'number', k + ' em falta');
        assert.ok(s.G[k] > 0, k + ' devia ser positivo');
    }
});

test('a física da bola ficou intacta', () => {
    const s = montar();
    assert.strictEqual(s.G.restituicao, 0.12);
    assert.strictEqual(s.G.atrito, 0.72);
    assert.strictEqual(s.G.profTopo, 0.8);
    assert.strictEqual(s.G.profBase, 2.0);
});

test('a rede parte do repouso: deslocamento nulo em t=0', () => {
    const s = montar();
    for (const u of [0, 0.3, 0.7, 1]) {
        for (const v of [0, 0.5, 1]) {
            assert.ok(Math.abs(s.W.deslocamento(0, u, v, 1.0)) < 1e-9,
                'u=' + u + ' v=' + v + ' deu ' + s.W.deslocamento(0, u, v, 1.0));
        }
    }
});

test('a envolvente decai com o tempo', () => {
    const s = montar();
    // Máximo de |desloc| numa janela, varrendo t finamente.
    const pico = (t0, t1) => {
        let m = 0;
        for (let t = t0; t <= t1; t += 0.005) {
            m = Math.max(m, Math.abs(s.W.deslocamento(t, 0.5, 0.5, 1.0)));
        }
        return m;
    };
    const cedo = pico(0.2, 1.0);
    const tarde = pico(3.0, 3.8);
    assert.ok(tarde < cedo, 'cedo=' + cedo + ' tarde=' + tarde);
});

test('no fim da duração já quase não se mexe', () => {
    const s = montar();
    const d = Math.abs(s.W.deslocamento(s.G.duracaoOnda, 0.5, 0.5, 1.0));
    assert.ok(d < 0.02 * s.G.amplitudeMax,
        'ainda ' + d + ' aos ' + s.G.duracaoOnda + 's');
});

test('o deslocamento é linear na amplitude', () => {
    const s = montar();
    const a = s.W.deslocamento(0.4, 0.3, 0.6, 0.5);
    const b = s.W.deslocamento(0.4, 0.3, 0.6, 1.0);
    assert.ok(Math.abs(b - 2 * a) < 1e-9, 'a=' + a + ' b=' + b);
});

/*
É isto que faz o pano ONDULAR em vez de subir e descer em bloco: pontos
diferentes do pano estão em fases diferentes no mesmo instante.
*/
test('pontos diferentes do pano estão em fases diferentes', () => {
    const s = montar();
    const t = 0.35;
    const perto = s.W.deslocamento(t, 0.0, 0.0, 1.0);
    const longe = s.W.deslocamento(t, 1.0, 1.0, 1.0);
    assert.ok(Math.abs(perto - longe) > 1e-3,
        'os dois cantos moviam-se juntos: ' + perto + ' vs ' + longe);
});

test('amplitude cresce com a velocidade do impacto e satura em 1', () => {
    const s = montar();
    const meio = s.W.amplitudeDoImpacto(s.G.velocidadeCheia / 2);
    const cheio = s.W.amplitudeDoImpacto(s.G.velocidadeCheia);
    const acima = s.W.amplitudeDoImpacto(s.G.velocidadeCheia * 3);
    assert.ok(meio > 0 && meio < cheio, 'meio=' + meio + ' cheio=' + cheio);
    assert.strictEqual(cheio, 1);
    assert.strictEqual(acima, 1);
});

test('impacto sem velocidade não abana a rede, e nunca dá negativo', () => {
    const s = montar();
    assert.strictEqual(s.W.amplitudeDoImpacto(0), 0);
    assert.ok(s.W.amplitudeDoImpacto(-5) >= 0, 'devia ser 0, não negativo');
});
```

- [ ] **Step 2: Correr o teste e confirmar que falha**

Run: `node --test tests/goal_net.test.js`
Expected: FAIL com `Cannot find module` ou `ENOENT` — `js/goal_net.js` ainda não existe.

- [ ] **Step 3: Acrescentar as constantes ao GoalNet**

Em `js/config.js`, substitui o objecto `GoalNet` inteiro por:

```js
const GoalNet = {
    /*
    FÍSICA — não mexer sem medir. A bola já bate no pano, perde velocidade e
    escorrega até ao chão pela inclinação do pano de trás (profTopo 0.8 no
    cimo, profBase 2.0 na base). Ver Match.colidirComRede em match.js.
    */
    profTopo: 0.8,
    profBase: 2.0,
    restituicao: 0.12,
    atrito: 0.72,

    /*
    MALHA — quantos quadrados por face. Antes cada face era UM quad de quatro
    vértices, e por isso a rede não podia deformar-se: era uma chapa rígida com
    textura de rede. Os laterais são estreitos e levam menos divisões ao longo
    de u.
    */
    segmentosU: 16,
    segmentosV: 6,
    segmentosLateralU: 8,

    /*
    ONDULAÇÃO (ver NetWave em goal_net.js). O deslocamento é ao longo da normal
    da face:

        desloc = amplitude * e^(-t/tau) * sin(frequencia*t + k*(u+v))

    com tau = duracaoOnda/4, o que deixa ~1.8% da amplitude ao fim de
    duracaoOnda. `ondasPorPano` é quantas cristas cabem na diagonal do pano: é
    o que faz a ondulação PERCORRER a rede em vez de a levantar em bloco.
    */
    duracaoOnda: 5.0,
    amplitudeMax: 0.28,
    frequencia: 7.0,
    ondasPorPano: 2.5,
    velocidadeCheia: 22.0
};
```

- [ ] **Step 4: Criar o módulo com a matemática**

Cria `js/goal_net.js` com:

```js
/*
=============================================================================
NetWave — a rede da baliza a ondular depois do impacto
=============================================================================
A física da bola contra a rede é outra coisa, e vive em Match.colidirComRede
(match.js): a bola já batia, perdia velocidade e escorregava até ao chão. O
que faltava era a rede REAGIR — cada face era um quad de quatro vértices, uma
chapa rígida com textura de rede.

Aqui trata-se só do visual. Cada face regista as posições de repouso num
Float32Array próprio e, enquanto houver onda, cada frame reescreve `position`
a partir DELAS. Nunca se deforma sobre a geometria corrente: assim a rede volta
sempre exactamente ao lugar, sem deriva ao fim de vários golos.

Em repouso o custo é uma comparação por frame — ver o `update`.
=============================================================================
*/
const NetWave = {
    // { mesh, base, normal, zSinal, t, amplitude } por face registada.
    faces: [],

    /*
    Deslocamento de um ponto da grelha, ao longo da normal da face.

    Pura e sem THREE de propósito: é assim que os testes a correm em Node (ver
    tests/goal_net.test.js).

    `u` e `v` são as coordenadas da grelha em 0..1. A fase depende de (u+v), por
    isso a onda percorre o pano na diagonal em vez de o levantar todo de uma
    vez.
    */
    deslocamento: function (t, u, v, amplitude) {
        const G = GoalNet;
        const tau = G.duracaoOnda / 4;
        const envolvente = Math.exp(-t / tau);
        const k = G.ondasPorPano * Math.PI * 2;
        return amplitude * G.amplitudeMax * envolvente *
            Math.sin(G.frequencia * t + k * (u + v) * 0.5);
    },

    /*
    Quanto abana a rede, a partir da velocidade NORMAL absorvida no impacto.
    Satura em 1 para um canhão não fazer a rede explodir, e nunca devolve
    negativo.
    */
    amplitudeDoImpacto: function (velocidadeNormal) {
        const v = Math.abs(velocidadeNormal);
        return Math.max(0, Math.min(1, v / GoalNet.velocidadeCheia));
    }
};
```

- [ ] **Step 5: Correr os testes e confirmar que passam**

Run: `node --test tests/goal_net.test.js`
Expected: PASS, 9 testes.

- [ ] **Step 6: Verificar sintaxe**

Run: `node --check js/config.js && node --check js/goal_net.js`
Expected: sem saída, código de saída 0.

- [ ] **Step 7: Correr a suite toda**

Run: `node --test tests/*.test.js`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add js/config.js js/goal_net.js tests/goal_net.test.js
git commit -m "feat: add the goal net wave maths"
```

---

### Task 2: A rede ganha vértices

**Files:**
- Modify: `js/match.js:434-440` (`criarFaceRede`)
- Modify: `js/match.js:464-467` (as chamadas, para passarem os segmentos certos)
- Test: `tests/goal_net.test.js`

**Interfaces:**
- Consumes: `GoalNet.segmentosU`, `.segmentosV`, `.segmentosLateralU` da Task 1.
- Produces: `gerarGrelhaRede(p1, p2, p3, p4, repX, repY, nu, nv) → { posicoes: Float32Array, uvs: Float32Array, indices: number[] }`, pura e sem `THREE`, em `js/goal_net.js`.

- [ ] **Step 1: Escrever os testes que falham**

Acrescenta ao fim de `tests/goal_net.test.js`:

```js
/* ------------------------------------------------------------------
   A grelha bilinear que substitui o quad de quatro vértices.
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

function montarGrelha() {
    const sandbox = { Math: Math, Float32Array: Float32Array };
    vm.createContext(sandbox);
    vm.runInContext(
        recortarConst(CONFIG, 'GoalNet') + '\n' +
        recortarFuncao(NET, 'gerarGrelhaRede') + '\n' +
        'this.gerar = gerarGrelhaRede; this.G = GoalNet;', sandbox);
    return sandbox;
}

// Os quatro cantos do pano de trás de uma baliza, como em match.js.
const P1 = [-3.66, 2.44, 0.8];   // u=0, v=0
const P2 = [3.66, 2.44, 0.8];    // u=1, v=0
const P3 = [-3.66, 0, 2.0];      // u=0, v=1
const P4 = [3.66, 0, 2.0];       // u=1, v=1

function vertice(g, i) {
    return [g.posicoes[i * 3], g.posicoes[i * 3 + 1], g.posicoes[i * 3 + 2]];
}

test('a grelha tem o número certo de vértices e índices', () => {
    const s = montarGrelha();
    const nu = 4, nv = 3;
    const g = s.gerar(P1, P2, P3, P4, 30, 10, nu, nv);
    assert.strictEqual(g.posicoes.length, (nu + 1) * (nv + 1) * 3);
    assert.strictEqual(g.uvs.length, (nu + 1) * (nv + 1) * 2);
    assert.strictEqual(g.indices.length, nu * nv * 6);
});

test('os quatro cantos ficam exactamente onde estavam', () => {
    const s = montarGrelha();
    const nu = 4, nv = 3;
    const g = s.gerar(P1, P2, P3, P4, 30, 10, nu, nv);

    const idx = (iu, iv) => iv * (nu + 1) + iu;
    const perto = (a, b, onde) => {
        for (let k = 0; k < 3; k++) {
            assert.ok(Math.abs(a[k] - b[k]) < 1e-6,
                onde + ' componente ' + k + ': ' + a[k] + ' != ' + b[k]);
        }
    };

    perto(vertice(g, idx(0, 0)), P1, 'p1');
    perto(vertice(g, idx(nu, 0)), P2, 'p2');
    perto(vertice(g, idx(0, nv)), P3, 'p3');
    perto(vertice(g, idx(nu, nv)), P4, 'p4');
});

test('um ponto interior cai dentro da envolvente dos cantos', () => {
    const s = montarGrelha();
    const nu = 4, nv = 4;
    const g = s.gerar(P1, P2, P3, P4, 30, 10, nu, nv);
    const meio = vertice(g, 2 * (nu + 1) + 2);

    const eixos = [[P1[0], P2[0], P3[0], P4[0]],
                   [P1[1], P2[1], P3[1], P4[1]],
                   [P1[2], P2[2], P3[2], P4[2]]];
    for (let k = 0; k < 3; k++) {
        const lo = Math.min(...eixos[k]), hi = Math.max(...eixos[k]);
        assert.ok(meio[k] >= lo - 1e-6 && meio[k] <= hi + 1e-6,
            'componente ' + k + ' = ' + meio[k] + ' fora de [' + lo + ',' + hi + ']');
    }
});

test('o centro da grelha é a média dos quatro cantos', () => {
    const s = montarGrelha();
    // Com nu e nv pares, o vértice do meio está em u=v=0.5.
    const nu = 2, nv = 2;
    const g = s.gerar(P1, P2, P3, P4, 30, 10, nu, nv);
    const meio = vertice(g, 1 * (nu + 1) + 1);
    for (let k = 0; k < 3; k++) {
        const esperado = (P1[k] + P2[k] + P3[k] + P4[k]) / 4;
        assert.ok(Math.abs(meio[k] - esperado) < 1e-6,
            'componente ' + k + ': ' + meio[k] + ' != ' + esperado);
    }
});

test('as UVs vão de 0 às repetições pedidas', () => {
    const s = montarGrelha();
    const nu = 3, nv = 2, repX = 30, repY = 10;
    const g = s.gerar(P1, P2, P3, P4, repX, repY, nu, nv);
    const idx = (iu, iv) => iv * (nu + 1) + iu;

    assert.strictEqual(g.uvs[idx(0, 0) * 2], 0);
    assert.strictEqual(g.uvs[idx(0, 0) * 2 + 1], 0);
    assert.strictEqual(g.uvs[idx(nu, 0) * 2], repX);
    assert.strictEqual(g.uvs[idx(0, nv) * 2 + 1], repY);
});

test('todos os índices apontam para vértices que existem', () => {
    const s = montarGrelha();
    const nu = 5, nv = 4;
    const g = s.gerar(P1, P2, P3, P4, 30, 10, nu, nv);
    const nVertices = (nu + 1) * (nv + 1);
    for (const i of g.indices) {
        assert.ok(Number.isInteger(i) && i >= 0 && i < nVertices, 'índice ' + i);
    }
});

test('a grelha mais fina que existe é um único quad', () => {
    const s = montarGrelha();
    const g = s.gerar(P1, P2, P3, P4, 30, 10, 1, 1);
    assert.strictEqual(g.posicoes.length, 4 * 3);
    assert.strictEqual(g.indices.length, 6);
});
```

- [ ] **Step 2: Correr e confirmar que falha**

Run: `node --test tests/goal_net.test.js`
Expected: FAIL com `function gerarGrelhaRede nao encontrada`.

- [ ] **Step 3: Escrever o gerador da grelha**

No fim de `js/goal_net.js`, **fora** do objecto `NetWave` (é uma função global, como as de `config.js`), acrescenta:

```js
/*
Grelha de (nu+1) x (nv+1) vértices, por interpolação bilinear dos quatro cantos:

    P(u, v) = (1-u)(1-v)·p1 + u(1-v)·p2 + (1-u)v·p3 + uv·p4

Bilinear e não um PlaneGeometry transformado: as faces da rede são trapézios e
planos inclinados (ver os cantos em criarFaceRede, match.js), não rectângulos, e
a interpolação dos cantos reproduz qualquer um deles.

A ordem dos cantos é a que o código já usava: p1 em (0,0), p2 em (1,0), p3 em
(0,1), p4 em (1,1) — o que os índices antigos [0,1,2, 1,3,2] implicavam.

Pura e sem THREE: quem chama monta o BufferGeometry com o que isto devolve.
*/
function gerarGrelhaRede(p1, p2, p3, p4, repX, repY, nu, nv) {
    const nVertices = (nu + 1) * (nv + 1);
    const posicoes = new Float32Array(nVertices * 3);
    const uvs = new Float32Array(nVertices * 2);
    const indices = [];

    for (let iv = 0; iv <= nv; iv++) {
        const v = iv / nv;
        for (let iu = 0; iu <= nu; iu++) {
            const u = iu / nu;
            const i = iv * (nu + 1) + iu;

            const a = (1 - u) * (1 - v), b = u * (1 - v);
            const c = (1 - u) * v, d = u * v;

            for (let k = 0; k < 3; k++) {
                posicoes[i * 3 + k] = a * p1[k] + b * p2[k] + c * p3[k] + d * p4[k];
            }

            uvs[i * 2] = u * repX;
            uvs[i * 2 + 1] = v * repY;
        }
    }

    for (let iv = 0; iv < nv; iv++) {
        for (let iu = 0; iu < nu; iu++) {
            const i0 = iv * (nu + 1) + iu;
            const i1 = i0 + 1;
            const i2 = i0 + (nu + 1);
            const i3 = i2 + 1;
            // Mesma orientação dos dois triângulos do quad antigo.
            indices.push(i0, i1, i2, i1, i3, i2);
        }
    }

    return { posicoes: posicoes, uvs: uvs, indices: indices };
}
```

- [ ] **Step 4: Correr os testes e confirmar que passam**

Run: `node --test tests/goal_net.test.js`
Expected: PASS, 16 testes.

- [ ] **Step 5: Ligar a grelha ao criarFaceRede**

Em `js/match.js`, substitui a função `criarFaceRede` inteira por:

```js
        /*
        Uma face da rede. Passou de um quad de QUATRO vértices para uma grelha
        (ver gerarGrelhaRede em goal_net.js): sem vértices pelo meio, a rede não
        podia deformar-se — era uma chapa rígida com textura de rede.

        Os cantos, as UVs e o aspecto em repouso são os mesmos; só há mais
        vértices entre eles.
        */
        function criarFaceRede(p1, p2, p3, p4, repX, repY, nu, nv) {
            const g = gerarGrelhaRede(p1, p2, p3, p4, repX, repY,
                nu || GoalNet.segmentosU, nv || GoalNet.segmentosV);

            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(g.posicoes, 3));
            geo.setAttribute('uv', new THREE.BufferAttribute(g.uvs, 2));
            geo.setIndex(g.indices);
            geo.computeVertexNormals();
            return new THREE.Mesh(geo, matRede);
        }
```

- [ ] **Step 6: Passar os segmentos dos laterais**

Em `js/match.js`, as duas linhas que criam as faces:

```js
            const redeCima = criarFaceRede(tLE, tLD, tTE, tTD, 30, 4); const redeTras = criarFaceRede(tTE, tTD, bTE, bTD, 30, 10);
            const redeEsq = criarFaceRede(bFE, tLE, bTE, tTE, 8, 10); const redeDir = criarFaceRede(tLD, bFD, tTD, bTD, 8, 10);
```

passam a

```js
            const S = GoalNet;
            // Os laterais são estreitos: menos divisões ao longo de u.
            const redeCima = criarFaceRede(tLE, tLD, tTE, tTD, 30, 4, S.segmentosU, S.segmentosV);
            const redeTras = criarFaceRede(tTE, tTD, bTE, bTD, 30, 10, S.segmentosU, S.segmentosV);
            const redeEsq = criarFaceRede(bFE, tLE, bTE, tTE, 8, 10, S.segmentosLateralU, S.segmentosV);
            const redeDir = criarFaceRede(tLD, bFD, tTD, bTD, 8, 10, S.segmentosLateralU, S.segmentosV);
```

- [ ] **Step 7: Carregar o módulo novo**

Em `index.html`, acrescenta antes da linha `<script src="js/match.js"></script>`:

```html
    <script src="js/goal_net.js"></script>
```

`goal_net.js` lê `GoalNet`, que vem de `js/config.js`, e é lido pelo `js/match.js` — tem de ficar entre os dois.

- [ ] **Step 8: Verificar sintaxe**

Run: `node --check js/match.js && node --check js/goal_net.js`
Expected: sem saída, código de saída 0.

- [ ] **Step 9: Confirmar a ordem dos scripts**

Run: `grep -n "goal_net.js\|config.js\|js/match.js" index.html`
Expected: `config.js` antes de `goal_net.js`, e `goal_net.js` antes de `match.js`.

- [ ] **Step 10: Correr a suite toda**

Run: `node --test tests/*.test.js`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add js/match.js js/goal_net.js index.html tests/goal_net.test.js
git commit -m "feat: give the goal net a subdivided mesh"
```

---

### Task 3: A rede a mexer-se

**Files:**
- Modify: `js/goal_net.js` (`registarFace`, `bater`, `update`)
- Modify: `js/match.js` (registar cada face; disparar no impacto; chamar o update)

**Interfaces:**
- Consumes: `NetWave.deslocamento`, `NetWave.amplitudeDoImpacto` e `GoalNet.duracaoOnda` da Task 1; `gerarGrelhaRede` da Task 2.
- Produces:
  - `NetWave.registarFace(mesh, zSinal, normal, nu, nv)` — `normal` é `{ x, y, z }`, unitário.
  - `NetWave.bater(zSinal, velocidadeNormal)`.
  - `NetWave.update(dt)`.

- [ ] **Step 1: Escrever os métodos do NetWave**

Em `js/goal_net.js`, dentro do objecto `NetWave`, a seguir a `amplitudeDoImpacto`, acrescenta:

```js
    /*
    Regista uma face para poder ser animada. `base` é a cópia das posições de
    repouso: é sempre DELAS que se parte, nunca da geometria corrente, senão a
    deformação acumulava e a rede nunca voltava ao lugar.
    */
    registarFace: function (mesh, zSinal, normal, nu, nv) {
        const attr = mesh.geometry.attributes.position;
        this.faces.push({
            mesh: mesh,
            attr: attr,
            base: new Float32Array(attr.array),
            normal: normal,
            zSinal: zSinal,
            nu: nu,
            nv: nv,
            t: 0,
            amplitude: 0,
            activa: false
        });
    },

    /*
    A bola bateu nesta baliza. Reinicia o relógio e fica com a MAIOR das
    amplitudes, em vez de as somar: somar deixava a rede a crescer sem limite
    numa sequência de remates.
    */
    bater: function (zSinal, velocidadeNormal) {
        const a = this.amplitudeDoImpacto(velocidadeNormal);
        if (a <= 0) return;

        for (const f of this.faces) {
            if (f.zSinal !== zSinal) continue;
            f.amplitude = f.activa ? Math.max(f.amplitude, a) : a;
            f.t = 0;
            f.activa = true;
        }
    },

    /*
    Sai IMEDIATAMENTE se nenhuma face está a abanar: em repouso o custo é uma
    comparação por frame, e a malha mais densa não pesa nada enquanto ninguém
    marcar.
    */
    update: function (dt) {
        if (!this.faces.length) return;

        let algumaActiva = false;
        for (const f of this.faces) { if (f.activa) { algumaActiva = true; break; } }
        if (!algumaActiva) return;

        const dur = GoalNet.duracaoOnda;

        for (const f of this.faces) {
            if (!f.activa) continue;

            f.t += dt;
            const acabou = f.t >= dur;

            const base = f.base, arr = f.attr.array;
            const largura = f.nu + 1;

            for (let i = 0; i < largura * (f.nv + 1); i++) {
                const iu = i % largura, iv = (i / largura) | 0;
                const u = iu / f.nu, v = iv / f.nv;

                const d = acabou ? 0 : this.deslocamento(f.t, u, v, f.amplitude);

                arr[i * 3] = base[i * 3] + f.normal.x * d;
                arr[i * 3 + 1] = base[i * 3 + 1] + f.normal.y * d;
                arr[i * 3 + 2] = base[i * 3 + 2] + f.normal.z * d;
            }

            f.attr.needsUpdate = true;
            // Uma última passagem já pôs tudo no repouso exacto: pode parar.
            if (acabou) { f.activa = false; f.amplitude = 0; }
        }
    },
```

- [ ] **Step 2: Verificar sintaxe**

Run: `node --check js/goal_net.js`
Expected: sem saída, código de saída 0.

- [ ] **Step 3: Registar as faces ao criar a baliza**

Em `js/match.js`, a seguir à linha que agrupa as redes:

```js
            const redes = new THREE.Group(); redes.add(redeCima, redeTras, redeEsq, redeDir);
```

acrescenta:

```js
            /*
            Regista as faces no NetWave para poderem ondular. A normal de cada
            uma é aproximada pelo eixo dominante: chega para o deslocamento
            visual, e evita ter de recalcular normais por vértice a cada frame.
            */
            if (typeof NetWave !== 'undefined') {
                const S2 = GoalNet;
                NetWave.registarFace(redeCima, lado, { x: 0, y: 1, z: 0 }, S2.segmentosU, S2.segmentosV);
                NetWave.registarFace(redeTras, lado, { x: 0, y: 0, z: 1 }, S2.segmentosU, S2.segmentosV);
                NetWave.registarFace(redeEsq, lado, { x: 1, y: 0, z: 0 }, S2.segmentosLateralU, S2.segmentosV);
                NetWave.registarFace(redeDir, lado, { x: 1, y: 0, z: 0 }, S2.segmentosLateralU, S2.segmentosV);
            }
```

- [ ] **Step 4: Disparar a onda no impacto**

Em `js/match.js`, dentro de `colidirComRede`, no ramo do pano de trás, o bloco

```js
                if (dist > 0 && vn < 0) { // Bola vem de fora para dentro
```

é o impacto real. Imediatamente a seguir a essa linha de abertura, acrescenta:

```js
                    // A rede abana: quanto mais forte a componente normal, mais.
                    if (typeof NetWave !== 'undefined') NetWave.bater(zSinal, vn);
```

- [ ] **Step 5: Chamar o update no laço do Match**

Em `js/match.js`, dentro de `Match.update`, a seguir à linha

```js
        this.updateBall();
```

acrescenta:

```js
        // Sai sozinho quando nenhuma rede está a abanar (ver NetWave.update).
        if (typeof NetWave !== 'undefined') NetWave.update(dt);
```

- [ ] **Step 6: Verificar sintaxe**

Run: `node --check js/match.js && node --check js/goal_net.js`
Expected: sem saída, código de saída 0.

- [ ] **Step 7: Confirmar que a física não foi tocada**

Run: `grep -n "restituicao\|atrito" js/config.js | head -6`
Expected: `GoalNet.restituicao` continua 0.12 e `GoalNet.atrito` 0.72.

Run: `node --test tests/goal_net.test.js`
Expected: PASS — o teste `a física da bola ficou intacta` cobre isto.

- [ ] **Step 8: Correr a suite toda**

Run: `node --test tests/*.test.js`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add js/goal_net.js js/match.js
git commit -m "feat: ripple the goal net for five seconds after the ball hits it"
```

---

### Task 4: Documentação e verificação no jogo

**Files:**
- Modify: `docs/filesSummary.md`

**Interfaces:**
- Consumes: tudo o que as Tasks 1 a 3 produziram.
- Produces: nada.

- [ ] **Step 1: Documentar**

Procura a entrada do `GoalNet` (`grep -n "GoalNet" docs/filesSummary.md`) e substitui-a por, ou acrescenta na secção do `config.js` no formato dos vizinhos:

```markdown
- **`GoalNet`** — a rede da baliza, em duas metades independentes.
  - **Física** (`profTopo` 0.8, `profBase` 2.0, `restituicao` 0.12, `atrito`
    0.72): `Match.colidirComRede` empurra a bola para dentro do pano, absorve a
    componente normal e trava a tangencial. É a inclinação do pano de trás que
    faz a bola descer até ao chão em vez de parar onde bateu.
  - **Ondulação** (`NetWave`, em `js/goal_net.js`): `segmentosU`/`segmentosV`
    dão os vértices — cada face era um quad de QUATRO, e por isso a rede não
    podia deformar-se. O deslocamento é ao longo da normal,
    `amplitude · e^(−t/tau) · sin(frequencia·t + k·(u+v))`, com `tau =
    duracaoOnda/4` (~1.8% da amplitude aos 5 s). A fase depende de `u+v`, e é
    isso que faz a onda **percorrer** o pano em vez de o levantar em bloco.
  - Cada face guarda as posições de repouso num `Float32Array` e parte sempre
    delas; nunca se deforma sobre a geometria corrente, senão acumulava e a rede
    não voltava ao lugar. `NetWave.update` sai numa comparação enquanto nenhuma
    rede abana, por isso a malha mais densa não custa nada em repouso.
```

- [ ] **Step 2: Commit da documentação**

```bash
git add docs/filesSummary.md
git commit -m "docs: describe the goal net wave"
```

- [ ] **Step 3: Arrancar o servidor**

Run: `npm run dev`
Abre o endereço que ele imprime e carrega em Continue — o jogo abre em pausa de propósito.

- [ ] **Step 4: Confirmar que a rede está igual em repouso**

Antes de qualquer golo, olha para as duas balizas. A rede deve estar exactamente como estava: mesmos cantos, mesma textura, mesma inclinação. Se mudou de forma, a interpolação bilinear trocou a ordem dos cantos.

- [ ] **Step 5: Ver a rede a abanar**

Espera por um golo. A rede deve ondular no impacto e ir acalmando ao longo de cerca de cinco segundos. Como a sequência de golo dura 4.5 s antes do recomeço, ela ainda estará a oscilar de forma quase imperceptível quando o jogo recomeça — foi assumido de propósito.

- [ ] **Step 6: Comparar remate forte e bola mansa**

Um remate de fora da área deve abanar bem mais do que uma bola que entra a rolar. Se abanarem igual, `NetWave.bater` não está a receber a velocidade normal.

- [ ] **Step 7: Confirmar que a bola continua a descer pelo pano**

A trajectória da bola não foi tocada por este trabalho. Ela deve continuar a bater, perder velocidade e escorregar até ao chão. Se mudou alguma coisa, algo em `colidirComRede` foi alterado para lá da linha do disparo.

- [ ] **Step 8: Confirmar que a rede volta ao lugar**

Depois de três ou quatro golos na mesma baliza, olha para a rede parada. Tem de estar idêntica ao estado inicial. Se ficou deformada, a deformação está a ser aplicada sobre a geometria corrente em vez das posições de repouso.
