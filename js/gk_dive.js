/*
=============================================================================
GkDive — mergulho do guarda-redes
=============================================================================
Três coisas, e só estas três (não é o sistema procedural completo do
tools/proceduralHumanAnimationSystem.md — é o recorte que resolve o mergulho):

  1. ROTAÇÃO POR QUATERNIÃO, UM EIXO SÓ.
     O corpo tomba à volta do eixo frontal do próprio modelo. Um eixo, um
     ângulo. O mergulho antigo compunha `pelvis.rotation.z` (o tombo) com
     `pelvis.rotation.x` (o pitch) em Euler, e o próprio comentário no código
     admitia o resultado: "deixava o boneco virado/torcido". Com um eixo só
     isso é geometricamente impossível.

  2. CENTRO DE MASSA BALÍSTICO.
     `p = p0 + v0·t + ½g·t²`, com fases: ler, impulso, voo, chão, levantar.
     Antes era `position.x += dirX * velocidade * dt` — um deslize lateral,
     não um mergulho. Agora ele agacha, impulsiona-se, voa e aterra.

  3. BRAÇOS POR IK (ver js/ik.js).
     `handTarget` = posição prevista da bola; a cadeia ombro-cotovelo-mão
     resolve-se para lá chegar. E o teste da defesa lê a posição REAL da mão
     no mundo, em vez de a estimar por trigonometria a partir do ângulo do
     ombro como fazia o código antigo. Pose e gameplay deixam de poder
     discordar: se defendeu, foi porque a mão lá estava.

O que este ficheiro NÃO faz: posicionamento do guarda-redes. Ele mergulha bem
para onde decidiu mergulhar; se decidiu mal, mergulha bem para o sítio errado.
Isso vive em updateGK (player.js) e é problema à parte.
=============================================================================
*/

const GkDive = {
    _v: new THREE.Vector3(),
    _v2: new THREE.Vector3(),
    _alvoMao: new THREE.Vector3(),
    _cima: new THREE.Vector3(0, 1, 0),
    _eixoZ: new THREE.Vector3(0, 0, 1),
    _qTilt: new THREE.Quaternion(),

    /*
    Arranca o mergulho.

        alvoX, alvoY   onde a bola vai passar (já previsto por quem chama)
        tipo           'baixo' | 'meio' | 'alto'
        dirX           lado do mergulho, em X do MUNDO (+1 / -1)
    */
    iniciar(p, alvoX, alvoY, tipo, dirX) {
        const D = GoalkeeperDive;
        const corpo = p.model;

        // Erro de Leitura: Goleiros piores erram a predição do ponto de interceptação
        const skill = p.skillFor ? p.skillFor('GK') : 50;
        const erroMulti = Math.max(0, (100 - skill) / 50); // 0 se 100, 1 se 50
        const erroX = (Math.random() - 0.5) * 1.5 * erroMulti;
        const erroY = (Math.random() - 0.5) * 1.2 * erroMulti;

        const alvoFinalX = alvoX + erroX;
        const alvoFinalY = Math.max(0, alvoY + erroY);

        /*
        A direcção que ele encara fica CONGELADA no início. Sem isto, o
        lookAt continuava a correr durante o mergulho e reescrevia o
        quaternião todos os frames — o tombo desaparecia.
        */
        _v1.set(corpo.position.x, corpo.position.y, corpo.position.z + p.dirZ * 10);
        lookAtBola(corpo, _v1);

        p.dive = {
            fase: 'ler',
            t: 0,
            dirX: dirX || 1,
            tipo: tipo || 'meio',
            alvoX: alvoFinalX,
            alvoY: alvoFinalY,
            x0: corpo.position.x,
            y0: corpo.position.y,
            v0x: 0, v0y: 0,
            tVoo: D.vooMax,
            ang: 0,
            angMax: D.anguloMax[tipo] || D.anguloMax.meio,
            qFacing: corpo.quaternion.clone(),
            tocou: false,
            agarrou: false
        };

        /*
        De que lado do MODELO fica o lado do mergulho.

        O eixo do tombo é o +Z local (a frente do jogador). Rodar +φ à volta
        dele leva a cabeça para o -X local. Mas o +X local só coincide com o
        +X do mundo para uma das equipas — a outra está virada ao contrário,
        e o sinal invertia-se. Lê-se o eixo X real do modelo em vez de o
        assumir.
        */
        this._v.set(1, 0, 0).applyQuaternion(p.dive.qFacing);
        p.dive.ladoLocal = Math.sign(this._v.x * p.dive.dirX) || 1;
    },

    /*
    Calcula o salto no instante em que as pernas largam o chão.

    O corpo não tem de percorrer a distância toda até à bola: o braço estende
    `alcanceBraco` para lá dele. Descontar isso é o que evita o guarda-redes
    a aterrar EM CIMA da bola em vez de a alcançar com a mão.
    */
    lancar(p) {
        const D = GoalkeeperDive;
        const d = p.dive;
        const corpo = p.model;
        const skill = p.skillFor('GK');

        const dx = d.alvoX - corpo.position.x;
        let distCorpo = dx - d.dirX * D.alcanceBraco;
        // Se o braço sozinho já lá chega, quase não é preciso deslocar corpo.
        if (Math.sign(distCorpo) !== Math.sign(dx)) distCorpo = 0;

        const velMax = D.velLateral + ((skill - 50) / 50) * D.velLateralSkill;
        d.tVoo = Math.min(D.vooMax, Math.max(D.vooMin, Math.abs(distCorpo) / velMax));
        d.v0x = distCorpo / d.tVoo;

        /*
        Componente vertical: resolve-se para o OMBRO estar à altura da bola
        no instante do contacto (`fracContacto` do voo), não no fim.
        */
        const g = BallPhysics.gravidade;
        const tc = d.tVoo * D.fracContacto;
        const hAlvo = Math.max(0, d.alvoY - D.ombroY * 0.5);
        d.v0y = Math.min(D.vySubidaMax, Math.max(0,
            (hAlvo - corpo.position.y + 0.5 * g * tc * tc) / tc));

        d.x0 = corpo.position.x;
        d.y0 = corpo.position.y;
        d.t = 0;
    },

    /*
    Um frame do mergulho. Devolve `false` quando acabou (o chamador volta ao
    estado 'idle').
    */
    update(p, dt, corpo, rig) {
        const D = GoalkeeperDive;
        const d = p.dive;
        if (!d) return false;

        d.t += dt;

        switch (d.fase) {
            case 'ler':
                // Agacha e carrega o peso na perna do lado do mergulho.
                this.poseCarregar(rig, Math.min(1, d.t / D.tempoLer) * 0.4);
                if (d.t >= D.tempoLer) { d.fase = 'passos'; d.t = 0; }
                break;
                
            case 'passos': {
                // Passada lateral curta para transferir momento
                const k = Math.min(1, d.t / D.tempoPassos);
                this.poseCarregar(rig, 0.4 + Math.sin(k * Math.PI) * 0.2); // Shuffle
                
                const dx = d.alvoX - corpo.position.x;
                const passoDir = Math.sign(dx);
                // Se ainda está longe, dá passada
                if (Math.abs(dx) > D.alcanceBraco * 1.5) {
                    corpo.position.x += passoDir * D.velPassos * dt;
                }
                
                // Transita para impulso
                if (d.t >= D.tempoPassos || Math.abs(dx) <= D.alcanceBraco) {
                    d.fase = 'impulso';
                    d.t = 0;
                }
                break;
            }

            case 'impulso': {
                const k = Math.min(1, d.t / D.tempoImpulso);
                // Comprime e estende: o pico da compressão é a meio.
                this.poseCarregar(rig, Math.sin(k * Math.PI) * 0.9);
                // O corpo já começa a tombar antes de sair do chão.
                d.ang = d.angMax * 0.18 * k;
                if (d.t >= D.tempoImpulso) { d.fase = 'voo'; this.lancar(p); }
                break;
            }

            case 'voo': {
                const g = BallPhysics.gravidade;
                const t = d.t;
                corpo.position.x = d.x0 + d.v0x * t;
                corpo.position.y = d.y0 + d.v0y * t - 0.5 * g * t * t;

                // Tombo: do 18% já feito no impulso até ao ângulo cheio,
                // com smoothstep para não haver ressalto na velocidade.
                const k = Math.min(1, t / d.tVoo);
                const s = k * k * (3 - 2 * k);
                d.ang = d.angMax * (0.18 + 0.82 * s);

                this.poseVoo(rig);
                this.mirarBola(p, rig, true);

                if (corpo.position.y <= D.alturaDeitado && d.v0y - g * t <= 0) { // Só aterra se estiver a cair
                    corpo.position.y = D.alturaDeitado;
                    d.fase = 'chao';
                    d.t = 0;
                    d.vSlide = d.v0x;
                }
                break;
            }

            case 'chao': {
                // Desliza e trava no relvado.
                const trav = D.atritoChao * dt * Math.sign(d.vSlide || 0);
                if (Math.abs(d.vSlide) <= Math.abs(trav)) d.vSlide = 0;
                else d.vSlide -= trav;
                corpo.position.x += d.vSlide * dt;
                corpo.position.y = D.alturaDeitado;
                d.ang = d.angMax;

                this.poseChao(rig);
                if (!d.agarrou) this.mirarBola(p, rig);

                if (d.t >= D.tempoChao) { d.fase = 'levantar'; d.t = 0; }
                break;
            }

            case 'levantar': {
                const k = Math.min(1, d.t / D.tempoLevantar);
                const s = k * k * (3 - 2 * k);
                d.ang = d.angMax * (1 - s);
                corpo.position.y = D.alturaDeitado + (ALTURA_BASE_Y - D.alturaDeitado) * s;
                this.poseLevantar(rig, s);

                if (d.t >= D.tempoLevantar) {
                    corpo.position.y = ALTURA_BASE_Y;
                    corpo.quaternion.copy(d.qFacing);
                    p.resetBonesToDefault();
                    /*
                    Se agarrou a meio do voo, a posse já foi registada nessa
                    altura (ver `defender`) mas o estado só muda agora — senão
                    'segurando' tomava conta do rig a meio do mergulho e ele
                    levantava-se instantaneamente com a bola na mão.
                    */
                    p.gkEstado = d.agarrou ? 'segurando' : 'idle';
                    p.gkTempoMergulho = 0;
                    p.dive = null;
                    return false;
                }
                break;
            }
        }

        // --- A rotação. Um eixo, um ângulo, sempre. --------------------
        this._qTilt.setFromAxisAngle(this._eixoZ, -d.ladoLocal * d.ang);
        corpo.quaternion.copy(d.qFacing).multiply(this._qTilt);

        // Bola agarrada acompanha a mão durante o resto do mergulho.
        if (d.agarrou && rig.rHand) {
            rig[d.maoAgarrou || 'rHand'].getWorldPosition(this._v);
            Match.ball.position.copy(this._v);
            Match.ballVel.set(0, 0, 0);
        }

        return true;
    },

    /*
    Braços: os DOIS vão à bola por IK. É o que um guarda-redes faz na maioria
    das defesas, e evita ter de decidir qual é o braço líder — a cadeia que
    não chega fica esticada na direcção certa, que também é o correcto.

    O pole vector é o "para cima" do mundo: assim o cotovelo fica sempre por
    baixo da linha ombro-mão, mesmo com o corpo deitado. Ver a nota sobre pole
    vectors em js/ik.js.
    */
    mirarBola(p, rig, isVoo = false) {
        const D = GoalkeeperDive;
        const C = IKChains.braco;
        const d = p.dive;

        // Verifica se a bola já passou do guarda-redes ou se ele está caindo e perto do chão
        const bolaPassou = (Math.sign(p.dirZ) * (Match.ball.position.z - p.model.position.z) < -1.0); // Se passou a linha dele
        const caindo = (isVoo && d.v0y - BallPhysics.gravidade * d.t < 0);
        const pertoDoChao = (p.model.position.y < 0.8);
        const aPrepararQueda = !d.agarrou && (bolaPassou || (caindo && pertoDoChao));

        if (aPrepararQueda) {
            // "Braços para baixo, paralelos ao corpo" - prepara a queda no chão
            rig.lArm.rotation.x = lerpTo(rig.lArm.rotation.x, 0.2, 0.3);
            rig.rArm.rotation.x = lerpTo(rig.rArm.rotation.x, 0.2, 0.3);
            rig.lArm.rotation.z = lerpTo(rig.lArm.rotation.z, 0.1, 0.3);
            rig.rArm.rotation.z = lerpTo(rig.rArm.rotation.z, -0.1, 0.3);
            rig.lElbow.rotation.x = lerpTo(rig.lElbow.rotation.x, 0.1, 0.3);
            rig.rElbow.rotation.x = lerpTo(rig.rElbow.rotation.x, 0.1, 0.3);
            return;
        }

        // Ligeira antecipação: mira onde a bola vai estar, não onde está.
        const prev = (typeof preverBolaEm === 'function') ? preverBolaEm(0.06) : null;
        if (prev) this._alvoMao.set(prev.x, prev.y, prev.z);
        else this._alvoMao.copy(Match.ball.position);

        IK.resolverSuave(rig.lArm, rig.lElbow, C.L1, C.L2, this._alvoMao, this._cima, D.pesoIK);
        IK.resolverSuave(rig.rArm, rig.rElbow, C.L1, C.L2, this._alvoMao, this._cima, D.pesoIK);

        this.defender(p, rig);
    },

    /*
    Teste de defesa a partir da posição REAL da mão.

    O código antigo projectava onde a mão estaria:
        maoX = corpo.x + sin(|braço.rotation.z|) * 0.9 * dirX
    — uma estimativa a partir do ângulo do ombro, que ignorava o cotovelo e a
    rotação do corpo. Agora lê-se `getWorldPosition` da mão, que é onde ela
    está mesmo depois do IK.
    */
    defender(p, rig) {
        const D = GoalkeeperDive;
        const d = p.dive;
        if (d.tocou) return;
        if (Match.state !== 'PLAY') return;
        if (Match.ballVel.lengthSq() <= 0.0001) return;

        let melhorDist = Infinity, melhorMao = null;
        for (const nome of ['lHand', 'rHand']) {
            const mao = rig[nome];
            if (!mao) continue;
            mao.getWorldPosition(this._v);
            const dist = this._v.distanceTo(Match.ball.position);
            if (dist < melhorDist) { melhorDist = dist; melhorMao = nome; }
        }
        if (melhorMao === null || melhorDist > D.raioMao + BallPhysics.raio) return;

        d.tocou = true;

        /*
        A decisão é do `resolverDefesaGK` (utils.js), a mesma para os quatro
        tipos de defesa. O que este ramo sabe e os outros não é a EXTENSÃO: a
        distância real da mão à bola, medida com o IK já resolvido, contra o
        alcance de contacto. Bola no meio da luva = 0, bola na ponta dos dedos
        = 1 — e é isso que separa agarrar de deixá-la passar a raspar.
        */
        const alcance = D.raioMao + BallPhysics.raio;
        const extensao = Math.max(0, Math.min(1, melhorDist / Math.max(0.001, alcance)));
        const decisao = resolverDefesaGK({
            tipo: 'mergulho',
            gk: p.skillFor('GK'),
            tec: p.skillFor('TEC'),
            vChegada: Match.ballVel.length(),
            extensao: extensao,
            altura: Math.max(0, Match.ball.position.y - GkCatchModel.alturaPeito)
        });

        Match.lastTouchedPlayer = p;
        Match.lastTouchedTeam = p.team;

        if (decisao.resultado === 'agarra') {
            d.agarrou = true;
            d.maoAgarrou = melhorMao;
            // Posse já; a pose continua a ser do mergulho até ele se levantar.
            p.grabBall(true);
            return;
        }

        if (decisao.resultado === 'roca') {
            /*
            ROÇAR: tocou-lhe e ela segue. Trava-a um nada e desvia-a o mínimo —
            o suficiente para o toque contar (é ele que decide canto ou tiro de
            meta se ela sair), não para a tirar da baliza.
            */
            const M = GkCatchModel;
            Match.ballVel.multiplyScalar(M.rocarTravagem);
            Match.ballVel.x += d.dirX * (Math.random() * M.rocarDesvioMax);
            Match.ballVel.y += Math.random() * M.rocarDesvioMax * 0.5;
            return;
        }

        this.espalmar(p, d, decisao.qualidade);
    },

    /*
    A ESPALMADA, e para onde ela vai — decidido pela TÉCNICA (ver
    `destinoDaEspalmada` em utils.js), não à sorte como antes.

        canto     bola já colocada perto do poste ou por cima do ombro: sai
                  pela linha de fundo por fora da armação.
        lateral   volta ao campo, mas aberta e longe do miolo.
        meio      rebote curto à frente da baliza — o que um guarda-redes de
                  técnica fraca deixa, e a razão de haver recargas.

    No caso 'canto' a POSIÇÃO da bola é empurrada para fora da moldura no
    mesmo instante: a mão está na linha de golo, e sem isso ela atravessava o
    plano ainda dentro dos postes nos milissegundos seguintes — golo.
    */
    espalmar(p, d, qualidade) {
        const D = GoalkeeperDive;
        const bola = Match.ball.position;
        const folgaPoste = (LARGURA_BALIZA / 2) - Math.abs(bola.x);
        const alta = bola.y > D.espalmarAltaY;

        const destino = destinoDaEspalmada({
            qualidade: qualidade,
            podeSair: alta || (folgaPoste < D.espalmarForaMargem)
        });

        if (destino === 'canto') {
            if (alta) {
                bola.y = ALTURA_BALIZA + D.espalmarFolga;
                Match.ballVel.y = Math.max(Match.ballVel.y, D.espalmarSubida);
            } else {
                // Lado do poste onde ela ia: o do próprio remate, e não o do
                // mergulho — em bola central o `dirX` desempata.
                const ladoPoste = Math.sign(bola.x) || (d && d.dirX) || 1;
                bola.x = ladoPoste * ((LARGURA_BALIZA / 2) + D.espalmarFolga);
                Match.ballVel.x = ladoPoste * D.espalmarLateral;
                Match.ballVel.y = Math.max(Match.ballVel.y, 2.0);
            }
            // Sentido de z MANTIDO: atravessa a linha de fundo por fora.
            Match.ballVel.z *= D.espalmarForaZ;
        } else if (destino === 'lateral') {
            // Para o lado e para cima, de volta ao campo mas longe do miolo.
            Match.ballVel.z *= -0.5;
            Match.ballVel.x += (d ? d.dirX : 1) * (6 + Math.random() * 6);
            Match.ballVel.y += 3;
        } else {
            // Rebote curto: fica à frente da baliza, disputável.
            Match.ballVel.z *= -0.30;
            Match.ballVel.x = Match.ballVel.x * 0.3 + (Math.random() - 0.5) * 3;
            Match.ballVel.y += 1.5;
        }
        Match.lastTouchedPlayer = p;
        Match.lastTouchedTeam = p.team;
    },

    // --- Poses ---------------------------------------------------------
    // Simples de propósito: o que faz o mergulho ler bem é a trajectória e a
    // rotação de eixo único, não o detalhe das pernas.

    poseCarregar(rig, k) {
        const P = GoalkeeperPose.espera;
        rig.lLeg.rotation.x = lerpTo(rig.lLeg.rotation.x, P.coxa - 0.5 * k, 0.4);
        rig.rLeg.rotation.x = lerpTo(rig.rLeg.rotation.x, P.coxa - 0.5 * k, 0.4);
        rig.lKnee.rotation.x = lerpTo(rig.lKnee.rotation.x, P.joelho + 1.1 * k, 0.4);
        rig.rKnee.rotation.x = lerpTo(rig.rKnee.rotation.x, P.joelho + 1.1 * k, 0.4);
        rig.chest.rotation.x = lerpTo(rig.chest.rotation.x, P.chest + 0.25 * k, 0.3);
    },

    poseVoo(rig) {
        const D = GoalkeeperDive;
        rig.lLeg.rotation.x = lerpTo(rig.lLeg.rotation.x, D.coxaVoo, 0.25);
        rig.rLeg.rotation.x = lerpTo(rig.rLeg.rotation.x, D.coxaVoo, 0.25);
        rig.lKnee.rotation.x = lerpTo(rig.lKnee.rotation.x, D.joelhoVoo, 0.25);
        rig.rKnee.rotation.x = lerpTo(rig.rKnee.rotation.x, D.joelhoVoo, 0.25);
        rig.lLeg.rotation.z = lerpTo(rig.lLeg.rotation.z, D.aberturaVoo, 0.2);
        rig.rLeg.rotation.z = lerpTo(rig.rLeg.rotation.z, -D.aberturaVoo, 0.2);
        rig.chest.rotation.x = lerpTo(rig.chest.rotation.x, -0.1, 0.2);
    },

    poseChao(rig) {
        rig.lKnee.rotation.x = lerpTo(rig.lKnee.rotation.x, 1.0, 0.2);
        rig.rKnee.rotation.x = lerpTo(rig.rKnee.rotation.x, 0.7, 0.2);
        rig.lLeg.rotation.x = lerpTo(rig.lLeg.rotation.x, -0.35, 0.2);
        rig.rLeg.rotation.x = lerpTo(rig.rLeg.rotation.x, -0.15, 0.2);
    },

    poseLevantar(rig, s) {
        // Recolhe as pernas primeiro, estica no fim — é assim que se levanta.
        const dobra = Math.sin(s * Math.PI);
        rig.lKnee.rotation.x = lerpTo(rig.lKnee.rotation.x, 1.4 * dobra, 0.2);
        rig.rKnee.rotation.x = lerpTo(rig.rKnee.rotation.x, 1.4 * dobra, 0.2);
        rig.lLeg.rotation.x = lerpTo(rig.lLeg.rotation.x, -0.5 * dobra, 0.2);
        rig.rLeg.rotation.x = lerpTo(rig.rLeg.rotation.x, -0.5 * dobra, 0.2);
        rig.chest.rotation.x = lerpTo(rig.chest.rotation.x, 0.5 * dobra, 0.2);
        rig.lArm.rotation.x = lerpTo(rig.lArm.rotation.x, 0.4 * dobra, 0.2);
        rig.rArm.rotation.x = lerpTo(rig.rArm.rotation.x, 0.4 * dobra, 0.2);
        rig.lArm.rotation.z = lerpTo(rig.lArm.rotation.z, Math.PI / 16, 0.2);
        rig.rArm.rotation.z = lerpTo(rig.rArm.rotation.z, -Math.PI / 16, 0.2);
    }
};
