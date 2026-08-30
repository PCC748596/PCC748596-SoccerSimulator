# Estudo — números absolutos, fracções, e a pergunta que interessa

Proposta em discussão: *trocar todos os números absolutos por percentagem de
espaços, para que tudo funcione igual independentemente do esquema táctico.*

Este documento examina a ideia, diz onde ela está certa, onde parte coisas, e
propõe uma versão afinada com um caminho concreto. Levantamento de 30 de Agosto
de 2026.

---

## 1. O tamanho do problema

`js/config/` tem **2099 números literais** (fora de comentários). Destes, **271
(13%) são distâncias prováveis** — o nome da chave sugere espaço e o valor está
na gama do campo:

```
  shooting           227 números,  94 distâncias
  tactics            327 números,  52 distâncias
  passing            146 números,  49 distâncias
  player_behavior    139 números,  26 distâncias
  defense             73 números,  18 distâncias
  goalkeeper         138 números,  16 distâncias
  physics            124 números,  12 distâncias
  animations         871 números,   2 distâncias
  gait                54 números,   2 distâncias
```

Os 871 do `animations` são ângulos de articulações e keyframes — não são espaço e
não entram nesta conversa. O grosso do trabalho está em quatro ficheiros.

---

## 2. Onde a ideia está CERTA — e há prova desta sessão

O problema é real e já mordeu três vezes hoje.

**O tecto do Orquestrator.** `travaNaIntermediaria` travava-o a **15 m à frente
do meio-campo**. Com o bloco subido, 15 m à frente do meio-campo é *à frente dos
médios* — e o organizador de trás aparecia no ataque. O número não estava errado;
estava medido a partir da coisa errada. Passou a travar na LINHA MÉDIA DO BLOCO,
que sobe e desce com a equipa.

**O `sweepOut` do guarda-redes.** 14 m, dentro de uma área de 16.5 m. Ninguém
escreveu "ele não sai da área" — saiu disso, por acidente aritmético. Quando foi
preciso deixá-lo sair, a regra não existia em lado nenhum para se mudar.

**As três linhas do bloco.** `zAtk = z0 + 2/3 da profundidade`. A fracção estava
lá, mas era a errada: o ataque tem de ser 1.0 (a frente), não 2/3. Trinta e três
por cento do bloco ficava vazio *por construção*, e a `profundidade` do painel
mentia por um terço.

Há mais à espera, fora da config e portanto sem sequer um nome:

```
js/bt/team_bt.js:1283   const CORREDOR_LIMITE = 11.33;
js/bt/team_bt.js:2152   const RAIO_MIN_PORTADOR = 7.5;
js/playing_styles.js    const lim = 26.5;          // travaNaEntradaArea
```

O `11.33` é um terço de 34 — uma fracção da meia-largura do campo, escrita como
decimal. Se a largura mudar, ele não acompanha.

---

## 3. Onde a ideia PARTE coisas

Há números que **não podem escalar**, e escalá-los estraga o futebol:

```
distanciaBarreira: 9.15     Lei 13 — a barreira
afastaAdversarios: 9.15     a mesma regra
raioMeiaLua: 9.15           a mesma regra
distanciaPenalti: 11.0      Lei 14
profundidade: 16.5          a grande área
meiaLargura: 20.16          a grande área
pequenaProfundidade: 5.5    a pequena área
raio: 0.11                  a bola, Lei 2
gravidade: 9.81             o mundo
```

Um campo mais estreito **não encolhe a barreira para 8 m**. A meia-lua continua
a ter 9.15 m de raio. A bola continua a ter 11 cm. Se isto virar percentagem, o
simulador deixa de simular futebol.

E há um terceiro grupo, mais traiçoeiro: números **físicos derivados**. O
`kArrasto` sai de `½·ρ·Cd·A/m`. A `velocidadeParaAlcance` resolve-se contra a
gravidade real. Transformá-los em fracções de coisa nenhuma não tem significado.

---

## 4. A pergunta que interessa não é "absoluto ou percentagem"

É **"relativo a QUÊ?"**.

Um número não é bom ou mau por ser absoluto. É bom quando o referencial dele é o
mesmo em que a decisão faz sentido. O `travaNaIntermediaria` não estava errado
por ser 15; estava errado por ser 15 *a contar do meio-campo* quando devia ser *a
linha média do bloco*.

Proponho classificar cada número por REFERENCIAL, e não por forma:

| referencial | o que é | exemplos | deve ser |
|---|---|---|---|
| **Regulamento** | as Leis do Jogo | 9.15, 11.0, 16.5, 5.5, 7.32 | metros, e assim ficam |
| **Físico** | o mundo | gravidade, raio da bola, arrasto | unidades reais |
| **Corpo** | o jogador | altura da testa, alcance do pé | metros (o corpo não escala) |
| **Campo** | proporção do relvado | corredores, larguras de zona | **fracção de CAMPO_LARG/COMP** |
| **Bloco** | onde a equipa está | linhas, tectos de estilo, profundidades | **fracção do bloco** |
| **Linha** | a linha do jogador | espaçamento, fecho por ocupação | **fracção da largura da linha** |
| **Situação** | distância a algo vivo | ao homem, à bola, ao portador | metros, mas **relativos a esse algo** |

As três últimas colunas são onde a tua ideia se aplica, e é aí que estão os
problemas que apanhámos. As três primeiras ficam como estão.

O `CORREDOR_LIMITE = 11.33` é do tipo **Campo**: devia ser `CAMPO_LARG / 6`.
O tecto do Orquestrator é do tipo **Bloco**: `BlockShape.linhas.meio` — e já é.
O `distMaxDaBola = 9.0` é do tipo **Situação**: fica em metros, e está certo.

---

## 5. O que isto resolveria de facto

O objectivo declarado é *"independente do esquema táctico, tudo funcionaria
igual"*. Vale a pena separar duas coisas que o esquema muda:

**A FORMAÇÃO (442, 433, 352…)** já é relativa: os slots são `u` e `v` em 0..1
dentro do bloco. Trocar de formação já funciona. O que NÃO acompanha são os
números escritos noutros sítios que assumem quatro defesas ou dois avançados —
como os `slotsArea` do canto e da falta, que são listas de posições absolutas em
metros, com um slot por índice.

**O TAMANHO DO BLOCO (compactação, mentalidade, linha defensiva)** é onde a coisa
falha hoje, e é o caso do Orquestrator: um tecto em metros absolutos deixa de
fazer sentido quando o bloco sobe 20 m.

Ou seja: a tua ideia ataca sobretudo o **segundo**. O primeiro precisa de outra
coisa — que os slots de bola parada sejam atribuídos por FUNÇÃO e ocupação, e não
por índice numa lista fixa.

---

## 6. Proposta de caminho

Faseado, com o barato e seguro primeiro.

**Fase 1 — Dar nome ao que já é fracção disfarçada.** Os números que são
claramente uma proporção do campo escrita em decimal (`11.33` = CAMPO_LARG/6,
`26.5` = metade da meia-distância à área, etc.) passam a ser expressos como tal.
Não muda comportamento nenhum: muda o que acontece quando alguém mexer nas
dimensões. Risco nulo, e é verificável — os valores calculados têm de dar
exactamente os de hoje.

**Fase 2 — Marcar o referencial de cada distância na config.** Uma convenção de
nome ou um comentário obrigatório por bloco, dizendo a que é que o número se
refere. Sem isto, a fase 3 é adivinhação. Também é o que impede a próxima pessoa
de escrever outro `15.0` a contar do meio-campo.

**Fase 3 — Converter os do tipo BLOCO e LINHA.** São poucos e são os que dão
problemas: tectos de estilo, profundidades por linha, limites de avanço. Cada um
com medição antes/depois, como se fez hoje com as três linhas.

**Fase 4 — Os slots de bola parada por função.** Independente das outras, e é a
que faz mudar de formação funcionar a sério nos cantos e nas faltas.

---

## 7. A minha opinião, sem rodeios

**A ideia está certa no diagnóstico e demasiado larga na cura.** "Trocar todos os
números absolutos por percentagem" aplicado à letra estragaria o regulamento e a
física — 13% dos números de config são distâncias, e uma boa parte dessas são
Leis do Jogo.

A versão que subscrevo é: **cada distância declara o seu referencial, e as que
são relativas ao BLOCO ou à LINHA passam a fracção**. É uma fatia mais pequena do
que "todos os números", ataca exactamente os defeitos que apanhámos, e não toca
no que não deve mexer.

E há uma coisa a fazer ANTES de qualquer uma destas fases, senão o ganho não
chega ao ecrã: enquanto o `PlayerBT` reescrever o `dynamicTarget` em 25 sítios
sem passar pelos cortes da camada 1, uma regra bem parametrizada continua a valer
metade. Medido hoje, cinco vezes seguidas — a última com o trio da defesa: alvo
com 1.31 m de assimetria, posição real com 3.09 m.

Arrumar os números é obra de fundo e vale a pena. Mas a camada rende mais, e
rende primeiro.
