# Posicionamento do guarda-redes: fórmula única de ancoragem

Data: 2026-08-20

## Problema

O guarda-redes fica adiantado demais precisamente quando o ataque adversário se
aproxima da baliza. Em vez de recuar à medida que o perigo cresce, ele avança.

A causa é que `updateGK()` (`js/player.js`) não tem uma regra de posicionamento:
tem quatro, escritas em ramos diferentes do mesmo `if`, todas ancoradas na
distância bruta da bola e com coeficientes que crescem na direção errada.

| Local | Regra atual | Efeito |
| --- | --- | --- |
| `js/player.js:1841-1846` | repouso `5 m + avanço`, avanço `= (ballZ − ownGoalZ) * 0.1`, limitado por `GoalkeeperStyle.maxOut` | base já parte de 5 m fora da linha |
| `js/player.js:1938-1942` | portador a menos de 14 m: `ownGoal + (ballZ − ownGoal) * 0.55` | coeficiente máximo na situação mais perigosa |
| `js/player.js:1943-1945` | bola na área, portador longe: fator `0.35` | — |
| `js/player.js:1946-1949` | bola fora da área: fator `0.15` | — |

Os coeficientes sobem de 0.15 para 0.35 para 0.55 conforme o atacante se
aproxima. O único freio é o clamp da grande área.

Há ainda código morto: `actGoalkeeperPosition()` em `js/bt/player_bt.js:1078-1080`
repete a fórmula de repouso, mas nunca executa, porque `update()` encaminha os
guarda-redes para `updateGK()` e nunca para `runBehaviorTree()`.

## Solução

Uma função pura de ancoragem, com dois eixos independentes, substituindo as
quatro fórmulas de repouso e posicionamento.

### Interface

Definida em `js/config.js`, junto de `GoalkeeperStyle`. Não acede a `Match` nem
a estado global — recebe tudo por argumento, e por isso é testável isolada.

```js
function gkAnchor(ballX, ballZ, ownGoalZ, dirZ, style)  // → { x, z }
```

### Constantes

Substituem o `maxOut` solto:

```js
const GoalkeeperStyle = {
    defensive: { depthMin: 1.2, depthMax: 6.0,  sweepOut: 6.0  },
    offensive: { depthMin: 1.8, depthMax: 11.0, sweepOut: 20.0 }
};
const GK_D_NEAR = 16.5;   // borda da grande área
const GK_D_FAR  = 55.0;   // meio-campo adversário
```

### Profundidade (eixo Z)

Distância à linha de golo, monotonicamente crescente com a distância da bola.
O easing é quadrático, não linear: o recuo acelera junto da área, que é onde
importa.

```
d     = distância(bola, centro da própria baliza)
t     = clamp((d − GK_D_NEAR) / (GK_D_FAR − GK_D_NEAR), 0, 1)
depth = depthMin + (depthMax − depthMin) * t²
z     = ownGoalZ + depth * dirZ
```

Valores resultantes para o estilo `defensive`:

| Distância da bola à baliza | Profundidade |
| --- | --- |
| 16.5 m ou menos | 1.2 m |
| 30 m | 1.9 m |
| 40 m | 3.1 m |
| 55 m ou mais | 6.0 m |

### Lateral (eixo X)

Cobertura de ângulo, em vez do `ballX * 0.7` atual. O guarda-redes fica na
bissetriz do ângulo entre a bola e os dois postes, recuado de `depth`:

```
limitGKX = (LARGURA_BALIZA / 2) − 0.5
x        = clamp(ballX * (depth / d), −limitGKX, +limitGKX)
```

O desvio lateral encolhe sozinho conforme ele recua para a linha. É geometria,
não uma constante escolhida à mão.

### Sweeper

`gkStyle: 'offensive'` deixa de significar "mais adiantado o tempo todo".
`updateGkStyle()` (`js/bt/team_bt.js:816-848`) só o liga quando um adversário
com bola corre pelo corredor central sem defensor pela frente — é um gatilho de
sweeper, pontual, não uma postura de repouso.

Nesse caso, e apenas nesse caso, a fórmula de repouso é substituída por um alvo
de interceptação, limitado a `sweepOut` metros da linha. Fora do gatilho, os
dois estilos usam a mesma curva; diferem só nos valores das constantes.

## Alcance

Ramos de `updateGK()` que passam a chamar `gkAnchor`:

- `js/player.js:1841-1846` — repouso
- `js/player.js:1938-1942` — portador perto (mais o alvo de sweeper, se aplicável)
- `js/player.js:1943-1945` — bola na área
- `js/player.js:1946-1949` — bola fora da área

Inalterados de propósito:

- `js/player.js:1976-1980` — posicionamento com posse própria (`4.0` / `8.5` m).
  Recuar serve para defender; esta é a fase de construção.
- Estados reativos: `mergulho`, `maos`, `apanhar`, `salto_alto`.
- O ramo de cruzamento e o de bola solta perto do guarda-redes.

Removido: `actGoalkeeperPosition()` em `js/bt/player_bt.js:1078-1080`, código
morto que duplica a fórmula antiga.

## Testes

Novo ficheiro `tests/gk_anchor.test.js`, no padrão dos restantes: recorta as
funções reais de `js/config.js` e corre-as num sandbox `node:vm`.

- Monotonicidade: aproximar a bola da baliza nunca aumenta `depth`.
- Limites: `d = 0` devolve `depthMin`; `d` muito grande devolve `depthMax`.
- Clamp lateral: bola num ângulo extremo não põe o guarda-redes fora do poste.
- Simetria: TeamA e TeamB produzem posições espelhadas para entradas espelhadas.
- Regressão do bug: com a bola a 16 m da baliza, a profundidade é menor do que
  com a bola a 40 m.
