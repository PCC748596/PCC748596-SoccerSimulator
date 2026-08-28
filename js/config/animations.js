/*
=============================================================================
CONFIG: ANIMAÇÕES E CLIPS DE AÇÃO
=============================================================================
Clips de keyframes para remates, reposições, laterais, guarda-redes e controlo.
=============================================================================
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
    gkThrow: { duration: 0.70, contactTime: 8 / 11 },
    // Arremesso lateral (ver ThrowInClip): a bola sai no frame 6 de 10.
    throwIn: { duration: 0.90, contactTime: 5 / 9 },
    // Remate (ver ShotClip). Contacto no frame 8 de 12 (t = 7/11 ≈ 0.64),
    // ou seja ~0.32 s depois de o BT decidir rematar — tempo real de armar a
    // perna. Antes o remate inteiro durava 0.2 s e eram duas poses.
    shot: { duration: 0.50, contactTime: 7 / 11 },
    // Domínio de bola orientado pela direita (ver BallControlRightClip)
    // Contacto e toque de saída no frame 5 de 8 (t = 4/7 ≈ 0.57)
    ballControlRight: { duration: 0.36, contactTime: 4 / 7 },
    ball_control_right: { duration: 0.36, contactTime: 4 / 7 }
};

/*
=============================================================================
SHOT_CLIP — remate em movimento, 12 keyframes
=============================================================================
Mesma convenção do GoalkeeperGroundKickClip:
    coxaChute   > 0  perna para TRÁS   (< 0 é para a FRENTE)
    joelhoChute > 0  joelho dobra, calcanhar sobe
    chest       > 0  tronco para a FRENTE
    leanZ       < 0  corpo inclina sobre o pé de apoio
    pelvisY          rotação da bacia (o "abrir e fechar" da anca no remate)

O que distingue isto do tiro de meta: aqui vem-se em CORRIDA, portanto há menos
inclinação lateral e muito mais ROTAÇÃO — a bacia abre na armação e fecha no
impacto, e é daí que vem a força. O braço contrário à perna de remate abre para
fora a contrabalançar (é o gesto mais visível na referência).

A REFERÊNCIA são as três fases clássicas do remate, lidas da direita para a
esquerda numa prancha de biomecânica: *toma de impulso* (a corrida), *fase
principal* (armação e contacto) e *fase final* (o acompanhamento).

Três coisas vieram de lá e não estavam no clip:

  - o BRAÇO CONTRÁRIO abre quase à horizontal na armação (`bracoLz` 1.85 no
    frame 4, era 1.35). É o gesto mais visível da prancha, e é o que
    contrabalança a perna que vai atrás;
  - na FASE FINAL o TRONCO INCLINA PARA TRÁS (`chest` negativo nos frames 10 e
    11). O clip punha-o a prumo, e o remate acabava com o corpo direito como
    quem pára de andar;
  - a INCLINAÇÃO LATERAL mantém-se até ao fim (`leanZ` -0.14 no frame 10, era
    -0.06): na prancha o corpo ainda está claramente inclinado sobre o pé de
    apoio depois de a bola sair.

     1  perna de remate começa a recuar, apoio a descer
     2  pé de apoio planta ao lado da bola, tronco inclina
     3  armação: joelho a ~100°, bacia abre
     4  armação máxima, braço contrário bem aberto
     5  bacia inicia a rotação para a frente
     6  chicote: a coxa acelera, o joelho ainda flectido
     7  extensão rápida da tíbia, pé quase na bola
     8  CONTACTO — perna esticada, tornozelo travado, corpo por cima da bola
     9  pós-impacto, a perna continua pela inércia
    10  follow-through alto, bacia fechada
    11  desaceleração, o pé desce
    12  recuperação, de novo em postura de jogo
=============================================================================
*/
const ShotClip = {
    pernaChute: 'r',
    contactFrame: 8,
    frames: [
        // 1  TOMA DE IMPULSO: a corrida ainda manda, a perna começa a recuar
        { leanZ: -0.05, pelvisY: 0.12, chest: 0.20, chestY: -0.12, coxaChute: 0.45, joelhoChute: 0.85, coxaApoio: -0.25, joelhoApoio: 0.32, bracoLx: -0.42, bracoLz: 0.70, bracoRx: 0.30, bracoRz: -0.35, cotoveloL: -0.55, cotoveloR: -0.70, altura: 0.00 },
        // 2  pé de apoio planta ao lado da bola, tronco inclina
        { leanZ: -0.11, pelvisY: 0.20, chest: 0.28, chestY: -0.20, coxaChute: 0.72, joelhoChute: 1.35, coxaApoio: -0.12, joelhoApoio: 0.36, bracoLx: -0.62, bracoLz: 1.05, bracoRx: 0.44, bracoRz: -0.42, cotoveloL: -0.42, cotoveloR: -0.80, altura: -0.01 },
        // 3  FASE PRINCIPAL: joelho a ~100°, bacia abre, braço contrário sobe
        { leanZ: -0.18, pelvisY: 0.28, chest: 0.34, chestY: -0.28, coxaChute: 0.92, joelhoChute: 1.80, coxaApoio: 0.00, joelhoApoio: 0.40, bracoLx: -0.78, bracoLz: 1.45, bracoRx: 0.54, bracoRz: -0.52, cotoveloL: -0.28, cotoveloR: -0.86, altura: -0.02 },
        // 4  armação máxima — braço contrário quase à HORIZONTAL (referência)
        { leanZ: -0.24, pelvisY: 0.34, chest: 0.36, chestY: -0.34, coxaChute: 1.05, joelhoChute: 2.05, coxaApoio: 0.04, joelhoApoio: 0.42, bracoLx: -0.88, bracoLz: 1.85, bracoRx: 0.62, bracoRz: -0.60, cotoveloL: -0.18, cotoveloR: -0.92, altura: -0.03 },
        // 5  a bacia inicia a rotação para a frente
        { leanZ: -0.24, pelvisY: 0.24, chest: 0.33, chestY: -0.24, coxaChute: 0.75, joelhoChute: 1.92, coxaApoio: 0.05, joelhoApoio: 0.40, bracoLx: -0.80, bracoLz: 1.72, bracoRx: 0.50, bracoRz: -0.58, cotoveloL: -0.20, cotoveloR: -0.84, altura: -0.02 },
        // 6  chicote: a coxa acelera, o joelho ainda flectido
        { leanZ: -0.22, pelvisY: 0.08, chest: 0.28, chestY: -0.10, coxaChute: 0.22, joelhoChute: 1.55, coxaApoio: 0.05, joelhoApoio: 0.34, bracoLx: -0.55, bracoLz: 1.45, bracoRx: 0.26, bracoRz: -0.62, cotoveloL: -0.24, cotoveloR: -0.70, altura: -0.01 },
        // 7  extensão rápida da tíbia, pé quase na bola
        { leanZ: -0.18, pelvisY: -0.06, chest: 0.20, chestY: 0.04, coxaChute: -0.35, joelhoChute: 0.75, coxaApoio: 0.06, joelhoApoio: 0.28, bracoLx: -0.22, bracoLz: 1.20, bracoRx: -0.05, bracoRz: -0.64, cotoveloL: -0.26, cotoveloR: -0.52, altura: 0.00 },
        // 8  CONTACTO — perna esticada, tornozelo travado, corpo por cima da bola
        { leanZ: -0.16, pelvisY: -0.16, chest: 0.12, chestY: 0.14, coxaChute: -0.72, joelhoChute: 0.10, coxaApoio: 0.06, joelhoApoio: 0.24, bracoLx: 0.05, bracoLz: 1.10, bracoRx: -0.28, bracoRz: -0.66, cotoveloL: -0.26, cotoveloR: -0.42, altura: 0.02 },
        // 9  pós-impacto, a perna continua pela inércia e o tronco começa a abrir
        { leanZ: -0.15, pelvisY: -0.24, chest: 0.00, chestY: 0.22, coxaChute: -1.30, joelhoChute: 0.08, coxaApoio: 0.07, joelhoApoio: 0.18, bracoLx: 0.24, bracoLz: 1.00, bracoRx: 0.06, bracoRz: -0.70, cotoveloL: -0.24, cotoveloR: -0.34, altura: 0.08 },
        // 10 FASE FINAL: perna alta e TRONCO PARA TRÁS (chest < 0), ainda inclinado
        { leanZ: -0.14, pelvisY: -0.30, chest: -0.12, chestY: 0.28, coxaChute: -1.85, joelhoChute: 0.05, coxaApoio: 0.09, joelhoApoio: 0.14, bracoLx: 0.40, bracoLz: 0.95, bracoRx: 0.36, bracoRz: -0.74, cotoveloL: -0.20, cotoveloR: -0.26, altura: 0.15 },
        // 11 desaceleração, o pé desce e o tronco volta ao prumo
        { leanZ: -0.08, pelvisY: -0.18, chest: -0.04, chestY: 0.16, coxaChute: -0.95, joelhoChute: 0.22, coxaApoio: 0.05, joelhoApoio: 0.18, bracoLx: 0.22, bracoLz: 0.60, bracoRx: 0.18, bracoRz: -0.48, cotoveloL: -0.15, cotoveloR: -0.18, altura: 0.06 },
        // 12 recuperação, de novo em postura de jogo
        { leanZ: 0.00, pelvisY: 0.00, chest: 0.00, chestY: 0.00, coxaChute: 0.00, joelhoChute: 0.10, coxaApoio: 0.00, joelhoApoio: 0.10, bracoLx: 0.00, bracoLz: Math.PI / 16, bracoRx: 0.00, bracoRz: -Math.PI / 16, cotoveloL: 0.00, cotoveloR: 0.00, altura: 0.00 }
    ]
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

/*
=============================================================================
LATERAL (throw-in) — a pose de quem vai repor a bola
=============================================================================
Só a POSE de espera, com a bola nas duas mãos por cima e por trás da cabeça —
a reposição em si (estado de jogo, alvo, força) ainda não existe neste
simulador, ver Match.state.

Convenção do rig (ver criarBraco/resetBonesToDefault em player.js): o braço
pende para -Y, portanto `rotation.x` mais NEGATIVO levanta-o para a frente e
por cima; a -π ficaria a apontar a direito para cima. -2.75 rad (~158°) deixa-o
um pouco atrás da vertical, que é onde o braço está no lateral.

`cotovelo` negativo dobra o antebraço para a frente do braço: com o braço já
por cima, é isso que traz as mãos para cima da testa em vez de as deixar
esticadas no ar.

`bracoZ` fecha os dois braços para dentro, para as mãos se encontrarem na bola
em vez de ficarem à largura dos ombros.
=============================================================================
*/
/*
=============================================================================
TIPOGRAFIA DAS COSTAS DA CAMISOLA
=============================================================================
Separado do desenho (player.js -> setBackTexture) para se experimentar uma
fonte sem mexer no código que a escreve.

`Bauhaus 93` é uma fonte do SISTEMA, não vem com o projecto: onde não estiver
instalada o browser cai calado no fallback seguinte, sem erro nenhum. Por isso
a cadeia acaba sempre num genérico.

O `pesoNumero` é vazio de propósito para a Bauhaus: ela já é pesada, e pedir
`bold` a uma fonte que não tem variante negra faz o browser sintetizar uma —
engorda os traços e fecha os contra-formas dos algarismos.
=============================================================================
*/
const CamisolaTipografia = {
    fonteNumero: '"Bauhaus 93", "Segoe UI", Arial, sans-serif',
    pesoNumero: '',
    fonteNome: '"Segoe UI", Arial, sans-serif',
    pesoNome: 'bold'
};

/*
=============================================================================
CANTO DO CAMPO — o quarto de circulo e a bandeirinha
=============================================================================
Faltavam os dois. O arco de canto tem 1 m de raio por regulamento, e a
bandeirinha e obrigatoria em campo oficial.

A bandeira e um plano com `DoubleSide`: de um lado so, desaparecia consoante
a camara — e a camara deste jogo anda a toda a volta.
*/

const LateralPose = {
    chest: -0.22,        // tronco em arco para trás, a armar o lançamento
    pelvisX: -0.06,

    bracoX: -2.75,       // os dois braços por cima, ligeiramente atrás
    /*
    `bracoZ` é ABDUÇÃO — abre o braço para FORA do corpo, e é aplicado antes da
    subida (ordem de Euler XYZ: o z roda primeiro, o x levanta depois). Esteve
    em 0.22 (V aberto) e depois em 0.05, e mesmo a 0.05 as mãos ficavam à
    largura dos ombros, com a bola a flutuar no meio delas sem lhes tocar.

    NEGATIVO é ADUÇÃO: fecha os braços para dentro. É só o ponto de partida —
    quem manda no valor final é o `fecharMaosNaBola` (player.js), que mede a
    distância entre as mãos e ajusta até elas encostarem mesmo na bola.
    */
    bracoZ: -0.16,
    cotovelo: -0.72,     // mais flectido: traz as mãos para trás da cabeça, não para cima dela

    /*
    FECHO DAS MÃOS NA BOLA. O `bracoZ` dos keyframes é um palpite: a distância
    entre as mãos depende da largura dos ombros, do comprimento do braço e do
    ângulo do cotovelo, tudo junto. Em vez de a adivinhar, mede-se e corrige-se
    (ver fecharMaosNaBola em player.js) — bissecção sobre o `bracoZ` até a
    distância entre os punhos bater no diâmetro da bola.

    `fechoIteracoes` é quantos passos de bissecção; 4 chegam para ficar abaixo
    de um centímetro. `fechoLimite` é o quanto o `bracoZ` pode andar do valor do
    keyframe, para a correcção nunca cruzar os braços.
    */
    fechoIteracoes: 4,
    fechoLimite: 0.55,
    fechoTolerancia: 0.01,   // metros

    /*
    GIRO DA CINTURA para o lado do arremesso, em radianos.

    Aplicado no `chest` e não na pélvis: rodar a bacia levava as pernas atrás
    dela e o jogador ficava de pés torcidos. A cintura é o que roda num lateral
    — o tronco, os ombros e os braços acompanham, os pés ficam plantados.

    `giroMax` é o tecto: mesmo com o alvo a 90° do corpo, a cintura não passa
    disto. O sinal e a fracção por keyframe vêm do `giro` do ThrowInClip —
    negativo na armação (roda ao contrário, a carregar) e positivo no chicote.
    */
    giroMax: 0.55,

    /*
    O QUE A CINTURA NÃO ALCANÇA, O CORPO DÁ (ver giroDoCorpoNoLateral em
    utils.js e o case LATERAL na fsm.js). Só o EXCESSO acima de `giroMax`:
    dentro do alcance da cintura o corpo continua de frente para o campo,
    exactamente como estava. Sem isto, atirar para trás deixava o jogador de
    lado para o alvo o gesto inteiro.

    `velGiroCorpo` é a velocidade dessa rotação, em rad/s. O corpo tem os
    ESPERA_APOS_REPOSICAO da espera mais a subida do clip até ao contacto para
    lá chegar; rodar de uma vez lia-se como um salto na imagem.
    */
    velGiroCorpo: 2.2,

    coxaFrente: -0.18,   // pé da frente adiantado
    joelhoFrente: 0.20,
    coxaTras: 0.22,      // e o outro atrás, a apoiar
    joelhoTras: 0.35,

    /*
    Quanto a bola fica ACIMA do ponto médio das mãos, em metros.

    As mãos seguram-na por baixo e pelos lados, portanto o centro dela não está
    à altura dos punhos — está acima deles. Sem este offset a bola ficava
    encaixada entre os punhos, meia enterrada nas mãos.

    A posição em si já não vem de constantes: a bola é colada ao ponto médio dos
    punhos lidos da matriz do mundo (ver colarBolaAsMaos em player.js), tanto na
    espera como em cada frame do gesto. As antigas `bolaAltura`/`bolaRecuo`, que
    fixavam a bola numa altura absoluta, foram removidas — era o que a punha a
    flutuar fora das mãos na pose de espera.
    */
    bolaAcimaDasMaos: 0.10,

    // Qual o pé que vai à frente ('r' ou 'l').
    peFrente: 'r'
};

/*
=============================================================================
THROW_IN_CLIP — arremesso lateral, 10 keyframes
=============================================================================
Parte da LateralPose (a pose de espera, já validada no ecrã) e leva-a pelo
gesto todo. Convenção do braço igual à da pose: `bracoX` MAIS negativo inclina
os braços para TRÁS por cima da cabeça, menos negativo traz-nos para a frente.

     1-2  espera, com a bola nas mãos por trás da cabeça
     3-4  arco para trás: tronco arqueia, braços passam por cima
     5    armação máxima
     6    LARGA A BOLA (contactFrame), braços a passar a vertical
     7-8  chicote para a frente, tronco fecha
     9-10 recuperação e regresso à postura de jogo

O pé de trás sobe na ponta no fim do gesto (`altura`), como quem se projecta —
sem isso o arremesso lê-se como um empurrão só de braços.
=============================================================================
*/
const ThrowInClip = {
    contactFrame: 6,   // índice 5, t = 5/9
    frames: [
        // 1: pose de espera
        { chest: -0.22, pelvisX: -0.06, bracoX: -2.75, bracoZ: -0.16, cotovelo: -0.72, giro: 0.00, coxaFrente: -0.18, joelhoFrente: 0.20, coxaTras: 0.22, joelhoTras: 0.35, altura: 0.00 },
        // 2: carrega o peso na perna de trás
        { chest: -0.30, pelvisX: -0.09, bracoX: -2.85, bracoZ: -0.17, cotovelo: -0.78, giro: -0.20, coxaFrente: -0.22, joelhoFrente: 0.24, coxaTras: 0.30, joelhoTras: 0.42, altura: -0.02 },
        // 3: arco para trás
        { chest: -0.42, pelvisX: -0.14, bracoX: -3.00, bracoZ: -0.18, cotovelo: -0.92, giro: -0.45, coxaFrente: -0.26, joelhoFrente: 0.26, coxaTras: 0.38, joelhoTras: 0.50, altura: -0.03 },
        // 4: quase no limite do arco
        { chest: -0.50, pelvisX: -0.17, bracoX: -3.12, bracoZ: -0.19, cotovelo: -1.00, giro: -0.60, coxaFrente: -0.28, joelhoFrente: 0.28, coxaTras: 0.42, joelhoTras: 0.55, altura: -0.04 },
        // 5: armação máxima, tudo carregado para trás
        { chest: -0.52, pelvisX: -0.18, bracoX: -3.18, bracoZ: -0.19, cotovelo: -1.02, giro: -0.65, coxaFrente: -0.26, joelhoFrente: 0.26, coxaTras: 0.40, joelhoTras: 0.52, altura: -0.04 },
        // 6: LARGA A BOLA — braços a passar a vertical, tronco já a fechar
        { chest: -0.05, pelvisX: -0.02, bracoX: -2.80, bracoZ: -0.16, cotovelo: -0.45, giro: 0.25, coxaFrente: -0.20, joelhoFrente: 0.20, coxaTras: 0.26, joelhoTras: 0.34, altura: 0.02 },
        // 7: chicote para a frente
        { chest: 0.26, pelvisX: 0.06, bracoX: -2.10, bracoZ: -0.10, cotovelo: -0.24, giro: 0.75, coxaFrente: -0.12, joelhoFrente: 0.16, coxaTras: 0.16, joelhoTras: 0.24, altura: 0.05 },
        // 8: braços à frente, corpo projectado
        { chest: 0.34, pelvisX: 0.08, bracoX: -1.30, bracoZ: 0.02, cotovelo: -0.12, giro: 1.00, coxaFrente: -0.06, joelhoFrente: 0.12, coxaTras: 0.08, joelhoTras: 0.18, altura: 0.06 },
        // 9: braços a cair, peso a passar para a frente
        { chest: 0.18, pelvisX: 0.04, bracoX: -0.60, bracoZ: 0.08, cotovelo: -0.10, giro: 0.70, coxaFrente: -0.02, joelhoFrente: 0.10, coxaTras: 0.04, joelhoTras: 0.14, altura: 0.02 },
        // 10: postura de jogo
        { chest: 0.00, pelvisX: 0.00, bracoX: 0.00, bracoZ: Math.PI / 16, cotovelo: 0.00, giro: 0.00, coxaFrente: 0.00, joelhoFrente: 0.00, coxaTras: 0.00, joelhoTras: 0.00, altura: 0.00 }
    ]
};

/*
Arremesso lateral: a que distância a bola cai e com que elevação. A potência
sai da balística (v = sqrt(R*g / sin2θ)), como no chutão do guarda-redes — não
de um número à mão.

O alcance é curto de propósito: um lateral não é um passe longo, e o
regulamento não deixa correr para o ganhar. O tecto escala com o atributo
STRENGTH de quem repõe — ver `alcanceMaxFraco`/`alcanceMaxForte` mais abaixo.
*/

const GoalkeeperThrowPower = 1.0;

/*
=============================================================================
GOALKEEPER_THROW_CLIP — lançamento com a mão do guarda-redes, 12 keyframes
=============================================================================
Lançamento overhand com o braço direito. A sequência segue as fases da
fotografia de referência:

    1-2  Pose de espera, bola na mão direita, braço ligeiramente para trás
    3-4  Armação: braço direito recua, cotovelo dobra, tronco inclina para trás
    5-6  Transição: braço sobe por cima da cabeça, cotovelo começa a estender
    7-8  Contacto: braço direito esticado para a frente/cima, bola sai
    9-12 Follow-through e recuperação

Convenção dos braços:
    bracoX  > 0  braço para a FRENTE   (< 0 é para TRÁS)
    bracoZ  > 0  braço para FORA do corpo (esquerdo) / < 0 para fora (direito)
    cotovelo  0  braço esticado, valores negativos dobram

O braço esquerdo contrabalança: começa à frente e sai para trás quando o
direito acelera para a frente.
=============================================================================
*/
const GoalkeeperThrowClip = {
    bracoLancamento: 'r', // Braço que lança a bola
    frames: [
        // 1  Pose de espera com a bola na mão direita
        { chest: 0.05, coxaL: 0.05, joelhoL: 0.12, coxaR: 0.05, joelhoR: 0.12, bracoLx: -0.35, bracoLz: 0.35, bracoRx: -0.65, bracoRz: -0.15, cotoveloL: -0.45, cotoveloR: -1.35, altura: 0.00 },
        // 2  Início do recuo do braço direito
        { chest: -0.05, coxaL: -0.05, joelhoL: 0.15, coxaR: 0.15, joelhoR: 0.15, bracoLx: -0.45, bracoLz: 0.40, bracoRx: -0.90, bracoRz: -0.25, cotoveloL: -0.50, cotoveloR: -1.45, altura: 0.00 },
        // 3  Armação máxima — braço direito bem atrás, tronco para trás
        { chest: -0.15, coxaL: -0.10, joelhoL: 0.18, coxaR: 0.30, joelhoR: 0.20, bracoLx: -0.55, bracoLz: 0.45, bracoRx: -1.25, bracoRz: -0.40, cotoveloL: -0.55, cotoveloR: -1.30, altura: -0.02 },
        // 4  Cintura descarrega, braço direito inicia aceleração para a frente
        { chest: -0.10, coxaL: -0.15, joelhoL: 0.20, coxaR: 0.45, joelhoR: 0.28, bracoLx: -0.30, bracoLz: 0.35, bracoRx: -0.70, bracoRz: -0.30, cotoveloL: -0.60, cotoveloR: -1.10, altura: -0.02 },
        // 5  Braço sobe por cima da cabeça, cotovelo a estender
        { chest: 0.00, coxaL: -0.20, joelhoL: 0.22, coxaR: 0.55, joelhoR: 0.35, bracoLx: 0.10, bracoLz: 0.30, bracoRx: -0.20, bracoRz: -0.15, cotoveloL: -0.50, cotoveloR: -0.85, altura: 0.00 },
        // 6  Aceleração balística — braço direito quase vertical
        { chest: 0.10, coxaL: -0.25, joelhoL: 0.20, coxaR: 0.40, joelhoR: 0.30, bracoLx: 0.40, bracoLz: 0.25, bracoRx: 0.30, bracoRz: -0.05, cotoveloL: -0.40, cotoveloR: -0.55, altura: 0.00 },
        // 7  Extensão máxima antes do contacto
        { chest: 0.20, coxaL: -0.30, joelhoL: 0.15, coxaR: 0.20, joelhoR: 0.20, bracoLx: 0.65, bracoLz: 0.20, bracoRx: 0.85, bracoRz: 0.00, cotoveloL: -0.30, cotoveloR: -0.25, altura: 0.02 },
        // 8  CONTACTO — bola sai da mão, braço esticado para a frente/cima
        { chest: 0.25, coxaL: -0.35, joelhoL: 0.10, coxaR: 0.00, joelhoR: 0.12, bracoLx: 0.75, bracoLz: 0.15, bracoRx: 1.10, bracoRz: 0.05, cotoveloL: -0.25, cotoveloR: -0.10, altura: 0.03 },
        // 9  Follow-through
        { chest: 0.20, coxaL: -0.25, joelhoL: 0.10, coxaR: -0.10, joelhoR: 0.12, bracoLx: 0.50, bracoLz: 0.15, bracoRx: 0.60, bracoRz: 0.10, cotoveloL: -0.35, cotoveloR: -0.35, altura: 0.02 },
        // 10 Follow-through continua, braço direito desce
        { chest: 0.10, coxaL: -0.15, joelhoL: 0.12, coxaR: -0.05, joelhoR: 0.12, bracoLx: 0.25, bracoLz: 0.15, bracoRx: 0.20, bracoRz: 0.10, cotoveloL: -0.45, cotoveloR: -0.60, altura: 0.01 },
        // 11 Desaceleração
        { chest: 0.05, coxaL: -0.05, joelhoL: 0.12, coxaR: 0.00, joelhoR: 0.12, bracoLx: 0.00, bracoLz: 0.15, bracoRx: -0.20, bracoRz: 0.05, cotoveloL: -0.55, cotoveloR: -0.85, altura: 0.00 },
        // 12 Recuperação para postura de jogo
        { chest: 0.05, coxaL: 0.05, joelhoL: 0.12, coxaR: 0.05, joelhoR: 0.12, bracoLx: -0.20, bracoLz: 0.15, bracoRx: -0.25, bracoRz: -0.05, cotoveloL: -0.70, cotoveloR: -1.00, altura: 0.00 }
    ]
};

/*
=============================================================================
BALL_CONTROL_RIGHT — Domínio orientado de bola pelo lado direito, 8 keyframes
=============================================================================
Quando a bola é recebida de frente pelo lado direito do jogador:
- Perna esquerda (apoio) vai um pouco para trás e flete ligeiramente o joelho
- Perna direita (domínio) vai um pouco à frente e abre para amortecer com a chapa/pé direito
- Tronco inclina ligeiramente à frente para amortecer o impacto
- Braços abrem em contrabalanço
- No frame de contacto, dá o toque orientado na direcção de saída do lance

     1  preparação: peso assenta no apoio, perna esquerda recua ligeiramente
     2  perna direita avança e abre ligeiramente para receber a bola
     3  aproximação máxima do pé à trajectória da bola
     4  amortecimento inicial: o pé direito recebe a bola
     5  CONTACTO / TOQUE ORIENTADO: toque de saída para onde vai jogar
     6  continuação do toque e transferência de peso para a frente
     7  recuperação postural: perna esquerda avança para arrancar
     8  transição fluida para a corrida / condução
=============================================================================
*/
const BallControlRightClip = {
    pernaControlo: 'r',
    contactFrame: 5,
    frames: [
        // 1  preparação: peso assenta no apoio, perna esquerda recua ligeiramente
        { chest: 0.12, chestY: -0.08, pelvisY: 0.08, leanZ: -0.05, coxaL: 0.18, joelhoL: 0.22, coxaR: -0.15, joelhoR: 0.35, coxaRz: -0.10, bracoLx: -0.25, bracoLz: 0.35, bracoRx: 0.20, bracoRz: -0.35, cotoveloL: -0.50, cotoveloR: -0.50, altura: 0.00 },
        // 2  perna direita avança e abre ligeiramente para receber a bola
        { chest: 0.18, chestY: -0.15, pelvisY: 0.14, leanZ: -0.08, coxaL: 0.28, joelhoL: 0.32, coxaR: -0.32, joelhoR: 0.42, coxaRz: -0.18, bracoLx: -0.35, bracoLz: 0.42, bracoRx: 0.28, bracoRz: -0.42, cotoveloL: -0.55, cotoveloR: -0.55, altura: -0.01 },
        // 3  aproximação máxima do pé à trajectória da bola
        { chest: 0.22, chestY: -0.18, pelvisY: 0.18, leanZ: -0.10, coxaL: 0.34, joelhoL: 0.38, coxaR: -0.45, joelhoR: 0.38, coxaRz: -0.22, bracoLx: -0.40, bracoLz: 0.45, bracoRx: 0.32, bracoRz: -0.45, cotoveloL: -0.58, cotoveloR: -0.58, altura: -0.02 },
        // 4  amortecimento inicial: o pé direito recebe a bola
        { chest: 0.20, chestY: -0.16, pelvisY: 0.16, leanZ: -0.08, coxaL: 0.30, joelhoL: 0.34, coxaR: -0.50, joelhoR: 0.28, coxaRz: -0.20, bracoLx: -0.36, bracoLz: 0.40, bracoRx: 0.26, bracoRz: -0.40, cotoveloL: -0.55, cotoveloR: -0.55, altura: -0.01 },
        // 5  CONTACTO / TOQUE ORIENTADO: toque de saída para onde vai jogar
        { chest: 0.16, chestY: -0.10, pelvisY: 0.12, leanZ: -0.05, coxaL: 0.22, joelhoL: 0.26, coxaR: -0.55, joelhoR: 0.18, coxaRz: -0.15, bracoLx: -0.28, bracoLz: 0.32, bracoRx: 0.18, bracoRz: -0.32, cotoveloL: -0.48, cotoveloR: -0.48, altura: 0.00 },
        // 6  continuação do toque e transferência de peso para a frente
        { chest: 0.12, chestY: -0.05, pelvisY: 0.06, leanZ: -0.02, coxaL: 0.12, joelhoL: 0.18, coxaR: -0.40, joelhoR: 0.12, coxaRz: -0.08, bracoLx: -0.18, bracoLz: 0.25, bracoRx: 0.10, bracoRz: -0.25, cotoveloL: -0.40, cotoveloR: -0.40, altura: 0.00 },
        // 7  recuperação postural: perna esquerda avança para arrancar
        { chest: 0.08, chestY: 0.00, pelvisY: 0.02, leanZ: 0.00, coxaL: 0.05, joelhoL: 0.12, coxaR: -0.20, joelhoR: 0.10, coxaRz: -0.03, bracoLx: -0.08, bracoLz: 0.20, bracoRx: 0.04, bracoRz: -0.20, cotoveloL: -0.30, cotoveloR: -0.30, altura: 0.00 },
        // 8  transição fluida para a corrida / condução
        { chest: 0.04, chestY: 0.00, pelvisY: 0.00, leanZ: 0.00, coxaL: 0.00, joelhoL: 0.10, coxaR: 0.00, joelhoR: 0.10, coxaRz: 0.00, bracoLx: 0.00, bracoLz: Math.PI / 16, bracoRx: 0.00, bracoRz: -Math.PI / 16, cotoveloL: 0.00, cotoveloR: 0.00, altura: 0.00 }
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
    0.912963 +15% sobre o 0.793881 (pedido)
    1.00     de volta ao ritmo original (pedido)
    0.90     -10% sobre o ritmo original (pedido)
    0.90     definido para 0.9 no PC (pedido)
*/
