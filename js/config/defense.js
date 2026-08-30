/*
=============================================================================
CONFIG: DEFESA E MARCAÇÃO
=============================================================================
Desarmes (carrinhos), modelo de marcação, pressão defensiva e mola de coesão.
=============================================================================
*/

const SlideTackleModel = {
    lancamento: 0.15,
    deslize: 0.95,
    paragem: 1.45,
    levantar: 1.95,

    velocidade: 9.0,        // velocidade inicial do deslize, m/s
    alturaAnca: -0.55,      // quanto o corpo desce ao sentar no relvado

    janelaToqueIni: 0.08,   // quando o pé pode começar a tocar na bola
    janelaToqueFim: 1.10,
    alcanceToque: 2.6,
    empurraoBola: 4.5,      // metros que a bola percorre depois do toque
    alturaBola: 0.8,        // ressalto vertical do toque
    bloqueioAposToque: 0.9, // segundos sem poder tocar outra vez (está no chão)

    // A pose, em radianos. `lado` = +1 estica a perna direita, -1 a esquerda.
    pose: {
        ancaRolar: 0.85,    // deita-se sobre a anca do lado oposto ao pé que estica
        ancaTras: -0.25,
        peito: -0.15,
        peitoRolar: 0.15,

        coxaEstendida: -0.95,
        joelhoEstendido: 0.10,
        peEstendido: -0.20,

        coxaDobrada: -0.10,
        joelhoDobrado: 1.55,

        bracoApoioZ: 1.35,  // braço de trás, aberto e no chão a apoiar
        bracoApoioX: 0.70,
        cotoveloApoio: -0.30,

        bracoLivreZ: 0.50,  // braço da frente, para equilíbrio
        bracoLivreX: -0.50,
        cotoveloLivre: -0.60
    }
};

/*
Playing style do GK (ver updateGkStyle em team_bt.js).

    defensive  padrão — fica perto da baliza.
    offensive  sweeper-keeper — sai para cobrir o espaço atrás da defesa
               quando o adversário ataca pelo corredor central sem oposição.

depthMin/depthMax: distância à própria linha de golo, em metros. O valor real
sai da curva em gkAnchor() — depthMin com a bola dentro da grande área,
depthMax com ela no meio-campo adversário.

sweepOut: quão longe da linha ele pode ir a varrer, e SÓ a varrer. É o gatilho
pontual de updateGkStyle() (team_bt.js), não uma postura de repouso.

Antes disto havia um único maxOut e quatro fórmulas espalhadas por updateGK(),
com coeficientes que SUBIAM (0.15, 0.35, 0.55) à medida que o atacante se
aproximava: quanto maior o perigo, mais ele saía da baliza.
*/

const MarkingModel = {
    histerese: 1.5,
    /*
    Distância de marcação, em metros: a que o marcador fica do homem, do lado
    da PRÓPRIA baliza (ver goalSide). É também o raio do círculo em que o
    marcador não entra (ver PosicionamentoAI.commit e o estado MARKING da FSM).

    UM número, igual em todas as situações — a pedido, enquanto se valida a
    marcação. Era uma tabela de 9 valores, por sector do campo e por
    Defensive Pressure (2 a 5 m): com a distância a mudar conforme o sítio,
    não se percebia se o que se estava a ver era a marcação ou a tabela.

    Para voltar a diferenciar, isto volta a ser uma tabela e o
    `distanciaPara` volta a olhar para o `zoneAhead` que já recebe.
    */
    distancia: 2.0,

    distanciaPara(zoneAhead) {
        return this.distancia;
    },

    /*
    biasMax / coberturaBiasMax — o quanto a marcação pode desviar o jogador
    do seu SLOT no bloco, em metros. Substituem o antigo `aderencia`
    (fracção 0..1 da distância TOTAL ao ponto de marcação).

    O problema do `aderencia`: cada frame recomeça do slot fresco (bind()),
    por isso `lerp(slot, alvo, 0.88)` não é um bias que se acumula devagar —
    é ir 88% do caminho até ao alvo NUM SÓ FRAME. Se o alvo estava a 40m do
    slot (um adversário do outro lado do campo), o jogador saltava para a
    marca a ~35m do sítio onde o TeamBT o tinha posto. Media-se isso como
    "posições muito longe do TeamBT" — dois CFs a aparecerem no meio-campo,
    só um CB a ficar atrás.

    Agora a marcação é sempre um DESVIO limitado a estes metros, tal como
    `desviar()` nas folhas ofensivas — o TeamBT continua a mandar, a
    marcação só o inclina. Sob pressão mais alta o marcador pode quebrar
    mais forma pra ficar colado; sob Low, menos.

    O tecto varia também por SETOR do campo (def/mid/atk, terços iguais —
    ver biasMaxPara), não só por Defensive Pressure. Perto da PRÓPRIA
    baliza a disciplina de forma pesa mais do que colar no homem: um CB
    arrastado 10m fora da área por um adversário a fazer um desvio custa
    caro (buraco na área), por isso o tecto ali é o mais apertado. No
    terço de ataque marcar "à letra" pesa menos do que manter a forma —
    tecto mais folgado, quebra mais para não perder o homem.
    */
    /*
    Os valores pedidos, na coluna Balanced: 7 m no ataque, 5 no meio, 3 na
    defesa. O Defensive Pressure abre e fecha à volta deles, e nenhum grau
    chega ao `raioSetor` (12 m) — o raio é de PROCURA, não de deslocação, e um
    marcador afastado do slot até ao raio já nem teria direito ao homem que foi
    marcar.
    */
    biasMaxPorSetor: {
        atk: { low: 5.0, balanced: 7.0, high: 9.0 },
        mid: { low: 3.5, balanced: 5.0, high: 6.5 },
        def: { low: 2.0, balanced: 3.0, high: 4.0 }
    },

    /*
    `zoneAhead` já vem no referencial de ataque do MARCADOR (alvo.z * p.dirZ,
    mesma convenção de stats.js/PlayerContext) — terços a ±CAMPO_COMP/6, tal
    como a contagem de posse por terço em stats.js.
    */
    biasMaxPara(zoneAhead) {
        const terco = CAMPO_COMP / 6;
        const setor = (zoneAhead < -terco) ? 'def' : (zoneAhead > terco) ? 'atk' : 'mid';
        const porPressao = this.biasMaxPorSetor[setor];
        return porPressao[Tatics.pressaoDefensiva] ?? porPressao.balanced;
    },

    /*
    NÃO É LIDO EM LADO NENHUM. Ficou de quando a folha `marcar` da árvore
    abria o tecto até ao `raioSetor` e este número era a rédea que a devia
    travar; nunca chegou a ser consultado, e a folha voltou a usar o
    `biasMaxPorSetor` como as outras camadas.

    Fica com o registo do que se aprendeu, porque o pêndulo já bateu nas duas
    pontas: com tectos apertados de mais a marcação só existia por acaso (o
    homem a 15 m e o marcador a ficar a 9.9 m dele, "não há marcação nenhuma");
    com o tecto aberto aos 12 m do raio, a marcação passou a mandar mais do
    que o bloco e os jogadores largavam o posto em qualquer terço.

    O tecto por SETOR é a resposta a isso — 3 m na própria defesa, 7 no ataque
    — porque o custo de largar a forma não é o mesmo nos dois sítios.
    */
    /*
    25 e nao 22: e a mesma distancia a que o atribuirMarcacao deixa de
    considerar um adversario como candidato (`if (dist > 25) return`). Com os
    dois numeros diferentes havia uma faixa onde um jogador era incumbido de
    marcar alguem a quem a redea nao o deixava chegar — ficava a meio
    caminho. So se notou quando a distancia de marcacao baixou para 2 m e o
    ultimo metro passou a faltar.
    */
    alcanceMarcacao: 25.0,

    /*
    Faixa, para lá do raio, onde o marcador já começa a RECUAR.

    O círculo sozinho não chega: ele parava no alvo, o homem vinha para cima
    dele, e só depois de o círculo ser violado é que era reposto — lia-se
    como o marcador a ser empurrado, não a defender. Dentro desta faixa, se
    o homem se aproxima, o marcador afasta-se à MESMA velocidade com que ele
    chega, e a distância mantém-se sem nunca haver colisão.
    */
    margemRecuo: 1.5,

    coberturaBiasMax: 6.0, // cair para cobertura/eixo (mais folga: é reposicionamento, não marcação)

    /*
    MARCAÇÃO POSICIONAL — acompanhar, não roubar a bola.

    Ninguém tem um homem atribuído: cada jogador olha para o adversário mais
    perto do SEU SLOT e desloca-se na direcção dele, sem nunca sair mais do que
    o biasMaxPorSetor manda. Se o homem sai do raio, ele volta ao slot; a mesma
    referência pode ser largada por um e apanhada por outro.

    Isto não é o tackling (actTackle/actSlideTackle, em bt/player_bt.js), que
    continua a ser outro sistema e a decidir sozinho quando ir à bola.
    */
    raioSetor: 12.0,     // procura a referência a esta distância do SLOT

    /*
    CUSTO DE UM PAR no leilão (ver atribuirMarcacoes). O raio acima continua a
    ser medido do SLOT — é isso que faz a marcação ser ZONAL: "este homem entrou
    no meu sector". Mas a ESCOLHA entre candidatos elegíveis passa a pesar
    também a distância REAL do marcador ao homem.

    Porquê: antes o custo era só a distância do slot, e um central cujo POSTO
    calhava perto de um extremo ganhava-o mesmo estando ele a 15 m dali, à
    frente de um médio que estava a 3 m. O resultado era o pior dos dois
    mundos — o extremo continuava livre (o central não lhe chegava) e o
    avançado que o central devia estar a marcar ficava sozinho.

    `pesoSlot` é quanto ainda conta a disciplina de forma: 0 seria "vai quem
    está mais perto" (marcação puramente individual, desfaz o bloco), 1 seria o
    comportamento antigo. A meio, quem está perto ganha sem que a forma deixe
    de pesar.
    */
    pesoSlot: 0.5,

    /*
    Desconto de custo para o par NATURAL da posição (ver paresPorPosicao mais
    abaixo). A tabela existia mas nunca era lida por ninguém — grep dava um
    único resultado, a própria definição — e é por isso que se via o que o
    comentário dela já previa: "um central a marcar um extremo porque calhou
    estar mais perto".

    O desconto divide-se pela ordem de preferência (1ª escolha leva o valor
    inteiro, 2ª metade, 3ª um terço), portanto é uma inclinação e não uma
    imposição: com o par natural do outro lado do campo, a distância real
    continua a ganhar.
    */
    bonusPar: 6.0,

    /*
    Desconto, em metros de custo, para o homem que o marcador JÁ acompanha.
    Trocar de homem tem de ser claramente melhor, não marginalmente melhor:
    sem isto, dois pares quase empatados faziam os marcadores trocar de homem
    de cada vez que a histerese expirava, e é nessas trocas que o atacante
    fica sozinho.
    */
    bonusManter: 3.0,

    /*
    Segundos a manter a decisão antes de reavaliar, nos dois sentidos: quem
    acompanha continua a acompanhar, quem está no slot fica no slot. Sem isto a
    referência trocava a cada frame com dois adversários a distância parecida, e
    o jogador oscilava entre os dois.
    */
    histerese: 3.0,

    /*
    A que distância se acompanha o homem, por Defensive Pressure. É este o novo
    significado do controlo do painel: era ele que mandava até onde o bloco
    subia (TeamShape.pressaoLineCap, removido), e isso passou para a
    Mentalidade.
    */
    distanciaPorPressao: { low: 4.5, balanced: 3.0, high: 1.5 },

    /*
    Chão para o aperto que o ESTILO acrescenta (ver distanciaComEstilo em
    playing_styles.js). O botão do painel manda na equipa; o estilo do jogador
    aperta ou alivia por cima disso — mas por muito agressivo que seja, marcar
    a meio metro não é marcar, é falta.
    */
    distanciaMinimaEstilo: 1.2,

    /*
    =====================================================================
    VEM AÍ UMA BOLA PARA O HOMEM À MINHA FRENTE
    =====================================================================
    Com um adversário a receber a cinco metros, o defesa recuava para o slot do
    bloco e deixava-o receber livre e de frente. Medido a 30 de Agosto, defesas
    a menos de 6 m de quem ia receber:

        o alvo dele estava mais LONGE do receptor do que ele: 57.2% dos casos
        afastamento médio do alvo: +2.30 m
        NÃO tinha esse adversário atribuído como marcação: 55.6%

    A terceira linha é a causa. Não era um defesa a fugir — era um defesa a quem
    ninguém tinha dito que aquele homem era dele, e por isso obedecia ao bloco.

    Enquanto a bola vai no ar para um destinatário, o defesa MAIS PRÓXIMO desse
    destinatário, dentro de `raioReceptor`, passa a tê-lo como marcação. Só o
    mais próximo: dois defesas a largarem o bloco pelo mesmo passe abre mais
    espaço do que fecha.

    Vai ao HOMEM e não à bola — marcar a recepção, não tentar o corte. O corte
    tem estado próprio (INTERCEPT) e critérios próprios.
    */
    raioReceptor: 8.0,

    /*
    =====================================================================
    O CENTRAL NÃO FICA A VER A BOLA DE LONGE
    =====================================================================
    Com a bola no PRÓPRIO TERÇO, o central mais próximo dela não pode estar
    mais longe do que `distMaxDaBola`. Medido a 30 de Agosto, a defender:

        bola no próprio terço     média 11.9 m   acima de 9 m: 72.4%
        bola no meio-campo        média 20.8 m   acima de 9 m: 97.5%
        bola no terço adversário  média 44.7 m   acima de 9 m: 100%

    SÓ NO PRÓPRIO TERÇO, e é uma decisão e não um esquecimento: aplicar o tecto
    com a bola no meio-campo obrigava a linha de trás a subir atrás dela e
    desfazia o bloco — os 20.8 m de lá são o bloco a fazer o que deve.

    Vale para UM central, o mais próximo. Puxar os dois deixa o corredor
    central aberto atrás deles, que é o oposto do que se quer.
    */
    distMaxDaBola: 9.0,
    tercoParaTectoDaBola: -17.7,   // avanço abaixo disto é o próprio terço

    /*
    QUANDO VALE A PENA SAIR À BOLA — o raio de accionamento do chaser.

    Antes não existia: a Defensive Pressure decidia só ONDE se perseguia (que
    metade do campo), nunca SE valia a pena. Com a bola no próprio meio-campo
    mandava-se um caçador em TODOS os frames, sem condição de distância, e ele
    corria direito ao portador o jogo inteiro — o "rush" constante que se via
    no ecrã, com a equipa a desfazer a forma atrás da bola.

    Um bloco defensivo não faz isso: mantém a forma e só sai quando o portador
    entra no alcance de quem está de guarda. Fora disso contém-se — os
    jogadores continuam a posicionar-se pelo bloco, e ninguém arranca.

    Medido do jogador mais próximo ao portador. `high` é praticamente sem
    limite, que é o que "pressão alta" quer dizer.
    */
    raioDeAccionamento: { low: 5.0, balanced: 8.0, high: 999 },

    /*
    E DENTRO DO PRÓPRIO TERÇO DEFENSIVO PERSEGUE-SE SEMPRE, seja qual for a
    pressão escolhida. Sem esta excepção, uma equipa em pressão baixa deixava
    o portador entrar na área a conduzir sem ninguém lhe sair ao caminho —
    trocava-se um defeito por outro pior.

    Fracção do meio-campo, medida no referencial de ataque da equipa.
    */
    tercoDeEmergencia: -(106 / 2) / 3,

    larguraCentro: 0.35,  // factor de largura da última linha com a bola no eixo
    larguraAla: 0.75,     // e com a bola no corredor
    fechoRaioX: 18.0,     // "eixo" = |ballX| abaixo disto
    fechoZ: 10.0,         // e o fecho só conta com a bola no nosso meio-campo

    /*
    Corredor lateral máximo para marcar: fora disto, um jogador nunca é
    candidato a marcar aquele adversário, por muito bem que pontue nos
    outros critérios. Sem este corte duro, um médio central podia acabar a
    marcar quem devia ser tarefa de um lateral (e vice-versa) só porque
    estava mais perto da baliza — o resultado observado foi troca de linha
    inteira (o LM a aparecer na posição do CF e vice-versa) sem tendência
    nenhuma a voltar à forma depois de a marcação acabar.
    */
    /*
    RAIO DA ZONA — o que impede a marcação de virar perseguição.

    Um jogador só marca um adversário que esteja dentro deste raio do SEU
    SLOT no bloco. Fora dele não é candidato, e o marcador fica no slot.

    Medido a partir do slot e não da posição actual, de propósito: com a
    posição, o raio anda com o jogador enquanto ele persegue, e o homem nunca
    sai dele — era isso que punha a equipa toda a correr atrás dos
    adversários pelo campo fora, com o bloco desfeito. Ancorado no slot, o
    raio está quieto: o homem sai da zona e é largado.

    É também o que limita o desvio: o alvo de um marcador nunca está a mais
    de raioZona + distancia do slot dele.

    Substituiu dois limites que não chegavam — um `dist > 25` medido da
    posição, e o `corredorMax` (16 m em x) medido do baseTarget, que é a
    posição da FORMAÇÃO e não sabe onde o bloco está.
    */
    raioZona: 20.0,


    /*
    MARCAÇÃO POR POSIÇÃO — quem pega em quem.

    Antes a marcação era escolhida só por pontuação (distância, perigo,
    corredor). Isso dá pares instáveis e trocas estranhas: um central a
    marcar um extremo porque calhou estar mais perto. Num 4-4-2 contra
    4-4-2 os pares são óbvios e devem ser fixos:

        central   <-> avançado          (e o avançado marca o central)
        lateral   <-> extremo do lado oposto do campo
        médio-ala <-> médio-ala oposto
        médio-centro <-> médio-centro oposto

    A lista de cada posição é por ORDEM DE PREFERÊNCIA — a primeira que
    existir no adversário ganha. Entre dois candidatos da mesma posição,
    escolhe-se o do MESMO LADO do campo (ver assignMarking).

    Quem não encontrar par aqui — formações diferentes, jogador fora de
    posição, alguém já marcado — cai na pontuação de sempre.

    LIDA por `atribuirMarcacoes`, como desconto de custo (MarkingModel.bonusPar):
    inclina o leilão para o par natural sem o impor. Esteve aqui muito tempo sem
    ninguém a ler — se voltares a mexer nisto, confirma com um grep que continua
    a ser usada.
    */
    paresPorPosicao: {
        GK: [],
        CB: ['CF', 'SS', 'ST'],
        LB: ['RM', 'RW'],
        RB: ['LM', 'LW'],
        DM: ['AM', 'CM', 'SS'],
        CM: ['CM', 'AM', 'DM'],
        /*
        Médio-ala pega no LATERAL do lado, não no médio-ala oposto: esse já
        é do nosso lateral (LB->RM). Num 4-4-2 contra 4-4-2 os pares fecham
        exactamente assim, dez contra dez, sem sobras nem disputas:

            CB<->CF   LB<->RM   RB<->LM   CM<->CM   LM<->RB   RM<->LB   CF<->CB
        */
        LM: ['RB', 'RM', 'RW'],
        RM: ['LB', 'LM', 'LW'],
        AM: ['DM', 'CM'],
        LW: ['RB', 'RM'],
        RW: ['LB', 'LM'],
        CF: ['CB'],
        SS: ['CB', 'DM'],
        ST: ['CB']
    }
};


/*
ATRIBUICAO EXCLUSIVA - quem acompanha quem, decidido para a EQUIPA toda de uma
vez, e nao jogador a jogador.

Substitui o `escolherReferencia`, que escolhia o adversario mais perto do slot
de cada um sem saber o que os companheiros tinham escolhido. Com a bola numa
ala, dois jogadores do lado oposto tem o mesmo adversario como o mais perto - e como o
`pontoDeMarcacao` mapeia esse homem para UM ponto, os dois caminham para a
mesma coordenada. Medido com a bola parada em x = -24: o RM e o CM tinham os
slots a 7.08 m um do outro e acabavam com os alvos a 0.35 m, a esbarrar.

Guloso, por distancia crescente: o par mais proximo fecha primeiro, e cada
adversario so e dado uma vez. Quem ja vinha a acompanhar alguem (`manter`, a
histerese do chamador) trava-o antes de o leilao abrir, para a troca de homem
nao acontecer todos os frames.

/*
Geometria e decisão de marcação (atribuirMarcacoes, recuoDaUltimaLinha, pontoDeMarcacao)
foram movidas para js/utils.js (ver docs/auditoria_config_match.md item 5).
*/

/*
Apoio ao portador: quantos jogadores por equipa podem estar em cada um dos
dois estados de apoio ao mesmo tempo (ver actHoldPosition).

Sem tecto, TODA a gente sem bola que estivesse à frente da bola virava
FWR_SUPPORT e toda a que estivesse atrás virava AFT_SUPPORT — os dois
rótulos cobriam a equipa inteira e deixavam de dizer nada. Com tecto, ficam
os N melhores candidatos (os mais perto da bola) e o resto vai ocupar a
posição normal (MOVE_TO_POS), que é o que já devia acontecer.
*/

const DefensivePressureModel = {
    low: 0.0,
    balanced: 0.0,
    high: 0.0
};

/*
=============================================================================
SISTEMA TÁTICO COLETIVO — Mentalidade, TeamPlayStyle, Momentum, Congestão
=============================================================================
Camada de comportamento COLETIVO acima do Decision Grid e dos Playing
Styles — não substitui nenhum dos dois, só empurra os pesos das decisões
já existentes (ver `player.js` → `findPassTarget`, `team_bt.js` →
`TeamBlackboard.gather`). Playing Styles continuam intocados: um Dummy
Runner continua a atrair marcação da mesma forma independente da
Mentalidade ou do TeamPlayStyle da equipa.

MENTALIDADE (era "Estilo de Jogo" — Defesa/Misto/Ataque). Os VALORES
internos (`defesa`/`balanceado`/`ataque`) não mudaram, só o rótulo na UI.

    agressao  base da agressividade dinâmica (ver `TeamAggression` em
              `team_bt.js`).
    blocoZ    deslocamento do BLOCO INTEIRO no eixo de ataque, em metros —
              é o número que o painel anuncia ("Ofensiva (+7m)"). Aplicado
              uma vez, ao centro do rectângulo, com e sem bola (ver
              `computeBlock`).

              Antes a Mentalidade estava espalhada por três sítios com
              valores diferentes: `EstiloBlockOffset` (só no ramo COM bola),
              `styleDefenseZShift` (só na linha defensiva) e o
              `pushMultiplier`. Como o ramo sem bola não tinha termo nenhum,
              na perda de posse o centro do bloco saltava até 20 m num único
              frame e os onze alvos saltavam com ele.
=============================================================================
*/
/*
=============================================================================
MOLA DE COESAO A BOLA
=============================================================================
Reabilita, com um proposito so, o que o `relaxConstraints` fazia antes de ser
apagado. Ver molaParaABola em utils.js para o mecanismo e a razao.

    forcaComBola   fraccao do EXCESSO de distancia que se encolhe, com posse
    forcaSemBola   e sem ela. Menor de proposito: a defender ja ha o bloco a
                   seguir a bola e a marcacao a puxar cada um ao seu homem —
                   somar uma mola forte por cima disso fecha os onze na bola
    distMin        abaixo disto ninguem e puxado; e a distancia a que ja se
                   esta na jogada
    puxaoMax       tecto do deslocamento, em metros. E ISTO que separa uma
                   mola de um ima: sem tecto, a equipa inteira acaba em cima
                   da bola e a formacao deixa de existir

O guarda-redes fica de fora: a posicao dele sai do gkAnchor e nao do bloco.
=============================================================================
*/
const MolaDeCoesao = {
    forcaComBola: 0.20,
    forcaSemBola: 0.10,
    distMin: 12.0,
    puxaoMax: 9.0
};

/*
=============================================================================
MARCAÇÃO NO CANTO — a marcação que sobrevive à batida
=============================================================================
O `setupSetPiece` monta um canto com marcação individual: dez slots de defesa
emparelhados um a um com os do ataque, cada marcador do lado da BALIZA em
relação ao seu homem. Está certo, e dura exactamente até a bola sair do pé.

No instante da batida o `case 'SET_PIECE_TAKER'` (fsm.js) largava toda a gente
— `jostleAncora = null` e `changeState('MOVE_TO_POS')` — e a partir daí quem
manda é o bloco táctico. O bloco segue a bola, e a bola está na bandeirola de
canto: os defensores são puxados para fora da própria área com o cruzamento
ainda no ar. Medido em 40 cantos, defensores dentro da grande área:

    no cruzamento  8.1 de 10
    +2.0 s         4.4
    +4.0 s         0.8      <- área vazia, bola ainda viva lá dentro

`marcaNoCanto` (escrito no setup) é o homem de cada marcador, e a marcação
mantém-se enquanto o lance estiver vivo: até a bola sair da área, o
guarda-redes a agarrar, a posse mudar de dono, ou o prazo acabar.

    distanciaAoHomem  onde o marcador fica, do lado da baliza
    prazo             tecto do lance, em segundos
    raioContestacao   com a bola no ar mais perto do que isto, o marcador
                      larga a colagem ao homem e vai à BOLA — é isto que põe
                      os dois no ar ao mesmo tempo, que é o que faz um duelo
    alturaContestacao só se contesta bola alta; rasteira resolve-se a pé
    saidaDaArea       a que distância da área o lance se dá por resolvido
=============================================================================
*/
const CornerDefenseModel = {
    distanciaAoHomem: 1.1,
    prazo: 9.0,
    raioContestacao: 6.0,
    alturaContestacao: 1.5,
    saidaDaArea: 4.0
};
