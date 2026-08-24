/*
PERCEPTION SYSTEM — Fase 1: Ball Perception -> Interception -> Ball Claim.

Camada só de leitura. Não decide nada, não chama fsm.changeState, não mexe
em Match.ballCarrier. Só enche player.blackboard com factos ("o que está a
acontecer"), pro Behavior Tree consumir ("o que eu faço"). Ver secção 3 do
spec — perception informa, BT decide, FSM executa.

    CAMPO/MUNDO -> Perception.tick() -> player.blackboard -> Behavior Tree

Reaproveita o que já existe em vez de duplicar: TeamBlackboard (team_bt.js)
já faz gather() de bb.ballX/ballZ/carrier a nível de EQUIPA; isto é a
camada a nível de JOGADOR (secção 4), mais fina (interceptable/timeToIntercept
por jogador), que team_bt.js passa a consumir no pickChaser (Ball Claim,
secção 16) em vez do "100 - dist" bruto que tinha antes.

Actualiza a ~15Hz por jogador (secção 17), não every frame — cada jogador
tem o seu próprio `perceptionTimer` desfasado (ver player.js) para não
recalcular todos no mesmo frame.
*/
const Perception = {
    HZ: 15,

    tick: function (match, dt) {
        this.reconstruirTrajectoria(match);
        this.updatePlayers(match.players, match, dt);
        this.updatePlayers(match.opponents, match, dt);
    },

    /*
    TRAJECTÓRIA PARTILHADA — a bola só tem uma, e é a mesma para os 22.

    Integra a bola 2 s à frente com a MESMA física do jogo (arrasto, gravidade,
    quique com restituição, perda horizontal no embate e travagem a rolar) e
    guarda uma amostra a cada `passoAmostra`. Uma vez por frame, não uma vez
    por jogador — 240 passos no total em vez de 240 × 22.

    Porquê: o cálculo antigo do ponto de interceptação usava a solução fechada
    do arrasto SÓ NO PLANO, e ignorava a altura por completo. Uma bola alta era
    tratada como se estivesse a rolar: o jogador ia para o sítio certo em
    planta, mas a bola estava 2 m no ar, quicava e passava-lhe por cima. Era o
    que se via.
    */
    horizonte: 2.0,
    passoAmostra: 0.05,
    _traj: null,

    reconstruirTrajectoria: function (match) {
        const B = BallPhysics;
        const dt = 1 / 120;
        const nAmostras = Math.round(this.horizonte / this.passoAmostra);
        const porAmostra = Math.round(this.passoAmostra / dt);

        if (!this._traj) {
            this._traj = [];
            for (let i = 0; i <= nAmostras; i++) this._traj.push({ x: 0, y: 0, z: 0 });
        }

        let x = match.ball.position.x, y = match.ball.position.y, z = match.ball.position.z;
        let vx = match.ballVel.x, vy = match.ballVel.y, vz = match.ballVel.z;

        this._traj[0].x = x; this._traj[0].y = y; this._traj[0].z = z;

        for (let a = 1; a <= nAmostras; a++) {
            for (let k = 0; k < porAmostra; k++) {
                const sp = Math.hypot(vx, vy, vz);
                if (sp > 0.001) {
                    const dv = B.kArrasto * sp * sp * dt;
                    vx -= vx / sp * dv; vy -= vy / sp * dv; vz -= vz / sp * dv;
                }
                vy -= B.gravidade * dt;
                x += vx * dt; y += vy * dt; z += vz * dt;

                if (y <= B.raio) {
                    y = B.raio;
                    if (vy < 0) {
                        if (-vy > B.vMinRessalto) {
                            vy *= -B.restituicao;
                            vx *= B.atritoRessalto;
                            vz *= B.atritoRessalto;
                        } else {
                            vy = 0;
                        }
                    }
                    const vh = Math.hypot(vx, vz);
                    if (vh > 0.0001) {
                        const dvh = Math.min(vh, B.atritoRolamento * B.gravidade * dt);
                        vx -= (vx / vh) * dvh;
                        vz -= (vz / vh) * dvh;
                        if (Math.hypot(vx, vz) < B.vMinRolar && vy === 0) { vx = 0; vz = 0; }
                    }
                }
            }
            this._traj[a].x = x; this._traj[a].y = y; this._traj[a].z = z;
        }
    },

    updatePlayers: function (list, match, dt) {
        for (let i = 0; i < list.length; i++) {
            const p = list[i];
            p.perceptionTimer -= dt;
            if (p.perceptionTimer > 0) continue;
            p.perceptionTimer = 1 / this.HZ;
            this.updateBallPerception(p, match);
        }
    },

    /*
    Secção 4 (percepção da bola) + secção 6 (interceptação).

    timeToIntercept: simula a posição futura da bola em passos de 0.1s (até
    2s à frente, previsão linear — a bola trava por atrito mas devagar
    nesse horizonte, ver airResistance em match.js) e pergunta, para cada
    passo, "um jogador a sprintar já lá chegava?". O primeiro `t` em que sim
    é o tempo de interceptação; sem isso, não é interceptável por corrida.
    Não é física exacta — é a mesma ideia de "look-ahead" usada em
    steerArrive, só aplicada à bola em vez de a um alvo estático.
    */
    updateBallPerception: function (p, match) {
        const bb = p.blackboard.ball;
        const ball = match.ball.position;
        const vel = match.ballVel;

        const dx = ball.x - p.model.position.x;
        const dz = ball.z - p.model.position.z;
        const dist = Math.hypot(dx, dz);
        const speed = Math.hypot(vel.x, vel.z);

        bb.visible = true;
        bb.distance = dist;
        bb.direction = dist > 0.001 ? { x: dx / dist, z: dz / dist } : { x: 0, z: 0 };
        bb.velocity.x = vel.x; bb.velocity.z = vel.z;
        bb.speed = speed;

        // Aproxima-se se a velocidade da bola aponta (grosso modo) para o
        // jogador, e não apenas "distância a diminuir" — isso apanha bolas
        // cruzadas ou desviadas na direcção dele, não só passes directos.
        if (speed > 0.3 && dist > 0.001) {
            const closingDot = (vel.x * dx + vel.z * dz) / (speed * dist);
            bb.approaching = closingDot < -0.3;
            bb.movingAway = closingDot > 0.3;
        } else {
            bb.approaching = false;
            bb.movingAway = false;
        }

        bb.controllable = dist < BallControl.reach && speed < BallControl.easySpeed;

        const carrier = match.ballCarrier;
        bb.teammatePossession = !!(carrier && carrier.team === p.team && carrier !== p);
        bb.opponentPossession = !!(carrier && carrier.team !== p.team);

        this.computeInterception(p, bb, match);
    },

    computeInterception: function (p, bb, match) {
        // Bola já com dono (ou o próprio jogador): não há o que interceptar.
        if (match.ballCarrier) {
            bb.interceptable = false;
            bb.interceptionPoint = null;
            bb.timeToIntercept = Infinity;
            bb.confidence = 0;
            return;
        }

        const ball = match.ball.position;
        const vel = match.ballVel;
        const skill = (p.skillFor ? p.skillFor('SPEED') : 50) / 100;

        // Velocidade máxima de perseguição deste jogador — mesma fórmula do
        // actChaseBall (player_bt.js), incluindo os multiplicadores de
        // velocidade sem bola. A percepção tem de prever o que o jogador é
        // MESMO capaz de fazer; com um número à parte, ou ele desistia de
        // bolas que alcançava ou corria atrás de bolas impossíveis.
        const maxChase = (5.8 + skill * 1.5) * 1.25 * 0.9;

        const px = p.model.position.x, pz = p.model.position.z;

        /*
        Previsão da trajectória com o arrasto REAL (quadrático, ver
        BallPhysics/updateBall). Antes usava-se um decaimento linear de
        0.15/s, que era a aproximação do modelo exponencial antigo — com a
        física nova ficou errado nos dois extremos: subestimava a travagem de
        uma bola rápida e exagerava a de uma bola lenta, e o ponto de
        interceptação saía fora sítio.

        Para arrasto quadrático puro no plano, a distância percorrida ao fim
        de `t` tem solução fechada:  d(t) = ln(1 + k·v0·t) / k
        */
        const traj = this._traj;
        if (!traj) {
            bb.interceptable = false;
            bb.interceptionPoint = null;
            bb.timeToIntercept = Infinity;
            bb.confidence = 0;
            return;
        }

        /*
        Percorre a trajectória partilhada e procura o primeiro instante em que
        este jogador já lá chega. Duas condições, e a segunda é nova:

          - chega ao ponto a tempo (corrida);
          - a bola está a uma altura JOGÁVEL nesse instante.

        A altura é o que faltava. Antes o ponto era escolhido em planta, sem
        olhar ao ar: escolhia-se o instante em que a bola ia estar por cima da
        cabeça dele, ele parava lá, e a bola quicava e seguia.
        */
        const alturaMax = ALTURA_TESTA + (typeof HeaderModel !== 'undefined' ? HeaderModel.janelaContacto : 0.3);

        let found = false;
        for (let a = 1; a < traj.length; a++) {
            const t = a * this.passoAmostra;
            const bx = traj[a].x, bz = traj[a].z, by = traj[a].y;
            if (by > alturaMax) continue;          // ainda alta demais para ser jogada

            const reachDist = Math.hypot(bx - px, bz - pz);
            const playerReach = maxChase * t;

            if (playerReach >= reachDist) {
                bb.interceptable = true;
                bb.interceptionPoint = { x: bx, z: bz };
                bb.timeToIntercept = t;
                // Confiança: margem entre o quanto ele alcança e o quanto
                // precisa — perto do limite (última hora) é baixa confiança.
                bb.confidence = THREE.MathUtils.clamp((playerReach - reachDist) / (maxChase * 0.5), 0.1, 1.0);
                found = true;
                break;
            }
        }

        if (!found) {
            bb.interceptable = false;
            bb.interceptionPoint = null;
            bb.timeToIntercept = Infinity;
            bb.confidence = 0;
        }
    },

    /*
    Secção 16 — Ball Claim. Não escolhe quem persegue (isso continua no
    pickChaser/team_bt.js, com a histerese top-3 que já existe); só calcula
    a pontuação que o pickChaser usa em vez do "100 - dist" bruto de antes.
    Combina timeToIntercept (principal) com confiança e um leve bónus de
    skill — jogador tecnicamente melhor reivindica bolas disputadas.
    */
    claimScore: function (p) {
        const bb = p.blackboard.ball;
        if (!bb.interceptable) return -Infinity;
        const skill = (p.skillFor ? p.skillFor('TEC') : 50) / 100;
        return 100 - bb.timeToIntercept * 20 + bb.confidence * 10 + skill * 5;
    }
};
