# `tools/scratch/` — rascunho gasto

Nada aqui é usado pelo jogo, pelos testes ou por qualquer ferramenta. Está tudo
fora da raiz do projecto, que era onde estava a estorvar.

**Podes apagar esta pasta inteira quando quiseres** — o git guarda tudo o que
aqui está, e nada depende dela.

## O que são estes ficheiros

### `patch*.js` — codemods de um só uso (15 ficheiros)

Cada um lê um ficheiro de produção, faz um `replace` de um bloco de texto e
volta a escrevê-lo. Já correram; o efeito deles **está no código**.

Verificado a 30 de Agosto de 2026, correndo cada um a seco (com o
`fs.writeFileSync` desligado e a comparar o resultado com o ficheiro actual):

```
patch.js            nao muda nada — gasto
patch2.js           nao muda nada — gasto
patch3.js           nao muda nada — gasto
patch4.js           nao muda nada — gasto
patch5.js           nao muda nada — gasto
patch6.js           nao muda nada — gasto
patch7.js           nao muda nada — gasto
patch8.js           nao muda nada — gasto
patch9.js           nao muda nada — gasto
patch10.js          nao muda nada — gasto
patch11.js          nao muda nada — gasto
patch12.js          nao muda nada — gasto
patch_laterais.js   nao muda nada — gasto
patch_offsets.js    nao muda nada — gasto
patch_vis.js        nao muda nada — gasto
```

Os quinze procuram texto que já não existe, ou que já está na forma final.
Voltar a correr qualquer um é uma operação nula.

### `patch_*.js`, `fix_carry.js`, `test_infiltracao_patch.js` — a segunda vaga (27 ficheiros)

Vieram da raiz do projecto a 7 de Setembro de 2026, do trabalho do replay e da
infiltração. São a mesma coisa que os de cima — codemods de um só uso — mas com
uma diferença que importa:

**DOZE DELES JÁ NÃO SÃO NULOS.** Corridos a seco (com o `writeFileSync`
interceptado e o resultado comparado com o ficheiro em disco), estes voltariam
a escrever:

```
patch_campoaberto.js         AINDA MUDA player_bt.js
patch_carry.js               AINDA MUDA player_bt.js
patch_findCross.js           AINDA MUDA player_bt.js
patch_findCross_2.js         AINDA MUDA player_bt.js
patch_index.js               AINDA MUDA index.html
patch_jogadas.js             AINDA MUDA player_bt.js
patch_log.js                 AINDA MUDA player_bt.js
patch_main.js                AINDA MUDA main.js
patch_pass_bonus.js          AINDA MUDA player.js
patch_replay_snap.js         AINDA MUDA match_replay.js
patch_replay_snap2.js        AINDA MUDA match_replay.js
patch_touch.js               AINDA MUDA touch_controls.js
patch_touch_bind.js          AINDA MUDA touch_controls.js
patch_touch_state.js         AINDA MUDA touch_controls.js
test_infiltracao_patch.js    AINDA MUDA player_bt.js
```

Nenhum deles é IDEMPOTENTE: o `replace` acrescenta o bloco novo ANTES do texto
que procurou, portanto correr outra vez duplica o bloco em vez de o repor. Não
os corras. Estão aqui como registo do que se fez, não como ferramenta.

Os restantes doze (`patch_carry_aggro`, `patch_fsm`, `patch_fsm_banner`,
`patch_infiltracao_offside`, `patch_infiltrar`, `patch_infiltrar_target`,
`patch_infiltrar_wingers`, `patch_offside_cap`, `patch_replay_quat`,
`patch_replay_touch`, `patch_through_ball`, `fix_carry`) não mudam nada — estão
gastos como os da primeira vaga.

### `original_team_bt.js`

Outra cópia de segurança de um ficheiro de produção, irmã do
`team_bt.js.current.txt`. Nada a lê.

### `test_*.js`, `find_bug.js`, `sim_offsets.js` — rascunhos de cálculo (8 ficheiros)

Não são testes: são folhas de cálculo em JavaScript, escritas para explorar a
geometria do bloco (`test_slots.js`, `test_cb.js`, `test_block.js`,
`test_all_cb.js`, `test_cb_cm.js`, `test_dump_pos.js`) e os offsets das três
linhas (`find_bug.js`, `sim_offsets.js`). Não correm sob `node --test` e não
estão na suite.

**O problema deles é o que têm lá dentro:** cópias À MÃO de dados de config. O
`test_slots.js` traz uma cópia inteira do `FormationsData`; o `test_cb.js` traz
um bloco com valores fixos. No dia em que a config mudar — e mudou — estes
ficheiros passam a descrever um jogo que já não existe, e quem os ler acredita
neles.

O que substituiu isto é o `tests/bloco_tres_linhas.test.js`, que **extrai** o
`BlockShape` do ficheiro de config real em vez de o copiar, e por isso não pode
divergir.

### `team_bt.js.current.txt`

Cópia de segurança de um ficheiro de produção, que estava dentro de `js/bt/` a
parecer código. Nada a lê.

## A regra que isto ilustra

Um script que muda código é lixo no instante em que corre — o resultado dele
está no ficheiro, e a intenção pertence à mensagem do commit. Um rascunho que
copia config em vez de a ler tem prazo de validade e não avisa quando expira.

Se voltares a precisar de medir comportamento, o sítio é `tools/headless/`: o
jogo REAL a correr em Node, sem cópias de nada.
