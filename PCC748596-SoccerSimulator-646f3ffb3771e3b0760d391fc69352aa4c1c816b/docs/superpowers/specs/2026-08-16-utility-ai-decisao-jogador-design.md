# Utility AI para a decisão do jogador (nível 3)

Data: 2026-08-16

## 1. Problema

O nível 3 da cadeia de decisão (`js/bt/player_bt.js`) é um Behavior Tree cuja
raiz é um `Selector`. Um selector testa os filhos por ordem e executa o
primeiro cuja condição passe. A ordem em que os ramos estão escritos é, na
prática, a única regra de prioridade do jogo.

Isto produz três problemas concretos:

**As opções nunca são comparadas.** `Rematar` está antes de `Cruzar`, que está
antes de `PassarEmFrente`, que está antes de `Lancar`, que está antes de
`Passar`. Um remate mau de 26 metros em ângulo apertado ganha sempre de um
passe para um avançado completamente livre, porque o passe nem chega a ser
avaliado. O selector não pergunta "qual é a melhor?" — pergunta "esta serve?".

**O aleatório está a fazer o trabalho da comparação.** Como não há comparação,
cada ramo ganhou um sorteio para não disparar sempre: `CrossModel.chanceMax` no
cruzamento, `PassModel.throughBallChance` no lançamento, `PassModel.carryChance`
no passe, taxas por segundo (`chancePorSegundo`) no carrinho e no desarme. São
ruído a fingir de decisão: o cruzamento não deixa de acontecer por ser má
opção, deixa por ter saído o número errado.

**Os PlayingStyles não têm onde agir.** Um `cross_specialist` e um
`creative_playmaker` correm exactamente a mesma árvore, com a mesma ordem de
ramos. Os multiplicadores declarados em `EstiloBase` (`js/config.js:626`) são
aplicados de forma inconsistente: `cruzar` e `lancar` só mexem num
`Math.random()`, `remate` não é lido pelo ramo `Rematar`, e `conduzir` não é
lido em lado nenhum. Trocar o estilo de um jogador quase não muda o que ele faz.

Há ainda um quarto problema, do mesmo tipo, escondido noutra camada: o **drible
não é uma decisão**. O `changeState('DRIBBLE')` vive dentro do `case 'CARRY'`
da FSM (`js/fsm.js:434-441`) e dispara sempre que existe um adversário no cone
frontal a menos de `DribbleModel.triggerDist`. Não é comparado com nada, não
consulta o estilo do jogador, não consulta a skill dele para *decidir* (só para
resolver o duelo), e o `DribbleModel.cooldown` é um parâmetro morto —
`dribbleCooldownTimer` é inicializado em `js/player.js:77`, posto a zero em
`js/fsm.js:437`, e nunca incrementado nem lido. Isto também viola a regra do
próprio projecto, declarada em `js/bt/core.js:11`: o BT decide, a FSM executa.

## 2. Solução

Substituir o `Selector` do nível 3 por um sistema de Utility AI: todas as acções
aplicáveis são pontuadas no mesmo frame, com a mesma escala, e a escolha é feita
entre elas. Os PlayingStyles passam a ser multiplicadores do score por acção —
que é o que já dizem ser.

Os níveis 1 (`TeamBT`) e 2 (`PositionBT`) mantêm-se como Behavior Trees. O plano
colectivo e a escolha de slot posicional mudam pouco por frame e não sofrem do
problema descrito.

## 3. Arquitectura

### 3.1 Ficheiros novos

| Ficheiro | Papel |
|---|---|
| `js/utility/core.js` | Motor: curvas de resposta, `Consideration`, `UtilityAction`, `escolher()`. Sem conhecimento de futebol. |
| `js/utility/actions.js` | Catálogo de acções: pré-condição dura, considerandos, peso de estilo, e a função de execução (reaproveitada do BT). |
| `js/utility/player_utility.js` | Ponto de entrada `UtilityAI.tick(p, dt)`. |

### 3.2 Ficheiros inalterados

`js/fsm.js` (excepto a remoção descrita em §7), `js/bt/team_bt.js`,
`js/bt/position_bt.js`, `js/perception.js`, `js/spatial_grid.js`.

As funções `actPass`, `actShoot`, `actCross`, `actThroughBall`, `actCarry`,
`actSlideTackle`, `actTackle`, `actChaseBall`, `actIntercept`,
`actReceivePass`, `actHoldPosition`, `actGoalkeeperPosition`, e as funções de
procura `findPassTarget`, `findPassTargetRelaxed`, `findPassTargetDesperate`,
`findCross`, `findThroughBall`, `podeIntercetar`, `emZonaDeRemate`, bem como a
classe `PlayerContext`, são reaproveitadas tal como estão. Ficam onde estão
enquanto o BT existir, para o diff desta fase ser legível; movem-se quando o BT
for removido.

### 3.3 Gates duros

Três condições continuam a ser Behavior Tree, avaliadas antes de qualquer
pontuação. Não são questões de utilidade, são regras do jogo, e metê-las na
pontuação abre a porta a uma acção em curso ser interrompida por um score
marginal:

1. `Match.state !== 'PLAY'` — bola parada. Comportamento actual do ramo
   `BolaParada`, inalterado.
2. `fsm.currentState` em `PASS`, `SHOOT`, `TACKLE`, `SLIDE_TACKLE`, `CUT`,
   `CHEST_CONTROL` — acção em curso, deixa terminar.
3. `p.role === 'gk'` — o guarda-redes tem um conjunto de acções próprio
   (passe curto, lançamento longo, segurar, posicionar na baliza). Mantém-se a
   lógica actual dos ramos `GuardaRedesJoga` e `GuardaRedes`.

### 3.4 Fluxo por frame, jogador de campo

```
ctx.prepare(dt)                    (PlayerContext existente, ver §7 para adições)
  |
gates duros                        se algum dispara, termina aqui
  |
para cada acção candidata:
   pré-condição dura falsa    -> score 0, sai
   score = combinar(considerandos)
   score *= estiloAtivoDe(p)[chaveDoEstilo]
   score *= bónus de inércia        se é a acção do frame anterior
  |
escolher(candidatas)               top-N dentro de margem, sorteio ponderado
  |
accao.executar(ctx)                chama a função act* existente
```

### 3.5 Combinação dos considerandos

Produto, não soma. Com soma, um considerando a zero é abafado pelos outros — é
como se chega a rematar de 40 metros porque "estou livre" e "estou virado para o
golo" somam alto. Com produto, um considerando a zero mata a acção, que é o
comportamento pretendido.

Para não penalizar acções com mais considerandos do que outras, aplica-se a
compensação habitual (Dave Mark):

```js
function combinar(valores) {
    const n = valores.length;
    if (!n) return 0;
    let produto = 1;
    for (const v of valores) produto *= v;
    if (produto === 0) return 0;
    const compensacao = 1 - 1 / n;
    const modificacao = (1 - produto) * compensacao;
    return produto + modificacao * produto;
}
```

### 3.6 Curvas de resposta

Quatro curvas cobrem tudo o que é preciso. Cada considerando normaliza uma
medida do jogo para `0..1` e passa-a por uma delas.

```js
const Curvas = {
    linear:    (x, m = 1, k = 0) => clamp01(m * x + k),
    quad:      (x, m = 1, k = 0) => clamp01(m * x * x + k),
    inv:       (x, m = 1, k = 1) => clamp01(k - m * x),
    logistica: (x, k = 10, c = 0.5) => 1 / (1 + Math.exp(-k * (x - c)))
};
```

A `logistica` é a que substitui a maior parte dos `if` binários actuais.
`emZonaDeRemate` deixa de ser sim/não: 24 metros passa a valer cerca de 0.35,
12 metros cerca de 0.9.

## 4. Catálogo de acções — com bola

| Acção | Pré-condição dura | Considerandos | Peso de estilo |
|---|---|---|---|
| `SHOOT` | célula da camada CHUTE do `SpatialGrid` > 0; `zoneAhead > 15` | distância ao golo (`inv` sobre `shootingRange()`), ângulo (`logistica` sobre `ShootingModel.maxOffsetX`), pressão (`inv`), skill FIN | `remate` |
| `DRIBBLE` | adversário no cone frontal entre 1.5 m e `DribbleModel.triggerDist`; `dribbleCooldownTimer > DribbleModel.cooldown` | TEC do portador contra MARKING do defensor (`logistica`), espaço do lado de fuga (`SpatialGrid`), perigo da zona (`inv` — driblar à entrada da própria área vale pouco), número de adversários de apoio (`inv` — 1v1 sim, 1v3 não) | `driblar` (novo) |
| `CROSS` | `findCross()` devolve alvo | número de alvos na área (`linear`, satura a 3), largura, profundidade, pressão (`inv`) | `cruzar` |
| `THROUGH_BALL` | `findThroughBall()` devolve alvo | tamanho do espaço, vantagem de corrida do colega, skill PASS, pressão (`inv`) | `lancar` |
| `PASS` | `bestPassTarget(ctx, preferida)` devolve alvo — mantém a cascata actual (`findPassTarget`, depois `findPassTargetRelaxed` e `findPassTargetDesperate` sob pressão) | score do alvo normalizado (`/260`), progressão para a frente, segurança da linha de passe, pressão (`linear` — sob pressão sobe) | `passe` |
| `CARRY` | não é guarda-redes | `espacoAFrente` (`logistica` sobre `CarryModel.espacoLivre`), orçamento restante de `carryDist` (`inv` sobre `CarryModel.distanciaMax`), pressão (`inv`), skill TEC | `conduzir` |
| `HOLD` | — | fallback com score fixo de 0.15; garante que nunca fica sem acção | — |

O ramo `PassarEmFrente` desaparece como acção autónoma: existia apenas para
forçar ordem entre passe e condução. Passa a ser o considerando de progressão
dentro de `PASS`.

O ramo `Dominar` desaparece: substituído pela inércia (§6).

## 5. Catálogo de acções — sem bola

| Acção | Pré-condição dura | Considerandos | Peso de estilo |
|---|---|---|---|
| `SLIDE_TACKLE` | portador adversário entre 2.5 m (CB 2.8 m) e 4.5 m; ângulo de aproximação ≤ 90° em relação à direcção de movimento dele; `tempoPertoDoPortador >= DefensivePressureModel[Tatics.pressaoDefensiva]` | distância (`inv`), ângulo, perigo da zona (`quad` — sobe perto da própria área), risco (`inv` se for o último homem) | `pressao` |
| `TACKLE` | portador adversário a menos de 2.5 m (CB 2.8 m); mesmo gate de tempo | distância (`inv`), vantagem VELOCIDADE+FORÇA no duelo, perigo da zona | `pressao` |
| `INTERCEPT` | `podeIntercetar()` | tempo até ao ponto de intercepção (`inv`), vantagem sobre os outros candidatos | `intercetar` (novo) |
| `CHASE_BALL` | `distToBall < 12` | é o chaser designado pelo nível 1 (1.0, ou 0.2 se não for), distância (`inv`) | — |
| `RECEIVE_PASS` | `Match.intendedReceiver === p` | fixo alto (0.95) | — |
| `ATTACK_BOX` | colega da equipa na ala em posição de cruzar (limiares do `CrossModel`); não é `def` nem `gk` | distância à área (`inv`), poste livre | `apoiar` (novo) |
| `HOLD_POSITION` | — | fallback com score fixo de 0.2 | — |

`HOLD_POSITION` chama `actHoldPosition` sem alterações: a escolha entre
`MARKING`, `BLOCKING`, `FWR_SUPPORT`, `AFT_SUPPORT` e `MOVE_TO_POS` continua a
ser feita lá dentro, com o `p.dynamicTarget` que o nível 2 já calculou. O
Utility decide *que* o jogador ocupe posição; o rótulo continua a sair de
`actHoldPosition`.

As taxas por segundo do carrinho e do desarme (`taxa = 8.4` para CB, etc., via
`chancePorSegundo`) são eliminadas. Os gates de tempo do Defensive Pressure
mantêm-se — são regra táctica configurada no painel, não ruído.

## 6. Inércia de decisão

Substitui o ramo `Dominar` e a janela cega do `CadenceModel`. O Utility corre
todos os frames, mas a acção escolhida no frame anterior recebe um bónus
multiplicativo que decai com o tempo:

```js
inercia = 1 + UtilityModel.inerciaBase * Math.exp(-tempoNaAccao / decaimento);
```

com

```js
decaimento = UtilityModel.inerciaDecai
           * (ctx.underPressure ? CadenceModel.posseSobPressao : CadenceModel.posseBase)
           / CadenceModel.posseBase
           * estiloAtivoDe(p).cadencia;
```

Valores iniciais: `inerciaBase = 0.45`, `inerciaDecai = 0.8` segundos.

Recém-decidido, manter a acção actual vale mais 45%: só troca se outra for
claramente melhor. Ao fim de cerca de dois segundos o bónus é residual e o
jogador reavalia livremente. O `estiloAtivoDe(p).cadencia` continua a funcionar
como funciona hoje — Target Man (1.6) segura mais a bola, Fox in the Box (0.6)
resolve num toque — mas sem cegar o jogador durante três segundos de jogo.

## 7. Alterações a ficheiros existentes

**`js/config.js`**

- `EstiloBase` ganha `driblar: 1.0`, `marcar: 1.0`, `intercetar: 1.0`,
  `apoiar: 1.0`.
- Novo `UtilityModel = { margemTopN: 0.65, tamanhoPool: 3, inerciaBase: 0.45, inerciaDecai: 0.8 }`.
- `PlayingStyles` ganha valores de `driblar` onde faz sentido:
  `prolific_winger` 1.5, `creative_playmaker` 1.4, `roaming_flank` 1.4,
  `orchestrator` 0.5, `target_man` 0.5, `fox_in_the_box` 0.4,
  `the_destroyer` 0.4, `anchor_man` 0.3.
- Removidos por deixarem de ter consumidor: `PassModel.carryChance`,
  `PassModel.carryChanceShort`, `PassModel.carryChanceLong`,
  `PassModel.throughBallChance`, `CrossModel.chanceMax`.

**`js/player.js`**

- Linha 417: `PlayerAI.tick(this, dt)` passa a
  `if (window.usarUtilityAI) UtilityAI.tick(this, dt); else PlayerAI.tick(this, dt);`

**`js/bt/player_bt.js`**

- `PlayerContext.prepare()` passa a incrementar `p.dribbleCooldownTimer += dt`
  (e a zerá-lo quando o drible entra), para o `DribbleModel.cooldown` passar a
  ter efeito.
- O bloco `CalculaDebug` (linhas 697-710) é removido: recalculava tudo apenas
  para o painel de debug, e com Utility a pontuação já é o cálculo real.
- A árvore `PlayerBT` e o `PlayerAI` mantêm-se enquanto a flag existir.

**`js/fsm.js`**

- Linhas 434-441, dentro do `case 'CARRY'`: remover o
  `this.changeState('DRIBBLE')` e a atribuição de `p.dribbleOpponent`. Fica só
  o `break` que mantém o toque curto. O incremento de
  `MatchStats[p.team].dribles.tentados` passa para a acção `DRIBBLE` do Utility.
- O `case 'DRIBBLE'` em si não muda: continua a executar o gesto e a resolver o
  duelo.

**`js/main.js` e `index.html`**

- Acrescentar `PassCandidates.update(delta)` ao `animate()` (`js/main.js:428`),
  junto do resto do desenho de debug e não em `js/simulate.js` — a simulação em
  lote não desenha nada. A função existe (`js/pass_candidates.js:69`) mas nunca
  é chamada, pelo que hoje as marcas de debug são desenhadas uma vez ao ligar o
  botão e ficam congeladas no relvado.
- Novo botão `btn-utility` (`Utility AI: ON/OFF`), a alternar
  `window.usarUtilityAI`, no mesmo padrão do `btn-passgrid` actual. Fica a OFF
  no passo 3 da implementação e passa a ON por omissão a partir do passo 4
  (ver §10).
- Remover o botão `btn-passgrid` e a função `togglePasseGrid`: `window.usarPasseGrid`
  é escrito em `js/main.js:189` e não é lido em lado nenhum. O ramo que o
  consumia (`findGridPassTarget`) não existe.

**`js/pass_candidates.js`**

- Corrigir o docstring da linha 80, que afirma que `gerarCandidatos` é usada
  "pela decisão de passe real (ver findGridPassTarget em player_bt.js)". Essa
  função não existe. O módulo é exclusivamente debug visual.

**`decisionSummary.md`**

- Remover a linha 49, que documenta um ramo `PassarGrid` inexistente.
- Reescrever as secções 2, 3 e 4 para descreverem o Utility em vez da árvore.

## 8. Selecção da acção

```js
function escolher(candidatas) {
    const validas = candidatas.filter(c => c.score > 0.02);
    if (!validas.length) return null;
    validas.sort((a, b) => b.score - a.score);
    const corte = validas[0].score * UtilityModel.margemTopN;
    const pool = validas.filter(c => c.score >= corte)
                        .slice(0, UtilityModel.tamanhoPool);
    if (pool.length === 1) return pool[0];
    const total = pool.reduce((s, c) => s + c.score, 0);
    let r = Math.random() * total;
    for (const c of pool) { r -= c.score; if (r <= 0) return c; }
    return pool[0];
}
```

Só entram no sorteio as acções que chegam a `margemTopN` do topo. O sorteio
deixa de ser ruído cego — passa a ser variedade entre opções que já provaram ser
boas. Pôr `margemTopN` a 1.0 dá argmax puro, útil para depurar sem alterar
código.

## 9. Debug

O painel `showPlayerPoints` já existe (`js/main.js:94`) e já desenha valores por
jogador (`js/player.js:958`). Passa a ser alimentado pelo Utility: em vez de
`SIM`/`NAO` e de valores em escalas diferentes, mostra o score `0..1` de cada
acção, ordenado, com a vencedora marcada.

Acrescenta-se `p.utilityTrace`, preenchido apenas quando
`window.showPlayerPoints` está activo:

```js
p.utilityTrace = [ { accao: 'PASS', score: 0.71, considerandos: { alvo: 0.9, progressao: 0.8, ... } }, ... ];
```

Permite ver *porque* uma acção perdeu, e não apenas que perdeu — que é o que
falta hoje para conseguir afinar.

O `PassCandidates` (botão `PlayerPassTarget`) mantém-se como debug visual, com o
`update(dt)` corrigido. Não alimenta a decisão. Se depois da afinação faltar
passe ao espaço, acrescenta-se uma acção `PASS_TO_SPACE` ao catálogo — o Utility
aceita acções novas sem alterações estruturais, que é precisamente a vantagem
sobre o selector.

## 10. Ordem de implementação

Cada passo de 3 a 7 é verificável em jogo isoladamente, com a flag a alternar
entre os dois sistemas.

1. `js/utility/core.js` — curvas, `combinar`, `escolher`, com testes.
2. `js/config.js` — `UtilityModel`, novos campos de `EstiloBase`, valores de
   `driblar` nos estilos.
3. Acções com bola, `UtilityAI.tick`, flag e botão. BT ainda como default
   durante este passo.
4. Acções sem bola. Passa a Utility como default.
5. Remover o `changeState('DRIBBLE')` da FSM; `dribbleCooldownTimer` a contar
   no `prepare()`.
6. Inércia substitui o ramo `Dominar`.
7. Debug: `utilityTrace` no painel; `PassCandidates.update` no loop; remover o
   `btn-passgrid` e a documentação do ramo inexistente.
8. Afinação em jogo. Só depois disto se decide se o BT do nível 3 é removido.

## 11. Fora de âmbito

- `TeamBT` (nível 1) e `PositionBT` (nível 2) mantêm-se como Behavior Trees.
- A lógica interna de `actHoldPosition` não é alterada.
- `PassCandidates` não passa a alimentar a decisão. Decidir sobre *pontos* em
  vez de *jogadores* alteraria a assinatura de `actPass` e de
  `Match.intendedReceiver`, e o custo é real (cerca de 350 pontos por frame,
  cada um a varrer 22 jogadores duas vezes). É um trabalho próprio.
- Nenhuma alteração ao sistema de animação, física da bola ou percepção.
