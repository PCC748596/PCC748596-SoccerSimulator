# Marcação posicional e o tecto do bloco pela Mentalidade

Data: 2026-08-20

## Problema

Com Mentalidade Equilibrada a equipa marca demasiado alto. O pedido é bloco
médio, a partir do meio-campo.

Investigando, apareceram duas coisas.

### 1. Não existe marcação nenhuma no jogo

`markingTarget` aparece a ser posto a `null` (`js/match.js:1276-1277`) e a ser
lido (`js/fsm.js:338`), mas **nada o atribui**. O comentário em
`js/bt/team_bt.js:1006` regista porquê:

> Foram apagados com o nivel 2: a marcacao (atribuirMarcacao/cobertura), o
> tackling (TacklingAI) e a malha de passe de Delaunay (TriangulacaoAI).

O estado `MARKING` da FSM e quase todo o `MarkingModel` — `distancia`,
`alcanceMarcacao`, `corredorMax`, `margemRecuo` — são código morto. Mexer nesses
números não muda nada em campo.

O que se lê como marcação forte é o bloco a subir demasiado.

### 2. A Mentalidade não controla até onde o bloco sobe

Quem controla é o Defensive Pressure, um controlo separado do painel
(`TeamShape.pressaoLineCap`, `js/config.js:438-442`):

```js
low:      0.0,                    // meio-campo
balanced: (CAMPO_COMP / 2) / 3,   // ~17.7 m dentro do campo adversário
high:     (CAMPO_COMP / 2) * 2/3  // ~35.3 m
```

A `MentalidadeModel.balanceado` só define `blocoZ: 0.0` e `agressao: 0.5`; não
toca no tecto. Com os valores por omissão (`estilo: balanceado`,
`pressaoDefensiva: balanced`), o bloco defensivo pode ir buscar a bola a 17.7 m
dentro do meio-campo adversário.

## Solução

Os dois controlos do painel passam a ter significados separados e claros:

- **Mentalidade** — onde o bloco se posiciona em relação à bola, e até onde pode
  subir.
- **Defensive Pressure** — a que distância cada jogador acompanha o adversário
  que entra no seu setor.

Marcação **posicional**, não individual: ninguém tem um homem atribuído.

### O tecto muda de dono

`TeamShape.pressaoLineCap` é removido. O tecto passa a sair da Mentalidade, com
um campo novo `tectoBloco` em cada entrada do `MentalidadeModel`:

| Mentalidade | `blocoZ` (já existia) | `tectoBloco` (novo) |
| --- | --- | --- |
| `muito_defensiva` | −10 | −17.7 |
| `defesa` | −5 | −8.8 |
| `balanceado` | 0 | **0 — meio-campo** |
| `ataque` | +7 | +17.7 |
| `muito_ofensiva` | +12 | +35.3 |

Os valores são frações do meio-campo (`CAMPO_COMP / 2`), como os antigos: 0, um
sexto, um terço e dois terços, com sinal.

Em `computeBlock` (`js/bt/team_bt.js:618`), a linha

```js
const pressCap = TeamShape.pressaoLineCap[Tatics.pressaoDefensiva] ?? TeamShape.pressaoLineCap.balanced;
```

passa a ler `ment.tectoBloco`, onde `ment` é o `MentalidadeModel[Tatics.estilo]`
que a função já tem em mãos. O resto do bloco do tecto — a compressão de `z0` e
`z1` — fica igual.

Com Equilibrada, o centro do bloco sem bola deixa de passar do meio-campo. É o
comportamento pedido.

### Marcação posicional

Cada jogador continua a receber o seu slot do bloco. Depois do estilo inclinar
esse slot, e antes da suavização, procura o adversário mais próximo **do slot**
dentro de `MarkingModel.raioSetor` (12 m) e desloca-se na direção dele, parando
à distância que o Defensive Pressure manda:

| Defensive Pressure | `distanciaPorPressao` |
| --- | --- |
| `low` | 4.5 m |
| `balanced` | 3.0 m |
| `high` | 1.5 m |

O ponto de marcação fica entre o adversário e a própria baliza — do lado por onde
o perigo vem — à distância acima. O deslocamento a partir do slot é depois
limitado por `MarkingModel.biasMaxPorSetor`, que já existe e já varia por terço
do campo (3 a 10 m conforme o setor e a pressão). É esse limite que garante o que
foi pedido: acompanha dentro do seu setor, não sai a correr o campo todo.

O raio de procura mede-se a partir do **slot**, não da posição actual do jogador.
Medir da posição actual realimenta-se: ele desloca-se para o adversário, o que o
aproxima de outros, que passam a estar no raio, e o alvo foge em cadeia. A partir
do slot, o setor é o que o bloco definiu e não se move sozinho.

### Histerese de 3 segundos

Sem trava, a referência trocaria a cada frame quando dois adversários estão a
distância parecida, e o jogador ficaria a oscilar entre os dois.

Cada jogador guarda a referência corrente e um relógio:

```js
p.marcRef       // o adversário que está a acompanhar, ou null
p.marcTimer     // segundos desde a última mudança
```

Enquanto `marcTimer < MarkingModel.histerese` (3.0 s), a decisão mantém-se: quem
está a acompanhar continua a acompanhar; quem está no slot fica no slot. Passados
os 3 s, reavalia. Duas excepções, porque manter a decisão nestes casos seria pior
do que trocar:

1. A referência saiu do raio do setor por mais de metade do raio — já não é dali.
2. A referência deixou de estar em campo (substituída, ou a lista mudou).

Isto vale para os dois sentidos, como pedido: 3 s agarrado ao slot do TeamBT,
3 s agarrado à marcação.

### Marcação não é tackling

`actTackle` e `actSlideTackle` (`js/bt/player_bt.js:647-665`) e os estados
`TACKLE` / `SLIDE_TACKLE` da FSM existem e funcionam. São um sistema à parte, e
não são tocados.

Marcação aqui é **acompanhar**: um desvio aplicado ao alvo de posicionamento.
Nunca decide ir à bola, nunca muda de estado na FSM, nunca dispara um desarme. O
`markingTarget` e o estado `MARKING` continuam sem ser usados — não são
ressuscitados por esta mudança.

### Onde entra o código

`PosicionamentoAI.tick` (`js/bt/team_bt.js:1010-1043`) tem hoje quatro passos:
slot do bloco, desvio do estilo, clamp do campo, suavização. A marcação entra
como um quinto, entre o estilo e o clamp:

```js
const comEstilo  = aplicarEstiloPosicional(p, bb, targetX, targetZ);
const comMarcacao = aplicarMarcacaoPosicional(p, bb, comEstilo.x, comEstilo.z);
const tx = THREE.MathUtils.clamp(comMarcacao.x, -32, 32);
```

A escolha da referência e o cálculo do ponto ficam em funções puras, em
`js/config.js` junto do `MarkingModel`, testáveis sem `THREE` nem `Match`:

```js
pontoDeMarcacao(slotX, slotZ, alvoX, alvoZ, ownGoalZ, distancia, biasMax)
    → { x, z }

escolherReferencia(slotX, slotZ, adversarios, raio)
    → adversário | null
```

`aplicarMarcacaoPosicional` fica em `js/bt/team_bt.js`, ao lado de
`aplicarEstiloPosicional`, e é ela que trata da histerese e do estado no jogador.

### Constantes

Em `MarkingModel`, a acrescentar:

```js
raioSetor: 12.0,        // procura a referência a esta distância do SLOT
histerese: 3.0,         // segundos a manter a decisão
distanciaPorPressao: { low: 4.5, balanced: 3.0, high: 1.5 }
```

`biasMaxPorSetor` fica como está e passa finalmente a ser lido.

## Alcance

Modificados:

- `js/config.js` — `MentalidadeModel` ganha `tectoBloco`; `TeamShape.pressaoLineCap`
  é removido; `MarkingModel` ganha `raioSetor`, `histerese` e
  `distanciaPorPressao`, mais as duas funções puras.
- `js/bt/team_bt.js` — `computeBlock` lê o tecto da Mentalidade;
  `aplicarMarcacaoPosicional` nova; `PosicionamentoAI.tick` chama-a.
- `js/player.js` — `p.marcRef` e `p.marcTimer` inicializados no construtor.

Inalterados de propósito:

- `actTackle`, `actSlideTackle`, `SlideTackleModel` e os estados `TACKLE` /
  `SLIDE_TACKLE`. Marcação é acompanhar; roubar a bola é outro sistema.
- `markingTarget` e o estado `MARKING` da FSM. Continuam mortos; a marcação
  posicional não os usa.
- `MentalidadeModel.agressao` e `blocoZ`, que já fazem o que devem.
- O `chaser` — quem vai à bola continua a ser decidido como hoje.
- `aplicarEstiloPosicional` e os Playing Styles.

## Testes

Novo ficheiro `tests/marcacao_posicional.test.js`, no padrão dos restantes:
recorta as funções e constantes reais de `js/config.js` e corre-as num sandbox
`node:vm`.

- `tectoBloco` existe nas cinco mentalidades, e cresce monotonicamente de
  `muito_defensiva` para `muito_ofensiva`.
- `balanceado.tectoBloco` é exactamente 0 — é o pedido literal.
- `TeamShape.pressaoLineCap` já não existe, para ninguém voltar a lê-lo.
- `distanciaPorPressao` tem as três chaves, e `high` é menor que `balanced`, que
  é menor que `low` — mais pressão, mais perto.
- `escolherReferencia` devolve o adversário mais próximo do slot dentro do raio.
- `escolherReferencia` devolve `null` quando o mais próximo está fora do raio.
- `escolherReferencia` mede a partir do slot, não da posição do jogador: com o
  jogador longe do slot, a escolha não muda.
- `pontoDeMarcacao` fica entre o adversário e a própria baliza, à distância
  pedida.
- `pontoDeMarcacao` com o adversário em cima do slot devolve um ponto válido, sem
  `NaN` — é o caso da divisão por zero.
- `pontoDeMarcacao` nunca desloca mais do que `biasMax` a partir do slot, mesmo
  com o adversário a 30 m.
- Com `biasMax` a zero, `pontoDeMarcacao` devolve o slot intacto.
- Distância maior (pressão Low) deixa o ponto mais longe do adversário do que
  distância menor (High), para o mesmo slot.
