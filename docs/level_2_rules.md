# Os três níveis do posicionamento — árvore de prioridades

Onde é que a posição de um jogador é decidida, por que ordem, e o que cada
camada pode e não pode fazer.

## A regra que manda em tudo

```
slotTarget       NÍVEL 1   o slot da FORMAÇÃO no rectângulo do bloco
tacticalTarget   NÍVEL 2   nível 1 + deslocamentos
styleTarget      NÍVEL 3   nível 2 + playing style
dynamicTarget    = styleTarget, e depois a árvore do jogador pode reescrevê-lo
```

**Cada nível é um OFFSET do anterior. Nenhum reescreve o de cima.**

No debug: anel grande = nível 1, anel médio = nível 2, anel pequeno = nível 3.
A distância entre dois anéis é exactamente o que essa camada fez.

## Nível 1 — a formação, e mais nada

`calcularPontoDoSlot` (team_bt.js) pega no `u`/`v` que vem do `FormationsData`
(config/tactics.js) e mapeia-o no rectângulo: o `u` na largura, o `v`
interpolado entre as três linhas do bloco.

**Não lê a bola. Não lê a fase. Não lê quem está em que linha. Não lê
adversários.** Dois frames com o mesmo rectângulo dão exactamente o mesmo
ponto.

O rectângulo, esse, mexe-se — segue a bola, é o `computeBlock`. O que não pode
mexer-se é a posição do jogador DENTRO dele.

Medido, 972 100 amostras, variação por frame da fracção do jogador dentro do
rectângulo:

```
                                antes    agora
fracção u (largura)            0.00087   0.00011
fracção v (profundidade)       0.00101   0.00013
maior salto de u num frame     0.466     0.059
```

O que sobra é o rectângulo a ser empurrado para dentro das linhas do campo
(`empurraX`/`empurraZ`), a troca de lados ao intervalo e mudanças de formação.

## Nível 2 — os deslocamentos

`PosicionamentoAI.tickFinal`, por esta ordem. Regra geral: **os DESEJOS
primeiro, as REGRAS DURAS no fim** — quem corre depois tem a última palavra.

| # | Regra | O que faz | Tecto |
|---|---|---|---|
| 1 | **`formaDaEquipa`** | desvio de linha por fase, nudge por posição, os quatro fechos laterais, a régua da linha da bola na fase ofensiva, deslize por corredor | — |
| 2 | Par do corredor (`WingPairModel`) | o lateral e o médio de ala não ocupam a mesma faixa | 7 m para dentro |
| 3 | Segurar a linha | quem completa o mínimo atrás não sobe | `LineShape.faixaDaLinha` |
| 4 | Tecto da distância à bola | o central mais perto aproxima-se até `distMaxDaBola` | — |
| 5 | Piso da linha média | com o outro lateral atrás, este não cai | — |
| 6 | Inércia pós-passe | a atacar, não recua para trás de onde passou | — |
| 7 | Afastar do portador | ninguém a menos de 7.5 m de quem tem a bola | — |
| 8 | **Mola de coesão** | encolhe a equipa para a bola | `puxaoMax` 9 m |
| 9 | Marcação | acompanha o homem do sector (só a defender) | — |
| 10 | Inquietação | quem chegou não fica estátua | `RestlessModel.raio` 2 m |
| 11 | Espaçamento | repulsão a colegas + fuga a adversários | **soma cortada em `deslocacaoMax`** |
| 12 | Inércia pós-passe (z) | — | — |
| 13 | Recuo do apoio no lateral | quem apoiou e viu o jogo virar recua | 6 m |
| 14 | Fora-de-jogo | regra do jogo | linha do penúltimo − 0.5 |
| 15 | Regresso ao bloco | o alvo pode sair do rectângulo, mas não mais do que isto | `BlockShape.folgaForaDoBloco` 5 m |
| 16 | Limites do campo | ±34, ±50 | — |
| 17 | Alisamento | `PositionSmoothing` 3.0 | 4.9%/frame |

Notas de ordem que custaram medições:

- **A mola corre ANTES da marcação e dos tectos**, não depois. Com 9 m de
  puxão desfazia os dois: o Box-to-Box saía da entrada da área que o tecto lhe
  dava e a distância de marcação deixava de ser a do painel.
- **A distância mínima no lateral deixou de ser uma regra** e passou a ser um
  piso da própria mola. Era uma regra cujo único propósito era desfazer a
  anterior no mesmo frame.
- **A mola não corre com a bola nas mãos do nosso guarda-redes.** Não há nada a
  disputar na própria linha de golo, e ela comia 12.8 m do avançado.
- **O espaçamento compara com o alvo FINAL do colega** (nível 3 do frame
  anterior), não com o slot dele: desde que o estilo passou a ser a última
  camada, dois slots afastados podem dar dois alvos em cima um do outro.

## Nível 3 — o playing style

Corre no fim do `tickFinal`, a partir do `tacticalTarget`:

1. `aplicarEstiloPosicional` — o deslocamento do estilo.
2. `aplicarTectoDoEstilo` — entrada da área do Box-to-Box, entrelinha do
   Orquestrador, âncora na linha da bola.
3. **Distância entre pares da mesma posição** (`EspacamentoModel.paresIguais`:
   CB 9 m, CM 8, CF 8). Regra dura, e por isso a última: separá-los antes não
   serve de nada se o estilo os volta a juntar. Separam-se os dois, metade da
   falta cada um.
4. Limites do campo.

## A árvore do jogador (o que corre depois de tudo)

`PlayerAI.tick` (player_bt.js) pode reescrever o `dynamicTarget` em catorze
sítios. Duas correcções correm DEPOIS dela, de propósito:

- `aplicarAncoraBoxToBox` — a âncora na linha da bola tem de sobreviver à folha.
- `validarAlvoDoNivel3` — o funil: repõe os limites do campo e, para quem não
  tem tarefa com a bola, o bloco mais a folga. Não discute o alvo da folha; só
  garante que o sítio existe dentro das regras.

Fora da regra do funil: portador, chaser, intercetor e destinatário do passe.
Esses saem do bloco por definição.

## Efeito medido da reorganização (30 min de jogo)

```
                                          antes    agora
CB a menos de 4 m um do outro             1.05%    0.11%
dois colegas a menos de 1.5 m             9.5%     5.8%
par lateral/ala a menos de 6 m            12.3%    0.6%
alvo do nível 3 fora do bloco por >5 m    2.75%    (só quem vai à bola)
```

## O que falta

1. **A régua da fase ofensiva** (dentro do `formaDaEquipa`): a atacar, o z do
   jogador não vem das três linhas, vem da linha da bola com tectos por função
   (0 m para defesas, 5 para o meio, 20 para os atacantes). É o item antigo
   "na fase ofensiva o bloco não é usado". Está agora no sítio certo (nível 2)
   mas continua a ser uma régua presa à bola em vez de uma forma.
2. **As catorze escritas do nível 3** continuam a ser alvos absolutos. O funil
   repõe os limites, mas uma folha que só quer deslocar o jogador devia
   escrever um offset.
