# Passe à frente do recebedor — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a bola chegar à frente do companheiro em vez de ao pé parado, para o jogo deixar de travar a cada passe.

**Architecture:** Duas mudanças independentes. A tabela de misturas de `PassTypeModel` passa a pedir a bola à frente por omissão, com uma regra nova que manda os recuos aos pés. E o passe à frente deixa de depender do leque de candidatos: quando nenhum ponto do leque é validado, `pontoPara` cai num ponto curto projectado à frente do companheiro, em vez de cair no passe aos pés.

**Tech Stack:** JavaScript de browser em scripts clássicos, sem build nem módulos. `js/pass_types.js` já exporta em Node por `module.exports`, e `tests/pass_types.test.js` já tem o harness montado — recorta o `PassTypeModel` de `js/config.js` para um sandbox `node:vm` e importa `PassTypes` por `require`.

## Global Constraints

- Sem passos de build. Os ficheiros em `js/` são carregados como `<script>` clássicos por `index.html`; tudo é global, nada de `import`/`export` fora do `module.exports` condicional que o `pass_types.js` já tem no fim.
- **Nada em `js/pass_types.js` pode usar `THREE`.** O ficheiro é importado directamente pelos testes em Node, onde `THREE` não existe. A frente do companheiro sai do quaternião por aritmética, não por `applyQuaternion`.
- Os testes correm com `node --test tests/*.test.js` (o `node --test tests/` simples não resolve o diretório neste Node em Windows). Não há script `test` em `package.json`.
- O código e os comentários do repositório estão em português europeu. Segue o mesmo registo.
- `CAMPO_LARG` vale 68 e `CAMPO_COMP` vale 106 (`js/config.js:127`). O harness de teste define `CAMPO_COMP = 105` no sandbox; não mexas nisso, não é usado pelo que este plano acrescenta.
- Referencial de ataque: `zAtk = z * dirZ`. `sectorDe` corta nos terços (`CAMPO_COMP / 6`), `corredorDe` em `PassTypeModel.larguraCentro` (10 m).
- Os três tipos são exactamente `PassTypes.DIRECT` (`'direct'`), `PassTypes.SPACE` (`'space'`) e `PassTypes.LEADING` (`'leading'`).

---

### Task 1: Misturas novas e a regra de recuo

**Files:**
- Modify: `js/config.js` — `PassTypeModel` (o objecto `regras`, a `misturaPadrao`, constantes novas)
- Modify: `js/pass_types.js` — `zonaDe`
- Test: `tests/pass_types.test.js` (actualizar os testes de mistura existentes e acrescentar os novos)

**Interfaces:**
- Consumes: nada de tarefas anteriores.
- Produces:
  - `PassTypes.zonaDe(x, zAtk)` passa a devolver `{ sector, corredor, avanco }`, onde `avanco` é o `zAtk` recebido. `sector` e `corredor` não mudam.
  - `PassTypeModel.margemRecuo`, `PassTypeModel.liderancaCurta`, `PassTypeModel.liderancaPasso`, `PassTypeModel.liderancaMin` — todos números. As três últimas só são usadas na Task 2.

- [ ] **Step 1: Actualizar os testes de mistura que vão passar a falhar**

Sete asserções em `tests/pass_types.test.js` fixam a tabela antiga. Substitui os quatro testes seguintes, na íntegra, pelas versões abaixo.

Substitui `test('centro para centro: 80% direct, 20% into space', ...)` por:

```js
test('centro para centro: 30% direct, 35% into space, 35% leading', () => {
    for (const sec of ['def', 'mid']) {
        for (const dest of ['def', 'mid']) {
            // Só destinos que NÃO recuam mais que a margem, senão casa a
            // regra do recuo, que corre antes desta.
            if (sec === 'mid' && dest === 'def') continue;
            const m = PassTypes.misturaPara(
                zonaCalc(zona('centro', sec)), zonaCalc(zona('centro', dest)));
            assert.deepStrictEqual(plano(m),
                { direct: 0.3, space: 0.35, leading: 0.35 }, sec + '->' + dest);
        }
    }
});
```

Substitui `test('centro para o lado, a progredir: 80% into space, 20% leading', ...)` por:

```js
test('centro para o lado, a progredir: 55% into space, 35% leading', () => {
    const defMid = PassTypes.misturaPara(
        zonaCalc(zona('centro', 'def')), zonaCalc(zona('lado', 'mid')));
    const midAtk = PassTypes.misturaPara(
        zonaCalc(zona('centro', 'mid')), zonaCalc(zona('lado', 'atk')));
    assert.deepStrictEqual(plano(defMid), { direct: 0.1, space: 0.55, leading: 0.35 });
    assert.deepStrictEqual(plano(midAtk), { direct: 0.1, space: 0.55, leading: 0.35 });
});
```

Substitui `test('a partir do ataque: 60% into space, 40% direct', ...)` por:

```js
test('a partir do ataque: 45% into space, 30% leading, 25% direct', () => {
    // 'centro'/'mid' sai da lista: com origem no ataque é recuo, e a regra
    // do recuo corre primeiro.
    for (const dest of [zona('centro', 'atk'), zona('lado', 'atk')]) {
        const m = PassTypes.misturaPara(zonaCalc(zona('centro', 'atk')), zonaCalc(dest));
        assert.deepStrictEqual(plano(m), { direct: 0.25, space: 0.45, leading: 0.3 });
    }
});
```

Substitui `test('o resto herda 80% direct / 20% into space', ...)` por:

```js
test('o resto herda 30% direct / 35% into space / 35% leading', () => {
    // Lateral dentro do mesmo sector: não progride, mas também não recua.
    const lateral = PassTypes.misturaPara(
        zonaCalc(zona('lado', 'mid')), zonaCalc(zona('lado', 'mid')));
    assert.deepStrictEqual(plano(lateral),
        { direct: 0.3, space: 0.35, leading: 0.35 });
});
```

- [ ] **Step 2: Escrever os testes novos**

Acrescenta ao fim de `tests/pass_types.test.js`:

```js
/* ------------------------------------------------------------------
   Recuo: a bola vai aos pés quando o passe é para trás.
   ------------------------------------------------------------------ */

// zonaCalc/zona só sabem construir zonas por sector; para o recuo interessa
// o avanço em metros, por isso constrói-se a zona directamente.
const zonaEm = (x, zAtk) => PassTypes.zonaDe(x, zAtk);

test('zonaDe devolve o avanço recebido, sem mexer no resto', () => {
    const z = PassTypes.zonaDe(20, -30);
    assert.strictEqual(z.avanco, -30);
    assert.strictEqual(z.sector, 'def');
    assert.strictEqual(z.corredor, 'lado');
});

test('passe para trás casa a regra do recuo', () => {
    const m = PassTypes.misturaPara(zonaEm(0, 20), zonaEm(0, 5));
    assert.deepStrictEqual(plano(m), { direct: 0.85, space: 0.15 });
});

test('passe lateral puro NÃO é recuo', () => {
    const m = PassTypes.misturaPara(zonaEm(-20, 10), zonaEm(20, 10));
    assert.notStrictEqual(m.direct, 0.85, 'mesmo avanço não devia ser recuo');
});

test('recuo mais curto que a margem NÃO conta como recuo', () => {
    const dentro = PassTypeModel.margemRecuo - 0.5;
    const m = PassTypes.misturaPara(zonaEm(0, 10), zonaEm(0, 10 - dentro));
    assert.notStrictEqual(m.direct, 0.85);
});

test('a regra do recuo ganha à do ataque (ordem das regras)', () => {
    // Origem no ataque, destino bem atrás: sem a ordem certa cairia em
    // origemAtaque e a bola ia para o espaço, à frente de quem recebe.
    const m = PassTypes.misturaPara(zonaEm(0, 30), zonaEm(0, 5));
    assert.deepStrictEqual(plano(m), { direct: 0.85, space: 0.15 });
});

test('a maioria das misturas pede a bola à frente', () => {
    const aFrente = (m) => (m.space || 0) + (m.leading || 0);
    // A do recuo é a única excepção, e é essa a intenção.
    for (const r of PassTypeModel.regras) {
        if (r.nome === 'recuo') {
            assert.ok(aFrente(r.mistura) < 0.5, 'recuo devia ir aos pés');
        } else {
            assert.ok(aFrente(r.mistura) >= 0.7, r.nome + ' só tem ' + aFrente(r.mistura));
        }
    }
    assert.ok(aFrente(PassTypeModel.misturaPadrao) >= 0.7, 'a padrão é a que mais dispara');
});

test('as constantes do leading curto existem e são coerentes', () => {
    for (const k of ['margemRecuo', 'liderancaCurta', 'liderancaPasso', 'liderancaMin']) {
        assert.strictEqual(typeof PassTypeModel[k], 'number', k + ' em falta');
        assert.ok(PassTypeModel[k] > 0, k + ' devia ser positivo');
    }
    assert.ok(PassTypeModel.liderancaMin < PassTypeModel.liderancaCurta,
        'o mínimo tem de ser menor que a distância cheia');
});
```

- [ ] **Step 3: Correr e confirmar que falha**

Run: `node --test tests/pass_types.test.js`
Expected: FAIL. Vários testes falham — os de mistura porque a tabela ainda é a antiga, e os do recuo porque `zonaDe` ainda não devolve `avanco`.

- [ ] **Step 4: Acrescentar o avanço a zonaDe**

Em `js/pass_types.js`, substitui:

```js
    zonaDe: function (x, zAtk) {
        return { sector: this.sectorDe(zAtk), corredor: this.corredorDe(x) };
    },
```

por:

```js
    /*
    `avanco` é o zAtk cru, em metros. Sem ele a tabela de misturas só sabia
    em que terço cada ponta está, e um passe para trás dentro do mesmo terço
    era indistinguível de um passe para a frente — caía na misturaPadrao e
    era jogado no espaço, à frente de quem recebe.
    */
    zonaDe: function (x, zAtk) {
        return { sector: this.sectorDe(zAtk), corredor: this.corredorDe(x), avanco: zAtk };
    },
```

- [ ] **Step 5: Trocar a tabela de misturas**

Em `js/config.js`, dentro de `PassTypeModel`, substitui o bloco `regras` inteiro e a `misturaPadrao` por:

```js
    /*
    Ordem importa. `recuo` vem primeiro: um passe para trás é para segurar a
    bola, e jogá-lo no espaço à frente de quem recebe manda-o correr para longe
    da linha que veio dar. `defParaAtk` tem de ser vista antes de `origemAtaque`,
    senão um passe longo de trás cairia na regra do ataque.

    A tabela foi invertida: dava 80% de bola aos pés na misturaPadrao — a regra
    que apanha a maioria dos passes — e `leading` só aparecia em duas regras
    estreitas. O jogo travava a cada passe.
    */
    regras: [
        // Passe para trás: aos pés, para segurar.
        { nome: 'recuo', quando: (o, d) => d.avanco < o.avanco - PassTypeModel.margemRecuo,
          mistura: { direct: 0.85, space: 0.15 } },

        // Defesa a saltar o meio-campo, directo para o ataque.
        { nome: 'defParaAtk', quando: (o, d) => o.sector === 'def' && d.sector === 'atk',
          mistura: { space: 0.5, leading: 0.5 } },

        // Já no ataque: lá dentro ou a abrir nas pontas.
        { nome: 'origemAtaque', quando: (o) => o.sector === 'atk',
          mistura: { direct: 0.25, space: 0.45, leading: 0.3 } },

        // Progressão pelo centro a abrir para o lado (def->mid, mid->atk).
        { nome: 'centroParaLado',
          quando: (o, d) => o.corredor === 'centro' && d.corredor === 'lado' &&
                            ((o.sector === 'def' && d.sector === 'mid') ||
                             (o.sector === 'mid' && d.sector === 'atk')),
          mistura: { direct: 0.1, space: 0.55, leading: 0.35 } },

        // Dentro do corredor central, em qualquer sector.
        { nome: 'centroParaCentro',
          quando: (o, d) => o.corredor === 'centro' && d.corredor === 'centro',
          mistura: { direct: 0.3, space: 0.35, leading: 0.35 } }
    ],

    // Tudo o resto (passes laterais dentro do mesmo sector, etc.).
    misturaPadrao: { direct: 0.3, space: 0.35, leading: 0.35 },
```

Nota: a regra `recuo` lê `PassTypeModel.margemRecuo` pelo nome do objecto, não por `this` — as funções `quando` são chamadas como `r.quando(o, d)`, sem receptor, e um `this.margemRecuo` daria `undefined`.

- [ ] **Step 6: Acrescentar as constantes**

Ainda em `PassTypeModel`, logo a seguir a `larguraCentro`, acrescenta:

```js
    /*
    Recuo: quantos metros o destino tem de estar ATRÁS da origem para o passe
    contar como para trás. Sem esta margem, um passe lateral com meio metro de
    diferença virava recuo e ia aos pés.
    */
    margemRecuo: 2.0,

    /*
    LEADING CURTO — o passe à frente que não precisa do leque de candidatos.

    Quando nenhum ponto do PlayerPassTarget é validado (adversário a menos de
    2 m, linha de passe tapada, ponto a mais de 30 m da bola), o passe caía aos
    pés. Num bloco compacto isso é a maior parte das vezes, e era daí que vinha
    a sensação de jogo travado.

    `liderancaCurta` é a distância cheia à frente do companheiro; perante um
    adversário encurta-se de `liderancaPasso` de cada vez, até `liderancaMin`.
    */
    liderancaCurta: 4.0,
    liderancaPasso: 1.0,
    liderancaMin: 1.5,
```

- [ ] **Step 7: Correr os testes e confirmar que passam**

Run: `node --test tests/pass_types.test.js`
Expected: PASS.

- [ ] **Step 8: Correr a suite toda**

Run: `node --test tests/*.test.js`
Expected: PASS. Repara em `tests/player_findpasstarget.test.js`, que também toca no sistema de passe.

- [ ] **Step 9: Verificar sintaxe**

Run: `node --check js/config.js && node --check js/pass_types.js`
Expected: sem saída, código de saída 0.

- [ ] **Step 10: Commit**

```bash
git add js/config.js js/pass_types.js tests/pass_types.test.js
git commit -m "feat: ask for the ball ahead of the receiver by default"
```

---

### Task 2: O ponto curto à frente, sem depender do leque

**Files:**
- Modify: `js/pass_types.js` (duas funções novas, antes de `pontoPara`)
- Test: `tests/pass_types.test.js`

**Interfaces:**
- Consumes: `PassTypeModel.liderancaCurta`, `.liderancaPasso`, `.liderancaMin` da Task 1.
- Produces:
  - `PassTypes.frenteDe(mate) → { fx, fz }`, vector unitário.
  - `PassTypes.pontoLiderancaCurta(mate, opponents) → { x, z, curto: true } | null`.

- [ ] **Step 1: Escrever os testes que falham**

Acrescenta ao fim de `tests/pass_types.test.js`:

```js
/* ------------------------------------------------------------------
   Leading curto: o ponto à frente que não passa pelo leque.
   ------------------------------------------------------------------ */

/*
Companheiro de teste. `quaternion` é uma rotação em torno de Y de `ang`
radianos, na convenção do THREE: (0, sin(ang/2), 0, cos(ang/2)). Com ang=0 a
frente local +Z fica a apontar para +Z do mundo.

Não se usa THREE aqui de propósito: js/pass_types.js é importado em Node, onde
ele não existe, e por isso a frente sai do quaternião por aritmética.
*/
function mateVirado(x, z, ang, id) {
    return {
        id: id === undefined ? 99 : id,
        dirZ: 1,
        model: {
            position: { x: x, z: z },
            quaternion: { x: 0, y: Math.sin(ang / 2), z: 0, w: Math.cos(ang / 2) }
        }
    };
}

const opp = (x, z) => ({ role: 'def', model: { position: { x: x, z: z } } });

test('frenteDe lê a orientação do modelo', () => {
    const f0 = PassTypes.frenteDe(mateVirado(0, 0, 0));
    assert.ok(Math.abs(f0.fx - 0) < 1e-9, 'fx = ' + f0.fx);
    assert.ok(Math.abs(f0.fz - 1) < 1e-9, 'fz = ' + f0.fz);

    const f90 = PassTypes.frenteDe(mateVirado(0, 0, Math.PI / 2));
    assert.ok(Math.abs(f90.fx - 1) < 1e-9, 'fx = ' + f90.fx);
    assert.ok(Math.abs(f90.fz - 0) < 1e-9, 'fz = ' + f90.fz);
});

test('frenteDe cai no eixo de ataque quando não há quaternião', () => {
    const semModelo = { id: 1, dirZ: -1, model: { position: { x: 0, z: 0 } } };
    const f = PassTypes.frenteDe(semModelo);
    assert.strictEqual(f.fx, 0);
    assert.strictEqual(f.fz, -1);
});

test('o ponto curto fica à frente do companheiro, à distância pedida', () => {
    const m = mateVirado(0, 0, 0);
    const pt = PassTypes.pontoLiderancaCurta(m, []);
    assert.ok(pt, 'devia ter devolvido um ponto');
    assert.ok(Math.abs(pt.z - PassTypeModel.liderancaCurta) < 1e-9, 'z = ' + pt.z);
    assert.ok(Math.abs(pt.x) < 1e-9, 'x = ' + pt.x);
});

test('o ponto curto nunca fica atrás do companheiro', () => {
    for (const ang of [0, 0.7, Math.PI / 2, 2.5, Math.PI, -1.2]) {
        const m = mateVirado(5, -8, ang);
        const pt = PassTypes.pontoLiderancaCurta(m, []);
        if (!pt) continue;
        const f = PassTypes.frenteDe(m);
        // Projecção do deslocamento na frente do jogador: tem de ser positiva.
        const proj = (pt.x - 5) * f.fx + (pt.z - (-8)) * f.fz;
        assert.ok(proj > 0, 'ang=' + ang + ' deu projecção ' + proj);
    }
});

test('o ponto curto vem marcado como curto', () => {
    const pt = PassTypes.pontoLiderancaCurta(mateVirado(0, 0, 0), []);
    assert.strictEqual(pt.curto, true);
});

test('encurta perante um adversário em cima do ponto cheio', () => {
    const m = mateVirado(0, 0, 0);
    // Adversário exactamente onde cairia o ponto de 4 m.
    const pt = PassTypes.pontoLiderancaCurta(m, [opp(0, PassTypeModel.liderancaCurta)]);
    assert.ok(pt, 'devia ter encurtado, não desistido');
    assert.ok(pt.z < PassTypeModel.liderancaCurta, 'não encurtou: z = ' + pt.z);
    assert.ok(pt.z >= PassTypeModel.liderancaMin - 1e-9, 'passou o mínimo: z = ' + pt.z);
});

test('desiste quando o corredor à frente está todo tapado', () => {
    const m = mateVirado(0, 0, 0);
    // Adversários a cobrir todas as distâncias entre o mínimo e a cheia.
    const tapado = [];
    for (let d = 1; d <= 5; d += 0.5) tapado.push(opp(0, d));
    assert.strictEqual(PassTypes.pontoLiderancaCurta(m, tapado), null);
});

test('desiste quando o ponto cairia fora do campo', () => {
    // Encostado à linha de fundo, virado para fora.
    const m = mateVirado(0, CAMPO_COMP / 2 - 0.5, 0);
    assert.strictEqual(PassTypes.pontoLiderancaCurta(m, []), null);
});

test('desiste quando o ponto cairia fora da linha lateral', () => {
    // Encostado à lateral, virado para fora (90 graus = +X).
    const m = mateVirado(CAMPO_LARG / 2 - 0.5, 0, Math.PI / 2);
    assert.strictEqual(PassTypes.pontoLiderancaCurta(m, []), null);
});

test('guarda-redes não conta como adversário a tapar', () => {
    const m = mateVirado(0, 0, 0);
    const gk = { role: 'gk', model: { position: { x: 0, z: PassTypeModel.liderancaCurta } } };
    const pt = PassTypes.pontoLiderancaCurta(m, [gk]);
    assert.ok(Math.abs(pt.z - PassTypeModel.liderancaCurta) < 1e-9,
        'não devia ter encurtado por causa do GR');
});
```

O harness já define `CAMPO_COMP` como global; acrescenta `CAMPO_LARG` ao lado dele. Perto do topo do ficheiro, a linha

```js
global.CAMPO_COMP = 105;
```

passa a

```js
global.CAMPO_COMP = 105;
global.CAMPO_LARG = 68;
```

e no objecto `sandbox`, `{ CAMPO_COMP: 105, Math }` passa a `{ CAMPO_COMP: 105, CAMPO_LARG: 68, Math }`.

- [ ] **Step 2: Correr e confirmar que falha**

Run: `node --test tests/pass_types.test.js`
Expected: FAIL com `PassTypes.frenteDe is not a function`.

- [ ] **Step 3: Escrever as duas funções**

Em `js/pass_types.js`, imediatamente antes de `pontoPara`, acrescenta:

```js
    /*
    Frente do companheiro: para onde o CORPO dele aponta, no plano.

    Mesma convenção do leque em pass_candidates.js — frente local é +Z — mas
    calculada à mão em vez de com applyQuaternion: este ficheiro é importado
    directamente pelos testes em Node, onde o THREE não existe.

    Rodar (0,0,1) por um quaternião (x,y,z,w) dá, nas componentes do plano:
        fx = 2*(x*z + w*y)
        fz = 1 - 2*(x*x + y*y)

    Sem quaternião (ou com um degenerado) fica o eixo de ataque da equipa, que
    é o mesmo recurso que o leque usa.
    */
    frenteDe: function (mate) {
        const q = mate.model && mate.model.quaternion;
        if (q) {
            const fx = 2 * (q.x * q.z + q.w * q.y);
            const fz = 1 - 2 * (q.x * q.x + q.y * q.y);
            const len = Math.hypot(fx, fz);
            if (len > 0.001) return { fx: fx / len, fz: fz / len };
        }
        return { fx: 0, fz: mate.dirZ || 1 };
    },

    /*
    Ponto de mira alguns metros à frente do companheiro, SEM passar pelo leque
    de candidatos nem pelos filtros dele.

    É o que impede o passe de cair aos pés sempre que o leque vem vazio — num
    bloco compacto, a maior parte das vezes. Encurta perante um adversário em
    vez de desistir; só devolve null se nem à distância mínima houver espaço,
    ou se o ponto sair do campo.

    O `curto: true` distingue-o de um ponto do leque: quem consome usa-o para
    escolher a balística (ver aplicarMiraDoPasse em bt/player_bt.js) — uma bola
    de 4 m não se joga com a lentidão de um lançamento de 20.
    */
    pontoLiderancaCurta: function (mate, opponents) {
        if (!mate || !mate.model || typeof PassTypeModel === 'undefined') return null;

        const M = PassTypeModel;
        const raio = (typeof PassCandidates !== 'undefined')
            ? PassCandidates.raioAdversario : 2.0;

        const f = this.frenteDe(mate);
        const mx = mate.model.position.x, mz = mate.model.position.z;
        const meiaLarg = CAMPO_LARG / 2, meioComp = CAMPO_COMP / 2;
        const lista = opponents || [];

        for (let d = M.liderancaCurta; d >= M.liderancaMin - 1e-9; d -= M.liderancaPasso) {
            const px = mx + f.fx * d;
            const pz = mz + f.fz * d;

            if (Math.abs(px) > meiaLarg || Math.abs(pz) > meioComp) continue;

            let livre = true;
            for (const o of lista) {
                if (!o || o.role === 'gk' || !o.model) continue;
                if (Math.hypot(o.model.position.x - px, o.model.position.z - pz) < raio) {
                    livre = false;
                    break;
                }
            }
            if (livre) return { x: px, z: pz, curto: true };
        }

        return null;
    },
```

- [ ] **Step 4: Correr os testes e confirmar que passam**

Run: `node --test tests/pass_types.test.js`
Expected: PASS.

- [ ] **Step 5: Verificar que o ficheiro continua a carregar em Node**

Run: `node -e "require('./js/pass_types.js'); console.log('ok')"`
Expected: imprime `ok`. Se der `THREE is not defined`, entrou uma referência ao THREE neste ficheiro — tira-a.

- [ ] **Step 6: Correr a suite toda**

Run: `node --test tests/*.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add js/pass_types.js tests/pass_types.test.js
git commit -m "feat: add a short leading point that bypasses the candidate fan"
```

---

### Task 3: pontoPara deixa de cair aos pés

**Files:**
- Modify: `js/pass_types.js` — `pontoPara`, `paraMate`, `escolher`
- Test: `tests/pass_types.test.js`

**Interfaces:**
- Consumes: `PassTypes.pontoLiderancaCurta(mate, opponents)` da Task 2.
- Produces: `PassTypes.pontoPara(tipo, pontos, mate, golZ, opponents)` — o quinto argumento é novo e opcional; sem ele, o comportamento perante leque vazio é o antigo (`DIRECT`).

- [ ] **Step 1: Escrever os testes que falham**

Acrescenta ao fim de `tests/pass_types.test.js`:

```js
/* ------------------------------------------------------------------
   Regressão: leque vazio já não manda a bola aos pés.
   ------------------------------------------------------------------ */

test('leque vazio com adversários dados: leading vira ponto curto', () => {
    const m = mateVirado(0, 0, 0, 7);
    const r = PassTypes.pontoPara(PassTypes.LEADING, [], m, 52.5, []);
    assert.strictEqual(r.tipo, PassTypes.LEADING);
    assert.ok(r.ponto, 'devia trazer ponto');
    assert.strictEqual(r.ponto.curto, true);
});

test('leque vazio com adversários dados: space vira ponto curto', () => {
    const m = mateVirado(0, 0, 0, 8);
    const r = PassTypes.pontoPara(PassTypes.SPACE, [], m, 52.5, []);
    assert.strictEqual(r.tipo, PassTypes.SPACE);
    assert.strictEqual(r.ponto.curto, true);
});

test('sem ponto curto possível, ainda cai em direct', () => {
    // Encostado à linha de fundo, virado para fora: nada à frente cabe no campo.
    const m = mateVirado(0, CAMPO_COMP / 2 - 0.5, 0, 9);
    const r = PassTypes.pontoPara(PassTypes.LEADING, [], m, 52.5, []);
    assert.strictEqual(r.tipo, PassTypes.DIRECT);
    assert.strictEqual(r.ponto, null);
});

test('leque cheio continua a ganhar ao ponto curto', () => {
    const m = mateVirado(0, 0, 0, 10);
    const doLeque = [3, 6, 9].map(d => ({ x: 0, z: d, mate: m }));
    const r = PassTypes.pontoPara(PassTypes.LEADING, doLeque, m, 52.5, []);
    assert.strictEqual(r.ponto.z, 9, 'devia ser o ponto do leque mais adiantado');
    assert.strictEqual(r.ponto.curto, undefined, 'o do leque não é curto');
});

test('direct continua a não trazer ponto, mesmo com adversários dados', () => {
    const m = mateVirado(0, 0, 0, 11);
    const r = PassTypes.pontoPara(PassTypes.DIRECT, [], m, 52.5, []);
    assert.strictEqual(r.tipo, PassTypes.DIRECT);
    assert.strictEqual(r.ponto, null);
});
```

- [ ] **Step 2: Correr e confirmar que falha**

Run: `node --test tests/pass_types.test.js`
Expected: FAIL — os dois primeiros dão `DIRECT` onde se espera `LEADING`/`SPACE`.

- [ ] **Step 3: Reescrever pontoPara**

Em `js/pass_types.js`, substitui a função `pontoPara` inteira, e o comentário imediatamente acima dela, por:

```js
    /*
    Resolve o ponto de mira do tipo pedido.

    Ordem: primeiro o leque (pontos já validados contra adversários e linhas de
    passe), depois o ponto curto à frente. Só quando nem esse existe é que a
    bola vai aos pés.

    Era só a primeira metade: sem ponto no leque, `direct`. Como o leque vem
    vazio sempre que há gente à volta — e é aí que se joga a maior parte do
    tempo — o jogo travava a cada passe.

    `opponents` é opcional: sem ele não há como validar o ponto curto, e o
    comportamento é o antigo.
    */
    pontoPara: function (tipo, pontos, mate, golZ, opponents) {
        let pt = null;
        if (tipo === this.SPACE) pt = this.pontoMediano(pontos, mate);
        else if (tipo === this.LEADING) pt = this.pontoMaisPertoDoGolo(pontos, golZ, mate);
        else return { tipo: this.DIRECT, ponto: null };

        if (!pt && opponents) pt = this.pontoLiderancaCurta(mate, opponents);

        return pt ? { tipo: tipo, ponto: pt } : { tipo: this.DIRECT, ponto: null };
    },
```

- [ ] **Step 4: Passar os adversários em paraMate**

Em `js/pass_types.js`, dentro de `paraMate`, a linha

```js
        return this.pontoPara(tipo, pontos, mate, carrier.targetGoalZ);
```

passa a

```js
        const opponents = (carrier.team === 'TeamA') ? Match.opponents : Match.players;
        return this.pontoPara(tipo, pontos, mate, carrier.targetGoalZ, opponents);
```

- [ ] **Step 5: Passar os adversários em escolher**

Em `js/pass_types.js`, dentro de `escolher`, a linha

```js
        const teammates = (carrier.team === 'TeamA') ? Match.players : Match.opponents;
```

passa a

```js
        const teammates = (carrier.team === 'TeamA') ? Match.players : Match.opponents;
        const opponents = (carrier.team === 'TeamA') ? Match.opponents : Match.players;
```

e, mais abaixo no mesmo laço, a linha

```js
            const res = this.pontoPara(tipoSorteado, pontos, mate, golZ);
```

passa a

```js
            const res = this.pontoPara(tipoSorteado, pontos, mate, golZ, opponents);
```

- [ ] **Step 6: Correr os testes e confirmar que passam**

Run: `node --test tests/pass_types.test.js`
Expected: PASS.

- [ ] **Step 7: Confirmar que os testes antigos do fallback foram cobertos**

Run: `grep -n "sem pontos vivos, qualquer tipo cai em direct" tests/pass_types.test.js`

Esse teste chama `pontoPara(tipo, [], mate, 52.5)` **sem** o quinto argumento, por isso continua a esperar `DIRECT` — e continua correcto, porque sem `opponents` o ponto curto não é tentado. Não o mudes.

- [ ] **Step 8: Verificar sintaxe e carregamento**

Run: `node --check js/pass_types.js && node -e "require('./js/pass_types.js'); console.log('ok')"`
Expected: imprime `ok`.

- [ ] **Step 9: Correr a suite toda**

Run: `node --test tests/*.test.js`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add js/pass_types.js tests/pass_types.test.js
git commit -m "fix: fall back to a short leading point instead of the receiver's feet"
```

---

### Task 4: Balística do leading curto

**Files:**
- Modify: `js/bt/player_bt.js` — `aplicarMiraDoPasse`

**Interfaces:**
- Consumes: o campo `curto: true` no ponto, da Task 2.
- Produces: nada de novo.

- [ ] **Step 1: Perceber o que está a acontecer**

`aplicarMiraDoPasse` marca **todo** `SPACE`/`LEADING` como `p.isThroughBall = true`, o que faz a bola ser resolvida com a balística de lançamento (`PassModel.vChegadaLancamento`, 5 m/s à chegada). Isso é certo para uma bola em que o receptor corre 15 m atrás dela, e lento de mais para um leading de 4 m — a bola fica a rolar à frente dele em vez de lhe chegar.

- [ ] **Step 2: Alterar a condição**

Em `js/bt/player_bt.js`, dentro de `aplicarMiraDoPasse`, substitui

```js
    const paraOEspaco = ponto &&
        (tipo === PassTypes.SPACE || tipo === PassTypes.LEADING);
```

por

```js
    /*
    O ponto CURTO (pontoLiderancaCurta, em pass_types.js) não leva balística de
    lançamento: são 4 m à frente do companheiro, não uma bola para ele correr
    atrás. Com vChegadaLancamento (5 m/s à chegada) ficava a rolar mansa à
    frente dele. Vai como passe normal, só com o alvo deslocado.
    */
    const paraOEspaco = ponto && !ponto.curto &&
        (tipo === PassTypes.SPACE || tipo === PassTypes.LEADING);
```

- [ ] **Step 3: Confirmar que o ponto curto continua a chegar ao alvo do passe**

Run: `grep -n "passAimPoint" js/bt/player_bt.js js/player.js | head`

`p.passAimPoint` é posto no início de `aplicarMiraDoPasse`, antes desta condição, e é ele que desloca o alvo do passe. O `curto` só decide a balística; o ponto de mira aplica-se na mesma.

- [ ] **Step 4: Verificar sintaxe**

Run: `node --check js/bt/player_bt.js`
Expected: sem saída, código de saída 0.

- [ ] **Step 5: Correr a suite toda**

Run: `node --test tests/*.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add js/bt/player_bt.js
git commit -m "fix: play the short leading pass with normal ball flight"
```

---

### Task 5: Documentação e verificação no jogo

**Files:**
- Modify: `docs/filesSummary.md`

**Interfaces:**
- Consumes: tudo o que as Tasks 1 a 4 produziram.
- Produces: nada.

- [ ] **Step 1: Documentar**

Procura a entrada do `PassTypeModel` (`grep -n "PassTypeModel" docs/filesSummary.md`) e acrescenta-lhe, ou cria-a na secção do `config.js` no formato dos vizinhos:

```markdown
- **`PassTypeModel`** — **onde a bola cai num passe**: aos pés (`direct`), no
  ponto mediano do leque (`space`) ou no mais adiantado (`leading`). A tabela
  `regras` escolhe a mistura pela zona de origem e destino; a primeira regra que
  casa manda.
  - `recuo` é a primeira: destino mais de `margemRecuo` (2 m) atrás da origem
    vai aos pés (85%), porque um passe para trás é para segurar. Antes não havia
    noção de recuo — caía na `misturaPadrao` como qualquer outro.
  - A `misturaPadrao` é a que mais dispara, e passou de **80% aos pés para 70% à
    frente**. Era daí que vinha a sensação de jogo travado.
  - `liderancaCurta` (4 m), `liderancaPasso` (1 m) e `liderancaMin` (1.5 m)
    definem o **leading curto**: quando o leque do `PlayerPassTarget` não valida
    nenhum ponto — o normal num bloco compacto — `pontoPara` mira este ponto à
    frente do companheiro em vez de cair aos pés. Encurta perante um adversário
    em vez de desistir. O ponto vem marcado com `curto: true`, e por isso é
    jogado com a balística de passe normal, não com a de lançamento.
```

- [ ] **Step 2: Commit da documentação**

```bash
git add docs/filesSummary.md
git commit -m "docs: describe the leading pass changes in filesSummary"
```

- [ ] **Step 3: Arrancar o servidor**

Run: `npm run dev`
Abre o endereço que ele imprime e carrega em Continue — o jogo abre em pausa de propósito.

- [ ] **Step 4: Ver se a bola chega à frente**

Observa uma dezena de passes. A maioria deve cair à frente do companheiro, com ele a receber em movimento, e não no pé de quem está parado. É o efeito que se pediu.

- [ ] **Step 5: Confirmar que os recuos continuam aos pés**

Repara nos passes para trás — um médio a devolver ao defesa, um defesa ao guarda-redes. Esses devem continuar a chegar ao pé. Se um passe de recuo for jogado à frente de quem recebe, a regra `recuo` não está a casar: verifica que `zonaDe` devolve `avanco`.

- [ ] **Step 6: Confirmar que o leading curto não é lento**

Procura um passe curto à frente num espaço apertado. A bola deve chegar com o ritmo de um passe normal. Se rolar mansa e morrer antes de chegar, a Task 4 não pegou.

- [ ] **Step 7: Ligar o debug do leque e comparar**

No painel, liga `PlayerPassTarget`. Os pontos laranja são o leque validado. Confirma o que motivou a mudança: em zonas congestionadas há poucos ou nenhuns pontos à volta dos companheiros — e é exactamente aí que, sem o leading curto, todos os passes iam aos pés.

- [ ] **Step 8: Confirmar que não se perde a bola de mais**

Corre a **Simulação rápida** do painel e compara a percentagem de passes certos com a de antes desta mudança. Passar à frente é mais arriscado por natureza, e alguma descida é esperada; uma queda grande quer dizer que `liderancaCurta` (4 m) é longa de mais para este jogo, e é esse o número a baixar.
