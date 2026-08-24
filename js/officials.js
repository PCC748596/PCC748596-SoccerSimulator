/*
=============================================================================
EQUIPA DE ARBITRAGEM — árbitro e dois assistentes
=============================================================================
Ficheiro auto-contido de propósito: os árbitros não entram em `Match.players`
nem em `Match.opponents`, não têm blackboard, não passam pelo BT, não disputam
a bola e não colidem com ninguém. Tudo o que fazem é ir para um ponto e animar
a passada. Metê-los nas listas dos jogadores obrigaria a filtrá-los em cada
ciclo que percorre um plantel — e são dezenas.

POSICIONAMENTO

  Assistentes: cada um cobre METADE de uma linha lateral, e as duas metades
  são diagonalmente opostas. Cada um acompanha a linha de fora-de-jogo da sua
  metade, que é o SEGUNDO ÚLTIMO jogador da equipa que ali defende — a mesma
  definição que o `publicarLinhaDeForaDeJogo` do Match usa, mas calculada aqui
  para não depender do estado de posse (o assistente segue a linha esteja ou
  não a equipa a atacar).

  Árbitro: corre a DIAGONAL contrária, a que o deixa sempre do lado oposto ao
  do assistente daquela metade. Com o assistente 1 em +X na metade -Z e o
  assistente 2 em -X na metade +Z, a diagonal do árbitro vai de (-X, -Z) a
  (+X, +Z).

  O árbitro projecta a bola nessa diagonal e depois AFASTA-SE ao longo dela até
  ficar a `RefereeModel.distanciaBola` da bola. É o pedido tal como foi feito;
  40 m é bastante mais do que a arbitragem real usa (15-25 m), por isso ficou
  num número só, fácil de baixar.
=============================================================================
*/
const RefereeModel = {
    // Diagonal do árbitro, em fracção da meia-largura e do meio-campo.
    diagonalX: 0.55,
    diagonalZ: 0.85,
    distanciaBola: 40.0,     // afastamento pedido, em metros
    velocidade: 5.2,         // m/s, ritmo de quem acompanha o jogo

    // Assistentes: quanto ficam PARA FORA da linha lateral.
    margemLinha: 1.4,
    velocidadeAssistente: 6.0,

    // Equipamento, preto por agora.
    corCamisa: 0x14161a,
    corCalcao: 0x14161a,
    corMeia: 0x14161a,
    corPele: 0xc68642
};

const Officials = {
    arbitro: null,
    assistentes: [],
    _ativo: true,

    /*
    Corpo simples, com a mesma linguagem visual dos jogadores (caixas) mas sem
    número, sem cara e sem pitons: o árbitro é cenário, não protagonista, e
    cada polígono aqui é polígono que não serve para nada.
    */
    criarCorpo: function () {
        const corpo = new THREE.Group();
        const R = RefereeModel;

        const matCamisa = new THREE.MeshStandardMaterial({ color: R.corCamisa, roughness: 0.9 });
        const matCalcao = new THREE.MeshStandardMaterial({ color: R.corCalcao, roughness: 0.9 });
        const matMeia = new THREE.MeshStandardMaterial({ color: R.corMeia, roughness: 0.9 });
        const matPele = new THREE.MeshStandardMaterial({ color: R.corPele, roughness: 0.8 });

        const rig = {};

        // Bacia à mesma altura da dos jogadores (ver resetBonesToDefault).
        const pelvis = new THREE.Group();
        pelvis.position.set(0, 2.6, 0);
        corpo.add(pelvis);
        rig.pelvis = pelvis;

        const chest = new THREE.Group();
        chest.position.y = 0.225;
        pelvis.add(chest);
        rig.chest = chest;

        const tronco = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.15, 0.55), matCamisa);
        tronco.position.y = 0.30;
        chest.add(tronco);

        const anca = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.45, 0.55), matCalcao);
        anca.position.y = -0.28;
        pelvis.add(anca);

        const pescoco = new THREE.Group();
        pescoco.position.y = 0.95;
        chest.add(pescoco);
        rig.neck = pescoco;
        const cabeca = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.62), matPele);
        cabeca.position.y = 0.32;
        pescoco.add(cabeca);

        const braco = (lado) => {
            const raiz = new THREE.Group();
            raiz.position.set(lado * 0.62, 0.525, 0);
            const sup = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 0.3), matCamisa);
            sup.position.y = -0.45;
            raiz.add(sup);
            const cot = new THREE.Group();
            cot.position.y = -0.9;
            raiz.add(cot);
            const inf = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.75, 0.26), matPele);
            inf.position.y = -0.38;
            cot.add(inf);
            raiz.rotation.z = lado * Math.PI / 16;
            chest.add(raiz);
            return { raiz: raiz, cot: cot };
        };
        const bE = braco(1), bD = braco(-1);
        rig.lArm = bE.raiz; rig.lElbow = bE.cot;
        rig.rArm = bD.raiz; rig.rElbow = bD.cot;

        const perna = (lado) => {
            const raiz = new THREE.Group();
            raiz.position.set(lado * 0.28, -0.3, 0);
            const coxa = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.9, 0.4), matPele);
            coxa.position.y = -0.45;
            raiz.add(coxa);
            const calcao = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.45, 0.46), matCalcao);
            calcao.position.y = 0.22;
            coxa.add(calcao);
            const joelho = new THREE.Group();
            joelho.position.y = -0.9;
            raiz.add(joelho);
            const canela = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.85, 0.36), matMeia);
            canela.position.y = -0.42;
            joelho.add(canela);
            const pe = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.22, 0.7), matMeia);
            pe.position.set(0, -0.92, 0.14);
            joelho.add(pe);
            pelvis.add(raiz);
            return { raiz: raiz, joelho: joelho };
        };
        const pE = perna(1), pD = perna(-1);
        rig.lLeg = pE.raiz; rig.lKnee = pE.joelho;
        rig.rLeg = pD.raiz; rig.rKnee = pD.joelho;

        corpo.scale.setScalar(0.42);   // mesma escala aparente dos jogadores
        return { corpo: corpo, rig: rig };
    },

    criarOficial: function (scene) {
        const feito = this.criarCorpo();
        scene.add(feito.corpo);
        return {
            model: feito.corpo,
            rig: feito.rig,
            animTimer: 0
        };
    },

    init: function (scene) {
        if (this.arbitro) return;
        this.arbitro = this.criarOficial(scene);
        this.assistentes = [this.criarOficial(scene), this.criarOficial(scene)];
    },

    /*
    SEGUNDO ÚLTIMO jogador de uma equipa, medido a partir da baliza dela: é
    esta a linha que o assistente acompanha. Inclui o guarda-redes, porque a
    regra conta jogadores e não funções — com o GK na baliza, o segundo último
    acaba por ser o defesa mais recuado, que é o que se quer.
    */
    linhaDeImpedimento: function (lista, dirZ) {
        const zs = [];
        for (let i = 0; i < lista.length; i++) {
            const p = lista[i];
            if (p && p.model) zs.push(p.model.position.z * dirZ);
        }
        if (zs.length < 2) return 0;
        zs.sort(function (a, b) { return a - b; });   // do mais recuado ao mais adiantado
        return zs[1] * dirZ;                          // o segundo mais recuado
    },

    /*
    Ponto da diagonal do árbitro mais próximo da bola, depois afastado ao longo
    dela até `distanciaBola`. Devolve {x, z}.
    */
    pontoDoArbitro: function (bola) {
        const R = RefereeModel;
        const ax = -(CAMPO_LARG / 2) * R.diagonalX, az = -(CAMPO_COMP / 2) * R.diagonalZ;
        const bx = (CAMPO_LARG / 2) * R.diagonalX, bz = (CAMPO_COMP / 2) * R.diagonalZ;

        const dx = bx - ax, dz = bz - az;
        const len2 = dx * dx + dz * dz;
        const comprimento = Math.sqrt(len2);

        let t = ((bola.x - ax) * dx + (bola.z - az) * dz) / len2;
        t = THREE.MathUtils.clamp(t, 0, 1);

        let px = ax + dx * t, pz = az + dz * t;

        /*
        Afasta-se ao longo da diagonal até estar a `distanciaBola` da bola, e
        para o lado de onde a jogada NÃO está — atravessar o meio do lance para
        cumprir a distância seria pior do que não a cumprir.
        */
        const dist = Math.hypot(px - bola.x, pz - bola.z);
        if (dist < R.distanciaBola) {
            const falta = (R.distanciaBola - dist) / comprimento;
            const sentido = (bola.z >= 0) ? -1 : 1;
            t = THREE.MathUtils.clamp(t + sentido * falta, 0, 1);
            px = ax + dx * t; pz = az + dz * t;
        }
        return { x: px, z: pz };
    },

    // Desloca um oficial para o alvo e anima a passada com o ciclo do jogo.
    mover: function (o, alvoX, alvoZ, velMax, dt) {
        const dx = alvoX - o.model.position.x;
        const dz = alvoZ - o.model.position.z;
        const d = Math.hypot(dx, dz);

        let passo = 0;
        if (d > 0.05) {
            passo = Math.min(d, velMax * dt);
            o.model.position.x += (dx / d) * passo;
            o.model.position.z += (dz / d) * passo;
        }
        const vel = dt > 0.0001 ? passo / dt : 0;

        // Vira-se para onde anda; quase parado, mantém a orientação.
        if (d > 0.4) o.model.rotation.y = Math.atan2(dx, dz);

        const rig = o.rig;
        if (vel > 0.1 && typeof getGaitPose === 'function') {
            const P0 = getGaitPose(0, vel);
            o.animTimer += (vel * dt) / P0.passada;
            const t = ((o.animTimer % 1.0) + 1.0) % 1.0;
            const P = getGaitPose(t, vel);
            rig.lLeg.rotation.x = P.lHip; rig.lKnee.rotation.x = P.lKnee;
            rig.rLeg.rotation.x = P.rHip; rig.rKnee.rotation.x = P.rKnee;
            rig.lArm.rotation.x = P.lArm; rig.rArm.rotation.x = P.rArm;
            rig.lElbow.rotation.x = P.cotovelo; rig.rElbow.rotation.x = P.cotovelo;
            rig.chest.rotation.x = P.tronco;
            o.model.position.y = P.ressalto;
        } else {
            const ossos = ['lLeg', 'rLeg', 'lKnee', 'rKnee', 'lArm', 'rArm', 'lElbow', 'rElbow'];
            for (let i = 0; i < ossos.length; i++) {
                rig[ossos[i]].rotation.x = lerpTo(rig[ossos[i]].rotation.x, 0, 0.2);
            }
            rig.chest.rotation.x = lerpTo(rig.chest.rotation.x, 0, 0.2);
            o.model.position.y = lerpTo(o.model.position.y, 0, 0.2);
        }
    },

    update: function (dt) {
        if (!this.arbitro || !this._ativo) return;
        if (typeof Match === 'undefined' || !Match.ball) return;

        const R = RefereeModel;
        const meiaLarg = CAMPO_LARG / 2;

        /*
        Assistente 1: linha lateral +X, metade z <= 0 — a que o TeamA defende
        (dirZ +1, baliza em -Z), logo segue a linha do TeamA.
        Assistente 2: linha lateral -X, metade z >= 0, linha do TeamB.
        As duas metades são diagonalmente opostas, como na arbitragem real.
        */
        const zA = this.linhaDeImpedimento(Match.players, 1);
        const zB = this.linhaDeImpedimento(Match.opponents, -1);

        this.mover(this.assistentes[0],
            meiaLarg + R.margemLinha,
            THREE.MathUtils.clamp(zA, -(CAMPO_COMP / 2), 0),
            R.velocidadeAssistente, dt);

        this.mover(this.assistentes[1],
            -(meiaLarg + R.margemLinha),
            THREE.MathUtils.clamp(zB, 0, CAMPO_COMP / 2),
            R.velocidadeAssistente, dt);

        const alvoArb = this.pontoDoArbitro(Match.ball.position);
        this.mover(this.arbitro, alvoArb.x, alvoArb.z, R.velocidade, dt);
    },

    setVisivel: function (on) {
        this._ativo = on;
        if (this.arbitro) this.arbitro.model.visible = on;
        for (let i = 0; i < this.assistentes.length; i++) {
            this.assistentes[i].model.visible = on;
        }
    }
};
