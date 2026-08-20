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
        this.updatePlayers(match.players, match, dt);
        this.updatePlayers(match.opponents, match, dt);
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
        const v0 = Math.hypot(vel.x, vel.z);
        const k = (typeof BallPhysics !== 'undefined') ? BallPhysics.kArrasto : 0.0135;
        const ux = v0 > 0.001 ? vel.x / v0 : 0;
        const uz = v0 > 0.001 ? vel.z / v0 : 0;

        let found = false;
        for (let t = 0.1; t <= 2.0; t += 0.1) {
            const d = (v0 > 0.001) ? Math.log(1 + k * v0 * t) / k : 0;
            const bx = ball.x + ux * d;
            const bz = ball.z + uz * d;
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
