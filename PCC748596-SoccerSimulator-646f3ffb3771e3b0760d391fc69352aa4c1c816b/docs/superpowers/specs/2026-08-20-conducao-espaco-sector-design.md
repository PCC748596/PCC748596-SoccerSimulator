# Condução de bola: escolher o espaço livre e respeitar o sector do painel

Data: 2026-08-20

## Problema

O portador conduz sempre na direcção da baliza, mesmo com adversários pela
frente e uma ponta completamente livre. Quando recebe pela ponta, corta para o
meio — mesmo com os sectores `Left` e `Right` activados no painel, que pedem
exactamente o contrário.

São dois defeitos independentes.

### 1. O progresso esmaga o espaço na pontuação

A escolha da direcção de condução vive em `js/fsm.js:401-476`, dentro do
`case 'CARRY'`. Para cada uma de nove direcções candidatas:

```
nota = min(distObstáculo, spaceCap) * spaceWeight      // 2.0
     + (tz − pz) * dirZ * progressWeight               // 3.2
     − |tx − carryTargetX| * sectorWeight              // 4.5
```

Os três termos vivem em escalas diferentes, e duas delas dependem da técnica do
jogador através de `visDist` (`max(12, TEC * 0.5)`) e do cone de visão
(`max(30°, TEC * 0.7)`).

Para um jogador de técnica 80 — `visDist` 40 m, cone ±56°:

| Termo | Amplitude entre a melhor e a pior direcção |
| --- | --- |
| Progresso | `40 * 3.2 − 22 * 3.2` = **56 pontos** |
| Espaço | `16 * 2.0 − 0` = **32 pontos** |

O progresso ganha sempre. Uma direcção frontal com um adversário colado bate
uma ponta completamente vazia, por 24 pontos.

Afinar os pesos à mão já falhou duas vezes: o comentário em `js/config.js`
regista o `sectorWeight` a subir de 1.0 para 1.5, para 2.25 e para 4.5 sem
efeito visível. A causa é a escala, não o valor.

### 2. O sector é sorteado sem olhar para onde o jogador está

`Tatics.getWeightedSectorX()` (`js/config.js:2039-2057`) escolhe um sector ao
calhas dentro do grupo activo:

```js
const chosenSector = pool[Math.floor(Math.random() * pool.length)];
```

Com `Left` e `Right` activos, `pool = ['esq', 'dir']` e o sorteio é uma moeda ao
ar. Um extremo que recebe na direita tem 50% de hipótese de sair com
`carryTargetX ≈ −19` — e atravessa o campo pelo meio para lá chegar.

Pior: `js/fsm.js:410` volta a sortear a cerca de 1.2 vezes por segundo, portanto
ele pode mudar de ideias a meio da corrida.

Há ainda um terceiro ponto, menor: a penalidade é a distância a um **X pontual**
(`±19` com 8 m de ruído), não a "estar dentro da faixa". Um extremo em `x = +25`,
já bem colocado, é penalizado por estar 6 m fora do ponto.

## Solução

### Sector: faixa em vez de ponto, posição em vez de sorteio

Um único helper para classificar um X, no referencial de ataque. A convenção
(`|x * dirZ| ≤ 10` é centro) já existe duas vezes no projecto — em
`PassTypeModel.larguraCentro` e, copiada à mão, no `getSectorOfX` inline de
`js/player.js:515-520`. Passa a existir uma vez só:

```js
Tatics.sectorDeX(x, dirZ) → 'esq' | 'cen' | 'dir'
```

`js/player.js` passa a chamá-lo em vez da cópia local.

E a penalidade, também pura:

```js
Tatics.penalidadeSector(x, dirZ) → 0..1
```

Devolve **zero** enquanto o ponto cair dentro de qualquer sector activo. Fora
deles, cresce com a distância à borda do sector activo mais próximo, normalizada
pela meia-largura do campo (`CAMPO_LARG / 2`), e satura em 1.

Consequências:

- Um extremo em `x = +25` com `Right` activo tem penalidade zero. Hoje é
  penalizado por não estar exactamente em `+19`.
- Um jogador num sector desactivado é empurrado para o activo mais próximo —
  nunca para o do outro lado do campo.
- `carryTargetX` e o sorteio a 1.2 Hz (`js/fsm.js:409-411`) desaparecem.
  O campo `this.carryTargetX` sai de `js/player.js:53`.
- `Tatics.getWeightedSectorX()` fica sem chamadores e é removida.

O ramo especial dos laterais (`js/fsm.js:409`, `p.pos === 'LB' || 'RB'` fixava
`carryTargetX` em `baseTarget.x * 1.05`) também desaparece: com a penalidade por
faixa, um lateral já está no seu sector e não é penalizado por lá ficar.

### Pontuação: termos normalizados

Cada termo passa a 0..1 antes de ser pesado, e os pesos passam a ser comparáveis
entre si:

```
espaço    = min(distObstáculo, spaceCap) / spaceCap
progresso = ((tz − pz) * dirZ) / visDist          // = cos(ângulo), ≥ 0 no cone
sector    = Tatics.penalidadeSector(tx, dirZ)

nota = espaço * pesoEspaco(TEC) + progresso * pesoProgresso − sector * pesoSector
```

`pesoEspaco(TEC)` interpola linearmente entre `pesoEspacoMin` (1.0, para técnica
≤ 40) e `pesoEspacoMax` (2.4, para técnica ≥ 90). `pesoProgresso` fica em 1.0 —
é a unidade de referência — e `pesoSector` em 1.6.

A técnica passa a mandar por duas vias:

1. O **peso do espaço**: quem tem técnica lê o espaço e desvia; quem não tem
   insiste no caminho para a baliza.
2. O **cone de visão**, que já existia: ±30° a técnica 40, ±56° a técnica 80. Um
   jogador de técnica baixa nem chega a ver a ponta livre a 56°.

O caso concreto — extremo na direita, meio fechado, `Right` activo, técnica 80:

| Direcção | espaço | progresso | sector | nota |
| --- | --- | --- | --- | --- |
| Frontal, adversário a 2 m | 0.13 | 1.00 | 0 | **1.28** |
| Ponta livre, a 56° | 1.00 | 0.56 | 0 | **2.80** |

A ponta ganha por larga margem. Com os pesos actuais, perde.

O cone nunca gera direcções com progresso negativo (vai de −56° a +56° em torno
da direcção de ataque), portanto o portador não recua nem corre puramente de
lado. Isso mantém-se sem precisar de regra nova.

### Extracção para funções puras

A pontuação vive dentro de um `case` de setenta linhas e não tem forma de ser
testada. Passa para `js/utils.js`:

```js
pesoEspacoPorTecnica(tec) → number
notaDireccaoCarry(espaco, progresso, sectorPen, tec) → number
```

Ambas puras: sem `Match`, sem `window`, só os argumentos. O `case 'CARRY'`
continua responsável pela geometria — gerar o leque, medir o obstáculo mais
próximo em cada corredor — e chama estas duas para pontuar.

`Tatics.sectorDeX` e `Tatics.penalidadeSector` leem `Tatics.setores`, que é
estado do painel, e por isso não são puras no mesmo sentido. Os testes montam um
`Tatics` mínimo no sandbox, como `tests/gk_saida.test.js` já faz para outras
globais de browser.

### Constantes

Em `CarryModel`, substituindo `spaceWeight`, `progressWeight` e `sectorWeight`,
que deixam de ter sentido na escala antiga:

```js
pesoEspacoMin: 1.0,    // técnica <= 40
pesoEspacoMax: 2.4,    // técnica >= 90
tecEspacoMin: 40,
tecEspacoMax: 90,
pesoProgresso: 1.0,
pesoSector: 1.6,
```

`spaceCap` (16), `corredor`, `abertura`, `espacoLivre`, `distanciaMax`,
`margemLinhaFundo` e os `touch*` ficam como estão.

## Alcance

Modificados:

- `js/config.js` — `CarryModel` (pesos novos), `Tatics.sectorDeX`,
  `Tatics.penalidadeSector`; remoção de `Tatics.getWeightedSectorX`.
- `js/utils.js` — `pesoEspacoPorTecnica`, `notaDireccaoCarry`.
- `js/fsm.js` — o `case 'CARRY'` passa a chamar as funções novas; sai o sorteio
  de `carryTargetX` e o ramo especial dos laterais.
- `js/player.js` — sai `this.carryTargetX`; o `getSectorOfX` inline passa a
  chamar `Tatics.sectorDeX`.

Inalterados de propósito:

- Os toques de condução (`touchLong` / `touchMedium` / `touchShort` e o cone de
  detecção do adversário mais próximo). O que muda é para onde ele corre, não
  como adianta a bola.
- `podeDriblar` / `actDribble` — o drible a um adversário concreto é decisão à
  parte, tomada antes de haver direcção de condução.
- `campoAberto` e o orçamento `distanciaMax`, que decidem **se** conduz. Esta
  mudança é só sobre **para onde**.

## Testes

Novo ficheiro `tests/carry_direccao.test.js`, no padrão dos restantes: recorta as
funções reais dos ficheiros de origem e corre-as num sandbox `node:vm`.

- `pesoEspacoPorTecnica` satura: técnica 20 e 40 dão `pesoEspacoMin`; técnica 90
  e 99 dão `pesoEspacoMax`; técnica 65 dá o ponto médio.
- `notaDireccaoCarry` é monótona em cada termo isolado: mais espaço nunca baixa a
  nota; mais progresso nunca baixa a nota; mais penalidade de sector nunca a
  sobe.
- Regressão do bug: com técnica 80, a ponta livre (espaço 1.0, progresso 0.56)
  bate a frontal fechada (espaço 0.13, progresso 1.0). Com técnica 40 a diferença
  encolhe, mas a ponta continua à frente quando é visível.
- `penalidadeSector` devolve 0 em qualquer x dentro de um sector activo, com
  `setores` = `['esq','dir']` e com `['cen']`.
- `penalidadeSector` cresce com a distância à borda e satura em 1.
- `sectorDeX` espelha correctamente: o mesmo x do mundo dá sectores opostos para
  `dirZ = 1` e `dirZ = -1`.
- `sectorDeX` classifica as fronteiras: `x * dirZ` de −10 e +10 são ambos `cen`.
