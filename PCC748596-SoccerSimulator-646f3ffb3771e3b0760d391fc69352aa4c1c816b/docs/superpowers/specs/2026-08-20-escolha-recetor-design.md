# Escolha do recetor: o passe lateral para o jogador isolado

Data: 2026-08-20

## Problema

Um jogador recebe na lateral e toca ainda mais para a lateral, para um
companheiro sem ninguém à volta, quando tinha campo à frente para conduzir ou
outro companheiro para quem jogar. A bola vai sistematicamente para o lado onde
não há jogada nenhuma.

A causa está na pontuação do recetor, em `PassTypes.escolher`
(`js/pass_types.js:216-220`):

```js
let nota = progresso * E.pesoProgresso      // 1.2 por metro ganho
    + pontos.length * E.pesoEspaco          // 1.0 POR PONTO do leque
    - dist * E.pesoDistancia;               // 0.6 por metro de passe
```

O termo do meio é a **contagem** de pontos vivos no leque do companheiro. O leque
tem `PassCandidates.arcos × PassCandidates.pontosPorArco` = 7 × 7 = **49 pontos**,
e um jogador isolado na lateral tem quase todos vivos — não há adversários por
perto para os cortar.

| Candidato | progresso | pontos vivos | dist | nota |
| --- | --- | --- | --- | --- |
| Isolado na lateral, sem progredir | 0 m → 0 | ~49 → **49** | 20 m → −12 | **37** |
| Bem colocado à frente, marcado | 20 m → 24 | ~10 → 10 | 20 m → −12 | **22** |

O isolado ganha, e ganha **precisamente por estar isolado**: o leque intacto vale
mais do que trinta metros de progressão.

É o mesmo defeito do `CarryModel.sectorWeight`, já corrigido: os três termos
estão em escalas diferentes e os pesos não são comparáveis. A contagem vai de 0 a
49; o progresso raramente passa de 40.

## Solução

### Três termos normalizados

Cada termo passa a 0..1 antes de ser pesado:

```
progressoNorm = clamp(progresso / progressoRef, -1, 1)   // progressoRef = 30 m
espacoNorm    = pontos.length / maxPontosLeque           // 49, lido do PassCandidates
distNorm      = clamp(dist / distanciaMax, 0, 1)         // distanciaMax = 45 m
```

`maxPontosLeque` vem de `PassCandidates.arcos * PassCandidates.pontosPorArco`, e
não de um 49 escrito à mão: mexer na densidade do leque não pode voltar a
desequilibrar isto em silêncio.

`progressoNorm` pode ser negativo — um passe para trás perde terreno — e por isso
o clamp é a −1, não a 0.

### Os pesos variam com a pressão sobre o portador

```
pressao = 1 − clamp(distAdversarioMaisPerto / raioPressao, 0, 1)   // raioPressao = 8 m
```

E interpolam linearmente entre dois conjuntos:

| Peso | Sem pressão (`pressao` = 0) | Sob pressão (`pressao` = 1) |
| --- | --- | --- |
| `progresso` | 1.0 | 0.45 |
| `espaco` | 0.30 | 1.0 |
| `distancia` | 0.35 | 0.20 |

Livre de marcação, procura quem progride. Com um adversário em cima, procura quem
está livre — e aí o passe lateral para o isolado passa a ser a jogada certa, em
vez de ser a regra.

`bonusSugerido` (30, a vantagem do alvo que o BT propôs) passa a `0.5` na escala
nova, para manter a mesma intenção: o BT continua no comando e só é trocado por
uma alternativa claramente melhor.

### A cascata quando não há bom recetor

`PassTypes.escolher` passa a devolver também a `nota` do melhor candidato. Se ela
ficar abaixo de `notaMinima` (0.35), `actPass` tenta por esta ordem:

**1. Driblar**, se a Técnica for pelo menos `tecnicaDrible` (75 — o limiar que o
projeto já usa em `podeDriblar`, `js/bt/player_bt.js:522`) e houver espaço à
frente (`ctx.campoAberto`, que a árvore já calcula).

**2. Passe para trás**, ao melhor companheiro que esteja **atrás da linha da bola
e a menos de `raioRecuo` (18 m)**. O limite de distância é o ponto importante:
sem ele, um médio sob pressão atrasava para o guarda-redes a quarenta metros, e
isso não é reiniciar a jogada, é fugir dela. A regra `recuo` da tabela de
misturas já garante que essa bola vai aos pés e não para o espaço.

Qualquer jogador de campo serve, e o guarda-redes também — desde que esteja
dentro do raio. Não é o papel dele que o exclui, é a distância.

**3. Conduzir para trás**, se não houver ninguém atrás dentro do raio. Voltar com
a bola e esperar que apareça linha, em vez de a atirar para a lateral.

### Conduzir para trás

Isto não existe hoje. O `case 'CARRY'` (`js/fsm.js:401`) gera os nove candidatos
num cone de ±56° em torno da direcção de **ataque**, portanto nenhum portador sabe
recuar com a bola.

A forma limpa é reutilizar a mesma escolha de direcção com o eixo invertido: uma
bandeira `p.carryRecuo` faz o cone abrir em torno de `−dirZ` em vez de `+dirZ`.
Assim ele recua pelo corredor mais livre — com o mesmo peso de espaço, o mesmo
tratamento de obstáculos e o mesmo respeito pelo sector — em vez de recuar às
cegas.

A bandeira levanta-se quando `actPass` cai no passo 3 e baixa quando o jogador
larga a bola, no mesmo sítio onde `carryDist` é reposto
(`js/bt/player_bt.js:56`).

### Constantes

Em `PassTypeModel.escolha`, substituindo `pesoProgresso`, `pesoEspaco` e
`pesoDistancia`, que deixam de ter sentido na escala antiga:

```js
bonusSugerido: 0.5,      // era 30, na escala antiga
progressoRef: 30.0,
distanciaMax: 45.0,      // fica como está
raioPressao: 8.0,
notaMinima: 0.35,
tecnicaDrible: 75,
raioRecuo: 18.0,
pesosSemPressao: { progresso: 1.0,  espaco: 0.30, distancia: 0.35 },
pesosSobPressao: { progresso: 0.45, espaco: 1.00, distancia: 0.20 }
```

## Alcance

Modificados:

- `js/config.js` — `PassTypeModel.escolha` com as constantes acima.
- `js/pass_types.js` — `pressaoSobrePortador`, `pesosPorPressao`,
  `notaCandidato` (puras); `escolher` normaliza e devolve a `nota`;
  `melhorRecuo` nova.
- `js/bt/player_bt.js` — `actPass` com a cascata; `p.carryRecuo` reposto ao
  largar a bola.
- `js/fsm.js` — o `case 'CARRY'` inverte o cone quando `p.carryRecuo`.
- `js/player.js` — `this.carryRecuo = false` no construtor.

Inalterados de propósito:

- A escolha do **tipo** de passe (`direct`/`space`/`leading`) e a tabela de
  misturas. Isto é sobre QUEM recebe, não sobre onde a bola cai.
- `PassCandidates` e os seus filtros.
- `podeDriblar` e `actDribble`, que continuam a decidir o 1×1 por si.
- O cruzamento, o lançamento e a saída do guarda-redes.

## Testes

Novo ficheiro `tests/escolha_recetor.test.js`.

- `pressaoSobrePortador` é 1 com o adversário em cima, 0 no limite do raio e
  além, e monotonicamente decrescente pelo meio.
- `pesosPorPressao(0)` devolve `pesosSemPressao` e `pesosPorPressao(1)` devolve
  `pesosSobPressao`; a meio é a média dos dois.
- `notaCandidato` é monótona em cada termo: mais progresso e mais espaço nunca
  baixam a nota, mais distância nunca a sobe.
- **Regressão do bug:** sem pressão, o candidato à frente e marcado
  (20 m de progresso, 10 pontos vivos, a 20 m) bate o isolado na lateral (0 m de
  progresso, 49 pontos vivos, a 20 m) — **0.572 contra 0.144**. Com os pesos
  antigos perdia, 22 contra 37.
- Sob pressão a ordem inverte-se — **0.415 contra 0.911** — e o isolado volta a
  ganhar. É para isso que os pesos variam.
- `maxPontosLeque` é calculado do `PassCandidates`, não escrito à mão: mudar
  `arcos` muda o divisor.
- `melhorRecuo` só devolve candidatos atrás da linha da bola.
- `melhorRecuo` ignora quem está para lá de `raioRecuo`, mesmo estando atrás — é
  o que impede o atraso para o guarda-redes a meio-campo.
- `melhorRecuo` aceita o guarda-redes se ele estiver dentro do raio: é a
  distância que exclui, não o papel.
- `melhorRecuo` devolve `null` quando não há ninguém atrás dentro do raio, que é
  o caso que manda conduzir para trás.
