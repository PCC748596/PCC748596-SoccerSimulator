# Passes à frente do recebedor: leading pass e passe no espaço

Data: 2026-08-20

## Problema

Os passes chegam quase sempre ao pé do companheiro parado, em vez de à frente
dele. O jogo fica sem fluidez: cada passe é uma paragem, e a jogada não corre.

O sistema de tipos de passe — `direct` (aos pés), `space` (ponto mediano do
leque) e `leading` (ponto mais adiantado) — existe e está ligado. `actPass` e
`actPassParaAlvo` (`js/bt/player_bt.js`) chamam `PassTypes`, que devolve tipo e
ponto de mira, e `aplicarMiraDoPasse` aplica-o. A cadeia funciona; o que falha
são as proporções e o comportamento em caso de falha.

### 1. As misturas quase nunca pedem `leading`

`PassTypeModel.regras` (`js/config.js`):

| Regra | Quando dispara | direct | space | leading |
| --- | --- | --- | --- | --- |
| `defParaAtk` | defesa para o ataque, a saltar o meio | 0 | 0.5 | 0.5 |
| `origemAtaque` | origem no último terço | 0.4 | 0.6 | 0 |
| `centroParaLado` | centro a abrir para a ponta, a progredir | 0 | 0.8 | 0.2 |
| `centroParaCentro` | centro para centro | 0.8 | 0.2 | 0 |
| `misturaPadrao` | tudo o resto | 0.8 | 0.2 | 0 |

`leading` só aparece em duas regras estreitas. E a regra que apanha a maioria dos
passes é a `misturaPadrao` — recuos, passes laterais dentro do mesmo sector,
qualquer combinação que não case com as quatro acima — que pede `direct` em 80%
dos casos.

### 2. Sem ponto validado, a bola vai aos pés

`PassTypes.pontoPara` (`js/pass_types.js:139-150`) devolve `DIRECT` sempre que o
leque não tem candidato que sirva:

```js
if (tipo === this.SPACE) {
    const pt = this.pontoMediano(pontos, mate);
    return pt ? { tipo: tipo, ponto: pt } : { tipo: this.DIRECT, ponto: null };
}
```

Os pontos vêm de `PassCandidates.gerarCandidatos`, e `pontoValido`
(`js/pass_candidates.js:212-217`) descarta os que estão fora do campo, a mais de
30 m da bola, com adversário a menos de `raioAdversario` (2 m), ou com adversário
na linha de passe. Num bloco compacto isso apaga muitos pontos, e cada
apagamento vira mais um passe ao pé.

Os dois efeitos somam-se, e o segundo é invisível: nada regista com que
frequência um `leading` sorteado acabou como `direct`.

## Solução

### O passe à frente deixa de depender do leque

Função nova em `js/pass_types.js`:

```js
PassTypes.pontoLiderancaCurta(mate, opponents) → { x, z } | null
```

Projecta um ponto a `PassTypeModel.liderancaCurta` metros à frente do
companheiro, na direcção em que o corpo dele aponta — a mesma que
`gerarCandidatos` já usa (`+Z` local do modelo), e que a correr é a direcção da
corrida, porque o `steerArrive` roda o corpo para o alvo do movimento a cada
frame.

Não consulta o leque nem os seus filtros. Duas condições apenas:

1. O ponto tem de cair dentro das linhas do campo.
2. Se houver adversário a menos de `PassCandidates.raioAdversario` (2 m) do
   ponto, encurta-se a distância em passos de `liderancaPasso` (1 m) até ao
   mínimo `liderancaMin` (1.5 m). Só devolve `null` se nem encurtada servir.

`pontoPara` deixa de cair em `DIRECT` por leque vazio: tenta primeiro este ponto.
A bola passa a chegar à frente mesmo em campo apertado, que é onde a travada se
sente.

Assinatura de `pontoPara` passa a incluir os adversários, que hoje não recebe:

```js
pontoPara(tipo, pontos, mate, golZ, opponents)
```

`paraMate` e `escolher` já têm acesso a eles através de `Match.players` /
`Match.opponents`, pelo mesmo critério de equipa que `gerarCandidatos` usa.

### Balística do leading curto

`aplicarMiraDoPasse` (`js/bt/player_bt.js:481-492`) marca todo `SPACE`/`LEADING`
como `isThroughBall`, o que usa `PassModel.vChegadaLancamento` (5 m/s à chegada)
— certo para uma bola em que se corre 15 m, lento de mais para um leading de 4 m.

O ponto devolvido passa a trazer a origem:

```js
{ x, z, curto: true }   // veio de pontoLiderancaCurta
{ x, z }                // veio do leque
```

`aplicarMiraDoPasse` só marca `isThroughBall` quando o ponto **não** é curto. Um
leading curto é um passe normal com o alvo deslocado, e usa a balística de passe
aos pés (`vChegadaRasteira`).

### As misturas passam a pedir a bola à frente

Entra uma regra nova no topo, antes de todas: se o destino está atrás da origem
no referencial de ataque, é recuo e vai aos pés. Hoje não existe noção de recuo —
um passe para trás cai na `misturaPadrao` e é tratado como qualquer outro.

Para a regra poder decidir, `zonaDe` passa a devolver também o avanço em metros:

```js
zonaDe: function (x, zAtk) {
    return { sector: this.sectorDe(zAtk), corredor: this.corredorDe(x), avanco: zAtk };
}
```

É um campo acrescentado, não uma mudança: `sector` e `corredor` continuam iguais
e as regras existentes não notam a diferença.

A regra de recuo usa uma margem, para um passe lateral não contar como recuo:

```js
{ nome: 'recuo', quando: (o, d) => d.avanco < o.avanco - PassTypeModel.margemRecuo,
  mistura: { direct: 0.85, space: 0.15 } }
```

Tabela final:

| Regra | direct | space | leading |
| --- | --- | --- | --- |
| `recuo` (nova, primeira) | 0.85 | 0.15 | 0 |
| `defParaAtk` | 0 | 0.50 | 0.50 |
| `origemAtaque` | 0.25 | 0.45 | 0.30 |
| `centroParaLado` | 0.10 | 0.55 | 0.35 |
| `centroParaCentro` | 0.30 | 0.35 | 0.35 |
| `misturaPadrao` | 0.30 | 0.35 | 0.35 |

O padrão inverte-se: de 80% aos pés para 70% à frente.

### Constantes

Em `PassTypeModel`:

```js
margemRecuo: 2.0,       // metros; abaixo disto é passe lateral, não recuo
liderancaCurta: 4.0,    // metros à frente do companheiro
liderancaPasso: 1.0,    // de quanto encurta perante um adversário
liderancaMin: 1.5,      // abaixo disto não vale a pena; devolve null
```

## Alcance

Modificados:

- `js/config.js` — `PassTypeModel`: regra `recuo`, misturas novas, as quatro
  constantes acima.
- `js/pass_types.js` — `zonaDe` (campo `avanco`), `pontoLiderancaCurta` (nova),
  `pontoPara` (assinatura e fallback), `paraMate` e `escolher` (passam os
  adversários).
- `js/bt/player_bt.js` — `aplicarMiraDoPasse` não marca `isThroughBall` para
  ponto curto.

Inalterados de propósito:

- `PassCandidates` e os seus filtros. Alargá-los mudaria também o que o debug
  visual mostra, e o fallback resolve o problema sem tocar neles.
- A escolha do receptor (`PassTypes.escolher` e `PassTypeModel.escolha`). Esta
  mudança é sobre ONDE a bola cai, não sobre quem a recebe.
- `pontoMediano` e `pontoMaisPertoDoGolo`. Continuam a ser a primeira escolha
  quando o leque tem pontos.
- O cruzamento e o lançamento, que têm caminhos próprios.

## Testes

`tests/pass_types.test.js` já existe, com o harness montado: recorta o
`PassTypeModel` de `js/config.js` para um sandbox e importa `PassTypes` por
`require`, que o ficheiro já exporta. Os testes novos entram lá.

- `zonaDe` devolve `avanco` igual ao `zAtk` recebido, e `sector`/`corredor`
  continuam iguais aos de hoje para as mesmas entradas.
- A regra `recuo` dispara quando o destino está mais de `margemRecuo` atrás, e
  **não** dispara para um passe lateral puro (mesmo avanço) nem para um passe
  para a frente.
- A regra `recuo` ganha às outras: um passe de recuo com origem no ataque casa
  `recuo`, não `origemAtaque`.
- Cada mistura da tabela soma exactamente 1.
- `pontoLiderancaCurta` devolve um ponto à frente do companheiro, nunca atrás:
  a projecção na direcção do corpo é positiva.
- `pontoLiderancaCurta` devolve `null` quando o companheiro está encostado à
  linha e o ponto cairia fora do campo.
- `pontoLiderancaCurta` encurta perante um adversário no caminho, e o ponto
  devolvido fica a pelo menos `liderancaMin` do companheiro.
- `pontoLiderancaCurta` marca `curto: true` no ponto devolvido.
- `pontoPara` com leque vazio e tipo `LEADING` devolve `LEADING` com ponto curto,
  não `DIRECT` — é a regressão do bug.
- `pontoPara` com leque vazio e tipo `SPACE` faz o mesmo.
- `pontoPara` com leque vazio, tipo `LEADING` e nenhum ponto curto possível
  (companheiro contra a linha de fundo) devolve `DIRECT`.
- `pontoPara` com leque cheio continua a preferir o ponto do leque, sem `curto`.
