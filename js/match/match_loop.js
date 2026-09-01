Object.assign(Match, {
    update: function (dt) {
        if (!this._pf_stats) this._pf_stats = { count: 0, time: 0 };
        const medir = this._profilingActivo();
        const t0 = medir ? performance.now() : 0;
        for (let p of this.players) { p.debugPoints = null; }
        for (let p of this.opponents) { p.debugPoints = null; }
        this.delta = dt;

        if (this.kickoffActive) {
            this.kickoffTimer -= dt;

            /*
            APITO ANTES DA SAÍDA DE BOLA. Dado a `APITO_ANTES_DA_SAIDA` do
            toque e não na montagem do kickoff: é o apito que autoriza a saída,
            e tem de se ouvir logo antes da bola sair, não três segundos antes.
            */
            if (!this.kickoffApitado && this.kickoffTimer <= APITO_ANTES_DA_SAIDA) {
                this.kickoffApitado = true;
                if (typeof EfeitosSonoros !== 'undefined') EfeitosSonoros.apito(1.0);
            }

            // Animação de idle continua (respiração/etc.), mas sem BT: os
            // alvos de movimento não mudam, por isso ninguém sai do lugar.
            this.players.forEach(p => p.update(dt));
            this.opponents.forEach(p => p.update(dt));
            if (this.kickoffTimer <= 0) {
                this.kickoffActive = false;
                if (this.kickoffTaker && this.kickoffApoio) {
                    this.kickoffTaker.initiatePass(this.kickoffApoio);
                }
                this.kickoffTaker = null;
                this.kickoffApoio = null;
            }
            return;
        }

        const clockScale = MatchDuration.timeScale;
        this.tempoDeJogo += dt * clockScale;
        // Relógio em segundos simulados, para a telemetria do passe (o
        // tempoDeJogo acima vem multiplicado pelo timeScale).
        if (typeof MatchStats !== 'undefined') MatchStats.tick(dt);
        this.updatePlacar();

        /*
        O CANTO VIVO acaba quando o lance acaba: a bola sai da área, o
        guarda-redes agarra-a, a equipa que defendia ganha a posse, o jogo pára,
        ou o prazo esgota. Enquanto durar, os marcadores ficam com o seu homem
        (ver CornerDefenseModel e o ramo do canto no PlayerAI.tick).

        O prazo existe para o lance não ficar vivo para sempre se nenhuma das
        outras saídas acontecer — é a mesma ideia do setPieceTimer.
        */
        if (this.cantoVivo) {
            const CD = CornerDefenseModel;
            this.cantoVivo.timer += dt;

            const def = this.cantoVivo.equipa;
            const gkDef = (def === 'TeamA') ? this.players[0] : this.opponents[0];
            // A baliza que eles defendem é a que fica ATRÁS deles.
            const linhaDefendida = -gkDef.dirZ * LINHA_FUNDO;
            const folga = CD.saidaDaArea;
            const dz = Math.abs(linhaDefendida - this.ball.position.z);
            const naArea = Area.contem(this.ball.position.x, this.ball.position.z, linhaDefendida);
            const bemFora = dz > (Area.profundidade + folga) || Math.abs(this.ball.position.x) > (Area.meiaLargura + folga);

            /*
            A BOLA COMEÇA FORA DA ÁREA — está na bandeirola de canto. Sem esta
            memória a saída "a bola saiu da área" disparava no primeiro frame e
            o lance morria antes de existir (medido: 1 frame de vida).
            */
            if (naArea) this.cantoVivo.entrou = true;

            const guardado = !!(gkDef && (gkDef.hasBall || gkDef.gkEstado === 'segurando'));

            if (this.state !== 'PLAY' || guardado ||
                (this.cantoVivo.entrou && bemFora) ||
                this.cantoVivo.timer > CD.prazo) {
                this.players.concat(this.opponents).forEach(p => { p.marcaNoCanto = null; });
                this.cantoVivo = null;
            }
        }

        if (this.state === 'CORNER_KICK') {
            this.setPieceTimer += dt;

            /*
            Bola ainda "a sair": segue o movimento até tocar no relvado, espera
            `cantoBolaAtraso`, e só então vai para a quina e trava. Os jogadores
            já se posicionaram no setupSetPiece — isto é só a bola.
            */
            if (this.cantoBolaAlvo) {
                if (this.cantoAguardaChao) {
                    if (this.ball.position.y <= BallPhysics.raio + 0.01 || this.ballVel.lengthSq() < 0.1) {
                        this.cantoAguardaChao = false;
                    }
                } else {
                    this.cantoBolaAtraso -= dt;
                    if (this.cantoBolaAtraso <= 0) {
                        this.ball.position.set(this.cantoBolaAlvo.x, this.cantoBolaAlvo.y, this.cantoBolaAlvo.z);
                        this.ballVel.set(0, 0, 0);
                        this.cantoBolaAlvo = null;
                    }
                }
            }

            /*
            CANTO ENCRAVADO. Era o ÚNICO estado de bola parada sem cão-de-guarda
            — o FREE_KICK, o PENALTY e o THROW_IN têm 15 s, o GOAL_KICK tem 20 —
            e por isso o único que podia ficar aceso para sempre. Incrementava o
            `setPieceTimer` e nunca olhava para ele.

            Ficar aceso para sempre não é só o canto que não se bate: o
            `player.update` NÃO chama o `updateGK` enquanto `Match.state` é
            'CORNER_KICK' (ver a guarda lá), portanto o guarda-redes congela na
            pose e no `gkEstado` que tinha — um gesto a meio nunca mais avança,
            porque quem lhe mexe o relógio é o updateGK.

            Duas maneiras de aqui ficar preso, e o prazo cobre as duas:

              - a bola nunca "aterra" (`cantoAguardaChao` exige
                `y <= raio + 0.01`), logo o `cantoBolaAlvo` nunca é limpo e o
                SET_PIECE_TAKER nunca chega a cruzar;
              - não há batedor no estado SET_PIECE_TAKER que execute o gesto.

            20 s como no tiro de meta: o posicionamento, a espera da reposição e
            a bola a assentar cabem lá dentro com folga. O `resetPlay` é a
            limpeza completa (estado, batedor, temporizador, `gkHoldingBall` e
            os estados dos guarda-redes), que é precisamente o que falta a um
            lance que nunca aconteceu.
            */
            const prazoCanto = SetPiecePrazos.canto;
            if (this.setPieceTimer > prazoCanto) {
                this.setPieceTimer = 0;
                this.cantoBolaAlvo = null;
                this.cantoAguardaChao = false;
                this.resetPlay();
            }
        }

        if (this.state === 'FREE_KICK') {
            this.setPieceTimer += dt;
            if (this.faltaPendente) {
                this.faltaAtraso -= dt;

                /*
                APROXIMAÇÃO ANDADA. O batedor espera `recuoBatedor` metros atrás
                da bola e caminha até `arranqueDoGesto` durante o último terço da
                espera; o gesto (a corrida curta e o contacto) parte daí.

                Sem isto os 4.8 m tinham de ser cobertos dentro do `contactTime`
                do ShotClip — 0.32 s, ou seja 15 m/s, um teletransporte com pose
                de remate. E com o batedor colado à bola desde o início (era o
                que havia, `recuoBatedor` de 1.4 m) não há cobrança nenhuma para
                ver: a bola parecia saltar-lhe para o pé.
                */
                const takerFalta = this.setPieceTaker;
                const FK = FreeKickModel;
                if (takerFalta && takerFalta.model) {
                    if (this.faltaAtraso < ESPERA_APOS_REPOSICAO / 3) {
                        const bx = this.ball.position.x, bz = this.ball.position.z;
                        let alvoX = bx;
                        let alvoZ = bz;
                        if (takerFalta.alvoFalta) {
                            alvoX = takerFalta.alvoFalta.x;
                            alvoZ = takerFalta.alvoFalta.z;
                        }
                        
                        const dx = takerFalta.model.position.x - alvoX;
                        const dz = takerFalta.model.position.z - alvoZ;
                        const d = Math.hypot(dx, dz);
                        
                        if (d > 0.05) {
                            const passo = Math.min(d, FK.velocidadeAproximacao * dt);
                            const v = passo / dt;
                            takerFalta.velocity.set(-(dx / d) * v, 0, -(dz / d) * v);
                        } else {
                            // Chegou ao ponto de arranque do gesto: pára e espera.
                            takerFalta.velocity.set(0, 0, 0);
                        }
                    } else {
                        // Durante a espera inicial antes da caminhada: fica parado no recuo
                        takerFalta.velocity.set(0, 0, 0);
                    }
                }

                if (this.faltaAtraso <= 0) {
                    this.faltaPendente = false;
                    const t = this.setPieceTaker;
                    /*
                    A falta directa tem cobranca propria (barreira, desfecho
                    sorteado, atraso do guarda-redes). O resto da montagem — a
                    espera, a caminhada, o prazo — e o mesmo, e por isso vive
                    aqui e nao num estado novo.
                    */
                    if (t && this.faltaDirecta) t.baterFaltaDirecta();
                    else if (t) t.baterFalta();
                    else this.mudarEstado('PLAY', 'falta_sem_batedor');
                }
            }
            const prazoFalta = SetPiecePrazos.falta;
            if (this.setPieceTimer > prazoFalta) { this.mudarEstado('PLAY', 'timeout_falta'); }
        }

        if (this.state === 'PENALTY') {
            this.setPieceTimer += dt;
            if (this.penaltiPendente) {
                this.penaltiAtraso -= dt;

                /*
                APROXIMAÇÃO ANDADA, igual à da falta (ver o ramo faltaPendente
                aqui em cima). O batedor espera em `recuoBatedor` (4.6 m) e
                caminha até `arranqueDoGesto` durante o último terço da espera;
                o gesto parte daí e cobre só os últimos metros.

                Sem isto os 4.6 m tinham de ser cobertos dentro do `contactTime`
                do ShotClip (~0.32 s) pelo `onPrepare` do baterPenalti — ~13 m/s
                com a pose de remate congelada, ou seja o batedor a DESLIZAR
                sobre a perna de apoio até à bola.
                */
                const takerPen = this.setPieceTaker;
                const PMa = PenaltyModel;
                if (takerPen && takerPen.model && !takerPen.actionState) {
                    if (this.penaltiAtraso < ESPERA_APOS_REPOSICAO / 3) {
                        const dirPx = takerPen.model.position.x - this.ball.position.x;
                        const dirPz = takerPen.model.position.z - this.ball.position.z;
                        const dPen = Math.hypot(dirPx, dirPz);
                        const alvoDist = PMa.arranqueDoGesto;
                        if (dPen > alvoDist + 0.05) {
                            const passo = Math.min(dPen - alvoDist, PMa.velocidadeAproximacao * dt);
                            const v = passo / dt;
                            takerPen.velocity.set(-(dirPx / dPen) * v, 0, -(dirPz / dPen) * v);
                        } else {
                            takerPen.velocity.set(0, 0, 0);
                        }
                    } else {
                        takerPen.velocity.set(0, 0, 0);
                    }
                }

                if (this.penaltiAtraso <= 0) {
                    this.penaltiPendente = false;
                    const t = this.setPieceTaker;
                    if (t) t.baterPenalti();
                    else this.mudarEstado('PLAY', 'penalti_sem_batedor');
                }
            }
            const prazoPenalti = SetPiecePrazos.penalti;
            if (this.setPieceTimer > prazoPenalti) { this.mudarEstado('PLAY', 'timeout_penalti'); }
        }

        /*
        ==================================================================
        O LANCE DA FALTA DIRECTA, depois da batida
        ==================================================================
        Duas coisas que a fisica sozinha nao faz:

          O SALTO DA BARREIRA. Todos saltam, com `atrasoSaltoBarreira` a
          contar do contacto — e esse atraso que abre a janela do remate
          rasteiro por baixo (desfecho `por_baixo`).

          O DESVIO NA BARREIRA. Os tres desfechos que passam por ela
          (`na_barreira`, `barreira_gol`, `barreira_fora`) resolvem-se no
          frame em que a bola chega ao plano dela. Nao e o
          `resolveBallContact` que o faz: os cinco homens estao com
          `touchLock` posto na batida, de proposito, senao apanhavam a bola
          por acidente e o desfecho sorteado nunca acontecia.

        Ver baterFaltaDirecta (player.js) e DirectFreeKickModel (config).
        */
        if (this.faltaDirectaPlano) {
            const DF = DirectFreeKickModel;
            const plano = this.faltaDirectaPlano;
            plano.tempo += dt;

            if (!plano.saltou && plano.tempo >= DF.atrasoSaltoBarreira) {
                plano.saltou = true;
                (this.faltaDirectaBarreira || []).forEach(p => {
                    p.jumpTimer = SaltoCabeceio.duracao;
                    p.jumpApex = DF.alturaSaltoBarreira;
                    p.hasHeaderedInJump = true;   // saltam a tapar, nao a cabecear
                });
            }

            const percorrido = Math.hypot(
                this.ball.position.x - plano.origem.x,
                this.ball.position.z - plano.origem.z);

            if (!plano.resolvido && percorrido >= plano.distBarreira) {
                plano.resolvido = true;
                const bate = (plano.desfecho === 'na_barreira' ||
                    plano.desfecho === 'barreira_gol' ||
                    plano.desfecho === 'barreira_fora');

                if (bate) {
                    const bx = this.ball.position.x, bz = this.ball.position.z;
                    const by = Math.max(BallPhysics.raio, this.ball.position.y);
                    const golZ = plano.golZ;
                    const distGol = Math.hypot(0 - bx, golZ - bz) || 1;

                    if (plano.desfecho === 'na_barreira') {
                        /*
                        A BOLA SAI DE LADO, NUNCA PARA QUEM BATEU.

                        Estava a ser devolvida na linha do remate, invertida:
                        ia direita ao batedor, que a cabeceava para dentro
                        sozinho — o lance do relato. Um ressalto numa barreira
                        e um choque contra um ombro ou uma perna: a bola cospe
                        para o lado, para a area, para a linha, ou fica com o
                        guarda-redes. Nunca refaz o caminho por onde veio.

                        O angulo sai de `ricocheteAnguloMin/Max` (>= 65 graus
                        da direccao do remate), portanto fica sempre fora do
                        cone de onde a bola veio.
                        */
                        const vIn = Math.hypot(this.ballVel.x, this.ballVel.z) || 1;
                        const ux = this.ballVel.x / vIn, uz = this.ballVel.z / vIn;
                        const paraGK = Math.random() < DF.ricocheteParaGK;

                        if (paraGK) {
                            // Sobra para o guarda-redes: mole, na direccao da
                            // baliza, para ele sair e agarrar.
                            const gx = 0 - this.ball.position.x;
                            const gz = plano.golZ - this.ball.position.z;
                            const gd = Math.hypot(gx, gz) || 1;
                            const vG = vIn * DF.barreiraTravagem * 0.7;
                            this.ballVel.set((gx / gd) * vG, 2.0, (gz / gd) * vG);
                        } else {
                            const lado = (Math.random() < 0.5) ? 1 : -1;
                            const ang = lado * (DF.ricocheteAnguloMin +
                                Math.random() * (DF.ricocheteAnguloMax - DF.ricocheteAnguloMin));
                            const c = Math.cos(ang), sn = Math.sin(ang);
                            const vR = vIn * DF.barreiraTravagem;
                            this.ballVel.set(
                                (ux * c + uz * sn) * vR,
                                Math.abs(this.ballVel.y) * 0.5 + 2.0,
                                (-ux * sn + uz * c) * vR);
                        }
                    } else {
                        /*
                        DESVIO. A bola muda de direccao e sobe — um desvio na
                        cabeca ou no ombro levanta-a. Para dentro aponta-se um
                        ponto da baliza; para fora, um ponto ao lado dela.
                        */
                        const meiaBaliza = LARGURA_BALIZA / 2;
                        const paraDentro = (plano.desfecho === 'barreira_gol');
                        /*
                        O desvio que ENTRA tem de entrar longe do guarda-redes:
                        ele esta ao meio da linha, e o
                        GoalkeeperPose.mergulhoLateralMin diz que uma bola a
                        menos de 2 m do corpo dele nem sequer e mergulho — fica
                        de pe e agarra. Medido antes disto: 1 golo em 6 desvios
                        para dentro.
                        */
                        const ladoDesvio = (Math.random() < 0.5) ? 1 : -1;
                        const alvoX = paraDentro
                            ? ladoDesvio * (2.4 + Math.random() * (meiaBaliza - 3.0))
                            : -plano.ladoTiro * (meiaBaliza + 1.2 + Math.random() * 1.5);
                        const alvoY = paraDentro
                            ? (0.8 + Math.random() * 1.2)
                            : (ALTURA_BALIZA + 0.4 + Math.random());

                        /*
                        A ELEVACAO DO DESVIO PROCURA-SE, nao se calcula em
                        linha recta. A recta bola->alvo nao tem solucao quando
                        o alvo esta ACIMA da bola: nem a 45 m/s uma bola lancada
                        a 3.6 graus sobe 0.5 m em 8 m, e o solver devolvia null.
                        Media do desvio antes disto: 5.9 m/s (a queda para a
                        velocidade de recurso), ou seja a bola morria a meio
                        caminho — 1 golo em 24 desvios para dentro.
                        */
                        let elevD = null, vD = null;
                        for (let g = 3; g <= 34; g += 2) {
                            const e = g * Math.PI / 180;
                            const tentativa = (typeof velocidadeParaAlturaNoAlvo === 'function')
                                ? velocidadeParaAlturaNoAlvo(distGol, e, alvoY, by)
                                : null;
                            if (tentativa !== null && tentativa !== undefined) {
                                elevD = e; vD = tentativa; break;
                            }
                        }
                        if (elevD === null) elevD = 8 * Math.PI / 180;
                        /*
                        A velocidade e a que POE A BOLA NO PONTO — nao a que
                        sobra do impacto. Multiplicar a solucao pela travagem
                        (0.55 x 1.6 = 0.88) deixava-a curta: 20 dos 24 desvios
                        para dentro morriam antes da linha e o desfecho
                        "desvio na barreira e golo" quase nao acontecia.
                        Quem paga o impacto e a FORMA (a bola sobe, muda de
                        direccao), nao o alcance.
                        */
                        const vFinal = (vD !== null && vD !== undefined)
                            ? vD
                            : this.ballVel.length() * DF.barreiraTravagem;

                        const dxD = alvoX - bx, dzD = golZ - bz;
                        const dD = Math.hypot(dxD, dzD) || 1;
                        const vhD = vFinal * Math.cos(elevD);
                        this.ballVel.set(
                            (dxD / dD) * vhD,
                            vFinal * Math.sin(elevD) + DF.desvioSubida * 0.25,
                            (dzD / dD) * vhD);
                    }

                    if (typeof EfeitosSonoros !== 'undefined' && EfeitosSonoros.chute) {
                        EfeitosSonoros.chute(this.ball.position, 0.5);
                    }
                }
            }

            /*
            A DEFESA, resolvida a mao. Ver distanciaDaDefesa no
            DirectFreeKickModel: o mergulho e a animacao, isto e o desfecho.
            */
            const defende = (plano.desfecho === 'defesa' || plano.desfecho === 'defesa_fora');
            if (defende && !plano.defesaFeita) {
                const faltaZ = Math.abs(plano.golZ - this.ball.position.z);
                const vaiParaLa = ((plano.golZ - this.ball.position.z) * this.ballVel.z) > 0;
                const dentroDosPostes = Math.abs(this.ball.position.x) < (LARGURA_BALIZA / 2 + 0.6);
                if (vaiParaLa && dentroDosPostes && faltaZ <= DirectFreeKickModel.distanciaDaDefesa) {
                    plano.defesaFeita = true;
                    const gkD = (plano.equipa === 'TeamA')
                        ? this.opponents.find(p => p.role === 'gk')
                        : this.players.find(p => p.role === 'gk');
                    const paraForaZ = Math.sign(plano.golZ) || 1;
                    const ladoX = Math.sign(this.ball.position.x) || 1;
                    const vEsp = DirectFreeKickModel.espalmarVelocidade;

                    if (plano.desfecho === 'defesa_fora') {
                        /*
                        Espalmada PARA FORA: tem de sair POR FORA DO POSTE,
                        senao cruza a linha entre os ferros e o que se marca e
                        um golo. Mede-se o tempo que falta ate a linha e da-se
                        a bola a velocidade lateral que a poe para la do poste
                        nesse tempo.
                        */
                        const vz = vEsp * 0.6;
                        const tLinha = Math.max(0.05, faltaZ / vz);
                        const alvoLateral = LARGURA_BALIZA / 2 + 0.9;
                        const vx = Math.max(vEsp * 0.4,
                            (alvoLateral - Math.abs(this.ball.position.x)) / tLinha);
                        this.ballVel.set(ladoX * vx, 3.0, paraForaZ * vz);
                    } else {
                        // Espalmada para o campo: a bola volta a jogo.
                        this.ballVel.set(ladoX * vEsp * 0.8, 2.5, -paraForaZ * vEsp * 0.6);
                    }

                    if (gkD) {
                        this.lastTouchedPlayer = gkD;
                        this.lastTouchedTeam = gkD.team;
                        gkD.touchLock = BallControl.touchLock;
                    }
                    if (typeof MatchStats !== 'undefined' && MatchStats.registarDefesa) {
                        MatchStats.registarDefesa(gkD ? gkD.team : null);
                    }
                }
            }

            /*
            O LANCE ACABA: golo, bola fora, outro lance parado, ou o prazo. E
            aqui que a flag `faltaDirecta` se apaga — enquanto ela estiver de
            pe o guarda-redes fica preso a linha (ver updateGK).
            */
            if (plano.tempo > 6.0 ||
                (this.state !== 'PLAY' && this.state !== 'FREE_KICK')) {
                this.faltaDirecta = false;
                this.faltaDirectaPlano = null;
                (this.faltaDirectaBarreira || []).forEach(p => { p.naBarreiraFalta = false; });
                this.faltaDirectaBarreira = null;
            }
        }

        if (this.state === 'THROW_IN') {
            this.setPieceTimer += dt;

            /*
            Espera de ESPERA_APOS_REPOSICAO (a mesma de todas as reposições) e
            depois arranca o gesto. Quem larga a bola é o ActionState, no
            contactTime do clip — ver ThrowInClip e o case LATERAL da FSM.
            */
            if (this.lateralPendente) {
                this.lateralAtraso -= dt;
                if (this.lateralAtraso <= 0) {
                    this.lateralPendente = false;
                    const t = this.setPieceTaker;
                    if (t && t.fsm.currentState === 'LATERAL') {
                        /*
                        O alvo é escolhido AQUI, antes do primeiro keyframe, e
                        não no instante do contacto: a cintura tem de começar a
                        carregar para o lado contrário desde o início do gesto,
                        e para isso é preciso saber para onde se vai atirar.
                        */
                        t.escolherAlvoDoLateral();
                        t.lateralAction = new ActionState('throwIn', {
                            onContact: () => {
                                t.lateralLargou = true;
                                t.lancarLateral();
                            }
                        });
                    } else {
                        // Sem batedor válido, não deixa o jogo preso.
                        this.mudarEstado('PLAY', 'lateral_sem_batedor');
                    }
                }
            }

            // Rede de segurança: gesto interrompido, batedor derrubado, etc.
            const prazoLateral = SetPiecePrazos.lateral;
            if (this.setPieceTimer > prazoLateral) {
                this.mudarEstado('PLAY', 'timeout_lateral');
            }
        }

        /*
        Tiro de meta encravado: se o GR não chegar a chutar (foi interrompido,
        ficou preso num clamp, seja o que for), o jogo não pode ficar parado
        para sempre. O gesto inteiro leva ~8 s no pior caso.
        */
        if (this.state === 'GOAL_KICK') {
            this.setPieceTimer += dt;

            /*
            Bola ainda a "sair" — pedido explícito: continua o movimento até
            tocar no chão (não um tempo fixo — uma bola no ar demora mais que
            uma rasteira), SÓ DEPOIS espera 3s, e então vai para a quina da
            pequena área. Os jogadores já se posicionaram (setupSetPiece),
            isto é só a bola.
            */
            if (this.golKickBolaAlvo) {
                if (this.golKickAguardaChao) {
                    if (this.ball.position.y <= BallPhysics.raio + 0.01 || this.ballVel.lengthSq() < 0.1) {
                        this.golKickAguardaChao = false;
                    }
                } else {
                    this.golKickBolaAtraso -= dt;
                    if (this.golKickBolaAtraso <= 0) {
                        this.ball.position.set(this.golKickBolaAlvo.x, BallPhysics.raio, this.golKickBolaAlvo.z);
                        this.ballVel.set(0, 0, 0);
                        this.golKickBolaAlvo = null;
                    }
                }
            }

            /*
            Bola já pousada: conta ESPERA_APOS_REPOSICAO e só então o GR entra
            em 'tiro_meta'. Até lá fica parado no ponto de arranque, virado
            para a bola (postura escrita no setupSetPiece).
            */
            if (this.golKickPendente && !this.golKickBolaAlvo) {
                this.golKickAtrasoInicio -= dt;
                if (this.golKickAtrasoInicio <= 0) {
                    this.golKickPendente = false;
                    const gkTM = this.setPieceTaker;
                    if (gkTM && gkTM.role === 'gk' && gkTM.gkEstado === 'tiro_meta_espera') {
                        gkTM.gkEstado = 'tiro_meta';
                        gkTM.gkTempoMergulho = 0;
                    }
                }
            }

            this.updateGoalKickWait(dt);
            // Orçamento maior que antes: posicionamento + espera de 3-6s +
            // corrida/cobrança cabem lá dentro sem disparar o reset.
            const prazoTiroDeMeta = SetPiecePrazos.tiroDeMeta;
            if (this.setPieceTimer > prazoTiroDeMeta) {
                this.setPieceTimer = 0;
                this.resetPlay();
            }
        }

        if (this.counterAttackTimer > 0) {
            this.counterAttackTimer -= dt;
            if (this.counterAttackTimer <= 0) {
                this.counterAttackTeam = null;
            }
        }

        if (this.aerialHeaderTimer > 0) {
            this.aerialHeaderTimer -= dt;
            if (this.aerialHeaderTimer <= 0) {
                this.aerialHeaderCount = 0;
            }
        }

        let isPassing = false;
        if (this.ballCarrier && this.ballCarrier.fsm && (this.ballCarrier.fsm.currentState === 'PASS' || this.ballCarrier.fsm.currentState === 'CROSS')) {
            isPassing = true;
        }
        if (!this.intendedReceiver && !isPassing) {
            if (this.passTargetVisual) this.passTargetVisual.visible = false;
            if (this.passLineVisual) this.passLineVisual.visible = false;
        }

        // Arbitragem: fora das listas de jogadores, corre à parte (officials.js).
        if (typeof Officials !== 'undefined') Officials.update(dt);

        this.updateBall();
        // Sai sozinho quando nenhuma rede está a abanar (ver NetWave.update).
        if (typeof NetWave !== 'undefined') NetWave.update(dt);
        if (typeof SpatialGrid !== 'undefined') SpatialGrid.update(dt);
        // Sem isto o leque de candidatos era desenhado UMA vez, no instante em
        // que se liga o toggle, e ficava congelado nesse frame: os jogadores
        // saíam de baixo dos pontos e parecia que os pontos desapareciam.

        if (typeof Perception !== 'undefined') Perception.tick(this, dt);
        correrPrazoDaSaida(this, dt);
        this.runTeamAI();

        this.players.forEach(p => p.update(dt));
        this.opponents.forEach(p => p.update(dt));

        if (window.showPlayerBT) {
            let attackingTeam = this.possessionTeam || this.lastTouchedTeam || 'TeamA';
            let dirZ = 1;
            if (this.players.length > 0) {
                dirZ = (attackingTeam === 'TeamA') ? this.players[0].dirZ : this.opponents[0].dirZ;
            }
            let targetGoalZ = dirZ * (CAMPO_COMP / 2);
            
            const posAttr = this.goalLineVisual.geometry.attributes.position;
            posAttr.setXYZ(0, this.ball.position.x, 0.05, this.ball.position.z);
            posAttr.setXYZ(1, 0, 0.05, targetGoalZ);
            posAttr.needsUpdate = true;
            this.goalLineVisual.visible = true;
        } else {
            if (this.goalLineVisual) this.goalLineVisual.visible = false;
        }

        if (this.showOffsideLines) {
            let outfieldA = this.players.filter(p => p.role !== 'gk');
            if (outfieldA.length > 0) {
                outfieldA.sort((a, b) => a.model.position.z - b.model.position.z);
                this.offsideLineA.position.z = Math.min(0, outfieldA[0].model.position.z, this.ball.position.z);
            }
            let outfieldB = this.opponents.filter(p => p.role !== 'gk');
            if (outfieldB.length > 0) {
                outfieldB.sort((a, b) => b.model.position.z - a.model.position.z);
                this.offsideLineB.position.z = Math.max(0, outfieldB[0].model.position.z, this.ball.position.z);
            }
            if (typeof TeamShape !== 'undefined') {
                const cap = TeamShape.linhaDefensiva[Tatics.linhaDefensiva] ?? TeamShape.linhaDefensiva.medium;
                this.defLineA.position.z = cap * 1;
                this.defLineB.position.z = cap * -1;
            }
        }

        this.btPosRectA.visible = false;
        this.btPosRectB.visible = false;
        this.btPosCentroA.visible = false;
        this.btPosCentroB.visible = false;

        const updateRect = (teamName, rectMesh, centroMesh) => {
            const bb = (typeof TeamAI !== 'undefined' && TeamAI.blackboards) ? TeamAI.blackboards[teamName] : null;
            if (bb) {
                rectMesh.visible = true;
                const minZ = Math.min(bb.blockBottom * bb.dir, bb.blockTop * bb.dir);
                const maxZ = Math.max(bb.blockBottom * bb.dir, bb.blockTop * bb.dir);
                let x0 = -17;
                let x1 = 17;
                if (bb.bloco) {
                    x0 = bb.bloco.x0;
                    x1 = bb.bloco.x1;
                }
                const pts = rectMesh.geometry.attributes.position.array;
                pts[0] = x0; pts[1] = 0.05; pts[2] = minZ;
                pts[3] = x1; pts[4] = 0.05; pts[5] = minZ;
                pts[6] = x1; pts[7] = 0.05; pts[8] = maxZ;
                pts[9] = x0; pts[10] = 0.05; pts[11] = maxZ;
                rectMesh.geometry.attributes.position.needsUpdate = true;

                centroMesh.visible = true;
                centroMesh.position.x = (x0 + x1) / 2;
                centroMesh.position.z = (minZ + maxZ) / 2;
            }
        };

        if (window.teamBTPosState === 'TeamA' || window.teamBTPosState === 'Both') {
            updateRect('TeamA', this.btPosRectA, this.btPosCentroA);
        }
        if (window.teamBTPosState === 'TeamB' || window.teamBTPosState === 'Both') {
            updateRect('TeamB', this.btPosRectB, this.btPosCentroB);
        }

        if (!this._allPlayersCache || this._allPlayersCache.length !== this.players.length + this.opponents.length) {
            this._allPlayersCache = [];
            for (let i = 0; i < this.players.length; i++) this._allPlayersCache.push(this.players[i]);
            for (let i = 0; i < this.opponents.length; i++) this._allPlayersCache.push(this.opponents[i]);
        }
        const allPlayers = this._allPlayersCache;
        const colRadius = 0.45;
        const colDiameter = colRadius * 2;
        for (let i = 0; i < allPlayers.length; i++) {
            for (let j = i + 1; j < allPlayers.length; j++) {
                const a = allPlayers[i]; const b = allPlayers[j];
                const dx = a.model.position.x - b.model.position.x;
                const dz = a.model.position.z - b.model.position.z;
                const distSq = dx * dx + dz * dz;
                if (distSq < colDiameter * colDiameter && distSq > 0.001) {
                    const dist = Math.sqrt(distSq);
                    const overlap = colDiameter - dist;
                    const nx = dx / dist; const nz = dz / dist;
                    const push = overlap * 0.5;
                    a.model.position.x += nx * push;
                    a.model.position.z += nz * push;
                    b.model.position.x -= nx * push;
                    b.model.position.z -= nz * push;
                }
            }
        }

        this.updateCrowd(dt);

        if (medir) {
            this._pf_stats.time += (performance.now() - t0);
            this._pf_stats.count++;
            if (this._pf_stats.count === 60) {
                console.log('Avg Match.update ms:', this._pf_stats.time / 60);
                this._pf_stats.count = 0;
                this._pf_stats.time = 0;
            }
        }
    },

    runTeamAI: function () {
        this.updatePossession();

        // O nível 1 escreve marcações nos jogadores das DUAS equipas, por isso
        // a limpeza tem de ser um passo global antes dos dois ticks — se cada
        // equipa limpasse na sua vez, a segunda apagava o trabalho da primeira.
        this.players.forEach(p => { p.markingTarget = null; p.isCovering = false; p.markCount = 0; });
        this.opponents.forEach(o => { o.markingTarget = null; o.isCovering = false; o.markCount = 0; });

        /*
        Nível 1 (TeamAI.tick, forma do bloco) corre SEMPRE, jogo parado ou
        não — a própria árvore já tem o ramo 'BolaParada' que põe a postura
        TeamPosture.SET_PIECE (bloco mais compacto/central) quando
        `Match.state !== 'PLAY'` (ver team_bt.js). Antes esta função inteira
        saía logo no `if (this.state !== 'PLAY') return`, e esse ramo nunca
        chegava a correr — o bloco ficava CONGELADO na forma esticada do
        último frame de jogo corrido (ex.: bola a caminho da linha de fundo,
        antes de sair para o tiro de meta). Os jogadores pareciam bem
        posicionados (setupSetPiece põe-nos directamente), mas o rectângulo
        de debug do TeamBT continuava lá longe.
        */
        const bbA = TeamAI.tick('TeamA', this);
        const bbB = TeamAI.tick('TeamB', this);
        this.chaserA = bbA.chaser;
        this.chaserB = bbB.chaser;

        // Nível 2 (onde cada jogador se coloca) e a coesão que depende dele só
        // fazem sentido em jogo corrido — em bola parada quem posiciona é o
        // próprio setupSetPiece, directamente (excepto tiro de meta, que usa o TeamBT).
        if (!this.nivel2Activo()) return;

        /*
        Duas fases, com a otimização de slots por posição e a atribuição de marcações.
        Otimiza os alvos dos jogadores da mesma posição para evitarem esbarrar ou
        correrem para o mesmo alvo.
        */
        PosicionamentoAI.otimizarSlotsPorPosicao(this.players, bbA);
        PosicionamentoAI.otimizarSlotsPorPosicao(this.opponents, bbB);

        this.players.forEach(p => PosicionamentoAI.tickBase(p, bbA));
        this.opponents.forEach(p => PosicionamentoAI.tickBase(p, bbB));

        atribuirMarcacoesDaEquipa(this.players, bbA);
        atribuirMarcacoesDaEquipa(this.opponents, bbB);

        this.players.forEach(p => PosicionamentoAI.tickFinal(p, bbA));
        this.opponents.forEach(p => PosicionamentoAI.tickFinal(p, bbB));

        /*
        Quem se oferece como opcao de passe. Tambem e decisao de EQUIPA: cada
        um a escolher sozinho o melhor ponto escolhe o MESMO ponto (foi o erro
        que a marcacao tinha). Corre depois do posicionamento porque o custo de
        um apoio e a distancia do slot dele ao ponto.
        */
        atribuirApoiosDaEquipa(this.players, bbA);
        atribuirApoiosDaEquipa(this.opponents, bbB);

        /*
        Nao ha mais nada a mexer nos alvos depois disto.

        Foram apagadas, por esta ordem: as molas de coesao
        (relaxConstraints), a separacao minima entre alvos (separarAlvos), o
        travao da linha de fora-de-jogo (TeamAI.holdLine) e, com o nivel 2
        inteiro, a marcacao, o tackling e a malha de Delaunay.

        Do relaxConstraints ficou so o calculo da linha de fora-de-jogo, que
        nao mexia em ninguem — ver publicarLinhaDeForaDeJogo.
        */
        this.publicarLinhaDeForaDeJogo(this.players);
        this.publicarLinhaDeForaDeJogo(this.opponents);

        this.afastarDoGuardaRedes(this.players);
        this.afastarDoGuardaRedes(this.opponents);
    },

    updatePossession: function () {
        const ballPos = this.ball.position;

        if (this.ballCarrier) {
            if (this.possessionTeam !== this.ballCarrier.team) {
                const oldPossessionTeam = this.possessionTeam;
                this.possessionTeam = this.ballCarrier.team;
                this.possessionTimer = 0;

                // Recuperar a bola no nosso meio-campo abre janela de contra-ataque.
                if (oldPossessionTeam && this.ballCarrier.model.position.z * this.ballCarrier.dirZ < -10) {
                    this.counterAttackTeam = this.ballCarrier.team;
                    this.counterAttackTimer = 4.0;
                } else {
                    this.counterAttackTeam = null;
                    this.counterAttackTimer = 0;
                }
            }
            this.possessionTimer += this.delta;
            this.lastTouchedTeam = this.ballCarrier.team;
            this.lastTouchedPlayer = this.ballCarrier;

            if (typeof MatchStats !== 'undefined') {
                MatchStats[this.ballCarrier.team].posseSegundos += this.delta;
                const zoneAhead = this.ballCarrier.model.position.z * this.ballCarrier.dirZ;
                MatchStats.registarZona(this.ballCarrier.team, zoneAhead, this.delta);
            }

            window.bolaChutada = false;
            // Repõe o estado de reacção nos dois GKs.
            [Match.players[0], Match.opponents[0]].forEach(gk => { if (gk) { gk.gkReagiu = false; } });

            // A bola fugiu-lhe do pé.
            const distToBall = this.ballCarrier.model.position.distanceTo(ballPos);
            if (distToBall > 2.0 && this.ballVel.lengthSq() > 1.0) {
                if (typeof MatchStats !== 'undefined') MatchStats[this.ballCarrier.team].perdasDePosse++;
                this.ballCarrier.hasBall = false;
                this.ballCarrier = null;
            }
        }
        else {
            /*
            O passe já morreu para o destinatário?

            `intendedReceiver` era posto no passe e só limpo quando alguém
            tocava na bola. Se ela lhe passasse ao lado, ele continuava a ser
            o "dono" da jogada — ficava a correr atrás dela pelo ramo Receber,
            e mais nenhum jogador podia reclamá-la (o podeIntercetar cede-lhe
            sempre a vez). O resto da equipa via a bola passar e não reagia.

            Consideramos perdido quando a bola já se afasta dele e está a mais
            de `passePerdidoDist` — aí a jogada volta a ser de quem lá chegar.

            A DECISÃO SAIU PARA O `passeMorreuParaODestinatario` (utils.js), e
            com ela saiu a guarda que encravava o jogo: isto só corria com a
            bola EM MOVIMENTO (`ballVel.lengthSq() > 0.5`). Uma bola que parava
            longe do destinatário nunca era libertada, ninguém a ia buscar
            (`bolaSolta` exige `!intendedReceiver`), e por isso ela nunca
            voltava a mexer-se — o deadlock alimentava-se a si próprio. Ver
            tests/passe_morto_bola_parada.test.js.
            */
            /*
            Há quanto tempo é que a bola está parada sem dono. Alimenta o
            prazo do `passeMorreuParaODestinatario` — ver PerceptionModel.
            prazoBolaParada.
            */
            if (!this.ballCarrier && this.ballVel.lengthSq() <= 0.5) {
                this.tempoBolaParada = (this.tempoBolaParada || 0) + this.delta;
            } else {
                this.tempoBolaParada = 0;
            }

            const alvo = this.intendedReceiver;
            if (alvo && passeMorreuParaODestinatario({
                bolaX: ballPos.x, bolaZ: ballPos.z,
                alvoX: alvo.model.position.x, alvoZ: alvo.model.position.z,
                velX: this.ballVel.x, velZ: this.ballVel.z, velY: this.ballVel.y,
                distPerdido: PerceptionModel.passePerdidoDist,
                paradaV2: 0.5,
                tempoParada: this.tempoBolaParada || 0,
                prazoParada: PerceptionModel.prazoBolaParada
            })) {
                this.intendedReceiver = null;
                this.passTargetPos = null;
            }

            if (!this.resolveBallContact() && this.possessionTeam) {
                this.possessionTimer += this.delta;
            }
        }
    },

    _profilingActivo: function () {
        return this.profiling && !(typeof Sim !== 'undefined' && Sim.running);
    },

    nivel2Activo: function () {
        // THROW_IN incluído: só o batedor fica parado na linha, os outros dez
        // continuam a mover-se para dar e tapar linhas de reposição.
        return this.state === 'PLAY' || this.state === 'GOAL_KICK' ||
            this.state === 'THROW_IN';
        // FREE_KICK e PENALTY ficam de FORA: ali as posições são impostas pelo
        // setupSetPiece (barreira, meia-lua) e o nível 2 desfá-las-ia no frame
        // seguinte, como acontece no canto.
    },

    updateCrowd: function (dt) {
        if (typeof Config !== 'undefined' && Config.enableCrowd === false) return;

        /*
        O público a sério (js/crowd.js): decide sozinho o que a bancada faz, a
        partir do estado que este Match já tem. Escreve um uniform por frame e
        mais nada — o movimento todo é no vertex shader.
        */
        if (typeof Crowd !== 'undefined') Crowd.update(dt);

        /*
        O som do estádio lê o mesmo estado da bancada (js/ambiente_sonoro.js),
        para o que se ouve e o que se vê dizerem a mesma coisa. Sai daqui, e
        não do loop de render, porque durante a simulação em lote não há
        render nenhum — e um lote a berrar 90 minutos de estádio não era o
        que ninguém queria.
        */
        if (typeof AmbienteSonoro !== 'undefined' &&
            !(typeof Sim !== 'undefined' && Sim.running)) {
            AmbienteSonoro.update(dt);
        }

        // Daqui para baixo é o boneco simplificado antigo, desligado desde que
        // o Crowd passou a usar o modelo dos jogadores (ver createField).
        if (!this.specMesh || !this.specMesh.material.userData.time) return;
        
        this.crowdTimer += dt;
        let targetExcitement = 0.0;
        
        if (this.state === 'GOAL') {
            targetExcitement = 1.0;
        } else if (this.ballVel.lengthSq() > 400) {
            targetExcitement = 0.7;
        } else if (this.ball && Math.abs(this.ball.position.z) > 40) {
            targetExcitement = 0.5;
        } else if (this.ballCarrier && this.ballVel.lengthSq() > 100) {
            targetExcitement = 0.3;
        } else {
            targetExcitement = 0.05;
        }
        
        this.crowdExcitement += (targetExcitement - this.crowdExcitement) * dt * 3.0;
        
        // Pass uniforms to GPU Shader
        this.specMesh.material.userData.time.value = this.crowdTimer;
        this.specMesh.material.userData.excitement.value = this.crowdExcitement;
    },
});
