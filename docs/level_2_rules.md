# As restrições do nível 2 — árvore de prioridades

Auditoria de tudo o que mexe na posição de um jogador depois de o nível 1
(TeamBT / bloco) ter decidido o slot dele, pela ordem REAL de execução.

Escrito porque a ordem estava só no código, espalhada por duas funções de
duzentas linhas, e porque há camadas aqui que desfazem o trabalho das camadas
anteriores — a única maneira de ver isso é pô-las em fila.

## A regra que manda em tudo

**O nível 1 é intocável.** O `p.slotTarget` é o lugar do jogador no rectângulo
do bloco e mais nada; nenhuma camada posterior pode reescrevê-lo. Quem quiser
deslocar o jogador escreve por cima do RESULTADO (`p.tacticalTarget`,
`p.dynamicTarget`), nunca do slot.

Verificado a medir, 1800 s de jogo, 410 096 amostras de slots de central:
**16 slots fora do rectângulo (0.004%)**, e são frames de transição em que o
bloco salta de ponta a ponta do campo. O corte que garante isto está no fim do
`tickBase` (`limitesDoBloco`, team_bt.js) e no fim do ramo `isAttacking` do
`calcularPontoDoSlot`.

## A cadeia de alvos

```
p.slotTarget       nível 1: slot puro no bloco            (anel GRANDE do debug)
p.postoBase        + playing style                        (fim do tickBase)
p.styleTarget      cópia do postoBase para o debug        (anel PEQUENO)
p.tacticalTarget   + tudo o que está nesta lista          (anel MÉDIO)
p.dynamicTarget    = tacticalTarget, e depois REESCRITO pelo nível 3
```

## Ordem de execução, com o que cada passo pode fazer

`Match.runTeamAI()` (match_loop.js) corre, por frame, e por esta ordem:

| # | Passo | Onde | Escreve | Pode empurrar para fora do bloco? |
|---|---|---|---|---|
| 0 | `TeamAI.tick` → `computeBlock` | team_bt.js | `bb.bloco` | — (é ele que o define) |
| 1 | `classificarLinhas` | team_bt.js | `p.linhaActual`, `ordemNaLinha`, `seguraLinha`, `pisoLinhaMedia`, `fecharPorPar` | não |
| 2 | `atribuirParesDeCorredor` | team_bt.js | `p.corredorAberto` / `p.corredorFechado` | não |
| 3 | `otimizarSlotsPorPosicao` | team_bt.js | nada (está vazia) | não |
| 4 | `tickBase` | team_bt.js | `p.slotTarget`, `p.postoBase` | **não** (corte no fim) |
| 5 | `atribuirMarcacoesDaEquipa` | team_bt.js | `p.marcRef`, `p.puxarParaBola` | não |
| 6 | `tickFinal` | team_bt.js | `p.tacticalTarget`, `p.dynamicTarget`, `p.styleTarget` | **sim** |
| 7 | `atribuirApoiosDaEquipa` | team_bt.js | `p.apoioPonto` | — |
| 8 | `player.update` → `PlayerAI.tick` | player_bt.js | `p.dynamicTarget` (25 sítios) | **sim** |

### Dentro do `tickBase` (passo 4) — o LUGAR no bloco

Tudo aqui corrige o lugar DENTRO do rectângulo, e o corte final garante-o.

1. **`slotNoBloco`** — o `u`/`v` da formação interpolado nas três linhas do
   bloco. É o nível 1 propriamente dito.
2. **Par do corredor** (`WingPairModel`) — o lateral e o médio de ala não
   ocupam a mesma faixa: quem está mais adiantado fica na linha, o outro fecha
   `fechoDentro` metros para o meio-espaço e `recuoDeDentro` atrás. Histerese
   de `margemTroca` para não trocarem de papel a cada cruzamento.
3. **`seguraLinha`** — quem foi chamado para completar o mínimo atrás não passa
   de `LineShape.faixaDaLinha` acima da traseira do bloco.
4. **`puxarParaBola`** — o central mais próximo aproxima-se até
   `MarkingModel.distMaxDaBola` da bola. Só a defender.
5. **`pisoLinhaMedia`** — com o outro lateral já na linha de trás, este não cai
   abaixo da linha média do bloco.
6. **Inércia pós-passe** — a atacar, não recua para trás da cota onde passou,
   durante `passInertiaTimer`.
7. **Afastamento do portador** — 7.5 m de raio mínimo ao companheiro com a bola.
8. **CORTE PELO RECTÂNGULO** (`limitesDoBloco`) — e só depois disto se escreve
   o `slotTarget`.
9. **`aplicarEstiloPosicional`** — o playing style. Fica DE FORA do corte de
   propósito: é a terceira leitura do debug (anel pequeno) e tem de poder
   ver-se a sair do bloco.

### Dentro do `tickFinal` (passo 6) — o DESVIO ao lugar

Daqui para baixo já se pode sair do rectângulo, e é isso que distingue o anel
médio do anel grande no debug.

| Ordem | Regra | Eixo | Tecto |
|---|---|---|---|
| 1 | `aplicarMarcacaoPosicional` — acompanha o homem do sector | x, z | até 10 m no terço de ataque |
| 2 | `aplicarInquietacao` — quem chegou não fica estátua | x, z | `RestlessModel.raio` = 2 m |
| 3 | `aplicarTectoDoEstilo` — âncora do Box-to-Box, trava da entrada da área, entrelinha do Orquestrador | z | — |
| 4 | Inércia pós-passe (outra vez) | z | — |
| 5 | `aplicarRecuoAposApoio` — o apoio do lateral que não recebeu e viu o jogo virar | z | 6 m |
| 6 | **Mola de coesão** — encolhe a equipa para a bola | x, z | `MolaDeCoesao.puxaoMax` = 9 m |
| 7 | Fora-de-jogo | z | linha do penúltimo defesa − 0.5 |
| 8 | Distância mínima no lateral (`ThrowInModel`) | x, z | por posição |
| 9 | Repulsão entre companheiros | x, z | raio 3.5 m, força ×3 |
| 10 | Fuga dos adversários (só a atacar, e só de `z > -5`) | x, z | raio 6 m, força ×4 |
| 11 | Clamp do campo (±34, ±50) | x, z | — |
| 12 | Alisamento (`PositionSmoothing` = 3.0) | x, z | 4.9% do erro por frame |
| 13 | `esperarPeloSlot` — quem vê o posto vir na sua direcção espera por ele | — | — |

## Onde é que uma camada desfaz outra — os conflitos por resolver

Isto é o inventário do problema, não a solução.

1. **A mola de coesão (6) desfaz a marcação (1) e o tecto do estilo (3).**
   9 metros de puxão contra os 2.5 m de folga que o tecto do Box-to-Box dá. O
   `aplicarTectoDoEstilo` já foi movido para depois da marcação por esta razão
   exacta — a marcação furava-o — mas a mola continua a correr depois dos dois.

2. **A regra 8 existe só para desfazer a 6.** O comentário no código diz-lo com
   todas as letras: "corre DEPOIS da mola — é ela que causa a aproximação, e
   desfazê-la antes era só vê-la voltar no mesmo frame". Uma regra cujo único
   propósito é cancelar a anterior é sinal de que a anterior está no sítio
   errado.

3. **A mola some com o bloco quando a bola está na linha de fundo.** Medido com
   o guarda-redes de posse: o slot do avançado ficava em +11.5 m e o alvo
   táctico em −1.3 m — 12.8 m comidos pela mola. Já está desligada nesse caso
   (guarda `gkNossoComBola`), mas o mecanismo geral mantém-se.

4. **As regras 9 e 10 somam-se sem tecto e sem voltar ao bloco.** Cada
   adversário dentro de 6 m contribui até 4 m de deslocação e cada companheiro
   dentro de 3.5 m até 3 m; nada limita a soma, e o único corte a seguir é o do
   campo inteiro.

5. **O nível 3 reescreve o `dynamicTarget` em 25 sítios**, depois de tudo isto.
   Uma folha da árvore sobrepõe um ponto que não passou por nenhuma destas
   regras — nem pelo bloco, nem pelo fora-de-jogo, nem pelo clamp do campo.
   Duas excepções já correm DEPOIS da árvore para sobreviverem:
   `aplicarAncoraBoxToBox` (player_bt.js) e o recuo do apoio no lateral.

6. **Os dois centrais podem colapsar no mesmo ponto.** Medido em 205 048 pares:
   distância média 9.3 m no slot, 8.8 m no alvo táctico, 9.5 m na posição real,
   mas **1.1% dos frames com os dois a menos de 4 m**. Não é o slot que os junta
   (o bloco separa-os), é a soma da marcação com o `puxarParaBola`: os dois
   podem ficar com referências próximas e nada no nível 2 os obriga a manter
   distância entre si por POSIÇÃO — a repulsão da regra 9 é genérica, com 3.5 m
   de raio, e é aplicada depois de a mola já os ter juntado.

## O que fazer a seguir, por ordem de retorno

1. Passar a mola de coesão para ANTES da marcação e do tecto do estilo, e
   apagar a regra 8, que deixa de ter razão de existir.
2. Fechar as regras 9 e 10 com um tecto de soma e um corte final que devolva o
   alvo ao bloco quando ele estiver fora dele sem razão táctica.
3. Distância mínima entre pares da mesma linha (os dois centrais), aplicada
   depois de tudo, como a repulsão mas por posição e não por proximidade.
4. Reduzir as escritas do nível 3 no `dynamicTarget`: uma folha que só quer
   deslocar o jogador devia escrever um OFFSET que o nível 2 lê, não o alvo
   final.
