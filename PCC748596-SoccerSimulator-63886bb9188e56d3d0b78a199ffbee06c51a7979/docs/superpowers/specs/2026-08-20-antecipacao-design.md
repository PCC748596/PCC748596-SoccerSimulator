# Antecipação — jogadores que leem a jogada antes de ela acontecer

Data: 2026-08-20

## Problema

O jogo só reage a factos consumados. `Perception` (`js/perception.js`) é a única
camada de leitura e olha apenas para a cinemática da bola: distância,
aproximação, ponto e tempo de interceptação. Tudo o resto decide sobre o
**presente**.

Vê-se nos `PlayingStyleTriggers` (`js/playing_styles.js:97`), que são predicados
sobre o estado actual:

```js
goal_poacher: (p, bb, s) => s.atacando && s.bolaAvanco > 5,
```

O avançado arranca porque a bola **já** avançou. Nunca porque ela **vai**
avançar.

O que falta é antecipação, e o custo aparece em situações concretas:

- A bola vai para o guarda-redes. Os laterais só abrem depois de ele a segurar
  (hoje via `GK_CATCH_BALL`, que é um evento de facto consumado, com
  `snapPosition` a teletransportar toda a gente). Na vida real abrem enquanto a
  bola ainda rola para ele.
- O médio-direito toca para o médio-centro e tem espaço à frente. Fica parado:
  não existe corrida sem bola para o espaço, nem para receber nem para puxar
  marcação.
- A mesma situação aos 40 do segundo tempo, a perder, devia dar o movimento
  contrário — o guarda-redes vai chutar longo e a equipa sobe. O jogo não
  distingue os dois casos.

Um requisito explícito: tem de haver **uma maneira padrão de cadastrar
eventos**, senão daqui a seis meses cada antecipação nova está escrita à mão num
sítio diferente.

## Decisões tomadas

| Decisão | Escolha | Porquê |
|---|---|---|
| Onde vive a previsão | Por jogador, com erro e latência | Um lateral bom antecipa em 0.15 s, um mau em 0.6 s. Uma previsão por equipa faz os 10 reagirem no mesmo frame, como um cardume. |
| Como o evento vira movimento | `EventBus` | Já é a infra-estrutura da casa (`GK_CATCH_BALL`). Mitigação do espalhamento: detector e reacção do mesmo evento vivem no MESMO ficheiro. |
| Urgência (placar/relógio) | Deriva da Mentalidade | Pedido do utilizador: quem muda a urgência é o técnico ao mudar a mentalidade. Sem técnico automático nesta versão. |
| Vida de uma corrida | Até ao próximo passe | Se o passe vier para quem corre, a corrida continua; senão, acaba. |

## Solução

### 1. `js/anticipation/core.js` — o motor

Um registo de eventos previsíveis. Corre dentro do tick do `Perception` que já
existe (15 Hz, com o `perceptionTimer` já desfasado por jogador), para não haver
um segundo relógio a percorrer os 22 jogadores.

Por jogador e por evento, o motor guarda:

```js
p.blackboard.antecipa['PREV_GK_SEGURA'] = {
    crua:      0.0,   // o que o detector devolveu
    percebida: 0.0,   // depois da latência e do viés deste jogador
    acredita:  false, // passou o limiar?
    desde:     0.0    // há quantos segundos acredita
};
```

### 2. O contrato de cadastro

Uma pasta `js/anticipation/`: `core.js` mais **um ficheiro por evento**. Quem
escreve um evento novo não toca no `EventBus`, no Behavior Tree nem na FSM.

```js
AnticipationEvents.registar({
    nome:      'PREV_GK_SEGURA',              // único, prefixo PREV_
    horizonte: 1.5,                           // segundos de antecedência, > 0
    interessa: (p, bb) => p.role === 'def',   // filtro barato: quem avalia
    prever:    (p, bb, match) => 0..1,        // confiança crua
    ouvir:     (p, dados) => { ... },         // reage quando passa a acreditar
    largar:    (p) => { ... }                 // desfaz quando deixa de acreditar
});
```

`registar` **atira erro** quando:

- falta `nome`, `horizonte`, `prever`, `ouvir` ou `largar`;
- `nome` já está registado;
- `nome` não começa por `PREV_`;
- `horizonte <= 0`;
- `prever` devolve um valor fora de `0..1` (verificado em cada avaliação).

`largar` é obrigatório em par com `ouvir`: quem empurra um viés tem de o saber
tirar. É a regra que impede o lateral de ficar aberto na ala para sempre porque
o evento deixou de ser verdade sem ninguém desfazer nada.

O motor é o único a falar com o `EventBus`: emite `nome` com
`{ p, confianca, horizonte }` quando um jogador passa a acreditar, e liga o
`ouvir` sozinho no arranque.

### 3. A crença é por jogador, e pode estar errada

Entre a confiança crua e a acção há um filtro por jogador. É ele que faz o
lateral bom abrir antes do mau.

| Camada | Vem de | Efeito |
|---|---|---|
| Latência | skill de visão/posicionamento | a confiança percebida persegue a crua com atraso: ~0.15 s (bom) a ~0.6 s (mau) |
| Viés | ruído lento por jogador+evento | lê mal a jogada durante uns segundos; lento de propósito, senão a crença tremia frame a frame |
| Limiar + histerese | skill | acredita acima do limiar, larga aos 70% dele — não pisca no valor de corte |

Custo: 22 jogadores × ~6 eventos × 15 Hz ≈ 2 000 avaliações/s, com o `interessa`
a cortar a maioria antes do `prever`.

### 4. Urgência

```js
urgenciaDaEquipa(team) -> 0..1
```

Lê `MentalidadeModel[Tatics.estilo].urgencia`, um campo novo por mentalidade.
Hoje devolve o mesmo valor para as duas equipas, porque o painel é um só e
`Tatics.estilo` é global; quando os painéis forem separados muda-se **só o corpo
da função**, e nenhum listener.

A urgência é o que inverte a reacção: `PREV_GK_SEGURA` com urgência baixa abre
os laterais e recua os centrais; acima de 0.6 sobe toda a gente, porque o chutão
vem aí.

### 5. Corrida no espaço

Estado próprio `RUN_INTO_SPACE` na FSM — a duração vive na FSM, como manda a
arquitectura da casa. Destino calculado com `SpatialGrid.findFreeSpace`, que já
existe, na diagonal à frente do jogador.

Vida da corrida:

| Acontece | Resultado |
|---|---|
| O passe vem para ele | continua, agora a receber |
| O passe vai para outro | acaba; volta ao posicionamento |
| Perdemos a bola | aborta |
| Ficaria em fora de jogo | aborta |
| 4 s sem nada acontecer | rede de segurança; acaba |

Enquanto corre, entra nos `pass_candidates` — senão só puxa marcação e nunca
recebe.

### 6. Eventos-semente

Três, escolhidos por exercitarem partes diferentes do contrato:

| Evento | Detector | Reacção |
|---|---|---|
| `PREV_GK_SEGURA` | bola a caminho do nosso guarda-redes sem adversário entre, ou o GR já a sair para ela | urgência baixa: laterais abrem, centrais recuam. Urgência > 0.6: sobem todos |
| `PREV_PASSE_SAI` | orientação do corpo do portador, pressão sobre ele e melhor opção de passe | o provável recetor arranca antes do toque; o defensor mais próximo fecha a linha |
| `PREV_ESPACO_A_FRENTE` | acabou de passar, tem espaço livre à frente (`SpatialGrid`) e a jogada avança | entra em `RUN_INTO_SPACE` |

Perda iminente de posse e remate iminente ficam para specs seguintes. A ficha
suporta-os sem mexer no motor — é esse o teste do desenho.

### 7. Ligação ao que já existe

Os `PlayingStyleTriggers` passam a receber `p.blackboard.antecipa` no `s`. O
`goal_poacher` deixa de arrancar quando o passe **saiu** e passa a arrancar
quando ele **vai sair**. Uma linha por trigger, opcional — nenhum estilo é
obrigado a mudar.

## Testes

Puros, no padrão da casa (recorte da função do ficheiro + sandbox `vm`):

- **Contrato do registo:** cada campo em falta atira; nome duplicado atira; nome
  sem `PREV_` atira; `horizonte <= 0` atira; `prever` fora de `0..1` atira.
- **Varredura da pasta:** percorre `js/anticipation/` e falha se qualquer
  ficheiro registar uma ficha fora do contrato. É isto que impede a confusão no
  futuro — não a boa vontade de quem escreve o evento.
- **Filtro de crença:** com a mesma confiança crua, o jogador bom acredita antes
  do mau; a histerese não pisca no valor de corte; o viés é lento.
- **Urgência:** monótona da mentalidade defensiva para a ofensiva.
- **Corrida:** o ponto escolhido é livre, à frente e dentro do campo; cada
  condição de fim termina a corrida.

E um teste headless (jsdom + three) que força o cenário do guarda-redes e mede o
essencial: **os laterais começaram a abrir antes de o GR tocar na bola**.

## Fora de âmbito

- Técnico automático a mudar a mentalidade pelo placar e pelo relógio.
- Painéis separados por equipa (a assinatura `urgenciaDaEquipa(team)` já os
  prevê; o corpo é que ainda não).
- Perda iminente de posse e remate iminente.
- Separação corpo-a-corpo entre companheiros — problema conhecido e distinto (o
  `separarAlvos` foi apagado), não é antecipação.
