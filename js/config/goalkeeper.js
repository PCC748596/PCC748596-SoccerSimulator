/*
=============================================================================
CONFIG: GUARDA-REDES
=============================================================================
Posicionamento, saídas da baliza, mergulho, defesa com as mãos e reposições.
=============================================================================
*/

const GoalkeeperStyle = {
    defensive: { depthMin: 1.2, depthMax: 6.0, sweepOut: 6.0 },
    offensive: { depthMin: 1.8, depthMax: 11.0, sweepOut: 20.0 }
};

// Referências da curva de profundidade: borda da grande área e meio-campo
// adversário. Entre elas a profundidade cresce; fora delas está saturada.
const GK_D_NEAR = typeof Area !== 'undefined' ? Area.profundidade : 16.5;
const GK_D_FAR = 55.0;

/*
Posição de ancoragem do guarda-redes, em repouso e a defender.

Função PURA de propósito: não lê Match nem window, só os cinco argumentos, e
por isso é testável isolada (ver tests/gk_anchor.test.js).

/*
Geometria e decisão do guarda-redes (gkAnchor, gkAlvoSegurando, gkPodeLancar,
gkSweepTarget) foram movidas para js/utils.js (ver docs/auditoria_config_match.md item 5).
*/

/*
Postura do guarda-redes.

Rotações em radianos. Convenção do esqueleto (ver resetBonesToDefault):
    perna  rotation.x > 0  →  coxa para TRÁS        (< 0 é para a frente, o chuto)
    joelho rotation.x > 0  →  perna dobra para trás (calcanhar sobe)
    peito  rotation.x > 0  →  tronco inclina para a FRENTE
    perna  rotation.z      →  abre as pernas para os lados

Ele tem três posturas, e antes tinha só uma — a de espera, exagerada e ligada a
toda a hora: peito a 0.45 (26° para a frente), joelhos a 0.9 (52°) e o corpo
descido 0.2 m. Ficava quase de joelhos, inclinado, mesmo a andar.
*/
const GoalkeeperPose = {
    // A que distância da própria baliza um adversário com bola o põe em alerta.
    alertaDist: 25.0,

    /*
    AGILIDADE A SAIR DA BALIZA. Multiplica o `speedLerp` do reposicionamento do
    GR (player.js, ramo 'idle'), que é a velocidade em m/s a que ele se desloca
    para o alvo — cortar a bola, fechar o ângulo, ir buscar uma bola solta.

    Os valores por situação continuam onde estavam (2.0 a reposicionar-se, 4.0
    num cruzamento, 5.5-6.0 numa bola solta na área, até 9.0 a reagir a um
    remate): isto escala-os todos de uma vez, para se afinar a agilidade num
    número só em vez de em oito sítios.

    `agilidadeSkill` faz o atributo GK contar: a 100 o guarda-redes sai
    `1 + agilidadeSkill` vezes mais depressa do que a 50, a 0 sai
    `1 - agilidadeSkill` vezes.
    */
    agilidade: 1.5,
    agilidadeSkill: 0.25,

    /*
    Só se atira ao chão se a bola passar a MAIS de tantos metros ao lado dele.
    Abaixo disto não há mergulho nenhum: fica de pé e leva as mãos à bola
    (estado 'maos'), dentro dos limites das juntas. Antes o limiar era 1.2 m e
    quase toda a defesa virava mergulho lateral — daí o guarda-redes aparecer
    sempre deitado/torcido de lado mesmo em bolas à altura do peito.
    */
    mergulhoLateralMin: 2.0,
    // Duração (s) do estado 'maos' antes de voltar ao idle.
    maosDur: 1.0,

    /*
    --- Tiro de meta -------------------------------------------------------
    A bola é colocada na quina da PEQUENA ÁREA do lado por onde saiu, o GR
    caminha até à linha de fundo atrás dela, faz a corrida e chuta.
    */
    // Meia-largura da pequena área: 5.5 m para cada lado de cada poste (LARGURA_BALIZA/2 + 5.5).
    pequenaAreaX: typeof Area !== 'undefined' ? Area.pequenaMeiaLargura : (LARGURA_BALIZA / 2 + 5.5),   // ~9.16
    pequenaAreaZ: typeof Area !== 'undefined' ? Area.pequenaProfundidade : 5.5,                        // profundidade a partir da linha
    tiroMetaAndar: 2.2,      // m/s a caminhar até à linha de fundo
    tiroMetaCorrer: 5.5,     // m/s na corrida para a bola
    tiroMetaRecuo: 3.8,      // metros atrás da bola onde fica antes de arrancar a corrida (+30cm)
    tiroMetaDistChuto: 0.85, // distância à bola em que dispara o gesto do chute
    // Segurança absoluta: se algo correr mal (posicionamento nunca completa,
    // etc.) chuta na mesma. Tem de caber posicionamento + espera de 3-6s +
    // corrida — era 6.0, insuficiente só para a espera nova.
    tiroMetaTimeout: 16.0,

    // Duração (s) do agachar-e-apanhar quando a bola chega mansa/rolando.
    apanharDur: 0.35,
    // Quanto tempo o GR fica a segurar a bola (agachado a levantar-se) antes
    // de poder relançar o jogo — dá tempo às equipas para se reorganizarem.
    segurarDur: 8.0,

    /*
    COM A BOLA NA MÃO, o guarda-redes deixa de ficar estátua: avança até
    `segurarAvanco` metros da própria linha enquanto procura linha de passe.

    O limite é bem aquém dos 16.5 m da grande área — com a bola na mão, sair
    dela é falta, e não vale a pena andar lá perto da fronteira.

    `segurarMinimo` é o tempo antes do qual não lança, mesmo com alvo à vista:
    é a folga que as duas equipas precisam para se reorganizarem depois da
    defesa. Sem ela o relançamento saía no frame seguinte ao da apanhada.
    */
    segurarAvanco: 10.0,
    segurarVel: 2.2,
    segurarMinimo: 1.5,

    // A andar ao longo da baliza a acompanhar o lance: de pé, passada curta.
    andar: {
        chest: 0.10,
        kneeBase: 0.18,     // dobra mínima, somada ao ciclo da passada
        passada: 0.55,      // fracção da amplitude de corrida de um jogador
        passadaJoelho: 0.32,// o joelho dobra menos do que a anca abre: é marcha, não corrida
        bracos: 0.55,       // abertura lateral dos braços
        altura: 0.0
    },

    // Adversário com bola perto da área: de pé, joelhos ligeiramente dobrados,
    // pernas afastadas e mãos prontas. À espera do remate.
    espera: {
        chest: 0.16,
        joelho: 0.32,
        coxa: 0.14,
        abertura: 0.13,
        bracoZ: 0.75,
        bracoX: -0.35,
        cotovelo: -0.35,
        altura: -0.05
    },

    // Posição para defender o penálti (Match.state === 'PENALTY'):
    // Um pouco agachado, joelhos para a frente, tronco direito (não inclinado).
    penalti: {
        chest: 0.05,
        joelho: 0.80,
        coxa: -0.80,
        abertura: 0.25,
        bracoZ: 0.90,
        bracoX: -0.35,
        cotovelo: -0.35,
        altura: 0.0
    },

    // Sem perigo: descontraído, praticamente direito.
    repouso: {
        chest: 0.05,
        joelho: 0.12,
        coxa: 0.05,
        abertura: 0.07,
        bracoZ: 0.45,
        bracoX: -0.10,
        cotovelo: -0.15,
        altura: 0.0
    },

    // Agachado a apanhar bola mansa/rolando (estado 'apanhar').
    apanhar: {
        chest: 0.55,
        joelho: 1.1,
        coxa: 0.75,
        abertura: 0.10,
        bracoZ: 0.30,
        bracoX: -0.9,
        cotovelo: -0.9,
        altura: -0.35
    },

    /*
    Bola agarrada junto ao PEITO, à espera de relançar (estado 'segurando').

    Tronco e pernas são os do `repouso` — de pé, direito, descontraído: já não
    fica meio agachado depois de apanhar a bola. Só os braços diferem: braços
    junto ao corpo (bracoZ baixo), para a frente/baixo (bracoX) e antebraços
    bem fechados PRA CIMA contra o peito (cotovelo muito dobrado) — é isso que
    "fecha a guarda" em cima da bola.
    */
    segurar: {
        chest: 0.05,
        joelho: 0.12,
        coxa: 0.05,
        abertura: 0.07,
        bracoZ: 0.05,
        bracoX: -0.76,
        cotovelo: -1.82,
        altura: 0.0
    }
};

/*
Condução (CARRY) — carregar a bola em frente com toques curtos.

O portador testa `leque` direcções à sua frente (em radianos, 0 = a direito
para a baliza adversária) e escolhe a de melhor nota. Quanto mais espaço livre,
maior é o toque à frente.
Visão de jogo: distância de leitura = técnica * 0.5, ângulo de visão = técnica * 0.7 graus.
*/
/*
=============================================================================
APARÊNCIA DOS JOGADORES
=============================================================================
Antes toda a gente saía do mesmo molde: pele 0xdcdde1, cabelo 0x2c1e16 e
chuteiras amarelas 0xe8ff00, iguais nos vinte e dois.

Cada tipo junta cabelo e pele que combinam — não se sorteiam em separado, senão
saía cabelo ruivo com pele escura. As chuteiras são independentes: qualquer
jogador pode calçar qualquer cor.

`peso` é a fatia relativa de cada tipo; não precisam de somar 1, a escolha
normaliza-os.
=============================================================================
*/

const GoalkeeperDistribution = {
    /*
    Probabilidade de SAIR A JOGAR pelos laterais, por Estilo Ofensivo da
    equipa. O resto é chutão para a frente.

    Estava tudo desligado (`laterais: 0.0`) e o `decidirSaidaGK` devolvia
    'chuteFrente' fixo — o guarda-redes chutava sempre, mesmo em Possession.
    A maquinaria da saída curta (acharLateralParaSaida, actPassParaAlvo) já
    existia toda e não era chamada por ninguém.

    Positional e Possession a 70%, como pedido. Os outros seguem a lógica do
    estilo: Direct e Counter Attack querem a bola à frente depressa, Wing Play
    fica a meio.
    */
    porEstilo: {
        possession: 0.70,
        positional: 0.70,
        wing_play: 0.50,
        direct: 0.25,
        counter_attack: 0.25
    },
    laterais: 0.50,       // usado se o estilo não estiver na tabela
    chuteFrente: 0.50,

    // Um defesa mais longe do que isto não conta como saída curta.
    distanciaMaxLateral: 45.0,
    // Defesa com adversário a menos disto em cima não serve.
    folgaMinima: 4.0,

    /*
    A saída curta aceita LATERAIS (LB/RB) e CENTRAIS (CB/DC), com preferência
    pelos laterais — ver acharLateralParaSaida em bt/player_bt.js.

    Só aceitava laterais, e com dois candidatos apenas (ambos obrigados a estar
    a mais de `folgaMinima` de qualquer adversário) era frequente não haver
    nenhum: o guarda-redes esperava `esperaMaxSemLinha` e acabava a chutar na
    mesma. A saída a jogar existia e quase não se via.

    `bonusLateral` é somado à folga do candidato: entre um lateral e um central
    igualmente livres sai pelo lateral, que é por onde se sai a jogar; o central
    entra quando é ele o que está mesmo desmarcado.
    */
    bonusLateral: 3.0,

    /*
    E UM LATERAL MESMO LIVRE NÃO CONCORRE COM NINGUÉM.

    O `bonusLateral` inclina, mas não impõe: com um central muito desmarcado e
    um lateral com folga confortável ganhava o central, e a bola saía pelo MEIO
    — a zona onde a perda custa golo, e o oposto de sair a jogar.

    A partir desta folga o lateral é a saída, sem nota nenhuma pelo meio: dez
    metros de espaço num corredor é a bola a sair em segurança.

    Tem de ficar acima da `folgaMinima`, senão qualquer lateral elegível
    ganhava sempre e a saída pelos centrais deixava de existir.
    */
    folgaPreferencialLateral: 10.0,

    /*
    Segundos com a bola no pé antes de largar. A saída curta é mais rápida do
    que o chutão: quem sai a jogar levanta a cabeça e toca, quem chuta arma a
    perna. E se decidiu sair a jogar mas não há lateral livre, espera
    `esperaMaxSemLinha` a ver se aparece antes de desistir e chutar — é isso
    que evita o guarda-redes preso com a bola.
    */
    esperaSaidaCurta: 0.5,
    esperaChutao: 0.4,
    esperaMaxSemLinha: 2.5
};

/*
Cruzamento.

Antes: `|x| > 17 && zona > 18` → cruzava SEMPRE (medido 100% em toda essa zona,
e 0% fora dela). Um extremo a x=16 nunca cruzava; a x=20 nunca fazia outra coisa.

Agora a decisão é pontuada: só existe cruzamento se houver alguém na área, e a
probabilidade sobe com o número de alvos lá dentro, com a largura e com a
profundidade de quem cruza. Junto à linha de fundo continua quase garantido.
Valores no referencial de ataque.
*/

const GoalkeeperDive = {
    tempoLer: 0.05,        // reacção: transferência de peso antes de sair
    tempoImpulso: 0.12,    // agachar e estender as pernas
    tempoChao: 0.35,       // deslizar no relvado depois de aterrar
    tempoLevantar: 0.75,   // pôr-se de pé

    vooMin: 0.28,          // duração mínima/máxima do voo (s)
    vooMax: 0.62,
    velLateral: 6.0,       // velocidade lateral base do salto (m/s)
    velLateralSkill: 4.0,  // ± conforme a skill de GK
    vySubidaMax: 4.5,      // velocidade vertical máxima do impulso (m/s)

    alcanceBraco: 0.75,    // quanto a mão chega além do corpo — o corpo não
    // precisa de percorrer a distância toda
    alturaDeitado: 0.42,   // y da origem do modelo com ele deitado de lado
    atritoChao: 3.5,       // desaceleração do deslize no relvado (m/s²)

    // Ângulo do tombo, por tipo de defesa. Uma bola rasteira não precisa de
    // deitar tanto como uma no ângulo.
    anguloMax: { baixo: 1.22, meio: 1.48, alto: 1.75 },   // 70° / 85° / 100°

    fracContacto: 0.55,    // fracção do voo em que a mão deve chegar ao alvo
    raioMao: 0.42,         // raio de contacto da mão com a bola
    // `apanhaBase` saiu daqui: quem decide agarrar/espalmar/roçar é o
    // GkCatchModel (mais abaixo), para os quatro tipos de defesa.

    /*
    ESPALMADA PARA FORA. A espalmada devolvia SEMPRE a bola ao campo
    (`ballVel.z *= -0.5`, o sinal invertido), e por isso nunca havia um canto
    ganho numa defesa — a saída mais comum de todas num remate colocado.

    Agora há duas: a bola perto do poste ou por cima do ombro sai PELA LINHA DE
    FUNDO (canto), o resto continua a voltar ao campo. Quem manda é a colocação
    do remate, não um sorteio.

    A posição da bola é empurrada para FORA da moldura no mesmo instante do
    toque. Sem isso a mão fica na linha de golo e o que se via era golo: a bola
    atravessava o plano da baliza nos milissegundos seguintes, ainda dentro dos
    postes, antes da velocidade nova a tirar de lá.
    */
    /*
    A menos disto do poste, a espalmada pode sair pela linha de fundo.
    1.1 -> 2.4: com 1.1 m era preciso a bola vir praticamente encostada ao
    ferro para o guarda-redes ter a opcao de a mandar para canto, e por isso
    quase tudo voltava ao campo. Os escanteios estao em 0.91 por jogo contra
    9.92 (9% do alvo) — a defesa para canto e a fonte mais natural deles.
    */
    espalmarForaMargem: 2.4,   // a menos disto do poste, a espalmada sai
    espalmarAltaY: 1.70,       // acima disto sai por cima do travessão
    espalmarFolga: 0.35,       // quanto passa por fora do poste/travessão
    espalmarLateral: 5.0,      // m/s que leva para lá do poste
    espalmarSubida: 5.0,       // m/s que leva por cima do travessão
    espalmarForaZ: 0.45,       // trava o avanço, MANTENDO o sentido (sai)
    ombroY: 1.35,          // altura do ombro acima da origem, de pé

    // Pose das pernas em voo: estendidas e ligeiramente abertas.
    coxaVoo: -0.25, joelhoVoo: 0.55, aberturaVoo: 0.18,

    pesoIK: 0.45           // suavização do IK dos braços por frame
};

/*
=============================================================================
DEFESA DO GUARDA-REDES — agarrar, espalmar, ou só roçar
=============================================================================
Havia TRÊS fórmulas para a mesma pergunta, cada uma escondida no seu ramo, com
bases e declives diferentes:

    mergulho (gk_dive.js)   0.35 + (GK − 50) / 100
    mãos ao corpo (player)  0.55 + (GK − 50) / 100
    salto alto (player)     0.40 + (GK − 50) /  80
    corpo (match.js)        agarra SEMPRE

Nenhuma sabia a que velocidade a bola vinha, nenhuma sabia se a mão estava ao
peito ou na ponta dos dedos, e nenhuma usava a TÉCNICA. Um remate a 26 m/s na
ponta dos dedos era tratado como um passe atrasado ao peito.

    P(agarrar) = base[tipo]
               + pesoGK  · (GK  − 50)/50
               + pesoTEC · (TEC − 50)/50
               − custoVel      · (v − vRef)/vRef
               − custoExtensao · extensao
               − custoAltura   · alturaAcimaDoPeito

`extensao` é 0 com a bola ao peito e 1 no limite do alcance da mão. É a
variável que mais faltava: uma bola na ponta dos dedos não se segura, por
melhor que seja o guarda-redes.

GK pesa pouco mais do dobro da TEC: a especialidade decide, a técnica é a mão
que fecha em cima.

TRÊS RESULTADOS, e o terceiro é o que faltava para o jogo ter rebotes a sério:

    agarra    fica com ela, jogo parado
    espalma   desvia-a; para onde depende da TÉCNICA (ver `qualidadeEspalmada`)
    roça      toca-lhe e ela segue quase na mesma — a defesa que não chega a
              ser defesa. Só aparece em bolas rápidas e no limite do alcance,
              que é onde acontece mesmo.

CALIBRAÇÃO: com um guarda-redes médio (GK 50, TEC 50) contra um remate médio
(v = vRef, extensão 0.5), a média dos quatro tipos dá ~65% de bolas agarradas.
Ver tests/gk_defesa.test.js, que mede isso e falha se sair da faixa.
=============================================================================
*/
/*
=============================================================================
RECUO COM O PE — o que o guarda-redes faz quando nao pode usar as maos
=============================================================================
A Lei 12 ja estava metade feita: um passe DELIBERADO com o pe de um companheiro
marca `Match.recuoParaGR` (ver executePassGameplay, fsm.js) e o
`maosProibidasNoRecuo` impede o guarda-redes de agarrar. A cabecada e a matada
no peito nao passam por esse caminho — que e exactamente a distincao da regra.

O que faltava era o DEPOIS: com as maos proibidas e a bola dentro da area, o
ramo que o mandava agarrar tinha um `else if (!maosProibidas)` e mais nada, por
isso ele chegava a bola e ficava parado em cima dela, com o adversario a chegar.

`distPressao`: com um adversario a menos disto, nao ha tempo para dominar e sair
a jogar — chuta-se para a frente, com o mesmo gesto e a mesma balistica do tiro
de meta (`kickFromGround`). Mais longe do que isso ele tem tempo, e o resto do
comportamento (sair a jogar, passe curto) continua a valer.
=============================================================================
*/
const GkRecuoModel = {
    distPressao: 5.0,
    // A que distancia da bola o guarda-redes ja lhe pode bater.
    distToque: 1.4
};

if (typeof window !== 'undefined') window.GkRecuoModel = GkRecuoModel;

const GkCatchModel = {
    /*
    Probabilidade base por TIPO de defesa, a v = vRef e extensão 0. É a mesma
    estrutura que as quatro fórmulas antigas tinham, agora explícita e com o
    mesmo declive para todas.
    */
    base: {
        corpo: 0.98,      // bola mansa ao corpo, dentro da área
        maos: 0.90,       // de pé, bola perto do tronco
        salto: 0.80,      // no ar, cruzamento ou bola alta
        mergulho: 0.68    // esticado, o mais difícil de segurar
    },

    pesoGK: 0.30,         // amplitude entre GK 0 e GK 100
    pesoTEC: 0.12,        // idem para a Técnica

    /*
    Velocidade de referência: um remate normal. Acima disto perde-se agarro,
    abaixo ganha-se — é o que separa segurar um passe atrasado de segurar um
    tiro.
    */
    vRef: 18.0,
    custoVel: 0.22,

    // Altura do peito do guarda-redes: é daqui para cima que a bola começa a
    // custar a segurar (acima da cabeça agarra-se com as pontas dos dedos).
    alturaPeito: 1.20,

    // Extensão do braço (0 ao peito, 1 no limite) e altura acima do peito.
    custoExtensao: 0.40,
    custoAltura: 0.10,

    // Nunca é certo nem impossível.
    minAgarra: 0.05,
    maxAgarra: 0.95,

    /*
    ROÇAR. Cresce com a velocidade acima de `rocarVMin` e com a extensão — a
    bola que passa a raspar na luva. Um guarda-redes melhor transforma mais
    roçares em espalmadas.
    */
    rocarVMin: 15.0,
    rocarEscalaV: 14.0,   // m/s acima do mínimo para saturar
    rocarPesoExt: 0.6,    // quanto a extensão pesa (o resto é a velocidade)
    rocarMax: 0.35,
    rocarPorGK: 0.60,     // reducao multiplicativa: GK 100 roca 60% menos

    // Desvio que um roçar dá à bola: quase nada, é isso que o define.
    rocarTravagem: 0.92,  // multiplicador da velocidade
    rocarDesvioMax: 1.2,  // m/s de desvio lateral

    /*
    QUALIDADE DA ESPALMADA, pela TÉCNICA. Decide PARA ONDE ela vai:

        alta   para fora (canto) ou para a lateral, longe do miolo
        baixa  rebote curto para o meio da área, com o avançado a chegar

    Era aleatória, e por isso não havia nem uma coisa nem outra de propósito.
    */
    /*
    Qualidade da espalmada: e ela que decide PARA ONDE a bola vai (ver
    destinoDaEspalmada em utils.js) — canto e lateral com qualidade alta,
    rebote curto ao meio com qualidade baixa.

    0.50 -> 0.62: com 0.50 metade das espalmadas caia a frente da baliza,
    disputavel. Um guarda-redes de tecnica media tira a bola do perigo bem
    mais vezes do que isso, e e essa a diferenca entre um rebote e uma defesa.
    */
    qualidadeBase: 0.62,
    qualidadePorTEC: 0.45
};
