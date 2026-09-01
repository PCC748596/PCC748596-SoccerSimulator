# Micro-movimento nos alvos: jogadores param de ficar estátuas

Data: 2026-08-20

## Problema

Quem chega ao seu alvo de posicionamento fica completamente imóvel. O campo
enche-se de estátuas, e o jogo perde vida.

`PosicionamentoAI.tick` (`js/bt/team_bt.js`) escreve um alvo suavizado e o
`steerArrive` leva o jogador até lá. `steerArrive` devolve velocidade zero
quando a distância ao alvo desce abaixo de 0.2 m — a partir daí, e enquanto o
bloco não mudar, o jogador não se mexe mais.

## Solução

Um sexto passo no `PosicionamentoAI.tick`, entre a marcação e o tecto do estilo:

```
slot → estilo → marcação → inquietação → tecto do estilo → clamp
```

Antes do tecto de propósito. O tecto passou a ser o último a falar precisamente
porque a marcação o furava; dois metros de irrequietude não podem voltar a
furá-lo, ou o Box-to-Box volta a entrar na área.

### Quando age

Só para quem **já chegou**: distância do jogador ao alvo abaixo de
`RestlessModel.limiarChegada` (2 m). Enquanto se desloca, o alvo fica quieto —
senão o micro-movimento competia com a deslocação e o jogador serpenteava pelo
campo em vez de ir a direito.

Excluídos, por terem destino próprio:

- Guarda-redes, que nem chegam a passar por `PosicionamentoAI.tick`.
- Quem tem a bola.
- O `chaser` da equipa, que vai à bola.

### Como se move

Cada jogador guarda um ângulo, um raio e um relógio. Passado o intervalo — um
valor sorteado entre `intervaloMin` (1.5 s) e `intervaloMax` (3.5 s), para não
pulsarem todos em sincronia — sorteia um ângulo novo e um raio até
`RestlessModel.raio` (2 m).

O alvo desloca-se para esse ponto. A suavização exponencial que já existe no
`tick` e o `steerArrive` fazem o resto, portanto o movimento sai contínuo, não
aos saltos.

**O deslocamento parte sempre do alvo corrente, não do anterior.** Não acumula:
sem isso a equipa derivava lentamente para fora da forma ao longo de minutos.

### Constantes

`RestlessModel`, novo em `js/config.js`:

```js
raio: 2.0,             // metros
limiarChegada: 2.0,    // só mexe quem já chegou
intervaloMin: 1.5,
intervaloMax: 3.5
```

### Função pura

Em `js/config.js`, testável sem `THREE` nem `Match`:

```js
offsetInquietacao(angulo, raio) → { x, z }
```

A escolha do momento e o estado ficam em `aplicarInquietacao`, no
`js/bt/team_bt.js`, ao lado de `aplicarMarcacaoPosicional`.

## Alcance

Modificados:

- `js/config.js` — `RestlessModel` e `offsetInquietacao`.
- `js/bt/team_bt.js` — `aplicarInquietacao` nova, chamada no `PosicionamentoAI.tick`.
- `js/player.js` — `inqAngulo`, `inqRaio`, `inqTimer`, `inqIntervalo` no construtor.

Inalterados de propósito:

- `steerArrive` e a suavização do `tick`. O micro-movimento mexe no alvo, não na
  forma de lá chegar.
- O tecto do estilo, a marcação, os Playing Styles e o bloco.

## Testes

Novo ficheiro `tests/inquietacao.test.js`.

- `offsetInquietacao` nunca devolve um ponto a mais de `raio` da origem.
- Com raio zero devolve exactamente `{ x: 0, z: 0 }`.
- Ângulos diferentes dão direcções diferentes; varrendo `0..2π` o offset cobre
  os quatro quadrantes.
- O offset a `angulo` e a `angulo + 2π` é o mesmo.
- As quatro constantes existem, são positivas, e `intervaloMin < intervaloMax`.
