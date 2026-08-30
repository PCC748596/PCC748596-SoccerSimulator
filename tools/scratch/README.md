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
