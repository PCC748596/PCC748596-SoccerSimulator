# Referência dos ficheiros JavaScript

Mapa do código do Soccer Simulator depois da divisão do `index.html` monolítico.
Consulta este ficheiro para saber **onde** mexer antes de abrir o código.

## Últimas Actualizações (Agosto 2026)

- **Setor do campo manda na largura:** `fechoDoSector(setores)` (js/config.js) entra no `slotNoBloco` (team_bt.js) como multiplicador do `LineShape.fecho`, e quem está num sector pedido deixa de ser puxado 4 m para dentro quando a bola está no eixo. Antes o botão não mexia no posicionamento: `Tatics.setores` só era lido no `findPassTarget` (player.js) e no CARRY (fsm.js), e a equipa tinha 32 m de largura em 68 m de campo com qualquer combinação. Medido (12 sementes, 20 s cada): largura da equipa 32.3 m em qualquer combinação → **39.8 ± 1.8 m** com esq+dir, **33.3 ± 1.4 m** com os três, **25.6 ± 3.8 m** só com cen. A fracção de tempo com o portador da bola numa ala NÃO se separa a esta amostragem (46 ± 20% / 51 ± 25% / 47 ± 25%): o sector manda na largura da equipa; se isso se traduz em mais jogo pela ala é outra medição, e ainda não está provada. Os alvos passaram também a ser limitados ao rectângulo do bloco no fim do `slotNoBloco` — o deslocamento de corredor (2/6/8 m) era somado depois do mapeamento e punha 3.2% dos alvos fora do campo (máximo |x| = 37.6 em 34).
- **Harness headless (`tests/headless.js`):** o jogo inteiro a correr em jsdom + three, sem browser, na mesma ordem de scripts do index.html. Serve para medir comportamento em campo ao fim de N frames em vez de só testar funções puras.
- **Canto (geometria e Ctrl+C):** `pontoDeCanto(bolaX, attDir)` (js/config.js) passa a decidir a quina: bola na bandeirola e no chão, batedor **fora** do campo na recta área→quina (1.6 m para lá da bola) e o ponto da área (`Match.cornerAlvo`) para onde ele olha — o `SET_PIECE_TAKER` na [fsm.js](js/fsm.js) virava-o para a BOLA todos os frames e ele ficava de costas para a área. O `setupSetPiece` limpa também o `hasBall` de toda a gente (era o que colava a bola ao peito do guarda-redes numa bola parada). **Ctrl+C** (`Match.forcarCanto`) marca um canto para a equipa que está a atacar, na quina do lado onde a bola está.
- **Marcação Exclusiva (um homem, um marcador):** `atribuirMarcacoes` (js/config.js) substitui o `escolherReferencia`. A escolha deixou de ser por jogador — passa a ser um leilão guloso por equipa, com cada adversário atribuído a um só marcador. O `PosicionamentoAI` partiu-se em `tickBase` (slot + estilo, escreve `p.postoBase`) e `tickFinal` (marcação + inquietação + tecto), com `atribuirMarcacoesDaEquipa` pelo meio no `Match.runTeamAI`. Corrigia o RM e o CM a esbarrarem com a bola na ala oposta: os slots estavam a 7.08 m mas os dois escolhiam o mesmo adversário e o `pontoDeMarcacao` mandava-os para a mesma coordenada (alvos a 0.35 m).
- **Física da Rede (Goal Net Physics):** Correção das colisões da bola com a malha da baliza no `js/match.js`. Foi removida a restrição de distância estrita, assegurando que remates rápidos não a atravessem, e que bolas vindas por trás batam na rede por fora.
- **Inércia de Movimentação (Steering):** Afinação no `js/player.js` para um feeling mais pesado e realista. Curvas mais abertas ao diminuir o multiplicador de `slerp` (rotação de 7.0 para 3.5) e a interpolação linear da velocidade (2.5 para 1.8).
- **Compacidade Dinâmica dos Corredores:** No `js/bt/team_bt.js` (`slotNoBloco`), a distância entre os jogadores reage dinamicamente à posição da bola. Extremos "fecham" para o meio (aprox. 4m) quando a bola está central. Quando a bola cai numa ala, a equipa desliza em bloco, com o lado oposto e centro a aproximarem-se 3m e 2m da bola.
- **Otimizações Extremas de Performance (Foco em Tablets/Mobile):**
  - **Shader da Torcida na GPU:** A animação dos 12.000 espectadores deixou de devorar a CPU a cada frame no `updateCrowd` (`js/match.js`). Em vez disso, foi injetado um **Vertex Shader** customizado via `onBeforeCompile` no material do `InstancedMesh`. As ondas de braços e saltos rodam agora nativamente a 100% na placa gráfica via matemática de matrizes GLSL com base num `uTime` e `uExcitement`.
  - **Gestão do Pixel Ratio:** Em dispositivos touch, o multiplicador de `devicePixelRatio` no `js/main.js` foi cortado para o limite de `1.0`. Isto impede os ecrãs Retina dos tablets de asfixiarem a gráfica com resoluções desnecessárias.
  - **Sombras e Luz (Shadow Map):** Passou-se para `THREE.PCFShadowMap` (mais barato que o SoftShadowMap). No Mobile/Tablet a resolução caiu de 1024 para 512, e o `castShadow` foi removido cirurgicamente dos membros pequenos (pernas/braços) no `js/player.js`, poupando imensas *draw calls* extras para criar os mapas de profundidade.
  - **Frustum Culling:** Reativada a verificação para os 22 jogadores no campo (`js/player.js`). Quando um jogador sai do cone de visão da câmara, o renderizador oculta a malha do boneco por completo.
  - **DOM Reflows e Throttling:** HUD de estado só atualiza se o texto for diferente. As mensagens `BroadcastChannel` para a ferramenta de Fluxograma no `js/main.js` foram estabilizadas para ~5 Hz (200ms) libertando o Event Loop.

## Como está montado

Todos os ficheiros são **scripts clássicos** (não módulos ES). Partilham o mesmo
scope global: `Match`, `Tatics`, `FootballPlayer`, etc. são visíveis entre ficheiros
sem `import`/`export`. Os handlers inline do HTML (`onclick="Match.setSpeed(1.0)"`)
dependem disso.

Ordem de carregamento no [index.html](index.html) — **não trocar**:

```
three.min.js (CDN)
  └─ assets/ball_mesh.js
  └─ event_bus.js → joint_limits.js
       → config.js → stats.js → utils.js → controls.js
       → bt/action_state.js → perception.js
       → spatial_grid.js → pass_candidates.js
       → bt/core.js → bt/team_bt.js → bt/position_bt.js → bt/player_bt.js
       → match.js → player.js → fsm.js → simulate.js
       → bt/btDebug.js
       → main.js
```

(nota: `perception.js` vive em `js/perception.js`, não em `js/bt/` — o diagrama
acima segue a ordem real de carregamento no `index.html`, não a pasta.)

`event_bus.js` e `joint_limits.js` vêm ANTES do `config.js` de propósito: o
`config.js` não depende deles, mas quem depende (`match.js`, `player.js`)
carrega bem depois, e pô-los no topo deixa claro que são infra-estrutura e
não parte do modelo de jogo.

Fluxo em runtime:

```
DOMContentLoaded (main.js)
  └─ cria scene/renderer/camera → Match.init(scene)
       ├─ createField()    constrói estádio, relva, linhas, balizas, público
       ├─ createTeams()    22 × FootballPlayer
       └─ assignFormations()
  └─ animate()  ← requestAnimationFrame, corre para sempre
       ├─ Match.update(dt)
       │    ├─ runTeamAI()  ← orquestra os níveis 1 e 2 (ver abaixo)
       │    ├─ updateBall()
       │    └─ player.update(dt) → runBehaviorTree() (nível 3) → fsm.changeState(...)
       │                         └─ fsm.update(dt) → executa a acção ao longo do tempo
       └─ renderer.render()
```

## A arquitectura de decisão: 3 níveis de BT + FSM

**O BT decide, a FSM executa.** Um nó de BT nunca deve conter lógica que dure
vários frames — muda o estado da FSM e devolve `SUCCESS`. A duração (um carrinho
que leva 1.5 s, um passe em curso) vive sempre na `PlayerFSM`.

| Nível | Onde | Frequência | Pergunta que responde | Escreve em |
|---|---|---|---|---|
| 1 · Team | [js/bt/team_bt.js](js/bt/team_bt.js) | 1×/equipa/frame | Que plano colectivo? | `TeamBlackboard` + marcações |
| 2 · Position | [js/bt/position_bt.js](js/bt/position_bt.js) | 1×/jogador de campo/frame | Onde me coloco? | `p.dynamicTarget` |
| 3 · Individual | [js/bt/player_bt.js](js/bt/player_bt.js) | 1×/jogador/frame | Que faço agora? | `p.fsm.changeState(...)` |

Ordem obrigatória por frame: **1 → 2 → 3**. O nível 2 lê o blackboard do nível 1;
o nível 3 lê o alvo posicional do nível 2. `Match.runTeamAI()` é só o orquestrador
que garante essa ordem — já não decide nada por si.

> **Os três níveis estão implementados como Behavior Trees.**
> `FootballPlayer.runBehaviorTree()` é hoje só a porta de entrada que delega em
> `PlayerAI.tick()`, para o resto do código continuar a chamá-la como sempre.

### `bt/core.js` — motor

`BTNode` e os nós: `Sequence` (E lógico), `Selector` (OU, dá prioridade ao filho
mais à esquerda), `Inverter`, `Succeeder`, `Condition` (teste puro, não altera
nada), `Action` (efeito; sem retorno = `SUCCESS`). Construtores curtos para as
árvores ficarem legíveis: `seq()`, `sel()`, `cond()`, `act()`, `not()`, `opt()`.
`BT.debug = true` grava o caminho percorrido em `bb.trace`.

### `event_bus.js` — pub/sub

`EventBus.on(nome, cb)` / `.off(nome, cb)` / `.emit(nome, dados)`. Existe para
substituir, por partes, o polling de estado alheio espalhado por ifs
(`gk.gkEstado === 'apanhar'` lido em três ficheiros diferentes, etc.).

Eventos vivos hoje:

| Evento | Emitido em | Efeito |
|---|---|---|
| `GK_CATCH_BALL` | `player.grabBall()` | `Match.gkHoldingBall[team] = true`; marca `p.snapPosition` em TODOS os jogadores (reposicionamento instantâneo no frame seguinte) |
| `GK_RELEASE_BALL` | contacto do chutão do GR | `Match.gkHoldingBall[team] = false` |
| `CB_HAS_BALL` | `prepare()` (player_bt) | `buildOutBias`: CB oposto -3m, lateral do lado +3m, lateral oposto +5m |
| `CM_HAS_BALL` | `prepare()` (player_bt) | RM/LM do lado +5m, RB/LB do lado +10m, CM oposto -4m, RM/LM oposto +3m |
| `GK_STYLE_OFFENSIVE` / `GK_STYLE_DEFENSIVE` | `updateGkStyle` (team_bt) | notificação; o estado corrente vive em `p.gkStyle` |

`Match.gkHoldingBall` é a cache mantida por estes listeners — quem precisa da
informação (`afastarDoGuardaRedes`, `commit()`, `pickChaser`, `pickSupportMid`,
`computeBlock`) lê a cache, não o estado interno do GR.

Por migrar: RB/LB e GOAL_KICK.

### `joint_limits.js` — limites anatómicos

Base de dados de amplitudes de rotação por articulação, mapeada aos ossos
reais do rig. `JointLimits.clampOmbro(x, y, z)` trata o ombro como junta 3DOF
acoplada (a abertura máxima depende da elevação) e devolve os ângulos
corrigidos. Usada pela animação procedural dos braços do guarda-redes —
mergulho, salto alto e a defesa de pé (`'maos'`).

### `spatial_grid.js` — grelha do campo + camadas de bónus

Grelha 2×2 m sobre o campo. Duas responsabilidades distintas:

1. **Consulta geométrica**: `findFreeSpace(x, z, raio, equipa)` e
   `occupancy(x, z, raio, equipa)` — usadas pelo lançamento para mirar o
   espaço real, não uma aproximação.
2. **Camadas de bónus autoradas** (`SpatialGrid.LAYERS`): cada camada é uma
   função `(avanco, cx) -> 0..100` que dá valor táctico a cada célula.
   `layerValueAt(camada, x, z, equipa)` lê essa função no referencial de
   ataque da equipa.

| Camada | Consumida em | Peso |
|---|---|---|
| `pass` | `findPassTarget` (player.js) | × 0.4 |
| `marking` | marcação (position_bt) | — |
| `chute` | `emZonaDeRemate` (player_bt) — valor 0 **veta** o remate | gate |
| `cruzamento` | `findCross` (player_bt) | × `CrossModel.pesoGrid` |
| `lancamento` | `findThroughBall` (player_bt) | × 0.5 |

**`layerValueAt` espelha por `dir = (team === 'TeamA') ? 1 : -1`** — o `dirZ`
real de cada equipa. Já esteve invertido, e o efeito era a camada CHUTE valer
0 na zona de remate real das DUAS equipas: nenhum avançado rematava.

**A camada `lancamento` é hoje um stub (`return 0`)** — está ligada e é lida,
mas não acrescenta nada até ser autorada.

### `pass_candidates.js` — pontos candidatos de passe (experimental)

`PassCandidates.gerarCandidatos(carrier)` gera um leque radial à volta de cada
companheiro (raios 2/4/6/8/10 m × 7 ângulos num cone de ±45°) e descarta os
pontos de menor qualidade: fora do campo, mais perto de um adversário do que
de um companheiro, a mais de 30 m da bola, em fora-de-jogo, ou com adversário
dentro de ±20° da linha de passe e mais perto que o ponto.

A mesma função serve dois consumidores: o desenho de debug (botão
*PlayerPassTarget*, círculos laranja rentes ao relvado) e a decisão de passe
alternativa `findGridPassTarget`, ligada em `window.usarPasseGrid` (botão
*PassGrid*). **A lógica antiga (`bestPassTarget`/`findPassTarget`) fica
intacta por baixo** — o toggle escolhe qual corre.

### `bt/action_state.js` — sincronização gameplay ↔ animação

Antes, o BT/FSM executava o efeito real de uma acção (bola sai do pé) no mesmo
frame em que decidia — a animação só apanhava o gesto depois, e a bola parecia
sair antes do pé "tocar" nela. `ActionState` corrige isto para uma acção de
cada vez. Migrados até agora: `PASS` e o chutão do guarda-redes (`gkPunt`).
Por migrar: chute, cabeceio, desarme, condução.

```js
new ActionState(clipKey, { onPrepare, onContact, onFollowThrough })
```

Lê `ActionAnimClips[clipKey]` (`config.js`) por `{ duration, contactTime }` —
`contactTime` é a fracção (0..1) da duração em que o efeito dispara. Cada
frame, `update(dt, ctx)` avança o tempo normalizado e chama `onContact` **uma
única vez**, exactamente no frame em que esse tempo cruza `contactTime`; antes
disso é `onPrepare` (opcional), depois `onFollowThrough` (opcional).

Fluxo do `PASS`: `initiatePass()` (`player.js`) só monta o alvo e cria
`p.actionState`, sem tocar na bola; o `case 'PASS'` (`fsm.js`) lê
`p.actionState.update(dt,p)` para posar o rig, e `executePassGameplay(p)`
(também em `fsm.js`, extraído do bloco antigo) é o `onContact` — dispara
sozinho no frame certo. `ActionAnimClips.pass = { duration: 0.2, contactTime:
0.4 }` replica exactamente o timing antigo (`this.timer < 0.08` / `>= 0.2`),
para a migração não mudar o "feel" do passe.

### `bt/team_bt.js` — nível 1

Produz o plano colectivo num `TeamBlackboard` (um por equipa, reutilizado entre
frames). Postura escolhida pela árvore:

```
SET_PIECE ─ jogo parado
├ com bola: COUNTER → FINAL_THIRD → ATTACK_SUSTAINED → BUILD_UP
└ sem bola: FLANK_SHIFT → LOW_BLOCK → HIGH_PRESS → MID_BLOCK
```

**`HIGH_PRESS` exige dois "sim":** `Tatics.estilo === 'ataque'` **e**
`Tatics.pressaoDefensiva === 'high'` (painel esquerdo, "Defensive Pressure").
Antes só o estilo bastava — uma equipa em Balanced com Estilo=Ataque
pressionava tão alto quanto High.

**Cadência de reacção (`pickChaser`/`assignMarking`).** Sem bola, a equipa não
reage no mesmo frame em que a perde — espera `DefensivePressureModel[pressao]`
segundos (Low 6 / Balanced 4 / High 2) desde a última troca de posse
(`Match.possessionTimer`) antes de reavaliar chaser e marcação. Até lá mantém
o que já tinha. Simula o "observar antes de decidir pressionar" do jogo real —
sem isto a marcação reagia instantaneamente à posse, ritmo de "últimos 5
minutos perdendo a final" o jogo inteiro.

Além da postura, escreve: `pushMultiplier`, `styleDefenseZShift`, `advanceFactor`,
`chaser` (quem vai à bola — decisão colectiva, só um vai) e `flankAlert`.

`markingTarget` / `isCovering` / `markCount` continuam a ser **limpos** aqui a
cada tick, mas ninguém os escreve: foram apagados com o antigo nível 2. A
marcação a sério é posicional e não passa por eles (ver `MarkingModel`).

**Camada tática coletiva** (tacticSystem.md, ao lado deste ficheiro) — três campos novos no
`TeamBlackboard`, calculados no fim de `gather()`, uma camada ACIMA do
Decision Grid e dos Playing Styles (que continuam intocados):

```
momentumX    EMA de -1 (esq) a +1 (dir) de onde a bola anda lateralmente —
             suavizado (updateMomentum), uma troca de lado isolada não vira
             Momentum sozinha
congestion   { esq, centro, dir } 0-100 — adversários de campo perto da
             bola em Z, contados por banda de X (computeCongestion)
aggression   0-1 — Mentalidade (MentalidadeModel[Tatics.estilo].agressao)
             reduzida pela congestão do lado ONDE A BOLA ESTÁ agora
             (computeAggression); a 0.5 (neutro) reproduz o tuning antigo
```

`TeamPlayStyle` (catálogo `TeamPlayStyles` em `config.js`, seleccionado em
`Tatics.teamPlayStyle`, painel "Estilo Coletivo") é um conjunto de
multiplicadores (`circulacao`, `verticalidade`, `viradas`, `corredores`,
`cruzamento`, `pressaoPosPerda`) lidos por quem já decidia essas coisas —
não é um sistema à parte. Pontos de leitura:

| Campo | Onde é lido | Efeito |
|---|---|---|
| `verticalidade`, `circulacao`, `viradas` | `player.js` → `findPassTarget()` | pesa progressão vs. circulação/virada no passe real |
| `corredores` | `findPassTarget()` | multiplica o bónus de `Tatics.setores` |
| `cruzamento` | `player_bt.js` → `findCross()` | multiplica a chance de cruzamento |
| `pressaoPosPerda` | `team_bt.js` → `pickChaser`/`assignMarking` | multiplica o `reactionDelay` pós-perda |
| `aggression`, `congestion` | `findPassTarget()` | escala o bónus de lançamento em espaço vazio e dispara virada de jogo quando o meu lado está cheio e o outro não |

Playing Styles continuam a decidir o que sempre decidiram (ex.: Orchestrator
já tinha bónus próprio de recuar/inverter — intocado, a camada nova só
soma por cima para todos os OUTROS passadores).

O nível 1 fala **duas vezes** por frame:

| Passo | Quando | Faz |
|---|---|---|
| `TeamAI.tick()` | antes do nível 2 | plano colectivo e **`computeBlock()`** |
| `TeamAI.holdLine()` | depois do nível 2 | `holdOffsideLine()` — a última linha tem a palavra final |

(`TeamAI.compact()` ficou vazio: comprimir passou a ser encolher o rectângulo,
dentro do `computeBlock`. Mantido só para não partir quem o chame.)

**`computeDefensiveLine` já não existe** — a linha do fora-de-jogo passou a ser
a traseira do bloco, calculada em `computeBlock` (ver a nota em `team_bt.js:752`).
Enquanto eram dois cálculos independentes discordavam uns 10 m.

`computeBlock` aplica o tecto da Mentalidade (`MentalidadeModel.tectoBloco`) ao
centro do bloco sem bola
— sem isto o centro do bloco seguia `ballZ*dir` quase cru (só ±3/6 m de
folga por postura) e, numa reposição do GR adversário (bola no fundo do
campo *dele*, portanto `ballZ*dir` enorme do lado de quem defende), o bloco
inteiro saltava até perto do ataque tentando "ficar à frente da bola" —
mesmo em Balanced/Low.

**`computeBlock` — o produto principal do nível 1.** Devolve um RECTÂNGULO em
`bb.bloco = {x0, x1, z0, z1}`, no referencial de ataque. O nível 2 coloca cada
jogador lá dentro por percentagem.

Tudo sai de fracções do campo (`BlockShape` no config), e não de metros
afinados à mão:

```
             sem bola          com bola
short        30 × 42 m         36 × 49 m
median       36 × 52 m         44 × 59 m
large        45 × 61 m         54 × 70 m
```

> **Porquê um rectângulo.** Antes cada limite era um `clamp(alvo, min, max)`. Um
> clamp *projecta* toda a gente que está fora sobre o **mesmo** valor de
> fronteira: quatro jogadores acima do tecto saíam com `z` idêntico ao
> centímetro, e 10% dos alvos ficavam exactamente em `x = 28`. Era isso que
> produzia os montes de jogadores no mesmo sítio. Com percentagens não há
> clamps — comprimir é encolher o rectângulo, e toda a gente encolhe junta
> mantendo a forma.

Consequências práticas: **compacidade e amplitude são um número cada**
(`BlockShape.profundidade` e `BlockShape.amplitude`), e a basculação
(`BlockShape.bascular`) desloca a forma inteira em vez de empurrar cada jogador
contra um limite fixo.

**`slotNoBloco(p, bb)`** — traduz o slot normalizado do jogador (`p.slot = {u, v}`)
em metros dentro do rectângulo, aplicando o `LineShape`: o ajuste por linha
(def / mid / atk), **com e sem bola**, que puxa a profundidade `v` e fecha a
largura `u`. É a camada 2 do desenho.

**`holdOffsideLine`** — trava os defesas acima da linha. Sem isto, um avançado em
profundidade arrastava a linha inteira e o ajuste do painel não significava nada.
Só puxa para trás, por isso nunca pode criar um fora-de-jogo.

A tecla **O** mostra o último defesa de cada equipa — serve para conferir o
ajuste da linha a olho.

**`TeamPostureTuning` é a tabela de manípulas por postura** (`push`, `lineShift`).
Está toda a valores neutros de propósito, para o comportamento ser idêntico ao
que estava afinado antes da refactorização. É aqui que se dá personalidade a cada
postura sem tocar na matemática das posições.

### `bt/position_bt.js` — nível 2

Um `PositionContext` por jogador (cache em `p.posCtx`). A árvore:

```
Ofensivo (equipa tem posse)
  DM · CB · LB/RB · CM/AM · RM/LM · CF/RW/LW · genérico
Defensivo
  Basculação (flankAlert) → LB/RB → CB → DM → bloco zonal
```

**O ponto de partida de cada tick é o SLOT no bloco**, não a posição de base:
`bind()` chama `slotNoBloco()` e as folhas passam a ser **desvios** sobre esse
ponto (`desviar(ctx, dx, dFrente)`), tipicamente de 1 a 4 metros. `commit()`
aplica no fim a coesão do tiki-taka, a suavização e os limites do campo.

**O guarda-redes não passa por aqui** — o posicionamento dele é
`FootballPlayer.updateGK()`.

> **Porquê desvios e não posições.** Cada folha recalculava a posição toda a
> partir do `baseTarget`, com a sua fórmula e os seus limites. Fórmulas
> independentes convergiam para os mesmos pontos e os clamps projectavam-nas
> sobre as mesmas fronteiras — daí as sobreposições. Agora o esqueleto da equipa
> é o rectângulo e cada posição só lhe acrescenta o que a distingue.

Quem **substitui** o slot em vez de o desviar, de propósito: `supportBuildUp`
(vai ter com a bola), o lateral ultrapassado a recuperar, e a marcação
(`marcar()`, que segue o homem para onde ele for).

Coisas que este nível resolve e que vale a pena conhecer:

- **`goalSide(p, alvo, dist)`** — o ponto de marcação fica sobre a recta que
  liga o atacante à nossa baliza, e não N metros atrás dele em Z. Com o desvio
  só em Z, um atacante aberto no corredor era marcado pelo **lado**, com o
  caminho da baliza livre nas costas. Medido: 46.7° → 30.2° de desvio médio.
- **`advanceFactor` é `clamp(..., 0, 1)`** — e o clamp tem de vir *depois* do
  `pushMultiplier`. Como o factor é usado como `t` num `lerp`, um valor acima de
  1 fazia o `lerp` **extrapolar**: médios desenhados para parar aos 26.5 m
  acabavam a 48 m, dentro da área.
- **`supportBuildUp`** — o nível 1 escolhe (`pickSupportMid`) o médio mais perto
  da bola quando ela está no nosso meio-campo, e esta folha manda-o oferecer-se
  em vez de ocupar a posição normal. É o que impede o passe directo defesa→ataque.
- **`melhorVaoX(ctx, zAlvo, candidatosX)`** — vão livre entre adversários
  (Fox in the Box, Goal Poacher), maximin contra os adversários e contra
  vãos já reivindicados por colegas no mesmo frame (`bb.vaosReivindicados`).
  O lado preferido em caso de quase-empate é o **lado da bola**
  (`bb.ballX`), não o lado onde o jogador já está — usar a posição própria
  fazia o vão "mais livre" do lado OPOSTO à jogada ganhar sempre que a bola
  estava presa de um lado, e o CF ia atrás dele: alvo sem ligação nenhuma
  com o que estava a acontecer no jogo. Bónus do lado preferido: 4.0 m.
- **`ctx.isMarking` tem de ser reposto em cada `bind()`.** O contexto é
  reutilizado entre frames; sem repor, bastava marcar uma vez para as regras que
  dependem dele ficarem desligadas naquele jogador **para o resto do jogo**.
- **`PositionSmoothing`** (1/s, no config) — a rapidez com que `dynamicTarget`
  persegue o valor calculado. É o botão a mexer se o jogo parecer lento a
  reagir. Cuidado com `Match.dt`: o campo chama-se **`Match.delta`**, e o nome
  errado deixa o `dt` congelado no valor por omissão.

### `bt/player_bt.js` — nível 3

Um `PlayerContext` por jogador (cache em `p.btCtx`). A árvore, por prioridade:

```
BolaParada        canto / pontapé de baliza suspendem tudo
AccaoEmCurso      PASS · SHOOT · TACKLE · SLIDE_TACKLE não se interrompem
ComBola
  Dominar → GuardaRedesJoga → Rematar → Cruzar → Lançar → Passar → Conduzir
SemBola
  Carrinho → Desarme → IrABola → Receber → GuardaRedes → AtacarArea → OcuparPosição
```

A ordem do ramo **ComBola** é:

```
Dominar → GuardaRedesJoga → Rematar → Cruzar → PassarEmFrente
        → ConduzirEmEspaco → Lançar → Passar → Conduzir
```

**`PassarEmFrente`** — testa `findPassTarget()` e só aceita o alvo se estiver
dentro do **cone de visão pra frente** (mesmo ângulo do leque de condução,
`CarryModel.leque`, ±57° do eixo de ataque) e progredindo (`dz > 0`). Vem
ANTES de `ConduzirEmEspaco`: só conduz sozinho se não houver colega bem
posicionado à frente dentro desse cone. Pedido explícito — "pra frente do
jogador, como um campo de visão; se não tiver passe possível, aí sim conduz".
Passe lateral/para trás continua de fora daqui (cai no `Passar` mais abaixo,
sob pressão).

**`Dominar` é cadência, não só o primeiro toque.** `CadenceModel.posseBase`
(~3 s) antes de decidir passar/rematar/lançar — jogador real domina, olha as
opções, só depois executa. Sob pressão pesada cai para
`CadenceModel.posseSobPressao` (toque de primeira). Skill acelera um pouco.
**Excepção:** se já está em zona/ângulo de finalizar (`emZonaDeRemate`, a
mesma condição do `Rematar`), sai do domínio na hora — não faz sentido
"pensar" 3 s com o guarda-redes batido à frente. Durante a espera corre com a
bola (`actCarry`) — decisionTimer não zera a cada toque de condução própria
(`p.carryTouchGrace`), só numa perda real de posse; sem isto, cada toque
recapturado reiniciava o "Dominar" a meio da corrida (domina/adianta,
domina/adianta).

**`AtacarArea`** — colega na ala em posição de cruzar (mesmos limiares do
`findCross`/`CrossModel`) e sou atacante/médio sem bola: em vez do slot
genérico do PositionBT, ataco a área a sério (1º/2º poste, alternado por
`p.id`). Sem isto o `findCross` nunca tinha ninguém já dentro da área para
mirar — cruzamentos morriam sempre por falta de gente a atacar a bola.

Capacidades que este nível trouxe:

- **`findThroughBall`** — o lançamento para o espaço nas costas da última linha
  adversária. Usa o `defLineDir` que o nível 1 do adversário já calcula. Só
  médios e avançados lançam: um defesa a lançar é o jogo directo que se quer
  evitar.
- **`bestPassTarget`** — escolhe o alvo por **pontuação**, não por função. Antes
  era `findPassTarget('atk') || ('mid') || ('def')`, e um avançado marcado ganhava
  sempre a um médio livre só por ser avançado.
- **`findCross`** (`CrossModel`) — só existe cruzamento se houver alguém dentro
  da **grande área a sério** (34 m, ±20.5 m), e a probabilidade sobe com o
  número de alvos lá dentro, com a largura e com a profundidade de quem cruza.
  Antes era `|x| > 17 && zona > 18` → cruzava **sempre**; a x=16 nunca cruzava e
  a x=20 nunca fazia outra coisa.
- **`ConduzirEmEspaco`** (`ctx.campoAberto`) — com 12 m de relva livre num
  corredor à frente, conduz em vez de procurar passe. Resolve o avançado isolado
  que tocava para o lado com o campo aberto.
- **`shootingRange()`** (em `player.js`) — alcance monótono na skill e sensível
  ao ângulo, com um travão extra para defesas.
- **Condução dirigida** (estado `CARRY` da FSM) — testa um leque de direcções e
  escolhe a de mais espaço, em vez de andar sempre a direito. `CARRY` é levar a
  bola; `DRIBBLE` é o 1×1 para passar por um adversário, e entra-se nele a
  partir do `CARRY` quando alguém se aproxima.

> **O orçamento de condução é o que segura o ritmo do jogo.** A condição
> `campoAberto` não tem memória — é reavaliada a cada frame, e enquanto o
> portador corre para o espaço continua verdadeira, porque é ele próprio que vai
> abrindo espaço. Sem travão, **46% das posses nunca terminavam**: o portador
> conduzia 28 m de média e nunca largava a bola. O jogo deixava de ser
> combinações e passava a ser corridas individuais.
>
> `CarryModel.distanciaMax` (12 m) conta os metros percorridos com a bola no pé
> (`p.carryDist`) e, gasto o orçamento, faz a decisão cair no ramo `Passar`.
> Voltou a 11 m e 19%. Passos maiores do que 1 m são ignorados no acumulador —
> são recomeços e bolas paradas, não corrida, e enchiam o orçamento de uma vez.
>
> Se o jogo parecer condução a mais ou a menos, os dois números são
> `CarryModel.distanciaMax` e `CarryModel.espacoLivre`.

> **`AccaoEmCurso` não é decoração.** Sem o `SLIDE_TACKLE` nessa lista, 89.6% dos
> carrinhos eram cancelados no frame seguinte — a árvore voltava a decidir e
> mandava `MOVE_TO_POS` a meio da animação de 1.767 s.

### `perception.js` — Perception System (Fase 1)

Camada só de leitura, **não decide nada** — enche `player.blackboard` com
factos ("o que está a acontecer") para o BT consumir ("o que eu faço").
Corre entre `updateBall()` e `runTeamAI()` no `Match.update()`, a ~15 Hz **por
jogador** (não every frame — cada jogador tem `p.perceptionTimer` desfasado
para não recalcular todos no mesmo frame).

```
CAMPO/MUNDO → Perception.tick() → player.blackboard.ball → Behavior Tree
```

`player.blackboard` (estrutura completa da secção 13 do spec original,
inicializada em `player.js`) só tem o campo `ball` preenchido nesta fase —
`teammates`/`opponents`/`space`/`pressure`/`tactical`/`events`/`currentIntent`
já existem no objecto mas ficam vazios até às fases seguintes.

`Perception.updateBallPerception(p, match)` calcula distância, direcção,
velocidade, `approaching`/`movingAway` (produto escalar velocidade×posição, não
só "distância a diminuir" — apanha bolas cruzadas/desviadas), `controllable`,
e a interceptação (`Perception.computeInterception`): simula a posição futura
da bola em passos de 0.1 s (até 2 s, previsão linear com atrito aproximado) e
pergunta, para cada passo, "o jogador a sprintar (mesma fórmula do
`actChaseBall`) já lá chegava?" — o primeiro `t` que sim é `timeToIntercept` +
`interceptionPoint`, com `confidence` pela margem de sobra. Só se aplica a
bola **solta** (`!match.ballCarrier`) — perseguir o portador é outro problema,
ainda não modelado aqui.

**Ball Claim** (`Perception.claimScore(p)`) é consumido pelo `pickChaser`
(`team_bt.js`): com bola solta, a pontuação vem daqui (`100 - timeToIntercept×20
+ confidence×10 + skill×5`) em vez do `100 - distância` bruto de antes — mais
realista, considera se o jogador REALMENTE alcança a bola. Com bola já na
posse de alguém (perseguir o portador), cai de volta na distância bruta — a
percepção de interceptação não modela esse caso. A histerese top-3 do
`pickChaser` não mudou.

Fases seguintes (não implementadas): 2 — companheiros/adversários/pressão;
3 — espaço, linha de passe, espaço atrás da defesa; 4 — traços de
personalidade/intenções; 5 — interrupções, reavaliação dinâmica.

---

## `assets/` — modelos

- **`Ball.obj`** — a malha original da bola (Blender, 16 292 vértices).
- **`ball_mesh.js`** — a mesma malha convertida, e é esta que o jogo carrega.
  **Gerada por script: não editar à mão.** Para regenerar depois de mudares o
  `.obj`, correr `node tools/obj2js.js`.

Porque não se usa um `OBJLoader`: qualquer loader vai buscar o ficheiro por
fetch/XHR, e o browser bloqueia isso em `file://`. Como o projecto é aberto com
duplo clique no `index.html`, sem servidor, a bola nunca chegaria a carregar. Um
ficheiro `.js` normal não tem esse problema.

O que a conversão faz e porquê:

| | |
|---|---|
| Indexa e quantiza | 1.5 MB → 380 KB. Posições em Int16 (÷32767 = raio 1): 4 µm de precisão numa bola de 14 cm |
| Larga degenerados | 540 slivers da triangulação em leque dos polígonos de 20 lados |
| **Não** toca no winding | ver abaixo |

> **A armadilha:** parece óbvio orientar todas as faces "para fora do centro",
> já que é uma bola. Não é: **9% das faces são as paredes verticais dos sulcos
> entre painéis** (normais a 80–90° da direcção radial, sulcos de 2.6 mm). Essa
> regra estraga exactamente essas faces. A solução é não lhe tocar e usar
> `DoubleSide` no material — o winding deixa de importar.

As normais são calculadas em `Match.criarBolaDaMalha` a partir da própria
posição normalizada, e não com `computeVertexNormals()`, que daria lixo com o
winding inconsistente do OBJ. O OBJ separa os painéis em dois materiais
(`Bianco` 71% da área, `Nero.001` 29%), o que dá a cor sem precisar de UVs — que
o ficheiro também não traz.

Se o `ball_mesh.js` faltar, `Match.criarBola()` cai na esfera com textura
desenhada em canvas que existia antes, e o jogo abre na mesma.

---

## `config.js` — constantes, estado global e tácticas

Primeiro a carregar. Não depende de nada além do THREE.

- Cabeçalho com o **índice geral de funções/objectos** do projecto (comentário no topo).
- Dimensões do campo: `CAMPO_LARG` (74), `CAMPO_COMP` (116), `LARGURA_BALIZA` (7.32),
  `ALTURA_BALIZA` (2.44), `ALTURA_BASE_Y`. Aumentado a pedido (percepção de
  velocidade/passada dos jogadores era grande de mais no campo original).
- `GAME_SPEED` — ritmo base da partida (multiplicador aplicado a `delta` em
  `main.js` → `animate()`, junto com `window.speedMultiplier` do painel).
  Histórico dos ajustes fica no comentário acima da constante.
- Vectores/matrizes temporários reutilizados para evitar alocações por frame:
  `_v1`, `_v2`, `_v3`, `_m1`, `_q1`, `_line1`, `_vUp` (eixo Y constante, para rodar
  direcções no plano do campo). **Nunca guardar referências a `_v1`.._line1`** —
  são sobrescritos a toda a hora. `_vUp` é a excepção: é constante, nunca escrito.
- Flags globais em `window`: `speedMultiplier`, `cameraMode`, `cameraZoom`, `isPaused`,
  `bolaChutada` (sinaliza a ambos os GKs que houve remate — global de propósito),
  `usarPasseGrid` (liga o passe experimental por pontos candidatos).
  > **Corrigido:** `goleiroEstado`/`goleiroReagiu`/`delayReacaoCalculado` já **não**
  > são globais. São propriedades de instância de `FootballPlayer`
  > (`gkEstado`/`gkReagiu`/`gkDelayReacao`), por isso os dois GKs têm estado
  > independente. Uma versão anterior desta doc dizia o contrário.
- **`BallPhysics`** — física real da bola, não valores afinados à mão: massa
  430 g, raio 0.11 m (circunferência 69 cm), `g` 9.81 m/s², ar a 1 atm ao nível
  do mar (ρ = 1.225 kg/m³), `Cd` 0.25. O `kArrasto` (½·ρ·Cd·A/m) é **calculado**
  a partir destes, não escrito. `escalaVisual` aumenta só a malha, não a física.
  Ver a nota do `updateBall` na secção do `match.js`.
- `TeamSkills` — skills por sector (`def`, `mid`, `ata`, `gk`) das duas equipas,
  ligado aos sliders do painel.
- **`TeamShape`** — a forma do bloco, em metros. Todos os valores estão no
  *referencial de ataque da equipa* (−53 baliza própria, 0 meio-campo, +53 baliza
  adversária); multiplicar por `p.dirZ` para converter para o mundo.
  - `linhaDefensiva` — tecto da linha do fora-de-jogo por ajuste do painel:
    `low` −32.5 (4 m à frente da grande área), `medium` −18.25 (entre a grande
    área e a linha central), `high` −2 (2 m atrás da linha central).
  - `lineFloor` −43 — a linha nunca recua mais do que isto.
  - `blockDepthDef` 36 / `blockDepthAtk` 44 — herdados; a profundidade do bloco
    passou para o `BlockShape` (em fracções). Ainda usados no
    antigo `computeDefensiveLine` (removido) e como valor de recurso.
  - `atkAnchorLag` 26 / `atkAnchorMax` 14 — idem.
  - `supportBallZ` / `supportAhead` / `supportWide` — quando e onde um médio
    desce a dar linha de passe na construção.
- **`BlockShape`** — **o rectângulo do bloco, em fracções do campo.** É aqui que
  se afina a compactação e a amplitude, um número cada:
  - `profundidade` / `profundidadeComBola` — o comprimento do bloco, por ajuste
    de compacidade do painel (*Length Compactness*: `short` 20 m / `median` 30 m /
    `large` 40 m). O multiplicador com bola (1.22) **esteve definido mas nunca
    lido** — o bloco tinha a mesma profundidade a atacar e a defender. Corrigido
    na auditoria do painel.
  - `amplitude` / `amplitudeComBola` — a largura (*Width Compactness*: 50/60/70 %
    de 68 m). Mesma história do `amplitudeComBola` (1.15): definido, documentado,
    nunca lido. Também corrigido.
  - `avancoTiroMeta` (15 m) — **tiro de meta**: quanto os DOIS blocos se afastam
    da baliza onde a bola está, por cima do avanço de 10 m que o time que bate
    já tinha. Mesma mecânica do `recuoGkComBola`, incluindo o deslocamento do
    lado que defende ser aplicado depois dos travões.
  - **Laterais e extremos** (`LB`/`RB`/`LM`/`RM`/`LWB`/`RWB`/`LW`/`RW`) abrem e
    fecham com o lado da jogada, em `slotNoBloco`: no lado da bola e a atacar
    abrem +6 m para dar linha pela lateral; no lado oposto fecham 8 m (contra os
    3 m de quem não é lateral). O clamp de ±32 m do `PosicionamentoAI.tick`
    impede que a abertura os ponha fora do campo — com slots já muito abertos,
    ela satura antes da linha lateral.
  - **Zagueiros** (`CB`) levam o desvio de marcação a 30% (`biasMax *= 0.3` em
    `aplicarMarcacaoPosicional`), para não serem arrastados à frente dos médios.
    É uma redução, **não uma garantia geométrica**: se o slot do bloco já os
    puser à frente, a marcação não é a causa.
  - `recuoGkComBola` (10 m) — **guarda-redes com a bola nas mãos**: quanto os
    DOIS blocos se afastam da baliza dele. A equipa do guarda-redes sobe esta
    folga (centro `-26.5 + 10`); a adversária recua a mesma coisa, e esse
    deslocamento é aplicado **depois** de todos os travões de `computeBlock` —
    o tecto da Mentalidade corria a seguir e engolia-o por inteiro. Só as linhas de
    fundo ainda falam depois.
  - `bascular` / `bascularComBola` — quanto o rectângulo acompanha a bola de lado.
  - `avancoAlemDaBola` — a frente do bloco fica à frente da bola no ataque.
    Cuidado com o sinal: escrito como *recuo*, o bloco a atacar ficava mais
    curto (22 m) do que a defender (36 m), que é o contrário do que deve ser.
- **`LineShape`** — o **ajuste por linha** (def / mid / atk), com e sem bola:
  `alvo`/`empurrar` puxam a profundidade dentro do bloco, e `fecho` estreita a
  largura. É a camada 2 do posicionamento.
- **`GaitModel`** — os três andamentos (`andar` / `trote` / `correr`). Ver a
  secção do `utils.js`.
- **`ShootingModel`** — alcance de remate: `baseRange + skill · skillRange`,
  reduzido pelo ângulo (`angleFloor`) e por ser defesa (`defenderFactor`).
- **`PassModel`** — `carryChance*` (conduzir em vez de passar), parâmetros do
  lançamento, e as forças mínimas.
- **`PassTypeModel`** — **onde a bola cai num passe**: aos pés (`direct`), no
  ponto mediano do leque (`space`) ou no mais adiantado (`leading`). A tabela
  `regras` escolhe a mistura pela zona de origem e destino; a primeira regra que
  casa manda.
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
    de `raioRecuo` (18 m), conduzir para trás (`carryRecuo`).
  - `recuo` é a primeira: destino mais de `margemRecuo` (2 m) atrás da origem
    vai aos pés (85%), porque um passe para trás é para segurar. Antes não havia
    noção de recuo — caía na `misturaPadrao` como qualquer outro. É para isso
    que `PassTypes.zonaDe` devolve `avanco`, o z cru no referencial de ataque.
  - A `misturaPadrao` é a que mais dispara, e passou de **80% aos pés para 70% à
    frente**. Era daí que vinha a sensação de jogo travado.
  - `liderancaCurta` (4 m), `liderancaPasso` (1 m) e `liderancaMin` (1.5 m)
    definem o **leading curto** (`pontoLiderancaCurta`, em `pass_types.js`):
    quando o leque do `PlayerPassTarget` não valida nenhum ponto — o normal num
    bloco compacto — `pontoPara` mira este ponto à
    frente do companheiro em vez de cair aos pés. Encurta perante um adversário
    em vez de desistir. O ponto vem marcado com `curto: true`, e por isso é
    jogado com a balística de passe normal, não com a de lançamento.

  - **Quem recebe** (`escolha`): três termos normalizados a 0..1 — progresso
    sobre `progressoRef` (30 m), espaço sobre `maxPontosLeque` (49, calculado do
    `PassCandidates` e não escrito à mão), distância sobre `distanciaMax` (45 m)
    — com pesos que variam pela **pressão sobre o portador** (`raioPressao`
    8 m): livre procura quem progride, pressionado procura quem está livre.
  - O termo do espaço era a **contagem** de pontos vivos do leque, até 49,
    contra um progresso que raramente passava de 40. Um companheiro isolado na
    lateral tinha o leque quase todo vivo e ganhava a escolha **por estar
    isolado** — 37 contra 22 de quem estava bem colocado à frente. Era daí que
    vinha o toque eterno para a lateral.
  - Abaixo de `notaMinima` (0.35) o `actPass` desce uma cascata: levar a bola
    (se TEC ≥ `tecnicaDrible`, 75, e houver campo aberto), atrasar a alguém a
    menos de `raioRecuo` (18 m), ou **conduzir para trás** (`p.carryRecuo`, que
    inverte o eixo do cone no `case 'CARRY'`). O raio do recuo é o que impede o
    atraso para o guarda-redes a meio-campo.
  - No recuo, o **sector** do painel continua no referencial de ataque
    (`penalidadeSector(tx, p.dirZ)`): só o eixo do cone é que inverte. E o ramo
    de levar a bola muda para `CARRY`, não `DRIBBLE` — não há adversário
    nomeado, é campo aberto, e por isso também não conta como drible tentado.

  `js/pass_types.js` é importado directamente pelos testes em Node e **não pode
  usar `THREE`** — por isso `PassTypes.frenteDe` tira a orientação do companheiro
  do quaternião por aritmética, em vez de `applyQuaternion` como o
  `pass_candidates.js` faz.
- **`RestlessModel`** — **micro-movimento nos alvos**: quem chega ao slot deixa de
  ficar estátua. O `steerArrive` dá velocidade zero a menos de 0.2 m do alvo, e a
  partir daí o jogador não se mexia mais. Desloca o **alvo** até `raio` (2 m), com
  ângulo e raio sorteados a cada `intervaloMin`–`intervaloMax` (1.5–3.5 s, para
  não pulsarem em sincronia). Só age em quem já chegou (`limiarChegada`, 2 m), e
  nunca no portador nem no `chaser`. **Não acumula** — parte sempre do alvo
  corrente, senão a equipa derivava para fora da forma ao longo de minutos. Corre
  antes do tecto do estilo, para não voltar a furá-lo.
- **`VisionModel`** — **o que o jogador lê à frente**, e a única fonte da
  fórmula. O meio-ângulo do cone é `max(anguloMin 30°, TEC × anguloPorTecnica)`,
  **por lado**: com `anguloPorTecnica` a 0.9, TEC 80 dá ±72° e TEC 50 dá ±45°. O
  alcance é `max(12, TEC × 0.5)` m. Usado por `coneVisao(tec)` e
  `alcanceVisao(tec, minimo)` no cone do carry (`fsm.js`), na detecção de
  adversário no toque, e no espaço à frente (`bt/player_bt.js`) — estava escrito
  à mão nos três, e regras duplicadas já divergiram duas vezes neste projecto.
- **`DribbleModel`** — o 1×1: quando o portador tenta passar por um adversário.
- **`CarryModel`** — a condução ("adiantada de bola"): a bola é fisicamente
  adiantada entre 3.6 e 6.0 m, com o impulso a herdar a velocidade do jogador,
  para ele correr de facto atrás dela.
  **`espacoLivre` (12 m) e `distanciaMax` (12 m) são os dois números que
  regulam quanto se conduz em vez de passar** — ver a nota no nível 3.

  **Para onde ele leva a bola** sai de um leque de nove candidatos, pontuados
  com três termos **normalizados a 0..1** e só depois pesados
  (`notaDireccaoCarry` em `utils.js`):
  - `espaço` — distância ao obstáculo mais próximo no corredor, sobre `spaceCap`
    (16 m). Peso entre `pesoEspacoMin` (1.0) e `pesoEspacoMax` (2.4), pela
    Técnica — quem tem técnica lê o espaço, quem não tem insiste no caminho
    directo. É uma das duas vias da Técnica; a outra é o cone de visão, que
    abre de ±30° a ±56°.
  - `progresso` — avanço para a baliza sobre a distância de visão, ou seja o
    cosseno do ângulo. Peso `pesoProgresso` (1.0), a unidade de referência.
  - `sector` — `Tatics.penalidadeSector`, **zero dentro de um sector activo** do
    painel. Peso `pesoSector` (1.6).

  Os antigos `spaceWeight`/`progressWeight`/`sectorWeight` multiplicavam
  grandezas em escalas diferentes (progresso até 56 pontos de amplitude, espaço
  32): a direcção frontal ganhava sempre, mesmo com um adversário colado e a
  ponta vazia, e subir o `sectorWeight` três vezes nunca teve efeito. O sector
  também deixou de ser um X sorteado a cada segundo por `getWeightedSectorX`
  (removido): com Left e Right ligados isso era uma moeda ao ar, e um extremo na
  direita atravessava o campo pelo meio metade das vezes.
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
    apagados com o antigo nível 2, e a marcação posicional não os usa.
  - Também guarda a largura da última linha conforme a bola vem pelo eixo ou
    pelo corredor (`larguraCentro`, `larguraAla`, `fechoRaioX`, `fechoZ`).
- **`SupportModel`** — apoios ao portador (`maxPorLado: 1`, `raioMin`/`raioMax`, `anguloApoio`, `bonusOcupante`). Jogadores de linha posicionam-se a 45º do deslocamento (1 em `FWR_SUPPORT` e 1 em `AFT_SUPPORT`). Guarda-redes (`role: 'gk'`) são estritamente excluídos deste modelo.
- **`CrossModel`** — a zona e a probabilidade de cruzar, e o que conta como
  "alguém na área". Os dois termos que dependem de estar mesmo na lateral da
  área — `bonusLargura` e `pesoGrid` (peso da camada CRUZAMENTO do
  `SpatialGrid`) — são os que se mexem para cruzar mais/menos DALI, sem
  aumentar o cruzamento de qualquer sítio (`chanceBase`).
- **`BallControl`** — recepção, intercepção e desvio. Ver a secção do `match.js`.
- **`GoalNet`** — a rede da baliza, em duas metades independentes.
  - **Física** (`profTopo` 0.8, `profBase` 2.0, `restituicao` 0.12, `atrito`
    0.72): `Match.colidirComRede` empurra a bola para dentro do pano, absorve a
    componente normal e trava a tangencial. É a inclinação do pano de trás que
    faz a bola descer até ao chão em vez de parar onde bateu.
  - **Ondulação** (`NetWave`, em `js/goal_net.js`): `segmentosU`/`segmentosV`
    dão os vértices — cada face era um quad de QUATRO, e por isso a rede não
    podia deformar-se. O deslocamento é ao longo da normal,
    `amplitude · envolvente(t) · sin(frequencia·t + k·(u+v))`, com
    `envolvente(t) = (1 − e^(−t/ataqueOnda)) · e^(−t/tau)` e `tau =
    duracaoOnda/4` (~1.8% da amplitude aos 5 s). A fase depende de `u+v`, e é
    isso que faz a onda **percorrer** o pano em vez de o levantar em bloco.
  - O factor `ataqueOnda` existe para a envolvente valer 0 em `t=0`. Sem ele a
    rede saltava para uma posição já deformada no primeiro frame, porque a fase
    depende de `u+v` e não só de `t`.
  - Cada face guarda as posições de repouso num `Float32Array` e parte sempre
    delas; nunca se deforma sobre a geometria corrente, senão acumulava e a rede
    não voltava ao lugar. `NetWave.update` sai numa comparação enquanto nenhuma
    rede abana, por isso a malha mais densa não custa nada em repouso.
- **`SlideTackleModel`** — o carrinho: fases (`lancamento` → `deslize` →
  `paragem` → `levantar`), o empurrão dado à bola em metros, e a `pose` completa
  em radianos. A animação antiga era `applyKeyframeAnimation("Soccer Tackle")`,
  dados pré-gravados de outro esqueleto com as pernas a ±3.0 rad de `rotation.z`
  (172°, praticamente invertidas).
- **`GoalkeeperPose`** — as **cinco** posturas do guarda-redes e a distância a que um
  adversário com bola o põe em alerta:
  - `andar` — passo curto ao longo da baliza.
  - `espera` — joelhos ligeiramente dobrados, pernas afastadas, mãos prontas (adversário
    com bola a menos de `alertaDist` 25 m).
  - `repouso` — praticamente direito, sem perigo.
  - `apanhar` — agachado a receber bola mansa/rolando (`p.gkEstado === 'apanhar'`).
  - `segurar` — bola junto ao peito à espera de relançar (`p.gkEstado === 'segurando'`).
    Tronco e pernas são **os mesmos do `repouso`** (de pé, direito): só os braços
    diferem, dobrados a fechar a bola no peito.
  Convenção do esqueleto documentada lá: perna `rotation.x > 0` é coxa para
  trás, peito `rotation.x > 0` é inclinar para a frente.
  Também aqui:
  - `apanharDur` 0.35 s — duração do agachar-e-apanhar.
  - `segurarDur` 8 s — **só fallback**. A duração real é sorteada entre 5 e 8 s
    a cada captura (`p.gkSegurarDur`, em `grabBall()`).
  - `mergulhoLateralMin` 2.0 m — **abaixo disto não há mergulho**: fica de pé e
    leva as mãos à bola (estado `'maos'`). Era 1.2 m, e quase toda a defesa
    virava mergulho lateral.
  - `maosDur` 1.0 s — duração do estado `'maos'`.
- **`GoalkeeperStyle`** — três medidas em metros por estilo. `depthMin`/`depthMax`
  são os extremos da curva de `gkAnchor()`: `defensive` 1.2-6.0, `offensive`
  1.8-11.0. `sweepOut` (6 / 20) é só para a varrida. Ver `updateGkStyle` em
  `bt/team_bt.js`.
- **`gkAnchor(ballX, ballZ, ownGoalZ, dirZ, style)`** — a posição de repouso e de
  defesa do GR, função **pura** (não lê `Match` nem `window`, por isso é testável
  isolada: `tests/gk_anchor.test.js`). Profundidade cresce com a distância da
  bola à baliza, com easing quadrático entre `GK_D_NEAR` (16.5 m, borda da área)
  e `GK_D_FAR` (55 m): bola dentro da área deixa-o em `depthMin`, bola no
  meio-campo adversário em `depthMax`. O lateral é a bissetriz do ângulo
  bola-postes, `ballX * (depth / d)`, limitada ao poste menos 0.5 m — o desvio
  encolhe sozinho conforme ele recua.

  Substituiu quatro fórmulas espalhadas por `updateGK()` cujos coeficientes
  **subiam** (0.15, 0.35, 0.55) à medida que o atacante se aproximava: quanto
  maior o perigo, mais o GR saía da baliza.
- **`gkSweepTarget(...)`** — mesma assinatura, mas vai **na direcção** da bola em
  vez de recuar, limitado a `sweepOut` e sem nunca ultrapassar a bola. Só é usado
  no gatilho de sweeper.
- **`FullBackStyle`** — estilo do lateral. `avancoMax` em **metros** (`defensive`
  2, `offensive` 15) é o que manda; o `comBolaMult` afina o slot mas sozinho
  valia 1-3 m e não dava subida visível. Só actua com bola.
- **Guarda-redes com a bola na mão** (`GoalkeeperPose.segurar*`): deixou de ficar
  estátua os 5 a 8 segundos todos. Anda até `gkAlvoSegurando` — `segurarAvanco`
  (10 m) à frente da própria linha, bem aquém dos 16.5 m da área, porque com a
  bola na mão sair dela é falta — a `segurarVel` (2.2 m/s), com as pernas a
  acompanhar.
  - **Porque não se mexia:** nenhuma das duas vias que movem um jogador chega a
    este estado. A FSM só é chamada no ramo `'idle'` do `updateGK`, e o fim do
    `updateGK` zera a velocidade para qualquer estado que não seja `'idle'`. O
    ramo `'segurando'` mexe agora na posição directamente.
  - **Relança mais cedo** se aparecer linha, passado `segurarMinimo` (1.5 s) — a
    folga para as duas equipas se reorganizarem. O `findPassTarget` é só o
    gatilho, e corre a cada 0.25 s, não a cada frame; quem escolhe o
    destinatário continua a ser o `releaseFromHands`, que respeita o Playing
    Style. Sem linha, o relançamento sai à mesma ao fim de `segurarDur`.
- **`GoalkeeperKickPower`** (1.15) — multiplicador da **força** do chutão do
  guarda-redes (`puntBall` em `player.js`). Multiplica a velocidade de saída,
  não o alcance: como o alcance vai com o quadrado da velocidade, estes +15% de
  força valem cerca de +32% de distância. O tecto de 50 m/s do `puntBall` nunca
  chega a morder com este valor.
- **`GoalkeeperKickClip`** — GOALKEEPER_KICK_FORWARD_HIGH, os 12 keyframes do
  chutão do GR, em `t = (frame-1)/11`. Inclui `largaBolaEm`/`alturaMao`/
  `alturaPe`: a bola desce das mãos ao pé entre a máxima preparação (frame 6) e
  o contacto (frame 9).
- **`DribbleCutClip`** — DRIBBLE_CUT_30, corte diagonal de 30°, 12 keyframes em
  três camadas (corpo / pernas / bola). É **aditivo** sobre o ciclo de corrida.
  O `quadrilY` e o `troncoY` têm sinais opostos de propósito: o quadril antecipa
  a mudança e o peito contra-roda, por isso o jogador não gira os 30° de uma vez.
- **`ActionAnimClips`** — tabela de sincronização gameplay↔animação (ver
  `bt/action_state.js`): `{ duration, contactTime }` por acção. Hoje `pass` e
  `gkPunt`.
- **`CadenceModel`** — ritmo de decisão com bola: `posseBase` (~3 s, domínio
  antes de decidir) e `posseSobPressao` (~0.6 s, toque de primeira sob
  pressão pesada). Consumido pelo `Dominar` em `bt/player_bt.js`.
- **`DefensivePressureModel`** — segundos de atraso na reacção defensiva
  (`pickChaser`/`assignMarking`) por nível: `low` 6, `balanced` 4, `high` 2.
  Ligado ao selector "Defensive Pressure" do painel esquerdo
  (`Tatics.pressaoDefensiva`).
- **`EstiloPorOmissao`** — playing style por omissão de cada posição
  (`assignFormations`/`aplicarPlayingStyle` em `match.js`). Entradas podem
  ser uma **lista** em vez de uma string só: nesse caso o estilo varia pela
  ordem do jogador entre os da mesma posição nesta formação (`idxPos`,
  contado em `assignFormations`) — CM(1) Box-to-Box / CM(2) Orchestrator,
  CF(1) Fox in the Box / CF(2) Dummy Runner, CB(1) Build Up / CB(2) Extra
  Frontman. Pedido explícito: dois jogadores no mesmo posto não são clones.
- **`MentalidadeModel`** — `{ agressao, blocoZ, tectoBloco }` por Mentalidade
  (`defesa`/`balanceado`/`ataque`, rótulos na UI: Defensiva/Equilibrada/
  Ofensiva). `agressao` é a base da `Agressividade` dinâmica em `team_bt.js` →
  `computeAggression`.
  - `blocoZ` desloca o centro do bloco em relação à **bola**; `tectoBloco` é o
    mais longe que esse centro chega, medido do meio-campo: −17.7 / −8.8 /
    **0** / +17.7 / +35.3. Com Equilibrada o bloco **não passa do meio-campo**.
  - O tecto era do Defensive Pressure (`TeamShape.pressaoLineCap`, **removido**),
    e por isso a Mentalidade não tinha palavra nenhuma sobre até onde a equipa
    subia. O Defensive Pressure passou a ser a distância de marcação.
- **`TeamPlayStyles`** — catálogo `possession`/`direct`/`counter_attack`/
  `wing_play`/`positional`/`high_press`. Cada entrada é só multiplicadores
  (`circulacao`, `verticalidade`, `viradas`, `corredores`, `cruzamento`,
  `pressaoPosPerda`) sobre pesos que já existiam — não é sistema de decisão
  próprio. Seleccionado em `Tatics.teamPlayStyle`, painel "Estilo Coletivo".
  Ver secção `bt/team_bt.js` acima pra onde cada campo é lido.
- `Tatics` — formação, estilo de jogo, estilo de passe, sectores do campo activos,
  **`linhaDefensiva`** (`'low'` | `'medium'` | `'high'`) e **`pressaoDefensiva`**
  (`'low'` | `'balanced'` | `'high'`, selector "Defensive Pressure"):
  - `toggleSector(sector)` — liga/desliga cada sector independentemente, com um
    mínimo de 1 activo. Actualiza o botão, o contador do rótulo e re-atribui
    formações.
  - `sectorDeX(x, dirZ)` — a que faixa pertence um X, no referencial de ataque
    (`|x·dirZ| ≤ 10` é centro). É a **única** fonte desta classificação: o
    `findPassTarget` tinha uma cópia à mão, e enquanto foram duas o passe
    premiava um flanco e a condução puxava para o outro.
  - `penalidadeSector(x, dirZ)` — quão fora dos sectores activos está um ponto,
    de 0 (dentro de um deles) a 1. É isto que faz a IA jogar mais pela
    esquerda/centro/direita.
    Substituiu o `getWeightedSectorX`, **removido**: sorteava um X alvo dentro
    do grupo activo e re-sorteava-o a cada segundo. Com Left e Right ligados
    era uma moeda ao ar — um extremo na direita saía metade das vezes com alvo
    em −19 e atravessava o campo pelo meio. E, por medir a distância a um
    PONTO, penalizava um extremo em x=+25 que já estava bem colocado.
  - `update()` / `updateSkills()` — lêem os `<select>` e sliders do painel.
- `FormationsData` — posições base normalizadas para `442`, `433` e `4231`.

**Mexer aqui quando:** adicionar uma formação, mudar dimensões do campo, acrescentar
uma opção táctica nova.

## `utils.js` — matemática, geometria e animação pré-calculada

Funções puras, sem estado de jogo.

- `mergeNonIndexedGeometries(geos)` — junta várias geometrias numa só (performance do público).
- `createSpectatorGeometry()` — forma modular de um espectador (cabeça, tronco, membros).
- **`getGaitPose(t, vel)` + `misturarAndamento(vel)`** — a pose de locomoção do
  jogador de campo. A **amplitude** depende da velocidade, não só a cadência.
- `getRunPose(t)` — a versão antiga, de amplitude fixa. **Ficou só para o
  guarda-redes**, que tem andamento próprio (`GoalkeeperPose.passada`).
- `lerp(a, b, t)` e `lerpTo(atual, alvo, v)` — interpolação; `lerpTo` faz snap ao alvo
  quando a diferença é < 0.001 (evita jitter infinito).
- **`chancePorSegundo(taxa, dt)`** — sorteio com taxa **por segundo**. As decisões
  aleatórias estavam escritas como `Math.random() < 0.15` avaliado por frame, o
  que tornava a IA dependente do FPS (a 144 Hz desarmava 2.4× mais vezes por
  segundo) e fazia o botão de velocidade 1.6× alterar a agressividade das
  equipas. **Usa sempre isto para probabilidades**, nunca `Math.random()` cru.
- `applyKeyframeAnimation(player, animName, time)` — aplica keyframes ao esqueleto.
- `OptimizedAnimations` — dados de animação pré-gravados usados pela função acima.
- **`velocidadeRasteiraPara(dist, vChegada)`** — calcula a velocidade inicial de saída de um passe rasteiro com base na distância, aplicando boost nos passes curtos (<12m) para rapidez e agilidade e redução progressiva em passes longos (>15m) com teto seguro (18.5 m/s).
- **`velocidadeParaAlcance(dist, elev)`** — calcula a velocidade inicial necessária para uma bola aérea alcançar a distância desejada contra o arrasto quadrático do ar.
- **`resolverElevacaoPasse(dist, forcarArco)`** — determina se o passe é rasteiro ou com arco/elevação parabólica suave e realista (entre 32° e 42° para longos).

> **Havia uma animação só.** O `getRunPose` devolvia sempre a mesma amplitude
> (anca ±63°, braços ±57°, cotovelo fixo em −69°, tronco sempre a 17°), e a
> velocidade do jogador só mudava a rapidez do ciclo: **andar era correr em
> câmara lenta**. Pior, o avanço do ciclo era `speed·dt/3.0` — 3 metros por
> passada a qualquer velocidade, ou seja o mesmo tamanho de passo a passear e a
> sprintar.
>
> O `GaitModel` (config) tem os três andamentos e o `getGaitPose` interpola-os:
>
> ```
>                     andar     trote    correr
>   velocidade        1.8 m/s   4.5 m/s   8.0 m/s
>   anca                 46°       89°      138°
>   joelho               35°       73°      123°
>   braço                18°       60°      115°
>   tronco                3°        9°       17°
>   passada            1.55 m    2.90 m    4.40 m
>   passos por seg       2.32      3.10      3.64
> ```
>
> A **cadência sai da passada** (`velocidade / passada`), o que dá os valores
> humanos reais. O que muda é qualitativo, não só de escala: a andar o joelho
> quase não dobra (a perna de apoio vai direita, que é o que separa uma passada
> de uma corrida) e os braços vão quase esticados; a correr o calcanhar sobe
> quase ao rabo e o tronco inclina-se.

**Mexer aqui quando:** afinar poses/animações ou precisar de um helper matemático novo.

## `controls.js` — câmara livre

- `SimpleOrbitControls` — rotação e zoom da câmara em modo "Órbita Livre".
  Rato (`onMouseDown/Move/Up`, `onWheel`), toque e pinch (`onTouchStart/Move`,
  `getPinchDistance`), e `updateCameraPosition()` que converte coordenadas
  esféricas → cartesianas.

Só está activo quando `window.cameraMode === 'orbit'` (ver `main.js`).

## `stats.js` — `MatchStats`, estatísticas da partida

Objecto `MatchStats` com um sub-objecto por equipa (`MatchStats.TeamA` /
`.TeamB`). `reset()` zera tudo (chamado no arranque/reposição). Instrumentado
directamente nos pontos de gameplay, sempre atrás de
`typeof MatchStats !== 'undefined'` (para o ficheiro poder faltar sem
partir nada):

- `registarPasseIniciado(team, tipo)` — `tipo` é `'passe'` / `'cruzamento'` /
  `'lancamento'`, chamado no momento real em que a bola sai do pé.
- `registarRecepcao(jogador, dominou)` — cada disputa de bola solta
  (`resolveBallContact`, `match.js`).
- `registarZona(team, zoneAhead, dt)` — segundos de posse por terço do campo
  (toques por terço).
- Contadores directos nos ficheiros de gameplay: remates/golos (`player.js`,
  `match.js`), dribles, desarmes, carrinhos (`fsm.js`, `bt/player_bt.js`),
  trocas de chaser/marcação/supportMid (`bt/team_bt.js`), cantos e pontapés
  de baliza (`match.js`).
- `resumo()` — relatório agregado, consumido por `simulate.js`.

**Mexer aqui quando:** quiser medir alguma coisa nova sobre a partida.

## `simulate.js` — simulação em lote (sem ecrã)

`Sim.run(opts)` — corre `Match.update(dt)` em ciclo apertado (sem
`requestAnimationFrame`/`renderer.render()`), com cedências periódicas ao
browser (`await new Promise(r=>setTimeout(r,0))`) para não bloquear a aba.
Parâmetros: `jogos` (10), `duracaoSeg` (300), `dt` (1/60), `passosPorLote`
(300), `cellSize` (2 m, heatmap). `Sim.exportar(relatorio)` descarrega JSON.

Corre **inteiramente no browser**, não em Node — `match.js`/`config.js`/
`player.js` dependem de DOM (canvas para texturas,
`document.getElementById`), replicar isso em Node seria mais trabalho do
que reaproveitar o browser real. Ligado ao botão "Simulação rápida" do
painel esquerdo (`runFastSim()` em `main.js`, 2 jogos × 25 min por omissão).
Enquanto corre, `animate()` (`main.js`) fica de fora por completo
(`if (Sim.running) return`) — não pode haver dois donos do tick.

**Calibração de Playing Styles** (`opts.calibrarEstilos`, default `true` —
o botão do painel passa `false`, ver abaixo): liga todos os `playingStyle`
(vêm OFF por omissão, `match.js` → `aplicarPlayingStyle`), mede por
(estilo, posição) ativações, % do tempo ativo, e o deslocamento do alvo
(`p.dynamicTarget`) em relação ao slot puro do bloco (`p.slotTarget`) —
RMS, máximo, desvio padrão de X/Z. Aponta `semEfeito:true` quando um estilo
ativa mas não desloca nada (flag sem código de posicionamento por trás,
ex.: `juntaSeAoAtaque`). Reporta no `console.table` e no campo `estilos` do
JSON exportado. Só conta frames com o nível 2 a correr
(`Match.nivel2Activo()`): parado o jogo, o `slotTarget` fica congelado no
último frame corrido e o desvio medido seria a distância a um ponto velho.

`opts.rotacionarFormacoes` (default = `calibrarEstilos`): nenhuma formação
sozinha (`FormationsData` — 442/433/4231) cabe as 12 posições de campo ao
mesmo tempo, então nenhuma cobre os 21 estilos de uma vez. Gira as 3
formações entre jogos e força `playingStyleFixo` nos slots certos
(respeitando `estiloValidoPara`) até esvaziar a fila de cada (formação,
posição) — precisa de pelo menos ~13 jogos pra drenar a fila mais cheia
(`433|LW`, 4 estilos por 1 slot). Repõe `Tatics.formacao` e todo
`playingStyleFixo` tocado no fim. Avisa no console quem sobrou sem testar.

Botão "Simulação rápida" do painel usa `calibrarEstilos: false` de
propósito — 2 jogos não drenam fila nenhuma, e a rotação trocaria a
formação escolhida no painel sem aviso. Pra calibrar os 21 estilos, correr
na consola: `Sim.run({ jogos: 15, duracaoSeg: 120 })`.

## `match.js` — o motor do jogo *(ficheiro maior, ~1360 linhas)*

O objecto `Match`, gestor de estado e de cena.

| Método | Responsabilidade |
|---|---|
| `init(scene)` | Arranque: campo, bola, bindings de UI, equipas |
| `setupKeyboardListeners()` | Teclas 1–3 velocidade, 4–6 câmara, espaço = pausa |
| `setSpeed(s)` / `setCameraMode(m)` | Escala de tempo e tipo de vista |
| `updateCamera()` | Segue a bola com interpolação suave (center / sideline / topdown) |
| `createField()` | Estádio, relva, linhas, balizas e público instanciado |
| `createTeams()` | Instancia os 22 `FootballPlayer` e define cores |
| `assignFormations()` | Coloca jogadores segundo `FormationsData` |
| `resetPlay()` | Reposição para pontapé de saída |
| `update(dt)` | **Tick principal** — física, IA, render |
| `updateCrowd(dt)` | Anima o público conforme a excitação e a posição da bola |
| `runTeamAI()` | **Orquestrador** dos níveis 1 e 2 — não decide nada por si |
| `updatePossession()` | Quem tem a bola, há quanto tempo, se há contra-ataque |
| `relaxConstraints(team)` | Publica o limite de fora-de-jogo (as molas saíram) |
| `separarAlvos(team, apenasX)` | Separação mínima entre alvos — só repulsão |
| `resolveBallContact()` | **Recepção, intercepção e desvio** da bola solta |
| `deflectBall(p)` | Toque falhado: a bola sai desviada, mais lenta e disputável |
| `criarBola(raio)` | Bola da malha do OBJ, ou a procedural se ela faltar |
| `updateBall()` | Física da bola, arrasto, gravidade, detecção de golo/fora |
| `setupSetPiece(type, team)` | Organiza cantos e pontapés de baliza |
| `updatePlacar()` | Escreve `#placar-a/b/tempo` no DOM a partir de `placarA/placarB/tempoDeJogo` |

`placarA`/`placarB` (golos) e `tempoDeJogo` (segundos, só corre em `state
==='PLAY'`) vivem no próprio `Match`. `#placar` no `index.html` mostra
"RED x x BLUE | TIME mm:ss" — RED = TeamB, BLUE = TeamA (ver comentário em
`updatePlacar`).

**`setupSetPiece('GOAL_KICK', team)` — cuidado com quem é o taker.**
`attackingPlayers`/`defendingPlayers` são só "equipa a quem foi atribuído o
lance" vs. "a outra equipa" (nomes genéricos reaproveitados do `CORNER_KICK`,
onde fazem sentido literal). O `taker` do pontapé de baliza tem de vir de
`attackingPlayers.find(gk)` — já esteve trocado (`defendingPlayers`), o que
punha o **GR adversário** dentro da área a bater, a chutar no sentido do
`dirZ` dele, ou seja para a própria baliza de quem devia beneficiar do
lance. Os "pressionadores" (`defPositions`) têm de ficar a ≥18 m do ponto do
pontapé — a área tem 16.5 m de profundidade; com distâncias menores (tinha
10/5/5) ficavam **dentro** da área alheia, prontos a tocar pra dentro do
gol vazio assim que o GR demorasse.

Notas:
- A fase de posse sobe com `possessionTimer` (1 → 2 → 3) e multiplica o avanço da
  linha; o contra-ataque aplica um bónus adicional. O cálculo vive agora no
  nível 1 (`computeCollectiveShape`), não por jogador.
- **As molas de coesão saíram do `relaxConstraints`.** Tinham comprimentos de
  repouso tirados do `baseTarget` — da forma da **formação**, que não sabe nada
  do bloco — e corriam depois do nível 2, desfazendo-lhe o trabalho: com o
  rectângulo a pedir 22 m de profundidade, voltavam a esticar a equipa para os
  ~40 m da formação. Duas noções de forma da equipa a discutir uma com a outra.
  A coesão passou a ser garantida **por construção**, no rectângulo.
- **`separarAlvos`** ficou no lugar delas: só repulsão, 3.2 m mínimos. Corre
  **duas vezes**, e a ordem importa — completa antes do `holdLine`, e só
  lateral (`apenasX`) depois. Só antes não chega (o `holdLine` põe os defesas
  todos no mesmo z e volta a juntá-los: medido um par CB/RB a 0.03 m); só depois
  viola o fora-de-jogo (145 violações). Em x não há nada que se possa violar.
- A limpeza das marcações é um passo global **antes** dos dois ticks de equipa —
  se cada equipa limpasse na sua vez, a segunda apagava o trabalho da primeira.

### Disputa da bola (`resolveBallContact`)

A regra antiga era uma só: a bola só podia ser apanhada a menos de 1.2 m **e**
com velocidade² < 60, ou seja abaixo de 7.75 m/s. Como todos os passes saem
entre 16 e 25 m/s, isso significava que **não existiam intercepções no jogo** —
nenhum defensor podia tocar num passe em movimento, e o destinatário tinha de
esperar meio segundo que a bola abrandasse (um passe a 18 m/s só ficava
recebível ao fim de 0.52 s e 6.1 m).

Agora qualquer jogador ao alcance disputa a bola:

- Abaixo de `easySpeed` domina-se sempre — a regra antiga, preservada.
- Acima disso a hipótese cresce com a skill e cai com a velocidade da bola.
  Quem é o destinatário do passe leva `receiverBonus` de vantagem.
- Falhando, `deflectBall` desvia-a e tira-lhe velocidade: fica solta.

Dois travões que não são opcionais:

- **`touchLock`** — quem larga a bola não lhe pode tocar durante 0.35 s. Sem
  isto o passador recuperava instantaneamente o próprio passe, porque ainda está
  dentro do raio de contacto quando a bola sai.
- **`retryLock`** — cada jogador só tem direito a uma tentativa por aproximação.
  Sem isto uma bola rápida a passar ao lado dele daria ~9 rolagens de dados e a
  intercepção seria certa.

O guarda-redes não entra por aqui a alta velocidade: as defesas dele continuam
em `FootballPlayer.updateGK()`.

Medido (defensores colocados de propósito sobre a linha de passe, portanto é um
limite superior): passe de 22 m com 1 defensor → 28% intercetado; com 2 → 48%.

### Física da bola (`updateBall`)

Integração semi-implícita: forças primeiro, posição depois. Todas as constantes
vêm do `BallPhysics` (`config.js`) e são **reais**, não afinadas à mão.

| | modelo antigo | agora |
|---|---|---|
| gravidade | 15.0 m/s² | 9.81 |
| raio | 0.15 m (circunf. 94 cm) | 0.11 (69 cm, FIFA Lei 2) |
| massa | não existia | 0.430 kg |
| ar | não existia | ρ = 1.225 kg/m³ (1 atm, nível do mar, 15 °C) |
| arrasto | `pow(0.85, dt)`, só em x/z | quadrático `½·ρ·Cd·A/m·v²`, nas 3 componentes |
| chão | `pow(0.55, dt)` | rolamento `μ·g` = 0.98 m/s², constante |

Os dois modelos de perda antigos eram o problema real do voo estranho: um
decaimento **exponencial** tira uma *fracção* da velocidade por segundo, o que
travava demais a bola lenta (~15 %/s a 5 m/s) e quase nada a bola rápida (o
arrasto real a 30 m/s são 12.2 m/s²). E como o arrasto não actuava em Y, subida
e descida eram simétricas, o que nunca acontece.

O ressalto está separado do rolamento: `restituicao` 0.60 vertical,
`atritoRessalto` 0.75 horizontal por quique, e só ressalta acima de
`vMinRessalto` — abaixo disso assenta, em vez de tremer no chão.

`escalaVisual` (1.30) aumenta **só a malha**. Raio de colisão, ressalto e
rotação continuam nos 0.11 m reais.

> **Se mexeres na gravidade ou no arrasto, as potências de passe/remate mudam
> de alcance.** Elas são heurísticas (`ballVel.y = min(6.5, 2 + dist*0.12)`,
> etc.) calibradas contra a física antiga.

**Detecção de golo/saída pela linha de fundo (`updateBall`)** exige a bola
**inteira** para lá da linha: `Math.abs(ball.position.z) - BallPhysics.raio >
53`, não só o centro a cruzar 53. Com o centro só, a bola contava golo/fora
ainda meio de dentro — visualmente errado e a regra real manda a bola
passar por completo a linha.

**Mexer aqui quando:** câmara, cenário, regras da bola, coesão do bloco, e a
dificuldade de recepção/intercepção (`BallControl`).
Para o comportamento colectivo, vai antes a [bt/team_bt.js](js/bt/team_bt.js).

## `player.js` — o atleta *(classe `FootballPlayer`, ~1000 linhas)*

Tudo o que é individual: decisão, movimento e corpo 3D.

- **Decisão:** `runBehaviorTree()` é o cérebro (passar, rematar, cruzar, driblar,
  desarmar). `findPassTarget(role)` e `findPassTargetRelaxed()` escolhem o colega
  pela distância e pressão adversária.
- **Acções:** `initiatePass(alvo)`, `initiateShoot()`, `executeHeader()` — apenas
  disparam estados na FSM; a execução acontece em `fsm.js`.
  **`initiatePass` — lead por velocidade do receptor, auditado e recalibrado**
  (queixa: "passes crus, não chegam direito nos alvos", depois de aumentar o
  campo). `travelTime = distância / pesoVel` estima quanto tempo a bola leva
  a chegar, pra somar `receptor.velocity × travelTime` ao alvo. `pesoVel` é a
  velocidade MÉDIA da bola no voo, não a de saída (~17-18 m/s) — o arrasto e
  o atrito de rolamento travam-na muito ao longo do percurso, e a estimativa
  antiga (17 fixo) media 1.5×-2× mais curta que o tempo de voo real nos
  10-30 m (a faixa mais comum). No campo pequeno o erro não se notava
  (passes curtos, pouco tempo de voo); no campo maior, mais tempo de voo =
  mais erro acumulado = bola chegando atrás de quem corre a recebê-la.
  Recalibrado com testes isolados (alvo parado vs. a correr, várias
  distâncias): `pesoVel` 17→11, tecto do `travelTime` 3.0→4.5 s, tecto do
  lead total (`maxLeadTotal`) 14→18 m (os dois tectos sobem juntos — só um
  cortava o lead justamente nos passes longos que mais precisam dele). Erro
  medido caiu de 2-12 m para <1 m na maioria dos casos; só sprint (6 m/s) num
  passe de 45 m ainda erra bastante (~11 m, caso raro).
- **Movimento:** `steerArrive(target, maxSpeed)` — steering behaviour com travagem
  ao aproximar-se.
- **Corpo e animação:** `buildBody(corCamisa, corCalcao)` monta a malha hierárquica
  e o esqueleto; `animateBones(dt)` faz a animação procedural (corrida, salto,
  descanso); `resetBonesToDefault()` volta à pose neutra para evitar glitches;
  `updateShirt(num, pos)` desenha número e posição nas costas via canvas.
- **Aparência:** `this.aparencia`, posta no construtor a partir de
  `escolherAparencia(indice, total, seedEquipa)` (`config.js`), dá o cabelo, o
  tom de pele e a cor das chuteiras. Antes os vinte e dois eram idênticos: pele
  `0xdcdde1`, cabelo `0x2c1e16`, chuteiras amarelas.

  Cabelo e pele vêm sempre do mesmo `AppearanceModel.tipos` — `castanhoClaro`,
  `loiro`, `negro`, `ruivo` — para não sair ruivo de pele escura; as chuteiras
  (`vermelha`, `branca`, `preta`, `amarela`, `rosa`) são repartidas à parte. O tom das
  juntas sai da pele, escurecido a 72%, para o contorno das articulações não
  desaparecer.

  A repartição é **exacta**, pelo método do maior resto (`repartirPorPeso`), e
  não um sorteio por jogador: em 22 amostras o acaso dava um único negro e treze
  chuteiras brancas. Cada equipa recebe um baralho de onze, baralhado por hash e
  não por `Math.random`, para a aparência ser estável entre recargas.
- **Guarda-redes:** `updateGK(dt)` é IA e física à parte — defesas, mergulhos,
  posicionamento, relançamento. O estado é **por instância**: `this.gkEstado`
  (`'idle'` / `'mergulho'` / `'maos'` / `'salto_alto'` / `'apanhar'` /
  `'segurando'` / `'chutando'`), `this.gkTempoMergulho`, `this.gkDirMergulho`,
  `this.gkTipoMergulho`, `this.gkReagiu`, `this.gkDelayReacao`. Os dois GKs não
  se interferem.

  **Tudo o que é do guarda-redes tem de espelhar por `dirZ`.** O ramo do GK no
  `case 'CARRY'` (`fsm.js`) tinha o clamp em `-38` e o gatilho de passar em
  `z >= -39`, escritos à mão para o TeamA: para o TeamB o alvo era forçado
  para o **outro lado do campo** e ele passava a bola sempre. Agora é
  `ownGoalZ ± 14` e `(z − ownGoalZ) · dirZ >= 13`.

  Estados relevantes a partir do momento em que apanha a bola:
  - **`apanhar`** — bola mansa/rolando: pára de deslizar, agacha (em vez de
    agarrar instantaneamente a meio da corrida) e vira-se para a bola
    (`lookAtBola`) enquanto se aproxima.
  - **`maos`** — defesa **de pé**. A bola vem a menos de
    `GoalkeeperPose.mergulhoLateralMin` (2 m) do corpo: não se atira ao chão,
    só leva as mãos até ela, com os ângulos passados por
    `JointLimits.clampOmbro`. Os braços abrem **simétricos de propósito** —
    `lArm`/`rArm` são esquerda/direita **do modelo**, que está rodado por
    `lookAt` conforme a equipa, por isso mapear "o braço do lado da bola" a
    partir do x do mundo dá o braço errado para uma das equipas. O contacto é
    testado nas duas mãos, valendo a mais perto.
  - **`mergulho`** / **`salto_alto`** — defesas com estica, acima dos 2 m de
    desvio lateral. Braços procedurais apontam à bola a cada frame (via
    `JointLimits`) e o ponto de defesa é projectado do ângulo **real** do
    braço, não de um offset fixo — senão defendia com a barriga. Se agarra,
    chama `grabBall()`. Há um guard `Match.state !== 'PLAY'` nos dois: sem ele
    uma defesa em curso "reflectia" uma bola que já era golo, relançando-a da
    rede para o campo.
  - **`segurando`** — depois de `grabBall()`, 5-8 s sorteados
    (`this.gkSegurarDur`; o `GoalkeeperPose.segurarDur` de 8 s ficou só como
    fallback) a segurar a bola junto ao peito, tempo para as equipas se
    reorganizarem. A pose é **de pé** (tronco e pernas do `repouso`), não
    agachada. `grabBall()` faz **snap** dos ossos para essa pose em vez de
    esperar pelo lerp — senão ficava vários frames com um braço no ar, a meio
    da transição da pose do mergulho.
  - **`chutando`** — o gesto GOALKEEPER_KICK_FORWARD_HIGH (12 keyframes, ver
    `GoalkeeperKickClip`). O relançamento **não** sai quando o tempo de espera
    acaba: sai no frame do contacto pé-bola, via `ActionState('gkPunt')`, que é
    também onde o `GK_RELEASE_BALL` é emitido.

  **Posicionamento**: repouso e defesa saem todos de `gkAnchor()` (`config.js`).
  Ele **recua** de forma contínua à medida que o ataque se aproxima, e está
  praticamente em cima da linha quando a bola entra na área. Ficam de fora, com
  lógica própria: cruzamento, bola solta perto, espalmar, mergulho, mãos, salto e
  o posicionamento com posse própria (4 / 8.5 m, fase de construção).

  **Estilo (`gkStyleBase`)**: `defensive` nunca varre; `offensive` vira sweeper
  quando o adversário com bola entra no corredor central sem oposição (ver
  `updateGkStyle` em `bt/team_bt.js`). O estado corrente fica em `p.gkStyle`.
  `offensive` **não** quer dizer "mais adiantado o tempo todo" — fora do gatilho
  os dois estilos usam a mesma curva, só com valores diferentes; dentro dele,
  `gkSweepTarget()` substitui a âncora.

  A IA reage agressivamente a **bolas soltas na área**, com passo real
  limitado a `speedLerp` m/s (não fracção exponencial da distância restante —
  isso deixava-o "deslizar" dezenas de m/s quando o alvo saltava longe).
  A postura em `goleiroEstado === 'idle'` tem três variantes (ver
  `GoalkeeperPose`): **anda** normalmente quando se desloca ao longo da
  baliza, põe-se em **espera** com joelhos ligeiramente dobrados quando há
  um adversário com bola a menos de 25 m, e fica em **repouso** direito no
  resto do tempo. Vira-se sempre para a bola via `lookAtBola` (ver nota
  sobre a convenção de frente do modelo, mais abaixo).

  **Relançamento:** `releaseFromHands()` chama sempre `puntBall()` — o ramo de
  passe curto para um colega sem pressão foi removido a pedido. O `puntBall()`
  sorteia os ângulos a cada execução: elevação 25-50°, direcção até ±20° da
  frente. A potência sai da **balística** (`v = √(R·g / sin 2θ)` para um alcance
  de 38-54 m), não de um número à mão, por isso a bola cai onde deve seja qual
  for o ângulo sorteado. A direcção parte de `(0,0,dirZ)`, não do x do mundo —
  funciona igual para as duas equipas.
- `getSkill()` — média por sector, lida de `TeamSkills`. **Só fallback**, e para
  gerar elencos novos no `.json`.
- **`skillFor(campo)`** — a skill INDIVIDUAL do jogador (`p.skills`, de
  `data/player_skills.json`). É este o método a usar nas decisões.
  > Normaliza o campo para minúsculas por dentro. As chaves do JSON são
  > minúsculas (`tec`, `marking`, `speed`, `strength`, `pass`, `intercept`,
  > `gk`) e as chamadas usam maiúsculas (`skillFor('TEC')`) — sem a
  > normalização o lookup dava `undefined` e caía **silenciosamente** no
  > `getSkill()` genérico. Esteve assim, e o efeito era as skills individuais
  > não existirem no jogo.
- **`aplicarCamadaCorte()`** — a camada aditiva do corte diagonal
  (`DribbleCutClip`). Corre **depois** do `animateBones`, senão ele reescreve a
  pelvis e as pernas no mesmo frame e o corte desaparece.
- **`aplicarCamadaPeito()`** (matada no peito) e **`aplicarCamadaCabeceioDePe()`**
  (cabeceio de pé) — mesmo padrão: camadas aditivas por cima do `animateBones`,
  só tronco/braços, sem mexer na pelvis. **Bug corrigido**: os ângulos dos
  braços eram escritos com `+=`/`-=` em vez de convergir para um alvo (`lerpTo`)
  — acumulavam a cada frame e passavam bem de 90° ao longo do gesto, lendo
  como o corpo inteiro a desequilibrar-se em vez de "abrir levemente os
  braços". Corrigido para `lerpTo`.
  **Segundo bug, mais grave, no `CHEST_CONTROL`**: a velocidade só decai
  (`*0.75`/frame no `case 'CHEST_CONTROL'`, `fsm.js`) em vez de zerar na
  entrada — por uns ~13 frames (~0.2 s) `speed` ficava `>= 0.1`, e o bloco da
  passada de corrida em `animateBones` (`speed >= 0.1`, mais abaixo no
  ficheiro) escreve `lLeg`/`rLeg.rotation.x` **directo, sem lerp** — por cima
  de tudo, porque `aplicarCamadaPeito()` só mexe no joelho, nunca na coxa. O
  jogador aparecia com a perna esticada em pose de sprint, lendo como
  "deitado no chão" a matar no peito. Fix: `CHEST_CONTROL` força sempre o
  ramo neutro de `animateBones` (`speed < 0.1 || estado === 'CHEST_CONTROL'`),
  cortando o bloco de corrida por completo enquanto o gesto decorre.
- **Cabeçada com salto (`animateBones`, fase do `jumpTimer`)** — a perna dobra
  pelo **joelho** (`rig.lKnee`/`rKnee.rotation.x`, curva própria: pico em
  `p<0.28`, esticada de novo por `p≈0.58`, antes do contacto), não pela coxa
  (`rig.lLeg`/`rLeg`, que só faz um leve avanço de apoio, `0.10·sin`). Pedido
  explícito: "dobrar a parte de baixo da perna, esticar antes de aterrar".

> **`lookAtBola()` — problema em aberto, não resolvido.** É só um wrapper
> fino para `model.lookAt(ponto)`, usado em `updateGK`,
> `SET_PIECE_WAIT`/`SET_PIECE_TAKER` (`fsm.js`), nos takers de canto/pontapé
> de baliza (`match.js`) e no carrinho (`actSlideTackle`, `player_bt.js`) —
> um sítio só para mudar a convenção de facing se um dia for preciso.
> **Já lá esteve um `model.rotation.y += Math.PI` extra**, deduzido a partir
> da posição da cara (+Z local, `faceZ` em `buildBody`) e da ordem dos
> materiais da `BoxGeometry` — matematicamente auto-consistente, mas testado
> em jogo deu guarda-redes/jogadores **de costas** onde `.lookAt()` puro não
> dava essa queixa. Revertido. Se voltares a ver alguém de costas depois de
> mexer aqui: **não confiar só na álgebra** — comparar mesmo contra o jogo a
> correr antes de reintroduzir qualquer flip.

**Mexer aqui quando:** decisões individuais, animação, aparência, guarda-redes.

## `fsm.js` — máquina de estados

- `ownGoalZCenter(team)` — Z da baliza que a equipa defende (`TeamA` = −48, `TeamB` = +48).
- `PlayerFSM` — `changeState(novo)` e `update(dt)`, que executa a lógica do estado
  ao longo do tempo (ex.: um carrinho decorre ao longo de ~1.5 s).

Estados: `IDLE`, `MOVE_TO_POS`, `MARKING`, `BLOCKING`, `FWR_SUPPORT`,
`AFT_SUPPORT`, `CARRY`, `DRIBBLE`, `CUT`, `PASS`, `SHOOT`, `TACKLE`,
`SLIDE_TACKLE`, `SET_PIECE_TAKER`, `SET_PIECE_WAIT`, `WATCH_CORNER`.

**`MARKING` está morto** — ninguém escreve `markingTarget`. A marcação a sério é
posicional e não passa pela FSM (ver `MarkingModel`).

**`WATCH_CORNER`** — quem bate o canto fica fora do campo, parado, virado para a
bola, até ela cair ou outro lhe tocar. Dois cuidados, que já foram dois bugs:
- O disparo percorre **os dois planteis num laço só**. Estavam separados e o
  estado foi posto apenas no de `Match.players`, portanto só o TeamA o tinha; num
  canto do TeamB o batedor caía no ramo antigo.
- A bola **parte do chão** (y = 0.11) e leva quatro frames a passar os 0.5 m, por
  isso testar `y < 0.5` à cabeça dava verdade no primeiro frame e ele saía 67 ms
  depois de bater. A queda só conta depois de a bola ter subido
  (`cornerBolaSubiu`, reposto no `changeState`). Sai para `MOVE_TO_POS`, não
  `IDLE`: tem de voltar ao jogo.

**`CUT`** é o corte diagonal de 30° (DRIBBLE_CUT_30). O `DRIBBLE` bem-sucedido
entra nele em vez de resolver tudo num frame: a direcção roda por smoothstep ao
longo de ~0.75 s, com dois toques laterais curtos (frames 6 e 9). Está na lista
de estados bloqueantes do `AccaoEmCurso` (o BT não pode re-decidir a meio da
rotação) e o `changeState` desliga `p.cutAtivo` ao sair por qualquer via —
perda de bola, desarme, bola parada — senão o corpo ficava torto.

**Duelos de skills.** O resultado das disputas vem de `venceuDuelo(a, b, base)`
(`utils.js`), com `p.skillFor(...)` dos dois lados:

| Acção | Duelo |
|---|---|
| `TACKLE` | (VELOCIDADE+FORÇA) def x (VELOCIDADE+FORÇA) atk |
| `SLIDE_TACKLE` | MARCAÇÃO x TÉCNICA — perdendo, passa ao lado sem tocar na bola |
| `SHOOT` | bloqueio TÉCNICA x MARCAÇÃO; passando, TÉCNICA x GK decide o canto |
| cabeceio (`executeHeader`) | MARCAÇÃO no contacto + TÉCNICA x GK na colocação |
| linha de passe (`findPassTarget`) | PASSE x INTERCEPTAÇÃO escala o `safetyLimit` |
| recepção (`resolveBallContact`) | TÉCNICA x MARCAÇÃO do marcador a menos de 3 m |

`changeState` tem um hook de entrada: `enterSlideTackle()` escolhe sobre que
anca o jogador desliza e qual o pé que estica (o do lado da bola; ao acaso se
ela estiver mesmo em frente). Vira o corpo para o portador com `lookAtBola`
antes de entrar no estado (`actSlideTackle`, `bt/player_bt.js`) — a escolha
de anca/pé lê essa orientação.

**`case 'PASS'` já não executa o passe directamente** — só lê
`p.actionState.update(dt,p)` (ver `bt/action_state.js`) para posar o rig; o
efeito real é `executePassGameplay(p)`, função à parte neste ficheiro,
chamada pelo `onContact` do `ActionState` criado em `initiatePass()`
(`player.js`). `SHOOT`/`TACKLE`/`SLIDE_TACKLE`/cabeceio ainda não migraram —
continuam a disparar o efeito por `this.timer` bruto, como sempre foi.

`SET_PIECE_WAIT`/`SET_PIECE_TAKER` viram-se para a bola com `lookAtBola`
todos os frames — wrapper fino de `.lookAt()`, ver nota sobre o problema em
aberto do facing na secção do `player.js`.

**O carrinho** (`applySlidePose` + o `case 'SLIDE_TACKLE'`) é procedural, não
tem keyframes: desliza sobre uma anca com uma perna esticada e a outra dobrada
por baixo, tronco erguido e apoiado no braço de trás. Um `intens` de 0 a 1 faz
a entrada e a saída da pose. Dura 1.95 s no total, dos quais meio segundo é
**tempo caído no chão** antes de se levantar — é o preço de ter feito o
carrinho. Se tocar na bola (uma vez só, `slideTouched`), empurra-a ~4.5 m na
direcção do toque e o próprio fica com `touchLock` até se levantar, para não ser
ele a recolhê-la de rastos.

**Mexer aqui quando:** adicionar uma acção nova ou mudar a duração/execução de uma existente.
Regra prática: a *decisão* de agir vive em `player.js`, a *execução ao longo do tempo* vive aqui.

## `playing_styles.js` — resolução e eventos dos Playing Styles

O catálogo (`PlayingStyles`, `EstiloBase`, `EstiloPorOmissao`) vive no
`config.js` — este ficheiro só resolve e liga/desliga.

- `estiloDe(p)` — o estilo DECLARADO do jogador (UI, gatilhos), fundido com
  `EstiloBase` via `PlayingStyleUtils.resolve` (com cache).
- `estiloAtivoDe(p)` — o estilo EM VIGOR neste frame; é o que as folhas de
  `position_bt.js`/`player_bt.js` devem ler. Depende de `p.styleAtivo`
  (avaliado pelo nível 3, `avaliarEstilo`) **e** de `p.playingStyleDesligado`
  — devolve `EstiloBase` neutro se qualquer um dos dois desligar. O toggle
  do painel "Player Skills" (`main.js`) mexe em `playingStyleDesligado`: com
  o estilo desligado, o jogador usa só o `PositionBT` puro, sem nenhum
  desvio de estilo, pra regular o nível 2 isolado do nível 3.
- `PlayingStyleEvents.tick(bb)` — avalia as condições de cada estilo uma vez
  por equipa por frame e emite evento só quando o estado MUDA
  (`STYLE_ON`/`STYLE_OFF`), nunca todo frame.

**Mexer aqui quando:** um estilo não liga/desliga quando devia, ou o toggle
manual do painel não está a bloquear o desvio de estilo.

## `main.js` — arranque e loop

- Globais da renderização: `scene`, `rendererCore`, `cameraCore`, `orbitControls`, `lastTime`.
- `animate(time)` — `requestAnimationFrame`; calcula `delta` (com clamp a 0.016 s se
  o frame saltar > 0.1 s ou vier `NaN`), respeita `window.isPaused`, escolhe entre
  `orbitControls` e `Match.updateCamera()`, e renderiza. Calcula também os FPS no ecrã.
- Listener `DOMContentLoaded` — cria a cena e chama `Match.init(scene)`.
- Listener `resize` — actualiza aspect ratio e tamanho do renderer.
- `togglePainel(forcar)` — minimiza/maximiza o painel esquerdo. Sem argumento
  alterna; com `true`/`false` força o estado. Ligado ao botão do cabeçalho e à
  tecla **X**. O visual é a classe CSS `.minimizado` em `#painel-comandos`.
- Toggles na UI do painel direito: Os números nas costas e nomes de posições (`PlayerPOS`)
  podem ser ativados/desativados no painel de controlo.
- **Painel "Player Skills"** (`popularPainelJogadores`) — lista compacta por
  equipa (nome, badge ON/OFF do Playing Style, FIT). O badge é clicável e
  liga/desliga `p.playingStyleDesligado` (ver `estiloAtivoDe` em
  `playing_styles.js`); por omissão todo estilo começa **OFF**
  (`aplicarPlayingStyle` em `match.js`). Clicar no nome ou no FIT abre
  `abrirModalSkills(p)`, que tem a mesma linha "Playing Style" clicável
  (`(ON)`/`(OFF)`) dentro do modal — os dois toggles mexem no mesmo campo.
- **Painel "PlayerBT Debug"** (`#painel-playerbt`, canto inferior direito,
  **minimizado por omissão** — `togglePainelPlayerBT()` para abrir). Mostra o
  `trace` do `PlayerBT` (nó:resultado, na ordem avaliada — `BT.debug=true`
  em `bt/core.js`) do jogador mais relevante de cada equipa
  (`jogadorRelevante`: o portador, senão o `chaser` do TeamBT). A linha com
  `->` é a acção realmente activa; as `FAILURE` acima mostram por que os
  ramos de maior prioridade foram rejeitados. `updatePainelPlayerBT()`
  chamado a ~5 Hz dentro do `animate()`, e só corre trabalho se o painel
  não estiver minimizado.

- **Broadcast do TeamBT** (dentro do `animate()`, junto da leitura de
  `bbA.posture`/`bbB.posture` pro HUD) — publica `{TeamA:{trace,posture},
  TeamB:{...}}` num `BroadcastChannel('teamBtTrace')`, todo frame. Não faz
  nada se ninguém estiver a ouvir do outro lado — custo é só o `postMessage`.
  Consumido por [teamBtView.html](teamBtView.html) (ver secção própria).

**Mexer aqui quando:** configuração do renderer, timestep, ou o que corre no arranque.

## `teamBtView.html` — fluxograma do TeamBT ao vivo

Página **separada** (abre numa aba nova, botão "TeamBT Fluxograma" no painel
de Visibilidade, ou `window.open('teamBtView.html', ...)`), não faz parte do
`index.html`. Pedido explícito: ver a árvore de decisão do nível 1
(`bt/team_bt.js`) como um fluxograma, não como texto/log.

- A árvore (`sel`/`seq`/`cond`/`act`, mesmos nomes de nó de `team_bt.js`) está
  **copiada à mão** neste ficheiro (`TREE`, objecto JS) — não há introspecção
  automática da árvore real, porque os nós do `bt/core.js` não guardam os
  filhos com nomes fora do closure de `setPosture`/`act`. **Se a árvore em
  `team_bt.js` mudar, actualizar aqui também.**
- Recebe `{trace, posture}` por `BroadcastChannel('teamBtTrace')` (publicado
  por `main.js` → `animate()`) e destaca o caminho percorrido: verde
  (`SUCCESS`), cinza (`FAILURE`), ramos nem sequer avaliados ficam
  esbatidos. `bb.trace` já existia (`bt/core.js`, `BT.debug=true`) — este
  ficheiro é só o primeiro consumidor visual dele.
- Selector de equipa (TeamA/TeamB) e a postura activa em texto.
- **Precisa da aba do jogo aberta** — sem `index.html` a correr no mesmo
  browser (mesmo contexto/perfil), não há ninguém a publicar no canal.

**Mexer aqui quando:** a árvore do TeamBT mudar de forma, ou quiseres o mesmo
padrão de fluxograma pro PositionBT/PlayerBT.

---

## Onde vou quando quero…

| Quero… | Ficheiro |
|---|---|
| Mudar uma formação ou dimensão do campo | `config.js` |
| Mudar quando a equipa pressiona / recua / bascula | `bt/team_bt.js` → a árvore |
| Equipa compacta demais / esticada demais | `config.js` → `TeamShape.blockDepth*` |
| Alturas do ajuste Low/Medium/High da linha | `config.js` → `TeamShape.linhaDefensiva` |
| Dar personalidade a uma postura sem mexer nas posições | `bt/team_bt.js` → `TeamPostureTuning` |
| Afinar onde um lateral/central/extremo se coloca | `bt/position_bt.js` → a folha dessa posição |
| Afinar a forma e o tamanho do bloco | `config.js` → `BlockShape` |
| Afinar a profundidade por linha (com/sem bola) | `config.js` → `LineShape` |
| Afinar o fora-de-jogo | `match.js` → `relaxConstraints()` |
| Impedir jogadores sobrepostos | `match.js` → `separarAlvos()` |
| Afinar andar / trotar / correr | `config.js` → `GaitModel` |
| Afinar quanto se conduz vs. passa | `config.js` → `CarryModel.espacoLivre` e `.distanciaMax` |
| Afinar marcação e largura da última linha | `config.js` → `MarkingModel` |
| Afinar cruzamentos | `config.js` → `CrossModel` |
| Mudar quando um jogador remata em vez de passar | `bt/player_bt.js` → a árvore |
| Alcance de remate / drible / lançamento | `config.js` → `ShootingModel`, `PassModel` |
| Facilidade de intercetar ou receber um passe | `config.js` → `BallControl` |
| Como o portador escolhe por onde conduzir | `config.js` → `DribbleModel` |
| Mudar como um remate é executado | `fsm.js` → `case 'SHOOT'` |
| Física da bola, golo, linha lateral | `match.js` → `updateBall()` |
| Guarda-redes | `player.js` → `updateGK()` |
| Câmaras de TV | `match.js` → `updateCamera()` |
| Câmara de órbita livre | `controls.js` |
| Aspecto do painel/HUD | [css/styles.css](css/styles.css) e [index.html](index.html) |
| Minimizar/maximizar o painel | `main.js` → `togglePainel()` + `.minimizado` no CSS |
| Trocar ou reconverter o modelo da bola | `assets/Ball.obj` + `node tools/obj2js.js` |
| FPS / timestep / arranque | `main.js` |
| Cadência de decisão com bola (domínio antes de passar/rematar) | `config.js` → `CadenceModel` |
| Até onde o bloco avança sem bola | `config.js` → `MentalidadeModel.tectoBloco` |
| A que distância se acompanha o homem | `config.js` → `MarkingModel.distanciaPorPressao` |
| Sincronizar um efeito de gameplay com a animação (bola sai do pé, etc.) | `bt/action_state.js` + `config.js` → `ActionAnimClips` |
| Percepção da bola / interceptação / quem vai disputar uma bola solta | `perception.js` |
| Cruzamento morre sempre (ninguém na área) | `bt/player_bt.js` → `AtacarArea` |
| Estatísticas da partida (passes, remates, posse, etc.) | `stats.js` |
| Rodar centenas de jogos sem ecrã | `simulate.js` |
| Placar / cronómetro no ecrã | `match.js` → `updatePlacar()`, `#placar` no `index.html` |
| Ver a árvore/condições activas de um jogador em tempo real | `main.js` → painel "PlayerBT Debug" (`updatePainelPlayerBT`) |
| Guarda-redes de costas para a bola/campo | `utils.js` → `lookAtBola()` — **problema em aberto**, ver a nota na secção do `player.js` |
| Peso/tamanho/arrasto da bola | `config.js` → `BallPhysics` (valores reais; `escalaVisual` só aumenta a malha) |
| Bónus tácticos por zona do campo | `spatial_grid.js` → `SpatialGrid.LAYERS` |
| Fazer sistemas reagirem a algo sem `if` espalhado | `event_bus.js` |
| Limites de rotação de uma articulação | `joint_limits.js` |
| Playing style do GR ou do lateral | `config.js` → `GoalkeeperStyle` / `FullBackStyle`; atribuição em `match.js` → `assignFormations()` |
| Ligar/desligar o Playing Style de um jogador na UI | `main.js` → painel "Player Skills" (badge ON/OFF) ou modal (`abrirModalSkills`) |
| Dar estilos diferentes a jogadores na mesma posição | `config.js` → `EstiloPorOmissao` (lista por posição) |
| Preferir passe pra frente antes de conduzir sozinho | `bt/player_bt.js` → `PassarEmFrente` |
| CFs/pontas indo pro vão do lado errado da jogada | `bt/position_bt.js` → `melhorVaoX` |
| Golo/saída contando antes da bola cruzar a linha toda | `match.js` → `updateBall()`, detecção de golo (`- BallPhysics.raio`) |
| Ângulo/força do relançamento do GR | `player.js` → `puntBall()` |
| Gesto do chutão do GR | `config.js` → `GoalkeeperKickClip` + estado `'chutando'` em `updateGK` |
| Corte diagonal de 30° no drible | `config.js` → `DribbleCutClip`, `fsm.js` → `case 'CUT'`, `player.js` → `aplicarCamadaCorte()` |
| Passe experimental por pontos candidatos | `pass_candidates.js` + botões *PlayerPassTarget* / *PassGrid* |
| Resultado de uma disputa (desarme, remate, cabeceio) | `utils.js` → `venceuDuelo()`, `player.js` → `skillFor()` |
| Fluxograma ao vivo da árvore do TeamBT | [teamBtView.html](teamBtView.html) (aba separada) |
| Pose da matada no peito / cabeceio de pé | `player.js` → `aplicarCamadaPeito()` / `aplicarCamadaCabeceioDePe()` |
| Cabeçada com salto (fase subida/contacto/descida) | `player.js` → `animateBones()`, bloco do `jumpTimer` |
| Passe chegando atrás/à frente de quem corre (lead) | `player.js` → `initiatePass()` — `pesoVel`/`travelTime`/`maxLeadTotal` |
