# Execução do Passe — reparação, higiene e erro humano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o passe falhar como falha no futebol — por execução, não só por decisão — depois de repor a calibração da bola e de limpar o código órfão em que já tropeçámos três vezes.

**Architecture:** Três camadas independentes. Primeiro repõe-se `velocidadeRasteiraPara`/`vChegadaRasteira`, que estão numa versão que faz todos os passes chegarem mortos (dois testes vermelhos). Depois uma ferramenta que encontra campos escritos-e-nunca-lidos, porque três defeitos desta sessão vieram todos daí. Por fim o erro de execução: dispersão angular gaussiana com σ vindo dos atributos, ampliada pela pressão e pelo ângulo do corpo, com a força cortada sob pressão. A matemática vive em funções puras no `utils.js`; o `executePassGameplay` só a consome.

**Tech Stack:** JavaScript de browser em scripts clássicos (sem módulos ES, sem build). Testes com `node --test` + `vm` sandbox sobre a função recortada do ficheiro. Medição de comportamento com o harness headless (`tests/headless.js`, jsdom + three).

## Global Constraints

- **Scripts clássicos, scope global.** Nada de `import`/`export`. Ficheiros novos entram no `index.html` na ordem certa.
- **Comentários e nomes em português**, como o resto do repositório. Os comentários explicam o PORQUÊ e o que já se tentou antes, não o quê.
- **Correr os testes com:** `node --test "tests/*.test.js"` (o glob com aspas é obrigatório no Git Bash deste ambiente; `node --test tests/` falha).
- **Aleatoriedade injectada, nunca embutida.** Uma função pura não chama `Math.random()`: recebe-o como argumento. É o que torna o erro do passe testável.
- **Duas corridas antes de acreditar num número.** Nesta sessão houve três medições de uma amostra só que não se reproduziram. Qualquer efeito medido leva no mínimo 10 sementes, e o desvio vai no relatório.
- **A/B no mesmo binário.** Para medir o efeito de uma funcionalidade, ligar/desligar por constante em runtime — nunca comparar duas versões do ficheiro, que trazem outras diferenças pelo meio.
- **Física da bola:** `BallPhysics.raio = 0.11`, `gravidade = 9.81`, `atritoRolamento = 0.10`, `kArrasto ≈ 0.01354`. `BallControl.easySpeed = 7.75` (acima disto o receptor arrisca falhar o domínio).
- **Skills por jogador** (`p.skillFor(campo)`, 0..100): `gk`, `tec`, `marking`, `speed`, `strength`, `pass`, `intercept`.
- **A frente local do modelo do jogador é +Z** (ver `pass_candidates.js`): `new THREE.Vector3(0,0,1).applyQuaternion(p.model.quaternion)`.

---

### Task 1: Repor a calibração do passe rasteiro

Dois testes estão vermelhos. O ficheiro actual tem `velocidadeRasteiraPara` reescrito e `vChegadaRasteira` a `1.0`, contra `8.2` no commit `3c77ac2` — provavelmente perdido numa reescrita de commits. Consequência: um passe de 4 m sai a **6.19 m/s** em vez de ~12.8, e como o lead do passe é calculado com uma velocidade média estimada de 11 m/s, a mira e a bola estão desalinhadas em todos os passes do jogo.

**Files:**
- Modify: `js/utils.js` (função `velocidadeRasteiraPara`)
- Modify: `js/config.js` (`PassModel.vChegadaRasteira`)
- Test: `tests/pass_velocity.test.js` (já existe; passa a verde)

**Interfaces:**
- Produces: `velocidadeRasteiraPara(dist, vChegada)` → velocidade de saída em m/s, com tecto de 18.5.

- [ ] **Step 1: Confirmar que os testes estão vermelhos e porquê**

Run: `node --test tests/pass_velocity.test.js`
Expected: FAIL, 2 testes, com `'Passe de 4m (6.19 m/s) deve ser ágil e rápido'`.

- [ ] **Step 2: Repor a função**

Em `js/utils.js`, substituir o corpo de `velocidadeRasteiraPara` por:

```javascript
function velocidadeRasteiraPara(dist, vChegada) {
    /*
    Velocidade de saída para a bola percorrer `dist` e lá chegar ainda
    jogável. Inverte o arrasto quadrático + atrito de rolamento:

        alvo = (k·v_alvo² + μg)·e^(2k·dist) − μg
        v0   = √(alvo / k)

    O `v_alvo` não é o `vChegada` cru: passes curtos levam um reforço (uma
    bola de 4 m com a mesma chegada de uma de 20 m sai frouxa e parece que
    o jogador não quis passar) e passes longos abrandam a chegada (senão a
    velocidade de saída dispara).

    Esta versão foi reposta a partir do commit 3c77ac2. A que estava no
    lugar tinha uma curva contínua com reforço máximo de +2.0 m/s e
    `vChegadaRasteira` a 1.0: um passe de 4 m saía a 6.19 m/s em vez de
    12.78, todos os passes chegavam mortos, e os dois testes deste ficheiro
    estavam vermelhos.
    */
    let vAlvo = vChegada;
    if (dist < 12.0) {
        vAlvo += (12.0 - dist) * 0.45; // ex.: 4 m ganha +3.6 m/s
    } else if (dist > 15.0) {
        vAlvo = Math.max(1.0, vChegada - (dist - 15.0) * 0.28);
    }

    const k = BallPhysics.kArrasto;
    const atrito = BallPhysics.atritoRolamento * BallPhysics.gravidade;
    const alvo = (k * vAlvo * vAlvo + atrito) * Math.exp(2 * k * dist) - atrito;

    // Tecto de segurança: acima disto o passe rasteiro vira disparo.
    return Math.min(18.5, Math.sqrt(Math.max(0, alvo / k)));
}
```

- [ ] **Step 3: Repor a constante**

Em `js/config.js`, no `PassModel`, substituir o bloco da constante por:

```javascript
    /*
    Com que velocidade a bola CHEGA ao alvo num passe rasteiro.

    8.2 está ACIMA do `BallControl.easySpeed` (7.75) de propósito: a bola
    chega viva e o domínio é disputado, em vez de lhe morrer nos pés. É uma
    tensão consciente — baixar isto para 7.0 dá passes mais fáceis de
    dominar e um jogo mais lento; a 1.0 (o valor que aqui esteve) a bola
    não chega sequer ao destino.
    */
    vChegadaRasteira: 8.2,
```

- [ ] **Step 4: Correr os testes**

Run: `node --test tests/pass_velocity.test.js`
Expected: PASS. Os valores esperados, com esta função e 8.2: 4 m → 12.78 m/s, 8 m → 11.90, 15 m → 11.71, 30 m → 11.26.

- [ ] **Step 5: Correr a suite toda**

Run: `node --test "tests/*.test.js"`
Expected: todos passam.

- [ ] **Step 6: Commit**

```bash
git add js/utils.js js/config.js
git commit -m "fix: repor a calibracao do passe rasteiro (3c77ac2)"
```

---

### Task 2: Ferramenta de campos órfãos

Três defeitos desta sessão vieram todos da mesma origem: o `position_bt.js` foi apagado e levou os produtores, deixando os consumidores órfãos. O `buildOutBias` era escrito por três listeners do `EventBus` e lido por ninguém (revivido hoje). O `markingTarget` e o estado `MARKING` da FSM são lidos e nunca escritos. O `isCovering` é limpo em dois sítios, lido pela FSM, e escrito em lado nenhum.

Os três apareceram por acaso. Esta tarefa procura os restantes de propósito.

**Files:**
- Create: `tools/campos_orfaos.js`
- Test: `tests/campos_orfaos.test.js`

**Interfaces:**
- Produces: `node tools/campos_orfaos.js` imprime duas listas — campos `p.xxx` escritos e nunca lidos, e lidos e nunca escritos — com ficheiro e linha de cada ocorrência.
- Produces: `module.exports = { analisar }` onde `analisar(ficheiros)` recebe `[{ nome, fonte }]` e devolve `{ escritosNuncaLidos: [...], lidosNuncaEscritos: [...] }`, cada elemento `{ campo, ocorrencias: [{ ficheiro, linha, tipo }] }` com `tipo` em `'escrita' | 'leitura'`.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/campos_orfaos.test.js
/*
Ferramenta de higiene: encontra campos de jogador escritos e nunca lidos (o
produtor sobreviveu, o consumidor foi-se) e lidos e nunca escritos (o
contrario). Tres defeitos desta sessao vieram dai — buildOutBias,
markingTarget e isCovering — e apareceram todos por acaso.

O teste corre sobre fontes INVENTADAS, nao sobre o repositorio: assim
verifica a ferramenta e nao o estado do codigo, que muda todos os dias.
*/
const test = require('node:test');
const assert = require('node:assert');
const { analisar } = require('../tools/campos_orfaos.js');

const campos = (lista) => lista.map(x => x.campo).sort();

test('campo escrito e nunca lido aparece na primeira lista', () => {
    const r = analisar([
        { nome: 'a.js', fonte: 'p.aviso = 3;' }
    ]);
    assert.deepStrictEqual(campos(r.escritosNuncaLidos), ['aviso']);
    assert.strictEqual(r.lidosNuncaEscritos.length, 0);
});

test('campo lido e nunca escrito aparece na segunda lista', () => {
    const r = analisar([
        { nome: 'a.js', fonte: 'if (p.marca) { fazer(); }' }
    ]);
    assert.deepStrictEqual(campos(r.lidosNuncaEscritos), ['marca']);
    assert.strictEqual(r.escritosNuncaLidos.length, 0);
});

test('campo escrito e lido não aparece em lado nenhum', () => {
    const r = analisar([
        { nome: 'a.js', fonte: 'p.alvo = 1;' },
        { nome: 'b.js', fonte: 'usar(q.alvo);' }
    ]);
    assert.strictEqual(r.escritosNuncaLidos.length, 0);
    assert.strictEqual(r.lidosNuncaEscritos.length, 0);
});

test('escrita composta conta como escrita E como leitura', () => {
    // `p.timer -= dt` le o valor antes de escrever: nao e um campo orfao.
    const r = analisar([
        { nome: 'a.js', fonte: 'p.timer -= dt;' }
    ]);
    assert.strictEqual(r.escritosNuncaLidos.length, 0);
    assert.strictEqual(r.lidosNuncaEscritos.length, 0);
});

test('comparação não conta como escrita', () => {
    const r = analisar([
        { nome: 'a.js', fonte: 'if (p.estado === 2) fazer();' }
    ]);
    assert.deepStrictEqual(campos(r.lidosNuncaEscritos), ['estado']);
});

test('o relatório diz onde está cada ocorrência', () => {
    const r = analisar([
        { nome: 'match.js', fonte: 'linha zero\np.aviso = 3;' }
    ]);
    const oc = r.escritosNuncaLidos[0].ocorrencias[0];
    assert.strictEqual(oc.ficheiro, 'match.js');
    assert.strictEqual(oc.linha, 2);
    assert.strictEqual(oc.tipo, 'escrita');
});

test('comentários e strings são ignorados', () => {
    const r = analisar([
        { nome: 'a.js', fonte: '// p.fantasma = 1;\nconst s = "p.outro = 2;";' }
    ]);
    assert.strictEqual(r.escritosNuncaLidos.length, 0);
    assert.strictEqual(r.lidosNuncaEscritos.length, 0);
});

test('campos conhecidos do THREE não são reportados', () => {
    const r = analisar([
        { nome: 'a.js', fonte: 'p.position = 1; p.quaternion = 2; p.visible = 3;' }
    ]);
    assert.strictEqual(r.escritosNuncaLidos.length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/campos_orfaos.test.js`
Expected: FAIL com `Cannot find module '../tools/campos_orfaos.js'`.

- [ ] **Step 3: Write the implementation**

```javascript
// tools/campos_orfaos.js
/*
=============================================================================
CAMPOS ORFAOS — quem escreve sem ninguem ler, quem le sem ninguem escrever
=============================================================================
Tres defeitos de uma so sessao vieram da mesma origem: o position_bt.js foi
apagado e levou os produtores, deixando os consumidores orfaos.

    buildOutBias     escrito por 3 listeners do EventBus, lido por ninguem
    markingTarget    lido pela FSM (estado MARKING), escrito por ninguem
    isCovering       limpo em dois sitios, lido pela FSM, escrito por ninguem

Os tres apareceram por acaso. Isto procura os restantes de proposito.

Nao e um analisador de sintaxe: e uma varredura por expressoes regulares
sobre `qualquercoisa.campo`. Da falsos positivos (campos de objectos que nao
sao jogadores) e falsos negativos (acesso por `obj[nome]`). Serve para
apontar sitios a olhar, nao para decidir sozinho.

Uso:  node tools/campos_orfaos.js
=============================================================================
*/
const fs = require('fs');
const path = require('path');

/*
Campos que o THREE.js e o DOM ja definem: escritos e lidos fora do nosso
codigo, por isso apareceriam sempre como orfaos.
*/
const CONHECIDOS = new Set([
    'position', 'quaternion', 'rotation', 'scale', 'visible', 'material',
    'geometry', 'children', 'parent', 'up', 'matrix', 'matrixWorld', 'name',
    'length', 'x', 'y', 'z', 'w', 'value', 'needsUpdate', 'textContent',
    'style', 'className', 'classList', 'innerText', 'innerHTML', 'checked',
    'id', 'type', 'width', 'height', 'currentState', 'prototype'
]);

// Tira comentarios e strings, para o que la dentro nao contar como codigo.
function limpar(fonte) {
    return fonte
        .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
        .replace(/\/\/[^\n]*/g, m => m.replace(/[^\n]/g, ' '))
        .replace(/'(?:[^'\\\n]|\\.)*'/g, m => m.replace(/[^\n]/g, ' '))
        .replace(/"(?:[^"\\\n]|\\.)*"/g, m => m.replace(/[^\n]/g, ' '))
        .replace(/`(?:[^`\\]|\\.)*`/g, m => m.replace(/[^\n]/g, ' '));
}

function analisar(ficheiros) {
    const escritas = new Map();   // campo -> [ocorrencias]
    const leituras = new Map();

    const juntar = (mapa, campo, ocorrencia) => {
        if (!mapa.has(campo)) mapa.set(campo, []);
        mapa.get(campo).push(ocorrencia);
    };

    for (const f of ficheiros) {
        const linhas = limpar(f.fonte).split('\n');
        for (let i = 0; i < linhas.length; i++) {
            const linha = linhas[i];
            const num = i + 1;

            /*
            Escrita simples: `.campo =` sem ser `==`, `===`, `>=`, `<=`, `!=`.
            Escrita composta (`+=`, `-=`, `*=`, `||=`) conta TAMBEM como
            leitura: o valor anterior e usado.
            */
            const reEscrita = /\.([A-Za-z_$][\w$]*)\s*(\+=|-=|\*=|\/=|\|\|=|&&=|\?\?=|=)(?!=)/g;
            let m;
            while ((m = reEscrita.exec(linha)) !== null) {
                const campo = m[1];
                if (CONHECIDOS.has(campo)) continue;
                juntar(escritas, campo, { ficheiro: f.nome, linha: num, tipo: 'escrita' });
                if (m[2] !== '=') {
                    juntar(leituras, campo, { ficheiro: f.nome, linha: num, tipo: 'leitura' });
                }
            }

            // Leitura: qualquer `.campo` que nao seja seguido de `=` simples
            // nem de `(` (chamada de metodo).
            const reLeitura = /\.([A-Za-z_$][\w$]*)\s*(?!\s*(?:\+=|-=|\*=|\/=|\|\|=|&&=|\?\?=|=(?!=)|\())/g;
            while ((m = reLeitura.exec(linha)) !== null) {
                const campo = m[1];
                if (CONHECIDOS.has(campo)) continue;
                juntar(leituras, campo, { ficheiro: f.nome, linha: num, tipo: 'leitura' });
            }
        }
    }

    const lista = (mapa, outro) => {
        const saida = [];
        for (const [campo, ocorrencias] of mapa) {
            if (outro.has(campo)) continue;
            saida.push({ campo: campo, ocorrencias: ocorrencias });
        }
        return saida.sort((a, b) => a.campo.localeCompare(b.campo));
    };

    return {
        escritosNuncaLidos: lista(escritas, leituras),
        lidosNuncaEscritos: lista(leituras, escritas)
    };
}

function ficheirosDoJogo() {
    const raiz = path.join(__dirname, '..');
    const dirs = [path.join(raiz, 'js'), path.join(raiz, 'js', 'bt')];
    const out = [];
    for (const dir of dirs) {
        for (const nome of fs.readdirSync(dir)) {
            const completo = path.join(dir, nome);
            if (!nome.endsWith('.js') || !fs.statSync(completo).isFile()) continue;
            out.push({ nome: path.relative(raiz, completo), fonte: fs.readFileSync(completo, 'utf8') });
        }
    }
    return out;
}

if (require.main === module) {
    const r = analisar(ficheirosDoJogo());
    const imprimir = (titulo, lista) => {
        console.log('\n=== ' + titulo + ' (' + lista.length + ') ===');
        for (const item of lista) {
            const onde = item.ocorrencias.slice(0, 3)
                .map(o => o.ficheiro + ':' + o.linha).join(', ');
            console.log('  ' + item.campo.padEnd(28) + onde +
                (item.ocorrencias.length > 3 ? ' (+' + (item.ocorrencias.length - 3) + ')' : ''));
        }
    };
    imprimir('ESCRITOS E NUNCA LIDOS', r.escritosNuncaLidos);
    imprimir('LIDOS E NUNCA ESCRITOS', r.lidosNuncaEscritos);
}

module.exports = { analisar, ficheirosDoJogo };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/campos_orfaos.test.js`
Expected: PASS, 8 testes.

- [ ] **Step 5: Correr a ferramenta sobre o repositório**

Run: `node tools/campos_orfaos.js`
Expected: duas listas. **Verificar que `isCovering` aparece em "LIDOS E NUNCA ESCRITOS"** — é o caso conhecido, e serve de controlo de que a ferramenta funciona sobre o código real. Se não aparecer, a varredura tem um buraco: investigar antes de continuar.

- [ ] **Step 6: Guardar o relatório**

Escrever a saída da ferramenta para `docs/campos_orfaos.md`, com um cabeçalho de duas linhas a dizer a data e o comando que a gerou. Não apagar nem alterar código nesta tarefa — o que fazer com cada campo é decisão a tomar caso a caso, com o relatório à frente.

```bash
node tools/campos_orfaos.js > docs/campos_orfaos.md
```

- [ ] **Step 7: Commit**

```bash
git add tools/campos_orfaos.js tests/campos_orfaos.test.js docs/campos_orfaos.md
git commit -m "tools: varredura de campos orfaos"
```

---

### Task 3: Dispersão angular do passe

Hoje o passe sai **sempre na direcção exacta** do alvo. O único erro é no peso (`PassModel.erroPesoMax`, ±18% a skill 0), e é uniforme, não gaussiano. Consequência medível: nenhuma bola se perde por o passe ter saído torto — as perdas vêm só de decisão má ou de domínio falhado.

Esta tarefa acrescenta o desvio angular. A pressão e o ângulo do corpo ficam para a Task 4; aqui só os atributos.

**Files:**
- Modify: `js/config.js` (novo `PassErrorModel`, a seguir ao `PassModel`)
- Modify: `js/utils.js` (novas funções puras)
- Modify: `js/fsm.js` (`executePassGameplay`, linhas 40-54)
- Test: `tests/passe_erro.test.js`

**Interfaces:**
- Produces: `sigmaDePasse(o)` → desvio padrão angular em radianos.
  `o = { passSkill, tecSkill, distAdversario, cosCorpo }` — `passSkill`/`tecSkill` 0..100; `distAdversario` em metros (`Infinity` se não houver ninguém); `cosCorpo` em -1..1 (1 = virado para o alvo, -1 = de costas).
  Nesta tarefa `distAdversario` e `cosCorpo` são aceites e ignorados; a Task 4 liga-os.
- Produces: `amostraGaussiana(rnd)` → amostra de N(0,1). `rnd` é uma função que devolve 0..1 (injectada; nunca `Math.random` por dentro).
- Produces: `rodarNoPlano(x, z, angulo)` → `{ x, z }` rodado no plano XZ.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/passe_erro.test.js
/*
Erro de execucao do passe.

Antes disto o passe saia SEMPRE na direccao exacta do alvo: o unico erro era
no peso (erroPesoMax, uniforme). Nenhuma bola se perdia por ter saido torta,
e as perdas de posse vinham so de decisao ma ou de dominio falhado — parte
de porque o jogo parecia mecanico.

A aleatoriedade e INJECTADA: `amostraGaussiana(rnd)` recebe a fonte de
numeros. E o que permite testar a forma da distribuicao em vez de esperar
que ela se porte bem.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const CONFIG = fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8');
const UTILS = fs.readFileSync(path.join(raiz, 'js', 'utils.js'), 'utf8');

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

function montar() {
    const sandbox = { Math: Math };
    vm.createContext(sandbox);
    vm.runInContext(
        recortarConst(CONFIG, 'PassErrorModel') + '\n' +
        recortarFuncao(UTILS, 'sigmaDePasse') + '\n' +
        recortarFuncao(UTILS, 'amostraGaussiana') + '\n' +
        recortarFuncao(UTILS, 'rodarNoPlano') + '\n' +
        'this.M = PassErrorModel;' +
        'this.sigma = sigmaDePasse;' +
        'this.gauss = amostraGaussiana;' +
        'this.rodar = rodarNoPlano;', sandbox);
    return sandbox;
}

const semPressao = (extra) => Object.assign({
    passSkill: 50, tecSkill: 50, distAdversario: Infinity, cosCorpo: 1
}, extra || {});

/* --- sigma por atributos ------------------------------------------------ */

test('mais skill de passe, menos dispersão', () => {
    const s = montar();
    const bom = s.sigma(semPressao({ passSkill: 90 }));
    const mau = s.sigma(semPressao({ passSkill: 20 }));
    assert.ok(bom < mau, 'bom=' + bom.toFixed(4) + ' mau=' + mau.toFixed(4));
});

test('a técnica também conta', () => {
    const s = montar();
    const bom = s.sigma(semPressao({ tecSkill: 90 }));
    const mau = s.sigma(semPressao({ tecSkill: 20 }));
    assert.ok(bom < mau, 'a TEC devia reduzir a dispersao');
});

test('nem o melhor passador do mundo é perfeito', () => {
    const s = montar();
    assert.ok(s.sigma(semPressao({ passSkill: 100, tecSkill: 100 })) > 0,
        'sigma zero faz o passe voltar a ser exacto');
});

test('sigma fica dentro de limites sãos', () => {
    const s = montar();
    for (const skill of [0, 25, 50, 75, 100]) {
        const v = s.sigma(semPressao({ passSkill: skill, tecSkill: skill }));
        assert.ok(v > 0 && v < 0.35,
            'sigma de ' + v.toFixed(4) + ' rad em skill ' + skill + ' (0.35 rad = 20 graus)');
    }
});

/* --- a amostra ---------------------------------------------------------- */

test('a gaussiana tem média perto de zero e desvio perto de 1', () => {
    const s = montar();
    // PRNG semeado: o teste tem de dar sempre o mesmo.
    let x = 12345 >>> 0;
    const rnd = () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };

    const amostras = [];
    for (let i = 0; i < 20000; i++) amostras.push(s.gauss(rnd));
    const media = amostras.reduce((a, b) => a + b, 0) / amostras.length;
    const dp = Math.sqrt(amostras.reduce((a, b) => a + (b - media) * (b - media), 0) / amostras.length);

    assert.ok(Math.abs(media) < 0.05, 'media=' + media.toFixed(3));
    assert.ok(Math.abs(dp - 1) < 0.05, 'desvio=' + dp.toFixed(3));
});

test('a gaussiana tem cauda: valores grandes acontecem, e são raros', () => {
    const s = montar();
    let x = 999 >>> 0;
    const rnd = () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };

    let acima2 = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) if (Math.abs(s.gauss(rnd)) > 2) acima2++;
    const frac = acima2 / n;
    // Numa normal, P(|z| > 2) ~ 4.6%. E a diferenca para uma uniforme, onde
    // seria 0% — a cauda e o que faz o passe ocasionalmente desastroso.
    assert.ok(frac > 0.02 && frac < 0.08, 'fraccao acima de 2 sigma: ' + frac.toFixed(3));
});

/* --- rotação ------------------------------------------------------------ */

test('rodar zero não mexe', () => {
    const s = montar();
    const r = s.rodar(3, 4, 0);
    assert.ok(Math.abs(r.x - 3) < 1e-9 && Math.abs(r.z - 4) < 1e-9);
});

test('rodar preserva o comprimento', () => {
    const s = montar();
    const r = s.rodar(3, 4, 0.4);
    assert.ok(Math.abs(Math.hypot(r.x, r.z) - 5) < 1e-9,
        'comprimento ' + Math.hypot(r.x, r.z).toFixed(6));
});

test('rodar 90 graus troca os eixos', () => {
    const s = montar();
    const r = s.rodar(1, 0, Math.PI / 2);
    assert.ok(Math.abs(r.x) < 1e-9 && Math.abs(r.z + 1) < 1e-9,
        'deu (' + r.x.toFixed(3) + ', ' + r.z.toFixed(3) + ')');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/passe_erro.test.js`
Expected: FAIL com `const PassErrorModel nao encontrado`.

- [ ] **Step 3: Acrescentar as constantes**

Em `js/config.js`, imediatamente a seguir ao fecho do `const PassModel = { ... };`:

```javascript
/*
ERRO DE EXECUCAO DO PASSE — a dispersao angular.

O `PassModel.erroPesoMax` ja tratava do PESO (chegar curto ou comprido). O
que faltava era a DIRECCAO: o passe saia sempre na linha exacta do alvo, e
por isso nenhuma bola se perdia por ter saido torta. As perdas de posse
vinham so de decisao ma ou de dominio falhado.

    sigmaMax        dispersao (rad) de um jogador com 0 de skill
    sigmaMin        piso: nem o melhor passador do mundo e exacto
    pesoTecnica     quanto a TEC conta face ao PASS (0..1)
    raioPressao     a que distancia um adversario comeca a estorvar
    pressaoMult     multiplicador de sigma com um adversario em cima
    costasMult      multiplicador quando passa de costas para o alvo
    forcaMinPressao fraccao da forca que sobra num passe apertado
*/
const PassErrorModel = {
    sigmaMax: 0.16,        // ~9.2 graus
    sigmaMin: 0.012,       // ~0.7 graus
    pesoTecnica: 0.35,
    raioPressao: 3.5,
    pressaoMult: 1.8,
    costasMult: 2.0,
    forcaMinPressao: 0.85
};
```

- [ ] **Step 4: Acrescentar as funções puras**

Em `js/utils.js`, antes da função `velocidadeRasteiraPara`:

```javascript
/*
DISPERSAO ANGULAR DE UM PASSE, em radianos (desvio padrao).

`passSkill` e `tecSkill` sao 0..100. `distAdversario` e a distancia ao
adversario mais proximo de quem passa (Infinity se nao houver nenhum) e
`cosCorpo` e o coseno do angulo entre a frente do jogador e a direccao do
passe (1 virado para o alvo, -1 de costas).

Ver PassErrorModel em config.js.

Pura: sem Match, sem THREE, e sem Math.random — a amostra e sorteada por
quem chama (ver amostraGaussiana).
*/
function sigmaDePasse(o) {
    const M = PassErrorModel;
    const pass = Math.max(0, Math.min(100, o.passSkill || 0));
    const tec = Math.max(0, Math.min(100, o.tecSkill || 0));

    // A TEC conta, mas menos que o PASS: passar e a habilidade principal.
    const skill = (pass * (1 - M.pesoTecnica) + tec * M.pesoTecnica) / 100;
    let sigma = M.sigmaMin + (M.sigmaMax - M.sigmaMin) * (1 - skill);

    return sigma;
}

/*
Uma amostra de uma normal (0, 1), por Box-Muller.

`rnd` e injectado de proposito: uma funcao pura nao chama Math.random, e sem
isto nao havia maneira de testar a FORMA da distribuicao (media, desvio,
cauda) — so de esperar que ela se portasse bem.

O clamp do u1 evita log(0) = -Infinity quando o gerador devolve zero.
*/
function amostraGaussiana(rnd) {
    const u1 = Math.max(1e-12, rnd());
    const u2 = rnd();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/*
Roda um vector no plano XZ. O sentido segue o mesmo do resto do jogo (ver
alvoDeApoio: x = sin, z = cos).

Pura: sem THREE — isto corre uma vez por passe e criar um Vector3 para o
efeito era desperdicio.
*/
function rodarNoPlano(x, z, angulo) {
    const c = Math.cos(angulo);
    const s = Math.sin(angulo);
    return { x: x * c - z * s, z: x * s + z * c };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/passe_erro.test.js`
Expected: PASS, 9 testes.

- [ ] **Step 6: Ligar ao executePassGameplay**

Em `js/fsm.js`, no `executePassGameplay`, substituir o bloco que calcula a direcção e o erro de peso (a partir de `const dxAlvo = _v1.x - Match.ball.position.x;` até `distToTarget *= erroDist;`) por:

```javascript
    const dxAlvo = _v1.x - Match.ball.position.x;
    const dzAlvo = _v1.z - Match.ball.position.z;
    let distToTarget = Math.hypot(dxAlvo, dzAlvo);

    /*
    ERRO DE DIRECCAO. Antes o passe saia sempre na linha exacta do alvo: o
    unico erro era no peso, e por isso nenhuma bola se perdia por ter saido
    torta. Ver PassErrorModel/sigmaDePasse.

    A rotacao e aplicada a DIRECCAO e nao ao ponto: rodar o ponto mudava
    tambem a distancia, e a distancia ja tem o seu proprio erro logo abaixo.
    */
    const passSkill = p.skillFor ? p.skillFor('PASS') : 50;
    const tecSkill = p.skillFor ? p.skillFor('TEC') : 50;

    const sigma = sigmaDePasse({
        passSkill: passSkill,
        tecSkill: tecSkill,
        distAdversario: Infinity,
        cosCorpo: 1
    });
    const desvio = sigma * amostraGaussiana(Math.random);
    const rodado = rodarNoPlano(dxAlvo, dzAlvo, desvio);

    const dirX = distToTarget > 0.001 ? rodado.x / distToTarget : 0;
    const dirZ = distToTarget > 0.001 ? rodado.z / distToTarget : 1;

    /*
    O erro de PESO tem de ser aplicado na DISTANCIA ALVO, antes da
    balistica. Aplicar um multiplicador na velocidade calculada com arrasto
    quadratico fazia o erro na distancia explodir de forma nao-linear —
    passes saiam absurdamente longos ou curtos.
    */
    const erroDist = 1 + (Math.random() * 2 - 1) * PassModel.erroPesoMax * (1 - passSkill / 100);
    distToTarget *= erroDist;
```

**Atenção:** o bloco antigo já declarava `const passSkill` (era ele que alimentava o `erroDist`). A substituição acima cobre essa linha, por isso não deve sobrar uma segunda declaração — confirmar com `grep -c "const passSkill" js/fsm.js`, que tem de dar **1**. Duas declarações `const` com o mesmo nome no mesmo scope é erro de sintaxe e o jogo não arranca.

- [ ] **Step 7: Correr a suite toda**

Run: `node --test "tests/*.test.js"`
Expected: todos passam. Se `tests/passe_rasteiro.test.js` ou `tests/escolha_recetor.test.js` falharem, ler a falha antes de mexer: podem estar a assumir passe exacto, e nesse caso o teste é que precisa de saber do erro — não se baixa o sigma para o teste passar.

- [ ] **Step 8: Commit**

```bash
git add js/config.js js/utils.js js/fsm.js tests/passe_erro.test.js
git commit -m "feat: dispersao angular do passe por atributos"
```

---

### Task 4: Pressão e ângulo do corpo

Hoje um jogador com um adversário colado passa exactamente com a mesma precisão e a mesma força de um jogador sozinho no meio do campo. A pressão só actua **antes**, na decisão (`ctx.underPressure` faz cair para o `findPassTargetRelaxed`, que aceita alvos piores). Escolhe pior, mas executa igualmente bem.

E o cone de visão nunca é chamado (`findPassTargetInCone` não tem chamadores), por isso o jogador escolhe livremente um alvo a 170° das costas e executa-o na perfeição.

**Files:**
- Modify: `js/utils.js` (`sigmaDePasse`, mais uma função nova)
- Modify: `js/fsm.js` (`executePassGameplay`)
- Test: `tests/passe_erro.test.js` (acrescentar)

**Interfaces:**
- Consumes: `sigmaDePasse(o)`, `amostraGaussiana(rnd)`, `rodarNoPlano(x, z, angulo)` (Task 3).
- Produces: `fatorForcaSobPressao(distAdversario)` → multiplicador 0..1 sobre a distância alvo.

- [ ] **Step 1: Write the failing test**

Acrescentar ao fim de `tests/passe_erro.test.js`:

```javascript

/* ------------------------------------------------------------------
   Pressao e angulo do corpo.
   ------------------------------------------------------------------ */

function montarForca() {
    const sandbox = { Math: Math };
    vm.createContext(sandbox);
    vm.runInContext(
        recortarConst(CONFIG, 'PassErrorModel') + '\n' +
        recortarFuncao(UTILS, 'fatorForcaSobPressao') + '\n' +
        'this.forca = fatorForcaSobPressao;', sandbox);
    return sandbox.forca;
}

test('adversário em cima aumenta a dispersão', () => {
    const s = montar();
    const livre = s.sigma(semPressao());
    const apertado = s.sigma(semPressao({ distAdversario: 0.8 }));
    assert.ok(apertado > livre * 1.4,
        'livre=' + livre.toFixed(4) + ' apertado=' + apertado.toFixed(4));
});

test('a pressão desaparece gradualmente com a distância', () => {
    const s = montar();
    const perto = s.sigma(semPressao({ distAdversario: 1.0 }));
    const medio = s.sigma(semPressao({ distAdversario: 2.5 }));
    const longe = s.sigma(semPressao({ distAdversario: 10.0 }));
    assert.ok(perto > medio && medio > longe, 'nao e gradual');
    assert.ok(Math.abs(longe - s.sigma(semPressao())) < 1e-9,
        'fora do raio de pressao devia ser igual a estar livre');
});

test('passar de costas dispersa mais do que passar de frente', () => {
    const s = montar();
    const frente = s.sigma(semPressao({ cosCorpo: 1 }));
    const lado = s.sigma(semPressao({ cosCorpo: 0 }));
    const costas = s.sigma(semPressao({ cosCorpo: -1 }));
    assert.ok(costas > lado && lado > frente,
        'frente=' + frente.toFixed(4) + ' lado=' + lado.toFixed(4) + ' costas=' + costas.toFixed(4));
});

test('pressão e costas somam-se', () => {
    const s = montar();
    const so_costas = s.sigma(semPressao({ cosCorpo: -1 }));
    const ambos = s.sigma(semPressao({ cosCorpo: -1, distAdversario: 0.8 }));
    assert.ok(ambos > so_costas, 'o pior caso devia ser o pior de todos');
});

test('nem no pior caso a dispersão fica absurda', () => {
    const s = montar();
    const pior = s.sigma({ passSkill: 0, tecSkill: 0, distAdversario: 0, cosCorpo: -1 });
    assert.ok(pior < 0.7, 'sigma de ' + pior.toFixed(3) + ' rad (0.7 = 40 graus)');
});

test('a força cai sob pressão, e nunca abaixo do mínimo', () => {
    const forca = montarForca();
    assert.strictEqual(forca(Infinity), 1.0);
    assert.strictEqual(forca(10.0), 1.0);
    const apertado = forca(0.5);
    assert.ok(apertado < 1.0, 'sob pressao a forca devia cair');
    assert.ok(apertado >= 0.85 - 1e-9, 'caiu abaixo do minimo: ' + apertado);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/passe_erro.test.js`
Expected: FAIL — `adversário em cima aumenta a dispersão` falha (a pressão ainda é ignorada) e `function fatorForcaSobPressao nao encontrada`.

- [ ] **Step 3: Ligar a pressão e o corpo ao sigma**

Em `js/utils.js`, substituir o `return sigma;` da `sigmaDePasse` por:

```javascript
    /*
    PRESSAO. Um adversario a `raioPressao` nao estorva nada; colado,
    multiplica a dispersao por `pressaoMult`. Entre os dois, linear.

    Isto nao existia: um jogador com um adversario em cima passava com a
    mesma precisao de um sozinho no meio do campo. A pressao so actuava na
    DECISAO (underPressure faz cair para o findPassTargetRelaxed) — ele
    escolhia pior, mas executava igualmente bem.
    */
    const d = o.distAdversario;
    if (typeof d === 'number' && d < M.raioPressao) {
        const aperto = 1 - Math.max(0, d) / M.raioPressao;
        sigma *= 1 + (M.pressaoMult - 1) * aperto;
    }

    /*
    ANGULO DO CORPO. `cosCorpo` 1 e virado para o alvo, -1 de costas. A
    penalizacao cresce so na metade de tras: passar para o lado e normal,
    passar sem olhar e que nao.
    */
    const cos = (typeof o.cosCorpo === 'number') ? Math.max(-1, Math.min(1, o.cosCorpo)) : 1;
    if (cos < 1) {
        const atras = (1 - cos) / 2;   // 0 de frente, 1 de costas
        sigma *= 1 + (M.costasMult - 1) * atras;
    }

    return sigma;
}

/*
Quanto da forca sobra num passe feito sob pressao, 0..1.

Um passe apertado sai mais fraco: nao ha tempo para armar a perna. Aplica-se
a DISTANCIA ALVO (como o erro de peso) e nao a velocidade ja resolvida — a
balistica com arrasto quadratico nao e linear, e multiplicar a velocidade
faz o erro na distancia explodir.

Pura: sem Match, sem THREE.
*/
function fatorForcaSobPressao(distAdversario) {
    const M = PassErrorModel;
    const d = distAdversario;
    if (typeof d !== 'number' || d >= M.raioPressao) return 1.0;
    const aperto = 1 - Math.max(0, d) / M.raioPressao;
    return 1.0 - (1.0 - M.forcaMinPressao) * aperto;
```

(A chaveta final da `fatorForcaSobPressao` é a que já fechava a `sigmaDePasse` — confirmar que as duas funções ficam bem fechadas depois da edição.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/passe_erro.test.js`
Expected: PASS, 15 testes.

- [ ] **Step 5: Ligar no executePassGameplay**

Em `js/fsm.js`, no bloco que a Task 3 escreveu, substituir a chamada de `sigmaDePasse` e acrescentar a força. O bloco passa a ser:

```javascript
    const passSkill = p.skillFor ? p.skillFor('PASS') : 50;
    const tecSkill = p.skillFor ? p.skillFor('TEC') : 50;

    /*
    Adversario mais proximo de QUEM PASSA (nao da linha de passe: isso ja e
    o filtro de sombra no findPassTarget). E o que mede o aperto.
    */
    const adversarios = (p.team === 'TeamA') ? Match.opponents : Match.players;
    let distAdversario = Infinity;
    for (const o of adversarios) {
        if (o.role === 'gk' || !o.model) continue;
        const d = p.model.position.distanceTo(o.model.position);
        if (d < distAdversario) distAdversario = d;
    }

    // Frente local do modelo e +Z (ver pass_candidates.js).
    _v2.set(0, 0, 1).applyQuaternion(p.model.quaternion);
    const normDir = Math.hypot(dxAlvo, dzAlvo) || 1;
    const cosCorpo = (_v2.x * dxAlvo + _v2.z * dzAlvo) / normDir;

    const sigma = sigmaDePasse({
        passSkill: passSkill,
        tecSkill: tecSkill,
        distAdversario: distAdversario,
        cosCorpo: cosCorpo
    });
    const desvio = sigma * amostraGaussiana(Math.random);
    const rodado = rodarNoPlano(dxAlvo, dzAlvo, desvio);

    const dirX = distToTarget > 0.001 ? rodado.x / distToTarget : 0;
    const dirZ = distToTarget > 0.001 ? rodado.z / distToTarget : 1;

    const erroDist = 1 + (Math.random() * 2 - 1) * PassModel.erroPesoMax * (1 - passSkill / 100);
    distToTarget *= erroDist * fatorForcaSobPressao(distAdversario);
```

`_v2` é um `THREE.Vector3` de trabalho global, declarado em `js/config.js:168` ao lado do `_v1`, e **não é usado dentro do `executePassGameplay`** (só aparece em comentários históricos) — é seguro usá-lo aqui. O `_v1` **não serve**: está a segurar o ponto alvo do passe durante toda a função.

- [ ] **Step 6: Correr a suite toda**

Run: `node --test "tests/*.test.js"`
Expected: todos passam.

- [ ] **Step 7: Medir o efeito**

Criar `_diag_perdas.js` na raiz (temporário — apagado no fim do passo):

```javascript
const { ctx, novoJogo } = require('./tests/headless.js');
const vm = require('vm');
novoJogo();
vm.runInContext(`
(function () {
    const jogadores = Match.players.concat(Match.opponents);
    const originais = new Map();
    for (const p of jogadores) originais.set(p, p.initiatePass.bind(p));

    let registos = null;
    for (const p of jogadores) {
        const orig = originais.get(p);
        p.initiatePass = function (alvo) {
            if (alvo && registos) registos.push({ passador: p, pretendido: alvo, resolvido: false });
            return orig(alvo);
        };
    }

    const est = (v) => {
        const m = v.reduce((a, b) => a + b, 0) / v.length;
        const dp = Math.sqrt(v.reduce((a, b) => a + (b - m) * (b - m), 0) / v.length);
        return m.toFixed(1) + ' +/- ' + dp.toFixed(1);
    };

    function medir(ligado) {
        // A/B no MESMO binario: sem isto, comparavam-se duas versoes do
        // ficheiro e vinham outras diferencas pelo meio.
        if (ligado) {
            PassErrorModel.sigmaMax = 0.16;
            PassErrorModel.sigmaMin = 0.012;
            PassErrorModel.forcaMinPressao = 0.85;
        } else {
            PassErrorModel.sigmaMax = 0;
            PassErrorModel.sigmaMin = 0;
            PassErrorModel.forcaMinPressao = 1.0;
        }

        const passes = [], falhados = [], desvios = [];
        for (let seed = 0; seed < 10; seed++) {
            let s = (1000 + seed * 7919) >>> 0;
            Math.random = function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
            Match.resetPlay(true);
            registos = [];
            const abertos = [];

            for (let i = 0; i < 6000; i++) {
                const antes = registos.length;
                Match.update(0.016);
                for (let k = antes; k < registos.length; k++) abertos.push(registos[k]);

                // Quem apanhou a bola decide o destino de cada passe aberto.
                const dono = Match.ballCarrier;
                if (dono) {
                    for (const r of abertos) {
                        if (r.resolvido) continue;
                        r.resolvido = true;
                        r.chegou = (dono === r.pretendido);
                        r.desvio = dono.model.position.distanceTo(r.pretendido.model.position);
                    }
                }
            }

            const fechados = abertos.filter(r => r.resolvido);
            if (fechados.length < 5) continue;
            passes.push(fechados.length);
            falhados.push(100 * fechados.filter(r => !r.chegou).length / fechados.length);
            desvios.push(fechados.reduce((a, r) => a + r.desvio, 0) / fechados.length);
        }
        return 'passes/semente ' + est(passes) +
            ' | nao chegaram ao pretendido ' + est(falhados) + '%' +
            ' | desvio medio ' + est(desvios) + ' m';
    }

    this.RES = 'SEM erro de execucao:' + String.fromCharCode(10) + medir(false) +
        String.fromCharCode(10) +
        'COM erro de execucao:' + String.fromCharCode(10) + medir(true);
})();
`, ctx);
console.log(ctx.RES);
```

Run: `node _diag_perdas.js` — **duas vezes**. Nesta sessão houve três medições de uma amostra só que não se reproduziram; um efeito que muda de sinal entre corridas não é efeito.

O número que interessa é `nao chegaram ao pretendido`: sem erro de execução deve estar perto de zero, porque hoje um passe cuja linha estava livre na decisão vai sempre lá dar.

Registar os números das duas corridas. Depois: `rm _diag_perdas.js`.

- [ ] **Step 8: Documentar**

Acrescentar ao topo da secção "Últimas Actualizações" do `docs/filesSummary.md` uma entrada com: o que mudou, os valores do `PassErrorModel`, e os números medidos no Step 7 (com desvio, e a dizer que são de 10 sementes × 2 corridas).

- [ ] **Step 9: Commit**

```bash
git add js/utils.js js/fsm.js tests/passe_erro.test.js docs/filesSummary.md
git commit -m "feat: pressao e angulo do corpo no erro do passe"
```

---

## Fora de âmbito

Ficam para planos próprios, por ordem do que eu atacaria a seguir:

- **Rest defense e 2º defensor (cobertura).** O `isCovering` já é lido pela FSM e escrito por ninguém — o consumidor existe, falta o produtor. O padrão do leilão por equipa (`atribuirMarcacoes`, `atribuirApoios`) aplica-se directamente.
- **Risco como rampa em vez de degrau** no `findPassTarget`: hoje 1.9 m de folga na linha é impossível e 2.0 m é gratuito. E o filtro corre antes de se saber se o passe vai pelo alto.
- **Ligar o cone de visão** (`findPassTargetInCone` existe e não tem chamadores) — como penalização, não como filtro, e depois de medir o efeito das tarefas deste plano.
- **Separation na velocidade**: 18.5% dos frames têm dois companheiros a menos de 1.5 m. Nunca no alvo — o `separarAlvos` antigo mexia nos alvos e fazia os jogadores serpentear.
- **Motor de antecipação** (`docs/superpowers/plans/2026-08-20-antecipacao-motor.md`), que também traz o placar e o relógio ao nível 1.
