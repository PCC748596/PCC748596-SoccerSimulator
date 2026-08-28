/*
=============================================================================
CONFIG: PASSADA E CADÊNCIA (GAIT)
=============================================================================
Modelos de marcha, corrida, rotação, cadência e salto para cabeceio.
=============================================================================
*/

const TurnModel = {
    base: 12.0,
    comBola: 9.0
};

const LateralGait = {
    anguloMin: 35 * Math.PI / 180,   // desvio entre a frente do corpo e o movimento
    velViragem: 3.6,                 // m/s acima dos quais o corpo roda para o movimento
    reducaoPassada: 0.65,            // quanto encolhe a passada no passo lateral
    abertura: 0.30                   // abdução/adução da anca no passo lateral (rad, limite 45°)
};

const GaitModel = {
    andar: {
        vel: 1.8,             // velocidade típica deste andamento (m/s)
        passada: 1.55,        // metros por ciclo completo
        anca: 0.40,           // amplitude da coxa (rad)
        joelhoBase: 0.06,     // flexão mínima, mesmo na perna de apoio
        joelhoOscila: 0.55,   // flexão adicional na fase de balanço
        pe: 0.18,
        braco: 0.16,          // a andar os braços quase não se mexem
        cotovelo: -0.22,      // e vão quase esticados
        tronco: 0.05,         // a prumo
        ressalto: 0.015       // meia-amplitude da subida/descida da anca (m)
    },
    trote: {
        vel: 4.5,
        passada: 2.90,
        anca: 0.78,
        joelhoBase: 0.12,
        joelhoOscila: 1.15,
        pe: 0.30,
        braco: 0.52,
        cotovelo: -0.95,
        tronco: 0.15,
        ressalto: 0.028
    },
    correr: {
        vel: 8.0,
        passada: 4.40,
        anca: 1.20,
        joelhoBase: 0.20,
        joelhoOscila: 1.95,   // calcanhar quase ao rabo
        pe: 0.45,
        braco: 1.00,
        cotovelo: -1.55,      // braços bem dobrados a bombear
        tronco: 0.30,         // inclinado para a frente
        ressalto: 0.045       // ~9 cm de oscilação total, como numa corrida a sério
    }
};

/*
Forma do bloco. Todos os valores estão no REFERENCIAL DE ATAQUE da equipa:
    -53 = linha de baliza própria      -36.5 = linha da própria grande área
      0 = linha central                +53 = linha de baliza adversária
Para converter para o mundo, multiplicar por p.dirZ.
*/

const SaltoCabeceio = {
    duracao: 0.62,        // salto completo (s); o pico fica a meio
    alturaMax: 0.80,      // subida máxima que as pernas dão (m)
    // Tem de ficar <= BallControl.reach (0.9): esse é o raio que REGISTA o
    // contacto de verdade (match.js/distanciaAoCorpo). Estava em 1.4 —
    // saltava para bolas até 1.4m, mas entre 0.9-1.4m o contacto nunca
    // registava: a bola passava perto (~0.5m de folga, visível), nunca
    // colava na cabeça, nunca disparava executeHeader. Salto em vão.
    alcanceXZ: 0.8,       // distância horizontal máxima à bola, no pico
    subidaMin: 0.10,      // acima disto já é bola de cabeça (abaixo é peito)

    /*
    Entre subidaMin e alturaSemPulo a bola está mesmo em cima da cabeça —
    alcança-se só inclinando o tronco para trás e esticando o pescoço, sem
    saltar (ver aplicarCamadaCabeceioDePe em player.js). O salto só entra
    quando ela está mesmo fora de alcance parado.
    */
    alturaSemPulo: 0.30,
    cooldown: 1.5         // era 10 s — impedia dois saltos na mesma jogada
};

/*
Cadência: leva tempo real ao jogo. Sem isto, quem ganha a bola decide
(passar/rematar/lançar) no mesmo frame, e a equipa adversária reage à posse
instantaneamente — o jogo inteiro corre em ritmo de "últimos 5 minutos de
final perdida". Na vida real o portador domina, olha as opções, e só depois
executa; o marcador espera o domínio, avalia bloquear/pressionar, e só
executa a decisão dele passado um tempo — controlado no painel por
Defensive Pressure.
*/
const CadenceModel = {
    // Quanto tempo o portador leva a decidir (passar/rematar/lançar) depois
    // de dominar a bola. Sob pressão pesada, o toque de primeira é mais
    // provável — a decisão sai bem mais rápido.
    posseBase: 3.0,
    posseSobPressao: 0.6
};

/*
Uso dos dados da percepção (ver perception.js) na DECISÃO.

A percepção já calculava `interceptable`/`timeToIntercept`/`interceptionPoint`
por jogador, mas nada na árvore os lia: o único consumidor era o `claimScore`
do `pickChaser`, que escolhe UM jogador por equipa. Resultado: uma bola a
passar rente a um jogador que não fosse nem o chaser nem o destinatário do
passe era ignorada por ele — ficava parado a ver.
*/
/*
=============================================================================
xG — QUANTO VALIA A OPORTUNIDADE
=============================================================================
Modelo logístico sobre duas variáveis, que é o esqueleto de qualquer xG
público: a DISTÂNCIA à baliza e o ÂNGULO que a baliza subtende do ponto do
remate. O ângulo é o que distingue um remate de 12 m à entrada da área de um
de 12 m junto à linha de fundo, onde não há baliza nenhuma para acertar.

    logit = base + pesoLogAngulo * ln(angulo) - pesoDistancia * distancia

O que este modelo NÃO tem, e convém estar escrito: pressão (defensores entre a
bola e a baliza), parte do corpo (pé ou cabeça), e se veio de um passe em
profundidade. São as três variáveis que mais valem a seguir a estas duas — se
o xG do lote ficar sistematicamente alto, é por aqui que se acrescenta.

Âncoras usadas para escolher os números (remate central, jogo corrido):

    5,5 m  -> ~0,54      11 m -> ~0,26
    16,5 m -> ~0,12      25 m -> ~0,04

E a âncora do lote inteiro: o alvo é 2,84 xG em 26,11 finalizações, ou seja
uma MÉDIA de 0,109 por remate. É esse o número a olhar no painel — as âncoras
por distância só dizem que a forma da curva é plausível.
=============================================================================
*/
