/*
=============================================================================
JointLimits — database de limites de rotação por articulação
=============================================================================
Valores anatómicos de referência (fornecidos), convertidos pra radianos e
ADAPTADOS ao rig simplificado que o modelo realmente tem (ver buildBody em
player.js): pelvis, chest, neck, lArm/rArm, lElbow/rElbow, lLeg/rLeg,
lKnee/rKnee, lFoot/rFoot — sem punho, sem antebraço (rádio/ulna), sem coluna
lombar/torácica separada (chest acumula as duas).

Convenção de eixo por osso (o que o código já usa hoje):
    rotation.x -> flexão/extensão (frente-trás)
    rotation.y -> rotação (esquerda-direita, yaw)
    rotation.z -> abdução/adução ou inclinação lateral (dobra de lado)

Ombro é 3DOF acoplado (não três eixos independentes) — usa `clampOmbro`, que
aplica uma restrição elíptica em vez de três clamps separados, exactamente
como pedido: o limite combinado encolhe quando mais de um eixo já está perto
do máximo dele.

NADA disto está ligado ao código de animação ainda — é só a base de dados.
Poses já afinadas (ex.: mergulho do GR, que inclina a pelve até 90° pra um
efeito dramático de queda, acima do limite anatómico de tronco) continuam
como estão até serem migradas de propósito.
=============================================================================
*/
const _DEG = Math.PI / 180;

const JointLimits = {
    // --- Pescoço / cabeça (rig.neck) ---
    neck: {
        y: { min: -80 * _DEG, max: 80 * _DEG },   // olhar esquerda/direita
        x: { min: -60 * _DEG, max: 50 * _DEG },   // olhar cima (+) / baixo (-)
        z: { min: -45 * _DEG, max: 45 * _DEG }    // inclinação lateral
    },

    // --- Tronco (rig.chest — acumula lombar+torácica; rig.pelvis abaixo) ---
    chest: {
        y: { min: -45 * _DEG, max: 45 * _DEG },   // rotação
        z: { min: -30 * _DEG, max: 30 * _DEG },   // inclinação lateral
        x: { min: -25 * _DEG, max: 60 * _DEG }    // extensão (-) / flexão (+)
    },

    // Pelve: fatia da rotação/inclinação do tronco que sobra pra pelve
    // (35% lombar + 40% pelve do documento fica tudo aqui, já que não há
    // osso lombar separado — ver `distribuirRotacaoTronco`).
    pelvis: {
        y: { min: -45 * _DEG, max: 45 * _DEG },
        z: { min: -30 * _DEG, max: 30 * _DEG },
        x: { min: -25 * _DEG, max: 60 * _DEG }
    },

    /*
    Ombro (rig.lArm/rArm): 3DOF elipsoidal, não três eixos independentes.
    Limites por eixo são o TECTO de cada um sozinho — `clampOmbro` reduz o
    tecto combinado quando mais de um já está perto do máximo.
        x -> elevação frontal (braço pra cima/frente)   0-180°
        z -> elevação lateral (braço pra fora)           0-180°
        y -> rotação interna (~70°) / externa (~90°)
    */
    shoulder: {
        x: { min: 0, max: 180 * _DEG },
        z: { min: 0, max: 180 * _DEG },
        y: { min: -70 * _DEG, max: 90 * _DEG }
    },

    // Cotovelo (rig.lElbow/rElbow): dobradiça, só rotation.x no rig.
    //   0°   = braço esticado
    //   150° = dobrado ao máximo
    elbow: {
        x: { min: 0, max: 150 * _DEG }
    },

    /*
    Anca (rig.lLeg/rLeg) — a mais importante pro futebol (corrida, chute,
    carrinho, giro, abertura lateral).
        x -> flexão (+120°) / extensão (-20 a -30°)
        z -> abdução (+45°) / adução (-30°)
        y -> rotação interna (~35°) / externa (~45°)
    */
    hip: {
        x: { min: -30 * _DEG, max: 120 * _DEG },
        z: { min: -30 * _DEG, max: 45 * _DEG },
        y: { min: -35 * _DEG, max: 45 * _DEG }
    },

    // Joelho (rig.lKnee/rKnee): dobradiça quase pura. rotation.z (giro
    // lateral) só existe mesmo, e pequeno, com o joelho já flectido.
    knee: {
        x: { min: 0, max: 145 * _DEG },
        z: { min: -5 * _DEG, max: 5 * _DEG }  // cresce um pouco com a flexão, ver clampJoelho
    },

    // Tornozelo (rig.lFoot/rFoot).
    //   x -> dorsiflexão (+) / flexão plantar (-)
    //   z -> inversão (+) / eversão (-)
    ankle: {
        x: { min: -45 * _DEG, max: 20 * _DEG },
        z: { min: -20 * _DEG, max: 35 * _DEG }
    },

    /* --- Helpers ---------------------------------------------------------- */

    clamp: function (grupo, eixo, valor) {
        const lim = this[grupo] && this[grupo][eixo];
        if (!lim) return valor;
        return Math.max(lim.min, Math.min(lim.max, valor));
    },

    /*
    Ombro: restrição elipsoidal simples. Normaliza cada eixo pela sua própria
    amplitude (0..1 da distância à borda), e se a soma dos quadrados
    ultrapassar 1 (fora da "elipse"), encolhe os três em conjunto — não deixa
    dois eixos ficarem os dois no máximo ao mesmo tempo (ombro anatomicamente
    não faz elevação frontal E lateral no tecto ao mesmo tempo).
    */
    clampOmbro: function (x, y, z) {
        const L = this.shoulder;
        x = Math.max(L.x.min, Math.min(L.x.max, x));
        y = Math.max(L.y.min, Math.min(L.y.max, y));
        z = Math.max(L.z.min, Math.min(L.z.max, z));

        const nx = x / L.x.max;
        const ny = (y >= 0) ? y / L.y.max : y / -L.y.min;
        const nz = z / L.z.max;
        const r = Math.sqrt(nx * nx + ny * ny + nz * nz);

        if (r > 1) {
            const k = 1 / r;
            x *= k; y *= k; z *= k;
        }
        return { x: x, y: y, z: z };
    },

    // Joelho: rotation.z (giro lateral) só é permitido quando já há flexão —
    // joelho esticado não gira de lado.
    clampJoelho: function (flexaoX, giroZ) {
        const L = this.knee;
        flexaoX = Math.max(L.x.min, Math.min(L.x.max, flexaoX));
        const fator = flexaoX / L.x.max; // 0 esticado .. 1 dobrado ao máximo
        const maxZ = L.z.max * fator;
        return { x: flexaoX, z: Math.max(-maxZ, Math.min(maxZ, giroZ)) };
    },

    /*
    Rotação/inclinação do TRONCO todo distribuída entre pelve e tórax
    (35% lombar + 40% pelve do documento -> 75% pelve, 25% tórax, já que
    não há osso lombar próprio neste rig): quem chamar decide um ângulo de
    tronco total já dentro dos limites de `chest`, e isto devolve a fatia de
    cada osso.
    */
    distribuirRotacaoTronco: function (anguloTotal) {
        return { pelvis: anguloTotal * 0.75, chest: anguloTotal * 0.25 };
    },

    // Pescoço: amplitude combinada encolhe se mais de um eixo já estiver
    // perto do limite — mesma ideia do ombro, mais simples (2 eixos fortes).
    clampPescoco: function (y, x, z) {
        const L = this.neck;
        y = Math.max(L.y.min, Math.min(L.y.max, y));
        x = Math.max(L.x.min, Math.min(L.x.max, x));
        z = Math.max(L.z.min, Math.min(L.z.max, z));

        const ny = (y >= 0) ? y / L.y.max : y / -L.y.min;
        const nx = (x >= 0) ? x / L.x.max : x / -L.x.min;
        const nz = (z >= 0) ? z / L.z.max : z / -L.z.min;
        const r = Math.sqrt(ny * ny + nx * nx + nz * nz);

        if (r > 1) {
            const k = 1 / r;
            y *= k; x *= k; z *= k;
        }
        return { y: y, x: x, z: z };
    }
};
