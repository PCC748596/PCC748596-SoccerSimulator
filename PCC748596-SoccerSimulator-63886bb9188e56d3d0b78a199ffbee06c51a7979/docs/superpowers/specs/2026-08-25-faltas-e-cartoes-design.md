# Faltas e cartões

Data: 25 de Agosto de 2026

## De onde isto vem

O objectivo final é um teste que compare a simulação com as médias reais de um
jogo de futebol:

| Estatística | Média por jogo | Existe no código? |
|---|---|---|
| Gols | 2,52 | sim (`remates.golos`) |
| Finalizações | 26,11 | sim (`remates.tentados`) |
| Escanteios | 9,92 | sim (`cantos`) |
| Faltas | 27,63 | **não** |
| Cartões | 5,22 | **não** |
| Vermelhos | ~0,08 | **não** |
| Impedimentos | 3,20 | **não** |
| Ataques perigosos | 77,84 | **não** |
| Ataques totais | 176,63 | **não** |
| xG total | 2,84 | **não** |

Sete dos dez não existem. O `triggerFreeKick` e o `triggerPenalty` já estão
escritos, mas **só o botão do painel os chama** (`index.html`): não há detecção
de falta nenhuma, e num lote de simulação as faltas são sempre zero.

Um teste que acusasse esses zeros não diria nada sobre realismo — diria que
ninguém escreveu o código. Por isso instrumenta-se primeiro.

## A decomposição

Cinco peças, cada uma com o seu spec e a sua sessão:

1. **Faltas e cartões** — esta.
2. **Impedimento marcado** — para o jogo e repõe com livre.
3. **Ataques totais e perigosos** — só contagem.
4. **xG por remate** — só contagem.
5. **O teste de calibração dos dez indicadores** — corre o `Sim`.

As peças 3, 4 e 5 são leitura e não mudam comportamento. As peças 1 e 2 **param
o jogo**, e é por isso que vêm primeiro: toda a calibração posterior tem de ser
feita já com as paragens lá dentro.

## Onde vive

`js/officials.js`. O ficheiro já é o árbitro e já é auto-contido; marcar faltas
é o trabalho dele. O `js/match.js` está nas ~3400 linhas e não precisa de mais
uma responsabilidade.

## Como nasce uma falta

Duas fontes.

**Fonte A — desarme ou carrinho falhado.** O duelo já é resolvido por
`venceuDuelo()` (js/utils.js) e o perdedor já é conhecido. Quando o defensor
perde, passa a haver probabilidade de falta: alta no `SLIDE_TACKLE` (contacto
por trás, corpo em movimento), baixa no `TACKLE` de pé. Não inventa
comportamento nenhum — dá consequência a um desfecho que já existe e que hoje
não custa nada a quem falha.

**Fonte B — contacto.** Para cada par de adversários próximos: se a distância
cai abaixo de um raio e a velocidade relativa passa um limiar, há contacto;
acima de uma segunda velocidade, é falta. Cobre empurrões e choques sem
tentativa de desarme.

> **A CALIBRAÇÃO É ACOPLADA.** As duas fontes somam para a mesma média de
> 27,63 faltas por jogo: subir a probabilidade de uma obriga a descer a outra.
> Existe por isso uma constante única, `RefereeModel.faltas.escala`, que
> multiplica ambas — para se poder mexer no TOTAL sem tocar no equilíbrio entre
> as duas.

A falta chama o `Match.triggerFreeKick(equipa)` que já existe, ou o
`triggerPenalty` se o sítio for dentro da área.

## Gravidade e cartões

A gravidade soma quatro parcelas: o tipo (carrinho pesa mais que desarme de
pé), a velocidade do contacto, o ângulo (por trás pesa mais que de frente) e se
travou um ataque em progressão. Acima de `limiarAmarelo`, amarelo; acima de
`limiarVermelho`, vermelho directo.

### O problema aritmético do segundo amarelo

Com 5,22 cartões repartidos por 22 jogadores, a probabilidade de **algum**
jogador apanhar dois amarelos é cerca de **46%** por jogo — é o problema do
aniversário, não intuição. Os números pedidos querem **8%** (0,08 vermelhos por
jogo). Segundo amarelo puro dá quase seis vezes vermelhos a mais.

O que falta é o que acontece no futebol a sério: **quem tem amarelo passa a
jogar com medo.** Um jogador advertido deixa de fazer carrinhos e evita os
duelos arriscados, portanto quase não volta a cometer falta punível. Entra como
uma flag no jogador (`temAmarelo`), lida pelo `js/bt/player_bt.js` na decisão
de `SLIDE_TACKLE`.

É ela que puxa os 46% para perto dos 8%, sem constante nenhuma inventada para o
efeito, e faz do vermelho uma coisa **emergente** em vez de sorteada. O preço: é
mais uma peça acoplada à calibração — se o medo for forte demais, os cartões
descem abaixo de 5,22, porque o advertido deixa de cometer faltas de todo.

## A expulsão

O expulso sai de `Match.players` (ou `Match.opponents`) e vai para
`Match.expulsos`. Os outros dez **mantêm as posições que tinham**: não há
reorganização para 4-4-1. É deliberado — o efeito que interessa é o buraco na
equipa, e reorganizar exigia formações novas no `FormationsData` para cada
combinação de posição perdida.

Tirar da lista, em vez de pôr uma flag a ser filtrada por toda a parte, é a
mesma escolha que o `officials.js` já explica no cabeçalho: quem não joga não
anda nas listas de quem joga.

> **MAS TEM UM PREÇO, e é nesta peça que se paga:** o `aplicarCoberturaNoJogo`
> (js/simulate.js) indexa `Match.players[idx]` por POSIÇÃO NA LISTA. Com dez
> jogadores os índices deslocam-se e a calibração de estilos passa a atribuir o
> estilo ao jogador errado — sem se queixar. Tem de ser tratado aqui.

## Contadores novos

No `js/stats.js`, por equipa: `faltas.cometidas`, `faltas.sofridas`,
`cartoes.amarelos`, `cartoes.vermelhos`, `penaltis`.

Aproveita-se para instrumentar o `trocasMarcacao`, que hoje é declarado e
exportado mas **nunca incrementado por ninguém** — o zero que aparece nos
relatórios não é um resultado, é a ausência de instrumentação.

## Testes

`tests/faltas_cartoes.test.js`, node puro como os outros. O que se testa são as
funções puras, que é onde as regras vivem:

- `Officials.gravidadeDaFalta({tipo, velocidade, angulo, travouAtaque})` —
  carrinho por trás em velocidade dá mais gravidade que desarme de frente
  parado; cada parcela move o resultado no sentido certo.
- `Officials.decidirCartao(gravidade, jogador)` — acima do limiar dá amarelo;
  segundo amarelo do mesmo jogador dá vermelho; gravidade extrema dá vermelho
  directo.
- Um jogador com `temAmarelo` não escolhe `SLIDE_TACKLE`.
- Falta dentro da área chama penálti e não livre.
- A expulsão tira o jogador da lista e a calibração de estilos continua a
  acertar no jogador certo (o problema dos índices, acima).

**O teste dos números por jogo não é este.** 2,52 golos, 27,63 faltas e o resto
são a peça 5: corre o `Sim` no browser, sobre jogos de 90 minutos, e é ele que
dirá se a calibração presta.

## Riscos assumidos

- A calibração passa a estar acoplada em três sítios: as duas fontes de falta e
  o medo do advertido. Mexer num desregula os outros dois, e só a peça 5 mostra
  o efeito.
- **Faltas param o jogo, e a dinâmica actual foi calibrada sem paragens.** Posse,
  passes e distância percorrida vão mexer-se todos. Não é regressão — é o jogo a
  ficar mais parecido com futebol — mas vai fazer barulho nos números
  existentes.
- Jogar com dez toca em código que nunca viu menos de onze: marcações, linha de
  fora-de-jogo, `separarAlvos`.

## Fora de âmbito

Lei da vantagem, faltas de mão, simulação/mergulho, barreira a contar passos,
tempo de compensação, suspensão por acumulação entre jogos. Nada disto é
preciso para as médias de faltas e cartões baterem certo.
