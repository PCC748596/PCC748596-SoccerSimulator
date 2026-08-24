/*
=============================================================================
FUNCTION & OBJECT INDEX
=============================================================================
- SimpleOrbitControls: Class handling mouse/touch inputs for free camera rotation and zoom.
    * onMouseDown, onMouseMove, onMouseUp: Mouse interactions.
    * onWheel: Zoom interaction via scroll wheel.
    * onTouchStart, onTouchMove: Mobile touch & pinch-to-zoom support.
    * updateCameraPosition: Calculates cartesian coordinates from spherical angles.

- mergeNonIndexedGeometries: Utility to combine multiple Three.js geometries into one to improve rendering performance.
- createSpectatorGeometry: Builds the basic modular shape of a crowd spectator (head, chest, limbs).
- getRunPose: Returns rotation values for limbs based on the current animation cycle time.

- Tatics: Global object managing formation, play style, passing style, and field sectors.
    * toggleSector: Adds/removes focused attacking sectors for AI behavior.
    * sectorDeX, penalidadeSector: Classifies an X into a tactical sector and scores how far outside the active ones it falls.
    * update, updateSkills: Refreshes tactics and stats based on UI changes.

- Match: Main game loop and state manager.
    * init: Sets up scene, field, ball, UI bindings, and teams.
    * setupKeyboardListeners: Binds UI/Camera controls to keyboard keys.
    * setSpeed, setCameraMode: Updates time scale and view type globally.
    * updateCamera: Follows the ball using the selected broadcast view using smooth interpolation.
    * createField: Generates the 3D stadium, grass, lines, goals, and instanced crowd.
    * createTeams: Instantiates FootballPlayer objects for both teams and sets their colors.
    * assignFormations: Positions players based on the selected tactic array (FormationsData).
    * resetPlay: Restores players and ball to starting positions (kick-off).
    * update: Main tick function (physics, AI, rendering).
    * updateCrowd: Animates the instanced spectators based on match excitement and ball position.
    * runTeamAI: Core logic for positioning, marking, covering, and attacking phase transitions.
    * updateBall: Physics for ball movement, friction, gravity, and goal/out detection.
    * setupSetPiece: Arranges players dynamically for corners or goal kicks.
    
- FootballPlayer: Class representing an individual athlete on the field.
    * getSkill: Retrieves the overall stat for the player's specific role from TeamSkills.
    * resetBonesToDefault: Resets the 3D skeleton to T-pose/idle to prevent animation glitches.
    * findPassTargetRelaxed, findPassTarget: Logic to identify the best teammate to receive a pass based on distance and pressure.
    * runBehaviorTree: High-level AI for decision making (pass, shoot, cross, carry, dribble, tackle).
    * initiatePass, initiateShoot, executeHeader: Triggers explicit action states in the FSM.
    * update: Per-frame update for player logic and bone animation.
    * steerArrive: Calculates velocity to smoothly reach a target coordinate using steering behaviors.
    * animateBones: Procedural animation for running, jumping, and resting poses.
    * buildBody: Constructs the hierarchical 3D mesh and skeleton structure.
    * updateShirt: Generates a canvas texture to draw the player's number and position on their back.
    * updateGK: Specialized AI and physics specifically for Goalkeepers (diving, saving, positioning).
    
- PlayerFSM: Finite State Machine (FSM) for player actions.
    * changeState: Transitions safely between IDLE, MOVE_TO_POS, CARRY, DRIBBLE, PASS, TACKLE, SET_PIECE, etc.
    * update: Executes state-specific logic over time (e.g. performing a sliding tackle over 1.5 seconds).
    
- lerp, lerpTo: Mathematical utility functions for smooth interpolation between values.
- applyKeyframeAnimation: Applies pre-baked animation data (from OptimizedAnimations object) to a player's rig.
- ownGoalZCenter: Helper to get the Z position of a team's defending goal.
- animate: The browser's main requestAnimationFrame loop running the simulation.
=============================================================================
*/

const LARGURA_BALIZA = 7.32; const ALTURA_BALIZA = 2.44; const ALTURA_BASE_Y = 0.0;

/*
Rede da baliza — forma e comportamento.

A rede DESENHADA é inclinada: o pano de cima entra `profTopo` metros a partir
da linha, e daí desce em diagonal até ao chão a `profBase` metros (ver a
criação das faces em match.js). A COLISÃO, essa, era uma caixa: parava a bola
a 2.3 m de profundidade a qualquer altura. Uma bola entrada por cima ficava
suspensa muito atrás do pano — lia-se como a bola a atravessar a rede.

E o que havia a seguir era pior para a leitura: `ballVel.set(0,0,0)`. A bola
congelava no ar onde tocasse, em vez de escorregar pelo pano abaixo.

`restituicao` é baixa de propósito — corda amortece quase tudo. `atrito`
trava o deslizamento sem o impedir: é ele que faz a bola descer o pano em vez
de ficar colada onde bateu.
*/
const GoalNet = {
    /*
    FÍSICA — não mexer sem medir. A bola já bate no pano, perde velocidade e
    escorrega até ao chão pela inclinação do pano de trás (profTopo 0.8 no
    cimo, profBase 2.0 na base). Ver Match.colidirComRede em match.js.
    */
    profTopo: 0.8,
    profBase: 2.0,
    restituicao: 0.02,
    atrito: 0.35,

    /*
    MALHA — quantos quadrados por face. Antes cada face era UM quad de quatro
    vértices, e por isso a rede não podia deformar-se: era uma chapa rígida com
    textura de rede. Os laterais são estreitos e levam menos divisões ao longo
    de u.
    */
    segmentosU: 16,
    segmentosV: 6,
    segmentosLateralU: 8,

    /*
    ONDULAÇÃO (ver NetWave em goal_net.js). O deslocamento é ao longo da normal
    da face:

        desloc = amplitude * envolvente(t) * sin(frequencia*t + k*(u+v))
        envolvente(t) = (1 - e^(-t/ataqueOnda)) * e^(-t/tau)

    com tau = duracaoOnda/4, o que deixa ~1.8% da amplitude ao fim de
    duracaoOnda. `ondasPorPano` é quantas cristas cabem na diagonal do pano: é
    o que faz a ondulação PERCORRER a rede em vez de a levantar em bloco.

    O factor de ATAQUE existe para a envolvente valer 0 em t=0. Sem ele a
    envolvente arrancava em 1 e, como a fase depende de (u+v), a rede saltava
    para uma posição já deformada no primeiro frame em vez de partir do
    repouso — apanhado pelos testes.
    */
    ataqueOnda: 0.05,
    duracaoOnda: 5.0,
    amplitudeMax: 0.28,
    frequencia: 7.0,
    ondasPorPano: 2.5,
    velocidadeCheia: 22.0
};

/*
Estrutura da baliza — postes e travessão como obstáculos físicos.

A bola atravessava-os: não havia colisão nenhuma com a armação, só a
detecção de golo (que continua a exigir a bola INTEIRA para lá da linha) e o
clamp da rede. Uma bola na trave passava ou encostava sem ressaltar.

`z` é o plano dos postes: a armação está meio raio para dentro da linha,
como no desenho da baliza (ver criação em match.js).
*/
const GoalFrame = {
    raioPoste: 0.06,
    // Trave e postes são rígidos: devolvem bem mais do que a rede, um pouco
    // menos do que uma parede perfeita.
    restituicao: 0.65,
    // Atrito tangencial no ressalto: a bola sai da trave a rodar e perde
    // alguma velocidade no plano do impacto.
    atrito: 0.85
};

window.Config = {
    usePlayingStyles: true,
    enableCrowd: false
};

/*
Altura da TESTA acima da base do modelo.

`model.position` está nos PÉS (y = ALTURA_BASE_Y). O rig, à escala 1.8/5.5,
põe o centro da cabeça a ~1.64 m e a testa a ~1.75 m. Este valor é o ponto de
contacto de um cabeceio — ver distanciaAoCorpo() em utils.js.
*/
const ALTURA_CABECA = 1.72;

/*
ALTURA DA TESTA — onde a bola bate num cabeceio.

Cabeça-se com a TESTA, um pouco abaixo do topo do crânio. `ALTURA_CABECA` é
o topo: mirar aí punha a bola a raspar por cima, e o jogador a "cabecear" uma
bola em que nunca tocava. Toda a decisão de cabeceio mede-se a partir daqui —
sem salto, a testa está a esta altura; a saltar, a esta altura mais a subida
do salto.
*/
const ALTURA_TESTA = ALTURA_CABECA - 0.10;   // 1.62
const CAMPO_LARG = 68; const CAMPO_COMP = 106;

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _m1 = new THREE.Matrix4();
const _q1 = new THREE.Quaternion();
const _line1 = new THREE.Line3();
const _vUp = new THREE.Vector3(0, 1, 0);   // eixo vertical, para rodar direcções no plano do campo
const _vFrenteCorpo = new THREE.Vector3();  // frente local (+Z) do jogador que passa, para o ângulo do corpo no erro do passe (executePassGameplay)

/*
=============================================================================
FÍSICA DA BOLA — valores reais, não afinados à mão
=============================================================================
O que estava antes em updateBall(), e porque estava errado:

    gravidade   15.0 m/s²        53% acima da real; a bola caía como pedra
    raio        0.15 m           circunferência 94 cm (regulamento: 68-70)
    arrasto     pow(0.85, dt)    decaimento EXPONENCIAL, proporcional a v e
                                 só em x/z. O arrasto real é quadrático (∝v²)
                                 e trava as três componentes: com o modelo
                                 antigo uma bola lenta perdia 15%/s (a mais)
                                 e uma bola a 30 m/s quase não travava (a
                                 menos). Daí o voo "esquisito".
    chão        pow(0.55, dt)    45% da velocidade por segundo a rolar. Uma
                                 bola a rolar perde ~1 m/s por segundo, e
                                 essa perda é constante (μ·g), não uma
                                 fracção da velocidade.

Valores agora:
    massa 430 g          FIFA Lei 2 (410-450 g)
    circunferência 69 cm FIFA Lei 2 (68-70 cm) → raio 0.11 m
    ρ = 1.225 kg/m³      ar seco, 1 atm (101 325 Pa), nível do mar, 15 °C
    Cd = 0.25            bola de futebol em regime turbulento
    g = 9.81 m/s²

    arrasto:    a = ½·ρ·Cd·A/m · v²  =  0.0135·v²
                (0.34 m/s² a 5 m/s; 12.2 m/s² a 30 m/s)
    rolamento:  a = μ·g = 0.98 m/s², constante
=============================================================================
*/
const BallPhysics = {
    massa: 0.430,           // kg
    raio: 0.11,             // m (circunferência 69 cm)
    gravidade: 9.81,        // m/s²
    densidadeAr: 1.225,     // kg/m³ — 1 atm, nível do mar, 15 °C
    cd: 0.25,               // coeficiente de arrasto
    restituicao: 0.60,      // ressalto vertical em relva
    atritoRessalto: 0.75,   // perda horizontal em cada ressalto
    atritoRolamento: 0.38,  // μ de rolamento em relva
    vMinRessalto: 0.6,      // abaixo disto não ressalta, assenta
    vMinRolar: 0.25,        // abaixo disto pára de vez

    /*
    Só a MALHA é aumentada, não a física: a bola regulamentar (raio 0.11 m)
    fica pequena de mais para se ver bem à distância da câmara. O raio de
    colisão, o ressalto e a rotação continuam a usar o valor real.
    */
    escalaVisual: 1.30
};

/*
=============================================================================
BARREIRA DO CAMPO — muro de contenção à frente da bancada
=============================================================================
Sem isto, uma bola forte para fora saía do estádio e ia rolar por baixo das
bancadas até parar sozinha (a física real tem pouco atrito de rolamento e o
`resetPlay` só acontece depois de ela parar).

As bancadas laterais começam em |x| = 38.5 e as de fundo em |z| = 58.5 (ver
createField). A barreira fica logo à frente delas, com a folga do degrau.

A contenção aplica-se a QUALQUER altura da bola, embora o painel só suba
`alturaPainel`: acima disso é a rede de protecção (a parte translúcida), que
existe pela mesma razão nos estádios a sério.
=============================================================================
*/
const BarreiraCampo = {
    x: (CAMPO_LARG / 2),
    z: (CAMPO_COMP / 2) + 4.0,
    alturaPainel: 1.1,      // muro de publicidade, opaco
    alturaRede: 4.5,        // rede de protecção por cima, translúcida
    restituicao: 0.35,      // ressalto seco: a bola morre ali, não volta ao meio
    atrito: 0.6             // perda na componente paralela ao embate
};
BallPhysics.area = Math.PI * BallPhysics.raio * BallPhysics.raio;
// ½·ρ·Cd·A/m — multiplicar por v² dá a desaceleração em m/s².
BallPhysics.kArrasto = 0.5 * BallPhysics.densidadeAr * BallPhysics.cd *
    BallPhysics.area / BallPhysics.massa;

/*
Sincronização gameplay↔animação (ActionState, ver js/bt/action_state.js).
contactTime é a fracção (0..1) da duração do gesto em que o efeito real
(bola sai do pé, etc.) dispara — não no instante em que o BT decide.
Começa só pelo PASS; os valores replicam exactamente o timing antigo
(this.timer<0.08 / >=0.2) para não mudar o "feel" ao migrar de arquitectura.
*/
const ActionAnimClips = {
    pass: { duration: 0.2, contactTime: 0.4 },
    // Chutão do guarda-redes (ver GoalkeeperKickClip). O contactTime cai
    // exactamente no keyframe 9 (t = 8/11), o frame do contacto pé-bola.
    gkPunt: { duration: 0.85, contactTime: 8 / 11 },
    // Tiro de meta do chão com corrida de aproximação (ver GoalkeeperGroundKickClip / SetPieceGroundKickClip)
    // Contacto no frame 8 (t = 7/11 ≈ 0.636) do clip de 12 frames
    gkPuntChao: { duration: 0.82, contactTime: 7 / 11 },
    // Lançamento com as mãos do guarda-redes
    gkThrow: { duration: 0.70, contactTime: 8 / 11 }
};

/*
Janela de mistura (segundos) entre a corrida de aproximação do tiro de meta e
o primeiro keyframe do clip de chute do chão. Sem ela, a pose das pernas, a
rotação/translação da bacia (o pivô no pé de apoio vale ~0.26 m de deslocação
lateral logo no frame 1), a posição do corpo no ponto de apoio e a orientação
mudavam todas no mesmo frame — lia-se como um corte entre duas animações.
*/
const GK_GROUND_KICK_BLEND = 0.14;

/*
=============================================================================
GOALKEEPER_KICK_FORWARD_HIGH — chutão do guarda-redes, 12 keyframes
=============================================================================
Convenção do esqueleto (a mesma do GoalkeeperPose):
    coxa   rotation.x > 0  →  perna para TRÁS   (< 0 é para a FRENTE, o chuto)
    joelho rotation.x > 0  →  dobra para trás   (calcanhar sobe)
    peito  rotation.x > 0  →  tronco para a FRENTE (< 0 inclina para TRÁS)

Os 12 frames pedidos, distribuídos por igual no tempo normalizado (0..1),
t = (frame - 1) / 11:

     1  parado com a bola                   7  perna acelera para a frente
     2  corpo inclina levemente para trás   8  pé desce e avança para a bola
     3  perna de apoio avança               9  CONTACTO (pé na bola)
     4  perna de chute começa a recuar     10  pé continua a subir e avançar
     5  joelho dobra, pé sobe para trás    11  perna termina alta, corpo segue
     6  máxima preparação                  12  recuperação/equilíbrio

`chute` é a perna que bate (rLeg/rKnee), `apoio` a que fica no chão.
`bracoX`/`cotovelo` largam a bola a partir do frame 6 e passam a equilibrar.
=============================================================================
*/
/*
Multiplicador da FORÇA do chutão do guarda-redes (ver puntBall em player.js).
Multiplica a velocidade de saída, não o alcance: como o alcance vai com o
quadrado da velocidade, 1.15 de força dá cerca de 1.32 de distância.
*/
const GoalkeeperKickPower = 1.15;

const GoalkeeperKickClip = {
    pernaChute: 'r',    // qual das pernas bate; a outra é a de apoio
    frames: [
        // t,      chest, coxaChute, joelhoChute, coxaApoio, joelhoApoio, bracoX, cotovelo, altura
        { chest: 0.05, coxaChute: 0.05, joelhoChute: 0.12, coxaApoio: 0.05, joelhoApoio: 0.12, bracoX: -0.90, cotovelo: -2.00, altura: 0.00 },
        { chest: -0.18, coxaChute: 0.08, joelhoChute: 0.15, coxaApoio: 0.02, joelhoApoio: 0.14, bracoX: -0.90, cotovelo: -2.00, altura: 0.00 },
        { chest: -0.20, coxaChute: 0.12, joelhoChute: 0.20, coxaApoio: -0.35, joelhoApoio: 0.28, bracoX: -0.85, cotovelo: -1.90, altura: 0.00 },
        { chest: -0.25, coxaChute: 0.35, joelhoChute: 0.55, coxaApoio: -0.20, joelhoApoio: 0.20, bracoX: -0.80, cotovelo: -1.85, altura: -0.02 },
        { chest: -0.28, coxaChute: 0.60, joelhoChute: 1.30, coxaApoio: -0.10, joelhoApoio: 0.22, bracoX: -0.70, cotovelo: -1.70, altura: -0.03 },
        { chest: -0.30, coxaChute: 0.75, joelhoChute: 1.70, coxaApoio: -0.05, joelhoApoio: 0.25, bracoX: -0.50, cotovelo: -1.20, altura: -0.04 },
        { chest: -0.20, coxaChute: 0.20, joelhoChute: 1.20, coxaApoio: 0.00, joelhoApoio: 0.28, bracoX: -0.20, cotovelo: -0.80, altura: -0.02 },
        { chest: -0.08, coxaChute: -0.40, joelhoChute: 0.60, coxaApoio: 0.02, joelhoApoio: 0.30, bracoX: 0.10, cotovelo: -0.50, altura: 0.00 },
        { chest: 0.05, coxaChute: -0.85, joelhoChute: 0.15, coxaApoio: 0.04, joelhoApoio: 0.32, bracoX: 0.35, cotovelo: -0.40, altura: 0.02 },
        { chest: 0.18, coxaChute: -1.25, joelhoChute: 0.05, coxaApoio: 0.06, joelhoApoio: 0.30, bracoX: 0.50, cotovelo: -0.40, altura: 0.06 },
        { chest: 0.28, coxaChute: -1.50, joelhoChute: 0.00, coxaApoio: 0.08, joelhoApoio: 0.26, bracoX: 0.60, cotovelo: -0.50, altura: 0.08 },
        { chest: 0.05, coxaChute: -0.10, joelhoChute: 0.14, coxaApoio: 0.05, joelhoApoio: 0.14, bracoX: -0.10, cotovelo: -0.15, altura: 0.00 }
    ],

    /*
    A bola desce das mãos até ao pé entre a máxima preparação (frame 6) e o
    contacto (frame 9) — sem isto ficava agarrada à altura do peito e o pé
    batia no vazio.
    */
    largaBolaEm: 5 / 11,
    alturaMao: 1.15,
    alturaPe: 0.25
};

/*
=============================================================================
GROUND_KICK_CLIP / SET_PIECE_KICK_CLIP — 12 Keyframes (Chute de Bola Parada)
Servindo para: Tiro de Meta, Faltas, Escanteios e Pênaltis.
Biomecânica com PIVÔ NO PÉ DE APOIO:
  - O corpo todo inclina em bloco com pivô no pé de apoio cravado na relva,
    sem quebrar a cintura ou dobrar a coluna de lado.
  - Fig 2 (Frames 2-4): Pé de apoio cravado ao lado da bola, inclinação total
          sobre o pé esquerdo, armação máxima da perna direita (~110° no joelho).
  - Fig 3 (Frames 7-8): Aceleração balística e contato pé-bola (impacto no frame 8, t = 7/11).
  - Fig 4 (Frames 9-11): Follow-through alto da perna de remate e elevação na ponta do pé.
  - Frame 12: Pouso e amortecimento neutro.
=============================================================================
*/
const GoalkeeperGroundKickClip = {
    pernaChute: 'r',
    contactFrame: 8, // frame 8 (índice 7, t = 7/11)
    frames: [
        // 1 (t = 0/11): Chegada e fixação do pé de apoio ao lado da bola, início da armação
        { leanZ: -0.10, pitchX: -0.08, chest: 0.00, coxaChute: 0.35, joelhoChute: 0.80, coxaChuteZ: -0.05, coxaApoio: -0.08, joelhoApoio: 0.25, bracoLx: -0.30, bracoLz: 0.45, bracoRx: 0.20, bracoRz: -0.25, cotoveloL: -0.5, cotoveloR: -0.7, altura: 0.00 },
        // 2 (t = 1/11): Inclinação do corpo aumentando sobre o apoio, perna de remate recua
        { leanZ: -0.24, pitchX: -0.18, chest: -0.02, coxaChute: 0.65, joelhoChute: 1.40, coxaChuteZ: -0.10, coxaApoio: -0.04, joelhoApoio: 0.30, bracoLx: -0.45, bracoLz: 0.65, bracoRx: 0.35, bracoRz: -0.32, cotoveloL: -0.4, cotoveloR: -0.8, altura: -0.01 },
        // 3 (t = 2/11): FIGURA 2 - Fase de Suporte e Armação Máxima: pivô total no pé esquerdo, corpo inclinado em bloco, joelho direito a ~110°
        { leanZ: -0.36, pitchX: -0.28, chest: -0.04, coxaChute: 0.95, joelhoChute: 1.92, coxaChuteZ: -0.15, coxaApoio: 0.02, joelhoApoio: 0.35, bracoLx: -0.55, bracoLz: 0.85, bracoRx: 0.45, bracoRz: -0.38, cotoveloL: -0.3, cotoveloR: -0.9, altura: -0.02 },
        // 4 (t = 3/11): Início da impulsão pélvica para a frente, perna ainda fletida acumulando energia
        { leanZ: -0.32, pitchX: -0.22, chest: -0.02, coxaChute: 0.60, joelhoChute: 1.70, coxaChuteZ: -0.12, coxaApoio: 0.03, joelhoApoio: 0.32, bracoLx: -0.48, bracoLz: 0.78, bracoRx: 0.35, bracoRz: -0.40, cotoveloL: -0.35, cotoveloR: -0.8, altura: -0.01 },
        // 5 (t = 4/11): Transição: avanço dinâmico da coxa de remate em direção à bola
        { leanZ: -0.26, pitchX: -0.14, chest: 0.00, coxaChute: 0.20, joelhoChute: 1.30, coxaChuteZ: -0.08, coxaApoio: 0.04, joelhoApoio: 0.28, bracoLx: -0.35, bracoLz: 0.70, bracoRx: 0.20, bracoRz: -0.44, cotoveloL: -0.35, cotoveloR: -0.7, altura: 0.00 },
        // 6 (t = 5/11): Efeito chicote: desaceleração da coxa e início da extensão rápida da tíbia
        { leanZ: -0.20, pitchX: -0.06, chest: 0.02, coxaChute: -0.25, joelhoChute: 0.75, coxaChuteZ: -0.05, coxaApoio: 0.04, joelhoApoio: 0.25, bracoLx: -0.15, bracoLz: 0.62, bracoRx: 0.00, bracoRz: -0.48, cotoveloL: -0.3, cotoveloR: -0.6, altura: 0.01 },
        // 7 (t = 6/11): Aproximação final milimétrica do pé à bola
        { leanZ: -0.16, pitchX: 0.00, chest: 0.04, coxaChute: -0.60, joelhoChute: 0.30, coxaChuteZ: -0.03, coxaApoio: 0.05, joelhoApoio: 0.22, bracoLx: 0.00, bracoLz: 0.58, bracoRx: -0.20, bracoRz: -0.50, cotoveloL: -0.3, cotoveloR: -0.5, altura: 0.02 },
        // 8 (t = 7/11): FIGURA 3 - Fase de Contato (IMPACTO): pé no centro da bola, perna esticada, corpo apoiado no pé de suporte
        { leanZ: -0.14, pitchX: 0.06, chest: 0.06, coxaChute: -0.80, joelhoChute: 0.12, coxaChuteZ: 0.00, coxaApoio: 0.05, joelhoApoio: 0.20, bracoLx: 0.12, bracoLz: 0.55, bracoRx: -0.35, bracoRz: -0.52, cotoveloL: -0.3, cotoveloR: -0.45, altura: 0.03 },
        // 9 (t = 8/11): Pós-impacto imediato: perna segue subindo pela inércia balística
        { leanZ: -0.10, pitchX: 0.15, chest: 0.08, coxaChute: -1.25, joelhoChute: 0.08, coxaChuteZ: 0.00, coxaApoio: 0.06, joelhoApoio: 0.16, bracoLx: 0.25, bracoLz: 0.60, bracoRx: 0.10, bracoRz: -0.58, cotoveloL: -0.3, cotoveloR: -0.4, altura: 0.08 },
        // 10 (t = 9/11): FIGURA 4 - Fase de Finalização (Follow-Through Alto): perna no ápice acima da cintura, corpo elevado na ponta do pé de apoio
        { leanZ: -0.06, pitchX: 0.24, chest: 0.10, coxaChute: -1.60, joelhoChute: 0.05, coxaChuteZ: 0.00, coxaApoio: 0.08, joelhoApoio: 0.12, bracoLx: 0.38, bracoLz: 0.65, bracoRx: 0.42, bracoRz: -0.65, cotoveloL: -0.3, cotoveloR: -0.3, altura: 0.15 },
        // 11 (t = 10/11): Desaceleração suave da perna alta e descida do corpo
        { leanZ: -0.02, pitchX: 0.12, chest: 0.05, coxaChute: -0.75, joelhoChute: 0.25, coxaChuteZ: 0.00, coxaApoio: 0.04, joelhoApoio: 0.16, bracoLx: 0.18, bracoLz: 0.40, bracoRx: 0.20, bracoRz: -0.40, cotoveloL: -0.2, cotoveloR: -0.2, altura: 0.05 },
        // 12 (t = 11/11): Pouso equilibrado com retorno à postura neutra de jogo
        { leanZ: 0.00, pitchX: 0.00, chest: 0.00, coxaChute: 0.00, joelhoChute: 0.10, coxaChuteZ: 0.00, coxaApoio: 0.00, joelhoApoio: 0.10, bracoLx: 0.00, bracoLz: 0.15, bracoRx: 0.00, bracoRz: -0.15, cotoveloL: 0.00, cotoveloR: 0.00, altura: 0.00 }
    ]
};

const SetPieceGroundKickClip = GoalkeeperGroundKickClip;

const GoalkeeperThrowPower = 1.0;

const GoalkeeperThrowClip = {
    bracoLancamento: 'r', // Braço que lança a bola
    frames: [
        // chest, coxaL, joelhoL, coxaR, joelhoR, bracoLx, bracoLz, bracoRx, bracoRz, cotoveloL, cotoveloR, altura
        { chest: 0.05, coxaL: 0.05, joelhoL: 0.12, coxaR: 0.05, joelhoR: 0.12, bracoLx: -0.9, bracoLz: 0.05, bracoRx: -0.9, bracoRz: -0.05, cotoveloL: -2.0, cotoveloR: -2.0, altura: 0 },
        { chest: 0.00, coxaL: 0.05, joelhoL: 0.12, coxaR: 0.20, joelhoR: 0.15, bracoLx: -0.9, bracoLz: 0.20, bracoRx: -0.2, bracoRz: -0.50, cotoveloL: -1.5, cotoveloR: -1.0, altura: 0 },
        { chest: -0.10, coxaL: 0.10, joelhoL: 0.15, coxaR: 0.40, joelhoR: 0.20, bracoLx: -1.0, bracoLz: 0.30, bracoRx: 0.5, bracoRz: -1.00, cotoveloL: -1.0, cotoveloR: -0.5, altura: -0.02 },
        { chest: -0.20, coxaL: 0.15, joelhoL: 0.20, coxaR: 0.60, joelhoR: 0.30, bracoLx: -1.1, bracoLz: 0.40, bracoRx: 1.2, bracoRz: -1.20, cotoveloL: -0.8, cotoveloR: -0.3, altura: -0.04 },
        { chest: -0.10, coxaL: 0.10, joelhoL: 0.15, coxaR: 0.30, joelhoR: 0.20, bracoLx: -1.0, bracoLz: 0.30, bracoRx: -1.0, bracoRz: -0.80, cotoveloL: -0.5, cotoveloR: -0.2, altura: -0.02 },
        { chest: 0.05, coxaL: 0.00, joelhoL: 0.10, coxaR: -0.10, joelhoR: 0.10, bracoLx: -0.8, bracoLz: 0.20, bracoRx: -1.8, bracoRz: -0.20, cotoveloL: -0.3, cotoveloR: -0.1, altura: 0.00 },
        { chest: 0.15, coxaL: -0.10, joelhoL: 0.05, coxaR: -0.30, joelhoR: 0.05, bracoLx: -0.6, bracoLz: 0.10, bracoRx: -2.2, bracoRz: -0.10, cotoveloL: -0.2, cotoveloR: -0.05, altura: 0.02 },
        { chest: 0.20, coxaL: -0.15, joelhoL: 0.00, coxaR: -0.40, joelhoR: 0.00, bracoLx: -0.4, bracoLz: 0.05, bracoRx: -2.5, bracoRz: 0.00, cotoveloL: -0.1, cotoveloR: 0.0, altura: 0.04 },
        { chest: 0.25, coxaL: -0.20, joelhoL: 0.00, coxaR: -0.50, joelhoR: 0.00, bracoLx: -0.2, bracoLz: 0.05, bracoRx: -1.5, bracoRz: 0.00, cotoveloL: -0.1, cotoveloR: -0.2, altura: 0.02 },
        { chest: 0.15, coxaL: -0.10, joelhoL: 0.05, coxaR: -0.30, joelhoR: 0.05, bracoLx: 0.0, bracoLz: 0.05, bracoRx: -0.5, bracoRz: 0.00, cotoveloL: -0.1, cotoveloR: -0.5, altura: 0.00 },
        { chest: 0.10, coxaL: 0.00, joelhoL: 0.10, coxaR: -0.10, joelhoR: 0.10, bracoLx: 0.0, bracoLz: 0.05, bracoRx: 0.0, bracoRz: -0.05, cotoveloL: -0.5, cotoveloR: -1.0, altura: 0.00 },
        { chest: 0.05, coxaL: 0.05, joelhoL: 0.12, coxaR: 0.05, joelhoR: 0.12, bracoLx: -0.2, bracoLz: 0.10, bracoRx: -0.2, bracoRz: -0.10, cotoveloL: -0.8, cotoveloR: -0.8, altura: 0.00 }
    ]
};

// window.goleiroEstado, window.goleiroReagiu e window.delayReacaoCalculado
// foram movidos para propriedades de instância de FootballPlayer (gkEstado,
// gkReagiu, gkDelayReacao). Cada GK tem o seu próprio estado independente.
window.bolaChutada = false;

window.speedMultiplier = 1.0;

/*
Ritmo base da simulação, à parte do `speedMultiplier`.

O `speedMultiplier` é o controlo do painel (0.5x / 1.0x / 1.3x) — mexer nele
faria o botão "1.0x" deixar de significar velocidade normal. Este é o ritmo
do JOGO em si: multiplica o passo de tempo de tudo (jogadores, bola, timers,
cadências), por isso abranda a partida inteira de forma coerente em vez de
travar só quem corre.

    1.00   ritmo original
    0.90   -10% (pedido)
    0.81   -10% de novo, sobre o 0.90 (pedido)
    0.891  +10% sobre o 0.81 (pedido)
    0.8019 -10% sobre o 0.891 (pedido)
    0.88209 +10% sobre o 0.8019 (pedido)
    0.793881 -10% sobre o 0.88209 (pedido)
*/
const GAME_SPEED = 0.793881;

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
        short: 30 / 106,      // 30 m — bloco curto
        median: 40 / 106,     // 40 m — bloco médio (padrão)
        large: 50 / 106       // 50 m — bloco longo
    },

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
    LB: { comBola: 0.04, semBola: 0.04 },
    RB: { comBola: 0.04, semBola: 0.04 },
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
        avanco: 4, cruzar: 1.25, colaNaLinha: true
    },
    fullback_finisher: {
        nome: 'Full-back Finisher', posicoes: ['LB', 'RB'],
        largura: -5, remate: 1.2, cruzar: 0.8,
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
    defenderFactor: 0.55
};

/*
Modelo de passe e condução.

`carryChance*` é a probabilidade de conduzir em vez de passar quando há um
alvo disponível — sob pressão desce 0.15.

O lançamento (passe para o espaço nas costas da linha adversária) não existia:
todos os passes miravam a posição actual de um colega. Estes valores dizem onde
se põe a bola em relação à linha que o nível 1 do adversário já calcula.
*/
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
    throughBallMaxDist: 45.0,
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
    elevacaoLancamento: 24 * Math.PI / 180,

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
        anguloLongoMin: 32 * Math.PI / 180,
        anguloLongoMax: 42 * Math.PI / 180
    },

    /*
    Com que velocidade a bola CHEGA ao alvo num passe rasteiro.

    4.5 fica confortavelmente abaixo do `BallControl.easySpeed` (7.75): a
    bola chega viva mas dominável. Esteve a 1.0, e a 1 m/s morria antes de
    lá chegar — era o que punha os dois testes deste ficheiro a vermelho.

    Com o reforço do passe curto (ver velocidadeRasteiraPara) uma bola de
    3 m chega a 6.12 m/s e uma de 25 m a 3.00 m/s.
    */
    vChegadaRasteira: 2.8,
    vChegadaCruzamento: 2.8,
    vChegadaLancamento: 2.8,

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
    sigmaMax: 0.16,        // ~9.2 graus
    sigmaMin: 0.012,       // ~0.7 graus
    pesoTecnica: 0.35,
    raioPressao: 3.5,
    pressaoMult: 1.8,
    costasMult: 2.0,
    forcaMinPressao: 0.85,
    sigmaTecto: 0.35
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
const GoalkeeperStyle = {
    defensive: { depthMin: 1.2, depthMax: 6.0, sweepOut: 6.0 },
    offensive: { depthMin: 1.8, depthMax: 11.0, sweepOut: 20.0 }
};

// Referências da curva de profundidade: borda da grande área e meio-campo
// adversário. Entre elas a profundidade cresce; fora delas está saturada.
const GK_D_NEAR = 16.5;
const GK_D_FAR = 55.0;

/*
Posição de ancoragem do guarda-redes, em repouso e a defender.

Função PURA de propósito: não lê Match nem window, só os cinco argumentos, e
por isso é testável isolada (ver tests/gk_anchor.test.js).

Profundidade: cresce com a distância da bola à baliza, com easing quadrático —
o recuo acelera junto da área, que é onde importa.

Lateral: bissetriz do ângulo bola-postes, recuada de depth. O desvio encolhe
sozinho conforme ele recua para a linha; é geometria, não uma constante à mão.
*/
function gkAnchor(ballX, ballZ, ownGoalZ, dirZ, style) {
    const e = style || GoalkeeperStyle.defensive;

    const dx = ballX;
    const dz = ballZ - ownGoalZ;
    const d = Math.hypot(dx, dz);

    let t = (d - GK_D_NEAR) / (GK_D_FAR - GK_D_NEAR);
    t = Math.max(0, Math.min(1, t));
    const depth = e.depthMin + (e.depthMax - e.depthMin) * t * t;

    // d === 0 é a bola em cima do centro da baliza: sem direção definida, fica
    // no eixo. Sem esta guarda, depth/d dava NaN.
    const limitGKX = (LARGURA_BALIZA / 2) - 0.5;
    let x = (d > 0.0001) ? (ballX * (depth / d)) : 0;
    x = Math.max(-limitGKX, Math.min(limitGKX, x));

    return { x: x, z: ownGoalZ + depth * dirZ };
}

/*
Onde o guarda-redes se põe enquanto segura a bola: `segurarAvanco` metros à
frente da própria linha, no eixo.

Pura, como a gkAnchor. Existe para ele deixar de ficar completamente parado
durante os 5 a 8 segundos em que segura — andava zero e o campo ficava à
espera dele.
*/
function gkAlvoSegurando(ownGoalZ, dirZ) {
    return { x: 0, z: ownGoalZ + GoalkeeperPose.segurarAvanco * dirZ };
}

/*
Já pode relançar? Precisa de ter passado `segurarMinimo` — a folga para as
equipas se reorganizarem — e de haver alguém a quem jogar.

Devolver false não prende ninguém: ao fim de `segurarDur` o relançamento sai à
mesma, com o gesto do chuto (ver updateGK).
*/
function gkPodeLancar(tempoSegurando, temAlvo) {
    return tempoSegurando >= GoalkeeperPose.segurarMinimo && !!temAlvo;
}

/*
Alvo de varrida. Ao contrário de gkAnchor(), vai NA DIRECÇÃO da bola: é a
situação em que o guarda-redes sai mesmo, porque não há defensor entre o
atacante e a baliza. sweepOut trava quão longe.

Também pura, pelas mesmas razões de gkAnchor().
*/
function gkSweepTarget(ballX, ballZ, ownGoalZ, dirZ, style) {
    const e = style || GoalkeeperStyle.defensive;

    const dx = ballX;
    const dz = ballZ - ownGoalZ;
    const d = Math.hypot(dx, dz);
    if (d < 0.0001) return { x: 0, z: ownGoalZ };

    // Nunca ultrapassa a bola, nem sai mais do que sweepOut.
    const alcance = Math.min(d, e.sweepOut);
    return {
        x: (dx / d) * alcance,
        z: ownGoalZ + (dz / d) * alcance
    };
}

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
    // Meia-largura da pequena área: 5.5 m para cada lado de cada poste.
    pequenaAreaX: LARGURA_BALIZA / 2 + 5.5,   // ~9.16
    pequenaAreaZ: 5.5,                        // profundidade a partir da linha
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
        bracoX: -0.9,
        cotovelo: -2.0,
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

/*
Hash inteiro determinístico, para baralhar sem Math.random. A aparência tem de
ser ESTÁVEL: com Math.random o mesmo jogador mudava de cabelo a cada recarga e a
cada reconstrução do modelo.
*/
function hashAparencia(seed, sal) {
    let h = (seed * 2654435761 + sal * 40503) >>> 0;
    h ^= h >>> 15;
    h = (h * 2246822519) >>> 0;
    h ^= h >>> 13;
    return h >>> 0;
}

/*
Reparte `n` lugares por uma lista com `peso`, pelo método do maior resto: dá a
cada entrada a parte inteira da sua quota e distribui o que sobra por quem tem
maior resto. Devolve a lista de entradas repetidas, por ordem.

É isto que garante as proporções PEDIDAS em amostras pequenas. Sortear cada
jogador por hash independente parecia mais simples, mas em 22 amostras dava
tanto como um negro em vinte e dois e treze chuteiras brancas — o acaso não é
obrigado a respeitar os pesos, e um plantel é uma amostra pequena.
*/
function repartirPorPeso(lista, n) {
    const total = lista.reduce((soma, item) => soma + item.peso, 0);
    const quotas = lista.map((item) => {
        const exacta = (item.peso / total) * n;
        const inteira = Math.floor(exacta);
        return { item: item, inteira: inteira, resto: exacta - inteira };
    });

    let atribuidos = quotas.reduce((soma, q) => soma + q.inteira, 0);
    const porResto = quotas.slice().sort((a, b) => b.resto - a.resto);
    for (let i = 0; atribuidos < n; i++, atribuidos++) {
        porResto[i % porResto.length].inteira++;
    }

    const saida = [];
    for (const q of quotas) {
        for (let k = 0; k < q.inteira; k++) saida.push(q.item);
    }
    return saida;
}

// Baralha uma lista com Fisher-Yates, usando o hash em vez de Math.random.
function baralharPorHash(lista, seed) {
    const out = lista.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = hashAparencia(seed, i) % (i + 1);
        const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
    }
    return out;
}

/*
Aparência do jogador `indice` num plantel de `total`, para a equipa `seedEquipa`.

Constrói o plantel inteiro e devolve uma entrada. Recomputar por jogador é
trabalho a mais irrelevante — são onze entradas, uma vez, na construção das
equipas — e evita ter de guardar estado partilhado entre jogadores.

Cabelo e pele vêm sempre do MESMO tipo, para não sair ruivo de pele escura. As
chuteiras são repartidas à parte, e baralhadas com outro sal, para as duas
listas não ficarem alinhadas — senão todos os ruivos calçavam a mesma cor.
*/
function escolherAparencia(indice, total, seedEquipa) {
    const n = total || 11;
    const semente = (seedEquipa || 0) + 1;

    const tipos = baralharPorHash(repartirPorPeso(AppearanceModel.tipos, n), semente * 7919);
    const botas = baralharPorHash(repartirPorPeso(AppearanceModel.chuteiras, n), semente * 104729);

    const i = ((indice % n) + n) % n;
    const tipo = tipos[i];
    const bota = botas[i];

    return {
        tipo: tipo.nome,
        cabelo: tipo.cabelo,
        pele: tipo.pele,
        chuteira: bota.nome,
        corChuteira: bota.cor
    };
}

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
const RestlessModel = {
    raio: 2.0,             // metros à volta do alvo
    limiarChegada: 2.0,    // só mexe quem já lá chegou
    // Sorteados por jogador, para não pulsarem todos em sincronia.
    intervaloMin: 1.5,
    intervaloMax: 3.5
};

/*
Ponto a `raio` metros do alvo, na direcção `angulo`. Pura: sem Match, sem
THREE (ver tests/inquietacao.test.js).
*/
function offsetInquietacao(angulo, raio) {
    return { x: Math.cos(angulo) * raio, z: Math.sin(angulo) * raio };
}

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

// Meio-ângulo do cone de visão, em RADIANOS.
function coneVisao(tec) {
    const V = VisionModel;
    return (Math.max(V.anguloMin, tec * V.anguloPorTecnica) * Math.PI) / 180;
}

// Até onde o jogador lê o jogo, em metros. `minimo` permite a um consumidor
// exigir mais do que o piso geral, como o toque de condução já fazia.
function alcanceVisao(tec, minimo) {
    const V = VisionModel;
    return Math.max(minimo === undefined ? V.distanciaMin : minimo,
        tec * V.distanciaPorTecnica);
}

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

    // Toques de condução — distância do toque depende do espaço à frente
    touchLong: 2.8,       // toque longo (campo aberto, adversário > 15m)
    touchMedium: 1.6,     // toque médio (adversário entre 8-15m)
    touchShort: 0.96,     // toque curto (adversário perto < 8m)
    touchPower: 8.0,      // força base do toque (m/s)
    touchCooldown: 0.4,   // tempo mínimo entre toques (seg)
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
    margemLinhaFundo: 0.0
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
const MarkingModel = {
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
    biasMaxPorSetor: {
        atk: { low: 5.0, balanced: 7.0, high: 10.0 },
        mid: { low: 4.0, balanced: 6.0, high: 8.0 },
        def: { low: 3.0, balanced: 5.0, high: 6.0 }
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
    Até onde o marcador SAI DO SLOT para ir ao seu homem.

    Era o `biasMaxPorSetor` (3 a 10 m) a limitar isto, e o resultado medido
    era que a marcação só existia por acaso: com o homem a 15 m do slot o
    marcador ficava a 9.9 m dele; a 25 m, ficava a 19 m. Ou seja, marcava
    apenas quem já lhe calhasse ao lado — em campo lia-se como "não há
    marcação nenhuma, toda a gente corre atrás da bola".

    Marcar é ACOMPANHAR O HOMEM: quem recebeu a incumbência vai atrás dele e
    fica à distância que o Defensive Pressure manda. Este número existe só
    para impedir travessias absurdas do campo — e quem pode ser designado já
    está limitado pelo `corredorMax` no assignMarking.

    O `biasMaxPorSetor` continua a servir os desvios que NÃO são marcação
    (cobertura, basculação), onde a forma do bloco tem mesmo de mandar.
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

`marcadores`: [{ x, z, manter, ref }] - o ponto de onde cada um marca (o slot ja
inclinado pelo estilo), o que ele acompanhava e se a histerese ainda o segura.
Devolve um array pela MESMA ordem, com o adversario de cada um ou null.

Pura: sem Match, sem Tatics, sem THREE.
*/
function atribuirMarcacoes(marcadores, adversarios, raio) {
    const n = marcadores.length;
    const escolha = new Array(n).fill(null);
    if (!adversarios || !adversarios.length) return escolha;

    const tomados = new Set();

    // 1) Histerese primeiro: quem mantem o homem trava-o antes do leilao.
    for (let i = 0; i < n; i++) {
        const m = marcadores[i];
        if (!m || !m.manter || !m.ref) continue;
        if (adversarios.indexOf(m.ref) < 0) continue;   // saiu do campo
        if (tomados.has(m.ref)) continue;               // outro ja o segurava
        escolha[i] = m.ref;
        tomados.add(m.ref);
    }

    // 2) Leilao guloso: todos os pares dentro do raio, do mais perto ao mais longe.
    const pares = [];
    for (let i = 0; i < n; i++) {
        if (escolha[i]) continue;
        const m = marcadores[i];
        if (!m) continue;
        for (const o of adversarios) {
            // O guarda-redes nao se acompanha: fica na baliza dele.
            if (!o || o.role === 'gk' || !o.model) continue;
            if (tomados.has(o)) continue;
            const dx = o.model.position.x - m.x;
            const dz = o.model.position.z - m.z;
            const d2 = dx * dx + dz * dz;
            if (d2 < raio * raio) pares.push({ i: i, o: o, d2: d2 });
        }
    }
    pares.sort((a, b) => a.d2 - b.d2);

    for (const par of pares) {
        if (escolha[par.i] || tomados.has(par.o)) continue;
        escolha[par.i] = par.o;
        tomados.add(par.o);
    }

    return escolha;
}

/*
TRASEIRA DA ÚLTIMA LINHA A DEFENDER, em metros no referencial de ataque da
equipa (o `dir` do TeamBT: a própria baliza é o valor mais negativo).

O limite à frente do guarda-redes é um PISO — o recuo MÁXIMO — e não um
destino. Era usado como destino: o `centro` do bloco segue a bola menos 7 m,
o que com a bola no nosso meio-campo punha a traseira do rectângulo bem atrás
da baliza, e o limite repunha-a exactamente em gk+folga. Como a traseira do
bloco É o slot da última linha, os defesas iam todos parar à linha do
guarda-redes, com os atacantes soltos 10 m à frente.

A profundidade a sério vem de quem se está a marcar: a linha põe-se
`distancia` metros atrás do adversário mais recuado (a distância do Defensive
Pressure, MarkingModel.distanciaPorPressao). Só se o atacante já estiver em
cima da baliza é que o piso passa a mandar.

Este ajuste NUNCA sobe a linha por si: se o bloco já está à frente do ponto de
marcação, fica onde estava. `tectoDir` é o tecto da Linha Defensiva do painel,
que continua a travar a subida — mas o piso ganha-lhe, porque estar atrás do
guarda-redes não é opção.
*/
function recuoDaUltimaLinha(z0Dir, maisRecuadoDir, distancia, pisoDir, tectoDir) {
    let z = (tectoDir !== null && tectoDir !== undefined) ? tectoDir : z0Dir;
    if (maisRecuadoDir !== null && maisRecuadoDir !== undefined) {
        const atrasDoHomem = maisRecuadoDir - distancia;
        if (atrasDoHomem < z) z = atrasDoHomem;
    }
    if (tectoDir !== null && tectoDir !== undefined && z > tectoDir) z = tectoDir;
    if (pisoDir !== null && pisoDir !== undefined && z < pisoDir) z = pisoDir;
    return z;
}

/*
Onde este jogador se põe para acompanhar o homem: entre ele e a PRÓPRIA baliza,
a `distancia` metros dele, e nunca mais de `biasMax` fora do slot.

O limite é o que mantém a marcação dentro do setor — acompanha quem lhe entra na
zona, não sai a correr o campo atrás dele.

Pura: sem Match, sem Tatics, sem THREE.
*/
function pontoDeMarcacao(slotX, slotZ, alvoX, alvoZ, ownGoalZ, distancia, biasMax) {
    if (biasMax <= 0) return { x: slotX, z: slotZ };

    // Do homem para a própria baliza: é deste lado que se fica.
    let gx = 0 - alvoX;
    let gz = ownGoalZ - alvoZ;
    const gl = Math.hypot(gx, gz);
    if (gl > 0.0001) { gx /= gl; gz /= gl; } else { gx = 0; gz = 0; }

    const desejadoX = alvoX + gx * distancia;
    const desejadoZ = alvoZ + gz * distancia;

    // Desvio a partir do slot, cortado ao tecto.
    let dx = desejadoX - slotX;
    let dz = desejadoZ - slotZ;
    const d = Math.hypot(dx, dz);
    if (d > biasMax && d > 0.0001) {
        dx = (dx / d) * biasMax;
        dz = (dz / d) * biasMax;
    }

    return { x: slotX + dx, z: slotZ + dz };
}

/*
Apoio ao portador: quantos jogadores por equipa podem estar em cada um dos
dois estados de apoio ao mesmo tempo (ver actHoldPosition).

Sem tecto, TODA a gente sem bola que estivesse à frente da bola virava
FWR_SUPPORT e toda a que estivesse atrás virava AFT_SUPPORT — os dois
rótulos cobriam a equipa inteira e deixavam de dizer nada. Com tecto, ficam
os N melhores candidatos (os mais perto da bola) e o resto vai ocupar a
posição normal (MOVE_TO_POS), que é o que já devia acontecer.
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
        pesosSemPressao: { progresso: 1.0, espaco: 0.30, distancia: 0.35 },
        pesosSobPressao: { progresso: 0.45, espaco: 1.00, distancia: 0.20 },

        /*
        Abaixo desta nota não vale a pena passar a ninguém: o actPass desce a
        cascata driblar -> atrasar a alguém perto -> conduzir para trás.
        `tecnicaDrible` é o mesmo 75 que o podeDriblar já usa.
        */
        notaMinima: 0.35,
        tecnicaDrible: 75,

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
const GoalkeeperDistribution = {
    laterais: 0.0,
    chuteFrente: 1.0,
    // Um lateral mais longe do que isto não conta como saída curta.
    distanciaMaxLateral: 45.0,
    // Lateral com adversário a menos disto em cima não serve.
    folgaMinima: 4.0
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
    chanceMax: 0.97
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
const BallControl = {
    /*
    Raio de contacto com a bola, medido ao CORPO (ver distanciaAoCorpo), não
    à origem do modelo. Era 1.3 m: a bola podia estar a mais de um metro do
    corpo e mesmo assim contar como dominada, o que a fazia parecer solta ao
    lado do jogador em vez de no pé dele. -0.4 m aperta o domínio.
    */
    reach: 0.9,           // raio de contacto com a bola, em metros
    easySpeed: 7.75,      // abaixo disto domina-se sempre (a regra antiga)
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

    O sorteio decide só a QUALIDADE do amortecimento, não a posse: em
    qualquer dos casos a bola fica à frente dele e ele sai a jogar. Ganhou,
    morre-lhe aos pés (0.5 m); perdeu, repica mais longe (1.5 m) e fica
    disputável.
    */
    // Alturas medidas a partir dos PÉS do jogador (ver distanciaAoCorpo).
    // peitoYMin tem de ser >= peitoAltura (1.20, mais abaixo): bola abaixo do
    // peito de verdade não faz sentido matar no peito, é toque de pé normal.
    peitoYMin: 1.15,       // altura mínima do contacto para contar como peito
    peitoYMax: 1.35,      // acima disto é cabeça (ver ALTURA_CABECA), não peito
    peitoBase: 0.45,      // probabilidade base de amortecer bem
    peitoDur: 0.55,       // duração (s) do gesto
    peitoQueda: 0.5,      // metros à frente quando domina bem
    peitoRepique: 1.5,    // metros à frente quando falha
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

    Antes era teleportada no frame do contacto para `peitoQueda`/`peitoRepique`
    metros à frente e à altura do chão — nunca se via a bola encostada ao
    corpo, só a aparecer longe dele. Agora fica presa ao tronco durante
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
const HeaderModel = {
    alcanceMax: 16.0,          // alcance máximo de um alívio de cabeça
    alcancePasse: 8.5,         // alcance de escora para colega
    // Trajectória padrão e variantes
    elevacao: 22 * Math.PI / 180,        // elevação mais baixa para a bola descer rápido ao chão
    elevacaoAlivio: 28 * Math.PI / 180,  // elevação para alívio longo defensivo
    elevacaoEscora: 8 * Math.PI / 180,   // cabeceio/escora para baixo em direção ao chão

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
    apanhaBase: 0.35,      // probabilidade base de AGARRAR (senão espalma)
    ombroY: 1.35,          // altura do ombro acima da origem, de pé

    // Pose das pernas em voo: estendidas e ligeiramente abertas.
    coxaVoo: -0.25, joelhoVoo: 0.55, aberturaVoo: 0.18,

    pesoIK: 0.45           // suavização do IK dos braços por frame
};

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
const PerceptionModel = {
    // Só reage quem lá chega depressa. Acima disto é bola para o chaser, não
    // para toda a gente — senão a equipa inteira colapsa sobre a bola.
    janelaIntercetar: 1.2,
    // E só se for claramente melhor do que quem já vai lá (chaser/destinatário),
    // em segundos de vantagem.
    margemMelhor: 0.15,
    // Distância a partir da qual se considera que a bola JÁ passou o
    // destinatário do passe e ele deixa de ser dono da jogada.
    passePerdidoDist: 4.0
};

// Segundos que a equipa SEM bola espera, depois de a perder, antes de
// reavaliar chaser/marcação — ligado ao selector "Defensive Pressure".


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
const MentalidadeModel = {
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
    muito_defensiva: {
        agressao: 0.20,
        blocoZ: -10.0,
        tectoBloco: -(CAMPO_COMP / 2) / 3
    },
    defesa: {
        agressao: 0.35,
        blocoZ: -5.0,
        tectoBloco: -(CAMPO_COMP / 2) / 6
    },
    balanceado: {
        agressao: 0.50,
        blocoZ: 0.0,
        tectoBloco: 0.0
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
*/
const TeamPlayStyles = {
    possession: {
        nome: 'Possession',
        circulacao: 1.9, verticalidade: 0.6, viradas: 1.3,
        corredores: 0.9, cruzamento: 0.9, pressaoPosPerda: 1.0
    },
    direct: {
        nome: 'Direct',
        circulacao: 0.65, verticalidade: 1.4, viradas: 0.7,
        corredores: 1.0, cruzamento: 1.0, pressaoPosPerda: 1.0
    },
    counter_attack: {
        nome: 'Counter Attack',
        circulacao: 0.8, verticalidade: 1.25, viradas: 0.9,
        corredores: 1.0, cruzamento: 1.0, pressaoPosPerda: 0.8
    },
    wing_play: {
        nome: 'Wing Play',
        circulacao: 1.1, verticalidade: 0.9, viradas: 1.1,
        corredores: 1.5, cruzamento: 1.4, pressaoPosPerda: 1.0
    },
    positional: {
        nome: 'Positional',
        circulacao: 1.5, verticalidade: 0.75, viradas: 1.15,
        corredores: 1.1, cruzamento: 1.0, pressaoPosPerda: 1.0
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
    prioridadeSector: function(sector) {
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
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;

    const batedor = { x: bola.x + dx * 1.6, z: bola.z + dz * 1.6 };

    return { bola: bola, batedor: batedor, alvo: alvo };
}

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

