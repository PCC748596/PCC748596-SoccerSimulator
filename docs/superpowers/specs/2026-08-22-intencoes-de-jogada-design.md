# Intenções de jogada — contratos entre passador e recetor

Data: 2026-08-22

## O problema

Metade dos passes não chega ao recetor pretendido — 52.5 ± 7.9% falham, e o número
não se mexe quando se desliga o erro de execução. A causa não é a pontaria: é o
passador estar a **adivinhar** onde o colega vai estar. O `initiatePass` estima o
tempo de voo a 11 m/s, projecta o colega nessa estimativa e mira aí. O colega, por
sua vez, não sabe que a bola vem, e as árvores mudam-lhe o destino a qualquer frame.

Nos lançamentos, que são metade de todos os passes, o resultado é 56-67% de acerto
com 29-40% de cortes.

A ideia, do dono do projecto: o passador e o recetor **comunicam**. O recetor
anuncia "vou nesta direcção durante X segundos a Y m/s" e o passador projecta o
ponto de encontro sobre essa promessa, em vez de adivinhar.

## Âmbito

Só **lançamentos e passes longos**. O passe curto e médio fica exactamente como
está — acerta 75% e o lead actual chega-lhe.

Não se toca em: `atribuirApoios`, decisão de `RUN_INTO_SPACE` fora de contrato,
escolha de recetor no passe curto.

## O contrato

Um contrato é uma promessa de rota, com validade:

```js
{
  id, equipa, jogador,
  origem: {x, z},        // onde estava quando pediu
  dir: {x, z},           // unitário, a direcção prometida
  velocidade,            // m/s que promete manter
  duracao, tPedido, tExpira,
  estado: 'aberto' | 'servido' | 'cumprido' | 'falhado' | 'cancelado',
  motivo,                // só quando cancelado
  passador, pontoEncontro, tempoVoo   // preenchidos ao servir
}
```

A rota é uma função pura do tempo:

```
posicaoEm(t) = origem + dir * velocidade * (t - tPedido)
```

É isto que permite ao passador projectar sem adivinhar.

**É um contrato, não uma previsão.** Enquanto está activo, o jogador segue a rota
prometida. Se tiver de desistir, cancela — e o passador fica a saber.

**Pedir implica arrancar já.** O contrato descreve o que ele está mesmo a fazer,
não uma promessa condicional. Sem isto haveria jogadores a anunciar corridas que
nunca fazem.

## Módulo

Ficheiro novo `js/intentions.js`, carregado depois de `utils.js` e antes de `bt/`.
Um registo por equipa e um relógio próprio.

| Acção | Quem chama | Faz |
|---|---|---|
| `Ball_Request` | recetor, nível 3 | cria o contrato `aberto`, levanta o braço, arranca a corrida |
| `Long_Ball_Inform` | passador, ao lançar | marca `servido`, fixa `pontoEncontro` e `tempoVoo` |
| `Intent_Cancel` | qualquer um | quebra o contrato, com motivo |

Consultas sem efeito: `Intentions.abertos(equipa)` — é o que o passador lê — e
`Intentions.doJogador(p)`.

As três acções emitem no `EventBus`, para o painel e a telemetria ouvirem sem
ninguém andar a espreitar o registo.

### Sinal visível

Braço levantado enquanto o contrato está `aberto`; cai ao ser servido ou cancelado.
Camada procedural no ombro, como `aplicarCamadaPeito` e `aplicarCamadaCorte`, com
`JointLimits.clampOmbro`. Mais `showActionBanner('BALL REQ')` e `'LONG BALL'`.

Sem isto o sistema só é observável pelo painel, e este projecto já tem histórico de
funcionalidades a correr sem ninguém conseguir ver que funcionam.

### Constantes (`IntentModel`, config.js)

```js
const IntentModel = {
    ativo: true,
    duracaoMin: 2.0, duracaoMax: 6.0,
    maxPorEquipa: 2,
    cooldown: 4.0,          // por jogador, depois de um contrato fechar
    distMin: 18, distMax: 45,   // distância bola→ponto de encontro admissível
    raioChegada: 3.0            // a que distância do ponto se considera chegado
};
```

`distMin`/`distMax` são o filtro de âmbito: um contrato cujo ponto de encontro caia
a menos de `distMin` da bola não é bola longa e é ignorado pelo passador — a decisão
volta ao passe normal, que não se toca. `raioChegada` fecha o contrato como
`cumprido` quando o dono chega ao ponto, mesmo que a bola ainda não lá esteja.

## Fluxo por frame

```
Match.runTeamAI
 ├─ TeamAI.tick(TeamA/TeamB)        nível 1, já existe
 ├─ Intentions.tick(dt)             NOVO — expira, revalida, cancela
 ├─ PosicionamentoAI                nível 2, já existe
 └─ player.runBehaviorTree()        nível 3 — pede e serve
```

O `tick` corre depois do nível 1 porque precisa da posse já apurada.

### O recetor pede

Ramo novo `PedirBola` no `player_bt.js`, antes do `CorrerNoEspaco`. Condições:
espaço à frente, equipa com a bola, ele sem contrato, vaga na equipa, cooldown
cumprido.

Cria o contrato e entra em `RUN_INTO_SPACE` — o estado que já existe. **O contrato
manda no destino e na duração; a locomoção é a que lá está e já foi medida.**

### O passador projecta

Para cada contrato aberto, a partir da posição da bola:

```
t = distância(bola, posição do recetor agora) / V0     // V0 = chute inicial
repetir 3x:
    P = contrato.posicaoEm(agora + t)     // geometria pura, sem erro
    t = tempoDeVoo(|P - bola|)            // ver abaixo
```

`V0` é a velocidade média de voo já usada hoje no `initiatePass` (11 m/s) — serve só
para arrancar a iteração e não sobrevive à primeira passagem.

`tempoDeVoo(d)` **não existe e tem de ser escrita**, em `utils.js`, ao lado das
funções de balística que já lá estão. Não é uma estimativa nova: é o tempo que a
mesma física já determina, exposto em vez de implícito.

- rasteiro: com `v0 = velocidadeRasteiraPara(d)` e `a = atritoRolamento * g`,
  `t = (v0 - sqrt(max(0, v0² - 2·a·d))) / a`
- aéreo: com `θ = resolverElevacaoPasse(d)` e `v = velocidadeParaAlcance(d, θ)`,
  `t = 2·v·sin(θ) / g`

O ramo escolhido é o mesmo que o `executePassGameplay` escolheria para essa
distância — senão o passador projecta sobre uma física e a bola sai noutra.

Converge em três passagens. Devolve ponto de encontro e tempo de voo.

**Filtro decisivo:** se `agora + t` cair para lá de `tExpira`, o contrato não serve
e é descartado. É isto que impede lançamentos para onde o colega já não vai estar.

**A projecção é sem erro; a execução leva o erro normal.** A bola sai com o
`PassErrorModel` de sempre e pode não cair exactamente no ponto combinado — como na
vida real. O contrato governa a intenção, nunca a física.

Escolhido o contrato, `Long_Ball_Inform` fixa o ponto, que vai como
`throughBallTarget`.

### Fecho

O contrato fecha quando alguém domina a bola ou ela pára: `cumprido` se foi o dono
do contrato, `falhado` caso contrário.

## Quebras

Revalidadas todos os frames no `Intentions.tick`:

| Motivo | Regra |
|---|---|
| posse perdida | `bb.isAttacking` falso — caem todos os contratos da equipa |
| fora-de-jogo | rota deixou de ser legal (`avancoLegalDeCorrida`, que já corre por frame) |
| rota fechada | adversário mais perto do ponto de encontro do que o dono, ou dentro da linha bola→ponto |

**Com a bola no ar, cancelar não trava nada.** O contrato passa a `falhado`, o braço
cai, e o jogador volta a decidir pelos ramos normais — se ainda conseguir ir buscar
a bola, vai.

## Casos-limite garantidos pelo registo

- um contrato por jogador; no máximo `maxPorEquipa` abertos por equipa;
- `servir()` só aceita um contrato `aberto` e fecha-o na mesma chamada — dois
  passadores não podem servir o mesmo;
- cooldown por jogador depois de um contrato fechar, senão volta a pedir no frame
  seguinte e fica num ciclo;
- um contrato cujo encontro caia fora da janela nunca é oferecido ao passador.

## Telemetria

`MatchStats.contratos`: pedidos, servidos, cumpridos, falhados, e cancelados
repartidos por motivo (posse / fora-de-jogo / rota fechada / expirou).

Sem isto não se saberá se o sistema funcionou ou se apenas correu.

## Critério de sucesso

Baseline medido: lançamentos com **56-67% de acerto e 29-40% cortados**, metade de
todos os passes.

Medido no mesmo binário com `IntentModel.ativo` ligado e desligado, como o projecto
já fez para o apoio de circulação e para a corrida ao espaço:

1. lançamentos **servidos por contrato** acertam mais do que os lançamentos sem
   contrato;
2. a taxa de passe global não regride;
3. a repartição dos cancelamentos por motivo é legível — se 90% expirarem sem serem
   servidos, sabemos que é a duração ou o número de contratos a afinar.

## Risco declarado

O `RUN_INTO_SPACE`, de que isto depende para a locomoção, dispara hoje em ~1% dos
frames. Se os pedidos forem igualmente raros, o sistema fica correcto e invisível —
o que já aconteceu neste projecto com outras funcionalidades.

**A primeira medição depois de implementar é quantos contratos nascem por minuto.**
Se forem menos de um ou dois, afina-se o gatilho do `PedirBola` antes de se olhar
para taxas de acerto.

## Testes

- **Puros:** `posicaoEm(t)`; convergência da projecção; filtro da janela de validade.
- **Registo:** limites por equipa e por jogador; atomicidade do `servir()`; cooldown.
- **Em jogo (headless, semente fixa):** contratos nascem, são servidos, e nenhum
  sobrevive à perda de posse; o braço só está levantado com contrato aberto.
- **A/B:** `IntentModel.ativo` ligado/desligado no mesmo binário, várias sementes.

## Ficheiros

| Ficheiro | O quê |
|---|---|
| `js/intentions.js` | novo — registo, contrato, projecção do encontro |
| `index.html` | uma linha de script, depois de `utils.js` |
| `js/config.js` | `IntentModel` |
| `js/utils.js` | `tempoDeVoo(d)` — expõe o tempo de voo da balística que já existe |
| `js/bt/player_bt.js` | ramo `PedirBola`; `findThroughBall` consulta contratos |
| `js/match.js` | `Intentions.tick(dt)` no `runTeamAI` |
| `js/stats.js` | contadores |
| `js/player.js` | camada do braço levantado |
