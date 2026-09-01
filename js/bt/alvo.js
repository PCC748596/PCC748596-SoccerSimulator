/*
=============================================================================
O ALVO DE CADA JOGADOR — propostas com prioridade, resolvidas UMA VEZ
=============================================================================

O PROBLEMA QUE ISTO RESOLVE

Até aqui, o sítio para onde um jogador ia era simplesmente o último `set()` do
frame. Dezanove passos escreviam por cima uns dos outros — bloco, estilo,
marcação, inquietação, mola, cortes, e por fim qualquer folha da árvore — e a
POLÍTICA do jogo era a ordem das linhas nos ficheiros. Medido (ver
docs/auditoria_nivel2.md):

    slot puro    -> posto com estilo    média 1,24 m   p95 10,3 m
    posto        -> alvo do nível 2     média 8,76 m   p95 27,9 m
    alvo nível 2 -> alvo FINAL          média 7,91 m   p95 41,9 m

    o nível 3 reescreve o alvo em 45% das leituras
    9,4% dos alvos da equipa com bola estavam em fora-de-jogo, e 100% deles
    tinham sido escritos DEPOIS do corte que existia para os impedir

Ou seja: o slot era a coisa que menos mandava no sítio onde o jogador acabava,
e um corte só valia enquanto ninguém escrevesse a seguir.

O QUE MUDA

Ninguém escreve o alvo. Cada camada PROPÕE, com uma prioridade, e o alvo é
resolvido uma vez, no fim do frame:

    p.proporAlvo(prio, x, z, fonte)         "quero ir para aqui"
    p.proporLimiteAvanco(prio, max, fonte)  "não passes daqui para a frente"
    resolverAlvo(p, bb)                     decide, e escreve o dynamicTarget

REGRA DE RESOLUÇÃO, em duas linhas:

  1. o ALVO é a proposta de prioridade mais forte (número mais baixo);
  2. aplicam-se-lhe os LIMITES de prioridade igual ou mais forte do que ele.

É a segunda linha que dá sentido às tabelas: um alvo de IDENTIDADE (5) é
cortado pelo rest defense (3) e pelas leis do jogo (1); um alvo de TAREFA DE
BOLA (2) ignora o rest defense — o homem que vai à bola vai à bola — mas não
ignora as leis. Um limite mais fraco do que o alvo não fala: se o jogador vai
disputar a bola, a estrutura não o segura.

AS PRIORIDADES (docs/auditoria_nivel2.md, secção 5)

    com bola                                sem bola
    1 LEIS      fora-de-jogo, limites       1 LEIS      limites do campo
    2 BOLA      portador, receptor,         2 BOLA      chaser, intercetor,
                batedor                                 bloqueador
    3 SEGURO    rest defense                3 SEGURO    transição: não subir
    4 ACCAO     corridas, apoios, estilo    4 ACCAO     marcação, cobertura
    5 ESTRUTURA slot no bloco, faixas       5 ESTRUTURA bloco, linha, faixas
    6 MICRO     inquietação, esperas        6 MICRO     inquietação

Os nomes são os mesmos nos dois lados para o código não ter de saber a fase: o
que muda é QUEM propõe em cada nível, não o significado do nível.

PORQUE É QUE A ACÇÃO ESTÁ ACIMA DA ESTRUTURA, e não abaixo

A primeira versão desta tabela tinha a estrutura por cima (o slot ganhava ao
apoio, à corrida, à marcação). Medida, matava o jogo: **24 passes em 10 minutos
de física, contra ~140** — sem ninguém a poder sair do slot para se oferecer,
não há a quem passar. O slot é onde se está QUANDO NÃO SE ESTÁ A FAZER NADA; a
acção é o que se faz. O que a estrutura tem de garantir é o que a equipa não
pode perder — e isso é o nível 3 (SEGURO), que fica ACIMA da acção: o rest
defense segura os quatro que ficam em casa, e nenhuma corrida os leva.

Carrega ANTES do team_bt.js e do player_bt.js, que são os dois que propõem.
*/

const AlvoPrio = {
    LEIS: 1,
    BOLA: 2,
    SEGURO: 3,
    ACCAO: 4,
    ESTRUTURA: 5,
    MICRO: 6
};

const AlvoNomes = ['?', 'LEIS', 'BOLA', 'SEGURO', 'ACCAO', 'ESTRUTURA', 'MICRO'];

/*
Limpa as propostas do frame. Corre no início do ciclo de cada jogador — sem
isto, uma proposta de um frame anterior sobrevivia e o jogador ficava preso a
uma tarefa que já acabou.
*/
function limparPropostas(p) {
    if (!p._propAlvo) p._propAlvo = [];
    else p._propAlvo.length = 0;
    if (!p._propLimite) p._propLimite = [];
    else p._propLimite.length = 0;
}

/*
"Quero ir para aqui." A mais forte ganha; entre duas da mesma prioridade ganha
a PRIMEIRA, e é de propósito: quem propõe primeiro num nível é a camada mais
estável dele (a estrutura antes do desvio, o slot antes da inquietação), e
deixar a última ganhar traria de volta o problema que isto veio resolver.
*/
function proporAlvo(p, prio, x, z, fonte) {
    if (!p._propAlvo) limparPropostas(p);
    p._propAlvo.push({ prio: prio, x: x, z: z, fonte: fonte || '?' });
}

/*
"Não passes daqui para a frente", em AVANÇO (z * dirZ), que é a unidade em que
todo o resto do jogo raciocina: positivo é na direcção da baliza atacada.

Só corta para trás — um limite nunca empurra ninguém para a frente.
*/
function proporLimiteAvanco(p, prio, avancoMax, fonte) {
    if (!p._propLimite) limparPropostas(p);
    p._propLimite.push({ prio: prio, avancoMax: avancoMax, fonte: fonte || '?' });
}

/*
Resolve e escreve o `p.dynamicTarget`. Devolve a fonte que ganhou, para o
debug e para as medições (`p.alvoFonte`, `p.alvoPrio`).

Sem propostas nenhumas não mexe no alvo: é o caso do guarda-redes, que tem o
seu próprio ciclo (updateGK), e de qualquer estado que devolva cedo.
*/
function resolverAlvo(p, bb) {
    if (typeof BlockShape !== 'undefined' && !BlockShape.resolverAlvoActivo) return null;
    const props = p._propAlvo;
    if (!props || !props.length) return null;

    let escolhida = props[0];
    for (let i = 1; i < props.length; i++) {
        if (props[i].prio < escolhida.prio) escolhida = props[i];
    }

    let z = escolhida.z;
    const limites = p._propLimite || [];
    let cortadoPor = null;
    for (const lim of limites) {
        // Um limite mais FRACO do que o alvo não fala.
        if (lim.prio > escolhida.prio) continue;
        const avanco = z * p.dirZ;
        if (avanco > lim.avancoMax) {
            z = lim.avancoMax * p.dirZ;
            cortadoPor = lim.fonte;
        }
    }

    /*
    ALISAMENTO DO QUE E POSICAO, NAO DO QUE E ACCAO.

    Antes do resolvedor, o `dynamicTarget` era alisado sempre (o lerp com o
    `PositionSmoothing`): isso dava estabilidade a forma da equipa, mas tambem
    atrasava as tarefas. Com o alvo a ser escolhido de novo em cada frame, a
    alternancia entre ESTRUTURA e ACCAO passou a ser abrupta.

    Aqui o alisamento aplica-se so quando quem ganha e a ESTRUTURA ou o MICRO —
    onde ele serve para a equipa nao tremer. Uma tarefa de bola ou uma accao
    entram a direito, que e o que se quer de quem vai a bola.
    */
    const alisa = escolhida.prio >= AlvoPrio.ESTRUTURA;
    if (alisa && typeof PositionSmoothing === 'number' && typeof Match !== 'undefined') {
        const dtM = Match.delta || 0.016;
        const k = 1 - Math.exp(-PositionSmoothing * dtM);
        p.dynamicTarget.x += (escolhida.x - p.dynamicTarget.x) * k;
        p.dynamicTarget.z += (z - p.dynamicTarget.z) * k;
    } else {
        p.dynamicTarget.x = escolhida.x;
        p.dynamicTarget.z = z;
    }
    p.dynamicTarget.y = ALTURA_BASE_Y;

    p.alvoFonte = escolhida.fonte;
    p.alvoPrio = escolhida.prio;
    p.alvoCortadoPor = cortadoPor;
    return escolhida.fonte;
}

/*
QUEM TEM TAREFA DE BOLA — o nível 2 das tabelas.

É por aqui que se decide se o que a árvore escreveu vale como BOLA (e portanto
passa por cima da estrutura e do rest defense) ou como IDENTIDADE (e portanto
é cortado por eles). Vai pela TAREFA, não pela folha: as folhas são dezenas e
mudam, as tarefas são estas.
*/
function temTarefaDeBola(p, bb) {
    if (p.hasBall) return true;
    if (bb && (bb.chaser === p || bb.intercetor === p || bb.blocker === p)) return true;
    if (typeof Match !== 'undefined') {
        if (Match.ballCarrier === p) return true;
        if (Match.intendedReceiver === p) return true;
        if (Match.setPieceTaker === p) return true;
    }
    const s = p.fsm ? p.fsm.currentState : '';
    return s === 'CARRY' || s === 'DRIBBLE' || s === 'SHOOT' || s === 'PASS' ||
        s === 'CROSS' || s === 'INTERCEPT' || s === 'CHASE_BALL' ||
        s === 'TACKLE' || s === 'SLIDE_TACKLE';
}

if (typeof window !== 'undefined') {
    Object.assign(window, {
        AlvoPrio, AlvoNomes, limparPropostas, proporAlvo, proporLimiteAvanco,
        resolverAlvo, temTarefaDeBola
    });
}
