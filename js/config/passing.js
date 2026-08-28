/*
=============================================================================
CONFIG: MODELOS DE PASSE E APOIO
=============================================================================
Linhas de passe, tipos de passe, jogadas combinadas (tabelinhas/overlap) e apoios.
=============================================================================
*/

const PassLineModel = {
    bloqueioDuro: 0.9,       // metros: abaixo disto a bola não passa, ponto final
    corredorBase: 3.0,       // largura do corredor de ameaça num passe curto
    corredorPorMetro: 0.06,  // e quanto cresce por metro de passe
    corredorMax: 7.0,
    pesoLinha: 300,          // mesma escala do bónus de receptor livre
    pesoCorpo: 60,           // por adversário dentro do corredor
    factorOrquestrador: 0.4, // "vê através" — sofre menos com linhas apertadas

    /*
    Perto da baliza a conta muda: a área é o sítio mais congestionado do campo,
    e exigir linha limpa ali é exigir que nunca se jogue para dentro dela. Um
    passe de risco à entrada da área vale muito mais do que um passe seguro no
    meio-campo, porque o que está do outro lado é um remate.

    Sem isto — medido depois de a linha passar a peso — os ataques morriam à
    entrada do último terço: ninguém entrava a passar (tráfego) nem a conduzir
    (orçamento de condução), e deixava de haver remates.

    Aplica-se ao DESTINO do passe, não a quem passa: é entrar na zona que
    justifica o risco.
    */
    factorUltimoTerco: 0.45,
    ultimoTercoZ: 17.0       // mesma fronteira do bolaNoUltimoTerco do TeamBT
};

const PassModel = {
    carryChance: 0.10,
    carryChanceShort: 0.05,
    carryChanceLong: 0.20,

    preferenceBonus: 8.0,       // empurrão para a função preferida da posição

    /*
    Caminho fechado à frente: com este número de adversários no corredor de
    progressão, o portador deixa de tentar passar para a frente (ou driblar)
    e joga para o LADO ou para TRÁS.

    Sem isto a árvore tentava sempre a frente primeiro: com dois adversários
    entre ele e o colega, o passe ou era interceptado ou obrigava o receptor
    a recebê-la de costas com marcador em cima. Sair pelo lado é a jogada
    óbvia e não existia como decisão.

    O corredor é medido à FRENTE dele no referencial de ataque, dentro de
    `bloqueioLargura` metros para cada lado — não é um raio à volta do
    jogador: um adversário ao lado dele não fecha caminho nenhum.
    */
    bloqueioMin: 2,             // quantos adversários fecham o caminho
    bloqueioDist: 14.0,         // até que distância à frente conta
    bloqueioLargura: 6.0,       // meia-largura do corredor

    throughBallGap: 14.0,       // quão atrás da linha o colega pode estar
    throughBallDepth: 9.0,      // metros além da linha onde se põe a bola
    /*
    Baixou de 45: com o alvo posto `throughBallDepth` ALÉM do companheiro, um
    limite de 45 m dava lançamentos medidos de 58 m — distância de pontapé de
    baliza, não de passe em profundidade.
    */
    throughBallMaxDist: 38.0,
    // Nem sempre que há espaço se lança: senão o jogo torna-se todo directo.
    throughBallChance: 0.675, // 0.30 -> 0.45 -> 0.675 (+50% duas vezes)

    /*
    Conversão de distância em força — OBSOLETA. Vinha do modelo de arrasto
    antigo ("a bola perde 0.22 × 0.85 da velocidade por segundo"), que já não
    existe. A força é agora resolvida a partir do alcance pretendido, em
    velocidadeParaAlcance/velocidadeRasteiraPara (utils.js). Mantida só para
    não partir quem ainda lhe chame.
    */
    forceForDistance: 1.68,

    /*
    --- Balística do passe (ver executePassGameplay em fsm.js) --------------

    Acima de `distAereo` o passe vai pelo ar e ATERRA no alvo. A elevação
    desce com a distância: um passe de 25 m sobe mais para passar por cima de
    quem está no meio; um de 60 m vai mais raso para chegar depressa.
    */
    /*
    Passe/lançamento longo só para alvos a MAIS de 30 m (pedido). Abaixo
    disso é passe rasteiro normal — uma bola pelo ar para um colega a 12 m
    só complica a recepção sem ganhar nada.
    */
    distMinLonga: 30.0,
    distAereo: 30.0,
    elevacaoCurta: 24 * Math.PI / 180,
    elevacaoLonga: 25 * Math.PI / 180,
    elevacaoCruzamento: 22 * Math.PI / 180,
    // Recurso do lançamento alto quando o resolverElevacaoPasse não dá ângulo:
    // dentro da mesma faixa de 25°-35° (ver passeArco).
    elevacaoLancamento: 25 * Math.PI / 180,

    /*
    --- Os três tipos de bola alta ------------------------------------------
    A elevação passa por cima dos marcadores nos três; o que os distingue é o
    PONTO DE MIRA:

    1. PASSE pelo alto      aterra um pouco ANTES do companheiro, para lhe
                            morrer à frente ou no peito. `recuoPasseAlto` é
                            esse encurtamento, em metros.
    2. LANÇAMENTO pelo alto aterra À FRENTE dele, no espaço para onde corre.
                            O alvo já é o espaço (ver findThroughBall), por
                            isso aqui só se pede que aterre lá.
    3. CRUZAMENTO alto      chega à altura da CABEÇA dele, ainda no ar, para
                            cabecear. Não aterra no ponto — passa por ele a
                            `alturaCruzamento` do chão.
    */
    recuoPasseAlto: 1.5,
    alturaCruzamento: ALTURA_CABECA,
    // Adversários a esta distância transversal da linha do passe (à distância do travês da bola) bloqueiam a linha / obrigam a levantar a bola.
    corredorBloqueio: 1.0,

    /*
    --- Arco do passe normal por faixa de distância (pedido explícito) -----

    <=15m sempre rasteiro. 15-30m pode sair rasteiro OU com um arco raso, com
    TECTO de altura por faixa — só sobe o necessário para passar por cima de
    quem estiver no meio, nunca um lançamento. >=30m é sempre pelo alto, com
    ângulo entre 30° (mais raso, mais rápido) e 45° (mais alto), calculado
    para o alcance pedido.

    `rasteiroMax` era 5m, e por isso um passe curto de 8 ou 12m era levantado
    metade das vezes sem ganhar nada: à distância a que o companheiro está
    livre, a bola no chão chega antes e é mais fácil de dominar. Levantar só
    faz sentido quando há mesmo gente no caminho — e essa decisão já é tomada
    à parte, no ramo de linha bloqueada.

    `chanceArco`: acima de `rasteiroMax`, chance de sair com arco em vez de
    rasteiro — o mesmo passe de 20m tanto pode ser jogado no chão como
    levantado.
    */
    passeArco: {
        rasteiroMax: 15.0,
        chanceArco: 0.5,
        bandas: [
            { max: 10.0, alturaMax: 1.0 },
            { max: 20.0, alturaMax: 1.5 },
            { max: 30.0, alturaMax: 4.2 }
        ],

        /*
        FAIXA DE ELEVAÇÃO DE TODO O PASSE PELO ALTO — 25° a 35°.

        Um passe pelo alto é um passe: sai do peito do pé com o corpo por cima
        da bola. Acima dos ~35° já é um pontapé de recurso, e era isso que se
        via — passes com a mesma parábola de um chutão de guarda-redes.

        Havia três caminhos a escolher elevação e nenhum tinha esta faixa:

          bandas (<=30 m)   `atan(4·alturaMax/dist)` com tecto de 60°. Um
                            passe de 21 m pela banda dos 4.2 m dava 38.7°.
          longo (>30 m)     interpolava entre 42° e 32°.
          encontro          o `elevacaoParaTempoDeVoo` (utils.js) tinha
                            limites próprios de 12° a 55°, e quando o receptor
                            demorava a chegar ele ia buscar os 55° para
                            atrasar a bola. É o mais alto dos três.

        Agora os três apertam-se aqui. O tempo do encontro continua a resolver-
        se pelo ângulo — só que dentro da faixa de um passe, e o que não couber
        resolve-se onde deve, na força.
        */
        elevMin: 25 * Math.PI / 180,
        elevMax: 35 * Math.PI / 180,

        /*
        TECTO DE ALTURA, em metros. A faixa de ângulos descreve o gesto e é a
        mesma a 18 m e a 55 m — mas o apex cresce com a VELOCIDADE, que cresce
        com a distância. Medido: um lançamento de 54.9 m a 35° saía com
        vy = 18.5 e subia 17 m. Ângulo legal, bola de guarda-redes.

        Ver `elevacaoComTectoDeApex` (utils.js): acima disto a elevação baixa
        até caber.
        */
        apexMax: 7.0,

        /*
        E quando nem no mínimo da faixa o apex cabe — um passe de 55 m a 25°
        ainda sobe 11 m — a bola sai MAIS TENSA do que a faixa do gesto
        permite. É o que um jogador faz mesmo: a alternativa a um passe longo
        tenso não é um passe longo alto, é não dar o passe.

        A faixa de 25°-35° continua a mandar em tudo o resto; isto é só o piso
        do tecto de altura.
        */
        elevMinLonga: 15 * Math.PI / 180,

        anguloLongoMin: 25 * Math.PI / 180,
        anguloLongoMax: 35 * Math.PI / 180
    },

    /*
    Com que velocidade a bola CHEGA ao alvo num passe rasteiro.

    É esta a manípula do RITMO do passe: a velocidade de saída é consequência
    dela e da distância (ver velocidadeRasteiraPara), portanto subir isto
    acelera a bola toda sem mexer na física.

    Esteve a 2.8, e a esse valor um passe de 10 m demorava 1.57 s a chegar —
    "câmara lenta", e com razão: no jogo real um passe rasteiro de 10 m anda
    à volta de 1 s. A 6.0 o mesmo passe leva 1.12 s e sai a 11.8 m/s em vez
    de 9.9.

    Subiu 25% (6.0 -> 7.5, e 2.8 -> 3.5 nos outros dois) e posteriormente +10%
    (7.5 -> 8.25) para um ritmo mais ágil e veloz de circulação.

    ISSO OBRIGOU A SUBIR O `BallControl.easySpeed` NA MESMA PROPORÇÃO, e a
    razão está aqui: o `easySpeed` é a velocidade acima da qual o domínio deixa
    de ser garantido, e o reforço do passe curto soma até +2.16 m/s
    (`(12 - dist) * 0.18`). A 8.25 um passe de 3 m chega a **9.87 m/s**, e com
    o easySpeed calibrado proporcionalmente (10.66 m/s), os passes curtos
    mantêm o domínio seguro ao primeiro toque.
    */
    vChegadaRasteira: 8.25,
    vChegadaCruzamento: 3.85,
    /*
    O lancamento chega mais manso do que o passe aos pes, e de proposito: o
    alvo dele e um PONTO a frente de quem corre, nao o pe de ninguem.
    */
    vChegadaLancamento: 2.75,

    /*
    PASSE DE ENCONTRO — ver `passeDeEncontro` em utils.js.

    O `vChegadaLancamento` acima resolve a força SÓ pela distância: "quero que
    a bola chegue ali a 2.75 m/s". Não sabe quando é que o companheiro lá chega,
    e é essa a falha que se via — o passe aos pés certo, o passe no espaço e o
    lançamento sempre errados. A bola chegava ao ponto mais de um segundo antes
    dele e ficava lá parada, ou chegava viva e passava-lhe pela frente.

    Aqui pede-se as duas coisas ao mesmo tempo:

      TEMPO      a bola chega ao ponto `folgaTempo` DEPOIS dele — ele chega
                 primeiro, não trava à espera dela.
      CHEGADA    e chega a `fracVelReceptor` da velocidade a que ele corre. Uma
                 bola que aterra a 14 m/s à frente de quem corre a 7 é
                 impossível de aceitar por muito bem sincronizada que esteja.

    Quando as duas se mordem manda a chegada: mais vale a bola esperar por ele
    do que fugir-lhe.
    */
    encontro: {
        folgaTempo: 0.15,       // s que a bola chega depois dele
        fracVelReceptor: 0.85,  // chegada, em fracção da velocidade dele
        vChegadaMin: 3.3,       // piso: não morrer antes do ponto
        vChegadaMax: 12.1,      // tecto absoluto, mesmo com um receptor rápido
        vSaidaMax: 20.35,       // o mesmo tecto do velocidadeRasteiraPara
        /*
        Só entra quando o alvo está mesmo À FRENTE do companheiro. Abaixo
        disto o passe é aos pés, e aí o alvo é ele: sincronizar não muda nada
        e só arriscava mexer no que já estava certo.
        */
        distMinAlvo: 3.0,

        /*
        Limites da elevação quando o passe vai pelo alto e o tempo é resolvido
        pelo ângulo (ver elevacaoParaTempoDeVoo). Abaixo de 12° já é um passe
        rasteiro com pretensões; acima de 55° é uma bola que fica no ar tanto
        tempo que qualquer defesa lá chega.
        */
        /*
        A faixa é a MESMA do resto dos passes pelo alto (passeArco.elevMin/Max,
        25°-35°). Estava em 12°-55°, e era o pior dos três caminhos: quando o
        receptor demorava a chegar, o encontro ia buscar os 55° para atrasar a
        bola — o passe saía com a parábola de um chutão de guarda-redes. Dentro
        da faixa o ângulo ainda ajusta o tempo; o que não couber resolve-se na
        força, onde deve.
        */
        elevMin: 25 * Math.PI / 180,
        elevMax: 35 * Math.PI / 180
    },

    /*
    RECEPÇÃO NO ESPAÇO — ver o ramo novo do `actReceivePass` (player_bt.js).

    O destinatário preferia SEMPRE o `interceptionPoint` (perception.js), que é
    o primeiro ponto da trajectória a que ele chega — para uma bola que vem na
    direcção dele, isso fica ATRÁS do sítio para onde o passe foi dado. Num
    passe no espaço ele dava meia-volta e ia buscar a bola em vez de correr
    para o espaço. Medido: meio segundo depois do passe, 56% dos lançamentos
    tinham o destinatário MAIS LONGE do ponto (8.9 m -> 10.7 m).

    `distEspaco`: acima desta distância ao ponto, o passe é para o ESPAÇO e não
    para os pés — e aí corre-se para o ponto, desde que se lá chegue a tempo.
    `folgaTempo`: quanto pode chegar depois da bola e ainda valer a pena (ela
    continua a rolar).
    */
    recepcao: {
        distEspaco: 2.5,
        folgaTempo: 0.35
    },

    /*
    Erro máximo no PESO da bola, para skill de passe 0. Escala com
    (1 - PASS/100): a 80 de PASS o erro é ±3.6%, a 40 é ±10.8%. Substitui o
    antigo `passBoost`, que aumentava a força em vez da precisão — e com a
    balística resolvida isso só voltava a pôr a bola longe do alvo.
    */
    erroPesoMax: 0.18,

    /*
    --- Percepção e margem de segurança de limites de campo (Linhas Laterais / Fundo) ---
    */
    margemSegurancaLinha: 3.2,     // Margem de segurança básica em metros
    margemSegurancaLinhaMin: 1.5,  // Menor margem admissível para jogadores excepcionais
    penalidadeBordaMax: 120        // Penalidade máxima na nota do passe por proximidade perigosa da linha
};

/*
ERRO DE EXECUCAO DO PASSE — a dispersao angular.

O `PassModel.erroPesoMax` ja tratava do PESO (chegar curto ou comprido). O
que faltava era a DIRECCAO: o passe saia sempre na linha exacta do alvo, e
por isso nenhuma bola se perdia por ter saido torta. As perdas de posse
vinham so de decisao ma ou de dominio falhado.

    sigmaMax        dispersao (rad) de um jogador com 0 de skill
    sigmaMin        piso: nem o melhor passador do mundo e exacto
    pesoTecnica     quanto a TEC conta face ao PASS (0..1)
    raioPressao     a que distancia um adversario comeca a estorvar
    pressaoMult     multiplicador de sigma com um adversario em cima
    costasMult      multiplicador quando passa de costas para o alvo
    forcaMinPressao fraccao da forca que sobra num passe apertado
    sigmaTecto      tecto duro depois de aplicados pressaoMult e costasMult —
                     sem ele o pior caso empilhado (sigmaMax * pressaoMult *
                     costasMult) passa dos 30°, muito acima do "~9.2 graus"
                     documentado para sigmaMax sozinho
*/
const PassErrorModel = {
    sigmaMax: 0.13,        // ~7.5 graus
    sigmaMin: 0.009,       // ~0.5 graus
    pesoTecnica: 0.35,
    raioPressao: 3.5,
    pressaoMult: 1.55,
    costasMult: 2.0,
    forcaMinPressao: 0.85,
    sigmaTecto: 0.26
};

/*
Carrinho (SLIDE_TACKLE).

A animação era `applyKeyframeAnimation("Soccer Tackle")` — dados pré-gravados de
outro esqueleto, com as pernas a ±3.0 rad de rotação.z (172°, praticamente
invertidas). Foi substituída por uma pose procedural: deslizar sobre uma anca,
uma perna esticada para a bola, a outra dobrada por baixo, tronco erguido e
apoiado no braço de trás.

Fases, em segundos desde o início:
    0 → lancamento   atira-se ao chão
      → deslize      desliza; a velocidade cai a zero no fim desta fase
      → paragem      fica caído (é o preço de ter feito o carrinho)
      → levantar     põe-se de pé e volta ao MOVE_TO_POS
*/

const SupportModel = {
    /*
    Apoio de CIRCULACAO — camada a distancia de passe (ver atribuirApoios).
    */
    circulacao: {
        maxApoios: 3,
        raioMin: 10.0,
        raioMax: 18.0,
        desvioMax: 8.0,
        margemLinha: 2.0,
        margemAdversario: 3.0,

        pesoFolgaLinha: 1.2,
        pesoFolgaPonto: 1.0,
        pesoCusto: 0.5,
        folgaCap: 8.0
    }
};


/*
=============================================================================
Tipos de passe — que PONTO a bola mira, e com que frequência
=============================================================================
Três formas de entregar a bola ao mesmo companheiro:

    direct   aos pés dele (o comportamento de sempre, via alvoDePasse)
    space    o ponto MEDIANO em profundidade do leque do PlayerPassTarget:
             metade dos pontos vivos está mais perto dele, metade mais longe
    leading  o ponto vivo do leque MAIS PERTO da baliza adversária

`space` e `leading` saem os dois do mesmo leque de candidatos
(pass_candidates.js), já filtrado de adversários e linhas tapadas — por isso
mirar um deles é mirar espaço jogável, não uma coordenada qualquer.

A mistura depende de DE ONDE para ONDE vai o passe. Sector = terço do campo
no referencial de ataque (def/mid/atk); corredor = centro (|x| < larguraCentro)
ou lado. As regras são testadas por ordem — a primeira que casa manda.
*/
const PassTypeModel = {
    larguraCentro: 10.0,   // |x| abaixo disto conta como corredor central

    /*
    Recuo: quantos metros o destino tem de estar ATRÁS da origem para o passe
    contar como para trás. Sem esta margem, um passe lateral com meio metro de
    diferença virava recuo e ia aos pés.
    */
    margemRecuo: 2.0,

    /*
    LEADING CURTO — o passe à frente que não precisa do leque de candidatos.

    Quando nenhum ponto do PlayerPassTarget é validado (adversário a menos de
    2 m, linha de passe tapada, ponto a mais de 30 m da bola), o passe caía aos
    pés. Num bloco compacto isso é a maior parte das vezes, e era daí que vinha
    a sensação de jogo travado.

    `liderancaCurta` é a distância cheia à frente do companheiro; perante um
    adversário encurta-se de `liderancaPasso` de cada vez, até `liderancaMin`.
    */
    liderancaCurta: 4.0,
    liderancaPasso: 1.0,
    liderancaMin: 1.5,

    /*
    Ordem importa. `recuo` vem primeiro: um passe para trás é para segurar a
    bola, e jogá-lo no espaço à frente de quem recebe manda-o correr para longe
    da linha que veio dar. `defParaAtk` tem de ser vista antes de `origemAtaque`,
    senão um passe longo de trás cairia na regra do ataque.

    A tabela foi invertida: dava 80% de bola aos pés na misturaPadrao — a regra
    que apanha a maioria dos passes — e `leading` só aparecia em duas regras
    estreitas. O jogo travava a cada passe.
    */
    regras: [
        // Passe para trás: aos pés, para segurar.
        {
            nome: 'recuo', quando: (o, d) => d.avanco < o.avanco - PassTypeModel.margemRecuo,
            mistura: { direct: 0.85, space: 0.15 }
        },

        // Defesa a saltar o meio-campo, directo para o ataque.
        {
            nome: 'defParaAtk', quando: (o, d) => o.sector === 'def' && d.sector === 'atk',
            mistura: { space: 0.5, leading: 0.5 }
        },

        // Já no ataque: lá dentro ou a abrir nas pontas.
        {
            nome: 'origemAtaque', quando: (o) => o.sector === 'atk',
            mistura: { direct: 0.25, space: 0.45, leading: 0.3 }
        },

        // Progressão pelo centro a abrir para o lado (def->mid, mid->atk).
        {
            nome: 'centroParaLado',
            quando: (o, d) => o.corredor === 'centro' && d.corredor === 'lado' &&
                ((o.sector === 'def' && d.sector === 'mid') ||
                    (o.sector === 'mid' && d.sector === 'atk')),
            mistura: { direct: 0.1, space: 0.55, leading: 0.35 }
        },

        // Dentro do corredor central, em qualquer sector.
        {
            nome: 'centroParaCentro',
            quando: (o, d) => o.corredor === 'centro' && d.corredor === 'centro',
            mistura: { direct: 0.3, space: 0.35, leading: 0.35 }
        }
    ],

    // Tudo o resto (passes laterais dentro do mesmo sector, etc.).
    misturaPadrao: { direct: 0.3, space: 0.35, leading: 0.35 },

    /*
    Pesos da escolha do RECEPTOR. O tipo de passe não decide só onde a bola
    cai — também mexe em quem a recebe: num passe para o espaço vale mais o
    companheiro que TEM espaço à frente (pontos vivos no leque) do que o que
    está mais bem colocado agora.

    `bonusSugerido` mantém o BT no comando: a escolha dele só é trocada por
    uma alternativa claramente melhor, não por um empate técnico.
    */
    escolha: {
        /*
        Os três termos chegam normalizados a 0..1 (ver notaCandidato em
        pass_types.js), por isso estes pesos são comparáveis entre si.

        Os antigos pesoProgresso/pesoEspaco/pesoDistancia multiplicavam
        grandezas em escalas diferentes, e o do espaço era a CONTAGEM de pontos
        vivos do leque — até 49, contra um progresso que raramente passava de
        40. Um companheiro isolado na lateral tinha o leque quase todo vivo e
        ganhava a escolha por estar isolado: 37 pontos contra 22 de quem estava
        bem colocado à frente. Daí o passe eterno para a lateral.
        */
        bonusSugerido: 0.5,      // vantagem de partida do alvo que o BT propôs
        progressoRef: 30.0,      // metros ganhos que valem 1.0 de progresso
        distanciaMax: 45.0,      // acima disto nem é candidato

        /*
        Os pesos variam com a PRESSÃO sobre o portador: livre, procura quem
        progride; com um adversário em cima, procura quem está livre. É o que
        torna o passe lateral para o isolado a jogada certa quando é mesmo a
        única, em vez de ser a regra.
        */
        raioPressao: 8.0,
        pesosSemPressao: { progresso: 1.0, espaco: 0.30, distancia: 0.35, linha: 1.10 },
        pesosSobPressao: { progresso: 0.45, espaco: 1.00, distancia: 0.20, linha: 1.10 },

        /*
        `linha` é a FOLGA da linha de passe até ao ponto de mira, normalizada
        pela geometria do PassLineModel (corredor que cresce com a distância,
        `bloqueioDuro` como piso). Ver notaCandidato/escolher em pass_types.js.

        Não existia, e era esse o furo: o `findPassTarget` media a linha e
        rejeitava quem tinha alguém em cima da recta, mas quem DECIDE é o
        `escolher`, e a nota dele só tinha progresso, espaço e distância. O
        alvo com a linha medida entrava aqui como sugestão e valia
        `bonusSugerido`. Medido: um companheiro 30 m à frente com um
        adversário em cima da linha (folga 0,00 m) e o leque de candidatos
        vazio ganhava 0,767 contra 0,539 do companheiro a 12 m com 14,8 m de
        folga — e daí vinham os 53% de passes cortados acima dos 25 m.

        1.10 e não menos: tem de bater o progresso (peso 1.0) sozinho, senão
        a distância continua a pagar a linha fechada. Igual com e sem pressão
        de propósito — um passe para dentro de alguém é ainda pior com um
        adversário em cima de quem passa, porque a perda é logo ali.
        */

        /*
        Abaixo desta nota não vale a pena passar a ninguém: o actPass desce a
        cascata driblar -> atrasar a alguém perto -> conduzir para trás.
        `tecnicaDrible` é o mesmo 75 que o podeDriblar já usa.
        */
        notaMinima: 1.45,
        tecnicaDrible: 75,

        /*
        1.45 e não 0.35 porque a nota mudou de escala quando o termo `linha`
        entrou: um passe de linha limpa ganha os 1.10 do peso, e com o limiar
        antigo passava a bastar ter linha para o passe valer a pena — a cascata
        (atrasar / conduzir) deixava de disparar.

        1.45 = 0.35 + 1.10, de propósito: para uma linha COMPLETAMENTE limpa o
        limiar é exactamente o de antes, e o que mudou é só que a linha suja
        passa a ter de pagar a diferença em progresso. É a alteração mínima —
        não se aproveitou o fix para reafinar quanto se passa.
        */

        /*
        Até onde se atrasa a bola. Sem este limite, um médio sob pressão
        atrasava para o guarda-redes a quarenta metros — isso não é reiniciar a
        jogada, é fugir dela.
        */
        raioRecuo: 18.0
    }
};

/*
Saída de bola do guarda-redes.

Sorteado UMA vez por posse (não a cada frame, senão ele mudava de ideias
enquanto segurava a bola e o resultado seria a média das duas opções em vez
de 80/20).

`laterais`: sai a jogar curto, e o destinatário é um LATERAL (LB/RB) — é a
saída construída, por fora, longe do miolo onde a perda custa golo.
`chuteFrente`: chutão para o espaço à frente (puntBall).

Sem lateral disponível a tempo, cai no chutão: melhor a bola longe do que
uma saída curta forçada para dentro.
*/
/*
=============================================================================
FALTA (livre directo/indirecto)
=============================================================================
A bola fica ONDE ESTÁ, quem sofreu a falta cobra, e a defesa monta barreira à
distância regulamentar. Se o ponto estiver dentro do alcance de remate de quem
bate, ele remata; senão, joga em passe.
=============================================================================
*/
/*
=============================================================================
REMATE — potência
=============================================================================
Estava escrito à mão dentro do `executeShotGameplay` (fsm.js):

    pow = (22.0 + ((TEC - 50) / 50) * 16.0) * 0.8

que dava 4.8 m/s a TEC 0, **9.9 m/s a TEC 20** e 17.6 a TEC 50. Um remate de
futebol anda nos 25-35 m/s (90-125 km/h); 9.9 m/s é um passe fraco.

O que isso fazia, medido em tests/remate_mira.test.js: a TEC 50 o alcance útil
era **23.5 m** — mais longe do que isso a `elevacaoParaAlvo` não encontrava
ângulo nenhum e devolvia `null`, e o remate saía nos **36° fixos** do ramo de
recurso. Um balão para o ar, de qualquer posição além dos 23 m. E mesmo dentro
do alcance a mira ficava alta de mais: a 22 m precisava de 32° de elevação só
para chegar ao canto rasteiro.

Com estes valores a mesma mira a 22 m sai a ~13°, que é a trajectória tensa de
um remate a sério.
=============================================================================
*/
/*
=============================================================================
JOGO DE PRIMEIRA — tocar sem dominar
=============================================================================
Um jogador de técnica alta com um adversário em cima não precisa de parar a
bola: toca de primeira. Até aqui isso não existia — TODA a gente dominava
sempre, e a seguir esperava a cadência do `Dominar` (CadenceModel.posseBase)
antes de decidir o que fazer.

Três condições, e a terceira é o que faz disto uma possibilidade e não uma
regra:

    TÉCNICA      >= `tecMin`. Abaixo disso não se joga de primeira, domina-se.
    PRESSÃO      adversário a <= `distAdversario`. Sem ninguém por perto não
                 há razão nenhuma para não dominar — e o primeiro toque com
                 espaço é sempre a melhor opção.
    SORTEIO      `chanceMin`..`chanceMax` conforme a técnica. PODE tocar de
                 primeira, não TEM de: um TEC 100 fá-lo em `chanceMax` das
                 vezes, e nas outras baixa a bola como toda a gente.

O que muda quando sai: não há gesto de domínio (`iniciarDominioDireito`) nem
espera de cadência — ele decide no mesmo frame em que a bola lhe chega, e o
que sair daí é o passe ou o remate normal.
=============================================================================
*/
const FirstTouchModel = {
    tecMin: 85,             // técnica a partir da qual é opção
    distAdversario: 4.0,    // e só com alguém a esta distância ou menos

    // Probabilidade, interpolada entre `tecMin` e 100 de técnica.
    chanceMin: 0.45,
    chanceMax: 0.80
};

/*
=============================================================================
JOGADAS COMBINADAS — o que tem prioridade sobre o passe normal
=============================================================================
O `PassTypes.escolher` pontua todos os companheiros por uma nota dominada pelo
progresso para a baliza. Nessa nota, três jogadas que decidem jogos ou não
existiam, ou saíam por acidente:

  CARA A CARA   o passe que isola um companheiro com o guarda-redes. Na nota
                normal vale tanto como qualquer outro passe para a frente.
  TABELINHA     dar e receber de volta no espaço que se abre ao arrancar. Não
                existia de todo — não há memória entre o passe e a devolução.
  OVERLAP       correr por fora de quem tem a bola. Existiu e foi DESLIGADO
                (`overlapTimer = 0` no player.js, "Disparadas / Overlap
                pós-passe desativadas").

Nenhuma delas se resolve com um bónus na nota: um bónus continua a competir com
o progresso, e é isso que as faz perder. São um RAMO próprio, testado antes do
passe normal, por esta ordem — cara a cara primeiro porque é a que acaba a
jogada.
=============================================================================
*/
const JogadasCombinadas = {
    caraACara: {
        // O companheiro tem de estar dentro desta distância à baliza para o
        // passe valer a pena — de 45 m ninguém fica "isolado com o guarda-redes".
        distBalizaMax: 34.0,
        // Corredor entre ele e a baliza livre de defensores, com esta
        // meia-largura.
        corredorMeiaLargura: 3.5,
        // E ele tem de estar À FRENTE de toda a defesa (ou a ganhar-lhe a
        // corrida) — margem em metros sobre o último defensor.
        margemUltimoDefensor: 0.5,
        // Ponto do passe: metros à frente dele, na direcção da baliza.
        avancoDoPasse: 7.0
    },

    tabelinha: {
        // Só sob pressão: sem ninguém em cima não há razão para dar e receber.
        distAdversario: 4.5,
        // O parceiro tem de estar nesta faixa: perto que chegue para devolver
        // de primeira, longe que chegue para a bola sair do aperto.
        distParceiroMin: 5.0,
        distParceiroMax: 16.0,
        // Espaço à frente de quem inicia, para haver para onde arrancar.
        espacoAFrente: 6.0,
        // Quanto tempo o pedido fica de pé, e onde a devolução é posta.
        duracaoPedido: 2.5,
        avancoDaDevolucao: 8.0,
        // Velocidade de quem arranca para receber a devolução.
        velocidadeArranque: 7.9
    },

    overlap: {
        // Quem passa por dentro corre por fora se o corredor do seu lado
        // estiver livre até esta distância.
        corredorLivre: 12.0,
        // Só a partir do meio-campo: um overlap na própria defesa é um risco
        // sem prémio.
        avancoMin: -5.0,
        duracao: 5.0,
        // Metros à frente do portador, na linha lateral do lado dele.
        avancoDaCorrida: 12.0,
        larguraDoCorredor: 21.0,
        velocidade: 7.9,
        // Enquanto corre, o passe para ele vale isto a mais na nota.
        bonusNota: 220
    }
};

function atribuirApoios(o) {
    const resultado = [];
    if (!o || !o.candidatos || !o.candidatos.length) return resultado;

    const port = o.portador;
    const dirZ = port.dirZ;
    const meiaLarg = CAMPO_LARG / 2 - 2.0;
    const meioComp = CAMPO_COMP / 2 - 2.0;

    /*
    Um ponto serve se estiver em campo, aquem do fora-de-jogo, sem adversario
    colado, com a linha do portador aberta e a distancia de passe. E o mesmo
    teste para os pontos gerados e para o ponto que alguem JA esta a ocupar.
    */
    function serve(x, z) {
        if (Math.abs(x) > meiaLarg || Math.abs(z) > meioComp) return false;
        if (typeof o.offsideLimitDir === 'number' && z * dirZ > o.offsideLimitDir) return false;

        const d = Math.hypot(x - port.x, z - port.z);
        if (d < o.raioMin - 1.0 || d > o.raioMax + 1.0) return false;

        // Colado a um adversario nao e opcao de passe, e uma disputa.
        for (const a of o.adversarios) {
            if (Math.hypot(a.x - x, a.z - z) < o.margemAdversario) return false;
        }

        // E a bola consegue la chegar?
        return linhaLivre(port.x, port.z, x, z, o.adversarios, o.margemLinha);
    }

    const escolhidos = [];
    const usados = new Set();

    const longeDosOutros = (x, z) => {
        for (const e of escolhidos) {
            if (Math.hypot(e.x - x, e.z - z) < 6.0) return false;
        }
        return true;
    };

    /*
    HISTERESE PRIMEIRO: quem ja esta a apoiar num ponto que continua a servir
    fica com ele.

    Medido sem isto: a duracao media de um apoio era 0.2 s. A atribuicao era
    refeita do zero a cada frame e o encargo saltava de pessoa para pessoa ao
    sabor de diferencas de centimetros no custo — o jogador so estava dentro
    de 2 m do seu ponto em 7.7% dos frames, ou seja, nunca chegava a
    oferecer-se de facto. E o mesmo defeito que a marcacao tinha (ver
    atribuirMarcacoes).
    */
    for (const c of o.candidatos) {
        if (escolhidos.length >= o.maxApoios) break;
        const actual = c.apoioActual;
        if (!actual) continue;
        if (Math.hypot(actual.x - c.slotX, actual.z - c.slotZ) > o.desvioMax) continue;
        if (!serve(actual.x, actual.z)) continue;
        if (!longeDosOutros(actual.x, actual.z)) continue;

        usados.add(c.id);
        escolhidos.push({ id: c.id, x: actual.x, z: actual.z });
    }

    /*
    Leque de pontos para quem sobra. Os angulos sao relativos ao sentido de
    ATAQUE: 0 e a frente do portador, +-180 e atras. Inclui angulos para tras
    de proposito — a circulacao normal passa muito por recuar a bola para a
    linha seguinte.
    */
    const angulos = [-150, -110, -70, -35, 0, 35, 70, 110, 150];
    const raios = [o.raioMin, (o.raioMin + o.raioMax) / 2, o.raioMax];

    /*
    Cada ponto que serve leva já a folga da linha do portador e a folga ao
    adversário mais perto — a parte da nota que não depende de QUEM vai lá.
    Ver notaPontoDeApoio (utils.js); o custo do candidato entra depois.
    */
    const pontos = [];
    for (const grau of angulos) {
        for (const raio of raios) {
            const rad = grau * Math.PI / 180;
            const x = port.x + Math.sin(rad) * raio;
            const z = port.z + Math.cos(rad) * raio * dirZ;
            if (!serve(x, z)) continue;

            let folgaPonto = Infinity;
            for (const a of o.adversarios) {
                const d = Math.hypot(a.x - x, a.z - z);
                if (d < folgaPonto) folgaPonto = d;
            }

            pontos.push({
                x: x,
                z: z,
                folgaLinha: folgaDaLinha(port.x, port.z, x, z, o.adversarios),
                folgaPonto: folgaPonto
            });
        }
    }

    // Nota de um ponto PARA UM CANDIDATO: a parte do ponto, menos o que lhe
    // custa sair do slot.
    const notaPara = (ponto, c) => notaPontoDeApoio({
        folgaLinha: ponto.folgaLinha,
        folgaPonto: ponto.folgaPonto,
        custoSlot: Math.hypot(ponto.x - c.slotX, ponto.z - c.slotZ)
    }, o.pesos);

    /*
    REANCORAGEM: quem ja apoiava mas cujo ponto deixou de servir (a bola
    andou, um adversario fechou a linha) muda de ponto, nao perde o encargo.

    Sem isto ele voltava a concorrer do zero com todos os outros e a duracao
    media de um apoio nao passava de 0.5 s — o suficiente para arrancar, nao
    para chegar. Trocar de sitio e barato; trocar de pessoa e que nao.
    */
    for (const c of o.candidatos) {
        if (escolhidos.length >= o.maxApoios) break;
        if (usados.has(c.id) || !c.apoioActual) continue;

        let melhor = null, melhorNota = -Infinity;
        for (const ponto of pontos) {
            if (!longeDosOutros(ponto.x, ponto.z)) continue;
            const custo = Math.hypot(ponto.x - c.slotX, ponto.z - c.slotZ);
            if (custo > o.desvioMax) continue;
            const nota = notaPara(ponto, c);
            if (nota <= melhorNota) continue;
            melhorNota = nota;
            melhor = ponto;
        }
        if (!melhor) continue;

        usados.add(c.id);
        escolhidos.push({ id: c.id, x: melhor.x, z: melhor.z });
    }

    /*
    Leilao guloso para o resto: fecha primeiro o par de MAIOR NOTA, não o de
    menor custo. O `desvioMax` continua a ser um corte duro — a nota escolhe
    entre pontos alcançáveis, não autoriza travessias do campo.
    */
    const pares = [];
    for (const c of o.candidatos) {
        if (usados.has(c.id)) continue;
        for (let i = 0; i < pontos.length; i++) {
            const custo = Math.hypot(pontos[i].x - c.slotX, pontos[i].z - c.slotZ);
            if (custo > o.desvioMax) continue;
            pares.push({ id: c.id, i: i, nota: notaPara(pontos[i], c) });
        }
    }
    pares.sort((a, b) => b.nota - a.nota);

    for (const par of pares) {
        if (escolhidos.length >= o.maxApoios) break;
        if (usados.has(par.id)) continue;

        const ponto = pontos[par.i];
        // Dois apoios em cima um do outro nao sao duas opcoes, sao uma.
        if (!longeDosOutros(ponto.x, ponto.z)) continue;

        usados.add(par.id);
        escolhidos.push({ id: par.id, x: ponto.x, z: ponto.z });
    }

    return escolhidos;
}

/*
CORRIDA AO ESPACO (RUN_INTO_SPACE) — o movimento sem bola que faz a troca de
passes existir.

Medido antes de isto existir: no momento de cada passe havia em media 3.6
colegas a 10-22 m do portador e so 1.7 com linha de passe livre. Nao faltava
criterio na escolha do passe — faltava quem se oferecesse. A cadeia normal de
circulacao (RB -> CB -> CB -> LB -> CM ...) precisa de tres ou quatro linhas
abertas ao mesmo tempo, e elas nao existiam.

    distMin/distMax   a que distancia do portador vale a pena arrancar. Perto
                      demais nao abre linha nenhuma; longe demais e um passe
                      que ja nao esta ao alcance de ninguem.
    maxCorrida        comprimento maximo da corrida, em metros
    passeMin/Max      a que distancia do PORTADOR o destino tem de ficar: e
                      preciso que ele consiga la por a bola
    margemDestino     adversario mais perto do destino do que isto = nao esta
                      livre
    margemLinha       folga que a bola precisa para passar ao lado de alguem
                      na linha portador -> destino
    duracao           tecto de tempo; a corrida acaba antes se houver passe
                      (ver o case RUN_INTO_SPACE na fsm.js)
    arrefecimento     tempo minimo entre duas corridas do mesmo jogador
    ocupacaoMax       acima disto a celula nao esta livre, esta so menos cheia
*/
const RunIntoSpaceModel = {
    distMin: 8.0,
    distMax: 32.0,
    maxCorrida: 18.0,

    // O destino tem de ser SERVIVEL, e nao so vazio: a que distancia do
    // portador ele fica, e que folga a bola precisa para la chegar.
    passeMin: 10.0,
    passeMax: 22.0,
    margemDestino: 4.0,
    margemLinha: 2.0,
    duracao: 4.0,
    arrefecimento: 3.0,
    ocupacaoMax: 0.35
};

/*
O SECTOR MANDA NA LARGURA — multiplicador sobre o fecho do LineShape.

Medido antes disto: 32.3 m de largura de equipa com esq+dir, 32.3 m com cen,
31.2 m com esq. O botao "Setor do campo" nao mexia um centimetro em quem
estava onde: o `Tatics.setores` so era lido na escolha do destinatario do
passe (player.js) e na direccao da conducao (fsm.js). Quem POSICIONA — o
slotNoBloco — nunca tinha ouvido falar de sectores, e a equipa vivia num
bloco de 32 m em 68 m de campo, sempre, com qualquer combinacao.

Devolve um multiplicador para o `fecho` por linha (LineShape.fecho):

    esq+dir      1.15   pedidas as pontas: a equipa abre
    um flanco    1.10   abre, mas menos: e um lado so
    esq+cen+dir  1.00   os tres ligados nao pedem nada de especial
    flanco+cen   1.05   quase neutro
    cen          0.75   pedido o eixo: fecha

Pura: sem Match, sem Tatics, sem THREE.
*/
function fechoDoSector(setores) {
    if (!setores || !setores.length) return 1.0;

    const esq = setores.indexOf('esq') >= 0;
    const dir = setores.indexOf('dir') >= 0;
    const cen = setores.indexOf('cen') >= 0;
    const flancos = (esq ? 1 : 0) + (dir ? 1 : 0);

    if (flancos === 0) return cen ? 0.75 : 1.0;
    if (cen) return flancos === 2 ? 1.0 : 1.05;
    // 1.30/1.20 numa primeira versao: em campo os laterais abriam demais e
    // deixavam o corredor interior aberto (pedido explicito para fechar).
    return flancos === 2 ? 1.15 : 1.10;
}

/*
GEOMETRIA DO CANTO - onde fica a bola, quem bate e para onde ele olha.

`bolaX` e a coordenada x da bola quando saiu (so o SINAL conta: diz a quina);
`attDir` e a direccao de ataque de quem bate (a linha de fundo atacada).

Tres regras que se viam mal no ecra:

  bola     na quina, no chao (y = raio) e DENTRO das linhas - se passar de
           |z| = 53 a deteccao de linha de fundo volta a disparar.
  batedor  FORA do campo, atras da bola na linha que vai da area ate a quina.
           Estava a 1.5 m para DENTRO das duas linhas.
  alvo     o ponto da area para onde ele olha e centra. Sem isto o
           SET_PIECE_TAKER virava-o para a BOLA todos os frames e ele ficava
           de costas para a area.

Pura: sem Match, sem THREE.
*/
