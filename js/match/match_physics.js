Object.assign(Match, {
    updateBall: function () {
        /*
        No LATERAL a bola está NAS MÃOS do batedor, e é ele que lhe escreve a
        posição todos os frames (aplicarFrameLateral, player.js). Deixar a
        física correr aqui punha a gravidade a puxá-la enquanto o clip a
        repunha — tremia no ar. Volta a correr assim que ela é largada, porque
        o lancarLateral põe o estado em PLAY.
        */
        if (this.state === 'THROW_IN') return;

        /*
        Integração semi-implícita: forças primeiro, posição depois. Constantes
        reais em BallPhysics (config.js) — 430 g, raio 0.11 m, g = 9.81 m/s²,
        ar a 1 atm ao nível do mar.
        */
        const B = BallPhysics;
        const dt = this.delta;
        const r = B.raio;

        // Arrasto do ar: quadrático (∝ v²) e nas TRÊS componentes. O modelo
        // anterior era exponencial e só em x/z — travava demais a bola lenta
        // e quase nada a bola rápida.
        if (!this.ballCarrier) {
            const v = this.ballVel.length();
            if (v > 0.001) {
                const dv = Math.min(v, B.kArrasto * v * v * dt);
                this.ballVel.addScaledVector(this.ballVel, -dv / v);
            }
        }

        if (this.ball.position.y > r + 0.001) {
            let grav = B.gravidade;
            // Efeito folha seca / topspin na falta direta: após superar a barreira ou no topo da parábola, cai mais acentuadamente
            if (this.freeKickDip && this.freeKickDip.active) {
                this.freeKickDip.timer += dt;
                // Aumenta a aceleração descendente proporcionalmente ao efeito/técnica
                grav += this.freeKickDip.extraGrav;
                if (this.ball.position.y <= r + 0.05 || this.freeKickDip.timer > 2.5) {
                    this.freeKickDip.active = false;
                }
            }
            this.ballVel.y -= grav * dt;
        }

        if (!this.prevBallPos) this.prevBallPos = new THREE.Vector3();
        this.prevBallPos.copy(this.ball.position);

        this.ball.position.addScaledVector(this.ballVel, dt);

        if (this.ball.position.y <= r) {
            this.ball.position.y = r;

            // Bola tocou no chão: reseta a contagem de cabeceios aéreos sucessivos
            this.aerialHeaderCount = 0;
            this.aerialHeaderTimer = 0;
            /*
            E a de peitos, pela mesma razão e no mesmo sítio: a sequência é
            "sem a bola assentar". Sem este zero o contador esgotava-se uma vez
            e a matada no peito desaparecia do resto do jogo.
            */
            this.peitosSeguidos = 0;

            // Ressalto: só ressalta se ainda vier com velocidade vertical
            // suficiente, senão assenta em vez de tremer no chão.
            if (this.ballVel.y < 0) {
                if (-this.ballVel.y > B.vMinRessalto) {
                    this.ballVel.y *= -B.restituicao;
                    this.ballVel.x *= B.atritoRessalto;
                    this.ballVel.z *= B.atritoRessalto;
                } else {
                    this.ballVel.y = 0;
                }
            }

            // Rolamento: desaceleração CONSTANTE (μ·g ≈ 0.98 m/s²), não uma
            // fracção da velocidade por segundo.
            const vh = Math.hypot(this.ballVel.x, this.ballVel.z);
            if (vh > 0.0001) {
                const dvh = Math.min(vh, B.atritoRolamento * B.gravidade * dt);
                this.ballVel.x -= (this.ballVel.x / vh) * dvh;
                this.ballVel.z -= (this.ballVel.z / vh) * dvh;
                if (Math.hypot(this.ballVel.x, this.ballVel.z) < B.vMinRolar && this.ballVel.y === 0) {
                    this.ballVel.x = 0; this.ballVel.z = 0;
                }
            }
        }

        this.ballVisual.scale.set(1, 1, 1);
        if (this.ballVel.lengthSq() > 0.1) {
            let speed = this.ballVel.length();
            _v1.set(this.ballVel.z, 0, -this.ballVel.x).normalize();
            _q1.setFromAxisAngle(_v1, (speed * this.delta) / r);
            this.ballVisual.quaternion.premultiply(_q1);
            this.ballVisual.quaternion.normalize();
        } else if (this.ballCarrier && this.ballCarrier.velocity.lengthSq() > 0.1) {
            let speed = this.ballCarrier.velocity.length();
            _v1.set(this.ballCarrier.velocity.z, 0, -this.ballCarrier.velocity.x).normalize();
            _q1.setFromAxisAngle(_v1, (speed * this.delta) / r);
            this.ballVisual.quaternion.premultiply(_q1);
            this.ballVisual.quaternion.normalize();
        }

        /*
        LATERAL. Corre antes da barreira do estádio: é ela que trava a bola, e
        se corresse primeiro a bola nunca chegava a estar fora.

        Regra: a bola tem de passar a linha por INTEIRO (por isso o `- raio`).
        Repõe quem NÃO lhe tocou por último.
        */
        if (this.state === 'PLAY' &&
            Math.abs(this.ball.position.x) - BallPhysics.raio > CAMPO_LARG / 2 &&
            // ...e a ir para FORA. Uma bola já lá fora mas a entrar (a reposição
            // acabada de fazer, um ressalto na barreira) não é lateral nenhum.
            Math.sign(this.ballVel.x) === Math.sign(this.ball.position.x)) {
            const ultimo = this.lastTouchedTeam || 'TeamA';
            const repoe = (ultimo === 'TeamA') ? 'TeamB' : 'TeamA';
            this.setupSetPiece('THROW_IN', repoe);
        }

        /*
        Barreira do estádio. Corre ANTES da detecção de golo/linha de fundo,
        que só olha para |z| > 53 e não sabe nada do que está para lá disso.

        Ressalto seco de propósito (restituicao 0.35 e atrito na componente
        paralela): a bola tem de morrer junto à bancada, não voltar disparada
        para o meio do campo.
        */
        {
            const BC = BarreiraCampo;
            const rB = BallPhysics.raio;
            if (this.ball.position.x > BC.x - rB) {
                this.ball.position.x = BC.x - rB;
                this.ballVel.x *= -BC.restituicao;
                this.ballVel.z *= BC.atrito;
            } else if (this.ball.position.x < -BC.x + rB) {
                this.ball.position.x = -BC.x + rB;
                this.ballVel.x *= -BC.restituicao;
                this.ballVel.z *= BC.atrito;
            }
            if (this.ball.position.z > BC.z - rB) {
                this.ball.position.z = BC.z - rB;
                this.ballVel.z *= -BC.restituicao;
                this.ballVel.x *= BC.atrito;
            } else if (this.ball.position.z < -BC.z + rB) {
                this.ball.position.z = -BC.z + rB;
                this.ballVel.z *= -BC.restituicao;
                this.ballVel.x *= BC.atrito;
            }
        }

        this.colidirComBaliza();
        this.destravarBolaEmCimaDaBaliza();

        if (Math.abs(this.ball.position.z) - BallPhysics.raio > CAMPO_COMP / 2) {
            let zSinal = Math.sign(this.ball.position.z);
            this.colidirComRede(zSinal);
            if (Math.abs(this.ball.position.x) < (LARGURA_BALIZA / 2 - 0.1) && this.ball.position.y < ALTURA_BALIZA) {

                if (this.state === 'PLAY') {
                    this.mudarEstado('GOAL', 'goal_scored');
                    this.goalSequenceStage = 0;
                    this.tempoParada = 0;
                    // Golo validado: o árbitro apita e aponta ao meio-campo.
                    if (typeof EfeitosSonoros !== 'undefined') EfeitosSonoros.apito(1.0);
                    
                    // zSinal < 0 é a baliza do TeamA, então quem levou o golo (e sai com a bola) é o TeamA
                    this.nextKickoffTeam = (zSinal < 0) ? 'TeamA' : 'TeamB';

                    if (typeof MatchStats !== 'undefined' && MatchStats[this.lastTouchedTeam]) {
                        MatchStats[this.lastTouchedTeam].remates.golos++;
                    }
                    if (this.lastTouchedTeam === 'TeamA') this.placarA++; else if (this.lastTouchedTeam === 'TeamB') this.placarB++;
                    this.updatePlacar();

                    const alerta = document.getElementById('alerta-golo');
                    alerta.style.opacity = '1'; alerta.style.transform = 'translate(-50%, -50%) scale(1.2)';
                    setTimeout(() => { alerta.style.transform = 'translate(-50%, -50%) scale(1)'; }, 150);

                    // Desvincula imediatamente qualquer posse
                    this.ballCarrier = null;
                    this.intendedReceiver = null;
                    this.passTargetPos = null;

                    this.gkHoldingBall.TeamA = false;
                    this.gkHoldingBall.TeamB = false;
                    [this.players[0], this.opponents[0]].forEach(gk => {
                        if (gk) {
                            gk.gkEstado = 'idle';
                            gk.gkTempoMergulho = 0;
                            gk.gkDirMergulho = 0;
                            gk.gkTipoMergulho = 'baixo';
                            gk.gkReagiu = false;
                            gk.gkDelayReacao = 0;
                            gk.dive = null;
                        }
                    });

                    // Logo após o golo, os jogadores não ficam parados: dirigem-se imediatamente
                    // para o meio-campo/posições de recomeço enquanto a câmara foca a bola na baliza
                    const margem = 1.5;
                    [{ list: this.players, dir: 1 }, { list: this.opponents, dir: -1 }].forEach(({ list, dir }) => {
                        list.forEach(p => {
                            p.hasBall = false;
                            p.isCross = false;
                            p.touchLock = 0;
                            if (p.role === 'gk') {
                                p.dynamicTarget.set(0, ALTURA_BASE_Y, -48 * dir);
                            } else {
                                let z = p.baseTarget.z;
                                if (p.role === 'def') {
                                    const cap = TeamShape.linhaDefensiva[Tatics.linhaDefensiva] ?? TeamShape.linhaDefensiva.medium;
                                    z = cap * dir;
                                }
                                if (z * dir > -margem) z = -margem * dir;
                                p.dynamicTarget.set(p.baseTarget.x, ALTURA_BASE_Y, z);
                            }
                            p.fsm.changeState('MOVE_TO_POS');
                            p.speedMult = 6.0; // Corrida rápida de regresso à formação
                        });
                    });
                }

                } else {
                if (this.state === 'PLAY') {
                    let lastTeam = this.lastTouchedTeam || 'TeamA';
                    /*
                    Bola fora pela linha de fundo:
                        último toque do ATACANTE  -> tiro de meta para quem
                                                     defende aquela baliza
                        último toque do DEFENSOR  -> canto para o atacante

                    Antes, o caso do tiro de meta caía num `resetPlay()` — a
                    bola voltava ao centro do campo como num recomeço, que não
                    é o que a regra manda.

                    z < 0 é a baliza do TeamA (dirZ +1 ataca +Z), z > 0 a do
                    TeamB.
                    */
                    const donoDaBaliza = (zSinal < 0) ? 'TeamA' : 'TeamB';
                    if (lastTeam === donoDaBaliza) {
                        // Defensor tocou por último: canto para quem ataca.
                        this.setupSetPiece('CORNER_KICK',
                            (donoDaBaliza === 'TeamA') ? 'TeamB' : 'TeamA');
                    } else {
                        // Atacante tocou por último: tiro de meta.
                        this.setupSetPiece('GOAL_KICK', donoDaBaliza);
                    }
                } else if (!(this.state === 'GOAL_KICK' && this.golKickBolaAlvo) &&
                           !(this.state === 'CORNER_KICK' && this.cantoBolaAlvo) &&
                           !this.dentroDaArmacao(zSinal)) {
                    /*
                    Jogo já parado (GOAL/OUT/bola parada) e a bola volta a
                    passar a linha de fundo fora da baliza. Antes fazia-se
                    `ballVel.z *= -0.5` — um ressalto de 50% contra nada, que
                    relançava com força uma bola já morta (ex.: bola entra na
                    baliza rente ao poste, o x sai do vão e cai aqui). Sem
                    jogo a decorrer não há ressalto nenhum: pára a bola.

                    Excepto logo a seguir a um tiro de meta recém-apitado
                    (`golKickBolaAtraso` a contar): aí deixa-se a bola
                    continuar o movimento fora do campo por um instante,
                    antes do teleporte para a quina da pequena área (ver
                    update()) — senão este clamp prendia-a na linha no
                    mesmo frame em que saiu, antes de o atraso pedido correr.

                    E excepto com a bola DENTRO da armação (`dentroDaArmacao`):
                    era isto que punha ~10% dos golos com a bola parada em cima
                    da linha, do lado de fora. O teste do vão acima é o do GOLO
                    (`|x| < LARGURA_BALIZA/2 - 0.1`, ou seja 3.56), mas a bola
                    encostada por dentro ao pano lateral descansa em
                    `LARGURA_BALIZA/2 - raio` = 3.55, e o passo de integração
                    leva-a até ~3.61 antes de a rede a corrigir — a
                    `colidirComRede` corre DEPOIS deste bloco. A faixa entre
                    3.56 e 3.66 é interior da baliza, não é bola fora.
                    */
                    this.ball.position.z = (CAMPO_COMP / 2) * zSinal;
                    this.ballVel.set(0, 0, 0);
                }
            }
        }

        if (this.state === 'GOAL') {
            if (this.goalSequenceStage === undefined) {
                this.goalSequenceStage = 0;
                this.tempoParada = 0;
            }
            
            if (this.goalSequenceStage === 0) {
                // Estágio 0: A bola fica na baliza e a câmara foca a bola enquanto os jogadores se dirigem para as suas posições
                this.tempoParada += this.delta;
                if (this.tempoParada >= 4.5) {
                    this.tempoParada = 0;
                    this.goalSequenceStage = 1;

                    // Oculta o aviso de golo antes de transitar a bola para o centro
                    const alerta = document.getElementById('alerta-golo');
                    if (alerta) alerta.style.opacity = '0';

                    // A bola vai para o meio-campo esperar a nova saída (a câmara transita suavemente para o centro)
                    this.ball.position.set(0, BallPhysics.raio, 0);
                    this.ballVel.set(0, 0, 0);
                    this.ballCarrier = null;
                    this.intendedReceiver = null;
                    this.passTargetPos = null;

                    [this.players[0], this.opponents[0]].forEach(gk => {
                        if (gk) {
                            gk.resetBonesToDefault();
                        }
                    });
                }
            } else if (this.goalSequenceStage === 1) {
                this.tempoParada += this.delta;
                // Espera todo mundo estar próximo da posição ou timeout breve
                let allInPosition = true;
                const margem = 1.5;
                [{ list: this.players, dir: 1 }, { list: this.opponents, dir: -1 }].forEach(({ list, dir }) => {
                    list.forEach(p => {
                        let targetZ, targetX = p.baseTarget.x;
                        if (p.role === 'gk') {
                            targetZ = -48 * dir;
                            targetX = 0;
                        } else {
                            let z = p.baseTarget.z;
                            if (p.role === 'def') {
                                const cap = TeamShape.linhaDefensiva[Tatics.linhaDefensiva] ?? TeamShape.linhaDefensiva.medium;
                                z = cap * dir;
                            }
                            if (z * dir > -margem) z = -margem * dir;
                            targetZ = z;
                        }
                        const distSq = p.model.position.distanceToSquared(_v1.set(targetX, ALTURA_BASE_Y, targetZ));
                        if (distSq > 9.0) { // Raio de tolerância (3m)
                            allInPosition = false;
                        }
                    });
                });

                if (allInPosition || this.tempoParada > 3.0) {
                    this.tempoParada = 0;
                    this.goalSequenceStage = 2;
                }
            } else if (this.goalSequenceStage === 2) {
                // Pequena pausa (1s) e inicia o kickoff
                this.tempoParada += this.delta;
                if (this.tempoParada > 1.0) {
                    this.tempoParada = 0;
                    this.goalSequenceStage = undefined;
                    this.resetPlay(this.nextKickoffTeam);
                    this.nextKickoffTeam = null;
                }
            }
        } else if (this.state === 'OUT' && this.ballVel.lengthSq() < 0.5) {
            this.tempoParada += this.delta;
            if (this.tempoParada > 2.0) {
                this.tempoParada = 0;
                this.resetPlay();
            }
        }
    },

    resolveBallContact: function () {
        /*
        Bola parada à espera de ser cobrada: ninguém lhe toca. No lateral está
        nas mãos do batedor; na falta e no penálti está pousada no chão à
        espera dos 3 s, e sem isto o primeiro que lhe passasse ao lado ficava
        com ela e a cobrança nunca acontecia.
        */
        if (this.state === 'THROW_IN' || this.state === 'FREE_KICK' ||
            this.state === 'PENALTY') return false;

        /*
        Prioridade do guarda-redes na própria área: sem isto, um atacante
        colado a ele (ex.: cena de disputa junto à baliza) podia ganhar-lhe
        o toque via disputa genérica abaixo (que só considera jogadores de
        linha) — o GR ficava eternamente agachado, sem nunca completar o
        'apanhar' porque a bola era sempre tocada por outro antes. Aqui, se
        ele estiver mesmo em cima da bola e dentro da própria área, agarra
        na hora, sem disputa.
        */
        const gks = [this.players[0], this.opponents[0]];
        for (const gk of gks) {
            if (!gk || gk.role !== 'gk' || gk.touchLock > 0) continue;
            if (this.state !== 'PLAY') continue;
            
            // CCD
            let d;
            if (this.prevBallPos) {
                const P1 = this.prevBallPos;
                const P2 = this.ball.position;
                const dx = P2.x - P1.x;
                const dz = P2.z - P1.z;
                const lenSq = dx * dx + dz * dz;
                let t = 0;
                if (lenSq > 0.000001) {
                    const dot = (gk.model.position.x - P1.x) * dx + (gk.model.position.z - P1.z) * dz;
                    t = Math.max(0, Math.min(1, dot / lenSq));
                }
                _v3.set(P1.x + t * dx, P1.y + t * (P2.y - P1.y), P1.z + t * dz);
                d = gk.model.position.distanceTo(_v3);
            } else {
                d = gk.model.position.distanceTo(this.ball.position);
            }
            
            if (d > 1.3) continue;
            const distZFromGoal = (this.ball.position.z - gk.ownGoalZ) * gk.dirZ;
            const dentroArea = Math.abs(this.ball.position.x) < Area.meiaLargura &&
                distZFromGoal < Area.profundidade &&
                distZFromGoal > -1.0;
            if (!dentroArea) continue;
            /*
            RECUO COM O PE: as maos estao proibidas. Nao se agarra, e a bola
            segue para o tratamento normal aqui em baixo — o guarda-redes
            joga-a com o pe como qualquer outro jogador.
            */
            if (maosProibidasNoRecuo(this.recuoParaGR, gk.team)) continue;

            /*
            Bola ao alcance do CORPO. Agarrava sempre — e é quase sempre isso
            que acontece, porque a `base.corpo` é alta e estas bolas vêm
            mansas. Mas passa pela mesma decisão dos outros três tipos (ver
            GkCatchModel): uma bola a 25 m/s ao corpo também escapa, e antes
            era impossível.

            `extensao` é a distância medida (`d`) sobre o alcance de 1.3 m que
            este ramo já usa como filtro.
            */
            gk.resolverDefesaComMaos('corpo', d / 1.3);
            return true;
        }

        const speed = this.ballVel.length();

        let best = null;
        let bestDist = 999;
        let bestAltura = 0;
        const considerar = (p) => {
            if (p.touchLock > 0) return;
            if (p.jumpTimer > 0 && p.hasHeaderedInJump) return;
            if (this.lastHeaderPlayer === p && this.aerialHeaderTimer > 0) return;
            if (this.lastHeaderPlayer && this.aerialHeaderTimer > (HeaderModel.cooldownDisputa - 0.35)) return;
            // O guarda-redes só controla a bola com o pé se as mãos estiverem proibidas (recuo)
            if (p.role === 'gk' && !maosProibidasNoRecuo(this.recuoParaGR, p.team)) return;
            // Companheiro de time NÃO tira a bola do próprio jogador com a bola
            if (this.ballCarrier && p !== this.ballCarrier && p.team === this.ballCarrier.team) return;
            // Distância ao CORPO (pés..testa), não à origem do modelo — ver
            // distanciaAoCorpo em utils.js.
            // CCD: raycasting contínuo (segmento de reta entre a posição anterior e atual)
            let r;
            if (this.prevBallPos) {
                const P1 = this.prevBallPos;
                const P2 = this.ball.position;
                const dx = P2.x - P1.x;
                const dz = P2.z - P1.z;
                const lenSq = dx * dx + dz * dz;
                let t = 0;
                if (lenSq > 0.000001) {
                    const dot = (p.model.position.x - P1.x) * dx + (p.model.position.z - P1.z) * dz;
                    t = Math.max(0, Math.min(1, dot / lenSq));
                }
                _v3.set(P1.x + t * dx, P1.y + t * (P2.y - P1.y), P1.z + t * dz);
                r = distanciaAoCorpo(p, _v3);
            } else {
                r = distanciaAoCorpo(p, this.ball.position);
            }
            if (r.dist < bestDist) { bestDist = r.dist; bestAltura = r.alturaContacto; best = p; }
        };
        this.players.forEach(considerar);
        this.opponents.forEach(considerar);

        if (!best || bestDist > BallControl.reach) return false;

        /*
        Anti Ping-Pong Aéreo / Domínio no Peito:
        1. Se a bola estiver na faixa do peito (ou se atingiu o limite de cabeceios seguidos),
           força o domínio no peito com os pés no chão.
        2. Limita a no máximo 2 cabeceios aéreos seguidos sem a bola assentar.
        */
        const maxHeaders = HeaderModel.maxHeadersSeguidos;
        const atingiuLimiteCabeca = this.aerialHeaderCount >= maxHeaders;

        const maxPeitos = BallControl.maxPeitosSeguidos;

        /*
        SEM NINGUÉM POR PERTO, O PEITO GANHA À CABEÇA.

        A decisão era só de altura. Sem pressão, matar no peito e ficar com a
        bola é melhor do que a cabecear para longe — a cabeça serve para
        aliviar, ou para chegar à bola antes de quem vem a chegar. Com espaço,
        ninguém cabeceia o que pode dominar.

        A faixa do peito sobe até `peitoAlturaLivre` quando não há adversário a
        menos de `peitoSemPressao`. Fora disso fica tudo como estava.
        */
        let tectoPeito = BallControl.peitoYMax;
        if (typeof BallControl.peitoSemPressao === 'number' && best.jumpTimer <= 0) {
            const rivais = (best.team === 'TeamA') ? this.opponents : this.players;
            let maisPerto = Infinity;
            for (const r of rivais) {
                if (!r || r.role === 'gk' || !r.model) continue;
                const d = r.model.position.distanceTo(best.model.position);
                if (d < maisPerto) maisPerto = d;
            }
            if (maisPerto >= BallControl.peitoSemPressao) {
                tectoPeito = Math.max(tectoPeito, BallControl.peitoAlturaLivre || tectoPeito);
            }
        }

        if ((bestAltura >= BallControl.peitoYMin && bestAltura <= tectoPeito && best.jumpTimer <= 0) ||
            (atingiuLimiteCabeca && bestAltura <= (ALTURA_TESTA + HeaderModel.janelaContacto) && best.jumpTimer <= 0)) {
            /*
            LIMITE DE PEITOS SEGUIDOS. Sem ele, dois jogadores lado a lado
            matavam a bola no peito um ao outro indefinidamente: o
            `colarBolaAoPeito` prende-a e zera-lhe a velocidade, e ao largar
            ela cai tão devagar que não sai da faixa do peito antes de o outro
            a apanhar. Passado o limite deixa-se cair — o toque normal aqui em
            baixo trata dela com o pé, ou ela chega ao chão e o contador zera.
            */
            if (best.fsm.currentState !== 'CHEST_CONTROL' && this.peitosSeguidos < maxPeitos) {
                this.aerialHeaderCount = 0;
                this.aerialHeaderTimer = 0;
                this.peitosSeguidos++;
                best.controlarNoPeito(bestAltura);
                return true;
            }
        }

        let dominou;
        if (speed < BallControl.easySpeed) {
            dominou = true;
        } else {
            const dificuldade = THREE.MathUtils.clamp(
                (speed - BallControl.easySpeed) / (BallControl.hardSpeed - BallControl.easySpeed), 0, 1);
            let hipotese = (best.skillFor('TEC') / 100) * (1 - dificuldade);
            if (best === this.intendedReceiver) hipotese += BallControl.receiverBonus;

            /*
            Técnica x Marcação: marcador colado ao receptor aperta o
            primeiro toque — reduz a chance de domínio limpo. Só conta se
            houver marcador mesmo perto (<3m); longe disso não interfere.
            */
            const marcadoresBest = (best.team === 'TeamA') ? this.opponents : this.players;
            let marcadorBest = null, distMarcBest = 999;
            for (const m of marcadoresBest) {
                if (m.role === 'gk') continue;
                const dm = m.model.position.distanceTo(best.model.position);
                if (dm < distMarcBest) { distMarcBest = dm; marcadorBest = m; }
            }
            if (marcadorBest && distMarcBest < 3.0) {
                const fatorMarc = THREE.MathUtils.clamp(
                    1 - (marcadorBest.skillFor('MARKING') - best.skillFor('TEC')) / 300, 0.6, 1.15);
                hipotese *= fatorMarc;
            }

            dominou = Math.random() < hipotese;
            best.touchLock = BallControl.retryLock;
        }

        if (typeof MatchStats !== 'undefined') MatchStats.registarRecepcao(best, dominou);

        if (!dominou) {
            this.deflectBall(best);
            return false;
        }

        this.ballCarrier = best;
        best.hasBall = true;

        /*
        O recuo morre no primeiro toque de outra pessoa: e o passe DELIBERADO
        do companheiro que proibe as maos, e ele acabou de ser jogado. Vale
        tambem para o proprio guarda-redes a tocar com o pe, que e o que a
        regra manda fazer.
        */
        this.recuoParaGR = null;
        // Alguém dominou a bola: a sequência de peitos acabou.
        this.peitosSeguidos = 0;
        this.intendedReceiver = null;
        this.passTargetPos = null;
        this.lastTouchedTeam = best.team;
        this.lastTouchedPlayer = best;
        /*
        DE PRIMEIRA? Decidido aqui, no instante em que a bola lhe chega — é o
        único sítio onde se sabe ao mesmo tempo quem a recebeu e com quanta
        gente em cima. Ver FirstTouchModel (config.js) e `jogaDePrimeira`.

        A flag é consumida em dois sítios: aqui em baixo, para não haver gesto
        de domínio, e no ramo `Dominar` da árvore (player_bt.js), para não
        haver espera de cadência.
        */
        best.jogarDePrimeira = false;
        if (best.role !== 'gk' && typeof jogaDePrimeira === 'function') {
            const advBest = (best.team === 'TeamA') ? this.opponents : this.players;
            let distAdv = Infinity;
            for (const o of advBest) {
                if (o.role === 'gk' || !o.model) continue;
                const d = Math.hypot(best.model.position.x - o.model.position.x,
                    best.model.position.z - o.model.position.z);
                if (d < distAdv) distAdv = d;
            }
            best.jogarDePrimeira = jogaDePrimeira(best.skillFor('TEC'), distAdv);
            if (best.jogarDePrimeira) {
                // Decide já: sem isto ficava à espera da cadência do
                // `Dominar` na mesma, e "de primeira" era só um nome.
                best.decisionTimer = 99;
                if (typeof MatchStats !== 'undefined' && MatchStats[best.team] &&
                    MatchStats[best.team].primeiraTocada !== undefined) {
                    MatchStats[best.team].primeiraTocada++;
                }
            }
        }

        /*
        DE ONDE VEIO A BOLA, guardado no instante do domínio.

        É o que permite ao `eixoDeConducao` (config.js) saber para onde ele quer
        SAIR: a direcção oposta àquela de onde a bola vem, que é o próprio
        sentido em que ela viajava. Lido a seguir, no estado CARRY, quando já
        não há velocidade nenhuma para consultar — a bola parou no pé dele.
        */
        {
            const v = this.ballVel;
            const len = v ? Math.hypot(v.x, v.z) : 0;
            if (len > 0.5) {
                best.dirEntradaBola = { x: v.x / len, z: v.z / len };
            }
        }

        if (this.kickoffTeam && best.team !== this.kickoffTeam) {
            this.kickoffPendingPassToDef = false;
        }


        /*
        Cabeceio quando o contacto foi mesmo na CABEÇA, e não só porque ele
        estava a saltar. Antes bastava `jumpTimer > 0` — um jogador a saltar
        com a bola nos pés cabeceava na mesma, e o contacto era medido a
        partir da origem do modelo (à altura da barriga, no salto).
        */
        /*
        Contacto à altura da TESTA. Era `> ALTURA_CABECA - 0.35`, ou seja
        qualquer coisa acima de 1.37 m contava como cabeceio, incluindo bolas
        que passavam bem por cima do crânio — cabeceava-se sem tocar nela.
        A janela é agora simétrica à volta da testa (ver ALTURA_TESTA).
        */
        if (Math.abs(bestAltura - ALTURA_TESTA) <= HeaderModel.janelaContacto) {
            best.executeHeader();
        } else {
            window.bolaChutada = false;
            [Match.players[0], Match.opponents[0]].forEach(gk => { if (gk) { gk.gkReagiu = false; } });

            /*
            DOMÍNIO DE BOLA ORIENTADO PELA DIREITA (ball_control_right).
            Quando a bola é recebida no solo por jogador de linha,
            executa a animação de domínio orientado pela perna direita.
            */
            if (best.role !== 'gk' && best.jumpTimer <= 0 &&
                !best.jogarDePrimeira &&
                best.fsm.currentState !== 'SET_PIECE_TAKER' &&
                best.fsm.currentState !== 'LATERAL' &&
                best.fsm.currentState !== 'CHEST_CONTROL') {

                let dirSaida = _v1;
                if (best.dynamicTarget) {
                    dirSaida.subVectors(best.dynamicTarget, best.model.position);
                    dirSaida.y = 0;
                }
                if (!best.dynamicTarget || dirSaida.lengthSq() < 0.01) {
                    dirSaida.set(0, 0, best.dirZ || 1);
                }
                best.iniciarDominioDireito(dirSaida);
            }
        }
        return true;
    },

    deflectBall: function (p) {
        this.ballVel.multiplyScalar(BallControl.deflectKeep);

        const restante = this.ballVel.length();
        const espalhar = BallControl.deflectSpread;
        this.ballVel.x += (Math.random() - 0.5) * restante * espalhar;
        this.ballVel.z += (Math.random() - 0.5) * restante * espalhar;
        this.ballVel.y = Math.max(this.ballVel.y, 1.2);

        this.intendedReceiver = null;
        this.passTargetPos = null;
        this.lastTouchedTeam = p.team;
        this.lastTouchedPlayer = p;
        window.bolaChutada = false;
    },

    afastarDoGuardaRedes: function (teamPlayers) {
        const gk = teamPlayers.find(p => p.role === 'gk');
        if (!gk) return;
        /*
        Com a bola agarrada nas mãos ele precisa de ângulo de passe — 2.5m só
        evita pisão de pé, não abre espaço nenhum. Companheiros ficavam
        encostados nele em vez de se abrirem para receber. Com a bola na mão
        o raio sobe bastante, forçando-os a afastar-se de verdade e criar
        linhas de passe.

        Migração por eventos (parte GK): antes lia gk.gkEstado directamente
        aqui; agora lê Match.gkHoldingBall, mantido por GK_CATCH_BALL/
        GK_RELEASE_BALL (ver EventBus.on no Match.init).
        */
        const comBolaNaMao = Match.gkHoldingBall[gk.team];
        // 2.5 era só "não pisar o pé" — a cobertura (defendZonal, isCovering)
        // puxa quem não tem homem pra marcar para o EIXO central perto da
        // própria baliza, que é exactamente onde o guarda-redes já está;
        // com raio tão curto ele ia lá quase todo o caminho antes de ser
        // empurrado (zagueiro "colado" ao GR em jogo corrido, sem a bola na
        // mão dele). 4.0 dá espaço visível sem exagerar como o 8.0 de
        // quando ele a segura.
        const raio = comBolaNaMao ? 8.0 : 4.0;
        for (const p of teamPlayers) {
            if (p === gk) continue;
            const dx = p.dynamicTarget.x - gk.model.position.x;
            const dz = p.dynamicTarget.z - gk.model.position.z;
            const dist = Math.hypot(dx, dz);
            if (dist >= raio) continue;
            if (dist < 0.001) { p.dynamicTarget.x += raio; continue; }
            const k = (raio - dist) / dist;
            p.dynamicTarget.x += dx * k;
            p.dynamicTarget.z += dz * k;
        }
    },

    publicarLinhaDeForaDeJogo: function (teamPlayers) {
        const bb = TeamAI.get(teamPlayers[0].team);
        if (this.possessionTeam !== teamPlayers[0].team) {
            bb.offsideLimitDir = null;
            return;
        }

        let limiteZ;
        if (teamPlayers[0].team === 'TeamA') {
            let maxOppZ = -999;
            Match.opponents.forEach(o => { if (o.role !== 'gk' && o.model.position.z > maxOppZ) maxOppZ = o.model.position.z; });
            limiteZ = Math.max(0, maxOppZ, Match.ball.position.z) - 0.2;
        } else {
            let minOppZ = 999;
            Match.players.forEach(o => { if (o.role !== 'gk' && o.model.position.z < minOppZ) minOppZ = o.model.position.z; });
            limiteZ = Math.min(0, minOppZ, Match.ball.position.z) + 0.2;
        }
        bb.offsideLimitDir = limiteZ * teamPlayers[0].dirZ;
    },

    destravarBolaEmCimaDaBaliza: function () {
        const b = this.ball.position;
        const v = this.ballVel;
        const rB = BallPhysics.raio;

        if (b.y < ALTURA_BALIZA - rB) return;                    // abaixo do travessao
        if (v.lengthSq() > 1.0) return;                          // ainda a voar

        const zSinal = Math.sign(b.z) || 1;
        const d = b.z * zSinal - CAMPO_COMP / 2;
        // Sobre a armacao, ou logo atras dela: fora disto e uma bola alta em
        // pleno campo, que nao tem nada de errado.
        if (d < -rB || d > GoalNet.profBase) return;
        if (Math.abs(b.x) > LARGURA_BALIZA / 2 + rB) return;

        b.z = (CAMPO_COMP / 2 + rB * 2) * zSinal;
        v.set(0, 0, 0);
    },

    colidirComRede: function (zSinal) {
        const rB = BallPhysics.raio;
        const N = GoalNet;
        const b = this.ball.position;
        const v = this.ballVel;
        const meiaLarg = LARGURA_BALIZA / 2;

        let d = b.z * zSinal - CAMPO_COMP / 2;
        let vd = v.z * zSinal;

        if (d < -rB) return;
        if (Math.abs(b.x) > meiaLarg + rB + 1.0) return;

        const a = ALTURA_BALIZA / (N.profBase - N.profTopo);
        const c = a * N.profBase;
        const norma = Math.hypot(a, 1);

        const dt = this.delta || 0.016;
        const prevX = b.x - v.x * dt;
        const prevY = b.y - v.y * dt;
        const prevD = (b.z - v.z * dt) * zSinal - CAMPO_COMP / 2;

        // --- laterais -------------------------------------------------
        if (d >= 0 && d <= N.profBase && b.y <= ALTURA_BALIZA) {
            if (Math.abs(b.x - meiaLarg) < rB || (prevX < meiaLarg && b.x > meiaLarg) || (prevX > meiaLarg && b.x < meiaLarg)) {
                if (typeof NetWave !== 'undefined') NetWave.bater(zSinal, v.x);
                if (v.x > 0) { b.x = meiaLarg - rB; } else { b.x = meiaLarg + rB; }
                v.x = -v.x * N.restituicao;
                v.z *= N.atrito; v.y *= N.atrito;
            } else if (Math.abs(b.x + meiaLarg) < rB || (prevX > -meiaLarg && b.x < -meiaLarg) || (prevX < -meiaLarg && b.x > -meiaLarg)) {
                if (typeof NetWave !== 'undefined') NetWave.bater(zSinal, v.x);
                if (v.x < 0) { b.x = -meiaLarg + rB; } else { b.x = -meiaLarg - rB; }
                v.x = -v.x * N.restituicao;
                v.z *= N.atrito; v.y *= N.atrito;
            }
        }

        // --- pano de cima (contínuo) ---------------------------------------------
        if (Math.abs(b.x) <= meiaLarg) {
            if (Math.abs(b.y - ALTURA_BALIZA) < rB || (prevY < ALTURA_BALIZA && b.y > ALTURA_BALIZA) || (prevY > ALTURA_BALIZA && b.y < ALTURA_BALIZA)) {
                let t = 0;
                if (b.y !== prevY) t = (ALTURA_BALIZA - prevY) / (b.y - prevY);
                const dCross = prevD + t * (d - prevD);
                if (dCross >= 0 && dCross <= N.profTopo) {
                    if (typeof NetWave !== 'undefined') NetWave.bater(zSinal, v.y);
                    if (v.y > 0) { b.y = ALTURA_BALIZA - rB; } else { b.y = ALTURA_BALIZA + rB; }
                    v.y = -v.y * N.restituicao;
                    v.x *= N.atrito; v.z *= N.atrito;
                    d = (b.z * zSinal) - CAMPO_COMP / 2;
                }
            }
        }

        // --- pano de trás, inclinado (contínuo) ----------------------------------
        let res = N.restituicao;
        let atr = N.atrito;
        
        const dist = (a * d + b.y - c) / norma;
        const prevDist = (a * prevD + prevY - c) / norma;

        if (d > 0.3 && v.y < 0 && Math.abs(b.x) <= meiaLarg && dist > -rB - 0.5 && dist <= 0) {
            vd += 12.0 * (this.delta || 0.016);
            res = 0.0;
            atr = 0.98;
        }

       if (Math.abs(b.x) <= meiaLarg) {
            if (Math.abs(dist) < 0.8 || (prevDist <= 0 && dist > 0) || (prevDist > 0 && dist <= 0)) {
                let tCross = 0;
                if (dist !== prevDist) tCross = prevDist / (prevDist - dist);
                const yCross = prevY + tCross * (b.y - prevY);
                
                if (yCross <= ALTURA_BALIZA) {
                    const nd = a / norma, ny = 1 / norma;
                    const vn = vd * nd + v.y * ny;

                    if ((dist > 0 && vn < 0) || (prevDist > 0 && dist <= 0)) { // Bola vem de fora para dentro
                        if (typeof NetWave !== 'undefined') NetWave.bater(zSinal, vn);
                        const correccao = rB - dist;
                        if (correccao > 0) {
                            d += nd * correccao; b.y += ny * correccao;
                        }
                        vd -= vn * nd * (1 + res);
                        v.y -= vn * ny * (1 + res);
                        vd *= atr; v.y *= atr; v.x *= atr;
                    } else if ((dist <= 0 && vn > 0) || (prevDist <= 0 && dist > 0)) { // Bola vem de dentro para fora
                        if (typeof NetWave !== 'undefined') NetWave.bater(zSinal, vn);
                        const correccao = -rB - dist;
                        if (correccao < 0) {
                            d += nd * correccao; b.y += ny * correccao;
                            // Se a projecção atirar a bola para cima do travessão, trancamos na rede de cima
                            if (b.y > ALTURA_BALIZA - rB) {
                                b.y = ALTURA_BALIZA - rB;
                                if (v.y > 0) v.y = -v.y * N.restituicao;
                            }
                        }
                        vd -= vn * nd * (1 + res);
                        v.y -= vn * ny * (1 + res);
                        vd *= atr; v.y *= atr; v.x *= atr;
                    }
                }
            }
        }

        b.z = (d + CAMPO_COMP / 2) * zSinal;
        v.z = vd * zSinal;
    },

    dentroDaArmacao: function (zSinal) {
        const rB = BallPhysics.raio;
        const b = this.ball.position;
        const d = b.z * zSinal - CAMPO_COMP / 2;
        return Math.abs(b.x) <= LARGURA_BALIZA / 2 + rB &&
               b.y <= ALTURA_BALIZA + rB &&
               d <= GoalNet.profBase + rB;
    },

    colidirComBaliza: function () {
        const rB = BallPhysics.raio;
        const rP = GoalFrame.raioPoste;
        const soma = rP + rB;
        const meiaLarg = LARGURA_BALIZA / 2;
        const b = this.ball.position;
        const v = this.ballVel;

        for (const lado of [1, -1]) {
            // Plano da armação: meio raio para dentro da linha de fundo.
            const zG = (CAMPO_COMP / 2) * lado - rP * lado;

            // --- postes (cilindros verticais) ---
            if (b.y < ALTURA_BALIZA + rP) {
                for (const sx of [1, -1]) {
                    const px = meiaLarg * sx;
                    const dx = b.x - px, dz = b.z - zG;
                    const d = Math.hypot(dx, dz);
                    if (d >= soma || d < 1e-6) continue;

                    const nx = dx / d, nz = dz / d;
                    b.x = px + nx * soma;
                    b.z = zG + nz * soma;

                    const vn = v.x * nx + v.z * nz;
                    if (vn < 0) {
                        v.x -= (1 + GoalFrame.restituicao) * vn * nx;
                        v.z -= (1 + GoalFrame.restituicao) * vn * nz;
                        v.x *= GoalFrame.atrito;
                        v.z *= GoalFrame.atrito;
                    }
                }
            }

            // --- travessão (cilindro horizontal ao longo de X) ---
            if (Math.abs(b.x) <= meiaLarg + rP) {
                const barY = ALTURA_BALIZA + rP;
                const dy = b.y - barY, dz = b.z - zG;
                const d = Math.hypot(dy, dz);
                if (d < soma && d > 1e-6) {
                    const ny = dy / d, nz = dz / d;
                    b.y = barY + ny * soma;
                    b.z = zG + nz * soma;

                    const vn = v.y * ny + v.z * nz;
                    if (vn < 0) {
                        v.y -= (1 + GoalFrame.restituicao) * vn * ny;
                        v.z -= (1 + GoalFrame.restituicao) * vn * nz;
                        v.y *= GoalFrame.atrito;
                        v.z *= GoalFrame.atrito;
                        v.x *= GoalFrame.atrito;
                    }
                }
            }
        }
    },
});
