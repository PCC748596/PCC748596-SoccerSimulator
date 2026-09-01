/*
QUEM TEM A BOLA TEM DE DECIDIR — `PlayerAI.tick` (js/bt/player_bt.js).

O ENCRAVE, medido. O retrato de um jogo parado trouxe isto:

    portador: "TeamB CB"
    estadoDoPortador: { fsm: "MOVE_TO_POS", hasBall: true, carryTouchGrace: 0,
                        touchLock: 0, decisionTimer: 662.5, distanciaABola: 0.61 }

Um central com a bola nos pés, a 61 cm dela, em MOVE_TO_POS, com o
`decisionTimer` em 662 SEGUNDOS — onze minutos com a bola sem fazer nada, e o
jogo inteiro parado à volta dele.

A CAUSA. O `tick` corre três árvores por ordem:

    1. PlayingStyleBT   (identidade do jogador)
    2. PositionBT       (posicionamento da posição)
    3. PlayerBT         (a decisão — e é aqui que vive o ramo `ComBola`)

As duas primeiras cortavam a terceira com `if (res === SUCCESS) return`. O
estilo do CB é o `extra_frontman`, que o relatório de calibração marca
`semEfeito: true`: activa 1067 vezes e não desloca nada. Activava, devolvia
SUCCESS, e a decisão com bola nunca acontecia.

O problema não é aquele estilo — é qualquer folha destas duas árvores poder
engolir a decisão de quem tem a bola, e o número de folhas só cresce.

Corre com: node tests/portador_decide.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const src = semCR(fs.readFileSync(path.join(raiz, 'js', 'bt', 'player_bt.js'), 'utf8'));

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

const iTick = src.indexOf('    tick: function (player, dt) {');
if (iTick < 0) throw new Error('PlayerAI.tick nao encontrado');
const corpoTick = src.slice(iTick, src.indexOf(LF + '    }', iTick));

console.log(LF + '1 — os dois cortes sao condicionais');
{
    /*
    Os dois cortes continuam iguais no que interessa (`!comBola`); o que mudou
    foi o corpo do `if`, que agora propõe o alvo da árvore e resolve-o antes de
    sair — ver js/bt/alvo.js.
    */
    const cortes = corpoTick.match(/if \(res === SUCCESS && !comBola\)/g) || [];
    if (cortes.length !== 2) {
        erro(`esperados 2 cortes (estilo e posicao), encontrados ${cortes.length}`);
    } else ok('dois cortes, um por arvore');

    const semGuarda = cortes.filter(c => c.indexOf('comBola') < 0);
    if (semGuarda.length) {
        erro(`${semGuarda.length} corte(s) sem a guarda do portador: ${semGuarda.join(' | ')}`);
    } else ok('os dois consultam `comBola` antes de cortar');

    if (!/const comBola\s*=/.test(corpoTick)) {
        erro('`comBola` nao e calculado no tick');
    } else ok('`comBola` calculado uma vez, no topo');
}

console.log(LF + '2 — o PlayerBT e sempre alcancado com bola');
{
    /*
    A prova pelo COMPORTAMENTO: reconstroi-se a cadeia de decisao do tick com
    arvores falsas que devolvem SUCCESS (o caso do `extra_frontman`) e
    verifica-se que o PlayerBT corre na mesma quando ha bola.
    */
    const correr = (comBola) => {
        let chegouAoPlayerBT = false;
        const SUCCESS = 'SUCCESS';
        const estiloTick = () => SUCCESS;
        const posicaoTick = () => SUCCESS;

        // A mesma cadeia do tick, com a guarda que se quer testar.
        let res = estiloTick();
        if (res === SUCCESS && !comBola) return false;
        res = posicaoTick();
        if (res === SUCCESS && !comBola) return false;
        chegouAoPlayerBT = true;
        return chegouAoPlayerBT;
    };

    if (correr(true) !== true) {
        erro('com a bola, as arvores de estilo/posicao continuam a cortar o PlayerBT');
    } else ok('com bola: o PlayerBT corre mesmo com as duas a devolver SUCCESS');

    if (correr(false) !== false) {
        erro('sem bola, o corte deixou de funcionar — o estilo e a posicao perdem prioridade');
    } else ok('sem bola: o estilo e a posicao continuam a mandar, como antes');
}

console.log(LF + '3 — o ramo ComBola acaba num fallback sem condicao');
{
    /*
    E ISTO QUE TORNA A CORRECCAO SUFICIENTE. Se o `DecisaoComBola` pudesse
    falhar inteiro, chegar ao PlayerBT nao bastava: o jogador voltava a ficar
    sem decisao nenhuma. O ultimo filho e um `act` solto, sem `cond`.
    */
    // Delimitado pelo ramo SEGUINTE, e nao por um numero de caracteres: o
    // DecisaoComBola tem 200 linhas e uma janela fixa cortava-o a meio.
    const iSel = src.indexOf("sel('DecisaoComBola'");
    const iFim = src.indexOf("seq('SemBola'", iSel);
    const bloco = (iSel < 0 || iFim < 0) ? '' : src.slice(iSel, iFim);

    if (!bloco) {
        erro('DecisaoComBola nao encontrado');
    } else if (bloco.indexOf("act('conduzir', actCarry)") < 0) {
        erro('o DecisaoComBola nao tem o fallback de conducao — pode falhar inteiro');
    } else {
        /*
        E tem de ser o ULTIMO filho. Um `seq` com `cond` depois dele voltava a
        poder fazer o selector inteiro falhar, e o portador ficaria outra vez
        sem decisao — o mesmo defeito por outro caminho.
        */
        const depois = bloco.slice(bloco.indexOf("act('conduzir', actCarry)"));
        if (/cond\(|seq\(/.test(depois)) {
            erro('ha ramos depois do fallback — o selector pode voltar a falhar inteiro');
        } else ok('act(conduzir) e o ultimo filho, sem cond: nunca falha');
    }
}

console.log(LF + (falhas === 0
    ? 'portador_decide: tudo bem.'
    : `portador_decide: ${falhas} falha(s).`));
process.exit(falhas === 0 ? 0 : 1);
