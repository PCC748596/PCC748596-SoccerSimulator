/*
=============================================================================
CONFIG: TÁCTICAS E FORMAÇÕES
=============================================================================
Formações, blocos, linhas defensivas, estilos de jogo, mentalidade e controlos.
=============================================================================
*/

const GAME_SPEED = 0.9;

/*
Pausa (segundos reais) entre o fim de uma reposição e o recomeço do jogo:
pontapé de saída, tiro de meta, canto e qualquer resetPlay. Serve para o
espectador ver o campo já arrumado antes de a jogada arrancar, e para as
equipas acabarem de assentar nas posições novas.

No tiro de meta a contagem só arranca quando a bola fica pousada na quina da
pequena área (ver golKickBolaAlvo em match.js) — antes disso a reposição ainda
não terminou.
*/
const ESPERA_APOS_REPOSICAO = 3.0;

/*
Segundos entre o APITO do árbitro e a saída de bola. O apito autoriza a saída,
portanto tem de vir ANTES dela — e perto: dado na montagem do kickoff ficava os
3 s inteiros à frente do toque e lia-se como um apito solto, sem relação com o
lance. Ver o ramo `kickoffActive` no Match.update.
*/
const APITO_ANTES_DA_SAIDA = 1.0;

/*
=============================================================================
PRAZOS DE BOLA PARADA (DESENCRAVE / SEGURANÇA)
=============================================================================
Prazos máximos (em segundos reais) para cada lance de bola parada. Se o lance
não for executado dentro deste tempo (devido a interrupção, perda de batedor
ou bloqueio físico), o simulador força a retoma do jogo para evitar travamentos.
=============================================================================
*/
const SetPiecePrazos = {
    canto: 20.0,
    falta: 15.0,
    penalti: 15.0,
    lateral: 15.0,
    tiroDeMeta: 20.0
};

if (typeof window !== 'undefined') {
    window.SetPiecePrazos = SetPiecePrazos;
}

/*
Duração e escala do relógio de jogo:
45 minutos de tempo de jogo (2700s) = 10 minutos reais (600s).
Cada segundo real avança 4.5 segundos no relógio da partida.
*/
const MatchDuration = {
    halfGameMinutes: 45,
    halfRealMinutes: 10,
    gameSecondsPerRealSecond: 4.5,
    get timeScale() {
        return (typeof GAME_SPEED !== 'undefined' && GAME_SPEED > 0)
            ? (this.gameSecondsPerRealSecond / GAME_SPEED)
            : this.gameSecondsPerRealSecond;
    }
};

window.cameraMode = 'lateraltv';
window.cameraZoom = 1.0;
/*
Arranca EM PAUSA (pedido): o jogo abre parado e só corre quando se carrega
em Continue / ▶. Antes começava a jogar sozinho enquanto ainda se estavam a
mexer as definições do painel.
*/
window.isPaused = true;

const TeamSkills = {
    TeamA: { def: 80, mid: 80, ata: 80, gk: 80 },
    TeamB: { def: 80, mid: 80, ata: 80, gk: 80 }
};

/*
=============================================================================
ANDAMENTOS — andar, trotar, correr
=============================================================================
Havia UMA animação só. O `getRunPose` devolvia sempre a mesma amplitude
(anca ±1.1 rad = 63°, braços ±1.0), e a velocidade do jogador só mudava a
rapidez do ciclo: andar era correr em câmara lenta, com o mesmo passo enorme e
o mesmo tronco inclinado 17° para a frente.

Os três andamentos diferem em quase tudo, não só na cadência:

    a andar   passo curto, joelho quase direito, braços praticamente parados,
              tronco a prumo, sem fase de voo
    a trotar  passo médio, joelho a subir, braços dobrados a oscilar
    a correr  passo longo, calcanhar quase ao rabo, braços a bombear, tronco
              inclinado para a frente

`passada` é o avanço em metros por CICLO COMPLETO (dois passos) e é o que dá a
cadência: cadência = velocidade / passada. Antes o divisor era 3.0 fixo, o que
equivale a dizer que se dá o mesmo tamanho de passo a andar e a sprintar.

Os valores intermédios são interpolados, por isso a transição entre andamentos
não tem degraus.
=============================================================================
*/
/*
=============================================================================
DESLOCAÇÃO LATERAL — não se corre de frente andando de lado
=============================================================================
Um marcador tem o corpo virado para a bola (ver steerArrive em player.js) mas o
alvo dele é o homem: sempre que os dois não estão na mesma direcção, ele
deslocava-se de lado com o ciclo de passada frontal a tocar por cima. Lia-se
como um boneco a patinar.

Duas respostas, conforme a velocidade:

    devagar   fica virado para a bola e faz PASSO LATERAL — passada curta e
              pernas a abrir/fechar, que é o que um defesa faz mesmo.
    depressa  acima de `velViragem` ninguém se desloca de lado: o corpo roda
              para a direcção do movimento e volta ao ciclo normal. A cabeça
              e a cintura continuam a acompanhar a bola (até ±80°), portanto
              não se perde a bola de vista.

`anguloMin` é a partir de que desvio isto conta como lateral — abaixo disso é
uma corrida em frente com uma curva, e não se mexe em nada.
=============================================================================
*/
/*
VELOCIDADE DE GIRO do corpo, em 1/s (constante do slerp por segundo). Quanto
maior, mais depressa o jogador se vira para onde vai.

Estava escrita à mão em 5.5 dentro do steerArrive, o que dá uma constante de
tempo de ~0.18 s — a virar 180° o jogador levava perto de um segundo a acabar
o giro, e via-se a deslizar de lado durante a curva.

`base` é o giro normal; `comBola` é mais lento de propósito (conduzir e mudar
de direcção ao mesmo tempo é mais difícil do que virar sem bola), e o gesto de
passe/remate tem os seus próprios valores no fsm, que são ainda mais rápidos
porque ali a orientação faz parte da execução.
*/

const TeamShape = {
    /*
    Altura MÁXIMA da linha defensiva — que é a TRASEIRA do bloco (z0), e não
    uma linha calculada à parte. Enquanto eram dois cálculos independentes
    discordavam uns 10 m e o `holdOffsideLine` achatava a última linha toda
    no mesmo z. Ver computeBlock em team_bt.js.
    */
    linhaDefensiva: {
        low: -32.5,     // 4 m à frente da linha da grande área
        medium: -18.25, // a meio caminho entre a grande área e a linha central
        high: -2.0      // 2 m atrás da linha central
    },

    /*
    Tecto ABSOLUTO de avanço do CENTRO do bloco sem bola, por Defensive
    Pressure (painel
    esquerdo) — em metros no referencial de ataque (0 = meio-campo, +53 =
    baliza adversária). Substitui/limita o antigo comportamento de o bloco
    seguir literalmente `ballZ*dir`: numa reposição do GR adversário (bola
    lá no fundo do campo dele) o bloco tentava ficar "à frente da bola" e
    saltava quase até ao ataque, mesmo em Balanced.
    */
    // Construção: com a bola aquém deste Z, um médio desce a dar linha de passe.
    supportBallZ: -6.0,
    supportAhead: 9.0,    // quantos metros à frente da bola se oferece
    supportWide: 8.0      // e quanto abre para o lado, para abrir o corredor
};

/*
=============================================================================
O BLOCO — camada 1
=============================================================================
O nível 1 produz um RECTÂNGULO e mais nada. O nível 2 coloca cada jogador
dentro dele por percentagem, e o nível 3 decide o que ele faz.

Porquê um rectângulo em vez das fórmulas por posição que existiam:

    Todas as compressões eram `clamp(alvo, minimo, maximo)`. Um clamp PROJECTA
    toda a gente que está fora sobre o MESMO valor de fronteira — quatro
    jogadores acima do tecto saíam com z idêntico ao centímetro, e 10% dos
    alvos ficavam exactamente em x=28. Era isso que produzia os montes de
    jogadores no mesmo sítio.

    Com percentagens não há clamps: comprimir o bloco é encolher o rectângulo,
    e toda a gente encolhe junta mantendo a forma. A compacidade e a amplitude
    passam a ser um número cada, e não uma cascata de limites.

Tudo aqui em fracções, no REFERENCIAL DE ATAQUE:
    profundidade e recuo    fracção do comprimento do campo (106 m)
    largura e desvio        fracção da largura do campo (68 m)
=============================================================================
*/
// Rapidez com que o alvo de posicionamento persegue o valor calculado, em 1/s.
// 3.0 => ~0.33 s de constante de tempo.
const PositionSmoothing = 3.0;

const BlockShape = {
    /*
    Guarda-redes com a bola nas mãos: quanto se AFASTAM da baliza dele os dois
    blocos, em metros. Aplica-se aos dois lados na mesma direcção — a equipa do
    guarda-redes sobe esta folga, a adversária recua a mesma coisa — por isso o
    resultado é as duas ficarem mais longe de quem segura a bola, abrindo campo
    para o relançamento em vez de o jogo ficar amontoado à volta da área.
    */
    recuoGkComBola: 10.0,

    /*
    Tiro de meta: quanto os DOIS blocos se afastam da baliza onde a bola está,
    por cima do avanço de 10 m que o time que bate já tinha. Mesma ideia do
    recuoGkComBola, e aplicado da mesma maneira — o time que bate sobe, o que
    defende recua outro tanto.
    */
    avancoTiroMeta: 15.0,

    /*
    Profundidade do bloco (da última linha ao jogador mais avançado), por
    definição de compacidade do painel. A traseira deste rectângulo é a linha
    do fora-de-jogo da equipa — ver computeBlock em team_bt.js.
    */
    profundidade: {
        short: 30 / 106,          // 30 m — bloco curto
        mediumSmall: 40 / 106,    // 40 m — médio-curto
        median: 50 / 106,         // 50 m — bloco médio (padrão)
        mediumLarge: 60 / 106,    // 60 m — médio-longo
        large: 70 / 106           // 70 m — bloco longo
    },

    /*
    Profundidade MÍNIMA do bloco, em metros. Só entra quando o tecto da Linha
    Defensiva e a marca de penálti adversária não deixam espaço para a
    profundidade pedida (linha alta + bloco longo): aí a frente do bloco cede,
    e é isto que a impede de colapsar em cima da traseira. Ver computeBlock em
    team_bt.js.
    */
    profundidadeMinima: 20.0,

    /*
    AVANÇO E RECUO DO CENTRO DO BLOCO em relação à linha da bola, em metros e
    no referencial de ataque da equipa. É a Regra 4 do bloco:

        Team State  T.Offensive / Offensive  ->  +avancoDoCentroComBola  (bola
                                                 -> baliza ATACADA)
        Team State  T.Defensive / Defensive  ->  -recuoDoCentroSemBola  (bola
                                                 -> baliza DEFENDIDA)

    Estavam escritos à mão no `computeBlock` (`bb.isAttacking ? 5.0 : -5.0`) —
    o número que mais se afina no bloco todo e o único que não tinha manípula.
    O avanço com bola passou de 5 para 8 m a pedido.

    Não distinguem TRANSIÇÃO de fase instalada: quem lê isto é o `isAttacking`,
    que é um booleano de posse. Separar T.Offensive de Offensive obriga a ler o
    Team State, não a posse.
    */
    avancoDoCentroComBola: 8.0,
    recuoDoCentroSemBola: 5.0,

    /*
    NA TRANSICAO DEFENSIVA NINGUEM SOBE.

    Team State T.Defensive sao os primeiros 3 s depois de perder a bola (ver
    TeamBlackboard.tick). O bloco continua a ser desenhado a volta da BOLA, e
    se ela ficou no meio-campo adversario o slot de quem estava recuado fica a
    FRENTE dele — o jogador vai para a frente enquanto a equipa devia estar a
    recuperar. Medido: em media 0.8 jogadores com o alvo mais de 3 m a frente,
    e ate 8 no pior caso, sempre em T.Defensive.

    Com isto ligado, o slot de quem nao tem tarefa de bola nunca fica a frente
    do jogador durante a transicao: ele fica ou recua, nunca sobe. A postura e
    o bloco nao mudam — o que muda e so o SENTIDO permitido do movimento
    enquanto a equipa se reorganiza.

    `folgaTransicao` e o que se tolera antes de cortar (nem toda a subida de
    meio metro e uma subida).

    FICAM DE FORA quem vai a bola (chaser), quem intercepta e o guarda-redes:
    esses tem de poder ir para a frente, que e o que pressao quer dizer.
    */
    transicaoDefensivaRecuaSo: true,
    folgaTransicao: 1.0,

    /*
    SEM BOLA, NINGUEM PASSA A FRENTE DO BLOCO.

    A regra da transicao (`transicaoDefensivaRecuaSo`) so vale nos 3 s a seguir
    a perder a bola. Passados esses, na fase DEFENSIVE, media-se que continuava
    a haver gente a ir para a frente: pior caso **seis jogadores** com o alvo a
    frente de si a defender, e a fonte era quase toda a MARCACAO (34%) e o
    proprio bloco (31%).

    A marcacao esta certa em ir ao homem — o que esta errado e ir atras dele
    para LA DA FRENTE DO BLOCO. Um marcador que persegue o extremo ate ao
    meio-campo adversario deixou de estar a defender: passou o homem a quem
    vem atras, e e isso que esta regra impoe.

    E um LIMITE de nivel SEGURO (ver js/bt/alvo.js), portanto vale sobre a
    marcacao e sobre a estrutura, e cede a quem vai a bola — o chaser, o
    intercetor e o bloqueador tem de poder sair do bloco.

    `folgaFrenteDoBloco` e o que se tolera para la da frente: um passo.
    */
    limiteFrenteDoBlocoSemBola: true,
    folgaFrenteDoBloco: 2.0,

    /*
    E, SEM BOLA, DEFESAS E MEDIOS FICAM DO LADO DE CA DA BOLA.

    A frente do bloco (acima) nao chegava: o bloco a defender tem 30 m de
    fundura e a bola anda muitas vezes atras da frente dele, portanto um medio
    podia estar 16 m a frente da bola e continuar "dentro do bloco". Medido:
    **1,69 jogadores por frame com o alvo alem da bola** a defender, pior caso
    nove — 38% medios e 10% defesas.

    A regra e a mais velha do futebol: a defender, poe-te entre a bola e a tua
    baliza. Vale para `def` e `mid`; os avancados ficam de fora de proposito —
    sao a saida da equipa, e mandar toda a gente atras da bola e ficar sem
    ninguem quando ela e recuperada (51% dos casos medidos eram avancados, e
    esses estao certos).

    Como sempre, cede a quem vai a bola: chaser, intercetor e bloqueador.
    */
    limiteAlemDaBolaSemBola: true,
    folgaAlemDaBola: 1.5,
    recuamAlemDaBola: ['def', 'mid'],

    /*
    O PENDULO — ninguem fica na outra ponta do campo.

    O rectangulo tem 47.6 m de largura e o centro dele acompanha a bola em X,
    portanto os slots espalham-se ate 23.8 m para cada lado dela: com a bola
    numa ala, o homem do lado contrario fica na linha lateral oposta. Medido
    com a bola a mais de 12 m do eixo: o jogador mais afastado tinha o alvo a
    **27.5 m** da bola em X (pior caso 45.6 m), e em media **1.34** jogadores
    ficavam a mais de 25 m. Dali nao ha linha de passe nenhuma — e a queixa da
    figura 1.

    `distanciaMaxX` e o tecto de afastamento LATERAL a bola. Quem passa dele e
    puxado em x (so em x: a profundidade e do bloco) ate ao tecto. Nao e
    encolher o bloco — a largura continua a mesma; e nao deixar um jogador
    ficar fora do jogo pelo lado.

    Nao se aplica a quem tem tarefa de bola, e so com posse: sem bola, fechar o
    lado contrario entrega a ala ao adversario, que e outra conversa (ver
    deslocamentoDeCorredor).
    */
    penduloParaABola: true,
    distanciaMaxX: 22.0,

    /*
    O PENDULO NAO PODE EMBOLAR O LATERAL COM O EXTREMO.

    Medido depois de o ligar: o par lateral/extremo do mesmo lado passou a
    estar a menos de 4 m um do outro em 10% do tempo (era 4%). Puxar os dois
    para o lado da bola sem mais nada mete-os na mesma faixa.

    `separacaoLateral` e a distancia MINIMA em x entre os dois. Quem cede e o
    LATERAL — o extremo e que da a largura, e o lateral tem de ficar por
    dentro dele quando sobe, que e a forma como o par funciona no futebol.
    */
    separacaoLateral: 6.0,

    /*
    E O LATERAL NUNCA ENTRA POR DENTRO DO SEU CENTRAL.

    A separacao acima manda o lateral fechar por dentro do extremo quando os
    dois estao do lado da bola — e sem mais nada isso metia-o DENTRO da dupla
    de centrais: medido, **21,6% das leituras de lateral tinham-no por dentro
    dos centrais**, e 72% desses vinham do proprio slot do bloco. E a figura 2
    do relato: o lateral direito a esquerda dos centrais.

    `folgaDoCentral` e a faixa que fica entre o lateral e o central do lado
    dele. Abaixo disto ja nao ha linha de quatro, ha tres homens no mesmo
    sitio.
    */
    folgaDoCentral: 4.0,

    /*
    REST DEFENSE — o que fica em casa enquanto a equipa ataca.

    Nao existia (esta na lista de problemas conhecidos), e via-se: os centrais
    e o medio organizador subiam com a jogada e o adversario tinha 3 ou 4
    homens livres nas costas. Medido com a equipa a atacar: 0.76 adversarios
    sem NINGUEM entre eles e a nossa baliza, e tres ou mais em 12% do tempo.

    Duas regras, ambas so com posse:

      `defesasAtrasDaBola`  quantos jogadores de `role: 'def'` tem de ficar
                            atras da linha da bola. Sao os que estao mais
                            recuados; os outros sobem na mesma.
      `recuoDaBola`         quanto atras dela, no minimo.

    O organizador (o CM mais recuado) entra na mesma conta com
    `medioAtrasDaBola`: o medio que fica e o seguro contra o contra-ataque
    pelo meio, e era ele que aparecia na area adversaria.
    */
    restDefense: {
        defesasAtrasDaBola: 3,
        medioAtrasDaBola: 1,
        recuoDaBola: 3.0
    },

    /*
    O CORTE DE FORA-DE-JOGO TEM DE SER O ULTIMO A FALAR.

    A camada posicional ja o fazia (ver computeBlock/tickFinal), mas media-se e
    nao servia de nada: **9.4% dos alvos da equipa com bola estavam alem da
    linha, e 100% deles tinham sido escritos DEPOIS** — pela arvore (nivel 3)
    ou pelos estilos, que reescrevem o `dynamicTarget` em 45% das leituras. O
    corte do nivel 2 nunca vazava; o problema e que ninguem o respeitava a
    seguir.

    Agora ha uma guarda no fim do `PlayerAI.tick`, depois de as tres arvores
    correrem: e o unico sitio por onde todos os ramos passam.

    FICAM DE FORA, e cada um por uma razao:
      - quem tem a bola (nao ha fora-de-jogo com a bola nos pes);
      - quem vai a bola (chaser/intercetor): a bola nao esta impedida;
      - tudo o que nao seja jogo corrido (`Match.state !== 'PLAY'`): num
        lateral, num canto ou num pontape de baliza nao ha fora-de-jogo.

    `folga` e o meio metro de margem com que a camada posicional ja cortava.
    */
    cortarForaDeJogoNoAlvo: true,
    folgaForaDeJogo: 0.5,

    /*
    O RESOLVEDOR DE ALVOS (js/bt/alvo.js) — as prioridades.

    `false` volta ao comportamento antigo: cada camada escreve o alvo e ganha
    quem escrever por ultimo. Existe para se poder medir a diferenca com o
    mesmo binario, que e como se percebe se uma regra nova ajuda ou atrapalha.
    */
    resolverAlvoActivo: true,

    /*
    Largura do bloco. É a amplitude da equipa — a manípula que o senhor pediu:
    um número só, e todas as posições abrem ou fecham em proporção.
    */
    amplitude: {
        short: 0.60,          // 60%
        median: 0.70,         // 70%
        large: 0.80           // 80%
    },

    /*
    JÁ NÃO É LIDO. Era a fracção da posição lateral da bola que o centro do
    bloco acompanhava — com a bola em x = 20 e `median`, o centro ia a x = 14.
    O centro em X passou a seguir a bola 1:1 (ver computeBlock), porque o bloco
    a andar menos do que a bola é o que deixa o portador sozinho na borda.

    Fica aqui, e não apagado, para quem quiser voltar a atenuar saber onde
    estava — mas hoje mexer nestes números não faz nada.
    */
    basculacao: {
        short: 0.60,
        median: 0.70,
        large: 0.80
    },

    /*
    SEGUIMENTO DA BOLA pelo centro do bloco, nos dois eixos, em 1/s (ver
    seguirBola em utils.js). 3.0 dá uma constante de tempo de 1/3 de segundo:
    com a bola a 10 m/s o centro fica ~3.3 m atrás dela, o suficiente para
    filtrar ressaltos sem o bloco se arrastar.

    Isto era feito pelo `momentumZ`, com constantes de MOMENTUM: 2.5 s a
    defender e 4.0 s com a bola a recuar, ou seja 25 a 40 m de atraso à
    velocidade de um passe. Momentum é o lado do campo (eixo X); o seguimento
    da bola ao longo do campo é outra coisa e tem outro ritmo.
    */
    seguimentoBola: 3.0,

    /*
    LIMITES DO RECTÂNGULO — as linhas do campo, e mais nada.

    O bloco desloca-se inteiro para dentro do campo quando bate numa linha;
    NUNCA muda de tamanho. Encolher aproximaria as linhas da equipa umas das
    outras sem ninguém ter mexido na compacidade, que é a única manípula que
    deve mudar a dimensão do bloco.

    Não há margens de segurança nem travões intermédios. Havia três, e cada
    um afastava o rectângulo das linhas:

        margemLateral 0.94  parava o bloco a 2 m da linha lateral
        margemFundo   0.94  parava-o a 3.2 m da linha de fundo
        recuoMax      -42   parava a traseira na marca de grande penalidade,
                            11 m antes da própria linha de fundo

    O centro do bloco segue a bola 1:1 nos dois eixos até a borda tocar a
    linha; daí em diante fica encostado a ela.
    */
};

/*
=============================================================================
AJUSTE POR LINHA — camada 2
=============================================================================
Depois de o rectângulo estar posto, cada linha desloca-se dentro dele.

`v` é a profundidade dentro do bloco: 0 = última linha, 1 = frente do bloco.
A posição de base normalizada da formação dá o v de partida; estes valores
deslocam-no para a frente ou para trás conforme a linha e conforme a equipa
tem ou não a bola.

Cada valor é um DESLOCAMENTO em v, somado ao v da formação. Não é um lerp
para um alvo comum: `v = lerp(slot.v, alvo, empurrar)` com `empurrar` até
0.80 projectava a linha toda quase no mesmo sítio — num 4-4-2 os 5.3 m que
separam lateral de central ficavam em 0.5 m em campo, e a formação táctica
deixava de existir dentro do bloco. Com um deslocamento a linha sobe e desce
inteira e o espaçamento interno da formação mantém-se.

Com bola os médios sobem mas não tanto como os avançados — era o problema de
o meio-campo ficar vazio. Sem bola toda a gente recua e a equipa junta-se.
=============================================================================
*/
const LineShape = {
    def: { comBola: 0.05, semBola: -0.03 },
    mid: { comBola: 0.01, semBola: -0.07 },
    atk: { comBola: -0.04, semBola: -0.13 },

    /*
    Estreitamento lateral por linha (multiplica o u em torno do eixo).

    Uma última linha fecha mais do que um meio-campo quando não tem a bola: é a
    diferença entre tapar o caminho da baliza e cobrir a largura toda.
    */
    fecho: {
        def: { comBola: 0.92, semBola: 0.78 },
        mid: { comBola: 1.00, semBola: 0.88 },
        atk: { comBola: 1.00, semBola: 0.80 }
    }
};

/*
Ajuste fino por POSIÇÃO ESPECÍFICA, por cima do LineShape (que só
diferencia por linha: def/mid/atk). A diferença de profundidade entre
lateral e central já vem da formação (o LineShape passou a deslocar em vez
de projectar num alvo comum); isto é o ajuste POR CIMA dela — um médio de
ponta sobe mais do que um médio central quando a equipa tem bola, para dar
opção de passe na construção final.

Valor em fracção de v (0..1 da última linha à frente do bloco).
*/
const PositionDepthNudge = {
    LB: { comBola: 0.04, semBola: 0.0 },
    RB: { comBola: 0.04, semBola: 0.0 },
    RM: { comBola: 0.08, semBola: 0.0 },
    LM: { comBola: 0.08, semBola: 0.0 }
};

/*
Playing style do lateral (LB/RB) — só actua com bola: sem bola ambos os
estilos ficam na mesma linha defensiva (ver slotNoBloco em team_bt.js).

    defensive  fica atrás, quase não sobe mesmo com a equipa a atacar.
    offensive  sobe pelo corredor a dar apoio quando a equipa tem bola.

    comBolaMult  multiplica o PositionDepthNudge.comBola do lateral (ajuste
                 fino da profundidade dentro do bloco).
    avancoMax    metros à frente do alvo do PositionBT que ele pode ganhar
                 quando o corredor está livre (ver attackFullBack). É este
                 que manda: o comBolaMult sozinho valia ~1-3 m e não dava
                 subida nenhuma que se visse.
    recuo        metros que recua quando o corredor está tapado.
*/
const FullBackStyle = {
    defensive: { comBolaMult: 0.3, avancoMax: 2.0, recuo: 3.0 },
    offensive: { comBolaMult: 1.8, avancoMax: 15.0, recuo: 3.0 },
    // Full-back Finisher: sobe como o offensive, mas fecha para o eixo em vez
    // de ficar colado à linha — "joining the attack in high central areas".
    finisher: { comBolaMult: 1.8, avancoMax: 15.0, recuo: 3.0 }
};

/*
=============================================================================
PLAYING STYLES — traços por jogador
=============================================================================
Cada estilo é um conjunto de MODIFICADORES numéricos, não um ramo de código
próprio. Isso é de propósito: 20 estilos com 20 caminhos especiais seriam
impossíveis de afinar e de manter coerentes entre si. As folhas do PositionBT
e do PlayerBT lêem sempre os mesmos campos; o estilo só muda os números.

Campos (todos opcionais, `EstiloBase` dá os valores neutros):

  POSICIONAMENTO (metros, no referencial de ataque)
    avanco        + sobe / − recua em relação ao slot do bloco
    largura       + abre para a linha lateral / − fecha para o eixo
    avancoComBola avanço EXTRA só quando a equipa tem a bola
    amplitudeZ    quanto o jogador se estica em profundidade (box-to-box)

  COMPORTAMENTO (multiplicadores, 1.0 = neutro)
    passe         peso dele como alvo de passe (findPassTarget)
    remate        peso da decisão de rematar
    cruzar        peso da decisão de cruzar
    lancar        peso da decisão de lançar
    conduzir      peso da decisão de conduzir em vez de passar
    pressao       agressividade no desarme/carrinho e aderência na marcação
    cadencia      multiplica o tempo de domínio antes de decidir

  BANDEIRAS
    ombroDefesa   posiciona-se na linha do último defensor (fora-de-jogo no limite)
    dentroArea    não sai da grande área adversária
    seguraBola    aguenta a bola de costas em vez de decidir depressa
    atraiDefesa   corre PARA LONGE da bola a puxar marcação
    cortaParaDentro  vindo da ala, fecha para o eixo ao receber
    colaNaLinha   fica encostado à linha lateral
    juntaSeAoAtaque  defesa que sobe ao ataque

  posicoes      onde o estilo pode ser escolhido (validação/UI)
=============================================================================
*/
/*
=============================================================================
AFINAÇÃO DE ESTILOS COM COMPORTAMENTO PRÓPRIO
=============================================================================
Dois estilos deixaram de ser só modificadores de posição e passaram a ter
dinâmica no tempo. Os números vivem aqui.

FOX IN THE BOX. O gatilho pedia a bola a mais de 12 m dentro do meio-campo
adversário, e medido em jogo isso é **2% dos frames em posse**: o estilo quase
nunca estava ligado, e ele ficava no slot puro a 25 m da área. Agora liga a
partir do meio-campo, e a profundidade acompanha a bola — espera
`esperaAtras` metros à frente dela, nunca aquém da entrada da área, nunca além
de `avancoMax` (senão ficava em cima do guarda-redes).

DUMMY RUNNER. A corrida de desmarque não tinha fim: enquanto a equipa
atacasse, ele ficava permanentemente aberto na ponta a `largura` metros do
slot, longe de tudo. Uma corrida de arrastamento é um GESTO, não uma posição:
dura `duracao` segundos e depois ele volta às acções normais, com `descanso`
segundos antes de a poder repetir.
=============================================================================
*/
const PlayingStyleTuning = {
    foxInTheBox: {
        entradaArea: 30.0,   // nunca espera mais atrás do que isto
        esperaAtras: 8.0,    // metros à frente da bola, enquanto ela não chega
        avancoMax: 46.0,     // e nunca além disto (linha de fundo aos 53)

        /*
        O QUADRADO CENTRAL DA ÁREA É A CASA DELE.

        A escolha do x era um leque de -16 a +16 (o `melhorVaoX`), portanto o
        vão mais vazio podia ser junto ao poste ou já fora dos ferros: um Fox
        in the Box encostado à linha da área grande, a 16 m do eixo, não está
        onde os golos se marcam.

        Agora o leque começa no quadrado central (`meiaLarguraCentral`, ±7 m —
        pouco mais do que a largura da baliza) e só abre para os lados quando
        lá dentro não há vão nenhum livre. `bonusCentral` é o desconto que o
        quadrado leva na comparação, para empates irem sempre para o meio.
        */
        meiaLarguraCentral: 7.0,
        bonusCentral: 3.0
    },

    dummyRunner: {
        duracao: 6.0,        // segundos de corrida
        descanso: 4.0,       // e antes de poder arrancar outra
        /*
        Só arranca com a jogada viva à frente dele — uma corrida de
        arrastamento com a bola na própria defesa não arrasta ninguém.
        */
        bolaAvancoMin: -15.0,

        /*
        A CORRIDA PUXA PARA O LADO DA JOGADA, não para a outra ponta.

        Estava a correr para o `ladoEst * 15` (o lado do posto dele) quando o
        portador estava no eixo, e a AFASTAR-SE 7 m do portador quando ele
        estava numa ala. Com a jogada na direita e o posto dele à esquerda,
        arrancava para a extrema esquerda: puxava marcação, sim, mas para um
        sítio de onde não participa da jogada e onde a linha de passe já não
        existe. É o defeito do relato.

        O objectivo do Dummy Runner é levar o marcador com ele PERTO da
        jogada — o espaço que ele abre só serve se alguém o puder usar, e a
        bola tem de conseguir lá chegar.

        `lateralDoPortador` é a distância em x a que ele corre do portador (do
        lado de fora, para arrastar o central para a ala do lance);
        `distanciaMax` é o tecto de afastamento — acima disto a corrida deixa
        de ser uma opção de passe.
        */
        lateralDoPortador: 9.0,
        distanciaMax: 22.0,
        profundidadeMin: 6.0
    }
};

const EstiloBase = {
    avanco: 0, largura: 0, avancoComBola: 0, amplitudeZ: 1.0,
    passe: 1.0, remate: 1.0, cruzar: 1.0, lancar: 1.0, conduzir: 1.0,
    pressao: 1.0, cadencia: 1.0,
    ombroDefesa: false, dentroArea: false, seguraBola: false,
    atraiDefesa: false, cortaParaDentro: false, colaNaLinha: false,
    juntaSeAoAtaque: false
};

const PlayingStyles = {
    /* --- Avançados ------------------------------------------------------- */
    goal_poacher: {
        nome: 'Goal Poacher', posicoes: ['CF', 'SS'],
        avancoComBola: 4, remate: 1.35, conduzir: 0.7, cadencia: 0.7,
        ombroDefesa: true
    },
    dummy_runner: {
        nome: 'Dummy Runner', posicoes: ['CF', 'SS', 'AM'],
        avancoComBola: 6, largura: 5, passe: 1.3, remate: 0.9,
        atraiDefesa: true
    },
    fox_in_the_box: {
        nome: 'Fox in the Box', posicoes: ['CF'],
        driblar: 0.4,
        avancoComBola: 6, remate: 1.5, conduzir: 0.5, lancar: 0.6, cadencia: 0.6,
        dentroArea: true
    },
    target_man: {
        nome: 'Target Man', posicoes: ['CF'],
        driblar: 0.5,
        passe: 1.25, conduzir: 0.6, cadencia: 1.6,
        seguraBola: true
    },

    /* --- Criativos ------------------------------------------------------- */
    creative_playmaker: {
        nome: 'Creative Playmaker', posicoes: ['SS', 'LW', 'RW', 'AM', 'LM', 'RM'],
        driblar: 1.4,
        passe: 1.3, lancar: 1.5, conduzir: 1.15, cadencia: 0.85
    },
    classic_no10: {
        nome: 'Classic No. 10', posicoes: ['SS', 'AM', 'CM'],
        avanco: -3, passe: 1.4, lancar: 1.35, conduzir: 0.55, cadencia: 1.3,
        amplitudeZ: 0.7
    },
    hole_player: {
        nome: 'Hole Player', posicoes: ['SS', 'AM', 'LM', 'RM', 'CM'],
        avancoComBola: 9, remate: 1.2, amplitudeZ: 1.3
    },

    /* --- Alas ------------------------------------------------------------ */
    prolific_winger: {
        nome: 'Prolific Winger', posicoes: ['LW', 'RW'],
        driblar: 1.5,
        // "abre pelas pontas, e mesmo que o jogo vá para o meio ele fica
        // mais aberto na ponta esperando a bola para poder cruzar" — nunca
        // fecha, cola na linha (mesmo mecanismo do Cross Specialist).
        largura: 4, remate: 1.2, cruzar: 1.1,
        colaNaLinha: true
    },
    roaming_flank: {
        nome: 'Roaming Flank', posicoes: ['LW', 'RW', 'LM', 'RM'],
        driblar: 1.4,
        // "abre pelas pontas, mas se o jogo vai para o meio ele fecha mais
        // para dar opção de passe" — fecha com a bola CENTRAL, não fundo.
        largura: -4, passe: 1.15, conduzir: 1.2,
        fechaComBolaCentral: true
    },
    cross_specialist: {
        nome: 'Cross Specialist', posicoes: ['LW', 'RW', 'LM', 'RM'],
        largura: 7, cruzar: 1.6, conduzir: 0.9, remate: 0.7,
        colaNaLinha: true
    },

    /* --- Meio-campo ------------------------------------------------------ */
    box_to_box: {
        nome: 'Box-to-Box', posicoes: ['AM', 'LM', 'RM', 'CM', 'DM'],
        amplitudeZ: 1.5, avancoComBola: 5, pressao: 1.2,
        travaNaEntradaArea: true // "da entrada de uma área até a entrada da outra" — não passa da entrada
    },
    the_destroyer: {
        nome: 'The Destroyer', posicoes: ['CM', 'DM', 'CB'],
        driblar: 0.4,
        avanco: -2, pressao: 1.6, conduzir: 0.6, lancar: 0.7, amplitudeZ: 0.85
    },
    orchestrator: {
        nome: 'Orchestrator', posicoes: ['CM', 'DM'],
        driblar: 0.5,
        avanco: -5, passe: 1.35, lancar: 1.4, conduzir: 0.7, cadencia: 1.2
    },
    anchor_man: {
        nome: 'Anchor Man', posicoes: ['DM'],
        driblar: 0.3,
        avanco: -7, pressao: 1.25, lancar: 0.5, conduzir: 0.5, amplitudeZ: 0.6
    },

    /* --- Defesas --------------------------------------------------------- */
    build_up: {
        nome: 'Build Up', posicoes: ['CB'],
        avanco: -4, passe: 1.3, lancar: 1.2, cadencia: 1.25
    },
    extra_frontman: {
        nome: 'Extra Frontman', posicoes: ['CB'],
        /*
        SEM `amplitudeZ`. Tinha 1.4, e amplitudeZ é o afastamento ao CENTRO do
        bloco: num central, que está na aresta de trás, > 1 empurra-o para LONGE
        da baliza adversária — o contrário do nome do estilo — e para fora do
        rectângulo, porque nada volta a limitá-lo ao bloco depois
        (ver aplicarEstiloPosicional em playing_styles.js e o clamp de ±50 m
        em tickFinal). Era isso que se via como uma linha comprida do slot do
        CB até um canto do campo.

        Este central sobe ao ataque só na BOLA PARADA, para compor a área e
        disputar o cabeceio — não em jogo corrido. Quem o põe lá é a ordenação
        do canto em setupSetPiece (match.js), via `juntaSeAoAtaque`; em jogo
        corrido ele posiciona-se como um central normal.
        */
        remate: 1.2,
        juntaSeAoAtaque: true
    },
    offensive_fullback: {
        nome: 'Offensive Full-back', posicoes: ['LB', 'RB'],
        // Antes só subia via attackFullBack (nível 2), condicional a corredor
        // livre + equipa a atacar — sem isso ficava preso na linha, apesar
        // do estilo. `avanco` é base, sempre activo, contraparte do -2 do
        // defensive_fullback.
        avanco: 4, avancoComBola: 12, cruzar: 1.25, colaNaLinha: true
    },
    fullback_finisher: {
        nome: 'Full-back Finisher', posicoes: ['LB', 'RB'],
        avanco: 4, avancoComBola: 12, largura: -5, remate: 1.2, cruzar: 0.8,
        cortaParaDentro: true
    },
    defensive_fullback: {
        nome: 'Defensive Full-back', posicoes: ['LB', 'RB'],
        avanco: -2, pressao: 1.2, cruzar: 0.7
    },

    /* --- Guarda-redes ---------------------------------------------------- */
    offensive_gk: { nome: 'Offensive Goalkeeper', posicoes: ['GK'] },
    defensive_gk: { nome: 'Defensive Goalkeeper', posicoes: ['GK'] }
};

/*
Estilo por omissão de cada posição, usado no arranque (ver assignFormations).
São escolhas neutras: o estilo "normal" daquela posição, não o mais exótico.
*/
/*
Entradas com lista (não string): estilo varia pelo índice do jogador entre os
da mesma posição nesta formação — ver aplicarPlayingStyle em match.js. Pedido
explícito: CM(1)/CM(2) e CF(1)/CF(2) não são clones, cada um cobre um papel.
*/
const EstiloPorOmissao = {
    GK: 'defensive_gk',
    CB: ['build_up', 'extra_frontman'], LB: 'offensive_fullback', RB: 'offensive_fullback',
    DM: 'anchor_man', CM: ['box_to_box', 'orchestrator'], AM: 'classic_no10',
    LM: 'roaming_flank', RM: 'roaming_flank',
    LW: 'prolific_winger', RW: 'prolific_winger',
    CF: ['fox_in_the_box', 'dummy_runner'], SS: 'creative_playmaker'
};

/*
Modelo de remate.

A regra antiga era `distToGoal < max(18, ata/100*22)`: entre skill 50 e 81 o
resultado era sempre 18 m, ou seja o slider ATACANTES não fazia nada. Isto é
monótono e, a skill 80 (o valor por omissão), dá os mesmos 18 m de antes.

O ângulo passa a contar: rematar de 15 m junto à linha lateral não é o mesmo
que de 15 m em frente à baliza.
*/

const MentalidadeModel = {
    /*
    Quanto do `blocoZ` passa para a ÂNCORA DA ÚLTIMA LINHA (ver computeBlock em
    team_bt.js). O botão Linha Defensiva continua a ser o controlo grosso; isto
    inclina-o com a Mentalidade.

    Sem isto a Mentalidade não mexia nos defesas de todo: a âncora da traseira
    vem do painel e tem a última palavra, e o `blocoZ` só movia o centro do
    rectângulo.
    */
    pesoNaLinha: 0.5,

    /*
    `tectoBloco` JÁ NÃO É LIDO pelo computeBlock: corria no fim e desfazia o
    seguimento da bola (era ele que prendia o bloco no meio-campo com a bola no
    terço de ataque). A Mentalidade fala uma vez, pelo `blocoZ`.

    `blocoZ` desloca o centro do bloco em relação à BOLA; `tectoBloco` era o mais
    longe que esse centro pode ir, medido do meio-campo, no referencial de
    ataque.

    O tecto era do Defensive Pressure (TeamShape.pressaoLineCap, removido), e
    por isso a Mentalidade não tinha palavra nenhuma sobre até onde a equipa
    subia: com Equilibrada e pressão Balanced o bloco ia buscar a bola a 17.7 m
    DENTRO do meio-campo adversário. O Defensive Pressure passou a ser a
    distância de marcação (ver MarkingModel.distanciaPorPressao).

    Frações do meio-campo (53 m): um terço, um sexto, zero, um terço, dois
    terços.
    */
    /*
    `profundidade` (opcional) é o comprimento do bloco que a MENTALIDADE impõe,
    por cima da escolha do Length Compactness no painel. Só as duas defensivas
    o têm: uma equipa que se põe atrás joga curta, e deixá-la esticada a 50 m
    contradizia a própria mentalidade escolhida. As outras três continuam a
    obedecer ao painel.

    A LARGURA fica de fora de propósito: fechar em largura entrega as alas, e
    isso é escolha do utilizador no Width Compactness — não uma consequência
    automática de escolher uma mentalidade defensiva.

    Chave do BlockShape.profundidade — `short` são 30 m em 106 de campo.
    */
    muito_defensiva: {
        agressao: 0.20,
        blocoZ: -10.0,
        tectoBloco: -(CAMPO_COMP / 2) / 3,
        profundidade: 'short',
        pressao: 'low'
    },
    defesa: {
        agressao: 0.35,
        blocoZ: -5.0,
        tectoBloco: -(CAMPO_COMP / 2) / 6,
        profundidade: 'short',
        pressao: 'low'
    },
    balanceado: {
        agressao: 0.50,
        blocoZ: 0.0,
        tectoBloco: 0.0,
        pressao: 'balanced'
    },
    ataque: {
        agressao: 0.65,
        blocoZ: 7.0,
        tectoBloco: (CAMPO_COMP / 2) / 3
    },
    muito_ofensiva: {
        agressao: 0.80,
        blocoZ: 12.0,
        tectoBloco: (CAMPO_COMP / 2) * 2 / 3
    }
};

/*
TEAM PLAY STYLE — como a equipa prefere progredir, não ONDE cada jogador
fica (isso é Playing Style). Cada campo é um MULTIPLICADOR (1.0 = neutro)
sobre pesos já existentes:

    circulacao      peso do passe pra trás/lateral quando o lado da bola
                     está congestionado (findPassTarget, player.js)
    verticalidade   peso do bónus de progressão vertical (idem)
    viradas         peso extra quando o passe muda de lado com espaço lá
    corredores      peso do bónus de sector lateral (Tatics.setores)
    cruzamento      multiplica a chance de cruzamento (findCross, player_bt.js)
    pressaoPosPerda multiplica a reacção depois de perder a bola — menor
                     valor = reage mais depressa (pickChaser, team_bt.js)
    conducao        multiplica o ORÇAMENTO de condução (CarryModel.distanciaMax
                     e distanciaMaxDefesa, ver campoAberto em player_bt.js):
                     quantos metros o portador leva a bola antes de o ramo de
                     espaço aberto deixar de o servir e ele ter de passar.
                     Só no contra-ataque é que correr com a bola é o plano;
                     em Possession e Positional o plano é tocar.
*/
const TeamPlayStyles = {
    possession: {
        nome: 'Possession',
        circulacao: 1.9, verticalidade: 0.6, viradas: 1.3,
        corredores: 0.9, cruzamento: 0.9, pressaoPosPerda: 1.0,
        conducao: 0.45
    },
    direct: {
        nome: 'Direct',
        circulacao: 0.65, verticalidade: 1.4, viradas: 0.7,
        corredores: 1.0, cruzamento: 1.0, pressaoPosPerda: 1.0,
        conducao: 1.0
    },
    counter_attack: {
        nome: 'Counter Attack',
        circulacao: 0.8, verticalidade: 1.25, viradas: 0.9,
        corredores: 1.0, cruzamento: 1.0, pressaoPosPerda: 0.8,
        conducao: 1.75
    },
    wing_play: {
        nome: 'Wing Play',
        circulacao: 1.1, verticalidade: 0.9, viradas: 1.1,
        corredores: 1.5, cruzamento: 1.4, pressaoPosPerda: 1.0,
        conducao: 0.9
    },
    positional: {
        nome: 'Positional',
        circulacao: 1.5, verticalidade: 0.75, viradas: 1.15,
        corredores: 1.1, cruzamento: 1.0, pressaoPosPerda: 1.0,
        conducao: 0.55
    },
};

const Tatics = {
    formacaoA: '442',
    formacaoB: '442',
    estilo: 'balanceado',
    teamPlayStyle: 'positional',
    linhaDefensiva: 'medium',
    compactness: 'median',
    lengthCompactness: 'median',
    pressaoDefensiva: 'balanced',
    setores: ['esq', 'dir'],

    // Cada sector liga/desliga independentemente agora (antes era sempre
    // exactamente 2 de 3, um forçava o outro a sair) — nunca deixa ficar
    // com zero activos.
    toggleSector: function (sector) {
        const idx = this.setores.indexOf(sector);
        if (idx >= 0) {
            if (this.setores.length <= 1) return;
            this.setores.splice(idx, 1);
        } else {
            this.setores.push(sector);
        }
        const el = document.getElementById('sec-' + sector);
        if (el) el.classList.toggle('active', this.setores.includes(sector));
        // O contador do rótulo era estático no HTML ("Setor do campo (2)") e
        // nunca acompanhava os botões.
        const lbl = document.getElementById('lbl-setores');
        if (lbl) lbl.textContent = 'Setor do campo (' + this.setores.length + ')';
        Match.assignFormations();
    },

    /*
    SECTOR DE CAMPO: a que faixa pertence um X, no referencial de ATAQUE
    (x * dirZ). A convenção dos 10 m já vivia em PassTypeModel.larguraCentro e,
    copiada à mão, dentro de findPassTarget (player.js). Agora é uma só.
    */
    sectorDeX: function (x, dirZ) {
        const xAtk = x * dirZ;
        if (xAtk < -10) return 'esq';
        if (xAtk > 10) return 'dir';
        return 'cen';
    },

    /*
    Retorna a prioridade (0 a 1) do setor, baseada em quantos estão ativos.
    */
    prioridadeSector: function (sector) {
        const activeCount = this.setores.length;
        if (activeCount === 0 || activeCount === 3) return 0.333;

        const isActive = this.setores.includes(sector);
        if (activeCount === 1) {
            return isActive ? 0.60 : 0.20;
        }
        if (activeCount === 2) {
            return isActive ? 0.40 : 0.20;
        }
        return 0.333;
    },

    /*
    Quão FORA dos sectores activados está este X, de 0 (dentro de um deles) a 1
    (o mais longe que o campo permite). Normalizada pela meia-largura do campo.

    Substitui o getWeightedSectorX, que sorteava um X alvo dentro do grupo
    activo e o re-sorteava a cada ~1 s. Com Left e Right ligados isso era uma
    moeda ao ar: um extremo na direita saía metade das vezes com alvo em -19 e
    atravessava o campo pelo meio para lá chegar. E, por ser distância a um
    PONTO (±19), penalizava um extremo em x=+25 que já estava bem colocado.
    */
    penalidadeSector: function (x, dirZ) {
        const activos = this.setores;
        if (!activos || activos.length === 0) return 0;
        if (activos.indexOf(this.sectorDeX(x, dirZ)) >= 0) return 0;

        const xAtk = x * dirZ;
        const meiaLargura = CAMPO_LARG / 2;
        let melhor = Infinity;
        for (const s of activos) {
            // Distância à BORDA do sector activo em escala normalizada [0..1]
            let d;
            if (s === 'esq') d = (xAtk - (-10)) / meiaLargura;
            else if (s === 'dir') d = (10 - xAtk) / meiaLargura;
            else d = (Math.abs(xAtk) - 10) / meiaLargura;
            if (d < melhor) melhor = d;
        }

        return Math.max(0, Math.min(1, melhor));
    },

    update: function () {
        this.formacaoA = document.getElementById('t-formacao-A').value;
        this.formacaoB = document.getElementById('t-formacao-B').value;
        this.estilo = document.getElementById('t-estilo').value;
        const teamStyleEl = document.getElementById('t-team-style');
        if (teamStyleEl) this.teamPlayStyle = teamStyleEl.value;
        this.linhaDefensiva = document.getElementById('t-linha').value;
        this.compactness = document.getElementById('t-compactness').value;
        this.lengthCompactness = document.getElementById('t-length-compactness').value;
        this.pressaoDefensiva = document.getElementById('t-pressao-def').value;

        /*
        A MENTALIDADE MANDA NO COMPRIMENTO — E TEM DE SE VER NO PAINEL.

        T.Defensiva e Defensiva impõem `short` (30 m) por
        MentalidadeModel[...].profundidade. O computeBlock já obedecia, mas o
        dropdown continuava a mostrar a escolha anterior: por fora parecia que
        a opção não fazia nada, e um painel que mente sobre o que o jogo está a
        fazer é pior do que não ter a regra.

        Escreve-se nos dois — no `select` e na variável — para o que se vê e o
        que corre serem a mesma coisa.
        */
        const mental = MentalidadeModel[this.estilo];
        if (mental) {
            if (mental.profundidade) {
                this.lengthCompactness = mental.profundidade;
                const el = document.getElementById('t-length-compactness');
                if (el) el.value = mental.profundidade;
            }
            if (mental.pressao) {
                this.pressaoDefensiva = mental.pressao;
                const el = document.getElementById('t-pressao-def');
                if (el) el.value = mental.pressao;
            }
        }

        Match.assignFormations();
    },

    updateSkills: function () {
        TeamSkills.TeamA.def = parseInt(document.getElementById('skill-def-a').value);
        TeamSkills.TeamA.mid = parseInt(document.getElementById('skill-mid-a').value);
        TeamSkills.TeamA.ata = parseInt(document.getElementById('skill-ata-a').value);
        TeamSkills.TeamA.gk = parseInt(document.getElementById('skill-gk-a').value);

        TeamSkills.TeamB.def = parseInt(document.getElementById('skill-def-b').value);
        TeamSkills.TeamB.mid = parseInt(document.getElementById('skill-mid-b').value);
        TeamSkills.TeamB.ata = parseInt(document.getElementById('skill-ata-b').value);
        TeamSkills.TeamB.gk = parseInt(document.getElementById('skill-gk-b').value);

        document.getElementById('val-def-a').innerText = TeamSkills.TeamA.def;
        document.getElementById('val-mid-a').innerText = TeamSkills.TeamA.mid;
        document.getElementById('val-ata-a').innerText = TeamSkills.TeamA.ata;
        document.getElementById('val-gk-a').innerText = TeamSkills.TeamA.gk;

        document.getElementById('val-def-b').innerText = TeamSkills.TeamB.def;
        document.getElementById('val-mid-b').innerText = TeamSkills.TeamB.mid;
        document.getElementById('val-ata-b').innerText = TeamSkills.TeamB.ata;
        document.getElementById('val-gk-b').innerText = TeamSkills.TeamB.gk;
    }
};

/*
APOIO DE CIRCULACAO — quem se oferece a distancia de passe, e onde.

O apoio que ja existia (SupportModel.raioMin/raioMax, 3.5 a 7 m, um de cada
lado) e apoio CURTO: o toque de saida, a tabela. Medido em jogo: 1.3 apoios
por frame, a 6.1 +/- 4.6 m do portador.

Faltava a outra camada. Media dos companheiros por distancia ao portador:
0-8 m 18.8%, 8-12 m 12.5%, 12-22 m 42.0%, 22+ 26.6% — havia gente na faixa
da circulacao, mas por ACASO, parada no slot do bloco, e so 1.7 deles com
linha de passe aberta. Ninguem tinha a tarefa de se oferecer.

A atribuicao e de EQUIPA e nao de jogador, pela mesma razao da marcacao (ver
atribuirMarcacoes): cada um a escolher sozinho o melhor ponto escolhe o
MESMO ponto, e dois jogadores caminham para a mesma coordenada.

Como funciona: gera pontos num leque a volta do portador (varios angulos,
varios raios dentro da faixa de passe), deita fora os que estao fora do
campo, em fora-de-jogo, colados a um adversario ou com a linha do portador
tapada, e depois faz um leilao guloso — o par (jogador, ponto) mais barato
fecha primeiro, um ponto por jogador, e pontos demasiado proximos uns dos
outros excluem-se.

O custo de um par e a distancia do SLOT do jogador ao ponto: o apoio inclina
quem ja estava por perto, nao arranca ninguem do outro lado do campo. Acima
de `desvioMax` o par nem entra.

Pura: sem Match, sem Tatics, sem THREE (usa o linhaLivre, tambem puro).
*/

const FormationsData = {
    '442': [
        { x: 0, z: -0.95, role: 'gk', pos: 'GK', num: 1 },
        { x: -0.7, z: -0.6, role: 'def', pos: 'RB', num: 2 },
        { x: -0.3, z: -0.7, role: 'def', pos: 'CB', num: 4 },
        { x: 0.3, z: -0.7, role: 'def', pos: 'CB', num: 3 },
        { x: 0.7, z: -0.6, role: 'def', pos: 'LB', num: 6 },
        { x: -0.7, z: -0.1, role: 'mid', pos: 'RM', num: 7 },
        { x: -0.3, z: -0.2, role: 'mid', pos: 'CM', num: 8 },
        { x: 0.3, z: -0.2, role: 'mid', pos: 'CM', num: 10 },
        { x: 0.7, z: -0.1, role: 'mid', pos: 'LM', num: 11 },
        { x: -0.25, z: 0.4, role: 'atk', pos: 'CF', num: 9 },
        { x: 0.25, z: 0.4, role: 'atk', pos: 'CF', num: 19 }
    ],
    '433': [
        { x: 0, z: -0.95, role: 'gk', pos: 'GK', num: 1 },
        { x: -0.7, z: -0.6, role: 'def', pos: 'RB', num: 2 },
        { x: -0.3, z: -0.7, role: 'def', pos: 'CB', num: 4 },
        { x: 0.3, z: -0.7, role: 'def', pos: 'CB', num: 3 },
        { x: 0.7, z: -0.6, role: 'def', pos: 'LB', num: 6 },
        { x: -0.4, z: -0.2, role: 'mid', pos: 'RM', num: 7 },
        { x: 0, z: -0.3, role: 'mid', pos: 'CM', num: 8 },
        { x: 0.4, z: -0.2, role: 'mid', pos: 'LM', num: 11 },
        { x: -0.6, z: 0.5, role: 'atk', pos: 'RW', num: 17 },
        { x: 0, z: 0.6, role: 'atk', pos: 'CF', num: 9 },
        { x: 0.6, z: 0.5, role: 'atk', pos: 'LW', num: 21 }
    ],
    '4231': [
        { x: 0, z: -0.95, role: 'gk', pos: 'GK', num: 1 },
        { x: -0.7, z: -0.6, role: 'def', pos: 'RB', num: 2 },
        { x: -0.3, z: -0.7, role: 'def', pos: 'CB', num: 4 },
        { x: 0.3, z: -0.7, role: 'def', pos: 'CB', num: 3 },
        { x: 0.7, z: -0.6, role: 'def', pos: 'LB', num: 6 },
        { x: -0.3, z: -0.3, role: 'mid', pos: 'DM', num: 5 },
        { x: 0.3, z: -0.3, role: 'mid', pos: 'DM', num: 15 },
        { x: -0.6, z: 0.1, role: 'mid', pos: 'RM', num: 7 },
        { x: 0, z: 0.2, role: 'mid', pos: 'AM', num: 10 },
        { x: 0.6, z: 0.1, role: 'mid', pos: 'LM', num: 11 },
        { x: 0, z: 0.6, role: 'atk', pos: 'CF', num: 9 }
    ]
};
