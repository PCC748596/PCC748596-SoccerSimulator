# Auditoria — `js/config/` e `js/match/`

Levantamento de 28 de Agosto de 2026. O critério foi o mesmo do resto do
projecto: **só entra o que está medido ou verificado no código**, e cada ponto
diz o que custa hoje, não só o que é feio.

Nada aqui foi corrigido. É uma lista de trabalho, ordenada por retorno.

```
js/match/match_state.js      123 linhas
js/config/gait.js            171
js/match/match_ui.js         279
js/config/physics.js         290
js/config/goalkeeper.js      526
js/config/animations.js      540
js/config/defense.js         641
js/match/match_loop.js       740
js/config/shooting.js        901
js/match/match_physics.js    907
js/config/player_behavior.js 945
js/config/tactics.js         957
js/config/passing.js         969
js/match/match_setpieces.js  978
js/match/match_setup.js     1121
                           -----
                           10 088
```

---

## 1. As funções gigantes do `match/`

Quatro funções concentram quase metade do `match/`:

| função | ficheiro | linhas |
|---|---|---|
| `setupSetPiece` | `match_setpieces.js` | **908** |
| `createField` | `match_setup.js` | **538** |
| `Match.update` | `match_loop.js` | **504** |
| `updateBall` | `match_physics.js` | **349** |
| `resolveBallContact` | `match_physics.js` | **292** |

**O que custa.** Não é estética. O `setupSetPiece` é um `if/else if` de seis
ramos (`CORNER_KICK`, `THROW_IN`, `FREE_KICK`, `PENALTY`, `GOAL_KICK`) que
partilham o escopo inteiro — `attDir`, `bolaFK`, `defesaOrdenada`, `nBarreira`
vivem todos no mesmo bloco. Esta sessão mostrou o preço duas vezes:

- a ordem dentro do ramo `FREE_KICK` era o bug dos 9.15 m (o afastamento corria
  a meio, os marcadores entravam depois e ninguém reparava porque o ramo tem 200
  linhas);
- para medir seja o que for de um ramo é preciso montar um jogo inteiro.

**Proposta.** Um ficheiro por lance (`setpiece_corner.js`, `setpiece_falta.js`,
…), cada um com uma função que recebe um contexto explícito
(`{ bola, attDir, atacantes, defensores }`) e devolve **uma lista de lugares**,
sem tocar em `Match`. Quem aplica é o `setupSetPiece`, que fica com trinta
linhas. Foi exactamente o que se fez esta sessão com o `lugaresDaFalta` (agora
em `utils.js`, testado sem jogo nenhum) — falta estender o padrão aos outros
quatro lances.

**Retorno:** alto. **Risco:** médio (mexe em código que funciona).

---

## 2. Geometria do campo escrita à mão, espalhada

`16.5` (linha da grande área) e `20.16` (meia-largura da grande área) aparecem
como números crus em pelo menos cinco sítios:

```
match_loop.js:66       dz <= 16.5 && Math.abs(ball.x) <= 20.16
match_physics.js:395   Math.abs(ball.x) < 20.16 && ... < 16.5
match_setpieces.js:510 Math.abs(linhaFundo - l.z) <= 20.0 && Math.abs(l.x) <= 20.16
match_setpieces.js:887 Math.abs(p.x) < 20.16 && ... < 16.5
match_setup.js:297     addLinha(40.32, ...) / 16.5     <- e aqui é o DESENHO
```

Repare-se no `20.0` do `match_setpieces.js:510`: é a mesma ideia ("dentro da
área") escrita com outro número. Nenhum destes sítios sabe dos outros.

E `CAMPO_COMP / 2` aparece **31 vezes** em `match/` e `bt/`.

**Proposta.** Um bloco `Area` em `js/config/physics.js`, ao lado das dimensões
que já lá estão:

```js
const Area = {
    profundidade: 16.5,      // da linha de fundo
    meiaLargura: 20.16,
    pequenaProfundidade: 5.5,
    pequenaMeiaLargura: 9.16,
    // e um predicado, para deixar de haver cinco versões da mesma conta
    contem: (x, z, dirDefendida) => ...
};
const LINHA_FUNDO = CAMPO_COMP / 2;
```

**Retorno:** alto e barato. **Risco:** baixo — é substituição literal, e o
`match_setup.js` (o desenho das linhas) passa a ser a prova visual de que os
números batem certo.

---

## 3. Prazos de bola parada escritos à mão no `match_loop`

```
match_loop.js:134   if (this.setPieceTimer > 20.0)   // canto
match_loop.js:195   if (this.setPieceTimer > 15.0)   // falta
match_loop.js:241   if (this.setPieceTimer > 15.0)   // penálti
match_loop.js:279   if (this.setPieceTimer > 15.0)   // lateral
match_loop.js:336   if (this.setPieceTimer > 20.0)   // tiro de meta
```

Cinco prazos, dois valores, zero em config — e são eles que decidem se um lance
encravado se desencrava. O `SET_PIECE_WAIT` triplicado que está nos Problemas
conhecidos vive exactamente aqui.

**Proposta.** `SetPiecePrazos = { canto: 20, falta: 15, penalti: 15, lateral: 15, tiroDeMeta: 20 }`
em `js/config/tactics.js`, e o `match_loop` a lê-los. Passam a poder ser
afinados e, sobretudo, MEDIDOS.

**Retorno:** médio-alto (destrava o trabalho sobre os encraves). **Risco:** nulo.

---

## 4. `Match.state` é escrito de cinco ficheiros diferentes

```
js/fsm.js              state = 'PLAY'   (a batida do canto)
js/player.js           state = 'PLAY'   (4 sítios: falta, penálti, ...)
js/match/match_loop.js state = 'PLAY'   (5 sítios: os timeouts)
js/match/match_setup.js
js/match/match_physics.js
```

Doze escritas de `'PLAY'` espalhadas por cinco ficheiros, sem um sítio que
saiba o que tem de ser limpo em cada transição. É a causa estrutural de duas
famílias de bugs que já custaram sessões:

- o `setPieceTaker`/`setPieceTimer` que nenhuma saída normal limpa (Problemas
  conhecidos, `SET_PIECE_WAIT` triplicado);
- o guarda-redes a relançar uma bola que já não é dele (corrigido esta sessão) —
  o gesto sobreviveu a uma transição de estado que ninguém lhe comunicou.

**Proposta.** `Match.mudarEstado(novo, motivo)` num sítio só, que faz a limpeza
canónica (`setPieceTaker = null`, `setPieceTimer = 0`, `cantoVivo = null`,
`penaltiPendente = false`, gestos pendurados do GK) e emite um evento no
`EventBus` — que já existe e é exactamente para isto. As doze escritas passam a
chamá-la.

**Retorno:** alto. É a correcção de causa, não de sintoma. **Risco:** médio —
tem de se inventariar o que cada transição limpa hoje, e há transições que
DEPENDEM de não limpar (o batedor a meio do gesto, ver as excepções no
`tratarBolaParada`).

---

## 5. `config/` tem 20 funções — devia ter dados

```
player_behavior.js  10 funções
goalkeeper.js        4
defense.js           3
passing.js           2
shooting.js          1
```

Algumas são legítimas (uma tabela que se calcula uma vez no arranque). Outras
são lógica de jogo a viver na config: `atribuirApoios`, `atribuirMarcacoes`,
`pontoDeMarcacao`, `recuoDaUltimaLinha`, `gkAnchor`, `gkSweepTarget`,
`pontoDeCanto`. Um leitor que abre `config/` à procura de um número encontra
comportamento; um que abre `utils.js` à procura de comportamento não encontra
estes.

**Proposta.** Mover o que é geometria/decisão para `utils.js` (onde já vivem o
`decisaoDeFalta`, o `lugaresDaFalta`, o `cruzamentoDeFalta`) e deixar em
`config/` só os objectos de dados. Não é urgente, mas paga-se sempre que alguém
procura uma função onde ela devia estar.

**Retorno:** médio. **Risco:** baixo (é mover, a ordem de carregamento já
funciona).

---

## 6. Constantes de config que ninguém lê

Varridas as 96 constantes declaradas em `js/config/`, estas nunca são lidas fora
do próprio `config/`:

| constante | situação |
|---|---|
| `GoalkeeperThrowPower` | declarada em `animations.js:415`, **zero leituras em todo o projecto** |
| `SetPieceGroundKickClip` | alias de `GoalkeeperGroundKickClip`, **nunca usado** |
| `GK_D_NEAR` / `GK_D_FAR` | usados só dentro do próprio ficheiro — deviam ser locais ou entrar num modelo |
| `AppearanceModel` | idem (só o `player_behavior.js` lhe toca) |

O `GoalkeeperThrowPower` é o caso a olhar com atenção: é força de lançamento do
guarda-redes que **não afecta nada**. Ou o lançamento devia usá-la e não usa
(defeito silencioso, do tipo que esta sessão encontrou três vezes), ou é lixo.
Vale meia hora a confirmar qual dos dois.

**Retorno:** baixo em linhas, potencialmente alto se o `GoalkeeperThrowPower`
for um defeito. **Risco:** nulo.

---

## 7. Duzentas e oitenta e nove guardas `typeof X !== 'undefined'`

```
289 no projecto inteiro
 19 só no match_loop.js
 11 no match_setup.js
 10 no match_physics.js
```

São scripts clássicos com ordem de carregamento fixa e verificada (o
`index.html` e o `harness.js` carregam os mesmos ficheiros pela mesma ordem).
Dentro do `Match.update`, `BallPhysics` **não pode** estar por definir.

**O que custa.** Cada guarda vem com um valor por omissão inline:

```js
const CD = (typeof CornerDefenseModel !== 'undefined') ? CornerDefenseModel : null;
...
this.cantoVivo.timer > (CD ? CD.prazo : 9.0)
```

Agora o `9.0` existe em dois sítios: na config e aqui. Quando alguém afina a
config, o fallback fica com o valor antigo — e só se descobre no dia em que o
carregamento falha e o jogo corre silenciosamente com os números errados. É
exactamente o tipo de defeito que "não dá erro, não aparece em teste nenhum, e
só se encontra a medir" que este documento já cita noutro sítio.

**Proposta.** Uma verificação única no arranque (`main.js`) que confirma que os
modelos esperados existem e rebenta alto se não existirem; e a seguir apagar as
guardas nos caminhos quentes (`Match.update`, `updateBall`, `player.update`).
Manter só onde o objecto é MESMO opcional (`Officials`, `EfeitosSonoros`).

**Retorno:** médio-alto (elimina uma classe inteira de divergência silenciosa).
**Risco:** baixo, mas tem de ser feito com a suite a correr a cada passo.

---

## 8. O mesmo número com dois nomes

```js
// shooting.js
distanciaBarreira: 9.15,   // barreira da falta
afastaAdversarios: 9.15,   // quem não faz barreira
raioMeiaLua: 9.15,         // meia-lua do penálti
```

São os mesmos 9.15 m do regulamento, escritos três vezes. Não é
necessariamente errado — pode querer-se afinar a barreira sem mexer no penálti —
mas nada no ficheiro diz que são a mesma regra, e quem mudar um vai perguntar-se
porque é que os outros não mudaram.

**Proposta.** `const DISTANCIA_REGULAMENTAR = 9.15;` e os três a referenciá-la,
com um comentário a dizer que separá-los é uma decisão e não um esquecimento.

**Retorno:** baixo. **Risco:** nulo. Vale pela clareza.

---

## 9. `match_setup.js` é duas coisas

1 121 linhas, das quais 538 são o `createField` — geometria de estádio, relva,
linhas, redes, bancadas, cores de cadeiras. O resto é `createTeams`,
`assignFormations`, `resetPlay`, `reporExpulsos`: **estado de jogo**.

São responsabilidades diferentes com ciclos de vida diferentes: o `createField`
corre uma vez e nunca mais; o `resetPlay` corre a cada golo. Estão juntas por
acaso histórico.

**Proposta.** `match_field.js` (o cenário) e `match_setup.js` (as equipas e o
reset). Divisão limpa, sem lógica partilhada entre as duas metades.

**Retorno:** médio. **Risco:** baixo.

---

## 10. O que a auditoria confirmou que está BEM

Para não ficar só a lista de defeitos:

- **Os 26 campos de `match_state.js` são todos lidos.** Nenhum campo de estado
  morto — raro num ficheiro de estado global.
- **A divisão do `config.js` em nove módulos aguentou.** Um ano de sessões
  depois, os nomes ainda dizem onde as coisas estão, e esta sessão acrescentou
  quatro modelos novos sem precisar de inventar um décimo ficheiro.
- **Os comentários explicam o PORQUÊ e trazem os números medidos.** É o que
  permitiu, esta sessão, perceber em minutos porque é que o `recuoBatedor` tinha
  sido mudado de 1.4 para 4.8 — a razão estava escrita ao lado do valor.
- **A geometria pura já está a sair para `utils.js` e a ser testada sem jogo**
  (`decisaoDeFalta`, `setorDaFalta`, `lugaresDaFalta`, `cruzamentoDeFalta`,
  `velocidadeParaAlturaNoAlvo`). É o padrão certo; falta estendê-lo.

---

## Ordem sugerida

| # | trabalho | retorno | risco |
|---|---|---|---|
| 1 | Geometria da área em config (ponto 2) | alto | baixo |
| 2 | Prazos de bola parada em config (ponto 3) | médio-alto | nulo |
| 3 | Constantes mortas / `GoalkeeperThrowPower` (ponto 6) | ? | nulo |
| 4 | `Match.mudarEstado` centralizado (ponto 4) | alto | médio |
| 5 | Dividir o `setupSetPiece` por lance (ponto 1) | alto | médio |
| 6 | Guardas `typeof` nos caminhos quentes (ponto 7) | médio-alto | baixo |
| 7 | Dividir o `match_setup.js` (ponto 9) | médio | baixo |
| 8 | Funções fora de `config/` (ponto 5) | médio | baixo |
| 9 | `DISTANCIA_REGULAMENTAR` (ponto 8) | baixo | nulo |

Os três primeiros são de uma tarde e não partem nada. O 4 e o 5 são os que
mudam a forma do código, e são também os que atacam as causas dos bugs que
continuam a aparecer nas bolas paradas.
