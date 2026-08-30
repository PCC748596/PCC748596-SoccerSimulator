/*
=============================================================================
CONFIG: COMPORTAMENTO E CONTROLO DO JOGADOR
=============================================================================
Aparência, visão, condução, drible, recepção/controlo de bola, percepção e lateral.
=============================================================================
*/

const AppearanceModel = {
    tipos: [
        // Castanho claro é o mais comum, como pedido.
        { nome: 'castanhoClaro', peso: 42, cabelo: 0x8b6b45, pele: 0xe8c9a8 },
        { nome: 'loiro', peso: 28, cabelo: 0xd9c37a, pele: 0xf2d7bd },
        { nome: 'negro', peso: 22, cabelo: 0x1a1410, pele: 0x6b4630 },
        // Poucos ruivos, e são os de pele mais clara.
        { nome: 'ruivo', peso: 8, cabelo: 0xb5502a, pele: 0xf6ddc8 }
    ],

    chuteiras: [
        { nome: 'vermelha', peso: 25, cor: 0xd62828 },
        { nome: 'branca', peso: 23, cor: 0xf5f5f5 },
        { nome: 'preta', peso: 20, cor: 0x1c1c1c },
        { nome: 'amarela', peso: 18, cor: 0xe8ff00 },
        { nome: 'rosa', peso: 14, cor: 0xff5fa2 }
    ]
};

if (typeof window !== 'undefined') {
    window.AppearanceModel = AppearanceModel;
}

/*
Funções de aparência (hashAparencia, repartirPorPeso, baralharPorHash, escolherAparencia)
foram movidas para js/utils.js (ver docs/auditoria_config_match.md item 5).
*/

/*
=============================================================================
INQUIETAÇÃO — quem chega ao alvo não fica estátua
=============================================================================
O steerArrive devolve velocidade zero a menos de 0.2 m do alvo, e a partir daí
o jogador não se mexe mais enquanto o bloco não mudar. O campo enchia-se de
estátuas.

Isto desloca o ALVO, não o jogador: a suavização do PosicionamentoAI.tick e o
próprio steerArrive fazem o movimento sair contínuo, não aos saltos.

O deslocamento parte sempre do alvo corrente e NÃO acumula — sem isso a equipa
derivava devagar para fora da forma ao longo de minutos.
=============================================================================
*/
/*
DISPUTA ANTES DA BATIDA (canto). Enquanto se espera pelo cruzamento, ninguém
fica estátua: cada um dá um passo à frente, atrás ou para o lado à volta da
sua âncora, procurando o meio metro de vantagem sobre o par. Como o marcador
está a 1.5-2.5 m do homem (ver defenseSetup/attackSetup em match.js), estes
passos cruzam-se e produzem os embates.

`raio` é pequeno de propósito: é um passo, não um desmarque — o slot do canto
foi desenhado ao metro e não pode ser desfeito à espera da bola.
*/
const SetPieceJostle = {
    raio: 0.85,            // metros à volta da âncora
    intervaloMin: 0.5,     // sorteados por jogador, para não pulsarem em sincronia
    intervaloMax: 1.3,
    velocidade: 1.7        // passo de quem se ajeita, não de quem corre
};

const RestlessModel = {
    raio: 2.0,             // metros à volta do alvo
    limiarChegada: 2.0,    // só mexe quem já lá chegou
    // Sorteados por jogador, para não pulsarem todos em sincronia.
    intervaloMin: 1.5,
    intervaloMax: 3.5
};

/*
offsetInquietacao foi movido para js/utils.js (ver docs/auditoria_config_match.md item 5).
*/

/*
=============================================================================
VISÃO DE JOGO — o que o jogador consegue ler à frente
=============================================================================
A mesma fórmula estava escrita à mão em três sítios (o cone do carry, a
detecção de adversário no toque, e o espaço à frente no BT). Regras duplicadas
divergem: aconteceu já com o sector do passe e com o tecto do bloco.

O ângulo é POR LADO: a `anguloPorTecnica` 0.9, a técnica 80 dá ±72° e a técnica
50 dá ±45°. O piso existe para um jogador de técnica muito baixa não ficar cego.
=============================================================================
*/
const VisionModel = {
    anguloPorTecnica: 0.9,   // graus por ponto de técnica, para CADA lado
    anguloMin: 30.0,         // piso, em graus
    distanciaPorTecnica: 0.5,
    distanciaMin: 12.0
};

/*
coneVisao e alcanceVisao foram movidos para js/utils.js (ver docs/auditoria_config_match.md item 5).
*/

/*
=============================================================================
GIRAR DE COSTAS — quando é que quem recebe pode rodar para o ataque
=============================================================================
O que se via: o jogador domina de costas para o ataque e roda 180 graus para
cima do adversário que o marca por trás. Feito no PRÓPRIO meio-campo, a bola
perdida ali deixa o atacante isolado com o guarda-redes — o erro mais caro que
há, e não uma perda de bola qualquer.

A causa é o cone de condução do estado CARRY ser centrado em `p.dirZ`, a
direcção de ATAQUE, e nunca na direcção para onde o corpo está virado. Quem
recebe de costas aponta logo para a frente — isto é, gira os 180 — e o cone não
sabe nada de quem está lá.

A REGRA:
  - No ÚLTIMO TERÇO gira à vontade. Perder a bola ali não é golo, e travar o
    giro só tirava jogo ofensivo.
  - Aquém disso — incluindo o meio-campo adversário, onde uma perda ainda deixa
    a equipa subida e as costas da defesa à vista — gira apenas se o CONE DE
    SAÍDA estiver limpo: `raio`
    metros, `meiaAberturaGraus` para cada lado da direcção OPOSTA àquela de onde
    a bola vem — que é por onde ele quer sair.
  - Com o cone ocupado não gira: sai em toques de `passoGiroGraus`, para o lado
    livre. Chegar lá em três toques a ver o que tem à volta é melhor do que
    rodar de uma vez para cima do marcador.

A direcção de entrada da bola vem do `p.dirEntradaBola`, escrito no instante do
domínio (match.js). Sem ela, cai-se na direcção de ataque, que é a leitura certa
quando não se sabe de onde veio.
=============================================================================
*/
/*
=============================================================================
ESPERAR PELO POSTO — não correr para trás contra um alvo que se aproxima
=============================================================================
O que se via: um jogador sai da posição para participar na jogada e fica mais
adiantado do que o seu posto. A jogada progride, o posto avança — mas ainda não
passou por cima dele. Ele vira-se para trás para o ir buscar, a inércia leva-o
longe de mais, e quando o passe sai o apoio que devia estar naquele ponto vem a
meio caminho, no sentido errado. A jogada morre por falta de apoio, e o apoio
existia: estava a fazer marcha atrás.

Ninguém lhe dizia que o alvo vinha a caminho. O `tickFinal` escreve um ponto e
o `steerArrive` persegue-o, sem olhar se esse ponto se está a APROXIMAR. Um
jogador real não recua contra um posto que avança na direcção dele — fica, e
deixa-o chegar.

A inércia em si é o `velocity.lerp(desired, 5*dt)` do player.js, um filtro de
0.2 s igual em todas as direcções: inverter o sentido custa quase meio segundo,
e nesse tempo ele percorre 2-3 m no sentido errado. Isto aqui não trata disso —
trata de nunca chegar a haver a inversão, que é a metade barata do problema.

    distanciaMax     até aqui vale a pena esperar; mais longe vai-se ao
                     encontro do posto, senão ficava fora da jogada parado
    velocidadeMin    piso de aproximação, em m/s. Sem ele o ruído do
                     alisamento (PositionSmoothing) passava por aproximação e
                     o jogador ficava colado ao chão a jogada inteira
=============================================================================
*/
const EsperaPeloSlotModel = {
    distanciaMax: 8.0,
    velocidadeMin: 0.5
};

/*
esperarPeloSlot e eixoDeConducao foram movidos para js/utils.js (ver docs/auditoria_config_match.md item 5).
*/

const GiroDeCostasModel = {
    // Distância a que um adversário invalida o giro de 180° (cone de
    // meia-abertura atrás do jogador). Estava em 5.0; a 5 m um marcador nas
    // costas ainda fecha mal, e o jogador acabava a girar em cima dele.
    raio: 7.0,
    meiaAberturaGraus: 45,
    passoGiroGraus: 30,

    /*
    ONDE O GIRO E LIVRE: o ULTIMO TERCO, e nao a metade adversaria.

    A primeira versao abria a excepcao a partir da linha de meio-campo. Mas no
    meio-campo adversario perder a bola ainda doi — o contra-ataque sai com a
    equipa toda subida e as costas da defesa a descoberto. Onde perder a bola
    custa mesmo pouco e la a frente.

    17 m no referencial de ataque, o MESMO numero do `CarryModel.zonaLivre` e do
    `conduzirSoAcimaDe`: e a mesma ideia de "ultimo terco" e nao se inventa uma
    segunda fronteira para ela. Esta escrito aqui em vez de referenciado porque
    o CarryModel so e definido mais abaixo neste ficheiro; o teste
    tests/giro_de_costas.test.js compara os dois e falha se divergirem.
    */
    zonaLivre: 17.0
};

const CarryModel = {
    leque: [-1.2, -0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9, 1.2],
    lookAhead: 10.0,      // base de distância (sobrescrita por player.tec * 0.5)
    spaceCap: 16.0,       // espaço acima disto já não conta mais

    /*
    PESOS DA DIRECÇÃO DE CONDUÇÃO. Os três termos chegam normalizados a 0..1
    (ver notaDireccaoCarry em utils.js), por isso estes números são comparáveis
    entre si — antes não eram, e era esse o bug.

    Os antigos spaceWeight/progressWeight/sectorWeight multiplicavam grandezas
    em escalas diferentes: o progresso valia visDist metros (40 m a técnica 80)
    e o espaço no máximo spaceCap (16). Amplitude real: 56 pontos para o
    progresso contra 32 para o espaço — a direcção frontal ganhava sempre, mesmo
    com um adversário colado e a ponta vazia. Subir o sectorWeight de 1.0 para
    4.5 em três tentativas nunca resolveu, porque o problema era a escala.

    pesoProgresso fica em 1.0 de propósito: é a unidade de referência.
    */
    pesoEspacoMin: 1.2,   // técnica <= tecEspacoMin
    pesoEspacoMax: 2.88,  // técnica >= tecEspacoMax
    tecEspacoMin: 40,
    tecEspacoMax: 90,
    pesoProgresso: 1.0,
    pesoSector: 1.6,

    /*
    Espaço livre à frente. Medido num corredor que abre para longe (`corredor`
    metros de meia-largura à altura do jogador, mais `abertura` por cada metro
    de profundidade), até ao adversário mais próximo lá dentro.
    */
    corredor: 4.0,
    abertura: 0.35,
    espacoLivre: 16.0,
    espacoLivreDefesa: 35.0,

    /*
    Orçamento de condução: quantos metros o portador pode levar a bola antes de
    o ramo de espaço aberto deixar de o servir.

    Sem isto a condição não tem memória nenhuma — é reavaliada a cada frame, e
    enquanto ele corre para o espaço continua a ser verdadeira. O resultado
    medido foi devastador para o ritmo: em 46% das posses o portador NUNCA
    largava a bola, conduzindo 28 m de média. O jogo passou a ser feito de
    corridas individuais em vez de combinações.

    Gasto o orçamento, ele volta a cair no ramo Passar. Recomeça a zero quando
    a bola muda de pé.
    */
    distanciaMax: 16.0,
    distanciaMaxDefesa: 2.0,

    /*
    EXCEPÇÃO AO ORÇAMENTO: estar livre à frente (`livreAFrente10m20g` — ninguém
    a 10 m num cone de 20°) deixa conduzir para lá do orçamento, mas só no
    ÚLTIMO TERÇO e sem ser em sprint.

    Porquê manter a excepção: com a baliza à frente e o caminho aberto, obrigar
    a passar é o que faz o portador tocar para trás em vez de progredir para a
    zona de remate.

    Porquê limitá-la: sem limite nenhum era a anulação do orçamento — quem
    arranca em velocidade limpa o cone por si próprio, e o portador atravessava
    o campo todo. Fora do último terço, ou a sprintar, manda o orçamento.

    `zonaLivre` no referencial de ataque (17 m ≈ entrada do último terço, mesma
    convenção do bolaNoUltimoTerco do TeamBT). `velMaxLivre` é o topo da corrida
    normal — acima disto é sprint (ver GaitModel.correr.vel).
    */
    /*
    =====================================================================
    O FUTEBOL E FEITO DE MAIS PASSES DO QUE CORRIDAS
    =====================================================================
    A arvore de decisao com bola tinha o `ConduzirEmEspaco` ACIMA do
    `ProcurarPasse`, e o fallback final era conduzir. Resultado: conduzir era
    a opcao por omissao e passar a excepcao — chegava-se ao passe generico so
    se nao houvesse campo aberto, o caminho nao estivesse fechado, nao se
    estivesse na defesa e nao se pudesse driblar. Medido num lote: 7309
    conducoes contra 5604 passes, quase um para um. No futebol e varias vezes
    mais passes.

    `conduzirSoAcimaDe` inverte isso sem desligar a conducao: com um passe bom
    disponivel, conduz-se apenas a partir desta distancia da baliza adversaria
    (no referencial de ataque, `zoneAhead`). Ou seja, no ultimo terco — que e
    onde conduzir decide alguma coisa — e nao a sair da defesa.

    Sem passe nenhum disponivel, conduz-se onde quer que se esteja: o ramo do
    passe falha e a arvore segue para os de baixo, como antes.

    O valor vem do `zonaLivre` logo abaixo, que ja marcava o "ultimo terco"
    para o orcamento de conducao — nao se inventa uma segunda fronteira para
    a mesma ideia.
    =====================================================================
    */
    conduzirSoAcimaDe: 17.0,

    zonaLivre: 17.0,
    velMaxLivre: GaitModel.correr.vel,

    /*
    VELOCIDADE DE CONDUÇÃO — a que faltava.

    O `actCarry` não escrevia `speedMult` nenhum: o portador ficava com o da
    folha que tinha corrido antes. Num jogador que acabou de ganhar a bola isso
    é sempre uma das rápidas — 9.00 m/s do `actTackle` (que o próprio comentário
    chama "velocidade máxima SEM bola"), 7.88 do sprint do `actRunIntoSpace`.
    Saía a conduzir mais depressa do que qualquer sprint sem bola, e o 0.95 do
    estado CARRY não chega perto de compensar.

    Conduzir é mais lento do que correr livre: leva-se a bola no pé, dá-se o
    toque à frente e corre-se atrás dela. Por isso a base fica abaixo dos 6.53
    m/s de quem persegue a bola sem ela.

    O recuo com bola é mais lento ainda — é para segurar a jogada, não para
    arrancar (`recuoMult`). O contra-ataque acelera, como em todas as outras
    folhas.
    */
    velocidadeBase: 5.0,      // m/s a SPEED 50
    velocidadePorSkill: 1.2,  // ± isto entre SPEED 0 e SPEED 100
    recuoMult: 0.75,
    contraAtaqueMult: 1.25,

    /*
    SEGURAR E RECUAR COM A BOLA.

    O portador só sabia ir para a frente. O `carryRecuo` existia mas estava
    escondido atrás de três condições dentro do `actPass` (ter candidato, sem
    adversário a 5 m, sem pressão) e vinha DEPOIS de dois ramos que passam a
    bola — na prática nunca corria. Parar com a bola não existia de todo: não
    havia estado nenhum entre conduzir e passar.

    Agora, quando não há passe bom E não há ninguém em cima dele, sorteia-se o
    que um jogador real faz nesse momento: fica com ela à espera que a linha
    apareça, ou dá meia-volta e recua para reconstruir. O resto do tempo passa,
    como antes.

    As duas percentagens somam menos de 1 de propósito — o que sobra continua a
    ser o caminho antigo (passe de recuo / circulação).
    */
    segurar: {
        distSemPressao: 6.0,   // adversário mais perto tem de estar além disto
        chanceParar: 0.35,     // fica com a bola, de frente para o jogo
        chanceRecuar: 0.30,    // dá meia-volta e leva-a para trás
        duracaoMin: 0.6,       // quanto tempo fica parado, antes de rever
        duracaoMax: 1.6,
        /*
        Corta a paragem no instante em que alguém entra dentro disto — segurar
        a bola com um adversário a chegar é como se perde a bola.
        */
        distCorte: 4.0
    },

    // Toques de condução — distância do toque depende do espaço à frente
    touchLong: 2.8,       // toque longo (campo aberto, adversário > 15m)
    touchMedium: 1.6,     // toque médio (adversário entre 8-15m)
    touchShort: 0.96,     // toque curto (adversário perto < 8m)
    touchPower: 8.0,      // força base do toque (m/s)
    touchCooldown: 0.4,   // tempo mínimo entre toques (seg)

    /*
    DISPUTA DO TOQUE — o toque é validado por quem chega primeiro à bola, e não
    pela distância a que o adversário está AGORA.

    O problema que isto resolve: o toque leva ~0.7 s a fechar (a bola afasta-se
    e volta ao pé), mas o tamanho era escolhido com a distância do instante. Um
    defesa a 11 m a fechar a 6 m/s está a 7 m quando a bola assenta — e o toque
    tinha sido dimensionado para os 11 m. Resultado: tocava para a frente e
    perdia a bola, parecendo que não via ninguém.

    `velAdversario`  a que velocidade se assume que o adversário corre para a
                     bola. É deliberadamente generoso (é o topo da corrida sem
                     bola), porque errar por prudência custa um toque curto e
                     errar por optimismo custa a posse.
    `margem`         quanto tempo o portador tem de ganhar para o toque valer.
    */
    velAdversarioDisputa: 7.0,
    margemDisputa: 0.15,

    /*
    Até onde um DEFESA conduz a bola, no referencial de ataque. Ele conduz para
    sair a jogar, não para atacar: passada esta linha tem de largar a bola.
    0 = meio-campo. Sem este tecto, um central que recebesse com campo aberto
    à frente — o caso normal — caía no ramo ConduzirEmEspaco do BT e ia com ela
    até à área adversária, driblando pelo caminho.
    */
    limiteConducaoDefesa: 0.0,
    touchMaxWait: 0.18,   // espera máx. pela janela da passada antes de forçar o toque (seg)
    recoverRadius: 0.8,   // distância para re-capturar a bola após toque

    /*
    Faixa junto à linha de fundo onde NÃO se adianta a bola. Dentro dela o
    portador continua a correr, mas com a bola no pé: um toque à frente ali
    põe-na fora pela linha de fundo, e o resultado era pontapé de baliza para
    o adversário só por conduzir até ao fundo.

    Vale para o toque do CARRY. O leque de direcções também deixa de
    apontar para dentro da faixa, senão o
    jogador continuava a correr contra a linha sem nunca poder tocar.
    */
    /*
    Metros à linha de fundo dentro dos quais NÃO se adianta a bola (ver
    pertoDaLinhaDeFundo em utils.js). Estava em 0.0, o que desligava a trava
    por completo — a função devolvia sempre false e o toque punha a bola fora
    pela linha de fundo, dando pontapé de baliza ao adversário.

    3.5 m cobre um toque curto (0.96) e boa parte de um médio (1.6) a partir
    da linha; o resto é apanhado pelo emZonaDeFinalizacao, que trava o toque
    em toda a zona de remate.
    */
    margemLinhaFundo: 3.5
};

/*
Drible (DRIBBLE) — ultrapassar um adversário 1v1.

O portador detecta de que lado o defensor está vindo e toca a bola para o lado
oposto (30-45°). Se tentar ir reto, probabilidade de perda é muito maior.

`successBase` é a chance base de sucesso no drible. Modificada pela skill do
jogador e pela proximidade do adversário.
*/
const DribbleModel = {
    triggerDist: 2.5,     // distância para activar drible 1v1 (adversário à frente)
    angleSide: 0.6,       // ângulo lateral do toque (~35°, entre 30 e 45)
    touchPower: 8.25,     // força do toque lateral
    successBase: 0.60,    // chance base de sucesso
    successSideBonus: 0.20, // bónus por ir para o lado (vs reto)
    failLossBall: 0.70,   // prob. de perder a bola se falhar
    sprintBoost: 6.2,     // boost de velocidade após toque lateral
    cooldown: 1.2         // tempo antes de poder driblar novamente
};

/*
Marcação e largura da última linha.

`distancia`/`aderencia`: o ponto de marcação fica sobre a recta que liga o
atacante à nossa baliza, e não a N metros atrás dele em Z. Com o desvio só em Z,
um atacante aberto no corredor era marcado pelo LADO — o defensor não estava
entre ele e a baliza. Medido: 46.7° de desvio médio em relação à direcção da
baliza, com só 62.7% das marcações dentro de 45°.

`largura*`: com a bola pelo eixo, centrais e laterais não têm corredores para
cobrir — têm de tapar o caminho da baliza. A linha fechava 30.3 m com a bola ao
centro contra 31.6 m com ela na ala, ou seja praticamente nada.
*/

const BallControl = {
    /*
    Raio de contacto com a bola, medido ao CORPO (ver distanciaAoCorpo), não
    à origem do modelo. Era 1.3 m: a bola podia estar a mais de um metro do
    corpo e mesmo assim contar como dominada, o que a fazia parecer solta ao
    lado do jogador em vez de no pé dele. -0.4 m aperta o domínio.
    */
    reach: 0.9,           // raio de contacto com a bola, em metros
    /*
    Abaixo disto domina-se sempre. Subiu proporcionalmente com o `PassModel.vChegadaRasteira`
    (7.75 -> 9.69 -> 10.66), mantendo os passes curtos e médios domináveis ao primeiro toque.
    Acelerar o passe sem acelerar o controlo não faz o jogo mais rápido, faz os
    receptores mais incompetentes.
    */
    easySpeed: 10.66,     // abaixo disto domina-se sempre (a regra antiga)
    hardSpeed: 30.0,      // acima disto é praticamente impossível dominar
    receiverBonus: 0.35,  // vantagem de quem é o destinatário do passe
    touchLock: 0.35,      // segundos sem poder tocar depois de largar a bola
    retryLock: 0.25,      // segundos até nova tentativa depois de falhar uma
    deflectKeep: 0.45,    // fracção da velocidade que sobra num desvio
    deflectSpread: 0.6,   // quanto o desvio abre a direcção

    /*
    --- Domínio no peito ---------------------------------------------------
    Bola à altura do peito não se domina com o pé: o jogador inclina a
    cintura para trás e deixa-a bater no peito.

    Onde a bola cai sai da TÉCNICA, numa curva contínua (ver quedaNoPeito em
    utils.js): técnico alto encosta-a ao pé, técnico fraco larga-a longe e
    disputável. Em qualquer dos casos ela fica à frente dele e ele sai a jogar.

    Era um binário — o `venceuDuelo` sorteava bom/mau e a distância saía de duas
    constantes fixas, 0.5 m ou 1.5 m. A TEC só mexia na probabilidade do
    sorteio, e mesmo o caso bom largava a bola a meio metro, que não é "no pé".
    O sorteio continua a existir, mas só para a animação, as estatísticas e o
    evento CHEST_CONTROL — deixou de decidir onde a bola cai.
    */
    // Alturas medidas a partir dos PÉS do jogador (ver distanciaAoCorpo).
    // peitoYMin tem de ser >= peitoAltura (1.20, mais abaixo): bola abaixo do
    // peito de verdade não faz sentido matar no peito, é toque de pé normal.
    peitoYMin: 1.15,       // altura mínima do contacto para contar como peito
    peitoYMax: 1.35,      // acima disto é cabeça (ver ALTURA_CABECA), não peito
    peitoBase: 0.45,      // probabilidade base de amortecer bem (só animação/stats)
    peitoDur: 0.55,       // duração (s) do gesto

    /*
    QUANTAS MATADAS NO PEITO SEGUIDAS, sem a bola assentar no chão.

    O anti ping-pong aéreo já existia para a CABEÇA (HeaderModel.
    maxHeadersSeguidos) e não contava os peitos — e era pelo peito que o jogo
    encravava. O retrato de um encrave: bola parada NO AR a 1.35 m (o próprio
    `peitoYMax`) com velocidade zero, entre dois jogadores a 1.2 m dela, ambos
    a meio do gesto.

    O mecanismo: o `colarBolaAoPeito` fixa a bola e zera-lhe a velocidade
    enquanto o `peitoCola` durar; ao largar, ela sai a `peitoVelYBoa`, que a
    TEC 63 são -0.19 m/s — cai tão devagar que não sai da faixa 1.15-1.35
    antes de o outro jogador a matar no peito outra vez. Ninguém a domina e
    ninguém a vai buscar, porque enquanto o gesto dura o BT trata-os como
    ocupados.

    Ao fim destes, ninguém mais mata no peito até a bola tocar o relvado.
    Mesmo número do cabeceio, e pela mesma razão: dois toques seguidos é uma
    disputa, três é um ciclo.
    */
    maxPeitosSeguidos: 2,

    /*
    =====================================================================
    PEITO OU CABEÇA? DEPENDE DE QUEM VEM A CHEGAR
    =====================================================================
    A decisão era só de ALTURA: bola entre `peitoYMin` e `peitoYMax` ia ao
    peito, mais alta ia à cabeça, e mais nada contava.

    Falta a pressão. Sem ninguém por perto, matar no peito e ficar com a bola
    é sempre melhor do que a cabecear para longe; com um adversário a chegar,
    o peito é lento demais e o que serve é a cabeça — para aliviar ou para
    atacar a bola antes dele.

    `peitoSemPressao` é a distância ao adversário mais próximo a partir da
    qual não há pressão. `peitoAlturaLivre` é até que altura ele aceita a bola
    no peito quando está livre: acima da faixa normal, porque um jogador sem
    ninguém em cima tem tempo de a ajeitar com o peito alto.

    O limite de peitos seguidos continua a valer — isto não abre a porta ao
    ping-pong que ele fecha.
    */
    peitoSemPressao: 7.0,      // metros ao adversário mais próximo
    peitoAlturaLivre: 1.75,    // sem pressão, aceita a bola até esta altura

    /*
    Distância a que a bola fica ADIANTADA depois da matada, por TEC. O máximo
    (TEC 0) é o pior amortecimento que ainda conta como matada — acima disto
    seria um ressalto, não uma recepção.
    */
    peitoQuedaMin: 0.35,  // metros à frente a TEC 100 — no pé
    peitoQuedaMax: 1.6,   // e a TEC 0
    sigmaQueda: 0.25,     // dispersão relativa em torno dessa distância
    /*
    Só a CINTURA para trás — `chest.rotation.x`, aplicado em
    player.aplicarCamadaPeito(). A pelvis não se toca: rodá-la deitava o
    jogador inteiro, pernas incluídas. Ele fica de pé e a prumo, o tronco
    acima da cintura vai levemente para trás e os braços abrem um pouco.
    */
    peitoInclinacao: -0.20, // rotação da cintura (negativo = para trás) — só o tronco, reduzido pra não ler como o corpo inteiro a tombar
    peitoBracos: 0.35,      // abertura dos braços (rotation.z, somado à pose)

    /*
    A bola COLA ao peito antes de cair.

    Antes era teleportada no frame do contacto para a distância de queda, já à
    altura do chão — nunca se via a bola encostada ao corpo, só a aparecer
    longe dele. Agora fica presa ao tronco durante
    `peitoCola` segundos (acompanhando-o se ele ainda estiver a andar) e só
    depois é largada com velocidade, caindo sozinha à distância pedida.
    */
    peitoCola: 0.16,      // segundos com a bola encostada ao peito
    peitoDistCorpo: 0.26, // distância do centro da bola ao eixo do corpo (m)
    peitoAltura: 1.20,    // altura do ponto de contacto no peito, dos pés (m)
    peitoVelYBoa: -1.0,   // velocidade vertical ao largar, domínio bom
    peitoVelYMa: 1.2,     // ... e quando falha (repica para cima)

    /*
    Pequeno salto opcional na matada no peito. Só para bolas que chegam mais
    altas dentro da faixa de peito — perto do chão não há razão para saltar.

    O salto é 1/3 do salto de cabeceio (SaltoCabeceio.alturaMax=0.80/3≈0.27):
    como a bola fica COLADA ao tronco (colarBolaAoPeito usa
    model.position.y + peitoAltura todos os frames enquanto `peitoCola`
    corre), ela sobe e desce com o corpo — nunca ultrapassa esse 1/3, que é
    a "altura máxima do pulo" pedida.
    */
    peitoPuloLimiar: 0.98, // altura de contacto (dos pés) acima da qual salta
    peitoPuloMax: 0.27     // pico do salto (m) — 1/3 de SaltoCabeceio.alturaMax
};

/*
Salto para cabecear.

O salto tinha pontaria nenhuma: disparava assim que a bola estivesse entre
1.2 m e 4.5 m de altura e a menos de 2.5 m em planta, com um pico fixo de
1.8 m. Como quem vai receber uma bola alta se posiciona no PONTO DE QUEDA, a
bola só passava por 1.2 m no último instante antes de aterrar — ele saltava
para uma bola quase no chão, e no topo do salto já não havia bola nenhuma.

Agora o salto é planeado no tempo: prevê-se onde a bola está daqui a
`duracao/2` (o instante do pico, ver `Math.sin(jt·π)`) e só se salta se nesse
momento ela estiver ao alcance e ACIMA da cabeça. A altura do salto passa a
ser a que falta para lhe chegar, não um valor fixo — o contacto acontece no
ponto mais alto.

Abaixo de `subidaMin` acima da cabeça não se salta: cabeceia-se de pé.
*/
/*
Cabeçada — alcance.

Uma cabeçada não é um pontapé: a bola leva a velocidade da testa e do tronco,
não de uma perna a rodar. Dez metros é o que um jogador tira de uma cabeçada
normal; um alívio bem batido de um central chega aos 15-20, mas isso é o topo
absoluto e não o caso comum.

Isto existe porque a cabeçada FORA da zona de remate era resolvida como um
passe: pedia-se a `velocidadeParaAlcance` a força para chegar ao companheiro
escolhido — a 30 ou 40 m, se fosse esse o colega. Saíam cabeçadas de meio
campo. Agora a direcção continua a ser a do colega, mas o alcance é o que uma
cabeçada dá; se ele estiver mais longe, a bola fica pelo caminho, como na
vida real.
*/

const ThrowInModel = {
    alcanceMin: 9.0,
    elevMin: 16 * Math.PI / 180,
    elevMax: 26 * Math.PI / 180,

    /*
    ATÉ ONDE CHEGA UM LATERAL, POR STRENGTH — os dois extremos, escritos.

    Era `alcanceMax * (1 +/- forcaBraco)`, um multiplicador de +/-25% sobre 18
    m: o mais forte do plantel atirava a 22.5 m e o número que interessa (o
    alcance de quem tem STRENGTH 100) só se sabia fazendo a conta. Agora
    lê-se directamente, e é interpolação linear entre os dois.

    Ver alcanceMaximoDoLateral em utils.js.
    */
    alcanceMaxFraco: 12.0,   // STRENGTH 0
    alcanceMaxForte: 20.0,   // STRENGTH 100
    recuoDaLinha: 0.7,       // metros para lá da linha onde o batedor se põe

    /*
    QUEM COBRA, E POR QUE ORDEM — ver escolherBatedorDoLateral em match.js.

    Era o jogador de campo mais PERTO do ponto da linha, e num lateral no nosso
    meio-campo isso dá quase sempre o CENTRAL: o homem que menos devia estar a
    pôr a bola em jogo é o que fica com ela nas mãos, e a linha defensiva abre
    ao meio enquanto ele lá vai.

    A ordem é a do futebol: o LATERAL do lado, depois o MÉDIO DA ALA, depois o
    CM. Sem nenhum dos três — pode acontecer com expulsões ou formações sem
    médios de ala — cobra o mais perto, como sempre: um lance parado à espera
    de um batedor que não existe é pior do que um batedor imperfeito.

    `distanciaMaxBatedor` impede a outra ponta: chamar um lateral que está a 45
    m dali é o lance todo parado à espera dele. Além disso, passa-se ao
    seguinte da ordem.
    */
    ordemBatedor: {
        esquerda: ['LB', 'LM', 'CM'],
        direita: ['RB', 'RM', 'CM']
    },
    distanciaMaxBatedor: 25.0,

    /*
    QUEM SE APROXIMA, E QUANTO — distância mínima à bola, por posição, enquanto
    o lance decorre.

    O nível 2 fica ligado no THROW_IN e a mola de coesão puxa o bloco inteiro
    para a bola: o central sai da posição, o CM cola-se à linha, e num lance que
    precisa de duas ou três opções curtas aparecem seis — todas em cima umas das
    outras, todas marcadas pelo mesmo adversário.

    O central mantém a posição (por isso o número dele é grande: na prática
    nunca é puxado). O CM oferece-se, mas de longe. O médio da ala e o outro
    lateral são as opções curtas do lance e ficam DENTRO do `alcanceMin` — se
    também tivessem de ficar longe, trocava-se "toda a gente em cima" por
    "ninguém a quem jogar".
    */
    distanciaMinimaPorPos: {
        CB: 18.0, DC: 18.0,
        CM: 12.0, DM: 12.0,
        GK: 25.0
    },
    distanciaMinimaOmissao: 0.0,
    afastaAdversarios: 2.5,  // ninguém do outro lado a menos disto da bola

    /*
    ALVO EM ALTURA. O lateral é cobrado nos PÉS do receptor ou no PEITO dele, e
    a escolha é a distância: curto põe-se no pé, para ele sair a jogar já; mais
    longo procura o peito, que é o alvo grande e o que se protege de costas.

    A altura do peito NÃO tem constante própria — é a `BallControl.peitoAltura`
    que a recepção usa. Se fossem duas, podiam divergir e a bola chegaria fora
    da faixa `peitoYMin`/`peitoYMax` que dispara o `controlarNoPeito`: mirava-se
    o peito e ele dominava com o pé.

    Ver velocidadeDeLancamento em utils.js — a balística passou a resolver um
    ponto (distância, altura), em vez da fórmula de alcance, que só vale com a
    altura de chegada igual à de saída e portanto nunca mirou nada.
    */
    distanciaAosPes: 9.0,

    /*
    APOIO AO BATEDOR. Os companheiros ficavam nos slots do bloco, a vinte e
    tal metros, e o lateral saia para ninguem — via-se no ecra o batedor
    sozinho com meio campo a frente.

    `apoioQuantos` mais proximos sao puxados para a faixa `apoioMin`..
    `apoioMax` em volta dele.

    DOIS, e nao tres. A tres via-se meia equipa a convergir para a mesma linha
    lateral — o batedor com tres companheiros a cinco metros e o resto do campo
    vazio. Dois chegam para dar as duas opcoes que um lateral tem: o apoio
    curto e a linha de fuga.

    A faixa e a distancia util de um lateral curto: abaixo de `apoioMin` estao
    em cima do batedor e nao abrem linha nenhuma; acima de `apoioMax` ja e um
    lancamento longo, que tem os seus proprios problemas de precisao.
    */
    apoioQuantos: 2,
    apoioMin: 5.0,
    apoioMax: 10.0,

    /*
    ERRO DE EXECUÇÃO, por TEC de quem repõe. Não havia nenhum: a direcção saía
    exacta para o alvo e a única variação era o sorteio uniforme da elevação,
    que muda a trajectória mas não a pontaria. Um jogador de TEC 20 repunha tão
    bem como um de TEC 90.

    `sigmaMax` fica um pouco abaixo dos ~9° do passe (PassErrorModel): o lateral
    é curto e feito com as duas mãos, de pé parado. `sigmaMin` existe porque nem
    o melhor executante é exacto.

    O peso é um erro à parte, sobre a DISTÂNCIA alvo — cai curta ou passa o
    receptor. Ver sigmaDeLateral em utils.js.
    */
    sigmaMax: 0.13,          // rad (~7.5°) a TEC 0
    sigmaMin: 0.02,          // rad (~1.1°) a TEC 100
    sigmaPeso: 0.10,         // desvio relativo no alcance a TEC 0
    pesoMin: 0.6,            // cortes do erro de peso, para não sair absurdo
    pesoMax: 1.4
};

/*
distanciaMinimaNoLateral foi movida para js/utils.js (ver docs/auditoria_config_match.md item 5).
*/

const PerceptionModel = {
    // Só reage quem lá chega depressa. Acima disto é bola para o chaser, não
    // para toda a gente — senão a equipa inteira colapsa sobre a bola.
    janelaIntercetar: 1.2,
    // E só se for claramente melhor do que quem já vai lá (chaser/destinatário),
    // em segundos de vantagem.
    margemMelhor: 0.15,
    // Distância a partir da qual se considera que a bola JÁ passou o
    // destinatário do passe e ele deixa de ser dono da jogada.
    passePerdidoDist: 4.0,

    /*
    PRAZO DA BOLA PARADA JUNTO AO DESTINATÁRIO.

    O `passeMorreuParaODestinatario` (utils.js) começa por desistir quando a
    bola está a menos de `passePerdidoDist` dele: perto do destinatário o passe
    conta como entregue, e o resto do teste nem corre. Só que "perto dele" não
    é "no pé dele" — a bola pode parar a três metros e ele não lhe tocar (ficou
    à espera da queda, o alvo dele era outro ponto, um adversário meteu-se pelo
    meio).

    E aí ninguém a vai buscar: `bolaSolta` exige `!intendedReceiver`
    (deveMandarChaser, team_bt.js), portanto a equipa não designa perseguidor —
    e o destinatário, esse, já parou. Bola quieta no relvado com gente à volta,
    que é o que se via junto à linha lateral.

    Passado este prazo com a bola parada e sem ninguém lhe tocar, o passe
    caduca e ela volta a ser uma bola solta como outra qualquer.
    */
    prazoBolaParada: 1.2
};

// Segundos que a equipa SEM bola espera, depois de a perder, antes de
// reavaliar chaser/marcação — ligado ao selector "Defensive Pressure".
