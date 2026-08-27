# Referência dos ficheiros JavaScript

Mapa do código do Soccer Simulator depois da divisão do `index.html` monolítico.
Consulta este ficheiro para saber **onde** mexer antes de abrir o código.

## Últimas Actualizações (Agosto 2026)

### Sessão de 27 de Agosto de 2026 (continuação) — constantes que ninguém lia

Testes novos: `falta_cobranca`, `bola_parada_junto_ao_destinatario`,
`mentalidade_bloco`. Suite: **64 ficheiros, 120 casos**.

O tema desta metade da sessão foi esse: três constantes que descreviam
comportamento no `config.js` e que o código nunca chegava a ler. Ficam aqui
porque são o tipo de defeito que não dá erro, não aparece em teste nenhum, e só
se encontra a medir.

#### Jogadas combinadas: cara a cara, tabelinha, overlap

Nenhuma existia. A tabelinha nunca existiu, o **overlap tinha sido desligado**
(`overlapTimer = 0` no player.js, com o comentário "Disparadas / Overlap
pós-passe desativadas") e o cara a cara não era uma categoria — saía por
acidente quando a nota do `PassTypes.escolher` calhava.

São um RAMO próprio (`tratarJogadaCombinada`, chamado do topo do `actPass`) e
não um bónus na nota: um bónus continua a competir com o progresso para a
baliza, e é isso que as faz perder. Ordem: devolução de tabelinha pedida, cara
a cara, iniciar tabelinha, passe para quem faz overlap.

As duas metades sem bola (`EsperarDevolucao`, `Overlap`) entraram na árvore
ANTES do `Receber` — quem pede a tabelinha não é o destinatário do passe, o
parceiro é, e o arranque tem de acontecer enquanto a bola vai e vem. O
`tests/arvore_sem_bola.test.js` fixa essa ordem e falhou, como devia.

Medido num tempo: 24 tabelinhas, 22 passes para overlap, 1 cara a cara — e os
remates passaram de **4 para 18**, com 3 golos onde não havia nenhum.

#### Fox in the Box: o estilo estava ligado 2% do tempo

O gatilho pedia a bola a mais de 12 m dentro do meio-campo adversário. Medido:
**2% dos frames em posse**. Nos outros 98% ele era um avançado normal no slot
puro, a 25 m da área — era isto o "afasta-se muito da área".

Passou a ligar a partir do meio-campo (`bolaAvanco > -5`), e a profundidade
acompanha a bola (`PlayingStyleTuning.foxInTheBox`) em vez de o colar à linha
da área desde o início — com o gatilho novo, isso punha-o na área com a bola
ainda na defesa.

O que o prende de facto é o FORA-DE-JOGO: medido, a linha adversária está a
18.9 m antes da área e a bola a 39 m dela. Ele não pode estar na área a maior
parte do tempo, e fica ~5 m atrás do limite legal, que é o correcto.

#### Dummy Runner: a corrida não acabava

A corrida de arrastamento era uma POSIÇÃO — enquanto a equipa atacasse, ele
vivia aberto na ponta, longe das jogadas. Agora é um episódio de 6 s com 4 s de
descanso (`PlayingStyleTuning.dummyRunner`).

Duas coisas que só a medição mostrou:

  - o relógio tem de correr no `avaliarEstilo`, que corre todos os frames, e
    não no deslocamento, que só corre com o estilo activo: lá dentro, uma
    corrida de 6 s esticava-se por 70 s de tempo real, congelada em cada pausa;
  - `bb.carrier` não pode entrar na condição de continuação — **durante o voo
    de um passe não há portador**, e a corrida morria a cada passe (0.5 s de
    mediana).

Resultado: 94 corridas por tempo, mediana 3.0 s, máximo 8.0 s. Menos de 6 na
mediana porque a equipa perde a posse a meio, que é o correcto.

#### A cobrança da falta

Duas coisas: `FreeKickModel.recuoBatedor` era 1.4 m (o batedor em cima da bola)
e o `baterFalta` executava tudo no mesmo frame — `hasBall = true` e
`initiateShoot`/`initiatePass` de onde estava. Sem corrida e sem gesto, o que se
via era a bola a saltar sozinha para o pé dele.

Agora são três tempos: espera a `recuoBatedor` (4.8 m), **caminha** até
`arranqueDoGesto` (2.6 m) durante o último terço da espera regulamentar, e o
`ActionState` cobre os últimos metros com a bola a partir no `contactTime`. O
`Match.state` só passa a `'PLAY'` nesse instante.

Dois obstáculos pelo caminho, ambos encontrados a medir (13 de 14 cobranças não
chegavam ao contacto):

  - o `case 'PASS'` da FSM mata o gesto quando `!p.hasBall`, e durante a corrida
    o batedor não tem a bola. A corrida usa o estado do REMATE mesmo quando a
    falta acaba em passe curto; o gesto do passe é criado pelo `initiatePass`
    no contacto.
  - o `tratarBolaParada` forçava `SET_PIECE_WAIT` no batedor a meio do gesto, e
    o `changeState` limpa o `actionState`. Mesma excepção que o penálti já
    tinha.

#### Bola parada JUNTO ao destinatário — a outra porta do mesmo deadlock

O `passeMorreuParaODestinatario` (utils.js) começava por desistir quando a bola
estava a menos de `passePerdidoDist` (4 m) dele: perto do destinatário o passe
conta como entregue e o resto do teste nem corre.

Só que "perto dele" não é "no pé dele". A bola pode parar a três metros sem ele
lhe tocar — e aí ninguém a vai buscar, porque o `bolaSolta` do
`deveMandarChaser` exige `!intendedReceiver`. Bola quieta com três jogadores à
volta.

`PerceptionModel.prazoBolaParada` (1.2 s): com a bola parada e sem dono, o
Match conta o tempo e o passe caduca mesmo estando perto dele. Uma bola que
ainda rola na direcção dele nunca caduca, e antes do prazo nada muda.

A sessão anterior tinha corrigido o caso da bola parada LONGE do destinatário;
este é o mesmo deadlock a entrar pelo outro lado.

#### A Mentalidade não estava ligada ao bloco

`MentalidadeModel[estilo].blocoZ` existia desde sempre, com o comentário "A
Mentalidade fala uma vez, pelo `blocoZ`", e **nunca era lido**. O `computeBlock`
usava só `bolaZDir + blocoZSuave` (o ±5 da fase). A única coisa que a
Mentalidade mexia era a `profundidade` — e essa, sem posse, é forçada a `short`
para toda a gente.

Ou seja: com a equipa a defender, Muito Defensiva e Muito Ofensiva davam o mesmo
bloco. Medido, mediana da profundidade do alvo no referencial de ataque:

```
                Muito Defensiva   Balanceado   Muito Ofensiva
   antes: def        -16.1           -15.6         -16.6
          mid         -6.1            -6.3          -7.0
   agora: def        -19.6           -15.8         -14.6
          mid         -8.5            -7.6          -5.3
          atk          1.3             5.7           5.4
```

E ligar o `blocoZ` ao centro do bloco não chegou: os DEFESAS continuavam
parados, porque a traseira é ancorada pela Linha Defensiva do painel, que tem a
última palavra. `MentalidadeModel.pesoNaLinha` (0.5) inclina essa âncora — o
botão continua a ser o controlo grosso. Medido relativo à bola, os defesas
passaram de 5 m para 15 m de amplitude entre os extremos da escala.

### Sessão de 27 de Agosto de 2026 — o passe que não chegava, e o remate que já sabia o resultado

Testes novos: `penalti_defesa`, `passe_encontro`, `passe_alto_angulo`,
`gk_defesa`, `remate_tipo_mira`, `primeira_tocada`. Suite: **61 ficheiros,
104 casos**.

Ferramenta nova: `tools/headless/` — o jogo REAL a correr em Node (jsdom +
three r128 do `node_modules`, sem renderer). Um tempo de jogo em ~16 s de CPU,
com a instrumentação a embrulhar as funções globais em vez de sujar o código de
produção. Foi ela que encontrou quase tudo o que está aqui em baixo; sem
medição, três destes bugs eram invisíveis.

#### O penálti que ninguém batia

O `baterPenalti` passou a usar um `ActionState` (corrida + contacto no
`contactTime` do clip), mas o freeze do `player.update` fazia `return` antes do
`fsm.update` para TODOS enquanto `Match.state === 'PENALTY'`. O `actionState`
nunca avançava, o `onContact` nunca disparava, e o PENALTY só acabava pelo
timeout de 15 s do `setPieceTimer` — com a bola ainda na marca. Nesse instante
o guarda-redes via `PLAY` com uma bola solta na área e saía da baliza a ir
buscá-la: era o "goleiro sai antes do cobrador tocar na bola".

Excepção no freeze para o `setPieceTaker` com `actionState`: corre só o
`fsm.update`, nunca o `runBehaviorTree` — o `tratarBolaParada` força
`SET_PIECE_WAIT` durante o PENALTY e mataria o estado `SHOOT`.

#### E o resto do penálti

- **Árbitro** (`officials.js`): posição fixa no penálti, à esquerda do batedor,
  no cruzamento da lateral da pequena área com o alinhamento da marca
  (`PenaltyModel.arbitroX`). A diagonal normal punha-o a meio-campo.
- **Cobertura** (`match.js`): dois defesas e um médio de quem bate, mais dois
  atacantes de quem defende, saem da fila e formam uma linha própria
  `recuoCobertura` metros atrás e **centrada no eixo**. Ficarem na fila punha-os
  nas pontas — 21 lugares a 2.2 m deixam quem sobra encostado à linha lateral.
- **Defesas** (`player.js`): fora do ramo `diff <= -5` o `gkDiveCol` era SEMPRE
  o lado contrário — o guarda-redes atirava-se de propósito para o lado errado e
  um penálti bem batido acabava sempre em golo, trave ou fora, nunca numa mão.
  `PenaltyModel.chanceDefesa` dá a cada banda de `diff` uma probabilidade de ele
  ir ao sítio certo (2% no remate perfeito, 55% no mal batido), e só quando o
  remate ia mesmo para dentro da baliza.

#### Espalmada com direcção (`gk_dive.js`)

A espalmada devolvia SEMPRE a bola ao campo (`ballVel.z *= -0.5`, sinal
invertido): nunca havia um canto ganho numa defesa, a saída mais comum de todas
num remate colocado. Agora a colocação decide, e a POSIÇÃO da bola é empurrada
para fora da moldura no instante do toque — sem isso a mão está na linha de
golo e a bola atravessava o plano ainda dentro dos postes nos milissegundos
seguintes, ou seja golo.

#### Som

- `AmbienteSonoro` arranca **desligado** (`_ligado: false`), com o botão do
  painel a condizer e o `volume` a zero já na `init` — o `update` só corrigia no
  frame seguinte, e esse frame chegava a sair com som.
- `efeitos_sonoros.js` (novo): apito e chute, com pool de 4 vozes por som (um
  único `Audio` não se sobrepõe a si próprio — `play()` numa amostra a tocar
  reinicia-a), cadência mínima por som e atenuação do chute pela distância à
  câmara. Partilha o interruptor do ambiente: um botão, um som.
- O apito da saída é dado `APITO_ANTES_DA_SAIDA` (1 s) antes do toque e não na
  montagem do kickoff, onde ficava os 3 s inteiros à frente da bola.

#### Passe de encontro — a fórmula que faltava (`utils.js`)

O passe aos pés estava certo e o passe no espaço não, e a razão era sempre a
mesma: a força saía SÓ da distância. `velocidadeRasteiraPara(dist, vChegada)`
responde "que velocidade põe a bola ali ainda jogável" e nunca soube QUANDO o
companheiro lá chega. Aos pés não se nota; num lançamento o alvo está 10-15 m à
frente dele.

A física rasteira já estava escrita (`dv/dt = −(k·v² + μg)`) e tem solução
fechada. Daí saem as funções novas:

```
velocidadeDeChegadaRasteira(d, v0)   com que velocidade lá chega
tempoRasteiroDaBola(d, v0)           t = (atan(v0/V) − atan(v(d)/V)) / w
velocidadeRasteiraEmTempo(d, T)      a saída que a faz demorar T (bissecção)
velocidadeParaChegarA(d, vCh)        inverso exacto, sem os ajustes de jogo
tempoDoJogadorAte(d, v0, vMax)       modelo de arranque do próprio steerArrive
passeDeEncontro({...})               junta tudo
elevacaoParaTempoDeVoo(d, T)         passe alto: mesmo alcance, outro tempo
elevacaoComTectoDeApex(d, elev, max) e o tecto de altura
```

Duas condições: a bola chega ao ponto `folgaTempo` depois dele, e chega a
`fracVelReceptor` da velocidade a que ele corre.

**O tecto tem de ser em velocidade RELATIVA.** Em absoluto — como estava — com
um receptor a 6 m/s o tecto ficava em ~5 m/s, e para chegar a 5 m/s ao fim de
25 m a bola tem de sair mansa: medido, **2.38 s de voo para 25 m** com o homem
a chegar ao ponto em menos de 1 s. Ia tão devagar que era interceptada a meio.
Quem recebe corre no sentido da bola; é a diferença das duas velocidades que
ele tem de dominar.

#### Ângulo e altura do passe pelo alto

Havia três caminhos a escolher elevação e nenhum tinha faixa: as bandas
(`atan(4·alturaMax/dist)`, tecto de 60° — um passe de 21 m dava 38.7°), o longo
(42°→32°) e o encontro (12°-55°, que ia buscar os 55° para atrasar a bola).
Todos apertados em **25°-35°** (`passeArco.elevMin/elevMax`).

Mas o ângulo sozinho não chega: o apex vai com o QUADRADO da velocidade, e essa
cresce com a distância. Medido, um lançamento de 54.9 m saía a 35° com
`vy = 18.5` — **17 m de altura**, ângulo legal e bola de guarda-redes. Daí o
`apexMax: 7.0` e o piso `elevMinLonga: 15°` para quando nem no mínimo da faixa
cabe: a alternativa a um passe longo tenso não é um passe longo alto, é não dar
o passe. E o `throughBallMaxDist` desceu de 45 para 38 m — com o alvo posto
`throughBallDepth` além do companheiro, 45 dava lançamentos de 58 m.

#### O destinatário corria PARA O PASSADOR (`bt/player_bt.js`)

O bug mais caro dos três, e o mais escondido. `bb.chaser =
Match.intendedReceiver` (`team_bt.js`): quem tem o passe a caminho é designado
perseguidor, e faz sentido. O que não fazia sentido era a folha:

```js
p.dynamicTarget.copy(Match.ball.position);   // onde a bola ESTÁ neste frame
```

No instante em que o passe sai, "onde a bola está" é em cima do passador —
atrás dele. Ele arrancava para o espaço, o passe saía, e dava meia-volta para
ir buscá-la. E como o ramo `IrABola` corre ANTES do ramo `Receber`, corrigir só
o `actReceivePass` não chegava: nunca lá chegava.

Por baixo havia um segundo problema: mesmo no `actReceivePass`, o
`interceptionPoint` (o primeiro ponto da trajectória a que ele chega — atrás,
na direcção do passador) ganhava sempre ao ponto do passe. Agora é uma corrida:
`tempoDoJogadorAte` contra `tempoRasteiroDaBola`, com `PassModel.recepcao`.

Medido meio segundo depois do passe, na fracção que ficou MAIS LONGE do ponto:

```
             antes    depois
direct        23%       3%
space         60%       9%
leading       50%       8%
lançamento    56%       0%
```

E a fracção de passes que chegaram ao destinatário: `direct` 46%→80%, `space`
44%→78%, `leading` 31%→80%, `lançamento` 45%→71%.

#### A corrida ao ponto, na escolha do alvo (`pass_candidates.js`)

O `raioAdversario` só pergunta se há um adversário JÁ em cima do ponto. Medido,
os lançamentos cortados eram-no a **96% do percurso**: a bola não era
interceptada pelo caminho, chegava ao destino e era o adversário que lá estava.
`venceACorrida` compara tempo com tempo, com `margemCorrida: 0.30` s — empatar
não chega.

#### Parar e recuar com a bola (`CarryModel.segurar`)

O portador só sabia ir para a frente. O `carryRecuo` existia mas estava atrás de
três condições DEPOIS de dois ramos que passam a bola: nunca corria. Parar com
ela não existia de todo. `tratarSegurarBola` é agora o ramo 0 do `actPass` — sem
passe bom e sem ninguém a 6 m, 35% fica com ela (`carryHold`, com timer próprio
para o BT não redecidir no frame seguinte), 30% recua.

#### Defesa do guarda-redes: uma fórmula, três resultados (`GkCatchModel`)

Havia três fórmulas em três ramos, com bases e declives diferentes
(`0.35 + (GK−50)/100`, `0.55 + (GK−50)/100`, `0.4 + (GK−50)/80`) e uma quarta
situação que agarrava sempre. Nenhuma sabia a que velocidade a bola vinha nem
se a mão estava ao peito ou na ponta dos dedos, e nenhuma usava a TÉCNICA.

```
P(agarrar) = base[tipo] + 0.30·(GK−50)/50 + 0.12·(TEC−50)/50
           − 0.22·(v−vRef)/vRef − 0.40·extensao − 0.10·altura
```

Calibrado em ~64% de bolas agarradas para um guarda-redes médio contra remate
médio (corpo 78%, mãos 70%, salto 60%, mergulho 48%). O terceiro resultado é o
`roca` — toca-lhe e ela segue —, que só aparece com bola rápida E braço
esticado: 0% num cruzamento, 31% num tiro na ponta dos dedos. E a espalmada
deixou de ser aleatória: `qualidadeEspalmada(TEC)` escolhe entre canto, lateral
e o rebote curto ao meio da área, que é o caso que faltava.

#### O remate decide a bola, não o desfecho (`ShotModel`)

Sorteava-se o RESULTADO (`GOL`, `TRAVE_CAMPO`, `TRAVESSAO_FORA`,
`GOLEIRO_DEFENDE_*`) por pesos de `attackRatio` e só depois se escolhia o ponto
que o produzisse. Não havia remate colocado nem rasteiro — havia potência
sempre cheia com `alvoY = random() > 0.5 ? 2.0 : 0.4` e o canto de `random()`,
sem olhar para o guarda-redes.

E o desfecho DESLIGAVA o guarda-redes: `forcedGKDelay = 1.0` nos remates
marcados como golo. Todo o `GkCatchModel` só era consultado depois de o sorteio
já ter decidido que ia haver defesa.

Agora há quatro tipos (`colocado` 0.68× potência e 0.80× sigma, `rasteiro`,
`forca`, `chapeu` só com o guarda-redes adiantado), mira ao canto CONTRÁRIO ao
guarda-redes, e um erro gaussiano em metros no plano da baliza
(`sigmaDeRemate`). Trave e "por cima" deixaram de ser casos de tabela: são a
mira a falhar por pouco, e a colisão real com a armação faz o resto.
`erro.escalaGlobal` (1.0) é a única manípula de calibração — o teste falha se
sair de 1.0, para os números medidos não passarem a mentir.

```
precisão medida:   6 m: 64% no alvo   12 m: 52%   18 m: 42%   25 m: 31%
```

#### Jogo de primeira (`FirstTouchModel`)

Toda a gente dominava sempre e depois esperava ~3 s de cadência. Um jogador com
TEC >= 85 e um adversário a <= 4 m PODE tocar de primeira: 45% das vezes a TEC
85, 80% a TEC 100. Duas ligações, sem as quais era só uma constante no config —
o `resolveBallContact` decide e salta o gesto de domínio, e o ramo `Dominar`
consome a flag para não haver espera. Medido: 59% das situações elegíveis, com
o passe a sair 0.23 s depois em vez de 3 s.

#### Lateral

`ThrowInModel.apoioQuantos` de 3 para 2: a três, meia equipa convergia para a
mesma linha lateral.

### Sessão de 26 de Agosto de 2026 (continuação 6) — a bola parada que ninguém ia buscar

Testes novos: `passe_morto_bola_parada`, `sim_amostragem`. Suite: **52 ficheiros**.

TODOS os jogos de um lote congelavam. A bola ficava parada a poucos metros da
linha de fundo (`bolaVel: 0`, `portador: null`), 22 jogadores no bloco,
`Match.state === 'PLAY'`, e ninguém ia lá. Medido: um jogo de 5400 s morto aos
375 s, com `MOVE_TO_POS` a durar 5066 s seguidos.

Quem decide se alguém vai à bola é o `deveMandarChaser` (`bt/team_bt.js`), e a
primeira pergunta é se a bola está solta:

```js
const bolaSolta = !Match.ballCarrier && !alguemAConduzir() && !Match.intendedReceiver;
```

O `intendedReceiver` é escrito quando o passe sai e limpo quando alguém toca na
bola. Para o passe que passa AO LADO do destinatário havia uma expiração no
`updateBall`, e era aí que estava o furo:

```js
if (alvo && this.ballVel.lengthSq() > 0.5) { ... }
```

**A expiração exigia que a bola estivesse em movimento.** Se ela parava longe do
destinatário, a condição nunca mais corria — porque era ela que poria a bola a
mexer outra vez:

```
bola pára longe -> intendedReceiver nunca limpo -> bolaSolta = false
  -> deveMandarChaser não manda ninguém -> ninguém toca na bola
  -> a bola continua parada
```

Um deadlock que se alimenta a si próprio. Os outros sítios que limpam o
`intendedReceiver` são todos no CONTACTO (`resolveBallContact`), na bola parada
(`setupSetPiece`) ou no `resetPlay` — nenhum serve a uma bola imóvel e não
tocada em `PLAY`. E o teste de "afasta-se dele?" não quer dizer nada a
velocidade zero: o produto escalar dá 0, que não é afastar nem aproximar.

**O bug era antigo, mas a taxa de disparo é nova.** O lote anterior à
`continuação 4` não tinha um único encrave; depois passaram a ser 6 em 6 jogos.
A ligação está no `pctNinguemTocou` da faixa dos 25 m+, que subiu de 9% para
13% com o corte duro da linha de passe: são exactamente os passes que morrem sem
ninguém tocar, ou seja mais oportunidades de cair no deadlock.

O fix vive no `passeMorreuParaODestinatario` (`js/utils.js`), puro, com três
casos por esta ordem: **perto** (dentro do `passePerdidoDist` é dele, mesmo
parada — o passe que morre aos pés do receptor é um passe bem sucedido);
**parada e longe** (bola solta); **a mexer e longe** (perdida só se se afastar,
o caso de sempre). O teste da paragem mede as TRÊS componentes da velocidade:
um passe alto no topo do arco tem velocidade horizontal quase nula e muito `y`,
e chamar-lhe parada tirava o dono a uma bola ainda a caminho.

#### Velocidade 10× no painel

`main.js` → `animate()`. **Passos partidos, e não um passo grande:**
`Match.update(dt * 10)` não é o mesmo jogo dez vezes mais depressa — a 10× o
passo seria ~0,15 s (7 Hz), a bola andaria 1,5 m entre frames, atravessaria a
rede (testada por bandas de 0,22 m), passaria ao lado dos contactos e os
temporizadores da FSM saltariam gestos inteiros. Corre-se N passos do tamanho
normal por frame, com `PASSO_MAX = (1/60) * GAME_SPEED * 1.5` — abaixo disso é
um passo só, portanto o 0.7x/1.0x/1.2x de sempre não mudou nada. A `guarda` de
40 passos evita a espiral do frame lento.

Tecla `4`, ou o botão no painel esquerdo. O botão de toque continua a ciclar só
`[0.7, 1.0, 1.2]`; a partir de 10× cai em 0.7x, que é comportamento são.

### Sessão de 26 de Agosto de 2026 (continuação 5) — o lote mais rápido

Teste novo: `sim_amostragem`. Suite: **51 ficheiros**.

`Sim.run({ rapido: true })`: amostra o `registarHeatmap` e o `registarDesvios`
de 6 em 6 frames (10 Hz a dt=1/60) e sobe o `passosPorLote` para 2000. Num lote
de 5 × 90 min a telemetria corria 1,62 M vezes para 22 jogadores — ~36 M
chamadas de cada registador, todas para desenhar médias que 10 Hz descrevem
igual.

**O que NÃO é amostrável, e é a parte que interessa não esquecer:**
`registarPermanencia` e `registarEstilos` fazem detecção de FLANCO — o primeiro
abre e fecha episódios quando o estado da FSM muda, o segundo conta activações
na transição de `styleAtivo`. O `PASS` dura 0,07 s de média e o `DRIBBLE`
0,02 s, ou seja **menos do que um intervalo de amostragem**: medi-los a 10 Hz
não os mediria com menos resolução, apagava-os. Ficam a 60 Hz. A
`vigiarEncrave` também, por outra razão — mede a distância percorrida desde a
última leitura, e saltar frames dava-lhe saltos acima do `raio` de 1,5 m, com o
cronómetro de bola parada a reiniciar sozinho.

Dois detalhes que o teste fixa porque se partem sem dar por isso:

- O `frames` do relatório de desvios continua a querer dizer FRAMES
  (`st.n * amostragem`), com o número de leituras a aparecer à parte em
  `amostras`. Publicar `st.n` cru dividia o número por seis sem nada a dizê-lo.
  Médias e RMS não levam correcção — são razões, e o factor cancela-se.
- O contador da amostragem é `passosFeitos + i` e não `i`: com o índice do lote,
  o primeiro frame **de cada lote** era sempre medido, e com lotes de 2000 e
  amostragem 6 dá 1002 leituras em vez de 1000, com o frame a seguir a cada
  cedência ao browser sobre-representado.

`rapido` e `amostragem` vão para os `parametros` do relatório: mudam o que os
números querem dizer, e dois lotes com amostragens diferentes não se comparam
sem isso escrito.

**Por medir**: o ganho real. A estimativa é modesta — a telemetria é barata por
chamada, e o custo grande por frame é o `animateBones` dos 22 jogadores, que
corre na mesma sem renderer. Esse **não** é seguro desligar em bloco: o gameplay
lê posições de ossos no mundo (as mãos em `player.js`, para o GR agarrar e
lançar, e o pé em `fsm.js`). O maior ganho disponível continua a ser resolver o
encrave — 73% do último lote foram jogos congelados a pagar AI e animação para
nada.

### Sessão de 26 de Agosto de 2026 (continuação 4) — o passe jogado para dentro de alguém

Teste novo: `passe_por_linha_tapada`. Suite: **50 ficheiros**.

O lote de 20 jogos deu isto, e é o número que manda nesta sessão:

| faixa | n | certo | cortado | domínio falhado | ninguém tocou |
|---|---|---|---|---|---|
| 0-8 m | 308 | 86 % | 13 % | 1 % | 0 % |
| 8-15 m | 1162 | 65 % | 30 % | 3 % | 2 % |
| 15-25 m | 1703 | 46 % | 40 % | 9 % | 5 % |
| 25 m+ | 827 | 25 % | **53 %** | 13 % | 9 % |

O passe não estava forte demais — as velocidades de chegada (6,8 / 7,4 / 8,7 /
10,1 m/s) estão todas abaixo do `BallControl.easySpeed`, e o domínio falhado
nunca passa dos 13%. **Estava a ser jogado para dentro de alguém.**

#### Duas camadas a escolher o receptor, e só uma olhava para a linha

- O `findPassTarget` (`js/player.js`) mede o corredor de ameaça
  (`PassLineModel`), descarta com `continue` quem tem alguém em cima da recta
  (`bloqueioDuro`) e pesa a qualidade da linha no resto da nota.
- O `PassTypes.escolher` (`js/pass_types.js`) é **quem decide de facto**, e a
  nota dele tinha três termos: progresso, espaço, distância. Nenhum era a
  linha. O alvo que a primeira camada escolheu — com a linha medida — entra ali
  apenas como sugestão e vale um `bonusSugerido` de 0,5.

Medido antes do fix, num cenário com o portador a `z = −20`:

| companheiro | distância | folga da linha | leque | nota |
|---|---|---|---|---|
| lateral a 12 m | 12,2 m | 14,80 m | 11 pontos | 0,039 (+0,5 de sugerido = 0,539) |
| 30 m à frente | 30,0 m | **0,00 m** | **0 pontos** | **0,767 — ganha** |

O companheiro com um adversário exactamente em cima da linha de passe e com o
leque de candidatos **completamente vazio** — o próprio sistema a dizer que ali
não há passe nenhum — ganhava nos três tipos de passe sorteados.

O leque vazio ainda piorava as coisas. Sem pontos, o `pontoPara` cai no
`pontoLiderancaCurta`, que valida o raio à volta do ponto mas **não a linha até
lá**: o veredicto "não há passe" transformava-se num ponto de mira 4 m à frente
do companheiro tapado, com o progresso máximo que a nota premeia.

#### O que mudou

- **Quarto termo na nota** (`js/pass_types.js`, `notaCandidato` e
  `qualidadeDaLinha`): a folga da linha até ao **ponto de mira** — e não até ao
  companheiro, porque num passe para o espaço a bola vai ao ponto e é esse o
  caminho que alguém corta. A geometria é a do `findPassTarget`, deliberadamente
  a mesma: corredor que cresce com a distância, `bloqueioDuro` como piso, e o
  `factorUltimoTerco` a perdoar a linha apertada perto da baliza. As duas
  camadas deixaram de julgar a mesma linha por réguas diferentes.
- **Peso `linha: 1.10`** (`js/config.js`, `PassTypeModel.escolha`), com e sem
  pressão. Tem de bater o progresso (peso 1.0) sozinho, senão a distância
  continua a pagar a linha fechada.
- **Corte duro, e não mais um peso**: com folga abaixo do `bloqueioDuro` o
  candidato é descartado com `continue`, como o `findPassTarget` já fazia. Uma
  nota baixa continua a competir e ganha por não haver melhor — era assim que a
  bola ia parar ao adversário quando não havia mais ninguém livre. Sem candidato
  nenhum, o `escolher` devolve `null` e o `actPass` desce a cascata (atrasar a
  alguém perto, conduzir), que é a jogada certa quando não há linha.
- **`notaMinima` de 0,35 para 1,45**, que é `0.35 + 1.10`. O termo novo mudou a
  escala das notas (0,65 → 1,75 num passe típico) e com o limiar antigo bastava
  ter linha para qualquer passe valer a pena — a cascata deixava de disparar.
  Somar exactamente o peso da linha deixa a exigência **igual à de antes** para
  uma linha completamente limpa, e só obriga a linha suja a pagar a diferença em
  progresso. É a alteração mínima: não se aproveitou o fix para reafinar quanto
  se passa.

`tests/passe_por_linha_tapada.test.js` fixa os cinco casos: o peso a decidir
entre linha apertada e limpa, a linha limpa a não ser penalizada, o corte duro a
devolver `null`, o último terço a ser perdoado, e o limiar acompanhar a escala
(um passe lateral sem progresso nenhum não passa só por ter a linha livre).

**Por medir**: o efeito no lote. O `pctCortado` das faixas de 15 m+ é a métrica,
e o `notaMinima` é o botão a rever se o jogo passar a circular de menos.

### Sessão de 26 de Agosto de 2026 — a fase manda

Testes novos: `marcacao_e_bloco_por_fase`, `marcacao_por_setor`, 
`saida_de_jogo_para_defesa`, `passe_no_vazio_alcancavel`, `giro_de_costas`, 
`passe_em_voo_nao_e_bola_solta`, `esperar_pelo_slot`, `saida_gk_pelos_laterais`, 
`lateral_batedor_e_apoios`, `velocidade_de_conducao`, `forca_do_passe`, 
`etiqueta_do_arbitro`, `sinal_do_arbitro`, `intercecao_bola_alta`. Suite: **49 ficheiros**.

### Sessão de 26 de Agosto de 2026 (continuação 3) — interceptar bolas altas erradas

O que se via: um lançamento ou passe alto a passar por cima do destinatário
ia em direcção ao adversário e ninguém reagia — ficavam a ver a bola cair. Num
jogo real, um defesa (ou um colega por trás do receptor) volta de costas e
cabeceia a bola antes que ela toque no relvado.

- **Percepção de cabeceio** (`js/perception.js`): `computeInterception` procura
  primeiro o ponto onde a bola DESCE pela altura da testa (`ALTURA_TESTA` ±
  `HeaderModel.janelaContacto`) e só depois recua para o ponto jogável normal.
  Antes a bola alta só era interceptável quando chegasse ao topo da cabeça,
  o que punha o ponto de encontro demasiado longe para quem tinha de voltar.
- **Colega pode ajudar** (`js/bt/team_bt.js`): `pickIntercetor` deixou de
  devolver `null` automaticamente quando o destinatário é da própria equipa.
  Num lançamento alto errado, um companheiro melhor posicionado pode agora
  cabecear a bola; passes normais continuam a não sofrer interferência porque
  `escolherIntercetor` só escolhe quem bate o tempo do destinatário por
  `PerceptionModel.margemMelhor`.
- **Receptor mira a testa** (`js/bt/player_bt.js`): `actReceivePass` passou a
  usar `ALTURA_BASE_Y + ALTURA_TESTA` em vez de `ALTURA_CABECA` no
  `preverBolaEmAltura`, alinhando o ponto de encontro com a janela de contacto
  do cabeceio.
- **Teste novo**: `tests/intercecao_bola_alta.test.js` verifica que uma bola
  alta a passar por cima de um defesa é interceptável, que bolas rasteiras
  continuam a ser interceptáveis e que bolas impossíveis são ignoradas. A
  suite completa passa (49/49).

### Sessão de 26 de Agosto de 2026 (continuação 3) — interceptar bolas altas erradas

Teste novo: `intercecao_bola_alta`. Suite: **49 ficheiros**.

### Sessão de 26 de Agosto de 2026 (continuação 2) — lançamento com a mão do guarda-redes

O guarda-redes já tinha um clip de lançamento com as mãos (`GoalkeeperThrowClip`) e
um estado `lancando`, mas nunca eram usados: a saída curta passava por
`actPassParaAlvo`, que fazia o passe sair do pé, e o relançamento automático do
estado `segurando` disparava sempre o chutão.

- **Animação overhand** (`js/config.js`, `GoalkeeperThrowClip`): 12 keyframes
  repostos a partir da referência de um lançamento com a mão direita — armação,
  aceleração por cima da cabeça, contacto com o braço esticado para a frente/cima e
  follow-through. O braço esquerdo contrabalança o movimento.
- **Bola segue a mão** (`js/player.js`): `colarBolaAMao` cola a bola ao punho do
  braço de lançamento durante a fase de preparação; no contacto é largada com a
  balística do passe normal via `releaseFromHands`.
- **Saída curta com as mãos** (`js/player.js`, `js/bt/player_bt.js`): no estado
  `segurando`, o BT escolhe o lateral de saída e guarda-o em `gkThrowTarget`; quando
  chega a hora de relançar, se `gkSaida === 'laterais'` e houver alvo, o GR passa
  para `lancando` e dispara o clip `gkThrow`; senão cai no chutão (`gkPunt`).
- **BT não interfere nas mãos** (`js/bt/player_bt.js`): `tratarGuardaRedes` retorna
  imediatamente quando `p.gkEstado === 'segurando'`, sem chamar `actPassParaAlvo` ou
  `puntBall`, que fariam a bola sair do pé ou fora do timing do segurando.
- **Testes ajustados**: `tests/giro_de_costas.test.js` (raio 5 → 7 m) e
  `tests/sinal_do_arbitro.test.js` (mock com ambos os braços e verificação do braço
  que efectivamente sinaliza, evitando caso limite de `atan2` em π). A suite completa
  passa (48/48).

### Sessão de 26 de Agosto de 2026 (continuação) — passes pelo alto, árbitro e faltas

Ajustes finos em vários sistemas, todos motivados por comportamentos que se liam 
mal no ecrã.

- **Goleiro com bola no pé** (`js/config.js`, `GoalkeeperPose.segurar`): mãos 
  mais próximas da bola (`bracoX −0.76`, `cotovelo −1.82`).
- **Zagueiros não conduzem tanto** (`js/bt/player_bt.js`): clamp do tempo de 
  decisão defensivo — com pressão ou marcador perto, passam em vez de carregar.
- **Braço do árbitro** (`js/officials.js`): escolhe o braço do lado do ataque 
  (direito ou esquerdo) e fica horizontal (`−π/2`) para faltas livres.
- **Fechamento do bloco** (`js/bt/team_bt.js`): lateral oposto e não-lateral 
  oposto fechavam demasiado quando a bola estava do outro lado.
- **Laterais mais baixos** (`js/config.js`, `ThrowInModel`): elevação mínima 
  `16°`, máxima `26°`.
- **LM/RM não encostam ao centro** (`js/playing_styles.js`): `roaming_flank` 
  mantém largura mínima.
- **Passes fáceis erravam menos** (`js/config.js`, `js/utils.js`, `js/fsm.js`): 
  `PassErrorModel` afinado, pressão reduzida em passes curtos, e `distPasse` 
  passado ao `sigmaDePasse`.
- **Giro de 180° com marcador** (`js/config.js`, `js/bt/player_bt.js`): o cone 
  de giro livre passou de 5 m para 7 m, e a restrição de não girar com marcador 
  nas costas subiu de 3,5 m para 5 m.
- **Falta só com disputa de bola** (`js/officials.js`): `detectarContactos` 
  agora exige que a bola esteja a menos de `3.5 m` do contacto; choques longe 
  do lance não dão falta.
- **Passes pelo alto** (`js/fsm.js`, `js/utils.js`): o recuo fixo de 1,5 m foi 
  adaptado ao movimento do receptor, e `alvoDePasse` passou a usar uma estimativa 
  de velocidade de bola por distância em vez do 16,8 m/s fixo.

#### O fio comum da sessão, e vale a pena lê-lo antes das secções: **quase todos os
defeitos eram uma decisão com dois donos, ou um número que tapava outro.**

- A marcação existia na árvore do jogador com a guarda de fase certa, e na
  camada posicional sem guarda nenhuma.
- O passe do kickoff escolhia o defesa e depois punha-o a votos outra vez.
- O tecto da marcação era o raio de PROCURA a fazer de tecto de DESLOCAÇÃO.
- A força do passe levava um ×1.20 por cima da balística — e dois
  multiplicadores mais abaixo existiam só para o cancelar em dois dos três
  caminhos.
- A condução não escrevia velocidade nenhuma e herdava a de quem tinha corrido
  antes.

Secções, pela ordem em que estão aqui:

- Os atacantes a correr atrás dos defensores (js/bt/team_bt.js)
- A saída de jogo acaba nos defesas (e agora vê-se)
- O braço do árbitro: para que lado é a falta
- A etiqueta do árbitro
- O lançamento a passar muito do alvo
- O passe forte demais: um multiplicador por cima da balística
- A condução não tinha velocidade nenhuma
- O lateral: quem cobra e quem se aproxima
- Saída do guarda-redes: o lateral bem livre manda
- Esperar pelo posto em vez de recuar contra ele
- Três a ir à bola depois de um passe
- Girar de costas: só onde perder a bola não é golo
- O tecto da marcação passou a ser o do SETOR, nas duas camadas
- O comprimento do bloco por fase (`escolherProfundidade`)
- Simulação em lote: o tecto de 50 jogos

#### Os atacantes a correr atrás dos defensores (js/bt/team_bt.js)

A árvore do jogador tinha a guarda certa desde sempre — o `podeMarcar` sai já
se `bb.isAttacking`. A camada posicional não tinha nenhuma: o `match.js` chama
`atribuirMarcacoesDaEquipa` e `PosicionamentoAI.tickFinal` para as **duas**
equipas em todos os frames, e o `aplicarMarcacaoPosicional` só olhava para o
`p.marcRef`.

Resultado: a equipa **com** a bola também recebia homem atribuído e cada
jogador era puxado até 10 m (o `biasMaxPorSetor` no terço de ataque) na
direcção do adversário mais perto do seu slot. Os avançados colavam-se aos
centrais em vez de procurarem espaço — que é exactamente o que se lia no ecrã.

A guarda entrou nos dois sítios, e não só no que desenha:

- **`aplicarMarcacaoPosicional`** devolve o alvo intacto a atacar, e também sem
  `bb` nenhum: não saber a fase e adivinhar uma é o próprio defeito.
- **`atribuirMarcacoesDaEquipa`** limpa o `marcRef` e o `marcTimer` de quem
  ataca, em vez de os deixar escritos. Não chega não usar a referência: ela é
  lida pelo `podeMarcar` e pelo `estouAMarcar` (que tira o jogador das
  intercepções). Um homem atribuído a quem está a atacar é lixo de estado, da
  mesma família do `actionState` pendurado — e voltava a agir no instante da
  troca de posse, com um alvo escolhido para uma jogada que já tinha acabado.

#### A saída de jogo acaba nos defesas (e agora vê-se)

O que se quer ver: dado o pontapé de saída, quem recebe a primeira bola toca
para um central ou lateral, e só a partir daí o jogo segue normal — a construção
desde trás.

O ramo `PasseSaidaDeBola` já existia, e a maquinaria toda com ele
(`Match.kickoffPendingPassToDef`, `encontrarDefesaParaSaida`,
`executarPasseSaidaParaDefesas`). O que estava errado era a **posição na
árvore**: vinha depois do `Dominar`, e o `Dominar` executa `actCarry` durante a
cadência inteira de decisão — até ~3 s no `CadenceModel.posseBase`. O receptor
dominava e saía a conduzir para a frente; quando o ramo do passe ganhava, já ia
no meio-campo. O próprio comentário do ramo dizia "0." e ele era o quinto.

Passou para logo a seguir ao `RecuperarControlo` — e não para antes dele: com a
bola fugida do pé não se passa a ninguém, vai-se buscá-la primeiro.

**E o passe saía para a frente à mesma.** Duas causas, ambas do lado do
DESTINO e não do momento:

- O `executarPasseSaidaParaDefesas` mandava o defesa ao `PassTypes.escolher(p,
  defTarget)`, onde ele entra apenas como **sugestão**: vale um `bonusSugerido`
  de 0,5 e concorre com todos os companheiros numa nota dominada pelo
  **progresso** para a baliza. Um passe para trás tem progresso negativo por
  definição, portanto perdia quase sempre — e o ramo da saída dava-se por
  cumprido com a bola a ir para a frente. Nasceu o `PassTypes.paraCompanheiro`,
  que é a segunda metade do `escolher` sozinha: mesmo leque, mesma mistura de
  tipos por zona, mesmo sorteio da balística, sem votação nenhuma sobre quem
  recebe.
- O `encontrarDefesaParaSaida` media linha livre, adversário mais perto e
  distância — **nenhum termo dizia atrás**. Um lateral subido ganhava ao central
  que ficou. Agora filtra-se primeiro pelos que estão atrás no referencial de
  ataque (`z * dirZ`, com meio metro de folga); só se não houver nenhum é que os
  outros voltam a concorrer, porque é melhor jogar num lateral subido do que
  deixar a bandeira expirar e não se ver saída nenhuma.

**A bandeira passou a ter prazo** (`KICKOFF_PRAZO_PASSE_DEFESA`, 6 s). Apagava-se
com o toque do adversário e com qualquer bola parada, mas faltava o caso normal
— ninguém achar defesa livre, com o `encontrarDefesaParaSaida` a devolver null
com a linha tapada. Sem prazo a bandeira ficava acesa e o toque para trás saía
muito depois, no meio de outra jogada: um passe atrasado sem razão nenhuma, pior
do que não o ter.

Teste: `tests/saida_de_jogo_para_defesa.test.js` — fixa a ordem dos três ramos
(`RecuperarControlo` < `PasseSaidaDeBola` < `Dominar`), o alvo ser um defesa que
não é o próprio, e o prazo a correr só com a bandeira acesa.

#### O braço do árbitro: para que lado é a falta

A etiqueta diz **o que** foi marcado; o braço diz **a favor de quem**.

- **Falta** — braço direito na horizontal (`elevacaoSinal = −π/2`), a apontar a
  baliza que a equipa beneficiada ataca. O sentido sai do `dirZ` de um jogador
  dela, que é onde essa informação vive.
- **Penálti** — aqui não se aponta um sentido, aponta-se um **sítio**: a marca,
  a 11 m da linha de fundo, no eixo. O braço desce para a diagonal
  (`elevacaoPenalti = −1.0`, ~57°).

Canto, lateral e pontapé de baliza **não** levam este gesto: ali o árbitro aponta
a bandeirola ou a linha, gestos com geometria própria. Melhor não ter do que ter
todos iguais e errados.

**O corpo fica virado para a bola; quem aponta é o braço.** Rodar o corpo para
o alvo punha o árbitro de costas para o lance que acabou de marcar. A direcção
passa a ser dada pela **guinada do braço em coordenadas do mundo**: a diferença
entre o ângulo para o alvo e o ângulo a que o corpo está (o `mover` já o põe a
olhar para a bola, via `olharPara`).

`rArm.rotation.order = 'YXZ'`, porque a guinada tem de ser aplicada **antes** da
elevação: na ordem por omissão (`XYZ`) a elevação roda primeiro e a guinada passa
a girar em torno de um eixo já inclinado — o braço acaba a apontar para outro
sítio qualquer. A guinada é desfeita no fim do gesto, senão a passada seguinte
desenhava-se com o braço torcido para o lado.

O gesto guarda o **alvo**, não o ângulo do corpo: o árbitro continua a mexer-se
enquanto sinaliza (o `mover` corre na mesma), e um ângulo fixo deixava o braço a
apontar para o sítio errado assim que ele desse dois passos. O `tickSinal` corre
**depois** do `mover` — é ele que escreve a pose de passada, braços incluídos, e
escrever antes era ver o gesto apagado no mesmo frame.

A convenção do braço é a do `THROW_IN_CLIP`: `rotation.x` mais negativo leva o
braço para cima; zero é o braço caído.

Teste: `tests/sinal_do_arbitro.test.js`.

#### A etiqueta do árbitro

Havia marcações a acontecer sem nada que as anunciasse: a bola muda de sítio, os
jogadores reorganizam-se, e quem está a ver tem de deduzir se aquilo foi falta,
canto ou pontapé de baliza.

A maquinaria já existia toda do lado dos jogadores (`showActionBanner` e o sprite
do banner, que nasce dentro do `model`), e o corpo do árbitro **é** um
`FootballPlayer` — só que o `criarOficial` deitava fora a instância e ficava com
o `model`. Guardá-la (`jogador`) era o que faltava.

| estado | etiqueta |
|---|---|
| `FREE_KICK` | FOUL |
| `PENALTY` | PENALTY |
| `CORNER_KICK` | CORNER |
| `GOAL_KICK` | GOAL KICK |
| `THROW_IN` | THROW-IN |

Cartões escrevem-se por cima da etiqueta do lance (YELLOW CARD / RED CARD): o
`triggerFreeKick`/`triggerPenalty` já anunciou FOUL ou PENALTY, e o cartão é a
informação mais forte das duas.

O anúncio vive no `setupSetPiece` e não em cada `trigger*`: é o único sítio por
onde **todos** os lances parados passam, incluindo os que vierem a ser escritos.
Sem árbitros na cena não faz nada e não rebenta — é chamado de dentro do
`setupSetPiece`, e uma excepção ali levava o frame inteiro atrás. Com os árbitros
escondidos pelo painel também não escreve: a arbitragem continua, o boneco é que
não está lá.

`tickEtiqueta`, no `update` do Officials, desconta o relógio e apaga. Os jogadores
fazem isso no próprio `update`, que para o árbitro nunca corre — sem isto a
primeira marcação do jogo ficava escrita por cima dele até ao fim.

**Não há OFFSIDE na tabela** porque não há impedimento marcado no jogo: o
`offsideLimitDir` do TeamBT apenas limita onde os atacantes se põem. Escrever o
rótulo sem existir a regra dava uma etiqueta que nunca aparecia — ou pior, que
aparecia a mentir.

Teste: `tests/etiqueta_do_arbitro.test.js`.

#### O lançamento a passar muito do alvo

Um lançamento é apontado a um **ponto que já está à frente de quem corre**. Se,
por cima disso, a bola ainda passa metros para lá do ponto, o companheiro nunca
a apanha — e o erro de peso (aleatório, e de propósito) soma-se a isso.

O desvio **sistemático** vinha de duas coisas somadas:

- `vChegadaLancamento` a 3,5 m/s: a bola chega **viva** ao ponto, logo continua
  a rolar depois dele;
- o reforço do passe curto dentro do `velocidadeRasteiraPara`
  (`+ (12 − dist) * 0.18`), que existe para uma bola de 3 m **aos pés** não sair
  a passo. Num lançamento não faz sentido nenhum: o alvo já é o espaço.

Medido, distância a que a bola pára depois do ponto:

| alvo | antes | agora |
|---|---|---|
| 6 m | +2,7 m | +0,8 m |
| 10 m | +1,9 m | +0,8 m |
| 15 m | +1,6 m | +0,8 m |
| 20 m | +1,0 m | +0,4 m |

O `velocidadeRasteiraPara` passou a aceitar `{ reforcoCurto: false }`, e o
caminho do lançamento usa-o. **A omissão mantém o reforço**, porque o caso comum
é mesmo o passe aos pés — está fixado no teste que a bola curta aos pés continua
a sair mais viva (11,3 contra 10,2 m/s aos 5 m).

`vChegadaLancamento` desceu de 3,5 para 2,5.

#### O passe forte demais: um multiplicador por cima da balística

A calibração do passe é feita pela velocidade de **chegada**, não pela de saída:
pede-se "quero que chegue a `PassModel.vChegadaRasteira`" e o
`velocidadeRasteiraPara` (utils.js) inverte o arrasto e o rolamento para dar a
saída. É a chegada que decide se o receptor domina — `BallControl.easySpeed`.

Depois de toda essa conta, o `executePassGameplay` fazia isto para **todos** os
passes, lançamentos e cruzamentos:

```js
forcaPasse *= 1.20;
Match.ballVel.y /= 1.20;
```

Com isso a chegada deixava de descrever o que sai. Medido: um passe de 5 m sai
a 11,3 m/s pela conta e chega a 8,8 — com o ×1.20 sai a 13,6 e chega a ~10,6,
**acima do `easySpeed` de 9,69**. O receptor falhava o primeiro toque numa bola
de cinco metros. E é essa mesma inflação que tinha obrigado a empurrar o
`easySpeed` de 7,75 para 9,69: acelerar o passe sem acelerar o controlo não faz
o jogo mais rápido, faz os receptores mais incompetentes.

O `/1.20` na vertical era pior: o passe alto era resolvido para uma elevação e
saía com outra, portanto o alcance que a conta garantia deixava de valer.

Removidos os dois. Chegadas medidas agora: 9,1 m/s aos 3 m, 8,8 aos 5, 7,9 aos
10, 6,7 aos 20 — todas abaixo do limiar de domínio.

**E o 1.20 tinha dois pares que o cancelavam.** Logo a seguir estavam estes:

```js
if (ehLancamento && (isLongo || isLateral)) { forcaPasse *= 0.85; ... }
if (ehCruzamento)                           { forcaPasse *= 0.80; ... }
```

1,20 × 0,85 = **1,02**. 1,20 × 0,80 = **0,96**. Ou seja: os dois existiam apenas
para cancelar o multiplicador global nesses dois caminhos — o passe directo era
o único que ficava mesmo 20% mais forte.

Tirar o 1.20 e deixá-los sozinhos punha lançamentos 15% fracos e cruzamentos 20%
fracos. Medido: **um lançamento de 25 m morria aos 20 m**. Era isso que se lia
como "só os passes directos estão certos" — foram os outros dois que eu parti ao
tirar metade do par. Saíram os três.

O cruzamento alto é resolvido para chegar a `PassModel.alturaCruzamento` **no
ponto do alvo** (`velocidadeParaAlturaEm`): qualquer multiplicador posterior
desfaz exactamente a conta que garante a bola à altura da cabeça.

**A manípula do ritmo continua a existir e é o `vChegadaRasteira`**: subi-lo
acelera a bola toda sem partir a relação entre saída, chegada e domínio. Se o
passe passar a ler como lento, é ali que se mexe — e o `easySpeed` acompanha.

Teste: `tests/forca_do_passe.test.js`, que fixa a invariante (sair pela conta,
chegar à velocidade pedida) integrando o rolamento a sério.

#### A condução não tinha velocidade nenhuma

O `actCarry` era isto, e só isto:

```js
function actCarry(ctx) {
    ctx.p.fsm.changeState('CARRY');
}
```

**Não escrevia `speedMult`** — o portador ficava com o da folha que tinha corrido
antes. Num jogador que acaba de ganhar a bola essa é sempre uma das rápidas:

| folha | velocidade |
|---|---|
| `actTackle` | 9,00 m/s — o próprio comentário lhe chama "velocidade máxima SEM bola" |
| `actRunIntoSpace` | 7,88 m/s (sprint a atacar o espaço) |
| `actChaseBall` | 6,53 m/s, +25% em contra-ataque |

Quem desarmava saía a conduzir a 9 m/s: mais depressa do que qualquer sprint sem
bola. O `* 0.95` do estado CARRY não chega perto de compensar.

`CarryModel.velocidadeBase: 5.0` (a SPEED 50), `velocidadePorSkill: 1.2`,
`recuoMult: 0.75`, `contraAtaqueMult: 1.25`. Dá 4,28 m/s a SPEED 20 e 5,96 a
SPEED 90 — abaixo dos 6,53 de quem persegue a bola sem ela, que é a ordem certa:
conduzir é mais lento do que correr livre, porque se leva a bola no pé.

Sem `skillSpeed` no `ctx` assume-se o médio: há chamadas à folha sem ele, e um
NaN ali congelava o jogador no sítio.

Teste: `tests/velocidade_de_conducao.test.js`.

#### O lateral: quem cobra e quem se aproxima

**Quem cobra.** Era o jogador de campo mais **perto** do ponto da linha, e num
lateral no próprio meio-campo isso dá quase sempre o **central** — o homem que
menos devia estar a pôr a bola em jogo fica com ela nas mãos, e a linha
defensiva abre ao meio enquanto ele lá vai.

`escolherBatedorDoLateral` (match.js) + `ThrowInModel.ordemBatedor`: lateral do
lado, médio da ala, CM. O lado sai do sinal do x da bola, a mesma convenção das
formações (LB em +x, RB em −x). Duas saídas de emergência, ambas deliberadas:

- candidato da ordem além de `distanciaMaxBatedor` (25 m) — passa-se ao seguinte,
  senão o lance ficava parado à espera de quem vem de 45 m;
- nenhum dos três em campo (expulsões, formações sem médios de ala) — cobra o
  mais perto, como antes. Um batedor imperfeito é melhor do que nenhum.

**Quem se aproxima.** O nível 2 fica ligado no `THROW_IN` e a mola de coesão puxa
o bloco inteiro para a bola: um lance que precisa de duas ou três opções curtas
acabava com seis pessoas em cima umas das outras, todas cobertas pelo mesmo
adversário.

`ThrowInModel.distanciaMinimaPorPos` + `distanciaMinimaNoLateral`, aplicados no
`tickFinal` **depois** da mola — é ela que causa a aproximação, e desfazê-la antes
era vê-la voltar no mesmo frame:

| posição | distância mínima à bola |
|---|---|
| CB / DC | 18 m (na prática, mantém a posição) |
| CM / DM | 12 m |
| médio da ala, outro lateral | sem restrição |

O médio da ala fica dentro do `alcanceMin` do lance de propósito: é ele uma das
opções curtas, e pô-lo longe trocava "toda a gente em cima" por "ninguém a quem
jogar". O batedor está fora da regra — o lugar dele é escrito à mão no
`setupSetPiece`.

Teste: `tests/lateral_batedor_e_apoios.test.js`.

#### Saída do guarda-redes: o lateral bem livre manda

Os laterais já eram candidatos à saída curta, mas concorriam com os centrais numa
nota que é `folga + bonusLateral` (3 m). O bónus **inclina, não impõe**: com um
central muito desmarcado e um lateral com folga confortável ganhava o central, e
a bola saía pelo **meio** — a zona onde a perda custa golo, e o oposto de sair a
jogar.

`GoalkeeperDistribution.folgaPreferencialLateral: 10.0` — a partir de 10 m de
folga o lateral é a saída, sem nota nenhuma pelo meio. Entre dois laterais acima
do limiar, o mais livre. Abaixo dele nada muda: volta a valer a nota de sempre.

O número tem de ficar acima da `folgaMinima` (4 m), senão qualquer lateral
elegível ganhava sempre e a saída pelos centrais deixava de existir — está
fixado no teste.

Teste: `tests/saida_gk_pelos_laterais.test.js`.

#### Esperar pelo posto em vez de recuar contra ele

O que se via: um jogador sai da posição para participar na jogada e fica mais
adiantado do que o seu posto. A jogada progride, o posto avança — mas ainda não
passou por cima dele. Ele inverte o sentido para o ir buscar, a inércia leva-o
2-3 m longe de mais, e quando o passe sai o apoio que devia estar ali vem a meio
caminho no sentido errado. **A jogada morre por falta de um apoio que existia e
estava a fazer marcha atrás.**

Ninguém lhe dizia que o alvo vinha a caminho: o `tickFinal` escreve um ponto e o
`steerArrive` persegue-o, sem olhar se esse ponto se está a **aproximar**.

`esperarPeloSlot` + `EsperaPeloSlotModel` (config.js), geometria pura: posição
dele, posto de agora, posto do frame anterior, `dt`. A aproximação mede-se ao
longo da recta jogador→posto, e não em z — um posto que chega pelo lado conta
como um que chega pela frente.

- `distanciaMax: 8.0` — mais longe do que isto vai-se ao encontro do posto, senão
  ficava parado fora da jogada.
- `velocidadeMin: 0.5` — piso de aproximação. Sem ele o ruído do
  `PositionSmoothing` passava por aproximação e o jogador ficava colado ao chão a
  jogada inteira.

O posto do frame anterior guarda-se em `p.slotAnterior` porque o alvo é
recalculado do zero em cada frame e não tem velocidade em lado nenhum.

**Fora da regra** quem tem tarefa com a bola — portador, chaser, intercetor,
destinatário. Esses não estão a ocupar posição, e a folha da árvore reescreve o
`dynamicTarget` logo a seguir; deixá-los esperar era travar quem vai à bola. O
`tacticalTarget` (o anel do debug) não congela, para a espera se ver ao olhar.

**A inércia em si continua por tratar**, e é o passo seguinte:
`this.velocity.lerp(desired, 5*dt)` em [player.js:2386](js/player.js#L2386) é um
filtro de 0,2 s **igual em todas as direcções** — travar e acelerar custam o
mesmo, o que nenhum corpo humano faz. Isto aqui evita a inversão; não a torna
mais rápida quando ela é mesmo precisa.

Teste: `tests/esperar_pelo_slot.test.js`.

#### Três a ir à bola depois de um passe

A conta, com um passe no ar:

| quem | porquê |
|---|---|
| destinatário | o `pickChaser` dá-lhe o lugar de chaser da equipa que passou |
| chaser da equipa que defende | corre para onde a bola **está** |
| intercetor da equipa que defende | corre para onde a bola **vai** |

Três a convergir na mesma bola, e **dois do mesmo lado a fazer o mesmo
trabalho**. A causa é a primeira linha do `deveMandarChaser`:

```js
if (o.bolaSolta) return true;   // antes da fase, da metade do campo e do raio
if (o.isAttacking) return false;
```

Assim que o passe sai, `Match.ballCarrier` fica null e a bola contava como
solta — e bola solta persegue-se sempre, sem condição nenhuma.

**Uma bola no ar com destinatário conhecido não está solta: está endereçada.**
O `bolaSolta` do `pickChaser` passou a exigir também `!Match.intendedReceiver`.
Das duas figuras, quem fica é o **intercetor**: tem a conta do tempo de voo e o
ponto de encontro. O chaser apontava à posição actual da bola, um ponto que já
se moveu quando ele lá chega — e volta às guardas normais de distância, metade
do campo e pressão, arrancando quando a bola aterra e volta a ter dono.

A atribuição do chaser ao destinatário **subiu para antes do
`deveMandarChaser`**: com a bola já não-solta e a equipa em posse, aquele
devolve `false`, e o destinatário ficava sem ninguém a ir buscar o passe que
vinha para ele. Ir buscar o passe da própria equipa não é uma decisão de bloco.

O `intendedReceiver` é limpo no `updateBall` quando o passe morre, portanto uma
bola realmente perdida volta a ser disputada no frame seguinte — está fixado no
teste.

Teste: `tests/passe_em_voo_nao_e_bola_solta.test.js`.

#### Girar de costas: só onde perder a bola não é golo

O que se via: o jogador domina de costas para o ataque e roda 180 graus para
cima do adversário que o marca por trás. No próprio meio-campo essa bola perdida
deixa o atacante isolado com o guarda-redes — não é uma perda de bola qualquer.

A causa é o cone de condução do estado `CARRY` ser centrado em `p.dirZ`, a
direcção de **ataque**, e nunca na direcção para onde o corpo está virado. Quem
recebe de costas aponta logo para a frente — isto é, gira os 180 — e o cone não
sabe nada de quem está lá.

A regra, no `GiroDeCostasModel` e no `eixoDeConducao` (config.js):

- **No último terço gira à vontade** (`zonaLivre: 17.0`, no referencial de
  ataque). A primeira versão abria a excepção já a partir da linha de meio-campo,
  mas no meio-campo adversário perder a bola **ainda dói**: o contra-ataque sai
  com a equipa toda subida e as costas da defesa à vista. É o mesmo número do
  `CarryModel.zonaLivre` e do `conduzirSoAcimaDe` — a mesma ideia de "último
  terço", sem inventar uma segunda fronteira; o teste compara os dois e falha se
  divergirem.
- **Aquém disso** só gira com o cone de saída limpo: **5 m**, **45°** para cada
  lado da direcção oposta àquela de onde a bola vem — por onde ele quer sair.
- **Cone ocupado: não gira.** Sai em toques de **30°** para o lado livre, e o
  lado escolhe-se pela folga real a cada uma das duas hipóteses, não por
  preferência.

O `eixoDeConducao` é puro — recebe números e devolve um vector unitário, sem
tocar em `Match` nem em THREE — porque é a única forma de fixar a regra num teste
sem montar um jogo à volta. O `CARRY` passou a abrir o leque em torno desse
eixo; o cone da técnica, a nota de espaço e a penalização de sector continuam
todos a funcionar sem saber que o eixo mudou.

A direcção de entrada vem do `p.dirEntradaBola`, escrito no instante do domínio
(match.js, a partir da velocidade da bola): no `CARRY` já não há velocidade
nenhuma para consultar, a bola parou no pé dele.

Teste: `tests/giro_de_costas.test.js`.

#### O tecto da marcação passou a ser o do SETOR, nas duas camadas

O `biasMaxPorSetor` (def/mid/atk × low/balanced/high) já existia e já era
respeitado pela camada posicional, mas a folha `marcar` da árvore passava o
`MarkingModel.raioSetor` (12 m) como tecto de desvio. São duas coisas
diferentes coladas no mesmo número: o raio é de **procura** — a que distância
do slot ainda se considera um homem — e não de **deslocação**.

Quem marcava saía até 12 m do posto que o TeamBT lhe tinha dado, em qualquer
terço, incluindo dentro da própria defesa. Em campo lia-se como a marcação a
mandar mais do que o bloco.

A folha passou a usar o mesmo `biasMaxPara` da camada posicional, com a zona
tirada do SLOT (`base.z * p.dirZ`) e não da posição do homem — senão os dois
passos davam tectos diferentes ao mesmo jogador no mesmo frame.

Valores novos (a coluna Balanced é a pedida: 7 / 5 / 3):

| setor | low | balanced | high |
|---|---|---|---|
| atk | 5.0 | **7.0** | 9.0 |
| mid | 3.5 | **5.0** | 6.5 |
| def | 2.0 | **3.0** | 4.0 |

O pêndulo já bateu nas duas pontas — tectos apertados de mais davam "não há
marcação nenhuma", o tecto aos 12 m dava a marcação a comer o bloco. Fechar na
própria defesa e folgar no ataque é a resposta: o custo de largar a forma não é
o mesmo nos dois sítios. Nenhum grau chega ao `raioSetor`, senão o marcador
acabava tão longe do slot que já nem tinha direito ao homem que foi marcar.

O `MarkingModel.alcanceMarcacao` (25 m) **nunca foi lido por ninguém** — era a
rédea do tecto aberto que entretanto desapareceu. O comentário passou a dizê-lo
em vez de descrever uma regra que não existe.

#### O comprimento do bloco por fase (`escolherProfundidade`)

O rectângulo de quem defendia tinha os mesmos 50 m do de quem atacava. A fase
entrava no **centro** do bloco (o ±5 do `targetOffsetZ`) mas nunca no
**comprimento**: não havia caminho nenhum no código que levasse a `short` por
ser fase defensiva — só a Mentalidade lá chegava, e essa é uma escolha para o
jogo todo, não uma resposta ao momento.

A escolha saiu do `computeBlock` para função própria, com a ordem escrita:

    1. A FASE       a defender é sempre `short` (30 m), e nada por cima disso
    2. A MENTALIDADE T.Defensiva e Defensiva impõem `short` também a atacar
    3. O PAINEL     Length Compactness, para o resto

**O painel deixa de mandar no comprimento a defender, e isso é de propósito:**
o Length Compactness passa a ser o bloco COM bola, e o `<label>` no painel
passou a dizê-lo. A largura fica de fora, como sempre esteve — fechar em
largura entrega as alas e continua a ser escolha de quem joga.

O `tests/linha_defensiva.test.js` passou a injectar a função nova no seu
sandbox, para correr a regra a sério em vez de uma cópia dela.

#### Simulação em lote: o tecto de 50 jogos

O `Sim.run({ jogos: N })` pela consola nunca teve tecto; o limite estava só no
painel, em dois sítios que tinham de concordar — o `max` do `<input>` e o
`clamp` do `lerParametrosDoLote`, que cortava em silêncio. Passaram os dois
para 100.

O aviso de tempo real por baixo das caixas continua a sair de
`SIM_SEG_REAIS_POR_SEG_SIMULADO = 0.025`, medido há muito (150 s simulados em
3,8 s reais) e **por confirmar**: a árvore de comportamento e a mola de coesão
engordaram o tick desde então. Vale a pena cronometrar um lote pequeno e
reescrever a constante antes de confiar na estimativa de um lote grande.

### Sessão de 25 de Agosto de 2026 (noite) — a árvore de decisão

Testes novos: `tests/passa_antes_de_conduzir.test.js`, `tests/arvore_sem_bola.test.js`,
`tests/btstats_ramos.test.js`, `tests/actionstate_pendurado.test.js`.
Suite: 35 ficheiros.

#### `BTStats` — que ramo da árvore é que decide (js/bt/core.js)

**A ferramenta que faltava, e que se pagou no lote em que não existia.** Uma
alteração ao ramo `ConduzirEmEspaco`, feita para reduzir as conduções, não mudou
nada: 7 309 conduções passaram a 6 930, dentro do ruído. Custou um lote inteiro
descobrir que a condução **nem vinha desse ramo** — há pelo menos três `actCarry`
na árvore (`atacarOEspaco`, o `proteger` do `Dominar`, e o fallback final sem
condição nenhuma).

Deduzir qual ramo decide a partir da ORDEM da árvore não funciona: catorze ramos
com condições que se cruzam, e o que ganha depende do estado do jogo.

Cada execução de uma `Action` é uma decisão tomada. Contam-se **duas** coisas,
porque respondem a perguntas diferentes:

    frames    quanto TEMPO aquela folha mandou. Uma condução de 3 s conta 180.
    entradas  quantas VEZES a decisão foi tomada de novo. A mesma conta 1.

É a mesma lição da tabela `permanencia`: o total de frames não distingue mil
decisões curtas de uma decisão longa, e as duas pedem correcções opostas. A
tabela sai ordenada por **entradas** — uma condução longa não pode encabeçá-la só
por ter durado.

- **As entradas são por JOGADOR** (o último ramo fica guardado nele). Um contador
  global não distinguiria onze jogadores a alternar entre dois ramos de uma
  pessoa a mudar onze vezes.
- **Desligado por omissão.** Só o lote o liga, e desliga-o no fim: no jogo normal
  seriam 22 jogadores × 60 fps a escrever num objecto que ninguém lê.
- Sai no JSON do lote, campo `ramos`.

#### O QUE A TABELA `ramos` RESPONDEU (e desmentiu)

Primeiro lote com o `BTStats` ligado, 20 jogos. **Duas hipóteses minhas caíram
de uma vez:**

```
proteger            7 179 entradas   <- Dominar -> actCarry
correrParaBola      2 657            <- RecuperarControlo -> actCarry
atacarOEspaco          51            <- ConduzirEmEspaco -> actCarry
conduzir          (ausente)          <- o fallback NUNCA corre
```

- **O `conduzir` não aparece na tabela.** O fallback final da árvore, que eu
  suspeitava ser a fonte da condução, **nunca é alcançado**.
- **O `ConduzirEmEspaco` tem 51 entradas em 20 jogos.** Foi o ramo que passei
  meia sessão a travar (`conduzirSoAcimaDe`). Praticamente não existe.

**A CONDUÇÃO VEM TODA DO `Dominar` → `act('proteger', actCarry)`**, que está
acima de tudo na árvore, logo a seguir ao `RecuperarControlo`.

Somando os quatro ramos de passe:

| ramo | entradas |
|---|---|
| `executarPasseDefesa` | 2 200 |
| `executarPasse` | 1 406 |
| `passarLadoOuTras` | 1 095 |
| `passarAosDefesas` | 26 |
| **total de passes** | **4 727** |
| **`proteger` sozinho** | **7 179** |

Um único ramo de condução decide mais vezes do que os quatro ramos de passe
juntos — e está acima de todos eles. **Nenhuma afinação de prioridade lá em
baixo podia ter efeito**, e é essa a explicação de o `conduzirSoAcimaDe` não ter
mudado nada.

**POR ATACAR:** o `proteger` tem 7 179 entradas mas apenas **0,7% do tempo** —
decide muitas vezes e dura pouco (25 ms em média). Isso cheira a condição mal
calibrada (`aindaADominar`) e não a desenho errado. É o próximo alvo, e é o que
o utilizador descreve desde o início: "dominam a bola e saem a correr".

**O `correrNoEspaco` explica-se pelo mesmo:** 26 541 entradas mas 1,3% do tempo,
0,21 s por decisão. Não é a corrida que desiste — é a árvore que lha tira no
frame seguinte.

#### O `actionState` pendurado — o encrave que parava o jogador para sempre

Sete encraves no mesmo lote, todos com a mesma assinatura:

    portador "TeamA LB"   fsm: "SET_PIECE_WAIT"   hasBall: true
    decisionTimer: ~25    Match.state: "PLAY"

Um jogador com a bola nos pés, em estado de bola parada, com o jogo a correr.

**A causa:** o `actionState` só era limpo DENTRO dos `case 'PASS'` e
`case 'SHOOT'` da FSM — os únicos que o consomem. Se alguém mudar o estado de
fora, e o `tratarBolaParada` faz exactamente isso (`changeState('SET_PIECE_WAIT')`
assim que o jogo pára), esses cases nunca mais correm e o `actionState` fica
pendurado.

O custo é total, porque a primeira linha do `PlayerAI.tick` é:

```js
if (player.actionState || s === "PASS" || ...) return;
```

**O jogador nunca mais decide nada.** Nem conduzir, nem passar, nem largar a
bola. Fica com ela até alguém lha tirar — e ninguém lha tira, porque para os
outros a bola tem dono.

A limpeza passou para o `changeState`: é o único sítio por onde TODAS as saídas
passam, incluindo as que vierem a ser escritas. Os estados que o consomem
(PASS, SHOOT, CROSS) ficam de fora, porque o `initiatePass`/`initiateShoot`
criam o ActionState ANTES de chamar o `changeState` — limpá-lo na entrada
apagava-o no mesmo instante e trocava um encrave por um remate que nunca sai.

#### O passe antes da condução (`CarryModel.conduzirSoAcimaDe`)

O que se via: "os jogadores quando dominam a bola sempre giram para a frente e
saem a correr; nunca tocam para o lado nem para trás". A causa **não eram pesos**
— era a ordem da árvore:

     8. ConduzirEmEspaco   <- conduz se houver campo aberto
     9. CaminhoFechado     <- só passa com 2 adversários à frente
    10. CircularNaDefesa   <- só na defesa E sem campo aberto
    11. Driblar
    12. ProcurarPasse      <- o passe genérico era o PENÚLTIMO
    14. act('conduzir')    <- e o fallback é conduzir

Conduzir era a opção por omissão e passar a excepção. Medido: 7 309 conduções
contra 5 604 passes, quase um para um.

`conduzirSoAcimaDe: 17.0` — havendo passe bom, só se conduz a partir do último
terço. Sem passe nenhum disponível conduz-se onde quer que se esteja: o ramo
falha e a árvore segue para baixo, como antes. A fronteira é a mesma do
`zonaLivre` do orçamento de condução, não uma segunda inventada para a mesma
ideia.

**MEDIDO NO LOTE SEGUINTE: NÃO FUNCIONOU.** O rácio ficou em 1,33 (era 1,30). Foi
esta falha que motivou o `BTStats` — a condução vem de outro ramo, e é preciso
saber qual antes de voltar a mexer.

A escolha de passe é reaproveitada pelo `ProcurarPasse` no MESMO frame (o
`findBestPassAnywhere` percorre todos os companheiros e todas as linhas), mas
**morre no fim do frame**: o `ctx` sobrevive entre frames e uma escolha obsoleta
faria o passe sair para onde o companheiro ESTAVA.

#### A decisão sem bola, dividida por fase

A lista era de onze ramos com as duas fases INTERCALADAS. `CorrerNoEspaco`
aparecia ABAIXO de `Marcar` sem que isso quisesse dizer nada — são de momentos
diferentes do jogo e nunca competem.

Não produzia decisões erradas (cada folha tem a sua guarda), mas tornava
impossível responder a "o que é importante quando temos a bola?" sem abrir as
onze condições, e obrigava quem acrescentasse um ramo a adivinhar a posição numa
lista onde metade dos vizinhos era da outra fase.

```
DecisaoSemBola
├─ Desarme, Intercetar, IrABola, Receber, GuardaRedes   <- ramos de BOLA
├─ SemBolaDefendendo   (!isAttacking)  → Marcar
├─ EsperarNaArea       (canto)
├─ SemBolaAtacando     (isAttacking)   → ApoioDeCirculacao, CorrerNoEspaco, AtacarArea
└─ ocuparPosicao       (fallback)
```

- **Os cinco ramos de bola ficam FORA das duas fases**, e não por preguiça: valem
  mesmo nas duas. Uma bola solta persegue-se com posse nominal ou sem ela, e o
  guarda-redes posiciona-se sempre. Metê-los dentro de uma fase tirava-os da
  outra em silêncio.
- **A ordem das folhas é exactamente a de antes.** Reagrupar não pode alterar uma
  única decisão, e a única forma de o garantir é comparar a sequência — o teste
  tem as 11 folhas escritas e falha se alguma mudar de sítio.

#### Onde a calibração está (20 jogos × 1080 s, sem normalização)

| Estatística | Medido | Alvo | |
|---|---|---|---|
| **Faltas** | **21,8** | 20 (pedido) | conseguido, `escala: 4.3` |
| Cartões | 3,15 | 5,22 | perto |
| **Golos** | **0,95** | 2,52 | **caiu de 1,9 — regressão** |
| Finalizações | 12,5 | 26,1 | metade |
| Escanteios | ~0,15 | 9,92 | por resolver |
| **Pontapés de baliza** | **0** | ~8 | o furo mais antigo |

**Os golos caíram para metade com os mesmos remates** — a eficácia baixou. O
suspeito é a mola de coesão: puxar toda a gente para a bola enche a área de
defensores. Consistente com o `INTERCEPT` a triplicar (966 → 3 136 episódios) e
com o `SET_PIECE_WAIT` a triplicar também (2 154 → 8 706).

**Os encraves melhoraram muito mas não acabaram.** O `decisionTimer` do portador
caiu de 662 s para 25–33 s (a guarda `comBola` funcionou), mas dois jogos em vinte
ainda congelam. O padrão é sempre o mesmo, e aponta para o lixo de estado
identificado no início da sessão e classificado então como inócuo — não era:

    portador TeamA CM   hasBall: true   decisionTimer: 25-33   dist 0.61
    setPieceTimer: 3    setPieceTaker: "TeamA CB"
    fsm: SET_PIECE_WAIT | IDLE | MOVE_TO_POS   com Match.state === 'PLAY'

### Sessão de 25 de Agosto de 2026 (tarde) — a escala do lote, encraves, coesão

Testes novos: `tests/permanencia_estado.test.js`, `tests/lateral_giro_corpo.test.js`,
`tests/recuo_gr_e_bola_presa.test.js`, `tests/pressao_e_bloco.test.js`,
`tests/peito_pingpong.test.js`, `tests/painel_sombras.test.js`,
`tests/cantos_campo.test.js`, `tests/portador_decide.test.js`,
`tests/mola_coesao.test.js`. Suite: 31 ficheiros.

#### O ERRO QUE INVALIDAVA TODA A CALIBRAÇÃO ANTERIOR

**Os números "por 90 min" das secções abaixo estavam 4,5× inflacionados**, e a
conclusão que deles saía tinha o sinal trocado.

O lote corre `duracaoSeg / dt` passos de FÍSICA, mas o relógio do jogo avança
`dt * MatchDuration.timeScale` por passo. Com `gameSecondsPerRealSecond: 4.5`,
os "15 minutos" do painel eram 900 s de física — **67,5 minutos de relógio**, e
não 15. A normalização ×6 que estava escrita multiplicava um número que já vinha
4,5× maior.

Com a escala corrigida, o jogo tinha **menos** golos e remates do que o real, e
não mais. Os "122 remates, 5,6× o alvo" nunca existiram.

**A CONTA CERTA, e a maneira de não voltar a errar:** um jogo completo de 90
minutos são `90*60 / timeScale` segundos de física. Com `GAME_SPEED = 0.9` o
`timeScale` é 5,0, logo **1 080 s** — que é o que se põe no painel para os
números saírem já por 90 minutos, sem normalização nenhuma. Se o `GAME_SPEED`
mudar, este número muda com ele.

O rótulo do painel também mente: diz minutos de relógio de jogo e são minutos de
física.

#### Onde a calibração estava a meio da tarde (superada — ver a secção da noite)

| Estatística | Medido | Alvo real | |
|---|---|---|---|
| Golos | 1,9 | 2,52 | perto |
| Finalizações | 12,3 | 26,1 | metade |
| Faltas | 4,9 | 27,6 | escala posta a 4.3 no fim da sessão |
| Cartões | ~1,0 | 5,22 | sobe com as faltas |
| Escanteios | 0,2 | 9,92 | por resolver |
| **Pontapés de baliza** | **0** | ~8 | **o furo mais antigo** |

`pontapesBaliza: 0` em todos os registos de todos os lotes: a bola não sai pela
linha de fundo. É a mesma causa dos escanteios a zero, e continua por explicar.

#### `permanencia` — a medição que faltava no relatório do lote

O contador de frames por estado (`desvios`) diz o tempo TOTAL e não distingue
dois casos opostos: mil entradas curtas ou uma entrada presa. Foi essa
ambiguidade que travou o diagnóstico do `CHEST_CONTROL` durante três lotes.

`registarPermanencia` (js/simulate.js) mede cada EPISÓDIO contínuo: quantos
houve, duração média, duração máxima e quem. É a primeira tabela a olhar quando
alguma coisa encrava.

- **O guarda-redes fica de fora**, e não por desinteresse: a FSM dele só corre
  com a bola nas mãos (ver `updateGK`), o resto do tempo o `currentState` fica
  congelado. Medido junto com os outros dava um episódio de 900 s em
  `MOVE_TO_POS` que tapava sempre o maior episódio verdadeiro.

#### Ping-pong da matada no peito (o encrave que matava jogos inteiros)

Dois jogadores devolviam a bola ao peito um do outro indefinidamente. O retrato
do vigia: **bola parada NO AR a 1,35 m** — o próprio `peitoYMax` — com velocidade
zero, entre dois jogadores a 1,2 m dela.

O `colarBolaAoPeito` prende a bola e zera-lhe a velocidade; ao largar, ela sai a
`peitoVelYBoa`, que à TEC dos jogadores reais é **−0,19 m/s**: cai tão devagar
que leva 84 ms a sair da faixa `peitoYMin`..`peitoYMax`, e o jogador ao lado
apanha-a antes disso. Enquanto o gesto dura, o BT trata os dois como ocupados —
ninguém vai à bola.

O anti ping-pong aéreo já existia para a CABEÇA (`HeaderModel.maxHeadersSeguidos`)
e **não contava peitos**. Agora `BallControl.maxPeitosSeguidos: 2` fecha a
sequência.

- **O contador tem de zerar quando a bola toca o relvado**, no mesmo sítio onde o
  dos cabeceios zera. Sem isso esgotava-se uma vez e a matada no peito
  desaparecia do resto do jogo — pior do que o encrave, e silencioso.
- Resultado: 10 552 episódios num lote passaram a **68**.

**Erro de diagnóstico a registar:** esta hipótese foi descartada um lote antes
por se olhar ao SINAL do `vy` (era negativo, logo "a bola cai") em vez do VALOR.
O que importava era a velocidade, não o sinal.

#### O portador que não decidia — 662 segundos com a bola nos pés

Um central com a bola, parado em `MOVE_TO_POS`, com o `decisionTimer` em **662
segundos** e o jogo inteiro parado à volta dele.

A causa está na ordem das árvores em `PlayerAI.tick` (js/bt/player_bt.js):

```
1. PlayingStyleBT  ->  if (res === SUCCESS) return;
2. PositionBT      ->  if (res === SUCCESS) return;
3. PlayerBT        <-  é aqui que vive o ramo ComBola
```

As duas primeiras cortavam a terceira. O estilo do CB é o `extra_frontman`, que o
relatório de calibração marca `semEfeito: true` — **activa 1067 vezes e não
desloca nada**. Activava, devolvia `SUCCESS`, e a decisão com bola nunca
acontecia.

**Quem tem a bola chega agora sempre ao `PlayerBT`.** As outras duas continuam a
correr — escrevem alvos e são a identidade do jogador — mas deixam de poder
IMPEDIR a decisão. O problema não era aquele estilo: é qualquer folha destas
árvores poder engolir a decisão do portador, e o número de folhas só cresce.

#### Mola de coesão à bola (js/utils.js → `molaParaABola`)

Reabilita, com um propósito só, o que o `relaxConstraints` fazia antes de ser
apagado. **As molas de coesão, a `separarAlvos` e a malha de Delaunay estão
apagadas** — ver o comentário no `match.js`; o `team_bt.js` diz que compactar e
segurar a linha "vão ser refeitos sobre triangulação de Delaunay", que é um plano
por executar e não código a correr.

O que se via no ecrã: um central com a bola junto à linha de fundo adversária e os
companheiros a CORREREM PARA LONGE. Não fugiam da bola — iam para o slot no
bloco, porque a coesão à FORMA era o único laço que restava. E o apoio de
circulação não os apanha: `SupportModel.circulacao.desvioMax` (8 m) corta quem
está longe do próprio slot, por desenho ("não arranca ninguém do outro lado do
campo").

A mola puxa o alvo na direcção da bola, só o EXCESSO acima de `distMin`, com tecto
em `puxaoMax`. Medido: a 40 m aproxima 5,6 m; uma linha de quatro defesas comprime
de 40 m para 35,2 m mantendo a ordem dos jogadores.

- **O `puxaoMax` é o que separa uma mola de um íman.** Sem tecto os onze acabam em
  cima da bola e a formação deixa de existir — é a primeira coisa que o teste
  trava, e a razão provável de as molas antigas terem sido apagadas.
- **Corre entre a inércia pós-passe e o corte de fora-de-jogo.** Depois disso, a
  mola podia empurrar alguém para posição irregular ou para fora das linhas, e
  nenhum dos dois cortes voltava a falar.
- A defender puxa metade (`forcaSemBola`): já há o bloco a seguir a bola e a
  marcação a puxar cada um ao seu homem.

#### Pressão defensiva: o fim do rush, e o seu preço

O `deveMandarChaser` decidia só ONDE se perseguia (que metade do campo) e nunca SE
valia a pena — com a bola do lado certo mandava-se um caçador em todos os frames,
sem condição de distância. Era o "rush" constante.

`MarkingModel.raioDeAccionamento` (low 9 m, balanced 15 m, high sem limite),
medido do jogador mais próximo ao PORTADOR e não à bola — são coisas diferentes
enquanto ele a conduz.

- **`tercoDeEmergencia`:** no próprio terço defensivo persegue-se sempre, seja
  qual for a pressão. Sem esta excepção trocava-se um defeito por outro pior — o
  portador entrava na área a conduzir sem ninguém lhe sair ao caminho.
- **O raio não passa à frente da bola solta.** Uma bola sem dono continua a ser
  perseguida a qualquer distância; era esse o encrave de 25 s que o
  `chaser_bola_solta.test.js` fixa, e teria sido fácil reintroduzi-lo.
- **O PREÇO: as faltas caíram de ~28 para 4,9 por jogo.** Menos perseguição são
  menos duelos. `RefereeModel.faltas.escala` passou de 1.0 para **4.3** para as
  repor nas 20 pedidas — é esse o botão, e escala as duas fontes sem mudar a
  proporção entre elas.

#### Conduzir não é a bola estar solta (o CF a pressionar o campo todo)

Com pressão BALANCEADA e mentalidade EQUILIBRADA, o avançado adversário
perseguia o central o campo inteiro — as duas opções que dizem exactamente o
contrário.

A fuga era o `bolaSolta` do `pickChaser`: `!Match.ballCarrier` sozinho. **O
toque da condução larga a bola de propósito** — `ballCarrier = null` por ~0,3 s
a cada toque (ver o `case CARRY` na fsm.js) — e com `bolaSolta` o
`deveMandarChaser` devolve `true` INCONDICIONALMENTE, sem metade do campo e sem
raio. Como conduzir é uma sequência de toques, a porta reabria a cada um deles e
a perseguição era permanente.

`alguemAConduzir()` percorre **os dois planteis** — o condutor é tipicamente do
outro lado, e é esse o caso que interessa. A graça de condução é o campo que diz
"esta bola tem dono"; contá-la aqui é o que faz a equipa sem bola voltar ao
bloco em vez de correr atrás dela.

**O que não mudou:** uma bola realmente perdida, com ninguém a conduzir,
continua a ser perseguida a qualquer distância — é o encrave de 25 s que o
`chaser_bola_solta.test.js` fixa.

#### O passador corria atrás da própria bola

Assimetria entre duas eleições que deviam concordar: o `pickIntercetor` tinha a
guarda do passe em curso e o `pickChaser` não. No instante em que o passe sai,
`Match.ballCarrier` fica null — a bola conta como solta — e o passador é, por
construção, quem está mais perto dela. Agora, com passe em curso, o chaser é o
DESTINATÁRIO. Serve também a condução, onde o toque à frente põe
`intendedReceiver` no próprio condutor.

#### Corrida ao espaço: estava desligada

```js
function podeCorrerNoEspaco(ctx) { return false; }
```

Toda a maquinaria existia e afinada (`escolherDestinoDeCorrida`, o estado
`RUN_INTO_SPACE`, o `RunIntoSpaceModel`, o arrefecimento) e ligada à árvore. Só a
porta estava fechada. Religada, mais duas correcções sem as quais não dava o
efeito pedido:

- **os laterais estavam barrados** — a versão original excluía `role === 'def'`
  inteiro. Passam LB e RB; os centrais continuam de fora;
- **quem passa não podia arrancar, por construção:** a condição exigia
  `Match.ballCarrier`, e durante o voo do passe não há portador nenhum — que é
  exactamente o instante em que o passador tem de partir. `referenciaDaBola()` é o
  portador OU o destinatário do passe em curso, usada pela condição E pelo destino
  (numa só, a corrida morria entre as duas).

Ao passar, o `runCooldown` do passador é zerado: é o "toca e segue".

**Por resolver:** o `RUN_INTO_SPACE` aborta em 0,41 s de média, contra os 4,0 s de
`duracao` do modelo. Arranca e desiste quase logo.

#### Regras novas

- **Recuo para o guarda-redes** (`maosProibidasNoRecuo`, js/utils.js). Um passe
  deliberado e COM O PÉ de um companheiro não pode ser agarrado com as mãos. A
  distinção já estava no código sem ninguém a usar: `executePassGameplay` é o
  caminho do pé — a cabeçada e o peito têm caminhos próprios. A guarda vive DENTRO
  do `grabBall` e não em quem chama, porque são cinco os sítios que agarram. O
  ramo `apanhar` do `updateGK` ganhou saída para `idle`: sem ela ficava a tentar
  agarrar frame após frame com a bola parada aos pés.
- **Bola pousada em cima da baliza** (`destravarBolaEmCimaDaBaliza`, js/match.js).
  O pano de cima da rede devolve a bola com `v.y = -v.y * restituicao` e ela
  ressalta cada vez menos até ficar lá pousada; a detecção de bola fora exige que
  `|z| - raio` PASSE a linha de fundo, e uma bola assente no travessão está
  praticamente em cima dela. Empurra-se o `z` para a detecção existente decidir
  entre canto e pontapé de baliza. **Só com a bola lenta** — uma bola a voar por
  cima do travessão não pode ser interrompida a meio.
- **Falta no ataque com gente na área** (`FreeKickModel.slotsArea`/`slotsMarcacao`).
  O setup punha o batedor e a barreira, e os outros nove ficavam onde estavam:
  cruzava-se para uma área vazia. Mesmo desenho do canto, com cinco e não nove —
  numa falta a bola tanto pode sair em cruzamento como em remate directo. Os
  marcadores são os defensores que SOBRAM da barreira, que é obrigação.
  `zonaDeArea` é medido do MEIO-CAMPO (como o `barreiraZonaZ`), não da linha de
  fundo.

#### Lançamento lateral

- **O corpo vira para onde atira** (`giroDoCorpoNoLateral`, js/utils.js). O `case
  LATERAL` chamava `lookAtBola` para o ponto (0, z) em TODOS os frames; só a
  cintura acompanhava, com tecto em `giroMax` (32°). Agora a cintura torce até ao
  tecto e o corpo dá só o que sobra — num lançamento a 150° são 118°. Dentro do
  alcance da cintura o corpo não roda nada, portanto os lançamentos curtos ficam
  idênticos.
- **Alcance por STRENGTH** (`alcanceMaximoDoLateral`). Era `alcanceMax * (1 ±
  25%)`, que dava 22,5 m ao mais forte. Agora os extremos estão escritos:
  `alcanceMaxFraco: 12` (STRENGTH 0) e `alcanceMaxForte: 20` (STRENGTH 100).
- **Os companheiros aproximam-se** (`alvoDeApoioNoLateral` + `aproximarNoLateral`).
  Ficavam nos slots do bloco, a vinte e tal metros. Os `apoioQuantos` (3) mais
  próximos são puxados para a faixa 5–10 m. Movem-se AO LONGO da linha que já os
  liga ao batedor, não para slots fixos: assim cada um continua no seu corredor e
  só a distância muda. Escrito no nível 3, porque o nível 2 reescreve o
  `dynamicTarget` todos os frames.

#### Árbitros

- **O tremor ao parar.** O passo de um frame é `min(d, velMax*amp*dt)`, portanto
  perto do alvo o passo é o próprio `d` e a velocidade que alimenta a animação é
  `d/dt` — a 1/60, seis centímetros dão 3,6 m/s. O movimento parava em `d <= 0.05`
  e o ciclo de passada ligava em `vel > 0.1`: a velocidade saltava entre 0 e
  vários m/s sem nada pelo meio.
- **E os solavancos que a primeira correcção trouxe.** A zona morta esteve em
  0.25/0.60 m e o alvo de um assistente NÃO está parado — corre ao longo da linha
  atrás da bola. Com 60 cm de folga o boneco esperava, acumulava distância e
  disparava para a recuperar. A margem é estreita e está medida no teste:

  | paragemMax / arranqueMin | Tremor | Solavanco |
  |---|---|---|
  | 0,25 / 0,60 | não | 3,0 m/s |
  | 0,10 / 0,18 | não | 3,0 m/s |
  | **0,06 / 0,10** | **não** | **não** |
  | 0,04 / 0,07 | sim | não |

  Quem resolve o tremor não é a zona morta: é o `suavizacaoVel`, que filtra a
  velocidade vista pela ANIMAÇÃO. A zona morta só evita micro-passos.
- **Discos na câmara táctica** (`Officials.criarDisco`). Preto com duas linhas
  amarelas, `R` e `A`, do mesmo raio dos jogadores — de cima, um disco mais
  pequeno lê-se como estando mais longe. `atualizarVista` corre todos os frames: o
  `cameraMode` é uma global que qualquer botão muda sem avisar ninguém.

#### Campo, público e apresentação

- **Quartos de círculo e bandeirinhas nos cantos** (`CornerFlag`, `arcoDeCanto`).
  O `RingGeometry` é desenhado no plano XY e deitado com `rotation.x = -PI/2`, o
  que INVERTE o z: um `thetaStart` errado desenha o quarto virado para fora do
  campo. A conta saiu para `utils.js` e o teste verifica-a gerando os pontos do
  arco e confirmando que caem dentro das linhas — não comparando com uma tabela.
- **Sombras a sério.** Das 24 peças do corpo só a BACIA tinha `castShadow`: a
  sombra era uma manchinha do tamanho da anca. Agora projectam as peças
  estruturais (tronco, cabeça, braços, coxas, canelas, chuteiras); as decorativas
  ficam de fora porque estão dentro de uma peça que já projecta. Nitidez de 6,4
  para **14,6 texels/m** (`mapSize` 1024→2048, `d` 80→70), com o `bias` reduzido e
  `normalBias` acrescentado — com o dobro dos texels o valor antigo descolava a
  sombra dos pés.
- **Botão Sombras ON/OFF** no painel da direita. `shadowMap.enabled = false` NÃO
  chega: o Three deixa de actualizar o mapa mas não o limpa, e as sombras ficam
  CONGELADAS no relvado. É preciso tirar o `castShadow` à LUZ e marcar os
  materiais da cena para recompilar.
- **Torcidas invertidas** e **10% da bancada a saltar sempre**
  (`CrowdModel.fraccaoSaltoSempre`). Os ultras saem do mesmo limiar por adepto,
  passado por um `fract(x * 7.3)` — descorrelacionar é o ponto: sem isso seriam
  exactamente os de limiar mais baixo, isto é, os primeiros a levantar-se, e
  ficavam amontoados numa zona só. Custa um uniform, nenhum attribute.
  **A bancada quase não reagia porque a bola passa 1,7% do tempo no terço
  ofensivo** — o gatilho quase nunca ocorre. Não era afinação do `CrowdModel`.
- **Bauhaus 93 nos números da camisola** (`CamisolaTipografia`). Sem `bold`: a
  fonte já é pesada e pedir negro a quem não o tem faz o browser sintetizá-lo.
- **Furadas de remate instrumentadas** (`remates.furados`). Quem AUTORIZA o remate
  aceita a graça de condução (`temBola`), quem o EXECUTA exige a bola no pé — e
  entre a decisão e o contacto passam 0,318 s. Medido: **3,7% dos remates**,
  portanto raro e realista; a incoerência fica registada mas não compensa mexer.

### Sessão de 25 de Agosto de 2026 — faltas e cartões, editor de animação, som

Specs em [docs/superpowers/specs/2026-08-25-faltas-e-cartoes-design.md](superpowers/specs/2026-08-25-faltas-e-cartoes-design.md) e [docs/superpowers/specs/2026-08-25-editor-de-animacao-design.md](superpowers/specs/2026-08-25-editor-de-animacao-design.md). Testes: `tests/faltas_cartoes.test.js`, `tests/pose_partilhada.test.js`, `tests/anim_editor_export.test.js`.

#### Faltas, cartões e expulsão (peça 1 de 5 do caminho para o teste de calibração)

O objectivo final é um teste que compare a simulação com as médias reais de um jogo (2,52 golos, 26,11 finalizações, 27,63 faltas, 5,22 cartões, 3,20 impedimentos, xG…). **Sete dos dez indicadores não existiam no código**, portanto instrumenta-se primeiro. As cinco peças: faltas e cartões (feita), impedimento marcado, ataques totais/perigosos, xG, e só então o teste.

- **O `triggerFreeKick` e o `triggerPenalty` já existiam mas só o BOTÃO do painel os chamava.** Não havia detecção de falta nenhuma, e num lote de simulação as faltas eram sempre zero. Agora há duas fontes, ambas em `js/officials.js` (é onde o árbitro já vivia): o **duelo perdido** — um desarme ou carrinho falhado, desfecho que o `fsm.js` já conhecia e que não custava nada a quem errava — e o **contacto** com velocidade relativa alta, com arrefecimento por par para o mesmo choque não marcar falta atrás de falta.
- **A calibração das duas fontes é ACOPLADA** (somam para a mesma média), por isso existe a `RefereeModel.faltas.escala`, que multiplica ambas e deixa mexer no TOTAL sem mudar a proporção entre elas.
- **A primeira calibração falhou por um erro de raciocínio, não de afinação:** dava ~58 faltas, ~34 amarelos e **~12,6 vermelhos** por 90 minutos, contra 27,63 / 5,22 / 0,08. A causa foi tratar o **carrinho por trás como caso excepcional quando ele é o caso COMUM** — o `fsm.js` garante que um carrinho por trás nunca rouba a bola, logo falha sempre, logo vira falta sempre. Com o peso do ângulo a somar, saíam **vermelhos directos a eito** (uma equipa fez 0 amarelos e 3 vermelhos num jogo, o que só pode ser vermelho directo). Recalibrado: com o carrinho a deslizar aos 9 m/s do `SlideTackleModel`, por trás sozinho dá 0.83 (nada), por trás a travar ataque 1.08 (amarelo), e só a 11.7 m/s chega a vermelho directo.
- **O teste era cúmplice do erro:** usava um "pior lance" a 7 m/s inventado, que passava enquanto o jogo falhava. Passou a ler a velocidade real do carrinho e a **exigir que o caso comum NÃO dê cartão**.
- **O segundo amarelo tem um problema aritmético que muda o desenho.** Com 5,22 cartões repartidos por 22 jogadores, a probabilidade de ALGUM apanhar dois amarelos é ~46% por jogo (problema do aniversário), quando o número real é 8%. A solução não é uma constante: **quem tem amarelo passa a jogar com medo** (`Officials.podeFazerCarrinho`, lido pelo `player_bt.js`) e deixa de fazer carrinhos. É isso que faz o vermelho ser **emergente** em vez de sorteado.
- **Marcação e força pesam no cartão**: `MARKING` desce a gravidade (quem marca bem entra com o tempo certo e leva mais bola do que perna), `STRENGTH` sobe-a. Entram normalizadas a partir de 50, portanto um jogador mediano dá exactamente o mesmo resultado e as contas do cabeçalho continuam válidas. A skill alivia mas **não absolve**: um carrinho brutal de um bom marcador continua a dar cartão.
- **A expulsão tira o jogador da lista e devolve-o ao MESMO índice.** O `aplicarCoberturaNoJogo` (js/simulate.js) indexa `Match.players[idx]` por posição na lista: com dez jogadores atribuía o estilo ao jogador errado **sem se queixar**. O lote repõe os expulsos antes de indexar.
- **`trocasMarcacao` instrumentado**: estava declarado e exportado desde sempre mas ninguém o incrementava — o zero nos relatórios era ausência de instrumentação, não um resultado.

#### `js/pose.js` (ficheiro novo) — o corpo e as poses, sem o jogo

Extraído do `player.js` para o editor de animação poder desenhar sem carregar a partida. **A razão é a fidelidade:** se o editor tivesse a sua própria leitura dos ângulos, afinava-se uma pose ali e no jogo ficava outra — uma ferramenta que mente é pior do que não ter ferramenta.

- `construirCorpo(camisa, calcao, aparencia)` (era `buildBody`), as cinco `aplicarPose*` dos clips, `aplicarPosePassada` e os cinco amostradores de clip. O `player.js` delega e fica só com o que uma pose não pode saber: a altura do corpo, as mãos a fecharem-se na bola, a bola a seguir as mãos.
- **O tiro de meta não era extraível como os outros:** é todo escrito através de um `bl(de, para)`, a mistura corrida→chute. A mistura passou a ARGUMENTO (`poseAnterior`, `peso`) — o jogo continua a misturar, o editor chama a mesma função sem ter corrida de onde vir. Extrair só a pose "limpa" daria um gesto que o jogo nunca faz.
- **Duas vezes seguidas os testes existentes ficaram verdes sem provarem nada:** nenhum deles chegava a chamar o `buildBody`, e nenhum corria as poses dos clips. O `tests/pose_partilhada.test.js` cobre agora as 15 juntas, as 14 ligações da hierarquia, a escala (a mesma do `crowd.js`), e aplica **os 58 keyframes dos cinco clips** verificando que nenhum canal fica `NaN` — o modo de falha silencioso: um canal em falta dá `undefined`, `undefined` numa rotação dá `NaN`, e o boneco desaparece do ecrã sem ninguém se queixar.

#### `animEditor.html` + `js/animEditor.js` (novos) — o editor de animação

Página separada, com o boneco, linha do tempo dos keyframes e um slider por canal. Carrega só `three`, `config.js`, `utils.js` e `pose.js` — nada de `match.js`, `player.js`, BTs ou FSM.

- **A legenda do sinal por baixo de cada slider** (`coxaChute > 0 perna para TRÁS`): é a parte que responde a "não percebo os radianos". Sai da documentação que já estava nos cabeçalhos dos clips.
- **Fantasma** com três modos: `original` (como está no ficheiro — o que mudei?), `anterior` (o keyframe antes deste — de onde vem?, mostra se a progressão salta) e `off`. Em `anterior` a interpolação é saltada de propósito: o que interessa é a diferença entre as duas poses.
- **Aba da passada.** Andar, trotar e correr **não são clips** — são fórmulas com senos (`getGaitPose`) alimentadas pelo `GaitModel`, portanto o painel é de CONSTANTES e o boneco anda em ciclo contínuo. O ciclo avança com a **distância** e não com o tempo (`velocidade / passada` ciclos por segundo, a conta do jogo): só com o tempo, mexer na `passada` não mudava nada no ecrã. O painel mostra o andamento correspondente à velocidade escolhida, porque o `misturarAndamento` interpola entre os três.
- **Gizmo**: clicar num membro selecciona a junta e abre os anéis de rotação (`TransformControls` do r128). **Só rotação** nas juntas — arrastar a posição de um joelho estica o osso, e os clips só guardam ângulos, portanto perder-se-ia ao exportar. A bacia leva translação porque essa o clip guarda (`altura`). O **mapa junta→canal** é a peça crítica (o mesmo osso tem nomes diferentes por gesto: `coxaChute` no remate, `coxaFrente`/`coxaTras` no lateral) e tem teste: as 65 juntas mapeadas nos cinco clips apontam todas a canais que existem. Junta sem canal não é seleccionável.
- **Undo** por instantâneos do clip, botão e `Ctrl+Z`. Um instantâneo por ARRASTO e não por evento: um slider emite dezenas de `input`.
- **Pés e cabeça** ganharam canais (`peLx/peLy/peRx/peRy`, `cabecaX/cabecaY`), **opcionais**: os pés estavam fixos em ±π/16 e a cabeça nunca era tocada. Um keyframe sem eles comporta-se como antes, portanto nenhuma animação existente mudou.
- **O exportador reescreve os NÚMEROS dentro do texto do `config.js`**, mantendo comentários e formatação. Os clips têm um cabeçalho com as fases do gesto e um comentário por keyframe: um exportador de JSON destruía isso ao colar. É função pura, com teste sobre o config real — 36 comentários preservados nos cinco clips, 13 no `GaitModel`, saída que faz parse, e **`null` em vez de uma versão a fingir** quando não consegue.

#### ~~Onde a calibração está~~ — TABELA INVÁLIDA, ver a sessão da tarde

> **NÃO USAR ESTES NÚMEROS.** A normalização ×6 está errada por 4,5×: os "15
> minutos" do painel são 900 s de FÍSICA, que a `MatchDuration.timeScale`
> converte em 67,5 minutos de relógio. Com a escala certa o jogo tinha MENOS
> golos e remates do que o real, e não mais — a conclusão desta tabela tem o
> sinal trocado. Fica aqui só como registo do erro. Os números medidos estão em
> "Onde a calibração está mesmo", na sessão da tarde.

| Estatística | Por 90 min (ERRADO, ×4,5) | Alvo real | |
|---|---|---|---|
| Faltas | 27,3 | 27,6 | no sítio |
| Cartões | 4,5 | 5,22 | perto |
| **Gols** | **14,1** | 2,52 | 5,6× a mais |
| **Finalizações** | **122** | 26,1 | 4,7× a mais |
| **Escanteios** | **0,9** | 9,92 | 11× a menos |
| Penáltis | 0,6 | ~0,27 | 2,2× a mais |
| Impedimentos | — | 3,2 | não existem |

~~A normalização ×6 é optimista mas a ordem de grandeza aguenta.~~ Não
aguentava: estava 4,5× acima.

**O que sobreviveu desta análise**, e continua verdadeiro com a escala certa: os
escanteios quase a zero e os `pontapesBaliza` a zero são o mesmo problema — a
bola não sai pela linha de fundo. O que caiu foi a explicação: não é que haja
remates a mais, é que a bola passa 1,7% do tempo no terço ofensivo.

**Mandante e visitante não existem**: as duas equipas são simétricas, mesmo
código e mesmas skills. O 1,20 contra 1,15 medido é ruído, não vantagem
caseira.

#### O vigia de jogo encravado, e o que ele apanhou

Num lote de 5 jogos, um passou ~33 minutos com a bola parada: 47 passes contra
~200 dos outros, 61 km percorridos contra 160 km. O relatório dava o SINTOMA e
não o momento — as três explicações óbvias (timeout do `FREE_KICK`, do
`PENALTY`, excepção a abortar o lote) foram todas descartadas por leitura.

Em vez de adivinhar, instrumentou-se: o `criarVigia`/`vigiarEncrave`
(js/simulate.js) regista UMA vez por jogo o retrato de uma bola imóvel durante
25 s — estado do Match, portador, posse, `setPieceTimer`, batedor, quantos em
campo, e o que a FSM de cada um dos 22 está a fazer. Sai no relatório em
`encraves`.

**No lote seguinte apanhou quatro casos, e o padrão era imediato**: bola
encostada às linhas, sem portador, e nem um único jogador a perseguir.

- **A causa: duas guardas do `pickChaser` que desligavam AS DUAS EQUIPAS.**
  Bola SOLTA no terço ofensivo do TeamA, posse nominal do TeamB: o TeamB não
  perseguia porque "está a atacar" — mas não tinha portador nenhum, a bola
  estava parada no chão; e o TeamA não perseguia porque a bola estava no seu
  campo de ataque, e sem pressão alta não se avança para lá. Cada guarda é
  sensata sozinha; juntas deixavam a bola no chão.
- **Com a bola solta, nenhuma das duas se aplica** — bola sem dono, vai-se
  buscar, esteja onde estiver. As guardas continuam a valer com portador, que é
  o caso para que foram escritas. A decisão saiu para `deveMandarChaser`,
  função pura, com `tests/chaser_bola_solta.test.js` — que **varre o campo
  inteiro** a verificar que não há um único ponto onde nenhuma das duas equipas
  queira ir à bola.
- **Bug encontrado pelo caminho** (introduzido nesta sessão): o desvio do
  jogador advertido mandava-o para `actTackle`, que lê
  `Match.ballCarrier.model.position` SEM guarda — mas essa folha também corre
  com a bola solta. Uma excepção ali rebenta o BT a meio e leva o frame atrás.
- **Por explicar**: o quarto encrave tinha portador em `IDLE` com a bola no
  meio-campo. É outro problema.

#### `tacticknow` — a leitura de jogo (peça 2, em curso)

Skill nova nos `player_skills`, 50-100: quanto o jogador ocupa MESMO a posição
que o plano colectivo lhe pede. **É a única skill que descreve a cabeça do
jogador** — as outras oito são corpo e técnica.

Serve o impedimento sem o inventar: em vez de uma probabilidade à sorte, o
fora-de-jogo passa a ser consequência de quem o jogador é. Médios e centrais
leem melhor (~85 de média), avançados jogam no instinto (~78) e são os que mais
caem em fora-de-jogo.

**Dois erros que não davam mensagem nenhuma, e foram apanhados a tempo:**

- O gerador consome uma sequência com semente, portanto acrescentar uma chamada
  por jogador **deslocava tudo o que vinha a seguir** — mudavam 201 das 286
  skills já geradas, e o `RB Blue` passava de `speed 85` para `72`. Isso
  invalidaria a comparação com todos os relatórios anteriores. O `tacticknow`
  tem gerador com semente própria e as outras oito ficam byte a byte iguais.
- **A chave é `tacticknow`, tudo minúsculo.** O `skillFor` do player.js faz
  `toLowerCase()` na procura: um `tacticKnow` em camelCase nunca seria
  encontrado, devolvia o valor por omissão, e o skill parecia estar a funcionar
  sem estar.

O modal de Player Skills lista os campos um a um, escritos à mão, portanto uma
skill nova nos dados não aparece sozinha — teve de se acrescentar lá
("Leitura de jogo").

**Por implementar**: o erro de posicionamento que sai deste skill (dois senos
lentos com frequências incomensuráveis, amplitude `2.5 × (100−tk)/50`, sem
efeito com a bola nos pés, em bola parada ou no GR) e a marcação do
impedimento.

#### Remate segundo a prancha de biomecânica

O `ShotClip` passou a seguir uma prancha das três fases (*toma de impulso*,
*fase principal*, *fase final*). Três coisas vieram de lá e não estavam no clip:

- o **braço contrário abre quase à horizontal** na armação (`bracoLz` 1.85 no
  frame 4, era 1.35) — é o gesto mais visível da referência, e é o que
  contrabalança a perna que vai atrás;
- na fase final o **tronco inclina para TRÁS** (`chest` negativo nos frames 10
  e 11). O clip punha-o a prumo, e o remate acabava com o corpo direito como
  quem pára de andar;
- a **inclinação lateral mantém-se até ao fim** (`leanZ` -0.14 no frame 10, era
  -0.06).

#### Camisola com nome e número

As costas já tinham o número, com a POSIÇÃO por cima. Passa a ter o nome do
jogador (`skills.nome`) e os dois ganham **contorno** — que não é enfeite: o
número é branco no TeamB e preto no TeamA, e sem uma linha da cor contrária
desaparece contra a camisola quando as duas cores se aproximam. O nome ENCOLHE
até caber nos 430 px úteis: os nomes vêm dos dados, não têm limite de
comprimento, e uma textura não avisa quando corta.

#### Simulação em lote e som

- **O botão do lote passou a ter caixas de jogos e minutos** (`index.html`, `main.js`), com aviso do que o lote cobre e do tempo real estimado, e progresso no botão enquanto corre. **São minutos do RELÓGIO DO JOGO**, não de espera. O `calibrarEstilos` liga-se sozinho a partir de **11 jogos**, que é o mínimo para cobrir os 21 playing styles: cada jogo usa uma formação e o gargalo é o LW, que só existe no 433 e tem quatro estilos à espera dele.
- **O log `Avg Match.update ms` deixou de ser permanente.** Despejava uma linha por segundo, para sempre, e enterrava tudo o resto na consola — foi por isso que o erro do shader do público demorou a aparecer. Passa a depender de `Match.profiling`, e nunca corre no lote (3,5 milhões de updates × dois `performance.now()`).
- **Som de ambiente** (`js/ambiente_sonoro.js`, `assets/SoccerStadium1.mp3`): o volume lê a MESMA fonte que a bancada (`Crowd._frac`), para o que se ouve e o que se vê dizerem a mesma coisa. Sobe depressa e desce devagar. Silenciado durante o lote.

### Sessão de 24 de Agosto de 2026 — torcida viva e bancada vermelha e branca

Spec em [docs/superpowers/specs/2026-08-24-torcida-viva-design.md](superpowers/specs/2026-08-24-torcida-viva-design.md). Testes: `tests/crowd_vida.test.js` (o `tests/crowd.test.js` continua a passar sem alteração).

- **O público deixou de ser uma fotografia** (js/crowd.js). As poses são assadas na geometria e não há rig por adepto, portanto animar do lado da CPU custava 60 000 `setMatrixAt` por frame (15 000 adeptos × 4 InstancedMesh). **Todo o movimento passou para o vertex shader.** A mesma função de construção — agora `Crowd._pecas(pose)`, antes `_pecasSentadas()` — é chamada QUATRO vezes com quatro dicionários de ângulos (`CrowdModel.poses`: `sentado`, `idle`, `dePe`, `festa`). Como são as mesmas caixas pela mesma ordem, os vértices correspondem 1:1 e servem de morph target: a geometria leva `position` (sentado) mais `aPosIdle`/`aPosDePe`/`aPosFesta` e as normais, e o shader interpola. Continua a ser **uma geometria e 4 draw calls**, e as matrizes de instância continuam `StaticDrawUsage` — nenhum frame reescreve uma.
- **A INVARIANTE: as quatro poses têm de dar exactamente o mesmo número de vértices por canal.** Se divergirem, o morph lê fora do sítio e os adeptos explodem em picos. O `Crowd.geometrias()` verifica e atira excepção; o teste cobre-o.
- **Quem está de pé sai de uma comparação no shader, não de um valor guardado por instância.** Cada adepto tem um `aLimiar` fixo em 0..1 (sorteado uma vez, com a semente que já tornava a multidão reprodutível) e levanta-se se `aLimiar < fracção` da sua claque. Mudar a bancada inteira custa **dois uniforms**, não 15 000 escritas — era isto ou não haver funcionalidade nenhuma. `aFase` e `aRitmo` dessincronizam: sem eles 7 500 pessoas saltavam ao mesmo tempo, que lê como um objecto único a pulsar.
- **Repouso, expectativa e golo são o MESMO mecanismo com três valores de fracção** (`CrowdModel.fraccaoRepouso` 0.08, `fraccaoAtaque` 0.50, `fraccaoGolo` 1.00). Não há casos especiais no shader. A fracção de repouso **não é zero de propósito**: num estádio a sério há sempre gente de pé, e a zero a bancada lia-se como uma plateia de teatro. Por cima disso corre sempre uma oscilação de repouso (morph para a pose `idle`), portanto ninguém fica alguma vez imóvel.
- **`CrowdTrigger` (js/crowd.js) — as regras, em função pura, sem Three.js lá dentro.** Golo: quem marcou vai a 1.00 com festa (braços acima da cabeça e salto), quem sofreu vai a 0 — e o golo salta a histerese, porque esperar 0.4 s para uma bancada reagir a um golo não faz sentido. Ataque: posse da equipa **e** bola no terço ofensivo dela (`tercoZ = 106/6`; o TeamA ataca para z positivo, que é o lado oposto à sua baliza). Quem defende não se levanta.
- **A histerese existe porque a bola atravessa a linha do terço para trás e para a frente numa disputa** e sem ela a bancada piscava: entrar exige 0.4 s, sair 1.5 s, e uma vez de pé fica-se 2.0 s no mínimo. O teste mede-o — 60 frames com a bola a saltar a linha dão **zero** mudanças de fracção.
- **`frustumCulled = false` nas quatro malhas.** A caixa envolvente é calculada da pose sentada e mente assim que alguém se levanta; sem isto bancadas inteiras desapareciam quando a câmara se afastava.
- **O ORÇAMENTO DE ATTRIBUTES É 16, e foi ele que fez o público desaparecer** (`Too many attributes (aRitmo)` no link do programa). A `instanceMatrix` conta **quatro** slots, não um — é uma mat4 e cada coluna ocupa o seu — e com `instanceColor`, `position` e `normal` já vão sete antes de qualquer atributo nosso. Com três poses de morph (3 posições + 3 normais) e quatro floats por instância dava 17. Agora os quatro valores por adepto vão num `vec4 aAdepto` (x limiar, y fase, z ritmo, w claque) e **a pose idle não tem normal própria** — só inclina o tronco uns graus, a normal da sentada serve. Ficam 13 de 16. O `tests/crowd_vida.test.js` conta os slots e falha se a margem acabar.
- **O GLSL injectado tem de ser ASCII PURO, comentários incluídos** — e não é preciosismo: o código-fonte de GLSL ES 1.00 é ASCII e o compilador do Windows (ANGLE) recusa qualquer byte fora disso. Os comentários em português que eu tinha posto dentro do shader (`// Oscilação de repouso…`) faziam o programa não compilar, e **o modo de falha é traiçoeiro: o resto da cena desenha-se na mesma e só as quatro malhas do público desaparecem**. Foi o que aconteceu à primeira. O `tests/crowd_vida.test.js` verifica agora cada linha do vertex shader gerado.
- **O patch do shader falha ruidosamente.** O `onBeforeCompile` procura os chunks `begin_vertex` e `beginnormal_vertex` do THREE por string; se um dia mudarem de nome a substituição falhava em silêncio e o público voltava a ser estático sem nada a dizer porquê. Agora confirma que pegou e, se não, `console.warn`.
- **`Match.updateCrowd` chama o `Crowd.update(dt)`** (js/match.js). O único uniform escrito por frame é o tempo. O resto do `updateCrowd` é o boneco simplificado antigo, desligado desde que o Crowd passou ao modelo dos jogadores.
- **As cadeiras da bancada passaram a vermelho e branco, em padrão desenhado** (`getSeatColor`, js/match.js). Sorteavam uma de quatro cores com `Math.random`, o que de longe lê como chão salpicado e não como bancada — um estádio real pinta os assentos num padrão. A cor sai agora da FILA e da COLUNA, portanto é determinística: filas 0-1, 8-9, 18-19 e 28-29 brancas (contorno do campo, duas faixas e o remate do topo), o resto vermelho, e as filas 2, 10 e 20 levam dentes brancos de 3 colunas a cada 12, deslocados por fila. Sem os dentes as faixas eram quatro linhas a direito e o conjunto lia-se como código de barras. A variação de tom por cadeira vem de um hash de (fila, coluna), não de `Math.random`.

### Sessão de 24 de Agosto de 2026 (lateral com alvo em altura, matada no peito, árbitro)

Spec em [docs/superpowers/specs/2026-08-24-lateral-e-matada-no-peito-design.md](superpowers/specs/2026-08-24-lateral-e-matada-no-peito-design.md). Testes: `tests/lateral_peito.test.js`.

- **O lateral passou a mirar os PÉS ou o PEITO do receptor** (`velocidadeDeLancamento`, js/utils.js — função nova + `lancarLateral`, js/player.js). A balística usava a fórmula de alcance `v = √(alcance·g / sin 2θ)`, que **só vale com a altura de chegada igual à de saída** — e a bola de um lateral sai das mãos, a uns 2 m do chão. A fórmula tratava esse ponto como se fosse o chão, portanto o "alcance" que devolvia era onde a bola voltaria à altura das mãos, não onde chegava ao receptor: medido, um lateral de 14 m chegava a **2.00 m** de altura (a altura de saída, exactamente), quando o peito está a 1.20 m. Agora resolve-se a parábola para um ponto `(distância, altura)`: `v² = g·D² / (2·cos²θ·(D·tanθ − Δh))`. Se o ângulo sorteado não chegar para o alvo (denominador ≤ 0), sobe-se o ângulo em 12 passos até haver solução; sem solução devolve `null` e o `lancarLateral` cai na fórmula de sempre.
- **Alvo escolhido pela distância** (`ThrowInModel.distanciaAosPes = 9.0`): curto vai aos pés (`BallPhysics.raio`), acima disso vai ao peito. **A altura do peito não tem constante própria** — é a `BallControl.peitoAltura` que a recepção já usa. Se fossem duas podiam divergir, e a bola chegaria fora da faixa `peitoYMin`/`peitoYMax` que dispara o `controlarNoPeito`: mirava-se o peito e ele dominava com o pé.
- **Erro de execução no lateral, por TEC** (`sigmaDeLateral`, js/utils.js + `ThrowInModel.sigmaMax/sigmaMin/sigmaPeso/pesoMin/pesoMax`): não havia nenhum — a direcção saía **exacta** para o alvo, e a única variação era o sorteio uniforme da elevação, que muda a trajectória e não a pontaria. Dois desvios gaussianos independentes: direcção (~7.5° a TEC 0, ~1.1° a TEC 100) e peso sobre a distância alvo (cai curta ou passa o receptor), cortado a `[0.6, 1.4]`. Reutiliza `amostraGaussiana` e `rodarNoPlano` do passe. **O `sigmaDePasse` não é chamado de propósito:** mistura PASS com TEC e aplica pressão e ângulo do corpo, e num lateral quem repõe está parado, fora do campo, virado para dentro e com os adversários obrigados a 2.5 m.
- **Matada no peito: a queda passou de binária a contínua na TEC** (`quedaNoPeito`, js/utils.js + `largarDoPeito`, js/player.js). O `venceuDuelo` sorteava bom/mau e a distância saía de duas constantes fixas — 0.5 m ou 1.5 m. A técnica só mexia na **probabilidade** do sorteio, e mesmo o caso bom largava a bola a meio metro, que não é "no pé". Agora `peitoQuedaMin: 0.35` (TEC 100, no pé) a `peitoQuedaMax: 1.6` (TEC 0), com `sigmaQueda: 0.25` de dispersão e cortes duros em `[min·0.6, max·1.3]`. A velocidade vertical de saída interpola pela mesma fracção entre `peitoVelYMa` e `peitoVelYBoa` — antes eram duas coisas descorrelacionadas e via-se a bola morrer no pé mas a repicar. **O `peitoBom` continua a ser sorteado**, mas só alimenta a animação, a `MatchStats.registarRecepcao` e o evento `CHEST_CONTROL`. `peitoQueda` e `peitoRepique` foram removidas.
- **O árbitro passou a acompanhar o jogo de cara para a bola, sem deslizar** (`mover`, js/officials.js; teste `tests/arbitro_passada.test.js`). Virava-se para onde andava, e como o alvo dele é uma projecção na diagonal do campo, passava metade do lance de costas para a jogada. Prender o corpo à bola **sem mais nada foi pior**: o ciclo de passada frontal ficou a correr por cima de uma deslocação de lado e o boneco patinava — medido, **2.85×** mais chão do que as pernas davam. Duas coisas o corrigem, e nenhuma chega sozinha:
  - **A regra dos jogadores** (`LateralGait.velViragem`, 3.6 m/s): acima dela o corpo roda para o movimento, abaixo dela fica virado para a bola e dá passo lateral. Em corrida aberta corre de frente; em ritmo de acompanhamento — a maior parte do tempo — anda de lado, de cara para o jogo.
  - **A velocidade encolhe pelo mesmo factor que a passada** (`amp`). Sem isto o passo lateral continuava a deslizar: as pernas dão passos curtos e o corpo percorria o caminho todo à mesma. Quem anda de lado anda mais devagar. A cadência passou também a dividir pela passada **já encolhida** (`P0.passada * amp`) — usar a passada inteira era metade do deslize.
  - Medida do teste: **escorregamento** = chão percorrido ÷ (ciclos × passada efectiva). 1.00 é o pé colado ao chão. Estava em 2.85 com a bola a 90°; está em 1.00.
### Sessão de 24 de Agosto de 2026 — 15 000 adeptos, saída do guarda-redes, remate na área

- **Dentro da grande área remata-se sempre** (`ShootingModel.dentroDaArea`, js/config.js + `emZonaDeRemate`, js/bt/player_bt.js; teste `tests/remate_zona.test.js`). O `shootingRange` é uma distância ao **centro da baliza**, escalada pela skill e encolhida fora do eixo pela `centralidade` — e **não cobria a área**: com a skill de ataque a 50 dá 13.0 m no eixo, e a área tem 16.5 m de profundidade; a 15 m de X sobram 10.2 m quando a baliza está a 15.5. Medido numa grelha de 20 posições dentro da área: **rematava-se em 6, ou seja 30%**. Da entrada da área nunca se rematava, nem com skill 95. É a explicação directa dos **0-6 remates por jogo** que as simulações davam.
  - Dentro da área (`profundidade: 16.5`, `meiaLargura: 20.16`) o alcance deixa de ter voto, e **o corte da camada CHUTE do SpatialGrid também não se aplica** — uma célula não autorada dentro da própria área é um buraco na grelha, não uma decisão táctica, e era mais um sítio onde o remate se perdia em silêncio. O `zoneAhead` fica de fora pela mesma razão: quem está na área do adversário está à frente no campo por definição.
  - **Fora da área nada muda** — continua a mandar o alcance por skill. O teste fixa isso: do eixo a 20 m não se remata nem com skill 95, e a fronteira da área é mesmo a fronteira (x=19.5 remata, x=21.0 não).
  - Medido depois: **25/25 posições dentro da área**, com qualquer skill (10 a 95) e qualquer função.



- **`js/crowd.js` (ficheiro novo) — 10 000 adeptos com o MODELO DOS JOGADORES, sentados** (teste `tests/crowd.test.js`). O público era o `createSpectatorGeometry`: seis caixas fundidas numa peça e **uma cor por adepto**. Agora é o mesmo corpo do `buildBody`, na pose sentada.
  - **O problema, e a solução: um InstancedMesh tem uma geometria e `setColorAt` dá UMA cor por instância — e o modelo do jogador tem quatro cores independentes** (pele, camisa, calção, cabelo). Não cabe num InstancedMesh só. A solução é **um InstancedMesh por CANAL DE COR**: fundem-se as peças de pele numa geometria, as de camisa noutra, e os quatro meshes recebem as **mesmas matrizes** por instância. As quatro peças coincidem no espaço porque partilham a matriz, e cada uma leva a sua cor. Custo: **4 draw calls** para 15 000 adeptos, geometria construída **uma vez** (972 vértices por adepto, ~43 ms para os 15 000).
  - **A pose sentada é assada na geometria.** Não há rig por adepto: monta-se um esqueleto temporário de `Object3D`, poem-se-lhe as rotações de quem está sentado, deixa-se o THREE calcular as matrizes de mundo, e cada caixa é transformada por essa matriz antes de ser fundida. A hierarquia existe só na construção. Medido: **0.59 × 1.32 × 0.59 m** (de pé seriam ~1.80 de altura e ~0.30 de profundidade) — a altura cai e a profundidade cresce porque as coxas passam a apontar para a frente, e é essa a assinatura da pose.
  - **Duas claques, uma em cada ponta, mescladas no meio** (`CrowdModel.fracaoPura: 0.35` + `Crowd.claqueEm`). A mescla é uma **transição de probabilidade** e não uma fronteira: sem ela via-se uma linha a direito a meio da bancada. Medido em cinco faixas: 100% / 98% / 50% / 2% / 0%.
  - **Construção determinística** (gerador com semente): com `Math.random` o estádio mudava de cores a cada refresh e nenhuma comparação visual entre execuções seria possível.
  - **Variação por adepto** — cor multiplicada por ±14%, escala 0.88 a 1.06, rotação ±0.25 rad. Sem isso 15 000 bonecos iguais leem-se como um padrão impresso, não como gente.
  - **Os lugares vêm do `createField`** (`lugares[]` recolhido no `addSeatInstance`), porque só quem constrói as bancadas sabe onde eles ficam — e o Crowd precisa deles **todos** antes de decidir seja o que for: a mescla sai da posição em Z face aos extremos do estádio. O `specMesh` antigo ficou desligado (`crowdAllowed = false && ...`) e o `updateCrowd` já tolerava a ausência dele. O `Crowd.build` regista na consola quantos adeptos entraram em quantos lugares — se o estádio tiver menos lugares do que o pedido, isso passava despercebido.
  - **Botão `Fans: ON/OFF`** no painel direito (`toggleFans`, js/main.js).
  - **`Config.enableCrowd` estava a `false`** e por isso os adeptos não apareciam de todo. Tinha sido desligado quando o público ANTIGO (com shader de animação por vértice) foi considerado caro de mais, e ficou assim. O sistema actual é outra coisa — quatro InstancedMesh estáticos, sem shader e sem update por frame — portanto o flag passou a `true`. Para desligar em jogo é o botão *Fans*, que é onde essa decisão deve ser tomada; o flag fica como interruptor de arranque.
- **O guarda-redes sai a jogar mais vezes** (`acharLateralParaSaida`, js/bt/player_bt.js + `GoalkeeperDistribution.bonusLateral`, js/config.js): só aceitava **LB/RB**, e com dois candidatos apenas — ambos obrigados a estar a mais de `folgaMinima` (4 m) de qualquer adversário — era frequente não haver nenhum. Aí o guarda-redes esperava `esperaMaxSemLinha` e acabava a chutar na mesma: a saída curta existia e quase não se via. Passa a aceitar também os **centrais** (CB/DC), com `bonusLateral: 3.0` somado à folga para os laterais continuarem a ser a primeira opção — entre dois igualmente livres sai pelo lateral, que é por onde se sai a jogar; o central entra quando é ele o que está mesmo desmarcado.

### Sessão de 24 de Agosto de 2026 — ritmo do passe, cabeçada, guarda-redes, cruzamento

- **Passe 25% mais vivo, e o `easySpeed` teve de o acompanhar** (`PassModel.vChegadaRasteira` 6.0 → **7.5**, cruzamento e lançamento 2.8 → 3.5; `BallControl.easySpeed` 7.75 → **9.69**; teste `tests/passe_ritmo.test.js`). O `easySpeed` é a velocidade acima da qual o domínio deixa de ser garantido, e o reforço do passe curto soma até +2.16 m/s: a 7.5 um passe de 3 m chega a **9.12 m/s**, e com o limiar antigo TODOS os passes curtos passariam a falhar o primeiro toque. **Acelerar o passe sem acelerar o controlo não faz o jogo mais rápido, faz os receptores mais incompetentes.** Medido depois: passe de 10 m em **0.97 s**, e os 7 passes da amostra (3 a 25 m) continuam todos a chegar domináveis.
- **BUG: duas cabeçadas seguidas do mesmo jogador** (`HeaderModel.alcanceMin`/`velocidadeMin`, js/config.js + `executeHeader`, js/player.js; caso 8 do `tests/cabecada_baixa.test.js`). A distância pedida era `min(distância ao colega, alcanceAlivioBaixo)`, **sem mínimo**: com um colega a 1 m a balística resolvia a cabeçada para **1.93 m/s**, e em 0.35 s — o `BallControl.touchLock` — a bola percorria 66 cm e ficava à frente da cara de quem a cabeceou, ainda à altura da testa. Passado o lock, ele cabeceava outra vez. `alcanceMin: 3.5` e `velocidadeMin: 7.0` põem a cabeçada mais mansa a **8.03 m/s** e a bola a 2.72 m — fora do alcance de contacto (0.9 m). O teste mede onde a bola está quando o lock acaba, em toda a gama de distâncias ao colega.
- **O guarda-redes deslizava a correr: tinha ficado com a versão ANTIGA do ciclo de passada** (`updateGK`, js/player.js — três sítios; teste `tests/gk_passada.test.js`). Usava `animTimer += vel*dt/3.0` com `getRunPose`, que é exactamente o defeito já corrigido no `animateBones` dos jogadores de campo e que nunca chegou aqui. Três coisas erradas ao mesmo tempo: **3 m por ciclo a qualquer andamento** (a passada real é 1.55 a andar, 2.90 a trotar, 4.40 a correr), **amplitude fixa** do `getRunPose` (não distingue andar de correr — era isto que fazia a corrida ler como lenta), e **`P.passada` a encolher a amplitude sem encolher o avanço**. Medido: escorregamento de **1.94** a andar (quase o dobro do chão que as pernas davam) e **0.72** a correr; agora **1.00** em todos os andamentos. Os três sítios passaram ao `getGaitPose`, e o **`getRunPose` ficou sem chamadores**.
- **Nas laterais da área o cruzamento passou a ganhar ao passe e ao lançamento rasteiro** (`zonaLateralDaArea`, js/utils.js — função nova + `CrossModel.penalPasseRasteiro`/`penalLancamentoRasteiro` + `findPassTarget`, js/player.js + `findThroughBall`, js/bt/player_bt.js; teste `tests/cruzamento_ala.test.js`). Os bónus do `CrossModel` já empurravam o cruzamento para cima nessa zona, mas **isso sozinho não decide nada**: a escolha não é entre cruzar e não fazer nada, é entre cruzar e PASSAR — e a nota do passe não sabia que o passador estava na ala junto à área, portanto um passe curto para trás pontuava ali o mesmo que no meio-campo e ganhava. Agora a nota do passe é multiplicada por **0.45** e a do lançamento rasteiro por **0.35** na zona cheia (o lançamento leva mais: dali é a pior das três opções, atravessa a defesa toda junto ao chão onde ela está mais junta). A zona é uma **rampa** e não um degrau — com um corte binário o jogador mudava de ideias de um frame para o outro ao atravessar a fronteira.
- **Cadeiras da bancada com 1/4 da altura** (0.30 → 0.075, js/match.js): eram cubos altos de mais e liam-se como caixotes. A geometria é centrada na origem, portanto encolher só a altura fazia a **base subir** metade da diferença e as cadeiras ficavam a flutuar acima do degrau — o `translate` compensa.
- **Remate outra vez mais forte:** `ShotModel` de 28/8 para **32/9** (ver a entrada do remate mais abaixo).

### Sessão de 24 de Agosto de 2026 — camada Reach (animação procedural)

Spec em [docs/superpowers/specs/2026-08-24-reach-animacao-procedural-design.md](superpowers/specs/2026-08-24-reach-animacao-procedural-design.md). Teste: `tests/reach_ik.test.js`.

- **`js/reach.js` (ficheiro novo) — alcançar um ponto do mundo com a mão ou com o pé.** É a camada que evita ter de gravar uma animação por situação: diz-se ONDE o membro tem de chegar e daqui sai o gesto todo. Quatro passos, **e a ordem é o que separa um gesto humano de um membro a rodar sozinho**: (1) cintura e tronco giram para aproximar a RAIZ do membro do alvo, (2) IK do membro, (3) contrapeso no membro oposto e no joelho de apoio, (4) limites. Ao contrário — membro primeiro — a perna roda sozinha na anca e lê como um boneco articulado.
- **Camada ADITIVA, não estado exclusivo:** o `animateBones` continua a correr e o Reach sobrepõe-se só na cadeia envolvida, com peso. É por isso que o jogador continua a correr enquanto estica a perna. Difere do `ShotClip`/`ThrowInClip`, que escrevem a pose inteira e obrigam a saltar o `animateBones`.
- **`Reach.pontaNoMundo` e `Reach.tocaBola`:** o contacto passa a poder ser decidido pela posição REAL do pé/mão, como o `gk_dive.defender` já fazia para as mãos. **Número a conhecer:** o braço alcança **0.53 m** do ombro e a perna **0.56 m** da anca, contra os **0.9 m** do `BallControl.reach` medido ao corpo — o teste antigo é bastante mais generoso do que o corpo consegue ser, e é isso que permite tocar a bola sem lhe chegar.

**Dois defeitos de fundo apanhados por medição, e ambos importam para lá desta camada:**

- **`IK.resolverSuave` deitava fora a rotação que o IK resolvia** (js/ik.js). A linha era `raiz.quaternion.copy(qAnt).slerp(raiz.quaternion, peso)` — copia a pose ANTIGA para `raiz.quaternion` e só depois faz slerp para `raiz.quaternion`, que nesse instante já é a pose antiga. Interpolava entre uma coisa e ela própria; sobrevivia só a flexão do meio. Medido com peso 1.0, que devia ser IK puro, a ponta ficava a **5-24 cm** do alvo; com a correcção, **0.000**. **O mergulho do guarda-redes usa esta função desde que existe** — os braços dele nunca foram exactamente para onde o IK mandava.
- **Limitar a pose DEPOIS do IK não funciona, e não é só uma questão de ordem.** A primeira versão convertia o quaternião que o IK escreve na raiz para Euler XYZ e aplicava-lhe o `JointLimits`; o membro ficava a mais de **um metro** do alvo. Duas razões: limitar depois desfaz por construção o trabalho do solver, e — a de fundo — **o Euler do quaternião não é o referencial anatómico**. Os limites do `hip` estão em flexão/abdução/rotação medidas do repouso; o Euler mistura os três de forma que não se lhes mapeia. Aplicar um ao outro é comparar coisas diferentes. A solução é *reach target clamping*: **limita-se o ALVO ao cone que a articulação alcança, antes de resolver**, e o IK resolve para um alvo já legal. Só a dobradiça (joelho/cotovelo) é limitada na pose, porque aí o `rotation.x` É a flexão e o mapeamento é directo.
  - Dois detalhes do cone que só apareceram a medir: o cone é da ARTICULAÇÃO e limita o **osso de cima**, que fica a `A` graus da linha até ao alvo por causa da flexão (128° com um cone de 120°) — desconta-se o `A` da lei dos cossenos; e a interpolação entre os quatro semi-ângulos tem de usar pesos **quadráticos**, porque com `|wz|` e `|wx|` a soma vai até √2 e dava 126° num cone de 120°.
- **Os `JointLimits` passaram a servir para alguma coisa.** O cabeçalho do ficheiro dizia *"NADA disto está ligado ao código de animação ainda — é só a base de dados"*. Este é o primeiro consumidor.
- **O `three` (r128) carrega em node**, e o teste constrói um rig sintético com a mesma hierarquia e comprimentos do `buildBody` para correr o `ik.js` e o `reach.js` a sério. **É o primeiro teste de animação deste projecto que mede em vez de olhar para constantes.** Verifica: alvo alcançável → ponta em cima dele (0.0 mm em toda a grelha); fora de alcance → membro esticado e apontado lá (0.0° de desvio); joelho/cotovelo nunca dobram ao contrário; nada sai do envelope anatómico; a cintura acrescenta alcance (+8 cm na perna, +15 cm no braço); e `pontaNoMundo` é a posição real do osso.

**Por fazer (fase 2 do spec):** os clientes da camada — o corte/intercepção com o pé do jogador de campo, e a defesa de pé do guarda-redes sem mergulho. A camada está pronta e testada, mas ainda **não é chamada de lado nenhum**.

### Sessão de 24 de Agosto de 2026 (remate, lateral, penálti, falta, árbitro)

- **O remate saía fraco e não ia à baliza: a potência estava a metade do que devia** (`ShotModel`, js/config.js — objecto novo + `executeShotGameplay`, js/fsm.js; teste `tests/remate_mira.test.js`). A fórmula estava escrita à mão dentro do `executeShotGameplay`: `pow = (22.0 + ((TEC-50)/50) * 16.0) * 0.8`, que dá **9.9 m/s a TEC 20**, 17.6 a TEC 50 e 4.8 a TEC 0. Um remate de futebol anda nos 25-35 m/s; 9.9 m/s é um passe fraco.
  - **A consequência não era só "fraco".** A `elevacaoParaAlvo` procura o ângulo que põe a bola no ponto visado com aquela velocidade, e a 17.6 m/s o **alcance útil era 23.5 m**: de mais longe não havia ângulo nenhum, a função devolvia `null` e o remate saía nos **36° fixos** do ramo de recurso (`Math.PI / 5`). Um balão para o ar, de qualquer posição além dos 23 m. E mesmo dentro do alcance a mira ficava alta: a 22 m precisava de **32°** de elevação só para chegar ao canto rasteiro.
  - **`ShotModel.potenciaBase: 32.0`, `potenciaPorSkill: 9.0`, `potenciaMin: 16.0`** — TEC 20 a 26.6 m/s, TEC 50 a 32.0, TEC 100 a **41.0** (~148 km/h, a ponta de um remate de elite). Primeiro foram 28/8/14, e visto em campo ainda lia como fraco. Medido: elevações de **4.6° a 19°** em toda a gama de 6 a 30 m (eram 9° a 41° com a potência antiga), alcance útil de **45 m**, e a bola cruza a linha a menos de 6 cm do ponto visado. A rede aguenta — o `tests/golo_rede.test.js` já varre remates até 45 m/s.
  - **`ShotModel.elevacaoRecurso: 20°`** substitui os 36° escritos à mão nos dois sítios que os tinham (fsm.js e player.js, este no cabeceio). Quando nem no ângulo óptimo se lá chega, a bola sai tensa em vez de em balão.
  - O teste tranca as duas coisas que causaram isto: que o `fsm.js` continue a ler o `ShotModel` em vez de uma fórmula à mão, e que a elevação de recurso não volte acima de 25°.
- **Pose e gesto do lateral: braços fechados, mãos na bola, cintura a girar** (`LateralPose`/`ThrowInClip`, js/config.js + `fecharMaosNaBola`/`colarBolaAsMaos`/`prepararGiroLateral`/`escolherAlvoDoLateral`, js/player.js; teste `tests/lateral_pose.test.js`).
  - **A pose de ESPERA não punha a bola nas mãos.** O `aplicarFrameLateral` (durante o gesto) já lia a posição dos punhos, mas o `aplicarPoseLateral` (a espera, que é o que se vê a maior parte do tempo) colava a bola a uma **altura fixa** — ela ficava a flutuar acima do crânio, fora das mãos. A pose de espera passou a ser o frame 0 do clip, pelo mesmo caminho: uma só versão da pose, e a bola sempre no ponto médio dos punhos (`colarBolaAsMaos`).
  - **`bracoZ` passou de +0.05 para −0.16** (adução: fecha os braços). Positivo é abdução, que abre — a 0.05 os braços ainda subiam à largura dos ombros.
  - **A bola fica 10 cm ACIMA do ponto médio dos punhos** (`bolaAcimaDasMaos`): as mãos seguram-na por baixo e pelos lados, portanto o centro dela não está à altura deles. Colada exactamente no ponto médio ficava encaixada entre os punhos, meia enterrada nas mãos. As antigas `bolaAltura`/`bolaRecuo`, que fixavam uma altura absoluta, foram **removidas** — eram o que a punha a flutuar fora das mãos.
  - **Mas o número certo não se adivinha, mede-se** (`fecharMaosNaBola`): a distância entre as mãos sai da largura dos ombros, do comprimento do braço e do ângulo do cotovelo, todos a mexer ao longo do clip. Enquanto a bola está nas mãos, faz-se bissecção sobre o `bracoZ` (`fechoIteracoes: 4`) até a distância entre os punhos ser o **diâmetro da bola**, com `fechoLimite: 0.55` a impedir que os braços se cruzem. Depois de largar a bola os braços seguem o clip como está escrito.
  - **A cintura gira para o lado do arremesso** (`giro` novo em cada keyframe × `LateralPose.giroMax` = 0.55 rad/32°): negativo na armação (carrega para o lado contrário, até −0.65) e positivo no chicote (até 1.00). Vai no **`chest`, não na pélvis** — rodar a bacia levava as pernas atrás dela e os pés ficavam torcidos; a cintura é o que roda num lateral, com os pés plantados.
  - **O alvo passou a ser escolhido no ARRANQUE do gesto** (`escolherAlvoDoLateral`, chamado do `match.js` quando o `ActionState` é criado), e não no instante do contacto: a cintura tem de começar a carregar desde o primeiro keyframe, e para isso é preciso saber para onde se vai atirar. O `lancarLateral` reutiliza a escolha — escolher outra ali punha a bola a sair para um lado com o corpo virado para o outro.
- **A cobrança de falta passou a decidir por geometria** (`decisaoDeFalta`, js/utils.js — função nova + `baterFalta`, js/player.js + `FreeKickModel`, js/config.js; teste `tests/falta_decisao.test.js`). Era o `emZonaDeFinalizacao` do jogo corrido a decidir o remate — um **rectângulo**, que não sabe nada de ângulo com a trave: rematava-se de posições sem baliza à vista e não se rematava de frente a 25 m. Três casos:
  1. **Remate directo**, dentro do trapézio: até `remateDistMax` (23 m) do centro da baliza **e** dentro das rectas que saem dos POSTES a `remateAnguloTrave` (30°) da **perpendicular** à linha de fundo. A base menor é a própria baliza e o trapézio abre com a distância.
  2. **Mini-canto**: ao lado da grande área (`miniCornerXMin`, 20.16) e a menos de `miniCornerProfundidade` (22 m) da linha de fundo — cruza para a área, como um canto curto.
  3. **Passe** para o melhor colega posicionado, como já era.
  - **A zona 1 é a INTERSECÇÃO das duas condições**, não só o trapézio: até aos ~19 m manda o trapézio dos 30°, a partir daí o arco dos 23 m corta-lhe os cantos. Medido: a 10 m remata-se até |x| = 9.4 m, a 16 m até 12.9 m, a 20 m até 11.4 m (aqui já manda o arco). O trapézio e o mini-canto **não se sobrepõem** — a 22 m o trapézio chega a |x| = 16.4 e o mini-canto começa em 20.16.
  - **`cruzamentoParaArea` (js/utils.js) é nova e partilhada**: a balística do cruzamento estava escrita à mão dentro do `case 'SET_PIECE_TAKER'` da fsm.js, e o mini-canto precisava do mesmo. Dois sítios com a mesma balística escrita duas vezes divergem à primeira afinação. Os números não mudaram (24.0 m/s horizontais, 9.6 verticais, primeiro pau a 6-10 m da linha).
- **Botão `Lateral` no painel esquerdo** (index.html + `Match.triggerThrowIn`, js/match.js): a favor de quem **não** tocou por último, como na regra.
- **Fila do penálti mesclada e escalonada** (`setupSetPiece`, ramo `PENALTY`, js/match.js + `PenaltyModel`, js/config.js; teste `tests/penalti_fila.test.js`). Eram `players.concat(opponents)`, ou seja o plantel inteiro de uma equipa seguido do da outra — com a alternância a partir do eixo, cada equipa ficava no seu bloco. Três defeitos apanhados por medição, um de cada vez:
  - **Intercalar as LISTAS piorou.** Com a alternância `0, +1, -1, +2, -2…` os índices pares levam sempre passo positivo e os ímpares negativo: uma equipa foi toda para a direita e a outra toda para a esquerda, perfeitamente segregadas. A mescla tem de ser na **ordem espacial** — as posições são geradas ordenadas da esquerda para a direita e as equipas alternam ao longo delas.
  - **As FUNÇÕES ficavam segregadas em x.** O plantel vem ordenado por função, portanto os defesas ficavam todos num lado e os atacantes no outro. Dentro de cada equipa as funções passam a ser intercaladas ciclicamente (`ata, mid, def, ata, mid, def…`). **Ao contrário do canto**, onde a ordem `def → mid → ata` importa porque cada índice cai num slot diferente; aqui os lugares são só posições em x e o que a função decide é a profundidade.
  - **A fila tinha 58 m.** São dezanove jogadores (dois planteis menos os dois guarda-redes e o batedor), e a `espacamentoFila: 3.2` isso é mais largo do que a grande área, com metade da gente encostada ao clamp. Passou a **2.2** (~40 m). O comentário do código dizia "os outros nove" e estava errado.
  - **`PenaltyModel.recuoPorRole` novo** (`ata: 0.0, mid: 1.6, def: 3.2`): os atacantes à frente a atacar o ressalto, os defesas mais atrás para o contra-ataque — como pedido, e pela mesma razão da ordenação do canto. Sem isto estavam todos na mesma linha, o que lê como uma parede e não como um aglomerado à espera da recarga. Medido: profundidade média `ata` 1.23 m, `mid` 2.96 m, `def` 4.00 m atrás da linha da área.
- **Cabeçadas fora da zona de remate são todas PARA BAIXO** (`HeaderModel`, js/config.js + `executeHeader`, js/player.js; teste `tests/cabecada_baixa.test.js`). O `elevacaoAlivio` a 28° era o que alimentava o ping-pong aéreo: a bola subia até ~3.3 m, voltava a cair à altura da testa e o seguinte cabeceava outra vez. O `maxHeadersSeguidos` corta a sequência ao terceiro, mas dois cabeceios seguidos já se vêem. Foi **removido**: fora da zona de remate usa-se sempre `elevacaoEscora`, e o que muda entre escorar para um colega e aliviar sem destinatário é a distância, não o ângulo.
  - **O ângulo passou de +8° a −9°**, negativo. A +8° a partir da testa (1.62 m) a bola ainda subia até 1.75 m e voltava a passar pela altura de cabeceio na descida — o ping-pong recomeçava ali mesmo. Tem de sair já a descer.
  - **A velocidade deixou de sair do `velocidadeParaAlcance`**, que resolve o alcance de um lançamento que sai DO CHÃO — e uma cabeçada sai de 1.62 m. Uma escora pedida a 4 m ia bater no chão aos **8.4 m**, o dobro. Passou a usar o `velocidadeDeLancamento` do lateral. **É o mesmo defeito nos dois sítios**, e vale a pena procurá-lo noutros: qualquer chamada a `velocidadeParaAlcance` para uma bola que não parte do chão está errada.
  - **Tecto de velocidade novo, `HeaderModel.velocidadeMax = 13.0`**: sem ele a distância pedida mandava na velocidade, e a geometria de um ângulo descendente fixo é implacável — a sair a −9° de 1.62 m a bola chega no máximo a ~9.5 m ainda que com velocidade infinita, e pedir 9 m dava **69 m/s**. Com o tecto é a distância que cede.
  - **Consequência a conhecer:** o alívio defensivo deixou de ser longo. A bola bate no chão a ~4.9 m e sai rasteira, contra os 16 m de antes. Foi o pedido explícito ("todas para baixo"), mas muda o jogo defensivo — uma bola aliviada fica muito mais perto da própria área.

### Sessão de 24 de Agosto de 2026 (Linha Defensiva do painel passa a comandar)

- **A Linha Defensiva era um TECTO e passou a ser ÂNCORA** (`computeBlock`, js/bt/team_bt.js; teste `tests/linha_defensiva.test.js`). Cortava a traseira do bloco quando ela subia demais, mas nunca a fazia subir — e com bloco longo a traseira sai do centro do bloco (que segue a bola), portanto o tecto nunca mordia. Medido sem posse com a bola em +20 e Length `large`: `medium` (-18.25) e `high` (-2.0) davam **os dois -20.0**, ou seja o botão não separava nada. Agora a traseira assume o valor pedido em qualquer Length Compactness, e só recua de lá por razão de jogo. Decisão do dono do projecto, escolhida entre tecto / âncora / tecto+piso.
- **`recuoDaUltimaLinha` (js/config.js) estava escrita e nunca era chamada** — grep dava um único resultado, a própria definição. É ela que executa os dois recuos legítimos e passa a ser chamada pelo `computeBlock`: a linha põe-se `MarkingModel.distanciaPorPressao` metros atrás do **adversário de campo mais recuado** (4.5 / 3.0 / 1.5 por Defensive Pressure), e o **piso do guarda-redes** (`gk + 1 m`) ganha a tudo. Nunca sobe a linha por si: um adversário à frente da linha pedida não a puxa para cima. Mesmo padrão dos defeitos já registados — consumidor sem produtor, aqui ao contrário: função sem chamador.
- **O clamp da frente deixou de arrastar o rectângulo inteiro** (`else if (z1 > maxZ)`): fazia `z0 = z1 - profundidade`, e com a frente a bater na marca de penálti adversária (`maxZ` = +42) isso puxava a traseira **26 m** abaixo do pedido. Tocar numa borda não pode recalcular a outra — é o mesmo defeito corrigido na sessão de 21 de Agosto nos outros caminhos, sobrevivente neste. Agora o bloco **encolhe** contra a borda, com `BlockShape.profundidadeMinima = 20.0` (novo, js/config.js) para não colapsar numa linha só. Quando a linha pedida e o comprimento pedido não cabem, quem cede é a frente: a traseira é escolha explícita do painel, a frente é derivada e em jogo quem a trava é o fora-de-jogo.
- **A ordem passou a ser: centro → limites do campo → Linha Defensiva.** O bloco da linha corria *antes* dos clamps e era desfeito por eles.
- **As pontas do rectângulo passaram da marca de penálti para a LINHA DA GRANDE ÁREA** (`AREA_GRANDE_PROF = 16.5`, js/config.js — constante nova; `minZ`/`maxZ` em `computeBlock`): de ±42.0 para **±36.5 m**, 5.5 m de recuo em cada ponta. É a borda que se lê no campo, e é o slot da última linha que ali encosta — um defensor não organiza o bloco de dentro da própria grande área, nem o bloco avança para dentro da área adversária.
- **Sem efeito com posse**, como já era: o bloco sobe com a jogada e a restrição da frente é o fora-de-jogo.

### Sessão de 24 de Agosto de 2026 (bola parada em cima da linha depois do golo)

- **~10% dos golos acabavam com a bola congelada em cima da linha, do lado de fora da baliza** (`dentroDaArmacao`, js/match.js — função nova; teste `tests/golo_rede.test.js`). Não era a rede a deixar passar a bola: era o bloco da linha de fundo a declará-la fora. Depois do golo a bola escorrega pelo pano de trás e desliza para o lado até encostar por dentro ao pano lateral, onde a `colidirComRede` a fixa em `LARGURA_BALIZA/2 - raio` = **3.55 m**. Mas o teste do vão nesse bloco é o do GOLO (`|x| < LARGURA_BALIZA/2 - 0.1` = **3.56 m**) e a `colidirComRede` corre **depois** dele, por isso o passo de integração punha a bola em 3.57-3.61 antes de a rede a corrigir. A faixa entre 3.56 e 3.66 é interior da baliza, e o ramo "jogo já parado" teleportava a bola para `z = ±53` e fazia `ballVel.set(0,0,0)` — daí ela aparecer parada em cima da linha, encostada ao poste. A guarda `dentroDaArmacao` (entre os postes, abaixo do travessão, à frente do pano de trás, tudo com margem de um raio) impede o ramo de disparar com a bola dentro da armação e deixa a rede resolver. Medido no teste: 120 de 1208 golos simulados (**9.9%**) antes, **0** depois.
- **`tests/` recuperado.** A pasta tinha desaparecido (o `filesSummary` refere ficheiros de teste que já não existiam). O teste novo corre com `node tests/golo_rede.test.js` e extrai `colidirComRede`/`dentroDaArmacao` do próprio `js/match.js` por texto — corre o código de produção sem precisar de browser nem de jsdom.

### Sessão de 24 de Agosto de 2026 (Correções Rápidas)

- **Overlapping dos laterais (`js/config.js`):** Restaurado o parâmetro `avancoComBola: 12` para os estilos `offensive_fullback` e `fullback_finisher`. Após a remoção do antigo `position_bt.js`, estes jogadores apenas possuíam um avanço base passivo (`avanco: 4`) e ficavam parados atrás no ataque. Agora sobem no terreno e fazem *overlapping* com os extremos.
- **Velocidade da Arbitragem (`js/officials.js`):** Aumentada a velocidade base do árbitro principal de 5.2 para 7.5 m/s, e a dos assistentes de 6.0 para 8.5 m/s, para acompanharem melhor o jogo.
- **Limites do Bloco Tático (`js/bt/team_bt.js`):** O `computeBlock` passou a limitar a profundidade dos retângulos da equipa na marca de penálti (11m da linha de fundo) em vez da linha da pequena área (5.5m).

### Sessão de 24 de Agosto de 2026 — bolas paradas, arbitragem e decisão

**Bolas paradas novas**

- **Lateral completo** (`ThrowInClip`/`LateralPose`/`ThrowInModel`, js/config.js + `aplicarPoseLateral`/`aplicarFrameLateral`/`lancarLateral`, js/player.js + estado `LATERAL`, js/fsm.js): não existia lateral nenhum, e a razão era física — `BarreiraCampo.x` estava **em cima** da linha lateral (`CAMPO_LARG/2`), portanto a bola ressaltava e nunca saía. Passou a `CAMPO_LARG/2 + 4.0`, a mesma folga que a linha de fundo já tinha. Deteção em `updateBall` (bola inteira para lá da linha **e** a ir para fora), reposição pelo jogador mais próximo colocado fora do campo, adversários afastados 2.5 m, espera de `ESPERA_APOS_REPOSICAO` e gesto de 10 keyframes com a bola a sair no frame 6. A bola segue as **mãos** (lidas da matriz mundo dos punhos), não uma altura fixa, e é reposta meio metro **dentro** da linha ao ser largada — largá-la na posição das mãos assinalava novo lateral para a equipa contrária no frame seguinte.
- **Falta** (`FreeKickModel`, js/config.js + ramo `FREE_KICK` em `setupSetPiece` + `baterFalta`, js/player.js): botão *Falta* no painel. A bola fica onde está, cobra o jogador mais próximo da equipa com posse, e a defesa monta barreira de 2 (longe) ou 4 (a partir de 30 m no referencial de ataque) a **9.15 m**, perpendicular à linha bola→baliza. Ao fim da espera o batedor remata (se em alcance) ou joga em passe — reaproveitando `initiateShoot`/`initiatePass`, sem balística própria.
- **Pênalti** (`PenaltyModel`, js/config.js + ramo `PENALTY` + `baterPenalti`, js/player.js): botão *Pênalti*. Bola na marca dos 11 m, bate o melhor TEC, guarda-redes **sobre** a linha de golo com `gkDelayReacao = 0`, e os outros nove formam a fila da entrada da área alternando para os dois lados, sempre por fora do **círculo** de 9.15 m centrado na marca (a primeira versão testava um quadrado e deixava gente dentro do arco nas diagonais). Resolução própria: `chanceGolo` modulada pela técnica decide se vai enquadrado; o duelo com o guarda-redes resolve-se pelo mergulho normal.
- **Canto: a bola deixou de ser teleportada no instante da saída.** Ganhou o mesmo tratamento do tiro de meta (`cantoBolaAlvo`/`cantoAguardaChao`/`cantoBolaAtraso`) — segue o lance, cai, ressalta e passa para trás da baliza, e só depois vai para a quina. Um remate ao poste congelava no ar e reaparecia na bandeirola. O batedor só cruza com a bola já lá (`&& !Match.cantoBolaAlvo`).
- **Canto: grelhas de posicionamento refeitas** (`attackSetup`/`defenseSetup`, js/match.js) — aglomerado apertado entre a pequena área e a marca de penálti, com **um marcador por atacante** (os índices 3-8 da defesa emparelham com os slots 1-6 do ataque) e dois homens nos postes. Os defensores passaram a ser ordenados `def → mid → ata`, o inverso do ataque.
- **Disputa antes da batida** (`SetPieceJostle`, js/config.js + `SET_PIECE_WAIT`, js/fsm.js): no canto ninguém fica estátua — passos de 0.85 m à volta da âncora do slot, sorteados a cada 0.5-1.3 s. Como marcador e homem ficam a 1.5-2.5 m, os passos cruzam-se e produzem os embates.
- **Espera uniforme após reposições** (`ESPERA_APOS_REPOSICAO = 3.0`, js/config.js): o `kickoffTimer` estava em `0.0` apesar do comentário prometer "uns segundos"; o canto usava 1.5 s; o tiro de meta não tinha espera nenhuma (o GR entrava em `tiro_meta` no mesmo frame do setup — agora passa por `tiro_meta_espera`).

**Arbitragem — `js/officials.js` (ficheiro novo)**

- **Árbitro e dois assistentes**, equipamento preto, **fora** de `Match.players`/`Match.opponents` de propósito: sem blackboard, sem BT, sem colisões — metê-los nas listas obrigava a filtrá-los em dezenas de ciclos. Usam o **mesmo modelo dos jogadores**: instancia-se um `FootballPlayer` só para dar `model` + `rig`, com equipamento preto e as chuteiras repintadas. O construtor é seguro para isto — não se inscreve em lado nenhum e os sprites que cria nascem invisíveis dentro do próprio `model`; o `discoTatico` é criado no `updateShirt`, que nunca chamamos (sem número nas costas, sem disco na vista táctica). Passada pelo `getGaitPose` do jogo.
- **Assistentes** cobrem metades diagonalmente opostas das duas linhas laterais e seguem o **segundo último jogador** da equipa que ali defende. A linha é calculada localmente e não lida de `bb.offsideLimitDir`, que é anulado quando a equipa não tem posse.
- **Árbitro** corre a diagonal do **lateral direito ao ponta esquerda do TeamB** — de (+23, +40) a (-23, -40) — projeta a bola nela e afasta-se até `RefereeModel.distanciaBola` (15 m). Colocação inicial a 12 m da bola, por fora do círculo central. Botão *Arbitragem: ON/OFF*.

**Minimapa — `js/minimap.js` (ficheiro novo)**

- Canvas 2D por cima da cena — 23 pontos e meia dúzia de linhas custam muito menos que um segundo render do THREE. Campo deitado (eixo Z do mundo na horizontal) e **os dois eixos invertidos**: a câmara de TV está em +X a olhar para a origem, logo o "direita do ecrã" dela é `-Z`. Inverter ambos é uma rotação de 180°, não um espelho — a esquerda e a direita do campo mantêm-se corretas. Relva a 30%, `background-color: transparent` (a regra genérica `canvas` pinta o fundo de azul-céu) e `top: auto` (essa mesma regra põe `top: 0`, que ganhava ao `bottom`).

**Decisão e movimento**

- **Linha de passe passou de filtro a peso** (`PassLineModel`, js/config.js + `findPassTarget`, js/player.js): era um corte binário com corredor de 1 a 2.6 m, e a recompensa por linha limpa valia no máximo +50 contra os +200/+500 da liberdade do receptor. Consequência: o passe curto para dentro de tráfego passava, e o passe longo para um colega livre era **eliminado antes de ser pontuado** (a reta atravessa o bloco todo, há sempre alguém a 2 m dela). Agora só resta o corte duro (`bloqueioDuro: 0.9 m`, onde a bola não passa), o corredor de ameaça **cresce com a distância** do passe, a qualidade da linha vale `pesoLinha: 300` e conta-se **quantos** adversários a reta atravessa (`pesoCorpo: 60`), não só o mais próximo. `factorUltimoTerco: 0.45` corta a penalização a menos de metade quando o destino é no último terço — sem isso os ataques morriam à entrada da área e deixava de haver remates.
- **Orçamento de condução por Estilo Ofensivo** (`TeamPlayStyles.conducao`): Possession 0.45, Positional 0.55, Wing Play 0.9, Direct 1.0, Counter Attack 1.75 sobre `CarryModel.distanciaMax`. E o `|| livreAFrente10m20g` que **anulava** o orçamento passou a valer só no último terço e abaixo de `velMaxLivre` — quem arranca em velocidade limpa o cone à frente por si próprio, portanto a condição era sempre verdadeira e o portador atravessava o campo inteiro.
- **Toque de condução validado por disputa** (`maiorToqueSeguro`, js/utils.js): as faixas de distância escolhem o toque, e depois pergunta-se **quem chega primeiro** ao sítio onde a bola vai ficar. O tempo do portador é `√(2·lead/a)` e não `lead/velocidade` — ele não chega quando lá chegaria a correr, chega quando a bola lá está. O guarda-redes **entra** nesta conta (está fora da escolha da faixa, para não disparar drible contra ele). Devolver 0 significa "leva a bola no pé".
- **Marcação: o leilão passou a medir a posição real** (`atribuirMarcacoes`, js/config.js): media tudo a partir do **slot**, e por isso um central cujo posto calhava perto de um extremo ganhava-o estando ele a 15 m, à frente de um médio a 3 m. O raio continua zonal (medido do slot), mas o custo é `distânciaReal + distânciaSlot × pesoSlot`, menos `bonusManter` e menos `bonusPar`. A tabela `paresPorPosicao` (CB↔CF, LB↔RM…) **existia e nunca era lida** — grep dava um único resultado, a própria definição.
- **Estado `MARKING` ligado** (`podeMarcar`/`actMarcar`, js/bt/player_bt.js): o `case 'MARKING'` da FSM estava inteiro (círculo à volta do homem, recuo quando ele avança) mas dependia de `p.markingTarget`, que ninguém escrevia. A escolha do par já existia em `p.marcRef`; faltava quem a executasse.
- **RECOVER: apoios deixam de disputar a bola do próprio condutor** (`pickIntercetor`, js/bt/team_bt.js): o toque da condução larga a bola de propósito e zera `Match.ballCarrier` por ~0.3 s, e nessa janela um colega era eleito intercetor. Agora não há intercetor se houver `intendedReceiver` da equipa ou alguém com `carryTouchGrace > 0`.
- **SUPPORT_PASS: defesas só na saída a jogar** (`atribuirApoiosDaEquipa`): não havia filtro de função, e como o custo é a distância do ponto ao slot, os pontos atrás do portador caíam em cima dos slots dos centrais e laterais.
- **Deslocação lateral** (`LateralGait`, js/config.js): um marcador tem o corpo virado para a bola mas o alvo é o homem — corria de frente e deslizava de lado. Acima de `velViragem` o corpo roda para o movimento; abaixo dela faz passo lateral (passada encolhida + abdução das ancas em oposição de fase).
- **Giro** (`TurnModel`): estava em 5.5/s escrito à mão no `steerArrive` (~0.42 s para 90% de um giro). Passou a 12.0 sem bola e 9.0 com bola.

**Física e percepção**

- **A previsão da bola passou a conhecer o QUIQUE** (`preverBolaEm`/`preverBolaEmAltura`, js/utils.js): faziam `{ y = raio; vy = 0 }` — para a previsão o relvado absorvia tudo e a bola passava a rolar. O jogador corria para onde a previsão dizia, a bola quicava e passava-lhe por cima. Agora usam a mesma física do `updateBall` (restituição, perda horizontal no embate, travagem a rolar).
- **Percepção com trajectória partilhada** (`Perception.reconstruirTrajectoria`, js/perception.js): o ponto de interceptação vinha de uma solução fechada **só no plano** e ignorava a altura — uma bola alta era tratada como se estivesse a rolar. Agora integra-se a trajectória completa **uma vez por frame** (240 passos no total em vez de 240 × 22) e o ponto exige que a bola esteja a uma **altura jogável** nesse instante.
- **Ritmo do passe** (`vChegadaRasteira`, js/config.js): de `2.8` para `6.0 m/s`. A 2.8 um passe de 10 m demorava **1.57 s**; a 6.0 leva 1.12 s. 6.0 é o máximo seguro — o reforço do passe curto soma até +2.16 m/s e o `BallControl.easySpeed` é 7.75.

**Animação**

- **Remate refeito como clip** (`ShotClip` + `ActionAnimClips.shot`, js/config.js + `aplicarFrameRemate`, js/player.js + `executeShotGameplay`, js/fsm.js): eram duas poses com `lerpTo` e 0.2 s de estado — a bola saía no frame seguinte ao da decisão. Agora são 12 keyframes, 0.5 s, com a bola a partir no frame 8 (`t = 7/11`). A resolução saiu para `executeShotGameplay` (mesmo padrão do `executePassGameplay`) sem alterar um único peso. O `animateBones` tem de ser saltado durante o gesto: o ramo `speed >= 0.1` faz `set` **directo** nas pernas e reescrevia o clip no mesmo frame.
- **Entrada do tiro de meta com mistura** (`iniciarBlendChuteChao`, js/player.js + `GK_GROUND_KICK_BLEND`, js/config.js): a corrida acabava e o clip começava no mesmo frame — a bacia saltava 0.26 m de lado (o pivô do frame 1), as pernas saltavam (o clip escreve com `=` sobre uma pose de corrida em qualquer fase do ciclo), o corpo teleportava para o pé de apoio e a orientação mudava de golpe. 0.14 s de smoothstep em todos os canais, mais slerp do quaternião e deslize até `plantX/plantZ`.
- **Elevação do chutão do GR** (`puntBall`): `(25 + rand*25) / 3` dava **8.3°-16.7°**, não os 25°-50° que o comentário prometia — e com ângulo tão baixo a velocidade estourava o tecto de 50 m/s em quase todos os sorteios. O `/3` saiu; o alcance não muda, porque a velocidade sai da balística.
- **Guarda-redes: agilidade e saída pelos laterais.** `GoalkeeperPose.agilidade`/`agilidadeSkill` escalam de uma vez os oito `speedLerp` do reposicionamento. E a distribuição passou a ser sorteada por Estilo Ofensivo (`GoalkeeperDistribution.porEstilo`: Possession e Positional a **70%** de saída curta) — o `decidirSaidaGK` devolvia `'chuteFrente'` fixo e toda a maquinaria da saída pelos laterais existia sem ser chamada.

**Bloco e forma**

- **Linha Defensiva do painel ligada ao bloco** (`computeBlock`, js/bt/team_bt.js): o comentário do `TeamShape.linhaDefensiva` dizia que era o tecto da traseira do bloco, mas o `computeBlock` **não a lia** — era usada só para desenhar a linha tracejada do debug. Agora limita o `z0` sem posse.
- **Offset do centro do bloco com sinal por fase:** estava fixo em `+5.0` para as quatro fases, ou seja a defender o bloco era empurrado 5 m na direcção da baliza adversária. Passou a `bb.isAttacking ? 5.0 : -5.0`.
- **Length Compactness com 5 níveis:** 30/40/50/60/70 m (`mediumSmall` e `mediumLarge` novos). Atenção: o `median` passou de 40 para **50 m** — o padrão do jogo mudou.
- **Defesas deixam de conduzir e driblar até ao ataque:** `CarryModel.limiteConducaoDefesa` (meio-campo) no `ConduzirEmEspaco`, e `podeDriblar` recusa `role === 'def'` em todo o campo (antes só no meio-campo próprio).
- **`extra_frontman` sem `amplitudeZ`:** valia 1.4, e `amplitudeZ` é o afastamento ao **centro** do bloco — num central, que está na aresta de trás, empurrava-o para longe da baliza adversária e para fora do rectângulo. O `juntaSeAoAtaque` passou a valer na ordenação do canto, que é onde o central deve subir.

**Correcções de gameplay**

- **Anti ping-pong aéreo** (`executeHeader`, js/player.js): `Match.aerialHeaderCount` era incrementado só no ramo *fora* da zona de remate, portanto o travão protegia o meio-campo e nunca a área — que é onde a bola fica a saltar de cabeça em cabeça. A contagem passou para o topo do método.
- **Remate na área: o toque de condução deixou de adiantar a bola** (`emZonaDeFinalizacao`, js/utils.js). O guarda-redes está excluído da contagem de adversários do toque, portanto cara a cara com ele o `nearestOppDist` ficava em 999 e saía **toque longo** por cima dele. E o `CarryModel.margemLinhaFundo` estava em `0.0`, o que desligava por completo a trava da linha de fundo.
- **`SpatialGrid.cellIndexAt` rejeita coordenadas não finitas.** Os clamps não protegiam nada (`Math.max(0, Math.min(24, NaN))` é `NaN`) e chegava-se a `cells[NaN]`, que é `undefined`: um jogador com a posição estragada derrubava o loop de render inteiro.

**Remoções**

- **Botões de debug `SG PASS/MARKING` e `PlayerPassTarget` removidos**, com o desenho respectivo (`buildDebugVisual`/`updateDebugVisual`/`setDebug` em spatial_grid.js; `rebuild`/`getDot`/pool em pass_candidates.js). Removidas também as camadas **`marking`** (só o debug a lia) e **`lancamento`** (`return 0` fixo) e o bónus morto que a somava no `findThroughBall`. Os sistemas por baixo continuam a alimentar remate, passe e cruzamento.

### Sessão de 24 de Agosto de 2026 (anterior)

- **Chute de Bola Parada / Tiro de Meta do Chão com Pivô no Pé de Apoio (`GoalkeeperGroundKickClip`, js/config.js + `amostrarClipChuteChaoGR`, js/player.js):**
  - **12 Keyframes Biomecânicos:** Refatoração completa da animação de tiro de meta e bolas paradas do chão (`GoalkeeperGroundKickClip`), cobrindo o ciclo balístico: fixação do pé de apoio ao lado da bola, inclinação corporal e recuo da perna de remate até ~110° no joelho (Figura 2), aceleração e impacto pé-bola no frame 8 (`t = 7/11`, sincronizado com `ActionAnimClips.gkPuntChao`), e finalização com *follow-through* alto e elevação na ponta do pé de apoio (Figura 4).
  - **Cinemática de Inclinação em Bloco:** Resolução do defeito de "quebra lateral" da coluna. O corpo agora inclina como uma unidade rígida com pivô no pé esquerdo de apoio ($x_0 = +0.4$), através de translação trigonométrica compensatória da bacia (`pelvis.position.x = pivotX * (1 - cos(leanZ)) - 2.6 * sin(leanZ)` e `pelvis.position.y = 2.6 * cos(leanZ) - pivotX * sin(leanZ)`) e rotação da bacia (`pelvis.rotation.z = leanZ`, `pelvis.rotation.x = pitchX`). O tronco e a perna de apoio permanecem estritamente alinhados (`chest.rotation.z = 0`), preservando a integridade anatómica do modelo.
  - **Restauração de Pose (`resetBonesToDefault`, js/player.js):** Garantida a reposição da bacia em `pelvis.position.set(0, 2.6, 0)` ao finalizar o chute e nos resets de ciclo, prevenindo deslocamentos residuais do rig 3D.

### Sessão de 22 de Agosto de 2026

- **Uniformização da velocidade de chegada dos passes (`PassModel`, js/config.js + `velocidadeRasteiraPara`, js/utils.js):** Todas as velocidades de chegada (`vChegadaRasteira`, `vChegadaLancamento` e `vChegadaCruzamento`) foram unificadas em **`2.8 m/s`** (anteriormente `4.5`, `5.0` e `7.0 m/s`). O multiplicador artificial de saída de 1.30× presente em `velocidadeRasteiraPara` foi removido, o atrito de rolamento da relva mantido no valor nominal (`atritoRolamento: 0.38`) e o teto físico preservado em `18.5 m/s`. O passe em profundidade/lançamento rasteiro deixa de sair com ímpeto desproporcional e passa a chegar controlável. Testes de física atualizados e validados em `tests/pass_velocity.test.js`.
- **Passe de saída de bola no Kickoff (`PasseSaidaDeBola`, js/bt/player_bt.js + js/match.js):** Implementada a sequência automática de passe para a linha defensiva/médio recuado no pontapé de saída. Em `js/match.js` (`resetPlay`), ao reiniciar o jogo são ativadas as flags `Match.kickoffTeam` e `Match.kickoffPendingPassToDef = true`. Na árvore de comportamentos com posse (`ComBola`), o novo ramo `PasseSaidaDeBola` (`encontrarDefesaParaSaida` e `executarPasseSaidaParaDefesas`) identifica o colega mais recuado e desmarcado e executa o passe curto de recuo, desativando a flag e libertando a equipa para a circulação normal. Testes: `tests/kickoff_saida.test.js`.
- **Desativação configurável da torcida (`enableCrowd`, js/config.js + js/match.js):** Adicionada a opção `enableCrowd: false` no `Config`, permitindo desligar completamente a renderização e o shader do público em bancada quando pretendido para máxima fluidez e redução de overhead gráfico.

### Sessão de 21 de Agosto de 2026

- **O bloco do TeamBT passou a acompanhar a bola (`computeBlock`, js/bt/team_bt.js):** era o bug que impedia o jogo de acontecer — o portador chegava à borda do rectângulo e os companheiros não o acompanhavam. O centro é agora **a bola mais o deslocamento da Mentalidade (`ment.blocoZ`), e mais nada**, nos dois eixos. Foram removidos, por ordem de gravidade: (1) os **offsets de estado** (+10 m em transição ofensiva, +7 com posse, −7 a defender), somados por cima da bola; (2) o **`ment.tectoBloco`**, que corria depois de tudo e desfazia o escape que fazia o bloco seguir a bola — era ele que prendia a equipa no meio-campo com a bola no terço de ataque; (3) a **`BlockShape.basculacao`** (0.60/0.70/0.80) no eixo X, que com a bola em x = 20 punha o centro em x = 14, quando o comentário logo acima já dizia "ACOMPANHA A BOLA, 1:1"; (4) os travões das bordas (tecto da Linha Defensiva sobre `z0`, fora-de-jogo sobre `z1`, linhas de fundo), que ao tocarem numa borda recalculavam a outra (`z1 = z0 + profundidade`) e portanto **arrastavam o rectângulo inteiro** — com o fora-de-jogo a prender a frente na última linha adversária, o centro ficava meia profundidade (~15 m) atrás da bola. O `MentalidadeModel.tectoBloco` e o `BlockShape.basculacao` ficaram no config marcados como **já não lidos**. Medido em jogo (harness headless, 2500 frames): erro do centro à bola com mediana de **1.9 m em Z e 0.9 m em X** (p90 5.9 e 6.6). O único sítio que ainda desloca o rectângulo inteiro é o piso do guarda-redes, que é um limite físico. Testes: `tests/bloco_segue_bola.test.js`.
- **O rectângulo NUNCA encolhe, e os slots entram no campo por deslocamento (`slotNoBloco`, js/bt/team_bt.js):** com o bloco centrado na bola e de tamanho fixo, na ala fica boa parte dele fora do campo. As duas saídas óbvias foram medidas e rejeitadas: o *clamp por jogador* empilha a defesa contra a linha (quatro defesas com alvos a menos de 3 m em **95%** do tempo) e o *mapeamento na janela útil* encolhe o espaçamento (última linha de 30 → **19 m**, lateral a 2.8 m do central). A linha passa a **deslocar-se para dentro em bloco** (`empurraX`/`empurraZ`), mantendo largura e espaçamento — que é o que uma equipa faz com a bola encostada à linha. **Armadilha:** o clamp final do `xTarget` tem de usar o bloco **já deslocado** (`bloco.x0 + empurraX`); a usar o original desfazia o deslocamento e juntava a linha toda na borda.
- **`momentumZ` era um nome errado, e o nome custou 25 m de atraso (`updateMomentum`, js/bt/team_bt.js):** MOMENTUM é o **lado** do campo onde o jogo acontece (eixo X, largura, sectores Left/Right/Center) — é o `momentumX`. O que se chamava `momentumZ` era a posição **longitudinal** da bola suavizada, e por causa do nome levou constantes de tempo de momentum: **2.5 s a defender e 4.0 s com a bola a recuar**, ou seja 25 a 40 m de atraso à velocidade de um passe. Renomeado para `bolaZSuave`/`bolaXSuave`, calculado por `seguirBola` (js/utils.js) com `BlockShape.seguimentoBola = 3.0` (constante de 1/3 s, ~3.3 m de atraso a 10 m/s) e **simétrico** — a assimetria colava o bloco ao ataque e arrastava-o no recuo. Descoberto pelo caminho: o offset de transição ofensiva era contado **duas vezes** (+10 no seguimento e +10 no centro = 20 m).
- **Deslocamento de corredor recalibrado (`deslocamentoDeCorredor`, js/bt/team_bt.js):** os 3.5 m do defesa no corredor central e os 5.0 m do lateral do lado oposto tinham sido calibrados quando o bloco só seguia a bola a 0.7 em X e a equipa compensava por jogador. Com o bloco a 1:1 passaram a somar-se por cima — o lateral do lado oposto colava-se ao central (1.5 m) e a defesa embolava-se em 92% do tempo. Passaram a 1.5/1.0 (corredor central) e 2.0/1.5 (lado oposto).
- **Toques de condução por distância ALVO, não por fracção da velocidade (`case 'CARRY'`, js/fsm.js):** a potência era `curSpeed * 1.0x + 0.15..0.40`, e esse excesso morre em menos de 0.1 s com o atrito real (μg = 3.73 m/s²) — a bola ficava colada ao pé e o toque à frente não se via. Agora a bola é adiantada uma distância em metros e a potência sai da física: afastamento máximo `lead = u²/(2a)`, logo `touchPow = curSpeed + sqrt(2·a·lead)`. Revive as constantes `CarryModel.touchLong/touchMedium/touchShort`, que estavam mortas (o ramo por distância usava números hardcoded). Valores actuais 3.5 / 2.0 / 1.2 m, e metade do curto com adversário a menos de 5 m. O `carryTouchGrace` deixou de ser fixo em 1.2 s e passa a `min(3.0, 2u/a + 0.5)` — o tempo real até recuperar a bola, senão o BT dava a posse por perdida a meio do toque longo.
- **Dois jogadores da mesma equipa em CARRY (`graceDeConducao`, js/utils.js):** quando outro jogador domina a bola (`best.hasBall = true`, js/match.js), o `carryTouchGrace` do portador anterior **nunca era limpo** — e como `temBola = hasBall || carryTouchGrace > 0` (js/bt/player_bt.js), o antigo continuava em CARRY. A graça passa a morrer no instante em que a bola é de outro, como invariante por frame em `player.js` (`Match.ballCarrier && Match.ballCarrier !== this`), o que cobre todos os caminhos de troca de posse — domínio, desarme, `grabBall`, kickoff. Testes: `tests/carry_grace.test.js`.
- **Dois jogadores da mesma equipa em INTERCEPT (`pickIntercetor`, js/bt/team_bt.js):** a reivindicação (`bb.intercetorFrame`) era feita pelo próprio jogador dentro da condição da árvore e só travava quem corresse **depois e fosse pior**; um jogador melhor a correr mais tarde reivindicava na mesma, e o primeiro já tinha mudado de estado nesse frame. Como a ordem da lista não muda entre frames, os dois ficavam presos em INTERCEPT. A escolha passou para o nível 1, como já era o `chaser`: um intercetor por equipa e por frame, conta pura em `escolherIntercetor` (js/utils.js). O `podeIntercetar` ficou reduzido a obedecer (`bb.intercetor !== p → false`). Testes: `tests/intercetor.test.js`. **Padrão a reconhecer:** é o mesmo defeito do `carryTouchGrace` e do apoio — reivindicação feita pelo jogador dentro da árvore, em vez de escolha colectiva no nível 1.
- **`SupportModel.maxPorLado: 0` não desligava o apoio (`temVagaDeApoio`, js/bt/player_bt.js):** o corte do tecto vivia **dentro** do ciclo dos companheiros, por isso quem estivesse sozinho do seu lado da bola — todos os outros apanhados pelos `continue` — nunca lá chegava e saía por baixo com `return true`, entrando em FWR/AFT_SUPPORT com a funcionalidade desligada no painel. O tecto passou a ser verificado antes do ciclo. Os 7 testes de apoio que estavam vermelhos **não eram um bug por descobrir**: liam o valor do painel e falhavam só por ele estar a 0. Passaram a forçar o tecto que testam, com dois casos novos a fixar que "0 desliga mesmo".
- **Apoio de circulação escolhe pela LINHA, não pelo custo (`notaPontoDeApoio`/`folgaDaLinha`, js/utils.js):** o `atribuirApoios` filtrava os pontos por linha livre (binário) e depois escolhia entre eles o **mais barato** — o mais perto do slot. Era isso que punha o médio a fechar para dentro em vez de se pôr no vão entre dois adversários: o ponto cómodo passava no teste à tangente e ganhava ao vão aberto que ficava dois metros mais longe. Agora `nota = folgaDaLinha × 1.2 + folgaDoPonto × 1.0 − custoAoSlot × 0.5` (pesos em `SupportModel.circulacao`), aplicada nos três sítios que decidiam por custo (histerese, reancoragem, leilão). Cada metro extra de caminho paga-se com 0.42 m de linha mais aberta. **Cortes duros que a pontuação não contorna, e que limitam o efeito:** `maxApoios: 3` (só três se oferecem por equipa), `desvioMax: 8.0` (ninguém sai mais de 8 m do slot) e a coroa `raioMin/raioMax` 10-18 m à volta da bola. Testes: `tests/apoio_linha_passe.test.js`.
- **Corrida ao espaço revalidada por frame contra o fora-de-jogo (`avancoLegalDeCorrida`, js/utils.js):** a corrida é fixada `RunIntoSpaceModel.duracao` = 4 s e só o instante do arranque passava pelo corte da linha (`destinoDeCorrida`). Em 4 s a última linha sobe e o destino, legal quando foi escolhido, deixa de o ser — os dummy runners passavam a linha. O corte saiu para função própria, partilhada pelos dois chamadores, e corre agora todos os frames; se o destino ficar atrás do jogador, a corrida aborta e ele volta a posicionar-se. Testes: `tests/corrida_impedimento.test.js`. **Já estava certo, fica registado:** a linha de fora-de-jogo passa para a bola quando alguém a ultrapassa a conduzir — `Math.max(0, maxOppZ, Match.ball.position.z)` em `publicarLinhaDeForaDeJogo` (js/match.js). Usa a posição da bola *agora* e não no instante em que foi jogada, por isso uma bola em voo empurra a linha à frente dela.
- **Última linha a defender: o limite do guarda-redes é PISO, não destino (`recuoDaUltimaLinha`, js/config.js):** `z0` é a traseira do bloco **e** o slot da última linha, e como a defender o centro seguia a bola menos 7 m, o clamp `gk + 1 m` repunha-o exactamente ali — os defesas iam todos para a linha do guarda-redes com os atacantes soltos à frente. A profundidade passa a vir do adversário mais recuado menos a distância de marcação (`MarkingModel.distanciaPorPressao`: low 4.5 / balanced 3.0 / high 1.5), com o `gk + 1 m` só como piso duro. Nunca sobe a linha por si. Testes: `tests/linha_recuo.test.js`.
- **Três anéis de debug, um por etapa do posicionamento (js/player.js, js/main.js, index.html):** `Team BT POS` (grande) = `slotTarget`, o slot puro do bloco; **`PositionBT` (médio, botão novo)** = `dynamicTarget`, o alvo que o `steerArrive` persegue; `PlayingStyleBT` (menor) = `styleTarget`, que passou a ser o `postoBase` (slot + estilo, **antes** da marcação) em vez de uma cópia do alvo final — era essa cópia que fazia dois anéis coincidirem e desligar os estilos não mudar nada no ecrã. A linha passou a ter **3 vértices** e liga os anéis que estiverem ligados, pela ordem em que são calculados; antes exigia dois botões específicos ligados ao mesmo tempo e com qualquer outra combinação não aparecia linha nenhuma. O rectângulo do bloco ganhou as **duas diagonais e um anel no cruzamento** (js/match.js), para se ver de relance se o centro está sobre a bola.
- **Telemetria de passes (`MatchStats.resumoPasses`, js/stats.js):** uma amostra por passe — distância, tipo, se saiu do chão, velocidade de saída e de chegada, tempo de voo e desfecho — resumida por faixa de distância no `console.table` e no campo `passes` do JSON do `Sim` (amostras cruas só com `opts.exportarAmostras`). O desfecho **`ninguem`** é novo e importa: passes que ninguém chega a tocar não apareciam em conta nenhuma — nem certos, nem corte, nem disputa falhada. Relógio próprio em `MatchStats.relogio`, porque o `Match.tempoDeJogo` vem multiplicado pelo `MatchDuration.timeScale` (4.5×) e não serve para medir tempo de voo. **Para saber onde afinar:** `pctNinguemTocou` alto = peso/pontaria; `pctCortado` alto = bola lenta de mais; `pctDominioFalhado` alto = recepção.
- **Calibração de estilos passou a medir o estilo ISOLADO (`registarEstilos`, js/simulate.js):** comparava o `dynamicTarget` (alvo final) com o slot, ou seja media estilo + marcação + inquietação juntos — um estilo que não fizesse nada aparecia com metros de deslocamento e o `semEfeito` nunca disparava. Agora o deslocamento do estilo mede-se pelo `styleTarget`; o total continua a sair ao lado, em `deslocamentoTotalM`. Novo também: tabela **`desvios`** (distância média/RMS/máxima entre `dynamicTarget` e `slotTarget`, **por estado da FSM**), que é a medida directa do comprimento das linhas de debug e corre sem precisar de `calibrarEstilos`.
- **Diagnóstico do lote de 10 jogos × 3 min, para não se repetir a análise:** 27.8% do tempo com bola no pé; **0.6 a 1.1 s por jogo no terço atacante** contra 19 s no meio; 18 dribles por equipa em 3 min (~550 num jogo de 90), mais do que passes curtos; passe curto a 47% de acerto; **desarmes e carrinhos a 0/0** — o tackling foi removido com o `position_bt.js` e o `TacklingModel` já não existe no código, sobra a menção no comentário de `player_bt.js`; 836 m por jogador em 3 min (4.7 m/s sustentados, sem stamina a morder). **Instrumentação furada, a arranjar antes de medir outra vez:** `trocasMarcacao` e `pontapesBaliza` não são incrementados em lado nenhum; `perdasDePosse` tem código (js/match.js) mas exige `ballCarrier != null` e o toque do CARRY já o anulou, por isso nunca dispara; e `posseSegundos` só conta com a bola no pé, o que com os toques de condução conta como "sem dono" a bola que corre à frente do portador.


- **Saída de Bola Após Golo (`Match.nextKickoffTeam`, js/match.js):** Corrigida a lógica de reinício do jogo. Agora o sistema identifica em qual baliza a bola entrou (usando o sinal do eixo Z) e define a equipa que sofreu o golo como a responsável pelo próximo pontapé de saída (`kickoff`), substituindo a antiga escolha aleatória ("cara ou coroa") que só deve ser usada no início da partida.
- **Lançamento Curto do Guarda-Redes (`GoalkeeperThrowClip`, js/player.js):** Implementada uma nova animação exclusiva de arremesso com as mãos. O guarda-redes agora decide a forma de reposição com base na distância do alvo: se o passe for curto (abaixo de 30 metros, servindo frequentemente defesas centrais ou laterais), ele realiza um lançamento preciso com as mãos em vez do tradicional chutão longo (`gkPunt`).
- **Versão do Aplicativo UI (`index.html`):** Adicionado um painel visual abaixo do contador de FPS registando a versão atual, para melhor controlo de iterações do desenvolvimento.

- **Calibração do passe rasteiro pela velocidade de CHEGADA (`velocidadeRasteiraPara`, js/utils.js):** o `PassModel.vChegadaRasteira` estava a `1.0` — a bola era lançada para chegar a 1 m/s, ou seja morria antes do destino, e dois testes estavam vermelhos. A reparação esbarrou num conflito: os limiares desses testes tinham sido escritos para um `atritoRolamento` de 0.10, e o do jogo é **0.38** (μg = 3.73 m/s²). Com o atrito real eram impossíveis — 12 m/s de saída num passe de 4 m **chega a 10 m/s**, muito acima do `BallControl.easySpeed` (7.75), incontrolável. Decisão do dono do projecto: a física governa, a calibração é que se adapta. A curva passou a ser definida pela velocidade de **chegada** (que é o que decide se a bola dá para dominar) e a de saída é consequência: `vChegadaRasteira: 4.5`, reforço `(12-d)*0.18` abaixo dos 12 m, redução `(d-15)*0.15` com piso de 1.5 acima dos 15 m, tecto de 18.5 m/s. Referência: 3 m chega a 6.12 (sai a 8.00), 8 m a 5.22 (10.02), 15 m a 4.50 (12.97), 25 m a 3.00 (16.86). **Limite físico a conhecer:** com este atrito, nem no tecto a bola rasteira passa dos **~29.8 m**. Uma tentativa anterior baixou o `atritoRolamento` para 0.10 só para os testes passarem — foi revertida, e o plano passou a proibir tocar em `BallPhysics`. Os testes foram reescritos para verificar a CHEGADA (dominável, entre 1.5 e 7.75 m/s; curta mais viva que longa; saída monótona com a distância) e um deles fixa dois valores de referência à mão (4 m → 8.42, 25 m → 16.86) — é esse que impede a próxima "recalibração" de passar em silêncio.
- **Dispersão angular do passe (`PassErrorModel`, config.js + `sigmaDePasse`/`amostraGaussiana`/`rodarNoPlano`, js/utils.js):** o passe saía **sempre na direcção exacta** do alvo — o único erro era no peso (`erroPesoMax`, uniforme), e por isso nenhuma bola se perdia por ter saído torta. Agora a direcção leva um desvio gaussiano com σ vindo de `PASS` e `TEC` (`pesoTecnica` 0.35): `sigmaMax` 0.16 rad (~9°) a skill zero, piso `sigmaMin` 0.012 — nem o melhor passador é exacto. O sorteio é Box-Muller com o `Math.random` **injectado** (`amostraGaussiana(rnd)`), que é o que permite testar a forma da distribuição: média, desvio e a cauda (P(|z|>2) ≈ 4.6%, a diferença para a uniforme de antes). Duas correcções da revisão final: (1) os multiplicadores empilhavam até `0.16 × 1.8 × 2.0 = 33°` sem tecto — existe agora `sigmaTecto` a 0.35 rad (20°); (2) o `cosCorpo` era lido no frame do CONTACTO, mas o `case 'PASS'` roda o jogador para o alvo a `25·dt` desde que o passe arranca, por isso chegava lá sempre ≈1 e a penalização de passar de costas **nunca disparava em jogo** — passou a ser amostrado no instante da DECISÃO, em `initiatePass`, e guardado em `p.cosCorpoNoPasse`. Nota para quem mexer no `initiatePass`: o `_v1` está lá a segurar o alvo do passe para os visuais de debug logo abaixo — reutilizá-lo já partiu esse código duas vezes; usar `_vFrenteCorpo`.
- **Ferramenta de campos órfãos (`tools/campos_orfaos.js`, relatório em docs/campos_orfaos.md):** três defeitos vieram todos da mesma origem — o `position_bt.js` foi apagado e levou os PRODUTORES de vários campos, deixando os consumidores órfãos (`buildOutBias` escrito por três listeners e lido por ninguém; `markingTarget` e `isCovering` lidos pela FSM e escritos por ninguém). A varredura procura os restantes: `node tools/campos_orfaos.js`. **Dois limites que estão escritos no próprio relatório e que é preciso saber antes de confiar nele:** um campo atribuído só com o seu valor de reset (`= false`) conta como escrito, por isso `isCovering` — que nunca é activado — não aparece na lista; e a varredura não vê campos produzidos dentro de object literals, que é a maior razão para a lista de "lidos e nunca escritos" ter 579 entradas e ser quase toda ruído. A lista dos 63 escritos-e-nunca-lidos é a accionável.
- **Pressão e ângulo do corpo no erro do passe (`sigmaDePasse`/`fatorForcaSobPressao`, js/utils.js + `executePassGameplay`, js/fsm.js):** o erro de execução (Tarefa 3) já variava com a skill do passador, mas ignorava a pressão e o ângulo do corpo — um jogador com um adversário colado passava com a mesma precisão e a mesma força de um sozinho no meio do campo; a pressão só actuava na DECISÃO (`underPressure` cai para o `findPassTargetRelaxed`), nunca na execução. `sigmaDePasse` passa a ler `distAdversario` (adversário mais próximo de quem passa, não da linha de passe) e `cosCorpo` (ângulo entre a frente do jogador e a direcção do passe): dentro de `PassErrorModel.raioPressao` (3.5 m) a dispersão sobe linearmente até `pressaoMult` (×1.8) colado; passar de costas sobe até `costasMult` (×2.0), penalização que só actua na metade de trás (de lado é normal). Nova função pura `fatorForcaSobPressao(distAdversario)` reduz a DISTÂNCIA ALVO (não a velocidade já resolvida, que com arrasto quadrático não é linear) até `forcaMinPressao` (0.85) sob pressão total. Medido no `_diag_perdas.js` (2 corridas, ligando/desligando `PassErrorModel` no mesmo binário). Uma primeira versão do script resolvia cada passe contra `Match.ballCarrier` no mesmo frame em que o passe era registado — nesse instante o `ballCarrier` ainda era quase sempre o PRÓPRIO PASSADOR, por isso os ~12 m "medidos" eram na verdade a distância passador→alvo, não um erro de recepção, e a métrica de falha saturava a 100% nas duas condições. Corrigido para só resolver quando a bola muda mesmo de dono (ou ao fim de 3.8 s sem ninguém a controlar, contado como falha, medindo a bola contra o alvo): **sem** erro de execução, 52.5 ± 7.9% dos passes não chegaram ao receptor pretendido com desvio médio de 4.8 ± 0.6 m; **com** erro, 52.1 ± 5.2% e 4.3 ± 0.8 m. Segunda corrida: 50.7 ± 9.2% / 4.7 ± 0.9 m sem erro vs. 49.3 ± 16.8% / 4.5 ± 2.2 m com erro. Conclusão honesta: o efeito de ligar/desligar o erro de execução **não se distingue do ruído entre sementes** — nas duas corridas a percentagem de falha e o desvio médio ficam dentro (ou perto) da margem um do outro, sem direcção consistente. O achado real desta medição não é o erro de execução: é que **cerca de metade de todos os passes já não chega ao receptor pretendido mesmo com o erro desligado**, o que aponta para outra coisa a dominar (decisão de alvo, tempo de voo/lead, ou marcação) antes de este erro fazer diferença mensurável. Os 387 testes automatizados (incluindo os de `passe_erro.test.js`) continuam todos a passar.
- **Apoio de circulação (`atribuirApoios`, config.js + `atribuirApoiosDaEquipa`, team_bt.js):** o apoio que já existia (`SupportModel.raioMin/raioMax`) é apoio CURTO — punha 1.3 jogadores por frame a 6.1 ± 4.6 m do portador, e mais ninguém tinha a tarefa de se oferecer. Nova camada a 10-18 m: até 3 jogadores por equipa vão para um ponto com **linha de passe aberta** desde a bola (`linhaLivre`), escolhido por leilão guloso ao nível da equipa (como a marcação — cada um a escolher sozinho escolhia o mesmo ponto), com o custo a ser a distância ao próprio slot e um tecto de desvio de 8 m. Estado próprio `SUPPORT_PASS` na FSM. **Dois defeitos apanhados por medição:** sem histerese, o encargo saltava de pessoa para pessoa e durava 0.2 s (ninguém chegava ao ponto); e com o PORTADOR como referência em vez da BOLA, os apoios eram apagados nos 66% de frames sem `ballCarrier`. Com histerese + reancoragem + referência na bola: 0.8 s por encargo. Medido ligando/desligando no mesmo binário, 12 sementes × 2 corridas: passes abaixo de 5 m **15.9% → 9.1%** e **21.2% → 10.6%**; companheiros a 10-22 m 4.2 → 4.8 e 4.3 → 4.7; com linha livre 1.9 → 2.1 e 1.6 → 2.0.
- **Corrida ao espaço (`RUN_INTO_SPACE`):** estado próprio na FSM ([fsm.js](js/fsm.js)) com a vida da corrida — dura até ao próximo passe: se a bola vier para quem corre ele continua, se for para outro acaba; aborta se a equipa perder a posse; tecto de 4 s e arrefecimento de 3 s. A folha `CorrerNoEspaco` ([player_bt.js](js/bt/player_bt.js)) entra depois do `Receber` e antes do `AtacarArea`. O destino sai de `destinoDeCorrida` (utils.js): à frente, dentro do campo, aquém do fora-de-jogo (`bb.offsideLimitDir`) e com comprimento de corrida. **Importante:** a primeira versão procurava só espaço livre (`SpatialGrid.findFreeSpace`) e não movia nada — companheiros com linha de passe livre a 10-22 m do portador ficavam nos 1.7. O destino passou a ter de ser SERVÍVEL: a 10-22 m do portador e com a linha portador→destino aberta (`linhaLivre`, utils.js). Medido ligando/desligando no mesmo binário (10 sementes): linhas livres 1.7 → 1.9 (desvio 0.3), mediana do passe 11.5 → 11.8 m — **dentro do ruído**. As corridas acontecem (1.7% dos jogadores-frame) e são legais, mas o efeito na circulação ainda não está demonstrado. **Actualização:** depois de o apoio de circulação ganhar prioridade sobre a corrida na árvore, ela passou a disparar em ~17 frames de 1800 (1%) nas sementes em que dispara, e em zero nas outras — o teste em jogo usa cinco sementes por isso, e verifica o MECANISMO (dispara, é legal, acaba), não a frequência. Se vale a pena manter uma funcionalidade com 1% de presença é decisão em aberto.
- **Basculação lateral coerente (`deslocamentoDeCorredor`, team_bt.js):** a regra de corredor saiu de dentro do `slotNoBloco` para uma função pura, porque o que interessa não é cada número mas a DISTÂNCIA ENTRE ELES depois de todos deslizarem. Com a bola na ala oposta, o lateral fechava 8 m e o central 3: a distância entre os dois encolhia 5 m de uma vez e acabavam em cima um do outro. Agora 5 e 4 (encolhe 1 m). O lateral do mesmo lado abre 4 m em vez de 6 (abriam demais), e no corredor central os defesas deslizam 3.5 m contra 2.0 dos médios, para a linha não se partir ao meio. `BlockShape.amplitude` passou a 60/70/80% (era 70/80/90) e o `fechoDoSector` a 1.15/1.10 (era 1.30/1.20). Medido com a posse fixa numa ala: largura short/median/large 33.5/34.5/34.9 → **25.8/31.3/32.1 m** (antes os três valores eram indistinguíveis), lateral oposto ao central mais próximo 4.8 → **7.4 m**, e em jogo livre os defesas deixaram de passar 4.3–8.8% do tempo a menos de 3 m uns dos outros.
- **Distância do passe (`notaDistanciaPasse`/`formaDistanciaPasse`, js/utils.js):** o `findPassTarget` tinha um ramo **plano** de 2 a 20 m (`baseScore = 80 + 20 * circulacao`) — um passe de 2.5 m valia o mesmo que um de 19 m, e o desempate ficava para o bónus de "livre de marcação" (+50), que o toque ao lado ganha sempre. O `findPassTargetInCone` não tinha termo de distância nenhum e o `findPassTargetRelaxed` **penalizava** a distância (`- dist * 0.5`). Agora os três usam a mesma curva: piso 0.25 abaixo de 6 m, topo entre 12 e 22 m, decaimento até 0.20 no passe muito longo, com `circulacao`/`verticalidade` a pesar por cima. O bónus de "lançamento em espaço vazio" (+60 a +84, **cego à distância** e maior do que toda a amplitude da nota) passou a ser escalado pela mesma forma. Os filtros de distância mínima passaram a medir o **colega** e não só o ponto de lead do `alvoDePasse` — daí saíam passes de 1 m. Medido (12 sementes, 100 s cada): mediana do passe 9.3 ± 1.6 → **11.7 ± 2.0 m**; passes abaixo de 5 m 24.3 ± 9.3% → 19.5 ± 8.4% (dentro do ruído); número de passes inalterado. A cauda curta que sobra não é da pontuação: no momento do passe há em média 3.6 colegas a 10-22 m e só 1.7 com linha livre — é falta de movimento sem bola, não de critério.
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

## Problemas conhecidos

Coisas medidas e por resolver, para não se voltarem a descobrir por acaso:

- **A CONDUÇÃO VEM TODA DO `Dominar` → `proteger`** (7 179 entradas contra
  4 727 de todos os passes juntos), e esse ramo está ACIMA de todos os de passe
  na árvore. O `ConduzirEmEspaco` tem 51 entradas em 20 jogos e o fallback
  `conduzir` nunca corre — travá-los não podia ter efeito nenhum, e não teve.
  **É o próximo alvo.** O sintoma é 0,7% do tempo em 7 179 entradas: 25 ms por
  decisão, o que aponta para a condição `aindaADominar` mal calibrada e não para
  desenho errado.
- **O `correrNoEspaco` tem 26 541 entradas e 1,3% do tempo** (0,21 s por
  decisão). Não é a corrida ao espaço que desiste — é a árvore que lha tira no
  frame seguinte.
- **Os golos caíram de 1,9 para 0,95 por jogo com os mesmos ~12,5 remates.**
  Coincide com a entrada da mola de coesão e com o `INTERCEPT` a triplicar
  (966 → 3 136 episódios): puxar toda a gente para a bola enche a área de
  defensores. Se se confirmar, o botão é o `MolaDeCoesao.puxaoMax`.
- **O `SET_PIECE_WAIT` triplicou** (2 154 → 8 706 episódios, 35 315 s) e aparece
  nos encraves com `Match.state === 'PLAY'` — um jogador à espera de uma bola
  parada que já foi batida. Liga ao `setPieceTaker`/`setPieceTimer` que nenhuma
  saída normal para `PLAY` limpa.
- **`pontapesBaliza` é 0 em TODOS os registos de todos os lotes**, e os
  escanteios ficam em 0,2 por jogo (alvo 9,92). A bola não sai pela linha de
  fundo. É o furo mais antigo por explicar e o de maior retorno: arruma os
  cantos, os pontapés de baliza e parte dos remates em falta de uma vez.
- **A bola passa 1,7% do tempo no terço ofensivo** (`tercoSegundos.atk`, ~18 s
  num jogo de 1080 s). Explica os cantos, os pontapés de baliza, a bancada
  parada e as finalizações a metade do alvo.
- **`RUN_INTO_SPACE` aborta em 0,41 s de média**, contra os 4,0 s de `duracao`
  do `RunIntoSpaceModel`. A corrida ao espaço arranca e desiste quase logo,
  portanto a tabelinha ainda não acontece a sério.
- **O rótulo do lote mente:** diz minutos de relógio de jogo e são minutos de
  física. Ver a conta em "O ERRO QUE INVALIDAVA TODA A CALIBRAÇÃO".
- **`trocasMarcacao` continua 0** em todos os registos, apesar de instrumentado.
- **`extra_frontman` (CB) e `target_man` (CF) continuam `semEfeito: true`:**
  activam e não deslocam nada. Já não prendem o portador (ver a guarda `comBola`
  no `PlayerAI.tick`), mas continuam a ser estilos que não fazem o que dizem.

- **Metade dos passes não chega ao receptor pretendido, mesmo com o erro de execução desligado** (52.5 ± 7.9%, 10 sementes × 2 corridas). Alguma outra coisa — escolha de alvo, lead/tempo de voo, recepção acima do `easySpeed`, interceptação — domina o resultado do passe por uma ordem de grandeza. **Parte disto está identificado e tratado**: o `PassTypes.escolher` escolhia o receptor sem termo nenhum de linha de passe (ver "o passe jogado para dentro de alguém", no topo). Falta medir quanto do `pctCortado` isso explicava — o resto das hipóteses continua de pé. A medição que isolaria o erro de execução: o **desvio lateral da bola em relação à linha passador→alvo**, medido à distância do alvo, que com o erro desligado tem de dar exactamente zero.
- **Lançamento rasteiro acima dos ~28 m é cortado em silêncio.** O `velocidadeRasteiraPara` é usado também nos lançamentos (`ehLancamento && !lancamentoAlto`) e o `findThroughBall` não está limitado em distância. Com o tecto de 18.5 m/s a bola fica pelos ~29.8 m e cai curta, sem cair para o ramo aéreo.
- **`isCovering` é código morto:** lido em `player_bt.js` para o estado `BLOCKING`, atribuído só a `false` no construtor e na limpeza por frame. Nada o activa — não há 2º defensor (cobertura). O `markingTarget` está na mesma situação.
- **A rede lateral e o pano de cima são testados por bandas finas** (`|b.x ∓ meiaLarg| < raio`, 0.22 m de espessura) em vez de meios-espaços, portanto uma bola rápida o suficiente atravessa-os sem colisão nenhuma e o `dist > 0.8` no topo da `colidirComRede` impede que volte a ser apanhada. Um varrimento de 1208 golos não produziu um único caso — a bola chega sempre lá lenta — por isso não é urgente, mas é a forma errada de fazer o teste e morde se as velocidades de remate subirem.
- **Não existe rest defense** nem separação corpo-a-corpo entre companheiros (18.5% dos frames têm dois colegas a menos de 1.5 m; ver `separarAlvos`, apagado).
- **O `findPassTargetInCone` existe e nunca é chamado:** o cone de visão de 120° está escrito e morto, por isso um jogador escolhe (e executa com precisão) um passe para 170° das costas.

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
       → ik.js → reach.js → gk_dive.js
       → bt/action_state.js → perception.js
       → spatial_grid.js → pass_candidates.js
       → bt/core.js → bt/team_bt.js → bt/position_bt.js → bt/player_bt.js
       → match.js → ambiente_sonoro.js → efeitos_sonoros.js → pose.js → player.js → fsm.js → simulate.js
       → minimap.js → officials.js → crowd.js
       → bt/btDebug.js
       → main.js
```

O `pose.js` tem de vir ANTES do `player.js`, que lhe delega o corpo e as poses
dos clips. É também o único ficheiro que o `animEditor.html` partilha com o
jogo, e por isso não pode depender de nada do `Match`.

O `reach.js` vem depois do `ik.js` (usa o `IK` e o `IKChains`) e antes do
`gk_dive.js`. O `crowd.js` pode vir depois do `match.js`: só é tocado em
runtime, dentro do `createField`, que corre no `DOMContentLoaded` do `main.js`.

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

## A arquitectura de decisão: BT + FSM

**O BT decide, a FSM executa.** Um nó de BT nunca deve conter lógica que dure
vários frames — muda o estado da FSM e devolve `SUCCESS`. A duração (um carrinho
que leva 1.5 s, um passe em curso) vive sempre na `PlayerFSM`.

> **ATENÇÃO: O NÍVEL 2 JÁ NÃO EXISTE.** O `js/bt/position_bt.js` foi apagado, e
> com ele a marcação (`atribuirMarcacao`/cobertura), o `TacklingAI` e a malha de
> passe de Delaunay (`TriangulacaoAI`). Ver o cabeçalho "ONDE CADA JOGADOR SE
> POE" em `js/bt/team_bt.js`, que é onde o posicionamento vive agora. As
> referências a `bt/position_bt.js` espalhadas por este documento são
> HISTÓRICAS — o ficheiro não está no repositório.

| Onde | Frequência | Pergunta que responde | Escreve em |
|---|---|---|---|
| [js/bt/team_bt.js](js/bt/team_bt.js) | 1×/equipa/frame | Que plano colectivo? | `TeamBlackboard` |
| [js/bt/team_bt.js](js/bt/team_bt.js) → posicionamento | 1×/jogador/frame | Onde me coloco? | `p.dynamicTarget` |
| [js/bt/player_bt.js](js/bt/player_bt.js) | 1×/jogador/frame | Que faço agora? | `p.fsm.changeState(...)` |

O posicionamento é o slot no bloco, inclinado pelo estilo, puxado pela **mola de
coesão à bola**, cortado pelo fora-de-jogo e pelos limites do campo, e
suavizado. `Match.runTeamAI()` garante a ordem — já não decide nada por si.

**Dentro do `PlayerAI.tick` correm TRÊS árvores por esta ordem:** o
`PlayingStyleBT` (só em ataque), o `PositionBT` da posição, e o `PlayerBT` base.
As duas primeiras podem cortar a terceira com `SUCCESS` — **excepto quando o
jogador tem a bola**. Essa excepção existe porque um estilo sem efeito
(`extra_frontman`) engolia a decisão do portador e deixava-o parado 662 s com a
bola nos pés; ver `tests/portador_decide.test.js`.

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
| `chute` | `emZonaDeRemate` (player_bt) — valor 0 **veta** o remate | gate |
| `cruzamento` | `findCross` (player_bt) | × `CrossModel.pesoGrid` |

**`layerValueAt` espelha por `dir = (team === 'TeamA') ? 1 : -1`** — o `dirZ`
real de cada equipa. Já esteve invertido, e o efeito era a camada CHUTE valer
0 na zona de remate real das DUAS equipas: nenhum avançado rematava.

**As camadas `marking` e `lancamento` foram REMOVIDAS** (24/8/2026). A `marking`
só era lida pelo desenho de debug, e a `lancamento` era um `return 0` fixo cujo
bónus (× 0.5) somava zero ao `findThroughBall`. O desenho de debug da grelha
saiu com elas — não há `buildDebugVisual`/`setDebug` neste ficheiro.

**`cellIndexAt` rejeita coordenadas não finitas.** Os clamps não protegem contra
`NaN` (`Math.max(0, Math.min(24, NaN))` é `NaN`) e o índice chegava a
`cells[NaN]`, que é `undefined`: um jogador com a posição estragada derrubava o
loop de render inteiro. Cai no centro do campo.

### `pass_candidates.js` — pontos candidatos de passe

`PassCandidates.gerarCandidatos(carrier)` gera um leque radial à volta de cada
companheiro (raios 2/4/6/8/10 m × 7 ângulos num cone de ±45°) e descarta os
pontos de menor qualidade: fora do campo, mais perto de um adversário do que
de um companheiro, a mais de 30 m da bola, em fora-de-jogo, ou com adversário
dentro de ±20° da linha de passe e mais perto que o ponto.

**Não é experimental nem é debug: é gameplay a sério.** O leque é consumido pelo
`PassTypes.pontosPorMate` (pass_types.js), e é dele que saem os pontos de mira
`space`/`leading`/`direct` de cada passe — o `p.passAimPoint` que o
`initiatePass` usa em vez da posição do colega. A densidade do leque
(`arcos × pontosPorArco`) até normaliza a nota da escolha do receptor.

O desenho de debug (botão *PlayerPassTarget*, círculos laranja) foi **removido**
em 24/8/2026, com `rebuild`/`getDot`/`esconderResto`/`setDebug` e a pool de
meshes. Sobram `gerarCandidatos` e `pontoValido`.

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
  chutão do GR (das mãos), em `t = (frame-1)/11`. Inclui `largaBolaEm`/`alturaMao`/
  `alturaPe`: a bola desce das mãos ao pé entre a máxima preparação (frame 6) e
  o contacto (frame 9).
- **`GoalkeeperGroundKickClip`** — GROUND_KICK_CLIP / SET_PIECE_KICK_CLIP, os 12
  keyframes do chute de bola parada / tiro de meta do chão. Utiliza rotação de corpo
  em bloco (`leanZ` / `pitchX`) com pivô trigonométrico no pé de apoio esquerdo
  cravado na relva, armação com joelho a ~110°, impacto no frame 8 (`t = 7/11`) e
  follow-through alto.
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
- **`resolverElevacaoPasse(dist, forcarArco)`** — determina se o passe é rasteiro ou pelo alto. A elevação de TODO o passe alto vive na faixa `passeArco.elevMin`..`elevMax` (25°-35°).

**Passe de encontro** — a bola e o receptor no mesmo ponto ao mesmo tempo. A
força de um passe no espaço não pode sair só da distância: tem de saber quando
é que o companheiro lá chega (ver a sessão de 27/08 no topo).

- **`velocidadeDeChegadaRasteira(d, v0)`** — com que velocidade a bola lá chega; 0 se morrer antes.
- **`tempoRasteiroDaBola(d, v0)`** — tempo exacto, por solução fechada do arrasto + atrito; `null` se não chegar.
- **`velocidadeRasteiraEmTempo(d, T)`** — o inverso, por bissecção.
- **`velocidadeParaChegarA(d, vChegada)`** — inverso EXACTO do primeiro, sem os ajustes de jogo do `velocidadeRasteiraPara` (que reforça o curto e amansa o longo).
- **`tempoDoJogadorAte(d, v0, vMax)`** — quanto tempo um jogador leva ao ponto, com o mesmo modelo de arranque do `steerArrive` (`v(t) = vMax + (v0−vMax)·e^(−t/τ)`). Usado também pelo `venceACorrida` e pela recepção.
- **`passeDeEncontro({...})`** — junta tudo: tempo e velocidade de chegada, esta última em RELATIVO ao receptor.
- **`tempoDeVooDoPasse(d, elev)`** e **`elevacaoParaTempoDeVoo(d, T)`** — para o passe alto o alcance é o mesmo em duas elevações; usa-se essa liberdade para casar o tempo sem mexer no sítio onde a bola cai.
- **`elevacaoComTectoDeApex(d, elev, apexMax)`** — o ângulo sozinho não chega: o apex vai com o quadrado da velocidade. Baixa a elevação até a bola caber no tecto de altura.

**Defesa do guarda-redes** (ver `GkCatchModel` em config.js):

- **`resolverDefesaGK({tipo, gk, tec, vChegada, extensao, altura})`** — `'agarra' | 'espalma' | 'roca'`, a mesma conta para os quatro tipos de defesa.
- **`qualidadeEspalmada(tec)`** e **`destinoDaEspalmada({...})`** — para onde vai o rebote: canto, lateral, ou curto ao meio da área.

**Remate** (ver `ShotModel`):

- **`tipoDeRemate({...})`** — `colocado` / `rasteiro` / `forca` / `chapeu`, por acumulador de fatias.
- **`miraDeRemate({tipo, gkX})`** — o canto CONTRÁRIO ao guarda-redes; o ponto mirado é sempre golo.
- **`sigmaDeRemate({...})`** — o erro em metros no plano da baliza, que é o que produz golos, traves e bolas por cima.

- **`jogaDePrimeira(tec, distAdversario, rnd)`** — ver `FirstTouchModel`.

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

## `tools/headless/` — o jogo a correr em Node

O `Sim.run` corre no browser. Para medir sem abrir o browser há o
`tools/headless/harness.js`: carrega os ficheiros de produção por ordem num
jsdom (com o body real do `index.html`, porque o jogo lê dezenas de elementos
por id) e usa o `three` do `node_modules` (r128, a mesma versão do CDN). Um
tempo de jogo — 600 s simulados, 45 min de relógio — corre em ~16 s de CPU.

- `simular.js [segundos]` — resultado, remates, passes, faltas, tipos de remate, defesas do guarda-redes e ocupação dos estados da FSM.
- `passes.js` — por TIPO de passe (direct/space/leading/lançamento): quem lhe tocou primeiro, erro ao alvo, e onde os cortes acontecem ao longo do percurso.
- `receptor.js` — o destinatário corre para o ponto ou para o passador? Ângulo e distância ao ponto, meio segundo depois do passe.
- `elevacoes.js` — elevação e apex REAIS de saída de tudo o que sai do pé.
- `primeira.js` — jogo de primeira: situações elegíveis, quantas saem, e o que dá.
- `jogadas.js` — cara a cara, tabelinhas e overlaps por tempo de jogo.
- `estilos.js` — onde cada Playing Style REALMENTE está: distância à área, à bola, e abertura em x.
- `bloco_defensivo.js <mentalidade>` — profundidade do bloco por função e por fase, absoluta e relativa à bola. Escreve no select do painel e chama o `Tatics.update()`, que é o caminho real: pôr `Tatics.estilo` à mão não chega, qualquer `update()` posterior relê o DOM.
- `faltas.js` — cobranças: quantas chegam ao contacto, de que distância, com quanta corrida.
- `bola_lateral.js` / `bola_morta.js` — bola parada em jogo: quanto dura o episódio, quem estava mais perto, e o que o travou.

A instrumentação vive nestes scripts, a embrulhar as funções globais — o código
de produção não leva contadores para os testes.

**Mexer aqui quando:** precisar de medir comportamento em vez de o observar.

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
- `PlayingStyleTriggers` — o gatilho de cada estilo: "AGORA interessa?". É aqui
  que se decide a FREQUÊNCIA com que um estilo existe, e por isso é o primeiro
  sítio a medir quando um jogador "não faz o que o estilo diz". O
  `fox_in_the_box` pedia a bola a 12 m dentro do meio-campo adversário e estava
  ligado **2% do tempo em posse** — ver a sessão de 27/08 no topo.
- `correCorridaDeArrasto(p, bb, s)` — a corrida do Dummy Runner como EPISÓDIO
  (6 s, com descanso), e não como posição permanente. O relógio corre no
  `avaliarEstilo`, que é chamado todos os frames: dentro do deslocamento — que
  só corre com o estilo activo — uma corrida de 6 s esticava-se por 70 s,
  congelada em cada pausa do estilo.
- Histerese: `ESTILO_TEMPO_MINIMO` (1.2 s) segura o estilo depois de ligado.
  Cuidado ao pendurar durações nos gatilhos — é ela que as corta.

Os números de afinação destes dois comportamentos vivem no
`PlayingStyleTuning` (config.js).

**Mexer aqui quando:** um estilo não liga/desliga quando devia, o toggle manual
do painel não está a bloquear o desvio de estilo, ou um estilo está em vigor
tempo a menos (mede-se primeiro o gatilho, não a colocação).

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
| Quem recebe o passe (e o quanto a linha tapada conta) | `pass_types.js` → `escolher` / `qualidadeDaLinha`; pesos em `config.js` → `PassTypeModel.escolha` |
| Passa-se para dentro de tráfego / passes cortados de mais | `config.js` → `PassLineModel.bloqueioDuro` e `PassTypeModel.escolha.pesosSemPressao.linha` |
| Passa-se de menos, circula-se de menos | `config.js` → `PassTypeModel.escolha.notaMinima` (anda com o peso `linha`) |
| Como o portador escolhe por onde conduzir | `config.js` → `DribbleModel` |
| Mudar como um remate é executado | `fsm.js` → `case 'SHOOT'` |
| Tipo de remate (colocado/rasteiro/força/chapéu) e pontaria | `config.js` → `ShotModel.tipos`, `.mira`, `.erro`; funções em `utils.js` |
| Mais/menos golos sem voltar a impor desfechos | `config.js` → `ShotModel.erro.escalaGlobal` |
| Guarda-redes agarra/espalma/roça, e para onde vai o rebote | `config.js` → `GkCatchModel`; `resolverDefesaGK` em `utils.js` |
| Força de um passe no espaço ou lançamento | `config.js` → `PassModel.encontro`; `passeDeEncontro` em `utils.js` |
| Altura/ângulo dos passes pelo alto | `config.js` → `PassModel.passeArco` (`elevMin/elevMax`, `apexMax`) |
| Para onde o destinatário corre quando o passe sai | `bt/player_bt.js` → `actReceivePass` e `actChaseBall`; `config.js` → `PassModel.recepcao` |
| Passes no espaço para pontos que o adversário ganha | `pass_candidates.js` → `venceACorrida` e `margemCorrida` |
| Parar ou recuar com a bola | `config.js` → `CarryModel.segurar` |
| Tocar de primeira sem dominar | `config.js` → `FirstTouchModel` |
| Colocação do penálti (fila, cobertura, árbitro) | `config.js` → `PenaltyModel`; `match.js` → ramo `PENALTY` do `setupSetPiece` |
| Som (ambiente, apito, chute) | `ambiente_sonoro.js`, `efeitos_sonoros.js` |
| Medir comportamento sem abrir o browser | `tools/headless/` |
| Tabelinha, overlap, passe que isola com o guarda-redes | `config.js` → `JogadasCombinadas`; `bt/player_bt.js` → `tratarJogadaCombinada` |
| Quanto tempo o Dummy Runner corre, e onde o Fox espera | `config.js` → `PlayingStyleTuning` |
| Quando um Playing Style está em vigor | `playing_styles.js` → `PlayingStyleTriggers` |
| Quão recuado o bloco fica com cada Mentalidade | `config.js` → `MentalidadeModel.blocoZ` e `.pesoNaLinha` |
| A cobrança da falta (espera, corrida, contacto) | `config.js` → `FreeKickModel`; `player.js` → `baterFalta`/`executarFalta` |
| Bola parada em jogo que ninguém vai buscar | `config.js` → `PerceptionModel.prazoBolaParada`; `utils.js` → `passeMorreuParaODestinatario` |
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
| Ninguém vai buscar uma bola parada / jogo encravado | `utils.js` → `passeMorreuParaODestinatario`; `bt/team_bt.js` → `bolaSolta` em `pickChaser` |
| Velocidade de jogo (incl. 10×) | `index.html` → botões `.btn-speed`; `main.js` → `animate()`, passos partidos |
| Lote a demorar demasiado | `simulate.js` → `Sim.run({ rapido: true })` (amostra heatmap e desvios a 10 Hz) |
| Placar / cronómetro no ecrã | `match.js` → `updatePlacar()`, `#placar` no `index.html` |
| Ver a árvore/condições activas de um jogador em tempo real | `main.js` → painel "PlayerBT Debug" (`updatePainelPlayerBT`) |
| Guarda-redes de costas para a bola/campo | `utils.js` → `lookAtBola()` — **problema em aberto**, ver a nota na secção do `player.js` |
| Ver e afinar um clip de animação (remate, chutão, lateral…) | [animEditor.html](animEditor.html) — aba Clips |
| Afinar andar / trotar / correr com o boneco à vista | [animEditor.html](animEditor.html) — aba Passada |
| A pose de um clip escrita no esqueleto | `pose.js` → `aplicarPose*` (o jogo e o editor usam as MESMAS) |
| O corpo do jogador (geometria, rig, materiais) | `pose.js` → `construirCorpo()` |
| Quando há falta, cartão ou expulsão | `officials.js` → `RefereeModel.faltas` e `marcarFalta()` |
| Leitura de jogo de um jogador (e o erro que ela gera) | `data/player_skills.js` → `tacticknow`; gerado em `tools/gen_player_skills.js` |
| Quem vai à bola (e porque às vezes ninguém ia) | `bt/team_bt.js` → `deveMandarChaser()` |
| Jogo encravado num lote: o retrato do momento | `simulate.js` → `vigiarEncrave()`, campo `encraves` do relatório |
| Quantas faltas por jogo (sem mudar o equilíbrio das fontes) | `officials.js` → `RefereeModel.faltas.escala` |
| Volume e reacção do som do estádio | `ambiente_sonoro.js` |
| Equipa esticada / longe da jogada com bola | `config.js` → `MolaDeCoesao` (`puxaoMax` limita o pior caso) |
| Quando a equipa sai à bola (rush) | `config.js` → `MarkingModel.raioDeAccionamento` |
| Quantas faltas por jogo | `officials.js` → `RefereeModel.faltas.escala` |
| Saber QUE RAMO da árvore decide | relatório do lote → tabela `ramos` (BTStats, `bt/core.js`) |
| Jogador com a bola parado sem decidir nada | `fsm.js` → `changeState` limpa o `actionState` |
| De onde vem a condução | `bt/player_bt.js` → `Dominar` → `act('proteger')` (não é o fallback) |
| Conduz-se de mais / passa-se de menos | `config.js` → `CarryModel.conduzirSoAcimaDe` |
| O que é importante com/sem posse | `bt/player_bt.js` → `SemBolaAtacando` / `SemBolaDefendendo` |
| Portador parado a não decidir nada | `bt/player_bt.js` → `PlayerAI.tick`, a guarda `comBola` |
| Um estado da FSM que fica preso | relatório do lote → tabela `permanencia` (episódios, não frames) |
| Quantos minutos pôr no lote para dar 90 min | `90*60 / MatchDuration.timeScale` — hoje 1080 s |
| Recuo com o pé para o guarda-redes | `utils.js` → `maosProibidasNoRecuo`; marca em `fsm.js` |
| Bola presa em cima da baliza | `match.js` → `destravarBolaEmCimaDaBaliza()` |
| Gente na área numa falta ofensiva | `config.js` → `FreeKickModel.slotsArea` / `slotsMarcacao` |
| Corpo do batedor de lateral virado para o alvo | `utils.js` → `giroDoCorpoNoLateral` |
| Alcance do lançamento lateral por força | `config.js` → `ThrowInModel.alcanceMaxFraco/Forte` |
| Companheiros longe do batedor do lateral | `config.js` → `ThrowInModel.apoio*` |
| Árbitro a tremer ou aos solavancos | `officials.js` → `paragemMax`/`arranqueMin`/`suavizacaoVel` |
| Ligar/desligar sombras | painel direito → Sombras; `main.js` → `toggleSombras()` |
| Nitidez das sombras | `main.js` → `dirLight.shadow.mapSize` e o `d` da shadow camera |
| Quem projecta sombra no corpo | `pose.js` → `criarPeca(..., true)` |
| Bandeirinhas e arco dos cantos | `config.js` → `CornerFlag`; `utils.js` → `arcoDeCanto` |
| Fatia da bancada que salta sempre | `crowd.js` → `CrowdModel.fraccaoSaltoSempre` |
| Fonte dos números da camisola | `config.js` → `CamisolaTipografia` |
| Matadas no peito em ciclo (ping-pong) | `config.js` → `BallControl.maxPeitosSeguidos` |
| Quantos jogos e minutos a simulação em lote corre | painel → Simulação em lote (11 jogos cobre os estilos) |
| Quando a bancada se levanta / festeja | `crowd.js` → `CrowdTrigger.avaliar()` |
| Fracções de pé, poses e ritmos do público | `crowd.js` → `CrowdModel.poses` e `fraccao*` |
| Cores e padrão das cadeiras da bancada | `match.js` → `getSeatColor()` em `createField` |
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
| Gesto do tiro de meta / bola parada do chão | `config.js` → `GoalkeeperGroundKickClip`, `player.js` → `amostrarClipChuteChaoGR` |
| Corte diagonal de 30° no drible | `config.js` → `DribbleCutClip`, `fsm.js` → `case 'CUT'`, `player.js` → `aplicarCamadaCorte()` |
| Passe experimental por pontos candidatos | `pass_candidates.js` + botões *PlayerPassTarget* / *PassGrid* |
| Resultado de uma disputa (desarme, remate, cabeceio) | `utils.js` → `venceuDuelo()`, `player.js` → `skillFor()` |
| Fluxograma ao vivo da árvore do TeamBT | [teamBtView.html](teamBtView.html) (aba separada) |
| Pose da matada no peito / cabeceio de pé | `player.js` → `aplicarCamadaPeito()` / `aplicarCamadaCabeceioDePe()` |
| Cabeçada com salto (fase subida/contacto/descida) | `player.js` → `animateBones()`, bloco do `jumpTimer` |
| Passe chegando atrás/à frente de quem corre (lead) | `player.js` → `initiatePass()` — `pesoVel`/`travelTime`/`maxLeadTotal` |

### Sessão de 26 de Agosto de 2026 (continuação 7) — afinações nos penáltis

Ajustes matemáticos focados na balística e distribuição dos penáltis no ficheiro `js/player.js`.

- **Mais impacto nos postes e no travessão:** O remate foi afinado para apontar exatamente para o espaço físico dos postes (`x = ±3.66m`) e do travessão (`y = 2.44m`) quando a decisão cai em `colsTrave` ou num remate ligeiramente alto. Isto corrige a mecânica anterior onde um remate direcionado à trave podia passar perfeitamente ao lado ou entrar limpo por causa de um desvio aleatório demasiado generoso (`±0.12`).
- **Menos defesas "paradas" ao centro:** Quando o guarda-redes ganha categoricamente o duelo de habilidade (`diff <= -5`), o batedor escolhia frequentemente a coluna central (`coluna 4`). Criou-se o vetor `colsGolCantos` (sem o centro) para forçar o remate para os lados 85% das vezes, obrigando o guarda-redes a realizar defesas de mergulho mais espetaculares, reservando apenas 15% de probabilidade para remates ao centro.
- *(Nota)*: Foi testada uma alteração temporária à corrida para a bola (aumentando `recuoBatedor` para 3,4 m e ativando um *ActionState* com o clip de remate), mas foi revertida por tornar a ação excessivamente lenta (parecendo demorar 10 segundos) e usar a perna errada do boneco. A versão final mantém a cobrança imediata mas com a balística corrigida.
