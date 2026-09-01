Object.assign(Match, {
    setupSetPiece: function (type, team) {
        /*
        A FALTA DIRECTA corre no ESTADO da falta.

        `DIRECT_FREE_KICK` e um tipo de montagem, nao um estado novo: tudo o
        que le `Match.state` — a FSM, o resolveBallContact, os prazos, o
        arbitro — sabe o que e um FREE_KICK e nao teria de aprender mais um
        nome para o mesmo lance parado. O que muda e a MONTAGEM (posicao
        sorteada, barreira de cinco a fechar o canto, marcacao individual) e a
        COBRANCA (baterFaltaDirecta, com desfecho resolvido a mao).

        A flag `faltaDirecta` e o que distingue os dois daqui para a frente.
        */
        const estado = (type === 'DIRECT_FREE_KICK') ? 'FREE_KICK' : type;
        this.faltaDirecta = (type === 'DIRECT_FREE_KICK');
        this.faltaDirectaPlano = null;
        this.faltaDirectaBarreira = null;
        this.mudarEstado(estado, 'setpiece_' + type.toLowerCase());
        this.setPieceTeam = team;

        /*
        A ETIQUETA DA MARCACAO, por cima do arbitro. Aqui e nao em cada
        `trigger*`: este e o unico sitio por onde TODOS os lances parados
        passam, incluindo os que vierem a ser escritos.

        Ver Officials.rotuloDaMarcacao — um estado sem nome de marcacao nao
        acende nada, e sem arbitros na cena isto nao faz nem rebenta.
        */
        /*
        APITO. Só o que o árbitro apita mesmo: falta e penálti. O canto, o
        lateral e o pontapé de baliza são reposições que o jogo retoma sozinho
        — apitar todas dava um apito a cada vinte segundos.
        */
        if (typeof EfeitosSonoros !== 'undefined' &&
            (estado === 'FREE_KICK' || estado === 'PENALTY')) {
            EfeitosSonoros.apito(1.0);
        }

        if (typeof Officials !== 'undefined' && Officials.anunciar) {
            Officials.anunciar(Officials.rotuloDaMarcacao(estado));
            // E o braco: a direccao do ataque de quem beneficia, ou a marca de
            // penalti. Ver Officials.sinalizarMarcacao.
            if (Officials.sinalizarMarcacao) Officials.sinalizarMarcacao(estado, team);
        }
        this.kickoffPendingPassToDef = false;
        
        // Ao marcar uma bola parada, a posse de bola já é da equipe que vai cobrar.
        if (this.possessionTeam !== team) {
            this.possessionTeam = team;
            this.possessionTimer = 0;
            this.counterAttackTeam = null;
            this.counterAttackTimer = 0;
        }

        this.setPieceTimer = 0;
        // GOAL_KICK é excepção: a bola continua com a velocidade que trazia
        // até tocar no chão + 3s (ver o teleporte próprio mais abaixo) — zerar
        // aqui, incondicional pra qualquer bola parada, matava esse
        // movimento no MESMO frame em que ela saía, antes mesmo de chegar
        // lá. Os outros tipos (canto, lateral) continuam a travar já.
        /*
        GOAL_KICK e CORNER_KICK são excepção: a bola continua com a velocidade
        que trazia até tocar no chão (ver o countdown em update()). Zerar aqui
        matava o movimento no MESMO frame em que ela saía — um remate que batia
        no poste e ia para trás da baliza congelava no ar e aparecia no canto.
        Os outros tipos (lateral) travam já.
        */
        if (type !== 'GOAL_KICK' && type !== 'CORNER_KICK') this.ballVel.set(0, 0, 0);
        this.intendedReceiver = null;
        this.passTargetPos = null;

        if (typeof MatchStats !== 'undefined' && MatchStats[team]) {
            if (type === 'CORNER_KICK') MatchStats[team].cantos++;
        }

        let attackingPlayers = (team === 'TeamA') ? this.players : this.opponents;
        let defendingPlayers = (team === 'TeamA') ? this.opponents : this.players;

        let attDir = (team === 'TeamA') ? 1 : -1;
        let defDir = -attDir;

        if (type === 'CORNER_KICK') {
            /*
            Geometria toda no pontoDeCanto (config.js): a bola na quina e no
            chão, quem bate FORA do campo e atrás dela, e o ponto da área para
            onde ele olha. Estava aqui à mão, com o batedor 1.5 m para DENTRO
            das duas linhas e virado para a bandeirola — de costas para a área.
            */
            const canto = pontoDeCanto(this.ball.position.x, attDir);
            const flagX = canto.bola.x;
            const flagZ = canto.bola.z;

            /*
            A bola NÃO é teleportada aqui. Fica a correr o resto do lance — cai,
            ressalta, passa para trás da baliza — e só depois é reposta na quina
            (ver o countdown do canto em update()). Mesma ideia do tiro de meta.
            */
            /*
            O lance ainda não está vivo: só passa a estar quando a bola sai do
            pé (ver o case SET_PIECE_TAKER na fsm.js). Limpa-se aqui para um
            canto novo não herdar o do anterior.
            */
            this.cantoVivo = null;

            this.cantoBolaAlvo = { x: canto.bola.x, y: canto.bola.y, z: canto.bola.z };
            this.cantoAguardaChao = true;
            this.cantoBolaAtraso = 1.2;

            /*
            Ninguém segura a bola numa bola parada. Sem isto o `hasBall` de
            quem tocou por último sobrevive ao apito e o player.update()
            continua a colar a bola a ele — no caso do guarda-redes, à altura
            do PEITO. Era a bola fora do chão que se via no canto.
            */
            this.players.concat(this.opponents).forEach(p => { p.hasBall = false; });
            this.ballCarrier = null;

            let taker = null;
            let minDist = 999;
            attackingPlayers.forEach(p => {
                if (p.role !== 'gk') {
                    let d = p.model.position.distanceTo(this.ball.position);
                    if (d < minDist) { minDist = d; taker = p; }
                }
            });

            this.setPieceTaker = taker;
            this.setPieceTaker.hasBall = false;

            // O alvo na área fica guardado: o SET_PIECE_TAKER volta a virá-lo
            // para lá todos os frames, e é para lá que ele centra.
            if (!this.cornerAlvo) this.cornerAlvo = new THREE.Vector3(); this.cornerAlvo.set(canto.alvo.x, ALTURA_BASE_Y, canto.alvo.z);

            taker.model.position.set(canto.batedor.x, ALTURA_BASE_Y, canto.batedor.z);
            lookAtBola(taker.model, this.cornerAlvo);
            taker.fsm.changeState('SET_PIECE_TAKER');

            const lado = Math.sign(this.ball.position.x) || 1;
            const linhaZ = attDir * (CAMPO_COMP / 2);

            // ==========================================
            // POSICIONAMENTO DO ATAQUE (9 jogadores de linha + batedor + GR)
            // ==========================================
            /*
            Geometria de referência (canto real): o miolo do ataque é um
            aglomerado APERTADO entre a linha da pequena área (5.5 m) e a marca
            de penálti (11 m), não uma fila espalhada pela área. Cada um destes
            slots tem o seu marcador em defenseSetup, a 1-1.5 m do lado da
            baliza — os dois arrays andam a par, mexer num pede mexer no outro.

            `initial` é onde ele espera pelo lance, `target` para onde ataca
            quando a bola sai: o movimento é sempre de FORA para DENTRO e da
            profundidade para a bola, que é como se ganha o corpo ao marcador.

            relX é medido do eixo da baliza, com sinal do lado do canto
            (+ = lado do batedor). Postes em ±3.66, pequena área em ±9.16.
            */
            const attackSetup = [
                // 1. Primeiro pau: entra a atacar a bola à frente do marcador
                { initial: { relX: 2.5, dist: 7.5 }, target: { relX: 3.6, dist: 4.5 } },
                // 2. Coração da área, à altura da marca de penálti
                { initial: { relX: 0.0, dist: 11.0 }, target: { relX: 0.0, dist: 8.0 } },
                // 3. Segundo pau: ataca de trás para a frente
                { initial: { relX: -4.5, dist: 8.5 }, target: { relX: -3.6, dist: 5.5 } },
                // 4. Segunda vaga central (chega atrasado à marca de penálti)
                { initial: { relX: 1.5, dist: 14.0 }, target: { relX: 1.5, dist: 11.0 } },
                // 5. Segunda vaga do lado oposto
                { initial: { relX: -2.5, dist: 13.0 }, target: { relX: -2.0, dist: 10.0 } },
                // 6. Em cima do guarda-redes, na linha da pequena área
                { initial: { relX: 1.0, dist: 6.5 }, target: { relX: 1.0, dist: 5.0 } },
                // 7. Sobra na entrada da área (meia-lua), para o ressalto
                { initial: { relX: 0.5, dist: 19.0 }, target: { relX: 0.5, dist: 17.5 } },
                // 8. Aberto no vértice da área, do lado do batedor
                { initial: { relX: 8.0, dist: 18.0 }, target: { relX: 7.0, dist: 16.5 } },
                // 9. Último homem / segurança defensiva
                { initial: { relX: 0.5, dist: 36.0 }, target: { relX: 0.5, dist: 34.0 } }
            ];

            let attackersInBox = attackingPlayers.filter(p => p !== taker && p.role !== 'gk');
            /*
            Ordena atacantes de modo que atacantes/médios ofensivos/zagueiros altos
            fiquem na área e laterais/volantes na sobra/segurança.

            `juntaSeAoAtaque` (Extra Frontman) conta como avançado SÓ AQUI: é
            este o momento em que o central sobe — compor a área e disputar o
            cabeceio na bola parada. Em jogo corrido o estilo não o desloca
            (ver extra_frontman em config.js). Sem isto ele caía no bloco
            'def' e ia parar à sobra ou ao último homem, a 34 m da baliza.
            */
            const subiuAoAtaque = (p) => (typeof estiloAtivoDe === 'function') &&
                !!estiloAtivoDe(p).juntaSeAoAtaque;
            attackersInBox.sort((a, b) => {
                const roleOrder = { 'ata': 1, 'mid': 2, 'def': 3 };
                const nota = (p) => subiuAoAtaque(p) ? 1 : (roleOrder[p.role] || 2);
                return nota(a) - nota(b);
            });

            attackersInBox.forEach((p, idx) => {
                const cfg = attackSetup[idx] || attackSetup[attackSetup.length - 1];
                const initX = lado * cfg.initial.relX;
                const initZ = linhaZ - attDir * cfg.initial.dist;
                const tgtX = lado * cfg.target.relX;
                const tgtZ = linhaZ - attDir * cfg.target.dist;

                p.model.position.set(initX, ALTURA_BASE_Y, initZ);
                p.dynamicTarget.set(tgtX, ALTURA_BASE_Y, tgtZ);
                p.setPieceTarget = new THREE.Vector3().copy(p.dynamicTarget);
                // Âncora da disputa antes da batida (ver SET_PIECE_WAIT na FSM).
                p.jostleAncora = { x: initX, z: initZ };
                p.jostleAngulo = Math.random() * Math.PI * 2;
                p.jostleRaio = Math.random() * SetPieceJostle.raio;
                p.jostleTimer = Math.random() * SetPieceJostle.intervaloMax;
                p.fsm.changeState('SET_PIECE_WAIT');
                lookAtBola(p.model, this.ball.position);
            });

            // ==========================================
            // POSICIONAMENTO DA DEFESA (10 jogadores de linha + GR)
            // ==========================================
            /*
            Defesa: dois homens nos postes, um marcador por cada atacante do
            aglomerado (sempre do lado da BALIZA em relação ao homem dele, ~1.5 m
            à frente), um na entrada da área para o ressalto e um saída no campo.

            Os índices 3-8 emparelham com os slots 1-6 do attackSetup pela mesma
            ordem. Se mexeres num array, mexe no outro.
            */
            const defenseSetup = [
                // 1. Primeiro pau, em cima da linha
                { relX: 3.4, dist: 0.6, tgt: { relX: 3.4, dist: 0.6 } },
                // 2. Segundo pau, em cima da linha
                { relX: -3.4, dist: 0.6, tgt: { relX: -3.4, dist: 0.6 } },
                // 3. Marca o atacante do primeiro pau (att 1)
                { relX: 3.4, dist: 5.8, tgt: { relX: 3.6, dist: 3.2 } },
                // 4. Marca o do coração da área (att 2)
                { relX: 0.0, dist: 9.2, tgt: { relX: 0.0, dist: 6.6 } },
                // 5. Marca o do segundo pau (att 3)
                { relX: -4.2, dist: 6.8, tgt: { relX: -3.6, dist: 4.2 } },
                // 6. Marca a segunda vaga central (att 4)
                { relX: 1.5, dist: 12.2, tgt: { relX: 1.5, dist: 9.6 } },
                // 7. Marca a segunda vaga do lado oposto (att 5)
                { relX: -2.5, dist: 11.2, tgt: { relX: -2.0, dist: 8.6 } },
                // 8. Zona da pequena área, à frente do guarda-redes (att 6)
                { relX: 1.0, dist: 4.2, tgt: { relX: 1.0, dist: 3.6 } },
                // 9. Entrada da área: corta o ressalto e o corner curto
                { relX: 2.0, dist: 16.5, tgt: { relX: 1.5, dist: 15.5 } },
                // 10. Saída: fica no campo para o contra-ataque
                { relX: 1.0, dist: 30.0, tgt: { relX: 1.0, dist: 30.0 } }
            ];

            let defendersInBox = defendingPlayers.filter(p => p.role !== 'gk');
            /*
            Ordena ao contrário do ataque: defesas e médios ocupam postes e
            marcações dentro da área, o avançado sobra para o slot 10 (saída no
            campo). Sem isto o slot era pela ordem do plantel — um avançado
            podia ficar no poste e um central lá longe no meio-campo.
            */
            defendersInBox.sort((a, b) => {
                const roleOrder = { 'def': 1, 'mid': 2, 'ata': 3 };
                return (roleOrder[a.role] || 2) - (roleOrder[b.role] || 2);
            });
            /*
            QUEM MARCA QUEM. Os slots 3-8 da defesa emparelham com os slots 1-6
            do ataque (ver os comentários dos dois arrays); guarda-se o par para
            a marcação sobreviver à batida — ver CornerDefenseModel e o ramo do
            canto no PlayerAI.tick. Sem isto o emparelhamento existia só na
            geometria inicial e desfazia-se no instante do cruzamento.
            */
            defendingPlayers.concat(attackingPlayers).forEach(p => { p.marcaNoCanto = null; });

            defendersInBox.forEach((p, idx) => {
                const cfg = defenseSetup[idx] || defenseSetup[defenseSetup.length - 1];
                // idx 2..7 são os seis marcadores; att 0..5 os seis homens da área.
                if (idx >= 2 && idx <= 7) p.marcaNoCanto = attackersInBox[idx - 2] || null;
                const initX = lado * cfg.relX;
                const initZ = linhaZ - attDir * cfg.dist;
                const tgtX = lado * cfg.tgt.relX;
                const tgtZ = linhaZ - attDir * cfg.tgt.dist;

                p.model.position.set(initX, ALTURA_BASE_Y, initZ);
                p.dynamicTarget.set(tgtX, ALTURA_BASE_Y, tgtZ);
                p.jostleAncora = { x: initX, z: initZ };
                p.jostleAngulo = Math.random() * Math.PI * 2;
                p.jostleRaio = Math.random() * SetPieceJostle.raio;
                p.jostleTimer = Math.random() * SetPieceJostle.intervaloMax;
                p.fsm.changeState('SET_PIECE_WAIT');
                lookAtBola(p.model, this.ball.position);
            });

            // O guarda-redes não disputa posição: fica na linha.
            [defendingPlayers, attackingPlayers].forEach(lista => {
                const g = lista.find(p => p.role === 'gk');
                if (g) g.jostleAncora = null;
            });

            let defGK = defendingPlayers.find(p => p.role === 'gk');
            if (defGK) {
                defGK.model.position.set(0, ALTURA_BASE_Y, linhaZ - attDir * 1.5);
                defGK.dynamicTarget.set(0, ALTURA_BASE_Y, linhaZ - attDir * 2.0);
                lookAtBola(defGK.model, this.ball.position);
                defGK.fsm.changeState('SET_PIECE_WAIT');
            }

            let attGK = attackingPlayers.find(p => p.role === 'gk');
            if (attGK) {
                attGK.model.position.set(0, ALTURA_BASE_Y, -linhaZ + attDir * 2.0);
                attGK.dynamicTarget.set(0, ALTURA_BASE_Y, -linhaZ + attDir * 2.0);
                lookAtBola(attGK.model, this.ball.position);
                attGK.fsm.changeState('SET_PIECE_WAIT');
            }

        } else if (type === 'THROW_IN') {
            /*
            LATERAL. A bola volta ao ponto da linha por onde saiu (z travado
            para não ficar em cima da bandeirola de canto), e repõe o jogador
            de campo mais perto desse ponto.

            Não se mexe nos outros dez: o nível 2 continua ligado no THROW_IN
            (ver nivel2Activo), portanto eles reorganizam-se sozinhos com o
            bloco em vez de irem para slots escritos à mão como no canto.
            */
            const ladoLinha = Math.sign(this.ball.position.x) || 1;
            const zLinha = THREE.MathUtils.clamp(this.ball.position.z,
                -(CAMPO_COMP / 2 - 1.0), CAMPO_COMP / 2 - 1.0);
            const xLinha = ladoLinha * (CAMPO_LARG / 2);

            this.ball.position.set(xLinha, BallPhysics.raio, zLinha);
            this.ballVel.set(0, 0, 0);

            this.players.concat(this.opponents).forEach(p => { p.hasBall = false; });
            this.ballCarrier = null;

            // Ordem do batedor: lateral, medio da ala, CM — ver
            // escolherBatedorDoLateral e ThrowInModel.ordemBatedor.
            const taker = escolherBatedorDoLateral(attackingPlayers, this.ball.position);
            this.setPieceTaker = taker || null;

            if (taker) {
                // Fica FORA do campo, atrás da linha, como manda a regra.
                taker.model.position.set(
                    ladoLinha * (CAMPO_LARG / 2 + ThrowInModel.recuoDaLinha),
                    ALTURA_BASE_Y, zLinha);
                taker.hasBall = false;
                taker.lateralAction = null;
                taker.lateralLargou = false;
                taker.fsm.changeState('LATERAL');
            }

            /*
            Adversários a menos de `afastaAdversarios` da bola dão um passo
            atrás — a regra manda 2 m, e sem isto ficavam colados ao batedor
            porque o slot do bloco os punha ali.
            */
            defendingPlayers.forEach(p => {
                if (p.role === 'gk') return;
                const dx = p.model.position.x - xLinha;
                const dz = p.model.position.z - zLinha;
                const d = Math.hypot(dx, dz);
                if (d > 0.001 && d < ThrowInModel.afastaAdversarios) {
                    const k = ThrowInModel.afastaAdversarios / d;
                    p.model.position.x = xLinha + dx * k;
                    p.model.position.z = zLinha + dz * k;
                }
            });

            this.lateralPendente = true;
            this.lateralAtraso = ESPERA_APOS_REPOSICAO;

        } else if (type === 'DIRECT_FREE_KICK') {
            /*
            ==================================================================
            FALTA DIRECTA — a cobranca de estudo
            ==================================================================
            O ramo FREE_KICK monta uma falta ONDE ELA ACONTECEU e decide entre
            remate, cruzamento e passe. Este monta a falta que se quer VER: a
            bola sorteada na faixa classica (ver pontoDaFaltaDirecta), barreira
            de cinco a fechar o canto do remate, marcacao individual no resto,
            guarda-redes na posicao do penalti e cobranca por cima da barreira.

            Constantes em DirectFreeKickModel; a geometria toda e pura e vive
            no utils.js, para se medir sem montar um jogo.
            */
            const DF = DirectFreeKickModel;
            const FKa = FreeKickModel;

            const ponto = pontoDaFaltaDirecta(attDir, Math.random);
            const bolaDF = new THREE.Vector3(ponto.x, BallPhysics.raio, ponto.z);
            this.ball.position.copy(bolaDF);
            this.ballVel.set(0, 0, 0);
            this.players.concat(this.opponents).forEach(p => {
                p.hasBall = false;
                p.naBarreiraFalta = false;
            });
            this.ballCarrier = null;

            const golDF = new THREE.Vector3(0, 0, attDir * (CAMPO_COMP / 2));
            const dirDF = new THREE.Vector3().subVectors(golDF, bolaDF);
            dirDF.y = 0;
            if (dirDF.lengthSq() < 0.0001) dirDF.set(0, 0, attDir);
            dirDF.normalize();

            // Bate o melhor tecnico de campo — a falta directa e o remate mais
            // tecnico que ha, e nao ha aqui zona nenhuma a decidir por funcao.
            let takerDF = null, melhorTecDF = -1;
            attackingPlayers.forEach(p => {
                if (p.role === 'gk') return;
                const t = p.skillFor('TEC');
                if (t > melhorTecDF) { melhorTecDF = t; takerDF = p; }
            });
            this.setPieceTaker = takerDF || null;

            if (takerDF) {
                takerDF.model.position.set(
                    bolaDF.x - dirDF.x * FKa.recuoBatedor, ALTURA_BASE_Y,
                    bolaDF.z - dirDF.z * FKa.recuoBatedor);
                takerDF.velocity.set(0, 0, 0);
                lookAtBola(takerDF.model, bolaDF);
                takerDF.fsm.changeState('SET_PIECE_WAIT');
                // Ponto de arranque do gesto — a aproximacao andada do ramo
                // faltaPendente (match_loop.js) leva-o ate aqui.
                takerDF.alvoFalta = new THREE.Vector3(
                    bolaDF.x - dirDF.x * FKa.arranqueDoGesto, ALTURA_BASE_Y,
                    bolaDF.z - dirDF.z * FKa.arranqueDoGesto);
            }

            /*
            A BARREIRA. Os cinco defensores de campo mais perto da bola, nos
            lugares do `lugaresDaBarreira` — encostada ao canto do remate, nao
            centrada na linha bola->baliza.
            */
            const defesaDF = defendingPlayers
                .filter(p => p.role !== 'gk')
                .sort((a, b) => a.model.position.distanceTo(bolaDF) - b.model.position.distanceTo(bolaDF));

            const nParede = Math.min(DF.barreiraN, defesaDF.length);
            const lugaresParede = lugaresDaBarreira(bolaDF.x, bolaDF.z, attDir, nParede, DF);
            const barreira = [];
            for (let i = 0; i < nParede; i++) {
                const p = defesaDF[i];
                p.model.position.set(lugaresParede[i].x, ALTURA_BASE_Y, lugaresParede[i].z);
                p.velocity.set(0, 0, 0);
                p.naBarreiraFalta = true;
                lookAtBola(p.model, bolaDF);
                p.fsm.changeState('SET_PIECE_WAIT');
                barreira.push(p);
            }
            this.faltaDirectaBarreira = barreira;

            /*
            OS COMPANHEIROS DE QUEM BATE: atras da linha da bola (nunca em
            fora-de-jogo) e fora do corredor bola->baliza (nunca a tapar a
            cobranca). Ver lugaresDoApoioNaFaltaDirecta.
            */
            /*
            SÓ OS MAIS PERTO VÃO PARA O LEQUE (DF.apoiosNoLeque). Os nove
            punham 40 m de leque atrás da bola e arrastavam a defesa toda com
            eles; o resto da equipa fica onde o bloco os põe.
            */
            const candidatosDF = attackingPlayers
                .filter(p => p !== takerDF && p.role !== 'gk')
                .sort((a, b) => a.model.position.distanceTo(bolaDF) - b.model.position.distanceTo(bolaDF));
            const apoiosDF = candidatosDF.slice(0, DF.apoiosNoLeque);
            const lugaresApoio = lugaresDoApoioNaFaltaDirecta(
                bolaDF.x, bolaDF.z, attDir, apoiosDF.length, DF);
            apoiosDF.forEach((p, i) => {
                const l = lugaresApoio[i];
                p.model.position.set(l.x, ALTURA_BASE_Y, l.z);
                p.velocity.set(0, 0, 0);
                p.dynamicTarget.set(l.x, ALTURA_BASE_Y, l.z);
                p.setPieceTarget = new THREE.Vector3(l.x, ALTURA_BASE_Y, l.z);
                p.jostleAncora = null;
                lookAtBola(p.model, bolaDF);
                p.fsm.changeState('SET_PIECE_WAIT');
            });

            /*
            OS OUTROS ficam onde estão, com uma correcção só: quem estiver à
            frente da linha da bola recua para trás dela. É o suficiente para
            não haver fora-de-jogo e evita a equipa toda em fila atrás da bola.
            */
            candidatosDF.slice(DF.apoiosNoLeque).forEach(p => {
                const avanco = p.model.position.z * attDir;
                const limite = bolaDF.z * attDir - DF.recuoOnside;
                if (avanco > limite) {
                    p.model.position.z = attDir * limite;
                    p.dynamicTarget.set(p.model.position.x, ALTURA_BASE_Y, p.model.position.z);
                }
                p.velocity.set(0, 0, 0);
                p.jostleAncora = null;
                lookAtBola(p.model, bolaDF);
                p.fsm.changeState('SET_PIECE_WAIT');
            });

            /*
            E OS DEFENSORES QUE SOBRAM MARCAM. Cada um cola-se ao seu homem,
            do lado da PROPRIA baliza: e a marcacao de uma falta, nao um bloco.
            Os atacantes ja estao colocados, portanto isto le posicoes finais.
            */
            const marcadores = defesaDF.slice(nParede);
            /*
            Só se marca quem está PERTO DA BOLA (DF.raioDaMarcacao). Marcar o
            leque todo levava os laterais para a bandeirola de canto e deixava
            a área vazia — está nas imagens do relato.
            */
            const marcaveis = attackingPlayers
                .filter(p => p !== takerDF && p.role !== 'gk' &&
                    p.model.position.distanceTo(bolaDF) <= DF.raioDaMarcacao)
                .sort((a, b) => a.model.position.distanceTo(bolaDF) - b.model.position.distanceTo(bolaDF));
            const semHomem = [];
            marcadores.forEach((d, i) => {
                const alvoM = marcaveis[i];
                if (!alvoM) { semHomem.push(d); return; }
                const ax = alvoM.model.position.x, az = alvoM.model.position.z;
                d.model.position.set(ax, ALTURA_BASE_Y, az + attDir * DF.distanciaMarcacao);
                d.velocity.set(0, 0, 0);
                lookAtBola(d.model, bolaDF);
                d.fsm.changeState('SET_PIECE_WAIT');
            });

            /*
            E OS QUE SOBRAM VOLTAM À PRÓPRIA ÁREA. Sem isto ficavam onde a
            jogada os tinha deixado — medido, o defensor mais longe da bola
            estava a 64 m dela, do outro lado do campo, com a falta a 20 m da
            baliza dele.
            */
            if (semHomem.length) {
                const linhaZ = attDir * (CAMPO_COMP / 2) - attDir * DF.recuoLinhaDefensiva;
                const passoX = DF.larguraLinhaDefensiva / Math.max(1, semHomem.length - 1);
                semHomem.forEach((d, i) => {
                    const x = (semHomem.length === 1)
                        ? 0
                        : -DF.larguraLinhaDefensiva / 2 + i * passoX;
                    d.model.position.set(x, ALTURA_BASE_Y, linhaZ);
                    d.velocity.set(0, 0, 0);
                    lookAtBola(d.model, bolaDF);
                    d.fsm.changeState('SET_PIECE_WAIT');
                });
            }

            /*
            OS 9.15 m, no fim e sobre toda a gente que defende — a barreira ja
            la esta e nao e tocada, mas um marcador cujo homem esteja junto a
            bola cairia dentro da distancia regulamentar.
            */
            defendingPlayers.forEach(p => {
                if (p.role === 'gk') return;
                const dx = p.model.position.x - bolaDF.x;
                const dz = p.model.position.z - bolaDF.z;
                const d = Math.hypot(dx, dz);
                if (d >= FKa.afastaAdversarios) return;
                let ux, uz;
                if (d > 0.001) { ux = dx / d; uz = dz / d; }
                else { ux = 0; uz = -attDir; }
                p.model.position.x = THREE.MathUtils.clamp(
                    bolaDF.x + ux * FKa.afastaAdversarios, -(CAMPO_LARG / 2 - 1), CAMPO_LARG / 2 - 1);
                p.model.position.z = THREE.MathUtils.clamp(
                    bolaDF.z + uz * FKa.afastaAdversarios, -(CAMPO_COMP / 2 - 1), CAMPO_COMP / 2 - 1);
                lookAtBola(p.model, bolaDF);
            });

            /*
            O GUARDA-REDES fica como no penalti: em cima da linha, ao centro,
            parado a espera. A ancora do `updateGK` le a flag `faltaDirecta`
            para nao o mandar sair da baliza antes da batida.
            */
            /*
            E ELE FICA DO LADO QUE A BARREIRA NAO FECHA (pedido).

            A barreira esta encostada ao poste do lado de onde se bate — esse
            canto e dela. Ao meio da linha, como num penalti, o guarda-redes
            duplicava metade do que a barreira ja tapava e deixava o outro
            canto a mesma distancia de sempre. Desloca-se `deslocamentoGk`
            para o lado ABERTO.
            */
            const ladoBarreira = Math.sign(bolaDF.x) || 1;
            this.faltaDirectaGkX = -ladoBarreira * (DF.deslocamentoGk || 0);

            const gkDF = defendingPlayers.find(p => p.role === 'gk');
            if (gkDF) {
                gkDF.model.position.set(this.faltaDirectaGkX, ALTURA_BASE_Y, attDir * (CAMPO_COMP / 2));
                gkDF.velocity.set(0, 0, 0);
                gkDF.gkEstado = 'idle';
                gkDF.gkReagiu = false;
                gkDF.gkDelayReacao = 0;
                gkDF.dive = null;
                gkDF.isPenaltyDive = false;
                lookAtBola(gkDF.model, bolaDF);
                gkDF.resetBonesToDefault();
            }

            this.faltaPendente = true;
            this.faltaAtraso = ESPERA_APOS_REPOSICAO;

        } else if (type === 'FREE_KICK') {
            /*
            FALTA. A bola fica onde está — é esse o ponto da infracção. Cobra o
            jogador da equipa beneficiada mais perto dela; a defesa monta
            barreira na linha bola->baliza, à distância regulamentar, e quem
            estiver mais perto do que isso é afastado.
            */
            const F = FreeKickModel;
            const bolaFK = this.ball.position.clone();
            bolaFK.y = BallPhysics.raio;
            this.ball.position.copy(bolaFK);

            this.players.concat(this.opponents).forEach(p => { p.hasBall = false; });
            this.ballCarrier = null;

            // Direcção da bola para a baliza atacada — serve para o batedor
            // (atrás da bola) e para a barreira (à frente dela).
            const golFK = new THREE.Vector3(0, 0, attDir * (CAMPO_COMP / 2));
            const dirFK = new THREE.Vector3().subVectors(golFK, bolaFK);
            dirFK.y = 0;
            if (dirFK.lengthSq() < 0.0001) dirFK.set(0, 0, attDir);
            dirFK.normalize();
            const perpFK = new THREE.Vector3(-dirFK.z, 0, dirFK.x);

            /*
            QUEM BATE. Era o mais PERTO da bola — a cobrança calhava a quem a
            jogada tinha deixado ali, e via-se um central a bater uma falta na
            entrada da área adversária.

            Agora sai do sector (FreeKickModel.batedorPorSetor): na defesa e no
            meio-campo recuado batem os DEFENSORES (o de melhor Técnica), do
            meio-campo para a frente bate o melhor técnico NÃO-defensor, e no
            cruzamento pela ala bate o LATERAL — porque os centrais e os pontas
            queremo-los dentro da área a atacar a bola.

            A decisão da bola calcula-se aqui em cima porque o sector de ataque
            depende dela: cruzar e rematar não têm o mesmo desenho.
            */
            const decisaoFK = (typeof decisaoDeFalta === 'function')
                ? decisaoDeFalta(bolaFK.x, bolaFK.z, attDir) : 'passe';
            const setorPreliminar = (typeof setorDaFalta === 'function')
                ? setorDaFalta(bolaFK.x, bolaFK.z, attDir, decisaoFK) : 'meio_avancado';
            const criterioFK = (F.batedorPorSetor && F.batedorPorSetor[setorPreliminar]) || 'naoDef';

            const takerFK = (typeof batedorDaFalta === 'function')
                ? batedorDaFalta(attackingPlayers, criterioFK, p => p.skillFor('TEC'))
                : null;
            this.setPieceTaker = takerFK || null;

            if (takerFK) {
                takerFK.model.position.set(
                    bolaFK.x - dirFK.x * F.recuoBatedor, ALTURA_BASE_Y,
                    bolaFK.z - dirFK.z * F.recuoBatedor);
                takerFK.velocity.set(0, 0, 0);
                lookAtBola(takerFK.model, bolaFK);
                takerFK.fsm.changeState('SET_PIECE_WAIT');
                
                // Guarda o ponto onde o gesto de remate vai arrancar, para a aproximação andada
                takerFK.alvoFalta = new THREE.Vector3(
                    bolaFK.x - dirFK.x * F.arranqueDoGesto,
                    ALTURA_BASE_Y,
                    bolaFK.z - dirFK.z * F.arranqueDoGesto
                );
            }

            /*
            Barreira: mais gente quanto mais perto da baliza. Perpendicular à
            linha bola->baliza, ombro com ombro, centrada nessa linha.
            */
            const avancoFK = bolaFK.z * attDir;
            const nBarreira = (avancoFK > F.barreiraZonaZ) ? F.barreiraMax : F.barreiraMin;

            const defesaOrdenada = defendingPlayers
                .filter(p => p.role !== 'gk')
                .sort((a, b) => a.model.position.distanceTo(bolaFK) - b.model.position.distanceTo(bolaFK));

            defesaOrdenada.forEach((p, i) => {
                if (i < nBarreira) {
                    const off = (i - (nBarreira - 1) / 2) * F.espacamentoBarreira;
                    p.model.position.set(
                        bolaFK.x + dirFK.x * F.distanciaBarreira + perpFK.x * off, ALTURA_BASE_Y,
                        bolaFK.z + dirFK.z * F.distanciaBarreira + perpFK.z * off);
                } else {
                    // Fora da barreira: só não pode estar mais perto do que 9.15 m.
                    const dx = p.model.position.x - bolaFK.x;
                    const dz = p.model.position.z - bolaFK.z;
                    const d = Math.hypot(dx, dz);
                    if (d > 0.001 && d < F.afastaAdversarios) {
                        const k = F.afastaAdversarios / d;
                        p.model.position.x = bolaFK.x + dx * k;
                        p.model.position.z = bolaFK.z + dz * k;
                    }
                }
                lookAtBola(p.model, bolaFK);
                p.fsm.changeState('SET_PIECE_WAIT');
            });

            /*
            ==========================================================
            ONDE SE PÕE A EQUIPA QUE COBRA
            ==========================================================
            Antes só o batedor e cinco homens na área eram colocados, e só a
            partir do `zonaDeArea` — nas outras faltas os dez ficavam onde a
            jogada os tinha deixado. Uma falta na própria defesa tinha o mesmo
            desenho de uma falta ao lado da área: nenhum.

            Agora o desenho sai do SECTOR (ver setorDaFalta e
            FreeKickModel.formacaoPorSetor). Os lugares são geometria pura e
            vivem no `lugaresDaFalta` (utils.js), para se poderem medir sem
            montar um jogo.

            O `dynamicTarget` é escrito a par da posição: sem ele o nível 1
            reescreve o alvo no frame seguinte e eles saem todos do lugar antes
            de a bola ser batida.
            */
            const setorFK = setorDaFalta(bolaFK.x, bolaFK.z, attDir, decisaoFK);
            this.setorDaFaltaActual = setorFK;

            const restantes = attackingPlayers.filter(p => p !== takerFK && p.role !== 'gk');
            const lugares = lugaresDaFalta(bolaFK.x, bolaFK.z, attDir, restantes, setorFK);

            lugares.forEach(l => {
                const p = l.p;
                p.model.position.set(l.x, ALTURA_BASE_Y, l.z);
                p.dynamicTarget.set(l.x, ALTURA_BASE_Y, l.z);
                p.setPieceTarget = new THREE.Vector3(l.x, ALTURA_BASE_Y, l.z);
                /*
                A disputa de posição (jostle) só para quem ataca a área: no
                meio-campo não há ninguém em cima deles para disputar, e o
                passo-à-volta-da-âncora lia-se como indecisão.
                */
                if (setorFK === 'ataque_lateral' || setorFK === 'ataque_entrada') {
                    p.jostleAncora = { x: l.x, z: l.z };
                    p.jostleAngulo = Math.random() * Math.PI * 2;
                    p.jostleRaio = Math.random() * SetPieceJostle.raio;
                    p.jostleTimer = Math.random() * SetPieceJostle.intervaloMax;
                } else {
                    p.jostleAncora = null;
                }
                p.fsm.changeState('SET_PIECE_WAIT');
                lookAtBola(p.model, bolaFK);
            });

            /*
            E OS MARCADORES da defesa, só quando há área para marcar. Os
            defensores que SOBRAM da barreira — ela é obrigação e vem primeiro.
            Sem isto os atacantes ficavam na área sozinhos, que é tão irreal
            como a área vazia.

            O afastamento dos 9.15 m corre DEPOIS disto (ver mais abaixo): estes
            slots são medidos da linha de fundo e não sabem onde está a bola.
            */
            if (setorFK === 'ataque_lateral' || setorFK === 'ataque_entrada') {
                const ladoFK = Math.sign(bolaFK.x) || 1;
                const linhaFundoFK = attDir * LINHA_FUNDO;
                const naArea = lugares.filter(l => Area.contem(l.x, l.z, linhaFundoFK));
                const livres = defesaOrdenada.slice(nBarreira);
                for (let i = 0; i < naArea.length && i < livres.length && i < F.slotsMarcacao.length; i++) {
                    const cfg = F.slotsMarcacao[i];
                    const d = livres[i];
                    d.model.position.set(
                        ladoFK * cfg.relX, ALTURA_BASE_Y,
                        linhaFundoFK - attDir * cfg.dist);
                    // Marcação POSICIONAL: o slot é que emparelha com o do
                    // atacante. O `markingTarget` não serve aqui — está
                    // atribuído em vários sítios e não é lido por ninguém.
                    lookAtBola(d.model, bolaFK);
                    d.fsm.changeState('SET_PIECE_WAIT');
                }
            }

            /*
            OS 9.15 m, DEPOIS DE TODA A GENTE COLOCADA.

            O afastamento existia, mas corria no meio do posicionamento — só
            sobre os defensores que sobram da barreira, e ANTES de os
            marcadores serem postos nos `slotsMarcacao`. Esses slots são
            medidos a partir da LINHA DE FUNDO e não sabem nada de onde está a
            bola: numa falta perto da área caem lá dentro dos 9.15 m.

            Medido numa falta a 20 m da baliza, distâncias dos dez defensores à
            bola depois do setup:

                2.35  7.37  9.16  9.16  9.24  9.24  10.81  13.28 ...
                 ^^^^  ^^^^ dois marcadores dentro da distância regulamentar

            Esta passagem é a última, e por isso é a que manda: empurra
            radialmente para fora quem estiver a menos de `afastaAdversarios`,
            barreira incluída (ela está a 9.15 e não é tocada). O guarda-redes
            fica de fora — a baliza dele pode estar a menos do que isso da bola,
            e não é ele que faz barreira.
            */
            defendingPlayers.forEach(p => {
                if (p.role === 'gk') return;
                const dx = p.model.position.x - bolaFK.x;
                const dz = p.model.position.z - bolaFK.z;
                const d = Math.hypot(dx, dz);
                if (d >= F.afastaAdversarios) return;

                // Em cima da bola não há direcção nenhuma: empurra-se para a
                // própria baliza, que é o lado que um defensor recuaria.
                let ux, uz;
                if (d > 0.001) { ux = dx / d; uz = dz / d; }
                else { ux = 0; uz = -attDir; }

                p.model.position.x = THREE.MathUtils.clamp(
                    bolaFK.x + ux * F.afastaAdversarios, -(CAMPO_LARG / 2 - 1), CAMPO_LARG / 2 - 1);
                p.model.position.z = THREE.MathUtils.clamp(
                    bolaFK.z + uz * F.afastaAdversarios, -(CAMPO_COMP / 2 - 1), CAMPO_COMP / 2 - 1);
                lookAtBola(p.model, bolaFK);
            });

            this.faltaPendente = true;
            this.faltaAtraso = ESPERA_APOS_REPOSICAO;

        } else if (type === 'PENALTY') {
            /*
            PENÁLTI. Bola na marca, batedor atrás dela, guarda-redes na linha e
            toda a gente fora da área E fora da meia-lua. O remate tem resolução
            própria (ver executarPenalti) — os pesos do remate em jogo corrido
            não se aplicam a uma bola parada a 11 m sem oposição.
            */
            const PM = PenaltyModel;
            const linhaGolPen = attDir * (CAMPO_COMP / 2);
            const marcaZ = linhaGolPen - attDir * PM.marcaZ;

            this.ball.position.set(0, BallPhysics.raio, marcaZ);
            this.ballVel.set(0, 0, 0);
            this.players.concat(this.opponents).forEach(p => { p.hasBall = false; });
            this.ballCarrier = null;

            // Bate o melhor rematador da equipa.
            let takerPen = null, melhorTec = -1;
            attackingPlayers.forEach(p => {
                if (p.role === 'gk') return;
                const t = p.skillFor('TEC');
                if (t > melhorTec) { melhorTec = t; takerPen = p; }
            });
            this.setPieceTaker = takerPen || null;

            if (takerPen) {
                takerPen.model.position.set(0, ALTURA_BASE_Y, marcaZ - attDir * PM.recuoBatedor);
                lookAtBola(takerPen.model, this.ball.position);
                takerPen.fsm.changeState('SET_PIECE_WAIT');
            }

            /*
            Os outros DEZANOVE (dois planteis menos os dois guarda-redes e o
            batedor) formam a fila da ENTRADA DA ÁREA, como nas imagens de
            referência: um aglomerado à entrada da área, com as duas equipas
            MESCLADAS, escalonado em profundidade por função, e sempre por FORA
            da meia-lua.

            A meia-lua é um círculo de 9.15 m centrado na MARCA, não uma faixa
            em z — a primeira versão testava `|x| < raio` e `|z - marca| < raio`,
            que é um quadrado, e deixava jogadores dentro do arco nas diagonais.
            Aqui o teste é o do círculo, e quem cai lá dentro é empurrado
            radialmente para fora a partir da marca.
            */
            const limiteZ = linhaGolPen - attDir * PM.margemArea;
            const filaZ = limiteZ - attDir * PM.folgaArea;   // um passo fora da área

            /*
            A fila é MESCLADA: as duas equipas intercaladas, como nas imagens de
            referência. Era `players.concat(opponents)`, ou seja o plantel todo
            de uma equipa e depois o da outra — e com a alternância a partir do
            eixo isso punha uma equipa ao centro e a outra nas pontas, cada uma
            no seu bloco. Ninguém disputa um ressalto assim.

            Dentro de cada equipa a ordem é a mesma do canto (`def → mid → ata`),
            e é ela que decide quem fica MAIS ATRÁS: os atacantes ficam à frente,
            a atacar o ressalto, e os defesas escalonados para trás, prontos para
            o contra-ataque. Ver defenseSetup no CORNER_KICK, que ordena assim
            pela mesma razão.
            */
            /*
            Dentro de cada equipa, as FUNÇÕES são intercaladas — ata, mid, def,
            ata, mid, def…

            Ao contrário do canto, onde a ordem `def → mid → ata` importa porque
            cada índice cai num SLOT diferente (poste, marcação, saída). Aqui os
            lugares são só posições ao longo do x, e o que a função decide é a
            PROFUNDIDADE. Ordenar por função — ou usar a ordem do plantel, que
            vem ordenada na mesma — punha os defesas todos num lado da fila e os
            atacantes no outro: segregava por posição depois de se ter resolvido
            a segregação por equipa.
            */
            /*
            COBERTURA: quem NÃO vai ao ressalto. Dois defesas e um médio de
            quem bate (a guardar as costas contra o contra-ataque) e dois
            atacantes de quem defende (à espera dele). Estes saem da fila e
            formam uma linha própria mais atrás e AO CENTRO — ver a colocação
            no fim deste ramo.

            Antes ficavam na fila com o x que lhes calhava e só recuavam: como
            a fila tem 21 lugares a 2.2 m, os que sobram estão nas pontas, e o
            que se via eram três jogadores encostados à linha lateral.
            */
            const cobertura = new Set();
            {
                const escolher = (lista, role, quantos) => lista
                    .filter(p => p !== takerPen && p.role === role &&
                        p.role !== 'gk' && !cobertura.has(p))
                    .slice(0, quantos)
                    .forEach(p => cobertura.add(p));
                escolher(attackingPlayers, 'def', PM.coberturaDef);
                escolher(attackingPlayers, 'mid', PM.coberturaMid);
                escolher(defendingPlayers, 'ata', PM.coberturaAtaAdv);
            }

            const naEntrada = lista => {
                const restantes = lista.filter(
                    p => p !== takerPen && p.role !== 'gk' && !cobertura.has(p));
                const filas = {
                    ata: restantes.filter(p => p.role === 'ata'),
                    mid: restantes.filter(p => p.role === 'mid'),
                    def: restantes.filter(p => p.role === 'def')
                };
                // Quem não tem uma das três funções vai para o meio.
                filas.mid = filas.mid.concat(
                    restantes.filter(p => !['ata', 'mid', 'def'].includes(p.role)));

                const ordem = ['ata', 'mid', 'def'];
                const saida = [];
                while (saida.length < restantes.length) {
                    let mexeu = false;
                    for (const r of ordem) {
                        if (filas[r].length) { saida.push(filas[r].shift()); mexeu = true; }
                    }
                    if (!mexeu) break;   // rede de segurança contra ciclo infinito
                }
                return saida;
            };

            /*
            A mescla é na ORDEM ESPACIAL, não na ordem da lista.

            Intercalar as listas (A, B, A, B…) e distribuir depois com a
            alternância a partir do eixo — `0, +1, -1, +2, -2…` — dá o resultado
            OPOSTO ao pretendido: os índices pares levam sempre passo positivo e
            os ímpares sempre negativo, portanto uma equipa fica toda à direita e
            a outra toda à esquerda. Perfeitamente segregadas, que é pior do que
            o bloco de origem.

            Por isso a fila é construída como posições ORDENADAS da esquerda para
            a direita, e as equipas alternam ao longo dessas posições.
            */
            const ladoA = naEntrada(this.players);
            const ladoB = naEntrada(this.opponents);
            const totalFila = ladoA.length + ladoB.length;

            const naFila = [];
            let iA = 0, iB = 0;
            for (let j = 0; j < totalFila; j++) {
                // Alterna; quando uma das equipas esgota, vai a outra.
                const querA = (j % 2 === 0);
                const p = (querA && iA < ladoA.length) ? ladoA[iA++]
                    : (iB < ladoB.length) ? ladoB[iB++]
                        : ladoA[iA++];
                naFila.push(p);
            }

            naFila.forEach((p, i) => {
                // Fila centrada no eixo, da esquerda para a direita.
                const centrado = i - (totalFila - 1) / 2;
                let x = centrado * PM.espacamentoFila;
                x = THREE.MathUtils.clamp(x, -(PM.areaX + 4.0), PM.areaX + 4.0);

                /*
                Escalonamento em profundidade por função: o defesa fica
                `recuoPorRole.def` metros mais atrás do que o atacante. Sem isto
                estavam todos na mesma linha, o que lê como uma parede e não como
                um aglomerado à espera do ressalto.
                */
                const recuo = (PM.recuoPorRole && PM.recuoPorRole[p.role] !== undefined)
                    ? PM.recuoPorRole[p.role] : 0.0;
                let z = filaZ - attDir * recuo;

                // Fora da meia-lua: círculo de raio 9.15 centrado na marca.
                const dx = x - 0, dz = z - marcaZ;
                const d = Math.hypot(dx, dz);
                const rMin = PM.raioMeiaLua + PM.folgaArco;
                if (d < rMin) {
                    const k = (d > 0.001) ? rMin / d : 1;
                    x = dx * k;
                    z = marcaZ + (d > 0.001 ? dz * k : -attDir * rMin);
                }

                p.model.position.set(x, ALTURA_BASE_Y, z);
                lookAtBola(p.model, this.ball.position);
                p.fsm.changeState('SET_PIECE_WAIT');
            });

            /*
            Linha da cobertura: `recuoCobertura` metros atrás da fila e
            CENTRADA no eixo do campo, com espaçamento próprio — é gente a
            cobrir o meio, não a fechar uma linha lateral.

            Mesclada como a fila: quem defende o ressalto (os dois atacantes
            adversários) alterna com quem o guarda, senão ficavam dois grupos
            colados. E os atacantes ficam `avancoAtaAdv` metros À FRENTE dos
            outros — estão à espera da bola, não a guardá-la.
            */
            const naCobertura = Array.from(cobertura);
            {
                const guardam = naCobertura.filter(p => attackingPlayers.includes(p));
                const esperam = naCobertura.filter(p => !attackingPlayers.includes(p));
                const mesclada = [];
                let iG = 0, iE = 0;
                while (mesclada.length < naCobertura.length) {
                    if (iG < guardam.length) mesclada.push(guardam[iG++]);
                    if (iE < esperam.length) mesclada.push(esperam[iE++]);
                    if (iG >= guardam.length && iE >= esperam.length) break;
                }

                const zCobertura = filaZ - attDir * PM.recuoCobertura;
                mesclada.forEach((p, i) => {
                    const centrado = i - (mesclada.length - 1) / 2;
                    const x = THREE.MathUtils.clamp(
                        centrado * PM.espacamentoCobertura,
                        -PM.limiteXCobertura, PM.limiteXCobertura);
                    const avanco = attackingPlayers.includes(p) ? 0 : PM.avancoAtaAdv;
                    p.model.position.set(x, ALTURA_BASE_Y, zCobertura + attDir * avanco);
                    lookAtBola(p.model, this.ball.position);
                    p.fsm.changeState('SET_PIECE_WAIT');
                });
            }

            // Guarda-redes que defende: SOBRE a linha de golo, pronto a reagir.
            const gkPen = defendingPlayers.find(p => p.role === 'gk');
            if (gkPen) {
                gkPen.model.position.set(0, ALTURA_BASE_Y, linhaGolPen);
                gkPen.gkEstado = 'idle';
                gkPen.gkReagiu = false;
                gkPen.gkDelayReacao = 0;
                gkPen.dive = null;
                lookAtBola(gkPen.model, this.ball.position);
                gkPen.resetBonesToDefault();
            }

            this.penaltiPendente = true;
            this.penaltiAtraso = ESPERA_APOS_REPOSICAO;

        } else if (type === 'GOAL_KICK') {
            /*
            Tiro de meta. `team` é quem BATE (a equipa que defende aquela
            baliza). A bola vai para a quina da pequena área do lado por onde
            saiu — `attDir` aqui é a direcção de ataque de quem bate, logo a
            baliza dele está em -attDir.
            */
            const G = GoalkeeperPose;
            const ladoX = Math.sign(this.ball.position.x) || 1;
            const linhaZ = -attDir * LINHA_FUNDO;            // linha de fundo dele
            const bolaX = ladoX * Area.pequenaMeiaLargura;
            const bolaZ = linhaZ + attDir * Area.pequenaProfundidade;       // para dentro do campo

            /*
            A bola NÃO teleporta já — continua o movimento que trazia até
            tocar no chão (`golKickAguardaChao`), só DEPOIS espera 3s
            (`golKickBolaAtraso`), e só então é puxada para a quina da
            pequena área e travada (ver o countdown em update() e o guard
            contra o clamp da linha de fundo em updateBall()). Os jogadores
            já reagem e se posicionam nesse meio tempo. Pedido explícito —
            antes ia instantaneamente.
            */
            this.golKickBolaAlvo = { x: bolaX, z: bolaZ };
            this.golKickAguardaChao = true;
            this.golKickBolaAtraso = 3.0;

            this.ballCarrier = null;
            this.golKickProntos = false;
            this.golKickEspera = 0;
            this.golKickAlvoEspera = 0; // Removida a espera (sem parada)
            this.golKickPendente = true;
            this.golKickAtrasoInicio = ESPERA_APOS_REPOSICAO;

            const gk = attackingPlayers.find(p => p.role === 'gk');
            this.setPieceTaker = gk || null;

            if (gk) {
                gk.hasBall = false;
                /*
                Fica quieto no ponto de arranque: o 'tiro_meta' (caminhada +
                corrida + chute) só começa ESPERA_APOS_REPOSICAO segundos
                depois de a bola assentar na quina da pequena área — ver
                golKickPendente no update().
                */
                gk.gkEstado = 'tiro_meta_espera';
                gk.gkTiroFase = 0;              // 0 = caminhar, 1 = corrida
                gk.gkTempoMergulho = 0;
                gk.gkKickAction = null;
                const recuo = G.tiroMetaRecuo || 3.8;
                // Posição de arranque atrás da bola à esquerda do alinhamento da bola
                gk.gkTiroAlvo = {
                    x: bolaX + gk.dirZ * 0.70,
                    z: bolaZ - gk.dirZ * recuo
                };
                // Posiciona o goleiro no ponto de partida do tiro de meta virado para a bola
                gk.model.position.set(gk.gkTiroAlvo.x, ALTURA_BASE_Y, gk.gkTiroAlvo.z);
                lookAtBola(gk.model, { x: bolaX, y: ALTURA_BASE_Y, z: bolaZ });
            }

            /*
            Os outros de quem bate: sobem um pouco para o meio-campo, como na
            construção normal quando o próprio guarda-redes tem a bola — não
            ficam encolhidos junto à própria área. Referência é o mesmo tecto
            "Linha Defensiva" do painel que baliza a equipa em jogo corrido
            (TeamShape.linhaDefensiva, aplicado à traseira do bloco em
            computeBlock, team_bt.js), só
            que aqui aplicado como avanço a partir da posição de formação
            (`baseTarget`), não como recuo a partir da bola.

            `MOVE_TO_POS` sobrevive ao ramo `esperarLance` do PlayerBT (ver
            player_bt.js) — sem essa excepção o BT reescrevia o estado para
            IDLE no frame seguinte e ninguém saía do sítio.
            */
            const capGK = TeamShape.linhaDefensiva[Tatics.linhaDefensiva] ?? TeamShape.linhaDefensiva.medium;
            attackingPlayers.forEach(p => {
                if (p.role === 'gk') return;
                p.hasBall = false;

                const atkZ = p.baseTarget.z * p.dirZ;
                const tecto = Math.max(atkZ, capGK);
                const novoAtkZ = Math.min(atkZ + 6.0, tecto);

                p.dynamicTarget.set(p.baseTarget.x, ALTURA_BASE_Y, novoAtkZ * p.dirZ);
                p.speedMult = 4.0;
                p.fsm.changeState('MOVE_TO_POS');
            });
            defendingPlayers.forEach(p => {
                if (p.role === 'gk') return;
                // Empurra para fora da grande área adversária.
                const dentroArea = Area.contem(p.model.position.x, p.model.position.z, linhaZ);
                if (dentroArea) {
                    p.model.position.z = linhaZ + attDir * (Area.profundidade + 1.0);
                }

                /*
                Antes ficavam SET_PIECE_WAIT logo aqui — que zera a velocity
                todos os frames e só vira para a bola, nunca anda. Quem já
                estava fora da área ficava plantado onde a bola saiu, sem se
                reorganizar (ver screenshot: adversário todo desalinhado no
                tiro de meta). MOVE_TO_POS sobrevive ao BolaParada do
                PlayerBT durante GOAL_KICK (ver esperarLance em
                player_bt.js) — usa-se o mesmo caminho de quem bate, só que
                para a posição de formação normal.
                */
                p.dynamicTarget.set(p.baseTarget.x, ALTURA_BASE_Y, p.baseTarget.z);
                p.speedMult = 4.0;
                p.fsm.changeState('MOVE_TO_POS');
            });
        }
    },

    triggerGoalKick: function (forceTeam = null) {
        let team = forceTeam;
        if (!team) {
            team = (this.ball && this.ball.position.z > 0) ? 'TeamB' : 'TeamA';
        }
        this.setupSetPiece('GOAL_KICK', team);
        if (this.golKickBolaAlvo) {
            this.ball.position.set(this.golKickBolaAlvo.x, BallPhysics.raio, this.golKickBolaAlvo.z);
            this.ballVel.set(0, 0, 0);
            this.golKickAguardaChao = false;
            this.golKickBolaAtraso = 0;
            this.golKickBolaAlvo = null;
        }
    },

    triggerFreeKick: function (forceTeam = null) {
        const team = forceTeam ||
            (this.ballCarrier ? this.ballCarrier.team : null) ||
            this.possessionTeam || this.lastTouchedTeam || 'TeamA';
        this.setupSetPiece('FREE_KICK', team);
    },

    /*
    FALTA DIRECTA FORCADA — o botao do painel. A posicao da bola e sorteada
    pelo proprio setup (ver o ramo DIRECT_FREE_KICK), portanto aqui so se
    decide QUEM bate.
    */
    triggerDirectFreeKick: function (forceTeam = null) {
        const team = forceTeam ||
            (this.ballCarrier ? this.ballCarrier.team : null) ||
            this.possessionTeam || this.lastTouchedTeam || 'TeamA';
        this.setupSetPiece('DIRECT_FREE_KICK', team);
    },

    triggerPenalty: function (forceTeam = null) {
        const team = forceTeam ||
            (this.ballCarrier ? this.ballCarrier.team : null) ||
            this.possessionTeam || this.lastTouchedTeam || 'TeamA';
        this.setupSetPiece('PENALTY', team);
    },

    triggerThrowIn: function (forceTeam = null) {
        const ultimo = this.lastTouchedTeam ||
            (this.ballCarrier ? this.ballCarrier.team : null) || 'TeamA';
        const team = forceTeam || (ultimo === 'TeamA' ? 'TeamB' : 'TeamA');
        this.setupSetPiece('THROW_IN', team);
    },

    triggerCornerKick: function (forceTeam = null) {
        let team = forceTeam;
        if (!team) {
            team = (this.ball && this.ball.position.z >= 0) ? 'TeamA' : 'TeamB';
        }
        this.setupSetPiece('CORNER_KICK', team);
    },

    updateGoalKickWait: function (dt) {
        if (this.state !== 'GOAL_KICK') return;

        const team = this.setPieceTaker ? this.setPieceTaker.team : null;
        const atacantes = (team === 'TeamA') ? this.players : this.opponents;

        atacantes.forEach(p => {
            if (p.role === 'gk') return;
            if (p.fsm.currentState === 'MOVE_TO_POS' &&
                p.model.position.distanceTo(p.dynamicTarget) < 1.5) {
                p.fsm.changeState('SET_PIECE_WAIT');
            }
        });

        if (!this.golKickProntos) {
            const todosProntos = atacantes.every(p => {
                if (p.role === 'gk') return true;
                return p.fsm.currentState === 'SET_PIECE_WAIT';
            });
            if (todosProntos) this.golKickProntos = true;
        } else {
            this.golKickEspera += dt;
        }
    },
});
