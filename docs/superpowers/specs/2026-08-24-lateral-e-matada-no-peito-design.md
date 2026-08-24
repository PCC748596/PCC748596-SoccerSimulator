# Lateral com alvo em altura e matada no peito contínua

Data: 24 de Agosto de 2026

## Problema

Duas coisas que hoje não fazem o que o nome promete.

**O lateral não mira nada em altura.** O `lancarLateral` (js/player.js) resolve a
balística com a fórmula de alcance:

```
v = sqrt(alcance * g / sin(2 * elev))
```

que só vale quando a altura de saída é igual à altura de chegada. A bola sai das
mãos, a cerca de 2 m do chão, e a fórmula trata esse ponto como se fosse o chão:
o "alcance" calculado é onde a bola voltaria à altura das mãos, não onde chega ao
receptor. O receptor apanha-a à altura que calhar — muitas vezes ainda alta,
acima da faixa de peito, ou já a rolar.

O lançamento também **não tem erro nenhum de pontaria**: a direcção sai exacta
para o alvo, e a única variação é o sorteio uniforme da elevação
(`elevMin`/`elevMax`), que mexe na trajectória mas não na precisão. Um jogador de
TEC 20 repõe tão bem como um de TEC 90.

**A matada no peito é binária.** O `controlarNoPeito` sorteia
`venceuDuelo(TEC, 50, peitoBase)` e o `largarDoPeito` usa esse booleano para
escolher entre duas distâncias fixas: 0.5 m (bom) ou 1.5 m (mau). A técnica só
mexe na probabilidade do sorteio, não na qualidade do amortecimento — e mesmo o
caso bom larga a bola a meio metro, que não é "no pé".

## Decisões tomadas

Três escolhas de desenho, todas do dono do projecto:

1. **Alvo do lateral pela DISTÂNCIA.** Curto vai aos pés, longo vai ao peito.
   Não pela pressão sobre o receptor nem pela técnica de quem lança.
2. **Erro do lateral na DIRECÇÃO e no PESO.** A altura de chegada fica exacta:
   mira-se o peito, chega ao peito.
3. **Queda no peito CONTÍNUA por TEC.** Acaba a escolha entre duas distâncias
   fixas.

## Desenho

### 1. Balística com alvo em altura

Nova função pura em js/utils.js:

```js
velocidadeDeLancamento(distancia, alturaSaida, alturaAlvo, elev)
```

Resolve a velocidade inicial que põe a bola em `(distancia, alturaAlvo)` partindo
de `(0, alturaSaida)` com o ângulo `elev`:

```
dh  = alturaAlvo - alturaSaida
v^2 = g * D^2 / (2 * cos^2(elev) * (D * tan(elev) - dh))
```

O denominador tem de ser positivo: `D * tan(elev) > dh`. Quando não é — alvo
alto e ângulo baixo de mais — a função sobe o ângulo em passos até haver
solução, com um tecto. Sem solução dentro do tecto devolve `null`, e quem chama
cai no comportamento actual (fórmula de alcance).

Devolve `{ v, elev }`, porque o ângulo pode não ser o pedido.

Pura: sem Match, sem THREE, sem Math.random.

### 2. Alvo do lateral

No `lancarLateral`, depois de escolhido o companheiro:

- `dist <= ThrowInModel.distanciaAosPes` (9.0 m): alvo nos **pés**, altura
  `BallPhysics.raio`.
- acima disso: alvo no **peito**, altura `BallControl.peitoAltura` (1.20 m).

A altura do peito vem da constante que a RECEPÇÃO já usa, de propósito: se o
lançamento mirasse uma altura própria, as duas podiam divergir e a bola chegaria
fora da faixa `peitoYMin`/`peitoYMax` que dispara o `controlarNoPeito`.

Sem companheiro (o ramo "campo adentro"), mantém-se o comportamento actual.

### 3. Erro por técnica no lateral

Reutiliza o sorteio e a rotação do passe — `amostraGaussiana` e `rodarNoPlano`
(js/utils.js). Uma só forma de errar no projecto.

O `sigmaDePasse` em si **não** é chamado: ele mistura PASS com TEC e aplica
pressão e ângulo do corpo, que num lateral não se aplicam — quem repõe está
parado, fora do campo, com os adversários obrigados a 2.5 m
(`afastaAdversarios`) e virado para dentro. Fica uma função nova e pura em
js/utils.js, `sigmaDeLateral(tecSkill)`, com a mesma forma da curva mas com os
σ próprios do `ThrowInModel`:

```
sigma = sigmaMin + (sigmaMax - sigmaMin) * (1 - TEC/100)
```

Dois desvios independentes, ambos sorteados com `amostraGaussiana(Math.random)`:

- **direcção**: `rodarNoPlano(dx, dz, gauss * sigma)` — a bola sai torta;
- **peso**: a distância alvo é multiplicada por `1 + gauss * sigmaPeso`,
  cortada a `[0.6, 1.4]` para não produzir lançamentos absurdos. Cai curta ou
  passa o receptor.

A altura de chegada não leva erro.

Valores iniciais: `sigmaMax` 0.13 rad (~7.5°, um pouco abaixo dos ~9° do passe —
o lateral é de curta distância e com as duas mãos), `sigmaMin` 0.02 rad,
`sigmaPeso` 0.10 (10% de desvio no alcance a TEC 0).

### 4. Matada no peito contínua

No `largarDoPeito`, a distância deixa de sair do booleano:

```
frac  = TEC / 100
dist  = peitoQuedaMax + (peitoQuedaMin - peitoQuedaMax) * frac
dist *= 1 + gauss * sigmaQueda
dist  = clamp(dist, peitoQuedaMin * 0.6, peitoQuedaMax * 1.3)
```

com `peitoQuedaMin` 0.35 m (no pé) e `peitoQuedaMax` 1.6 m. A velocidade
vertical de saída interpola pela mesma fracção entre `peitoVelYMa` (repica para
cima, técnico fraco) e `peitoVelYBoa` (morre para baixo, técnico bom), para o
repique alto acompanhar a queda longa em vez de serem duas coisas
descorrelacionadas.

`peitoBom` continua a ser sorteado no `controlarNoPeito` e continua a alimentar:

- a animação (a pose e o pequeno salto não mudam);
- `MatchStats.registarRecepcao(this, bom)`;
- o evento `CHEST_CONTROL`.

Deixa apenas de decidir **onde a bola cai**. As constantes `peitoQueda` e
`peitoRepique` são removidas.

## Constantes

Novas em `ThrowInModel` (js/config.js):

| nome | valor | o que é |
|---|---|---|
| `distanciaAosPes` | 9.0 | abaixo disto o lateral vai aos pés, acima vai ao peito |
| `sigmaMax` | 0.13 | desvio angular (rad) a TEC 0 |
| `sigmaMin` | 0.02 | e a TEC 100 — nem o melhor é exacto |
| `sigmaPeso` | 0.10 | desvio relativo no alcance a TEC 0 |

Novas em `BallControl` (js/config.js):

| nome | valor | o que é |
|---|---|---|
| `peitoQuedaMin` | 0.35 | queda a TEC 100 — no pé |
| `peitoQuedaMax` | 1.6 | queda a TEC 0 |
| `sigmaQueda` | 0.25 | dispersão relativa em torno da distância |

Removidas: `BallControl.peitoQueda`, `BallControl.peitoRepique`.

## Testes

`tests/lateral_peito.test.js`, no mesmo molde dos dois testes que já existem:
extrai as funções puras do ficheiro de produção por texto e corre-as, sem
browser nem jsdom.

1. **Balística acerta na altura pedida.** Para distâncias de 5 a 18 m e alvos a
   `raio` e a 1.20 m, integrar a trajectória e verificar que a bola passa pela
   altura do alvo à distância do alvo, com tolerância de 5 cm.
2. **Alvo comuta na distância certa.** Abaixo de `distanciaAosPes` o alvo é os
   pés, acima é o peito.
3. **Sem solução devolve `null`** em vez de `NaN` — alvo acima do alcance do
   ângulo máximo.
4. **σ do lateral é monótono em TEC** e fica entre `sigmaMin` e `sigmaMax`.
5. **A queda no peito é monótona em TEC**, sempre dentro dos limites, e a
   TEC 100 fica abaixo de 0.5 m — é o "cai no pé" pedido.
6. **Distribuição do erro**: com `Math.random` injectado, a média do desvio
   angular sobre muitas amostras é ~0 e o desvio padrão bate no σ pedido.

## Fora de âmbito

- A altura de chegada do lateral não leva erro (decisão explícita).
- A matada no peito continua a largar a bola sempre **à frente** do jogador; a
  hipótese de a cuspir para o lado foi considerada e recusada.
- Não se mexe na animação do lateral (`ThrowInClip`) nem na do peito.
- Não se mexe na escolha do companheiro (`findPassTarget`).
