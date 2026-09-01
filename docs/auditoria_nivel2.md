# Auditoria da camada posicional (o "nível 2")

Feita a 1 de Setembro de 2026, a pedido: *"tem muita coisa errada, deve ter
código sobrescrevendo outros; organiza as prioridades em ataque e defesa"*.

Tudo o que está aqui foi **medido** com o jogo a correr sem ecrã
(`tools/headless/`), 300 s de física por corrida, amostras a 10 Hz, as duas
equipas. Onde há um número, há uma medição; onde não há, está escrito que é
leitura de código.

---

## 1. O que é hoje o "nível 2"

**O ficheiro `js/bt/position_bt.js` não existe.** Foi apagado, e com ele a
marcação, o `TacklingAI` e a malha de passe. O que se chama nível 2 é hoje a
**camada posicional**, e vive em três sítios:

| Onde | O quê |
|---|---|
| `js/bt/team_bt.js` → `computeBlock` | o rectângulo do bloco |
| `js/bt/team_bt.js` → `PosicionamentoAI.tickBase/tickFinal` | o slot de cada jogador e todos os desvios |
| `js/playing_styles.js` → `aplicarEstiloPosicional` | o desvio pessoal do Playing Style |

E o **nível 3** (`js/bt/player_bt.js`) escreve por cima de tudo isso, porque
quase todas as folhas dele acabam num `p.dynamicTarget.set(...)`.

---

## 2. A cadeia real, por ordem de execução

Cada linha escreve por cima da anterior. `X` e `Z` dizem em que eixo cada
passo mexe.

| # | Passo | Onde | Eixo |
|---|---|---|---|
| 0 | postura, bloco, chaser/intercetor/blocker, pares de marcação | `TeamBT` + `computeBlock` | — |
| 1 | **slot puro** no bloco (`slotTarget`) | `slotNoBloco` | X, Z |
| 2 | inércia pós-passe (não recuar 4 s) | `tickBase` | Z |
| 3 | afastamento de 7,5 m do portador | `tickBase` | X, Z |
| 4 | **Playing Style** (largura, ombro da defesa, dentro da área, corrida de arrasto, colar à linha…) → `postoBase` | `aplicarEstiloPosicional` | X, Z |
| 5 | atribuição de marcações (usa o `postoBase` de todos) | `atribuirMarcacoesDaEquipa` | — |
| 6 | marcação posicional | `aplicarMarcacaoPosicional` | X, Z |
| 7 | inquietação (micro-movimento de quem chegou) | `aplicarInquietacao` | X, Z |
| 8 | tecto do estilo | `aplicarTectoDoEstilo` | Z |
| 9 | inércia pós-passe (**outra vez**) | `tickFinal` | Z |
| 10 | mola de coesão à bola | `molaParaABola` | X, Z |
| 11 | corte de fora-de-jogo | `tickFinal` | Z |
| 12 | distância mínima no lance de lateral | `tickFinal` | X, Z |
| 13 | **pêndulo** para o lado da bola | `tickFinal` | X |
| 14 | **rest defense** | `tickFinal` | Z |
| 15 | **separação lateral↔extremo** | `tickFinal` | X |
| 16 | clamps do campo + alisamento | `tickFinal` | X, Z |
| 17 | **propõe** o slot (ESTRUTURA) ou a espera (MICRO) | `tickFinal` | X, Z |
| 18 | **nível 3**: PlayingStyleBT → PositionBT → PlayerBT, e o que a árvore escrever vira uma **proposta** (BOLA ou ACÇÃO) | `PlayerAI.tick` | X, Z |
| 19 | **resolve**: a proposta mais forte, cortada pelos limites de prioridade igual ou superior → `dynamicTarget` | `resolverAlvo` | X, Z |

Os passos 13, 14 e 15 são desta sessão; os 17 a 19 são a implementação das
prioridades (secção 5). Os limites — fora-de-jogo (LEIS), rest defense e
transição defensiva (SEGURO) — deixaram de ser cortes locais e passaram a ser
propostos onde eram calculados, para valerem também sobre o passo 18.

---

## 3. Quanto cada troço mexe no alvo

Distância entre o alvo à entrada e à saída de cada troço, por jogador de campo:

```
slot puro   -> posto com estilo (4)          média 1,24 m    p95 10,3 m
posto       -> alvo do TeamBT (6..16)        média 8,76 m    p95 27,9 m
alvo TeamBT -> alvo FINAL (18)               média 7,91 m    p95 41,9 m
```

**O slot é a coisa que menos manda no sítio onde o jogador acaba.** O bloco
põe-no algures, e os passos 6 a 16 mudam-lhe a posição quase 9 m em média — e
depois a árvore muda outros 8 m. É por isso que afinar o bloco "não se nota":
o que se vê no ecrã é sobretudo o passo 18.

### A árvore reescreve 45% das leituras (desvio > 3 m)

Por estado da FSM em que isso acontece:

```
MOVE_TO_POS      55%      SUPPORT_PASS     11%
SET_PIECE_WAIT   13%      RUN_INTO_SPACE    3%
MARKING          12%      CARRY             2%
```

E, dentro das reescritas em `MOVE_TO_POS`:

```
esperar pelo slot (alvo = a própria posição)   ~25%
alvo = a bola (chaser/intercetor/bola solta)   ~10%
outras folhas                                  ~65%
```

`MOVE_TO_POS` é o estado "sem tarefa", e mesmo assim é onde a maior parte das
reescritas acontece: o jogador está a ser mandado para um sítio que **não é** o
slot que o nível 2 calculou.

---

## 4. Defeitos encontrados

### 4.1 O corte de fora-de-jogo não valia nada (CORRIGIDO)

Medido antes: **9,4% dos alvos da equipa com bola estavam além da linha do
fora-de-jogo**, e **100% deles tinham sido escritos depois** do nível 2 —
nenhum vinha do bloco. O corte do passo 11 nunca vazou; o que faltava era
alguém respeitá-lo a seguir. O `AtacarArea`, por exemplo, escreve um `z`
absoluto da área sem olhar para linha nenhuma.

Corrigido com uma guarda no fim do `PlayerAI.tick` (passo 19), que é o único
sítio por onde todos os ramos passam. Excepções: quem tem a bola, quem vai à
bola, e tudo o que não seja jogo corrido.

```
alvos em fora-de-jogo    9,4%  ->  3,4%   (o resto é portador e bola parada)
corpos em fora-de-jogo   1,8%  ->  0,8%
```

### 4.2 O tecto do estilo corre antes da mola e dos cortes

O passo 8 diz "este jogador não passa daqui", e os passos 10 e 13 mexem-lhe
outra vez. A ordem certa é o tecto ser dos últimos; hoje há três passos depois
dele que lhe podem furar o limite em Z (mola de coesão, rest defense) e dois em
X. **Não medido** — leitura de código; fica como próximo alvo.

### 4.3 A inércia pós-passe está escrita duas vezes (2 e 9)

O mesmo bloco de código, com a mesma condição, nos dois lados da cadeia. Não é
inofensivo: entre os dois corre o estilo e a marcação, portanto o passo 9 pode
desfazer um desvio legítimo da marcação. **Não medido**; é uma duplicação
óbvia a eliminar.

### 4.4 Ninguém separa corpos

`separarAlvos` está apagado (já estava na lista de problemas conhecidos).
Medido agora ao nível dos ALVOS: **1,4% dos pares de companheiros têm o alvo a
menos de 3 m** um do outro. Ao nível dos corpos é muito pior — é a aglomeração
à volta da bola que já está documentada.

### 4.5 O par lateral/extremo partilhava a faixa (CORRIGIDO)

Depois de ligar o pêndulo, o par do mesmo lado ficava a menos de 4 m em **10%**
do tempo (eram 4%), e em 211 de 269 casos os **alvos** estavam juntos — não era
inércia dos corpos. Regra nova (passo 15): quem fica por fora depende do lado —
no lado da bola é o extremo, no lado contrário é o lateral, que está a cobrir o
extremo adversário. Cada um aplica a regra a si próprio comparando com o ALVO
do outro, para o resultado não depender da ordem de processamento.

```
par a menos de 4 m       10%  ->  2..4%      distância média   12,6 m -> 21 m
```

### 4.6 Não havia rest defense (CORRIGIDO)

Medido com a equipa a atacar: **0,76 adversários sem ninguém entre eles e a
própria baliza**, e três ou mais em **12%** do tempo. Os centrais e o médio
organizador subiam com a jogada.

Regra nova (passo 14): os `defesasAtrasDaBola` (3) mais recuados e o
`medioAtrasDaBola` (1) mais recuado não passam a linha da bola.

```
adversários livres nas costas   0,76 -> 0,51..0,56    (>=3 em 12% -> 5..7%)
avanço médio dos centrais      -9,8 m -> -14,3 m
avanço médio dos médios         4,9 m ->  -0,7 m
```

---

## 5. Prioridades — IMPLEMENTADAS

Já não é uma proposta: está no código, em `js/bt/alvo.js`. Ninguém escreve o
alvo — cada camada **propõe**, e o alvo é resolvido uma vez por frame.

```
p.proporAlvo(prio, x, z, fonte)          "quero ir para aqui"
p.proporLimiteAvanco(prio, max, fonte)   "não passes daqui para a frente"
resolverAlvo(p, bb)                      decide, e escreve o dynamicTarget
```

Regra, em duas linhas:

1. o **alvo** é a proposta de prioridade mais forte (número mais baixo);
2. aplicam-se-lhe os **limites** de prioridade igual ou mais forte do que ele.

É a segunda linha que dá sentido à tabela: uma corrida (ACÇÃO) é cortada pelo
rest defense (SEGURO) e pelas leis do jogo; um chaser (BOLA) ignora o rest
defense — o homem que vai à bola vai — mas não ignora as leis.

| # | Nível | Com bola | Sem bola |
|---|---|---|---|
| 1 | LEIS | fora-de-jogo, limites do campo | limites do campo |
| 2 | BOLA | portador, receptor, batedor | chaser, intercetor, bloqueador |
| 3 | SEGURO | rest defense | transição: não subir |
| 4 | ACÇÃO | corridas, apoios, estilo | marcação, cobertura |
| 5 | ESTRUTURA | slot no bloco, faixas | bloco, linha, faixas |
| 6 | MICRO | inquietação, espera pelo slot | inquietação |

### Porque é que a ACÇÃO ficou ACIMA da ESTRUTURA

A primeira versão desta tabela (a da secção 5 anterior) tinha a estrutura por
cima: o slot ganhava ao apoio, à corrida, à marcação. Implementada e medida,
**matou o jogo**:

```
estrutura acima da acção    24 passes em 10 min de física
acção acima da estrutura   ~140 passes em 10 min
```

Sem poder sair do slot para se oferecer, não há a quem passar. O slot é onde se
está **quando não se está a fazer nada**; a acção é o que se faz. O que a
estrutura tem de garantir é o que a equipa não pode perder — e isso é o nível 3
(SEGURO), que ficou acima da acção.

### O que a implementação obrigou a aprender

- **Não chega ver se a árvore mudou o alvo.** O chaser vai à bola no estado
  `MOVE_TO_POS` e escreve o MESMO alvo que escreveu no frame anterior (a bola
  não se mexeu). Sem propor, a estrutura ganhava e ninguém ia à bola: 17 passes
  em 8 minutos. Quem tem tarefa de bola propõe sempre.
- **O rest defense tem de escolher pelo POSTO, não pela posição do momento.**
  Pela posição havia porta giratória: o defesa que sobe deixa de ser dos mais
  recuados, perde o limite, e sobe mais. Medido: centrais a -12,0 m de avanço
  médio pela posição, -15,9 m pelo posto.
- **O alisamento é da posição, não da acção.** Antes, o `PositionSmoothing`
  alisava tudo (o alvo era um só). Com o alvo a ser escolhido de novo em cada
  frame, alisar tudo atrasa as tarefas e não alisar nada faz a equipa tremer.
  Aliza-se quando ganha ESTRUTURA ou MICRO; BOLA e ACÇÃO entram a direito. Foi
  isto que devolveu a percentagem de passe ao valor de antes.

### O que se mediu, com o interruptor (`BlockShape.resolverAlvoActivo`)

Oito minutos de física por configuração, mesma versão do código:

```
                              SEM resolvedor      COM resolvedor
passes certos / tentados       87/116 = 75,0%      82/109 = 75,2%
remates                             16                  12
adversários livres nas costas     0,77                0,51
   três ou mais                     12%                  6%
alvos em fora-de-jogo              9,4% (*)            3,0%
   destes, do portador               --                 63%
pares de companheiros com
   alvos a menos de 3 m            1,3%                0,1%
```

(*) o 9,4% é a medição original, antes de existir qualquer corte final; com o
interruptor desligado hoje mede-se menos, porque os limites continuam a ser
aplicados localmente onde eram.

O que o resolvedor dá não é jogo melhor — é jogo **controlável**: uma regra
nova escreve-se como um limite com uma prioridade, e sabe-se de antemão o que
ela vence e a quem cede.

### O que falta migrar

As folhas da árvore continuam a escrever no `dynamicTarget`; o que o
`PlayerAI.tick` faz é apanhar essa escrita e transformá-la numa proposta, com a
prioridade da TAREFA (bola ou acção). Migrar folha a folha — cada uma a propor
com a sua prioridade — é o passo seguinte, e passa a ser um trabalho mecânico.

Ficam por corrigir, das secções 4.2 e 4.3: o tecto do estilo continua a correr
antes da mola, e a inércia pós-passe continua escrita duas vezes.

## 6. Como reproduzir estas medições

```
node tools/headless/nivel2_auditoria.js              # a cadeia toda
node tools/headless/nivel2_auditoria.js foradejogo   # só o fora-de-jogo
```

E, para comparar com e sem o resolvedor, `BlockShape.resolverAlvoActivo`
(js/config/tactics.js) desliga-o e devolve o comportamento antigo — cada camada
escreve, ganha quem escrever por último.
