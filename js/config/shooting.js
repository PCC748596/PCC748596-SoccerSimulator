/*
=============================================================================
CONFIG: REMATES E BOLAS PARADAS
=============================================================================
Remates, livres directos, penáltis, cantos, cruzamentos, cabeceamentos e xG.
=============================================================================
*/

const ShootingModel = {
    // alcance a skill 0 (reduzido para evitar remates do "meio da rua")
    baseRange: 8.0,
    // metros adicionais a skill 100
    skillRange: 10.0,
    maxOffsetX: 24.0,    // além disto o ângulo é mau demais para rematar
    angleFloor: 0.66,    // fracção do alcance que sobra no pior ângulo

    // Um defesa que suba não remata como um avançado: só de muito perto.
    // Antes o central caía no ramo genérico e rematava em 10.4% das vezes
    // em que aparecia no último terço.
    defenderFactor: 0.55,

    /*
    DENTRO DA GRANDE ÁREA REMATA-SE, PONTO.

    O alcance acima é uma distância ao CENTRO DA BALIZA, e não cobria a área:
    com a skill de ataque a 50 dá 13.0 m no eixo, e a área tem 16.5 m de
    profundidade. Pior fora do eixo, onde a `centralidade` ainda o encolhe — a
    15 m de X sobram 10.2 m, e daí a baliza está a 15.5 m.

    Medido numa grelha de 20 posições dentro da área: **rematava-se em 6**
    (30%). Da entrada da área não se rematava nunca, e da meia-lua também não.
    É a explicação directa dos 0-6 remates por jogo que as simulações davam.

    Dentro da área o alcance deixa de decidir: quem lá está e tem a bola
    remata. O `maxOffsetX` (24 m) não é problema — a área tem 20.16 de
    meia-largura, portanto está toda dentro dele.

    Isto NÃO mexe no remate de fora da área, que continua a ser o alcance por
    skill de sempre.
    */
    dentroDaArea: {
        profundidade: 16.5,   // da linha de fundo para dentro
        meiaLargura: 20.16,
        /*
        Dentro da área também não se aplica o corte da camada CHUTE do
        SpatialGrid (`chuteVal <= 0` mandava não rematar). Uma célula não
        autorada dentro da própria área é um buraco na grelha, não uma decisão
        táctica — e era mais um sítio onde o remate se perdia em silêncio.
        */
        ignoraGrid: true
    }
};

/*
Modelo de passe e condução.

`carryChance*` é a probabilidade de conduzir em vez de passar quando há um
alvo disponível — sob pressão desce 0.15.

O lançamento (passe para o espaço nas costas da linha adversária) não existia:
todos os passes miravam a posição actual de um colega. Estes valores dizem onde
se põe a bola em relação à linha que o nível 1 do adversário já calcula.
*/
/*
=============================================================================
QUALIDADE DA LINHA DE PASSE
=============================================================================
Antes isto era um FILTRO binário com um corredor de 1 a 2.6 m: um adversário
mais perto do que isso da recta eliminava o candidato, e a recompensa por ter
a linha limpa valia no máximo +50 pontos — irrelevante ao lado dos +200/+500
que a liberdade do RECEPTOR vale. Duas consequências medidas no jogo:

  - o passe curto para dentro de tráfego passava, porque bastavam 2 m de folga;
  - o passe longo para um colega livre era ELIMINADO antes de ser pontuado,
    porque a recta atravessa o bloco todo e há sempre alguém a 2 m dela.

Agora:

  `bloqueioDuro`  o único corte que resta — alguém literalmente em cima da
                  recta. É geometria, não julgamento: a bola não passa ali.

  `corredor`      a largura em que um adversário ainda ameaça, e CRESCE com a
                  distância do passe: numa bola de 8 m um defesa a 3 m não
                  chega lá; numa de 35 m chega com tempo de sobra.

  `pesoLinha`     a qualidade da linha (0 = colado, 1 = limpa) passa a valer
                  na MESMA escala da liberdade do receptor, e não 1/10 dela.

  `pesoCorpo`     desconto por CADA adversário dentro do corredor. Uma recta
                  que passa a 2 m de cinco pessoas não é a mesma coisa que
                  passar a 2 m de uma — e antes pontuavam igual, porque só se
                  olhava para o mais próximo.
=============================================================================
*/

const ShotModel = {
    /*
    Subiu de 28/8 para 32/9 depois de se ver em campo: continuava a ler como
    fraco. Passa a 23.0 m/s a TEC 0, 32.0 a TEC 50 e 41.0 a TEC 100 — a ponta
    de cima é a de um remate de elite (~148 km/h), que é o que um TEC 100 deve
    bater.
    */
    potenciaBase: 32.0,     // m/s a TEC 50
    potenciaPorSkill: 9.0,  // ± isto entre TEC 0 e TEC 100
    potenciaMin: 16.0,      // nem o pior rematador bate mais fraco do que isto

    /*
    Elevação de recurso, para quando nem no ângulo óptimo a bola chega ao alvo
    (remate de muito longe). Era `Math.PI / 5` (36°) escrito à mão — um balão.
    A 20° a bola vai mais longe e mais tensa, e ainda tem hipótese de incomodar.
    */
    elevacaoRecurso: 20 * Math.PI / 180,

    /*
    =====================================================================
    O REMATE DECIDE A BOLA, NÃO O DESFECHO
    =====================================================================
    Antes sorteava-se o RESULTADO — GOL, TRAVE_CAMPO, TRAVE_FORA,
    TRAVESSAO_*, GOLEIRO_DEFENDE_* — por pesos de `attackRatio`, e só depois
    se escolhia o ponto que o produzia. A bola era a encenação de um sorteio
    já feito, e via-se: `alvoY = random() > 0.5 ? 2.0 : 0.4` (moeda ao ar
    entre alto e baixo), `sinal = random()` para o canto sem olhar para onde
    estava o guarda-redes, e potência sempre cheia — não havia remate
    colocado nem rasteiro, havia um chutão com destino combinado.

    Pior: o desfecho sorteado desligava o guarda-redes. `forcedGKDelay = 1.0`
    nos remates marcados como golo (ele reagia um segundo tarde, de
    propósito) e `0` nos marcados como defesa. Toda a fórmula do GkCatchModel
    só era consultada depois de o sorteio já ter decidido que ia haver defesa.

    Agora escolhe-se TIPO e MIRA, aplica-se o erro, e a bola voa. Quem
    resolve é a física — a colisão com postes e travessão já existe
    (`colidirComBaliza` em match.js) — e o guarda-redes, com o seu tempo de
    reacção normal. Trave e "por cima" deixam de ser casos de uma tabela e
    passam a ser consequência de a mira ter falhado por pouco.
    */

    /*
    TIPOS DE REMATE. A potência é um multiplicador da `potenciaBase`: um
    remate colocado sai a ~2/3 da força — é essa a troca, precisão contra
    velocidade, e era ela que não existia.
    */
    tipos: {
        forca: { potencia: 1.00, sigma: 1.35 },
        colocado: { potencia: 0.68, sigma: 0.80 },
        rasteiro: { potencia: 0.82, sigma: 0.95 },
        chapeu: { potencia: 0.45, sigma: 1.20 }
    },

    /*
    ESCOLHA DO TIPO, por situação. As chances são testadas por esta ordem
    (chapéu, rasteiro, colocado) e o que sobra é força.
    */
    escolha: {
        // Chapéu: só com o guarda-redes fora da linha e a uma distância que
        // dê para o passar por cima.
        chapeuGkAdiantado: 4.0,   // metros à frente da linha
        chapeuDistMin: 8.0,
        chapeuDistMax: 25.0,
        chanceChapeu: 0.35,

        // Rasteiro ao canto: a bola mais difícil de agarrar que há. Sobe de
        // perto, onde levantar a bola é desperdiçar a baliza.
        chanceRasteiraPerto: 0.32,   // até `distPerto`
        chanceRasteiraLonge: 0.15,
        distPerto: 12.0,

        // Colocado: precisa de tempo e de pé. Cai sob pressão e com a
        // distância — de 25 m ninguém coloca, bate.
        chanceColocado: 0.40,
        colocadoDistMax: 20.0,
        colocadoPressao: 3.0      // adversário a menos disto tira a colocação
    },

    /*
    MIRA. Aponta-se a um canto, com `margemPoste` de folga para dentro — o
    ponto MIRADO é sempre golo, o que decide é o erro por cima dele.

    O canto é o mais LONGE do guarda-redes. Era `random()`, e por isso não
    havia a leitura mais básica do remate: bater onde ele não está.
    */
    mira: {
        margemPoste: 0.85,
        alturaRasteira: 0.30,
        alturaMeia: 1.05,
        alturaAlta: 1.90,
        alturaChapeu: 2.15,
        // Abaixo desta descentragem do GK o canto é escolhido à sorte: com
        // ele ao meio, os dois lados valem o mesmo.
        gkCentradoMax: 0.5
    },

    /*
    ERRO DA MIRA, em METROS no plano da baliza — e é ele que produz golos,
    traves e bolas por cima, sem tabela nenhuma. Mesma ideia do
    `sigmaDePasse`: a bola sai na direcção pedida com um desvio gaussiano.

    O desvio vertical é menor que o lateral (`fracVertical`): errar a altura
    de um remate é menos comum do que errar o lado.
    */
    erro: {
        base: 1.10,             // metros de sigma, a 6 m e TEC 50
        porMetro: 0.110,        // cresce com a distância à baliza
        distRef: 6.0,
        fracVertical: 0.70,
        // TEC divide o sigma: 0.65 a TEC 100, 1.45 a TEC 0.
        tecMin: 0.65,
        tecMax: 1.45,
        // Pressão: adversário colado abre a mira.
        pressaoDist: 3.0,
        pressaoMult: 1.45,
        // Ângulo fechado (junto à linha de fundo) também.
        anguloMult: 1.30,
        anguloFechado: 35 * Math.PI / 180,

        /*
        A ÚNICA MANÍPULA DE CALIBRAÇÃO. Multiplica todos os sigmas: acima de
        1 saem mais remates para fora, abaixo de 1 mais no alvo. Existe para
        acertar a taxa de conversão SEM voltar a impor desfechos — o
        resultado continua a sair da bola, do guarda-redes e da madeira.
        */
        escalaGlobal: 1.0
    }
};

const FreeKickModel = {
    /*
    DECISÃO DA COBRANÇA — ver decisaoDeFalta em utils.js. Três casos:

    1. TRAPÉZIO DE REMATE DIRECTO. Até `remateDistMax` do centro da baliza e
       dentro das rectas que saem dos POSTES a `remateAnguloTrave` da
       PERPENDICULAR à linha de fundo. A base menor é a própria baliza e o
       trapézio abre com a distância — a 23 m tem 7.32 + 2 × 13.28 = 33.9 m.
       Antes o critério era o `emZonaDeFinalizacao` do jogo corrido, que é um
       rectângulo e não sabe nada de ângulo com a trave: remata-se de posições
       sem baliza nenhuma à vista, e não se rematava de frente a 25 m.

    2. MINI-CANTO. Ao lado da grande área (`miniCornerXMin`, a meia-largura da
       área) e a menos de `miniCornerProfundidade` da linha de fundo: dali não
       há remate, cruza-se para a área como num canto curto.

    3. O RESTO: passe para o melhor colega posicionado.
    */
    remateDistMax: 23.0,                    // ao centro da baliza
    remateAnguloTrave: 30 * Math.PI / 180,  // da perpendicular à linha de fundo
    miniCornerXMin: 20.16,                  // meia-largura da grande área
    miniCornerProfundidade: 22.0,           // até esta distância da linha de fundo

    distanciaBarreira: 9.15,   // os 9.15 m do regulamento
    barreiraMin: 2,            // quantos formam barreira, longe da baliza
    barreiraMax: 4,            // e perto dela
    barreiraZonaZ: 30.0,       // no referencial de ataque: daqui p/ a frente é barreira cheia
    espacamentoBarreira: 0.85, // ombro com ombro
    /*
    ATRÁS DA BOLA, na linha bola->baliza. Estava em 1.4 m — praticamente em
    cima dela, sem espaço nenhum para a corrida, e como o gesto era instantâneo
    o que se via era a bola a saltar sozinha para o pé dele.

    A `corridaMin` é o que sobra depois de descontar a passada final: o
    `ActionState` leva-o de `recuoBatedor` até junto da bola durante a fase de
    preparação do clip, e a bola só parte no `contactTime`.
    */
    recuoBatedor: 3.0,         // onde ESPERA, atrás da bola (3 m atrás da linha da bola, alinhado com o remate)
    lateralBatedor: 0.0,       // alinhado na direcção da cobrança como no penálti
    /*
    A corrida do gesto cobre só os últimos metros: o `contactTime` do ShotClip
    são ~0.32 s. Os primeiros metros são andados durante a espera regulamentar
    (ver o ramo `faltaPendente` no Match.update), e o gesto arranca daqui.
    */
    arranqueDoGesto: 1.8,
    velocidadeAproximacao: 2.4,   // m/s a caminhar para a bola, antes do gesto
    // Onde o pé fica no instante do contacto: um passo atrás da bola.
    paragemNoContacto: 0.55,
    afastaAdversarios: 9.15,   // ninguém da defesa mais perto do que isto da bola

    /*
    =========================================================================
    GENTE NA ÁREA À ESPERA DO CRUZAMENTO
    =========================================================================
    Não havia nenhuma: o setup da falta punha o batedor e a barreira, e os
    outros nove atacantes ficavam onde a jogada os tinha deixado. Cruzava-se
    para uma área vazia — e é por isso que a falta no ataque não produzia nada.

    `zonaDeArea` é a partir de onde vale a pena povoar. CUIDADO COM A UNIDADE:
    é `bolaZ * dir`, medido do MEIO-CAMPO e não da linha de fundo — o mesmo
    referencial do `barreiraZonaZ` aqui em cima. 18 m do meio-campo é o início
    do terço ofensivo (106/6 = 17.7), ou seja faltas a menos de ~35 m da
    baliza. Mais atrás do que isso a falta é de recomposição, não de ataque, e
    mandar cinco homens para a área só abria o contra-ataque.

    Os slots são relativos à BALIZA, como os do canto (ver attackSetup em
    match.js): `relX` do eixo, com sinal do lado de onde vem o cruzamento, e
    `dist` da linha de fundo. `initial` é onde se espera, `target` para onde
    se ataca quando a bola sai — de fora para dentro, que é como se ganha o
    corpo ao marcador.

    Menos gente do que num canto, e de propósito: numa falta a bola pode sair
    em remate ou em passe, e uma equipa inteira dentro da área a um remate
    directo fica sem ninguém para a segunda bola nem para o contra-ataque.
    */
    zonaDeArea: 18.0,
    slotsArea: [
        // 1. Primeiro pau
        { initial: { relX: 3.0, dist: 7.0 }, target: { relX: 3.6, dist: 4.8 } },
        // 2. Coração da área, à altura da marca de penálti
        { initial: { relX: -0.5, dist: 11.0 }, target: { relX: 0.0, dist: 8.5 } },
        // 3. Segundo pau, ataca de trás para a frente
        { initial: { relX: -4.5, dist: 9.0 }, target: { relX: -3.4, dist: 6.0 } },
        // 4. Segunda vaga, chega atrasado
        { initial: { relX: 1.0, dist: 14.5 }, target: { relX: 1.0, dist: 11.5 } },
        // 5. Sobra na entrada da área, para o ressalto e a recarga
        { initial: { relX: 0.5, dist: 19.5 }, target: { relX: 0.5, dist: 18.0 } }
    ],
    /*
    E os marcadores, um por cada slot acima, sempre do lado da BALIZA em
    relação ao homem deles — os dois arrays andam a par, mexer num pede mexer
    no outro. Só entram os defensores que sobram da barreira: a barreira é
    obrigação e vem primeiro.
    */
    slotsMarcacao: [
        { relX: 3.2, dist: 5.4 },
        { relX: -0.5, dist: 9.2 },
        { relX: -4.2, dist: 7.4 },
        { relX: 1.0, dist: 12.7 },
        { relX: 0.5, dist: 17.7 }
    ]
};

/*
=============================================================================
PENÁLTI
=============================================================================
Marca a 11 m, toda a gente fora da área e fora da meia-lua, guarda-redes na
linha. O remate tem resolução própria — os pesos do remate em jogo corrido
(bloqueadores, distância, ângulo) não fazem sentido aqui.

`chanceBase` é a probabilidade de o remate ir enquadrado e bem colocado antes
de o guarda-redes contar; o duelo com ele resolve-se depois, pelo mergulho
normal (o GK reage com `gkDelayReacao`, como em qualquer remate).
=============================================================================
*/
const PenaltyModel = {
    marcaZ: 11.0,              // distância à linha de fundo
    raioMeiaLua: 9.15,         // ninguém dentro disto além do batedor
    margemArea: 16.5,          // linha da grande área
    recuoBatedor: 4.6,         // onde ele espera, atrás da bola
    areaX: 20.16,              // meia-largura da grande área
    folgaArco: 0.6,            // quanto ficam PARA LÁ da meia-lua
    folgaArea: 0.8,            // e para lá da linha da área
    /*
    Espaçamento entre jogadores na fila da entrada da área. São DEZANOVE (dois
    planteis menos os dois guarda-redes e o batedor), e a 3.2 m isso dava uma
    fila de 58 m — mais larga do que a grande área, com metade da gente
    encostada ao clamp de `areaX + 4`. A 2.2 m ocupa ~40 m e ainda cabe.
    */
    espacamentoFila: 2.2,      // entre jogadores na fila da entrada da área

    /*
    Escalonamento em profundidade da fila, em metros PARA TRÁS (afastando-se da
    baliza). Os atacantes ficam à frente, a atacar o ressalto; os defesas mais
    atrás, prontos para o contra-ataque. Sem isto ficavam todos na mesma linha,
    o que lê como uma parede e não como um aglomerado à espera da recarga.

    Mesma ideia da ordenação `def → mid → ata` do canto (ver defenseSetup em
    match.js). A fila é ainda MESCLADA entre as duas equipas — quem disputa o
    ressalto está ombro a ombro com o adversário, não em blocos separados.
    */
    recuoPorRole: { ata: 0.0, mid: 1.6, def: 3.2 },

    /*
    COBERTURA DO CONTRA-ATAQUE. Com toda a gente na entrada da área os vinte e
    um jogadores liam-se como uma linha só, e ninguém guardava as costas de
    quem bate — se a bola sair dali a correr, o campo atrás está vazio.

    Dois defesas e um médio da equipa que BATE ficam `recuoCobertura` metros
    mais atrás do que a sua posição na fila. É a equipa atacante e não a que
    defende: quem arrisca o contra-ataque num penálti é quem tem toda a gente à
    frente da bola.
    */
    coberturaDef: 2,           // defesas do batedor que ficam atrás
    coberturaMid: 1,           // e médios
    coberturaAtaAdv: 2,        // atacantes de quem DEFENDE, à espera da bola
    recuoCobertura: 12.0,      // metros atrás da fila da entrada da área
    /*
    Eles saem da fila e formam uma linha PRÓPRIA, centrada no eixo. Deixá-los
    na fila punha-os nas pontas — ela tem 21 lugares a 2.2 m, e quem sobra fica
    encostado à linha lateral, que é o oposto de cobrir o meio.
    */
    espacamentoCobertura: 5.0, // entre eles, nessa linha
    limiteXCobertura: 10.0,    // e nunca mais para fora do que isto
    avancoAtaAdv: 3.0,         // os atacantes ficam à frente dos outros três

    /*
    A CORRIDA PARA A BOLA. Mesma divisão em dois tempos da falta (ver
    FreeKickModel.arranqueDoGesto): o batedor espera em `recuoBatedor`, CAMINHA
    até `arranqueDoGesto` durante o último terço da espera regulamentar, e o
    gesto cobre só os últimos metros.

    Sem isto os 4.6 m tinham de caber dentro do `contactTime` do ShotClip
    (~0.32 s), ou seja ~13 m/s com a pose de remate congelada — o batedor
    DESLIZAVA sobre a perna de apoio até à bola em vez de correr.
    */
    arranqueDoGesto: 2.0,         // onde o gesto arranca, atrás da bola
    velocidadeAproximacao: 2.6,   // m/s a caminhar para a bola, antes do gesto
    paragemNoContacto: 0.55,      // onde o pé fica no instante do contacto

    potencia: 26.0,            // m/s à saída
    alturaMax: 1.9,            // não se coloca acima disto (trave a 2.44)
    margemPoste: 0.45,         // quanto se afasta do poste ao colocar
    chanceGolo: 0.78,          // enquadrado e colocado; o resto vai por fora

    /*
    Probabilidade de o guarda-redes MERGULHAR PARA O SÍTIO CERTO, por banda do
    duelo `diff = (TEC + d10) - (GK + d10)`. Só se aplica a remates que iam
    para dentro da baliza (ver baterPenalti); trave e fora não passam por aqui.

    Antes só o ramo `diff <= -5` o mandava ao sítio certo — abaixo disso o
    mergulho era SEMPRE para o lado contrário, e um penálti bem batido nunca
    dava defesa. A escala segue a real: ~25% de defesas no total, e quase
    nenhuma nos remates perfeitos ao ângulo.
    */
    chanceDefesa: {
        perfeito: 0.02,   // diff > 5   — ao ângulo, sem hipótese
        bom: 0.12,        // diff 3..5
        medio: 0.30,      // diff 1..2
        fraco: 0.55       // diff <= 0  — mal batido
    },

    /*
    ÁRBITRO no penálti: à ESQUERDA do batedor (ele olha para a baliza), no
    cruzamento da linha lateral da pequena área com o alinhamento da marca —
    ou seja x = ±(LARGURA_BALIZA/2 + 5.5) e z = o mesmo z da marca. Dali vê a
    bola, o pé do batedor e a linha do guarda-redes sem estar no caminho de
    ninguém, que é a colocação real.

    A diagonal normal (ver pontoDoArbitro) punha-o algures a meio-campo, longe
    do lance.
    */
    arbitroX: 9.16   // LARGURA_BALIZA/2 + 5.5, lateral da pequena área
};

const CrossModel = {
    alaX: 15.0,           // a partir daqui conta como estar na ala
    zonaZ: 20.0,          // e daqui para a frente vale a pena olhar para a área (recuado para evitar cruzamento de muito longe)

    areaZ: 34.0,          // linha da grande área
    areaX: 20.5,          // meia-largura da grande área
    fundoZ: 50.0,         // linha de fundo
    distMin: 10.0,         // abaixo disto é passe curto, não cruzamento pelo ar
    distBaseIdeal: 18.0,   // distância de referência ideal para cruzamento
    penalDistancia: 0.035, // penalidade progressiva por metro de distância além do ideal

    // +20% pedido explicitamente: cruzamentos pouco frequentes.
    chanceBase: 0.54,     // com um alvo na área
    chancePorAlvo: 0.264, // por cada alvo além do primeiro
    // +100% pedido: cruzar DAS LATERAIS DA ÁREA. Os dois termos que dependem
    // de estar lá (largura junto à linha, e o peso da camada CRUZAMENTO do
    // SpatialGrid — ver pesoGrid abaixo) dobraram; a chanceBase não, senão
    // subia também o cruzamento de qualquer sítio.
    bonusLargura: 0.72,   // acumulado junto à linha lateral
    bonusFundo: 0.42,     // acumulado junto à linha de fundo
    // Quanto vale a célula da camada CRUZAMENTO (0-100) do SpatialGrid, que é
    // exactamente a faixa das laterais da área. 0.30 -> 0.60.
    pesoGrid: 0.60,
    penalPressao: 0.30,   // sob pressão o cruzamento sai mal
    chanceMax: 0.97,

    /*
    NAS LATERAIS DA ÁREA O CRUZAMENTO TEM DE GANHAR AO PASSE RASTEIRO.

    Os bónus acima já empurram o cruzamento para cima nessa zona, mas isso não
    chega: a decisão não é entre "cruzar" e "não fazer nada" — é entre cruzar e
    PASSAR, e a nota do passe não sabia nada de estar na ala junto à área. Um
    passe curto para trás pontuava na mesma o que pontuaria no meio-campo, e
    ganhava.

    Daí a penalização do outro lado da balança: dentro da zona (ver
    `zonaLateralDaArea` em utils.js) a nota do passe rasteiro e do lançamento
    rasteiro é multiplicada por `penalPasseRasteiro`. O cruzamento não é
    tocado — sobe por comparação, que é o que "mais bónus para cruzamento do
    que para passe" quer dizer.

    A zona é a mesma dos bónus: da ala (`alaX`) para fora, e do `zonaZ` para a
    frente. A penalização entra a 0 na borda e chega ao valor cheio junto à
    linha de fundo, para não haver um degrau na decisão.
    */
    penalPasseRasteiro: 0.45,   // a nota do passe vale isto, na zona cheia
    penalLancamentoRasteiro: 0.35,

    /*
    =====================================================================
    O CANTO — a força que faltava
    =====================================================================
    A balística do canto (case 'SET_PIECE_TAKER' em fsm.js) era SEM ARRASTO:
    fixava `vy` e resolvia a horizontal por `vHoriz = d / tVoo`, ou seja a
    fórmula de manual para um tiro no vácuo. A física da bola tem arrasto
    quadrático nas TRÊS componentes (`BallPhysics.kArrasto`, ver
    match_physics.js), e a 17-18 m/s isso são ~4 m/s² a travar a bola durante
    todo o voo.

    Medido para um canto típico (d ≈ 35 m, tVoo ≈ 2.0 s): a bola caía aos
    ~29 m em vez dos 35 — seis metros curta, à entrada da área em vez de na
    marca. É exactamente o "falta força" que se vê.

    O resto do código não tem este problema porque resolve a balística por
    `velocidadeParaAlcance` (utils.js), que simula o voo com arrasto. O canto
    era o único sítio que ainda usava a conta do vácuo, e passa a usar a
    mesma função.

    `elevacao` mantém a forma do cruzamento que já havia (o `vy` de 9.8 m/s
    sobre uma horizontal de ~17.5 dava ~29°); `forca` é o botão para afinar
    por cima da balística correcta, e fica em 1.0 porque com o arrasto
    contado a bola já chega ao sítio pedido.
    */
    canto: {
        elevacao: 29.0,      // graus à saída do pé
        variacaoElev: 3.0,   // ± aleatório, para nem todos os cantos saírem iguais
        forca: 1.0           // multiplicador por cima da balística com arrasto
    }
};

/*
Domínio de bola: recepção, intercepção e desvio.

A regra antiga era uma só: a bola só podia ser apanhada a menos de 1.2 m E com
velocidade² < 60 (ou seja, abaixo de 7.75 m/s). Como todos os passes saem entre
16 e 25 m/s, isso significava que ninguém podia tocar num passe em movimento —
não havia intercepções no jogo, e o destinatário tinha de esperar meio segundo
que a bola abrandasse.

Agora qualquer jogador ao alcance disputa a bola. Quanto mais rápida ela vem e
menor a skill dele, menor a hipótese de a dominar; falhando, desvia-a. Quem
espera o passe tem uma vantagem (`receiverBonus`), porque já vinha a preparar-se.

O guarda-redes não entra por aqui a alta velocidade: as defesas dele são
tratadas em FootballPlayer.updateGK().
*/

const HeaderModel = {
    alcanceMax: 16.0,          // alcance máximo de um alívio de cabeça
    alcancePasse: 8.5,         // alcance de escora para colega

    /*
    FORA DA ZONA DE REMATE A CABEÇADA É SEMPRE PARA BAIXO.

    Era o `elevacaoAlivio` a 28° que alimentava o ping-pong aéreo: a bola subia,
    voltava a cair à altura da testa e o seguinte cabeceava outra vez. O travão
    do `maxHeadersSeguidos` corta a sequência ao terceiro, mas dois cabeceios
    seguidos já se vêem, e a bola ficava no ar entre eles.

    Uma cabeçada defensiva bem feita é para BAIXO — bate no chão perto e
    ressalta rasteira, que é o que a tira da altura da cabeça de toda a gente.
    Por isso o alívio longo deixou de existir como trajectória própria: fora da
    zona de remate usa-se sempre `elevacaoEscora`, e o que muda entre escorar
    para um colega e aliviar sem destinatário é a DISTÂNCIA, não o ângulo.

    O `elevacao` (22°) fica para quem o chamar de fora daqui; o `elevacaoAlivio`
    foi REMOVIDO, para ninguém lhe voltar a pegar por engano.
    */
    elevacao: 22 * Math.PI / 180,        // elevação genérica de cabeceio

    /*
    Ângulo da cabeçada para baixo — NEGATIVO, a bola sai a descer. Estava em
    +8°, e a +8° a partir da testa (1.62 m) a bola ainda subia até ~1.75 m e
    voltava a passar pela altura de cabeceio na descida: o ping-pong recomeçava
    ali mesmo. Para a bola nunca mais estar à altura da cabeça de ninguém, tem
    de sair já a descer.
    */
    elevacaoEscora: -9 * Math.PI / 180,

    /*
    Alcance de um alívio para baixo, em metros. A bola sai a descer e bate no
    chão perto — quer-se isso, não distância. Este é o tecto da distância pedida
    fora da zona de remate.

    ATENÇÃO ao calcular a velocidade para esta distância: a cabeçada parte de
    ALTURA_TESTA, não do chão. O `velocidadeParaAlcance` resolve o alcance de um
    lançamento que SAI DO CHÃO, e usá-lo aqui punha a bola pedida a 4 m a cair
    aos 8.4 m — o dobro. Usa-se `velocidadeDeLancamento` (utils.js), que resolve
    um ponto (distância, altura) a partir de uma altura de saída.
    */
    alcanceAlivioBaixo: 8.0,

    /*
    PISO da cabeçada — e é ele que impede o mesmo jogador de cabecear duas
    vezes seguidas.

    A distância pedida era `min(distância ao colega, alcanceAlivioBaixo)`, sem
    mínimo nenhum. Com um colega a 1 m, a balística resolvia a cabeçada para
    **1.93 m/s**: em 0.35 s — o `BallControl.touchLock` — a bola percorria 66 cm
    e ficava ali à frente da cara de quem a cabeceou, à altura da testa. Ele
    voltava a alcançá-la assim que o lock passava, e cabeceava outra vez. Era
    isso que se via como "duas cabeçadas seguidas rápidas do mesmo jogador".

    Uma cabeçada tem sempre pancada: mesmo a escorar para o lado, a bola sai
    com alguns metros por segundo. `alcanceMin` impede que se peça um alvo
    absurdamente perto, e `velocidadeMin` é o piso duro, para o caso de a
    geometria ainda produzir uma solução mansa.

    Os dois juntos garantem que a bola sai da zona de alcance do próprio
    cabeceador dentro do `touchLock`.
    */
    alcanceMin: 3.5,        // metros — nunca se cabeceia para mais perto do que isto
    velocidadeMin: 7.0,     // m/s à saída, piso duro

    /*
    Tecto da velocidade de saída de uma cabeçada, em m/s. Uma cabeçada leva a
    velocidade da testa e do tronco, não de uma perna a rodar: 13 m/s é o topo.

    Sem este tecto a DISTÂNCIA PEDIDA mandava na velocidade, e a geometria de um
    ângulo descendente fixo é implacável — a sair a -9° de 1.62 m, a bola chega
    no máximo a ~9.5 m mesmo com velocidade infinita. Pedir 9 m dava **69 m/s**.
    Com o tecto, é a distância que cede: a bola cai mais perto, ainda para baixo,
    que é o que interessa.
    */
    velocidadeMax: 13.0,

    /*
    Meia-largura, em metros, da faixa à volta de ALTURA_TESTA onde o contacto
    conta como cabeceio. Abaixo dela é peito; acima, a bola passa por cima
    da cabeça e não há contacto nenhum.
    */
    janelaContacto: 0.22,

    /*
    Anti Ping-Pong Aéreo:
    - Limite estrito de no máximo 2 cabeceios seguidos na mesma disputa aérea
    - Após o limite, obriga domínio de peito ou queda no pé para continuar jogando no chão
    */
    maxHeadersSeguidos: 2,
    cooldownDisputa: 2.2
};

/*
Mergulho do guarda-redes (ver js/gk_dive.js).

Substitui o mergulho antigo, que era `gkCorpo.position.x += dirX * v * dt` —
um deslize lateral imposto por frame, sem agachar, sem impulso e sem voo, com
o corpo já rodado antes de sair do sítio. E a rotação era composta em Euler
(`pelvis.rotation.z` do lado + `pelvis.rotation.x` do pitch), o que torcia o
boneco: dois eixos aplicados em sequência não dão a queda num plano só.

Agora: fases (ler, impulso, voo, chão, levantar), centro de massa balístico
(`p = p0 + v0·t + ½g·t²`) e UMA rotação à volta de UM eixo — o eixo frontal
do próprio modelo. Com um só eixo é geometricamente impossível ficar torto.
*/

const XGModel = {
    base: 0.55,
    pesoLogAngulo: 1.10,
    pesoDistancia: 0.10,

    // Um remate de trás da linha de fundo não tem ângulo nenhum; o piso evita
    // o ln(0) e dá-lhe um valor desprezável em vez de -Infinity.
    anguloMinimo: 0.02
};

function pontoDeCanto(bolaX, attDir) {
    const lado = (bolaX >= 0) ? 1 : -1;
    const meiaLarg = CAMPO_LARG / 2;
    const meioComp = CAMPO_COMP / 2;

    // Meio metro para dentro das duas linhas: a bandeirola, sem arriscar o
    // clamp da linha de fundo.
    const bola = {
        x: lado * (meiaLarg - 0.5),
        y: BallPhysics.raio,
        z: attDir * (meioComp - 0.5)
    };

    // Para onde a bola vai: a zona do penalti da baliza atacada.
    const alvo = { x: 0, z: attDir * (meioComp - 11) };

    // Batedor: na recta alvo->bola, 1.6 m PARA ALEM da bola. Fica sempre fora
    // do campo (a bola ja esta a meio metro das duas linhas) e com a bola
    // entre ele e a area, que e o que lhe da o gesto de centrar.
    let dx = bola.x - alvo.x;
    let dz = bola.z - alvo.z;
    const d = Math.max(0.000001, Math.hypot(dx, dz));
    dx /= d; dz /= d;

    const batedor = { x: bola.x + dx * 1.6, z: bola.z + dz * 1.6 };

    return { bola: bola, batedor: batedor, alvo: alvo };
}
