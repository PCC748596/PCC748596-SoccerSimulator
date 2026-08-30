Object.assign(Match, {
    init: function (scene) {
        this.scene = scene;
        this.currentLookTarget = new THREE.Vector3(0, 0, 0);

        if (typeof EventBus !== 'undefined' && !this._eventBusBound) {
            this._eventBusBound = true;
            EventBus.on('GK_CATCH_BALL', (d) => {
                if (this.gkHoldingBall) this.gkHoldingBall[d.team] = true;
            });
            EventBus.on('GK_RELEASE_BALL', (d) => {
                if (this.gkHoldingBall) this.gkHoldingBall[d.team] = false;
            });
            EventBus.on('CB_HAS_BALL', (d) => {
                const p = d.p;
                const teammates = (p.team === 'TeamA') ? this.players : this.opponents;
                const outroCB = teammates.find(t => t.pos === 'CB' && t !== p);
                const rm = teammates.find(t => t.pos === 'RM');
                const lm = teammates.find(t => t.pos === 'LM');
                const rb = teammates.find(t => t.pos === 'RB');
                const lb = teammates.find(t => t.pos === 'LB');
                
                const ladoJogada = Math.sign(p.model.position.x) || Math.sign(this.ball.position.x) || 1;
                const mesmoLado = (ladoJogada > 0) ? rm || rb : lm || lb;
                const ladoOposto = (ladoJogada > 0) ? lm || lb : rm || rb;
                
                const aplicar = (jog, ofs) => {
                    if (!jog) return;
                    if (!jog.buildOutOffset) jog.buildOutOffset = new THREE.Vector3();
                    jog.buildOutOffset.setZ(ofs * jog.dirZ);
                    jog.buildOutTimer = 5.0;
                };
                
                aplicar(outroCB, -3);
                aplicar(mesmoLado, 3);
                aplicar(ladoOposto, 5);
            });
        }

            /*
            Migração por eventos — parte 3: CM. Quando um CM fica com a
            bola: médio-ala do lado da jogada avança 5m, lateral do mesmo
            lado avança 10m, CM oposto recua (dá support atrás), médio-ala
            do lado oposto avança 3m. Mesmo bias temporário (5s) do CB.
            */
            if (!this._eventBusBoundCM) { this._eventBusBoundCM = true; EventBus.on('CM_HAS_BALL', (d) => {
                const p = d.p;
                const teammates = (p.team === 'TeamA') ? this.players : this.opponents;
                const outroCM = teammates.find(t => t.pos === 'CM' && t !== p);
                const rm = teammates.find(t => t.pos === 'RM');
                const lm = teammates.find(t => t.pos === 'LM');
                const rb = teammates.find(t => t.pos === 'RB');
                const lb = teammates.find(t => t.pos === 'LB');

                const ladoJogada = Math.sign(p.model.position.x) || Math.sign(this.ball.position.x) || 1;
                const mesmoM = (ladoJogada < 0) ? lm : rm;
                const opostoM = (ladoJogada < 0) ? rm : lm;
                const mesmoB = (ladoJogada < 0) ? lb : rb;

                const aplicar = (jog, metros) => {
                    if (!jog) return;
                    jog.buildOutBias = { x: 0, z: metros * jog.dirZ };
                    jog.buildOutTimer = 5.0;
                };
                aplicar(mesmoM, 5);
                aplicar(mesmoB, 10);
                aplicar(outroCM, -4);
                aplicar(opostoM, 3);
            }); }

        this.createField();

        this.ball = new THREE.Group();
        // ballVisual pode ser um Group (malha do OBJ, um mesh por material) ou
        // um Mesh (bola procedural). Ambos têm scale e quaternion, que é tudo o
        // que o updateBall lhes toca.
        this.ballVisual = this.criarBola(BallPhysics.raio * BallPhysics.escalaVisual);
        this.ball.add(this.ballVisual); this.scene.add(this.ball);

        this.offsideLineA = new THREE.Mesh(new THREE.PlaneGeometry(CAMPO_LARG, 0.25), new THREE.MeshBasicMaterial({ color: 0x3498db, transparent: true, opacity: 0.65, side: THREE.DoubleSide }));
        this.offsideLineA.rotation.x = -Math.PI / 2; this.offsideLineA.position.y = 0.04; this.offsideLineA.visible = false;
        this.scene.add(this.offsideLineA);

        this.offsideLineB = new THREE.Mesh(new THREE.PlaneGeometry(CAMPO_LARG, 0.25), new THREE.MeshBasicMaterial({ color: 0xe74c3c, transparent: true, opacity: 0.65, side: THREE.DoubleSide }));
        this.offsideLineB.rotation.x = -Math.PI / 2; this.offsideLineB.position.y = 0.04; this.offsideLineB.visible = false;
        this.scene.add(this.offsideLineB);
        const lineGeomA = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-CAMPO_LARG/2, 0.05, 0), new THREE.Vector3(CAMPO_LARG/2, 0.05, 0)]);
        this.defLineA = new THREE.LineSegments(lineGeomA, new THREE.LineDashedMaterial({ color: 0x3498db, dashSize: 1, gapSize: 1 }));
        this.defLineA.computeLineDistances();
        this.defLineA.visible = false;
        this.scene.add(this.defLineA);
        const lineGeomB = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-CAMPO_LARG/2, 0.05, 0), new THREE.Vector3(CAMPO_LARG/2, 0.05, 0)]);
        this.defLineB = new THREE.LineSegments(lineGeomB, new THREE.LineDashedMaterial({ color: 0xe74c3c, dashSize: 1, gapSize: 1 }));
        this.defLineB.computeLineDistances();
        this.defLineB.visible = false;
        this.scene.add(this.defLineB);

        this.btPosRectA = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x3498db, linewidth: 2 }));
        this.btPosRectA.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4 * 3), 3));
        this.btPosRectA.visible = false;
        this.scene.add(this.btPosRectA);

        this.btPosRectB = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xe74c3c, linewidth: 2 }));
        this.btPosRectB.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4 * 3), 3));
        this.btPosRectB.visible = false;
        this.scene.add(this.btPosRectB);

        /*
        DIAGONAIS DO BLOCO: as duas diagonais do rectângulo, que se cruzam no
        centro dele. Servem para ler de relance se o centro do bloco está
        mesmo sobre a bola — a olho, num rectângulo grande, não se distingue
        um centro certo de um centro 8 m atrás.

        LineSegments com 4 vértices = dois segmentos independentes (canto a
        canto), ao contrário do LineLoop do contorno.
        */
        const criarDiagonais = (cor) => {
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4 * 3), 3));
            const linha = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: cor, transparent: true, opacity: 0.45 }));
            linha.visible = false;
            this.scene.add(linha);
            return linha;
        };
        this.btPosDiagA = criarDiagonais(0x3498db);
        this.btPosDiagB = criarDiagonais(0xe74c3c);

        // Marca do centro do bloco — o ponto onde as diagonais se cruzam.
        const criarCentro = (cor) => {
            const m = new THREE.Mesh(
                new THREE.PlaneGeometry(0.85, 0.85),
                new THREE.MeshBasicMaterial({ color: cor, side: THREE.DoubleSide })
            );
            m.rotation.x = -Math.PI / 2;
            m.position.y = 0.06;
            m.visible = false;
            this.scene.add(m);
            return m;
        };
        this.btPosCentroA = [criarCentro(0x3498db), criarCentro(0x3498db), criarCentro(0x3498db)];
        this.btPosCentroB = [criarCentro(0xe74c3c), criarCentro(0xe74c3c), criarCentro(0xe74c3c)];
        
        /*
        AS TRÊS LINHAS DO BLOCO — defesa, meio e ataque.

        Eram DUAS (4 vértices): desenhavam-se o `zMid` e o `zAtk`, e nunca o
        `zDef`. Enquanto o `zAtk` estava a 2/3 da profundidade, as duas caíam
        dentro da moldura e viam-se três faixas — que era o bug do bloco a ser
        desenhado (ver a sessão de 30 de Agosto). Com o `zAtk` corrigido para a
        frente do bloco, uma das linhas passou a coincidir com a moldura e
        desaparecia.

        DUAS COISAS DIFERENTES, e era por estarem misturadas que o `zAtk` estava
        errado — servia de âncora do ataque E de divisória dos 2/3 ao mesmo
        tempo:

          AS ÂNCORAS (`zDef`, `zMid`, `zAtk`) são os pontos entre os quais o `v`
          da formação interpola. Têm de cobrir o bloco INTEIRO, senão a formação
          encolhe — foi esse o bug. NÃO são desenhadas: hoje a de trás e a da
          frente são a própria moldura, e a do meio no meio não acrescenta nada
          à leitura. Quando cada linha ganhar a sua própria âncora (fase C) passa
          a valer a pena desenhá-las, e aí levam um estilo próprio.

          AS DIVISÓRIAS (1/3 e 2/3) partem o rectângulo nas três FAIXAS — defesa,
          meio e ataque. É isto que se desenha: duas divisórias, três faixas, e o
          marcador aceso diz em que faixa está a bola.

        Três âncoras dão duas faixas; são as divisórias que dão três.
        */
        const criarLinhasTercos = (cor) => {
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4 * 3), 3));
            const linha = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: cor, transparent: true, opacity: 0.6 }));
            linha.visible = false;
            this.scene.add(linha);
            return linha;
        };
        this.btPosTercosA = criarLinhasTercos(0x3498db);
        this.btPosTercosB = criarLinhasTercos(0xe74c3c);

        this.passTargetVisual = new THREE.Mesh(
            new THREE.CircleGeometry(0.5, 32),
            new THREE.MeshBasicMaterial({ color: 0xffff00, side: THREE.DoubleSide })
        );
        this.passTargetVisual.rotation.x = -Math.PI / 2;
        this.passTargetVisual.position.y = 0.12;
        this.passTargetVisual.visible = false;
        this.scene.add(this.passTargetVisual);

        this.passLineVisual = new THREE.Line(
            new THREE.BufferGeometry(),
            new THREE.LineBasicMaterial({ color: 0xffff00 })
        );
        this.passLineVisual.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
        this.passLineVisual.visible = false;
        this.scene.add(this.passLineVisual);

        this.goalLineVisual = new THREE.Line(
            new THREE.BufferGeometry(),
            new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 1 })
        );
        this.goalLineVisual.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
        this.goalLineVisual.visible = false;
        this.scene.add(this.goalLineVisual);

        // Anti Ping-Pong Aéreo: rastreia cabeceios sucessivos sem a bola assentar no chão/pé
        this.aerialHeaderCount = 0;
        this.aerialHeaderTimer = 0;

        this.showOffsideLines = false;

        this.createTeams();
        this.resetPlay();
        this.setupKeyboardListeners();
    },

    createField: function () {
        const campoGrupo = new THREE.Group();
        let gramaLarg = CAMPO_LARG + 52;
        let gramaComp = CAMPO_COMP + 34;
        const cvsR = document.createElement('canvas'); const ctxR = cvsR.getContext('2d'); cvsR.width = 16; cvsR.height = 512;
        const stripeHeights = [];
        for (let i = 0; i < 3; i++) stripeHeights.push(17 / 3);
        for (let i = 0; i < 20; i++) stripeHeights.push(CAMPO_COMP / 20);
        for (let i = 0; i < 3; i++) stripeHeights.push(17 / 3);
        let currentY = 0;
        for (let i = 0; i < 26; i++) {
            let nextY = currentY + stripeHeights[i];
            let yStartPix = Math.round((currentY / gramaComp) * 512);
            let yEndPix = Math.round((nextY / gramaComp) * 512);
            ctxR.fillStyle = (i % 2 === 0) ? '#4B8B3B' : '#428032';
            ctxR.fillRect(0, yStartPix, 16, yEndPix - yStartPix);
            currentY = nextY;
        }
        const relvaTex = new THREE.CanvasTexture(cvsR);
        relvaTex.wrapS = THREE.RepeatWrapping; relvaTex.wrapT = THREE.ClampToEdgeWrapping; relvaTex.repeat.set(15, 1);
        window.relva = new THREE.Mesh(new THREE.PlaneGeometry(gramaLarg, gramaComp), new THREE.MeshStandardMaterial({ map: relvaTex, roughness: 1.0 }));
        window.relva.rotation.x = -Math.PI / 2; window.relva.receiveShadow = true; campoGrupo.add(window.relva);

        const matLinha = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
        const esp = 0.15; const comp = CAMPO_COMP; const larg = CAMPO_LARG;
        function addLinha(w, h, x, z) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), matLinha); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.02, z); m.receiveShadow = true; campoGrupo.add(m); }
        addLinha(larg + esp, esp, 0, comp / 2); addLinha(larg + esp, esp, 0, -comp / 2); addLinha(esp, comp + esp, larg / 2, 0); addLinha(esp, comp + esp, -larg / 2, 0); addLinha(larg, esp, 0, 0);

        const circ = new THREE.Mesh(new THREE.RingGeometry(9.15 - esp / 2, 9.15 + esp / 2, 64), matLinha); circ.rotation.x = -Math.PI / 2; circ.position.y = 0.02; campoGrupo.add(circ);
        const ptC = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16), matLinha); ptC.rotation.x = -Math.PI / 2; ptC.position.y = 0.02; campoGrupo.add(ptC);

        /*
        OS QUATRO CANTOS: quarto de círculo e bandeirinha.

        O arco é o mesmo `RingGeometry` deitado do arco da grande área; o que
        muda é o `thetaStart`, que tem de apontar o quarto para DENTRO do
        campo. Essa conta saiu para `arcoDeCanto` (utils.js) porque o `z` fica
        invertido quando o anel é deitado — é o género de sinal que se acerta
        por tentativa e se volta a perder na alteração seguinte.

        A bandeira fica virada para o meio do campo e é `DoubleSide`: de um
        lado só, desaparecia consoante a câmara, e esta anda à volta toda.
        */
        const CF = CornerFlag;
        const matPosteCanto = new THREE.MeshStandardMaterial({ color: CF.corPoste, roughness: 0.6 });
        const matBandeira = new THREE.MeshStandardMaterial({
            color: CF.corBandeira, roughness: 0.9, side: THREE.DoubleSide
        });

        [1, -1].forEach(sx => [1, -1].forEach(sz => {
            const cx = sx * larg / 2, cz = sz * comp / 2;

            const quarto = new THREE.Mesh(
                new THREE.RingGeometry(CF.raioArco - esp / 2, CF.raioArco + esp / 2,
                    16, 1, arcoDeCanto(sx, sz), Math.PI / 2),
                matLinha);
            quarto.rotation.x = -Math.PI / 2;
            quarto.position.set(cx, 0.02, cz);
            quarto.receiveShadow = true;
            campoGrupo.add(quarto);

            const poste = new THREE.Mesh(
                new THREE.CylinderGeometry(CF.raioPoste, CF.raioPoste, CF.alturaPoste, 8),
                matPosteCanto);
            poste.position.set(cx, CF.alturaPoste / 2, cz);
            poste.castShadow = true;
            campoGrupo.add(poste);

            /*
            A bandeira sai do poste para DENTRO do campo (-sx), no topo.

            SEM rotação nenhuma: o `PlaneGeometry` já nasce no plano XY, ou
            seja com a largura em X e a altura em Y — que é exactamente um pano
            preso ao poste e a apontar para dentro ao longo de X. Rodá-lo em Y
            punha-o a estender-se em Z enquanto a posição o desloca em X, e a
            bandeira ficava ao lado do poste em vez de presa a ele.
            */
            const bandeira = new THREE.Mesh(
                new THREE.PlaneGeometry(CF.larguraBandeira, CF.alturaBandeira), matBandeira);
            bandeira.position.set(
                cx - sx * (CF.larguraBandeira / 2 + CF.raioPoste),
                CF.alturaPoste - CF.alturaBandeira / 2 - 0.05,
                cz);
            bandeira.castShadow = true;
            campoGrupo.add(bandeira);
        }));

        const cvsRede = document.createElement('canvas'); cvsRede.width = 32; cvsRede.height = 32; const ctxRede = cvsRede.getContext('2d');
        ctxRede.fillStyle = 'rgba(240, 240, 245, 0.35)'; ctxRede.fillRect(0, 0, 32, 32);
        ctxRede.strokeStyle = 'rgba(255, 255, 255, 0.9)'; ctxRede.lineWidth = 1.5; ctxRede.strokeRect(0, 0, 32, 32);
        ctxRede.strokeStyle = 'rgba(220, 220, 230, 0.5)'; ctxRede.lineWidth = 0.8;
        ctxRede.beginPath(); ctxRede.moveTo(0, 0); ctxRede.lineTo(32, 32); ctxRede.stroke();
        ctxRede.beginPath(); ctxRede.moveTo(32, 0); ctxRede.lineTo(0, 32); ctxRede.stroke();
        const texRede = new THREE.CanvasTexture(cvsRede); texRede.wrapS = THREE.RepeatWrapping; texRede.wrapT = THREE.RepeatWrapping;
        const matRede = new THREE.MeshBasicMaterial({ map: texRede, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });

        /*
        Uma face da rede. Passou de um quad de QUATRO vértices para uma grelha
        (ver gerarGrelhaRede em goal_net.js): sem vértices pelo meio, a rede não
        podia deformar-se — era uma chapa rígida com textura de rede.

        Os cantos, as UVs e o aspecto em repouso são os mesmos; só há mais
        vértices entre eles.
        */
        function criarFaceRede(p1, p2, p3, p4, repX, repY, nu, nv) {
            const g = gerarGrelhaRede(p1, p2, p3, p4, repX, repY,
                nu || GoalNet.segmentosU, nv || GoalNet.segmentosV);

            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(g.posicoes, 3));
            geo.setAttribute('uv', new THREE.BufferAttribute(g.uvs, 2));
            geo.setIndex(g.indices);
            geo.computeVertexNormals();
            return new THREE.Mesh(geo, matRede);
        }

        [1, -1].forEach(lado => {
            const zSinal = comp / 2 * lado; const dir = -lado;
            const zGA = zSinal + (Area.profundidade / 2) * dir;
            addLinha(Area.largura, esp, 0, zSinal + Area.profundidade * dir);
            addLinha(esp, Area.profundidade + esp, Area.meiaLargura, zGA);
            addLinha(esp, Area.profundidade + esp, -Area.meiaLargura, zGA);

            const zPA = zSinal + (Area.pequenaProfundidade / 2) * dir;
            addLinha(Area.pequenaLargura, esp, 0, zSinal + Area.pequenaProfundidade * dir);
            addLinha(esp, Area.pequenaProfundidade + esp, Area.pequenaMeiaLargura, zPA);
            addLinha(esp, Area.pequenaProfundidade + esp, -Area.pequenaMeiaLargura, zPA);

            const ptPen = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16), matLinha); ptPen.rotation.x = -Math.PI / 2; ptPen.position.set(0, 0.02, zSinal + Area.distanciaPenalti * dir); campoGrupo.add(ptPen);
            const theta = Math.acos(Area.pequenaProfundidade / Area.raioMeiaLua); const arcRot = lado === 1 ? Math.PI / 2 - theta : -Math.PI / 2 - theta;
            const arco = new THREE.Mesh(new THREE.RingGeometry(Area.raioMeiaLua - esp / 2, Area.raioMeiaLua + esp / 2, 32, 1, arcRot, theta * 2), matLinha); arco.rotation.x = -Math.PI / 2; arco.position.set(0, 0.02, zSinal + Area.distanciaPenalti * dir); campoGrupo.add(arco);

            const baliza = new THREE.Group();
            const matPoste = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }); const rP = GoalFrame.raioPoste;
            const posteEsq = new THREE.Mesh(new THREE.CylinderGeometry(rP, rP, ALTURA_BALIZA, 16), matPoste); posteEsq.position.set(-LARGURA_BALIZA / 2, ALTURA_BALIZA / 2, 0); posteEsq.castShadow = true;
            const posteDir = new THREE.Mesh(new THREE.CylinderGeometry(rP, rP, ALTURA_BALIZA, 16), matPoste); posteDir.position.set(LARGURA_BALIZA / 2, ALTURA_BALIZA / 2, 0); posteDir.castShadow = true;
            const travessao = new THREE.Mesh(new THREE.CylinderGeometry(rP, rP, LARGURA_BALIZA + rP * 2, 16), matPoste); travessao.rotation.z = Math.PI / 2; travessao.position.set(0, ALTURA_BALIZA + rP, 0); travessao.castShadow = true;
            baliza.add(posteEsq, posteDir, travessao);

            const profTop = 0.8; const profBot = 2.0; const w = LARGURA_BALIZA / 2;
            const tLE = [-w, ALTURA_BALIZA, 0]; const tLD = [w, ALTURA_BALIZA, 0];
            const tTE = [-w, ALTURA_BALIZA, profTop]; const tTD = [w, ALTURA_BALIZA, profTop];
            const bTE = [-w, 0, profBot]; const bTD = [w, 0, profBot];
            const bFE = [-w, 0, 0]; const bFD = [w, 0, 0];

            const S = GoalNet;
            // Os laterais são estreitos: menos divisões ao longo de u.
            const redeCima = criarFaceRede(tLE, tLD, tTE, tTD, 30, 4, S.segmentosU, S.segmentosV);
            const redeTras = criarFaceRede(tTE, tTD, bTE, bTD, 30, 10, S.segmentosU, S.segmentosV);
            const redeEsq = criarFaceRede(bFE, tLE, bTE, tTE, 8, 10, S.segmentosLateralU, S.segmentosV);
            const redeDir = criarFaceRede(tLD, bFD, tTD, bTD, 8, 10, S.segmentosLateralU, S.segmentosV);

            const redes = new THREE.Group(); redes.add(redeCima, redeTras, redeEsq, redeDir);

            /*
            Regista as faces no NetWave para poderem ondular. A normal de cada
            uma é aproximada pelo eixo dominante: chega para o deslocamento
            visual, e evita ter de recalcular normais por vértice a cada frame.
            */
            if (typeof NetWave !== 'undefined') {
                NetWave.registarFace(redeCima, lado, { x: 0, y: 1, z: 0 }, S.segmentosU, S.segmentosV);
                NetWave.registarFace(redeTras, lado, { x: 0, y: 0, z: 1 }, S.segmentosU, S.segmentosV);
                NetWave.registarFace(redeEsq, lado, { x: 1, y: 0, z: 0 }, S.segmentosLateralU, S.segmentosV);
                NetWave.registarFace(redeDir, lado, { x: 1, y: 0, z: 0 }, S.segmentosLateralU, S.segmentosV);
            }
            if (lado === -1) { redes.scale.z = -1; }

            baliza.add(redes); baliza.position.set(0, 0, zSinal + (rP * dir)); campoGrupo.add(baliza);
        });

        const concreteMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.9 });
        const stepGeos = [];

        function addStepBox(w, h, d, px, py, pz, rotY) {
            const geo = new THREE.BoxGeometry(w, h, d).toNonIndexed();
            if (rotY) geo.rotateY(rotY);
            geo.translate(px, py, pz);
            stepGeos.push(geo);
        }

        /*
        Cadeiras da bancada. A altura passou de 0.30 para 0.075 — um quarto:
        eram cubos altos de mais e liam-se como caixotes, não como assentos.

        A geometria é centrada na origem, portanto encolher só a altura fazia a
        BASE subir metade da diferença e as cadeiras ficavam a flutuar acima do
        degrau. O `translate` desce o centro exactamente essa metade, e a base
        fica onde estava.
        */
        const SEAT_ALT_ANTIGA = 0.3, SEAT_ALT = SEAT_ALT_ANTIGA / 4;
        const seatGeo = new THREE.BoxGeometry(0.5, SEAT_ALT, 0.4);
        seatGeo.translate(0, -(SEAT_ALT_ANTIGA - SEAT_ALT) / 2, 0);
        const seatMat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.1 });

        const maxSeats = 30000;
        const seatMesh = new THREE.InstancedMesh(seatGeo, seatMat, maxSeats);
        seatMesh.castShadow = false;
        seatMesh.receiveShadow = false;

        const specGeo = createSpectatorGeometry();
        const specMat = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.1 });
        specMat.userData = { time: { value: 0 }, excitement: { value: 0 } };
        specMat.onBeforeCompile = function (shader) {
            shader.uniforms.uTime = specMat.userData.time;
            shader.uniforms.uExcitement = specMat.userData.excitement;
            shader.vertexShader = 'uniform float uTime;\nuniform float uExcitement;\n' + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace(
                '#include <project_vertex>',
                `
                #ifdef USE_INSTANCING
                float phase = instanceMatrix[3].x * 13.0 + instanceMatrix[3].z * 7.0;
                float t = uTime;
                float exc = uExcitement;
                
                float standUp = 0.0;
                float armWave = 0.0;
                float lean = 0.0;
                
                float wavePhase = mod(floor(phase * 10.0), 3.0);
                standUp = abs(sin(t * (4.0 + wavePhase) + phase)) * 0.12;
                
                if (exc > 0.7) {
                    standUp = 0.15 + abs(sin(t * 9.0 + phase)) * 0.18;
                    armWave = sin(t * 11.0 + phase) * 0.25;
                } else if (exc > 0.35) {
                    standUp *= 1.4;
                    armWave = sin(t * 6.0 + phase) * 0.12;
                    lean = sin(t * 4.0 + phase) * 0.04;
                } else {
                    lean = sin(t * 2.0 + phase) * 0.02;
                }

                transformed.y += standUp;
                transformed.x += lean;
                
                float cW = cos(armWave);
                float sW = sin(armWave);
                float tx = transformed.x;
                float tz = transformed.z;
                transformed.x = tx * cW - tz * sW;
                transformed.z = tx * sW + tz * cW;
                #endif
                
                #include <project_vertex>
                `
            );
        };
        const specMesh = new THREE.InstancedMesh(specGeo, specMat, maxSeats);
        specMesh.castShadow = false;
        specMesh.receiveShadow = false;

        let seatIndex = 0;
        let spectatorIndex = 0;
        const dummy = new THREE.Object3D();
        const specDummy = new THREE.Object3D();

        /*
        CORES DA BANCADA — vermelho e branco, em composição desenhada.

        Antes cada cadeira sorteava uma de quatro cores (azul, vermelho,
        branco, amarelo) com `Math.random`. Isso dá ruído: de longe lê-se como
        um chão salpicado, não como uma bancada. Um estádio real pinta os
        assentos num PADRÃO, e é o padrão que se vê da câmara alta.

        Aqui o padrão sai da FILA e da COLUNA de cada cadeira, portanto é
        determinístico — a bancada é a mesma em cada arranque, como já é a
        multidão (ver o gerador com semente em js/crowd.js).

        A composição, de baixo para cima nas 30 filas:

            filas 0-1     branco   contorno claro a rodear o campo
            filas 8-9     branco   faixa do meio
            filas 18-19   branco   faixa alta
            filas 28-29   branco   remate do topo
            resto         vermelho

        As filas logo acima de cada faixa branca levam DENTES: blocos brancos
        de 3 colunas a cada 12, deslocados pela fila. Sem eles as faixas eram
        quatro linhas a direito e o conjunto ficava com ar de código de barras;
        os dentes quebram a horizontal e dão a leitura de mosaico.
        */
        const SEAT_VERMELHO = new THREE.Color('#c0392b');
        const SEAT_BRANCO = new THREE.Color('#ecf0f1');
        const SEAT_FILAS_BRANCAS = [0, 1, 8, 9, 18, 19, 28, 29];
        // Filas com dentes: a que fica logo acima de cada faixa branca.
        const SEAT_FILAS_DENTADAS = [2, 10, 20];
        const SEAT_DENTE_PERIODO = 12, SEAT_DENTE_LARGURA = 3;

        /*
        Variação de tom por cadeira. Sem isto uma faixa inteira é uma chapa de
        cor exacta e o plástico não se lê. É determinística — um hash da fila e
        da coluna, não `Math.random` — para a bancada não mudar entre corridas.
        */
        const SEAT_VARIACAO = 0.10;
        const _seatCor = new THREE.Color();

        function seatEhBranca(fila, coluna) {
            if (SEAT_FILAS_BRANCAS.indexOf(fila) !== -1) return true;
            if (SEAT_FILAS_DENTADAS.indexOf(fila) !== -1) {
                // O deslocamento por fila impede que os dentes de duas filas
                // dentadas fiquem alinhados na vertical.
                const c = (coluna + fila * 5) % SEAT_DENTE_PERIODO;
                return c < SEAT_DENTE_LARGURA;
            }
            return false;
        }

        function getSeatColor(fila, coluna) {
            _seatCor.copy(seatEhBranca(fila, coluna) ? SEAT_BRANCO : SEAT_VERMELHO);
            // Hash inteiro barato: dá sempre o mesmo valor para a mesma cadeira.
            const h = ((fila * 73856093) ^ (coluna * 19349663)) & 0x7fffffff;
            const k = 1 + ((h / 0x7fffffff) - 0.5) * 2 * SEAT_VARIACAO;
            return _seatCor.multiplyScalar(k);
        }

        /*
        Todos os lugares construídos, para o `Crowd` (js/crowd.js) lá pôr os
        adeptos com o modelo dos jogadores. É recolhido aqui porque só quem
        constrói as bancadas sabe onde os lugares ficam — e o Crowd precisa
        deles TODOS antes de decidir seja o que for: a mescla das duas claques
        sai da posição em Z de cada lugar face aos extremos do estádio.
        */
        const lugares = [];

        function addSeatInstance(x, y, z, rotY, fila, coluna) {
            if (seatIndex >= maxSeats) return;
            dummy.position.set(x, y, z);
            dummy.rotation.set(0, rotY, 0);
            dummy.updateMatrix();
            seatMesh.setMatrixAt(seatIndex, dummy.matrix);
            seatMesh.setColorAt(seatIndex, getSeatColor(fila || 0, coluna || 0));
            seatIndex++;

            // O adepto senta-se um pouco acima do assento.
            lugares.push({ x: x, y: y + 0.13, z: z, rotY: rotY });

            const crowdAllowed = false && (typeof Config === 'undefined' || Config.enableCrowd !== false);
            if (crowdAllowed && Math.random() < 0.75 && spectatorIndex < maxSeats) {
                specDummy.position.set(x, y + 0.13, z);
                specDummy.rotation.set(0, rotY, 0);
                specDummy.updateMatrix();
                specMesh.setMatrixAt(spectatorIndex, specDummy.matrix);

                let teamColor;
                let t = (z + 55) / 110;
                t = Math.max(0, Math.min(1, t));
                let probRed = t * 0.85;
                let probBlue = (1 - t) * 0.85;
                let rnd = Math.random();
                if (rnd < probRed) {
                    teamColor = new THREE.Color('#e74c3c');
                } else if (rnd < probRed + probBlue) {
                    teamColor = new THREE.Color('#2980b9');
                } else {
                    teamColor = new THREE.Color('#ecf0f1');
                }

                specMesh.setColorAt(spectatorIndex, teamColor);
                Match.specData.push({ bx: x, by: y + 0.13, bz: z, rotY: rotY, phase: Math.random() * Math.PI * 2 });
                spectatorIndex++;
            }
        }

        const rows = 30;

        function buildCorner(cx, cz, startAngle) {
            for (let r = 0; r < rows; r++) {
                const R = 6.5 + r * 1.2;
                const standY = 0.25 + (r * 0.5);

                const numSteps = Math.max(4, Math.floor(R * (Math.PI / 2) / 2.5));
                const stepLength = (R * (Math.PI / 2) / numSteps) * 1.05;
                for (let j = 0; j <= numSteps; j++) {
                    const angle = startAngle + (j / numSteps) * (Math.PI / 2);
                    const sx = cx + R * Math.cos(angle);
                    const sz = cz + R * Math.sin(angle);
                    addStepBox(1.2, 0.5, stepLength, sx, standY, sz, -angle);
                }

                const seatYOffset = standY + 0.25 + 0.15;
                const numSeats = Math.floor(R * (Math.PI / 2) / 0.85);
                for (let i = 0; i <= numSeats; i++) {
                    const angle = startAngle + (i / numSeats) * (Math.PI / 2);
                    const sx = cx + R * Math.cos(angle);
                    const sz = cz + R * Math.sin(angle);
                    const rotY = Math.atan2(-sx, -sz);
                    addSeatInstance(sx, seatYOffset, sz, rotY, r, i);
                }
            }
        }

        // Bancada Oeste (Esquerda)
        for (let r = 0; r < rows; r++) {
            const standX = -(CAMPO_LARG / 2 + 4.5) - (r * 1.2);
            const standY = 0.25 + (r * 0.5);
            addStepBox(1.2, 0.5, CAMPO_COMP + 2, standX, standY, 0, 0);

            const seatYOffset = standY + 0.25 + 0.15;
            let colIdx = 0;
            for (let z = -(CAMPO_COMP / 2) + 1; z <= (CAMPO_COMP / 2) - 1; z += 0.85, colIdx++) {
                // 2 colunas sem cadeiras a cada 20 cadeiras para criar os corredores/escadas do estádio
                if (colIdx % 22 >= 20) continue;
                addSeatInstance(standX, seatYOffset, z, Math.PI / 2, r, colIdx);
            }
        }

        // Bancada Este (Direita)
        for (let r = 0; r < rows; r++) {
            const standX = (CAMPO_LARG / 2 + 4.5) + (r * 1.2);
            const standY = 0.25 + (r * 0.5);
            addStepBox(1.2, 0.5, CAMPO_COMP + 2, standX, standY, 0, 0);

            const seatYOffset = standY + 0.25 + 0.15;
            let colIdx = 0;
            for (let z = -(CAMPO_COMP / 2) + 1; z <= (CAMPO_COMP / 2) - 1; z += 0.85, colIdx++) {
                // 2 colunas sem cadeiras a cada 20 cadeiras para criar os corredores/escadas do estádio
                if (colIdx % 22 >= 20) continue;
                addSeatInstance(standX, seatYOffset, z, -Math.PI / 2, r, colIdx);
            }
        }

        // Bancada Norte (Fundo)
        for (let r = 0; r < rows; r++) {
            const standZ = (CAMPO_COMP / 2 + 5.5) + (r * 1.2);
            const standY = 0.25 + (r * 0.5);
            addStepBox(CAMPO_LARG - 4, 0.5, 1.2, 0, standY, standZ, 0);

            const seatYOffset = standY + 0.25 + 0.15;
            let colIdx = 0;
            for (let x = -(CAMPO_LARG / 2) + 2; x <= (CAMPO_LARG / 2) - 2; x += 0.85, colIdx++) {
                // 2 colunas sem cadeiras periodicamente
                if (colIdx % 20 >= 18) continue;
                if (Math.abs(x) > 4.5 || r > 1) {
                    addSeatInstance(x, seatYOffset, standZ, Math.PI, r, colIdx);
                }
            }
        }

        // Bancada Sul (Fundo oposto)
        for (let r = 0; r < rows; r++) {
            const standZ = -(CAMPO_COMP / 2 + 5.5) - (r * 1.2);
            const standY = 0.25 + (r * 0.5);
            addStepBox(64, 0.5, 1.2, 0, standY, standZ, 0);

            const seatYOffset = standY + 0.25 + 0.15;
            let colIdx = 0;
            for (let x = -32; x <= 32; x += 0.85, colIdx++) {
                // 2 colunas sem cadeiras periodicamente
                if (colIdx % 20 >= 18) continue;
                if (Math.abs(x) > 4.5 || r > 1) {
                    addSeatInstance(x, seatYOffset, standZ, 0, r, colIdx);
                }
            }
        }

        let cornerX = (CAMPO_LARG / 2) - 2;
        let cornerZ = (CAMPO_COMP / 2) - 1;
        buildCorner(-cornerX, cornerZ, Math.PI / 2);
        buildCorner(cornerX, cornerZ, 0);
        buildCorner(-cornerX, -cornerZ, Math.PI);
        buildCorner(cornerX, -cornerZ, 3 * Math.PI / 2);

        /*
        ADEPTOS. Corre depois de todas as bancadas estarem construídas, porque
        a mescla das duas claques precisa de conhecer os extremos do estádio em
        Z (ver Crowd.claqueEm em js/crowd.js).

        Substitui o `specMesh` — o boneco simplificado de seis caixas com uma
        cor só, que ficou desligado acima (`crowdAllowed = false && ...`). Este
        usa o modelo dos jogadores, na pose sentada, com quatro InstancedMesh —
        um por canal de cor, que é o que permite pele, camisa, calção e cabelo
        independentes na mesma instância.
        */
        if (typeof Crowd !== 'undefined' &&
            (typeof Config === 'undefined' || Config.enableCrowd !== false)) {
            Crowd.build(campoGrupo, lugares);
        }

        // Geometria fundida das bancadas para mínimo de draw calls
        if (stepGeos.length > 0) {
            const mergedStepsGeo = mergeNonIndexedGeometries(stepGeos);
            mergedStepsGeo.computeVertexNormals();
            const mergedStepsMesh = new THREE.Mesh(mergedStepsGeo, concreteMat);
            mergedStepsMesh.receiveShadow = true;
            mergedStepsMesh.castShadow = false;
            campoGrupo.add(mergedStepsMesh);
        }

        /*
        Barreira de contenção à frente da bancada (ver BarreiraCampo).

        Quatro paredes que se cruzam nos cantos — não é preciso fechar as
        quinas à parte, a sobreposição já as tapa. Cada uma tem duas camadas:
        o painel de publicidade opaco em baixo e a rede de protecção
        translúcida por cima.
        */
        /* (Removido visualmente a pedido do utilizador)
        {
            const BC = BarreiraCampo;
            const matPainel = new THREE.MeshStandardMaterial({
                color: 0x1b3a5c, roughness: 0.8, metalness: 0.0
            });
            const matRede = new THREE.MeshBasicMaterial({
                color: 0xdfe6ec, transparent: true, opacity: 0.14,
                side: THREE.DoubleSide, depthWrite: false
            });
            const alturaRedeReal = BC.alturaRede - BC.alturaPainel;

            const paredeBarreira = (larg, prof, px, pz) => {
                const painel = new THREE.Mesh(
                    new THREE.BoxGeometry(larg, BC.alturaPainel, prof), matPainel);
                painel.position.set(px, BC.alturaPainel / 2, pz);
                painel.receiveShadow = true;
                campoGrupo.add(painel);

                const rede = new THREE.Mesh(
                    new THREE.BoxGeometry(larg, alturaRedeReal, prof * 0.4), matRede);
                rede.position.set(px, BC.alturaPainel + alturaRedeReal / 2, pz);
                campoGrupo.add(rede);
            };

            const compTotal = BC.z * 2;
            const largTotal = BC.x * 2;
            paredeBarreira(0.4, compTotal, -BC.x, 0);
            paredeBarreira(0.4, compTotal, BC.x, 0);
            paredeBarreira(largTotal, 0.4, 0, -BC.z);
            paredeBarreira(largTotal, 0.4, 0, BC.z);
        }
        */

        seatMesh.instanceMatrix.needsUpdate = true;
        if (seatMesh.instanceColor) seatMesh.instanceColor.needsUpdate = true;
        campoGrupo.add(seatMesh);

        specMesh.count = spectatorIndex;
        specMesh.instanceMatrix.needsUpdate = true;
        if (specMesh.instanceColor) specMesh.instanceColor.needsUpdate = true;
        
        campoGrupo.add(specMesh);

        this.specMesh = specMesh;

        this.scene.add(campoGrupo);
    },

    criarBola: function (raio) {
        if (typeof BallMesh !== 'undefined' && BallMesh.partes && BallMesh.partes.length) {
            return this.criarBolaDaMalha(raio);
        }
        console.warn('BallMesh não encontrada — a usar a bola procedural.');
        return this.criarBolaProcedural(raio);
    },

    criarBolaDaMalha: function (raio) {
        const grupo = new THREE.Group();

        /*
        Cores por material do OBJ — o modelo separa os painéis em dois grupos.

        DoubleSide porque o OBJ tem winding inconsistente. Não vale a pena
        "corrigi-lo": 9% das faces são as paredes verticais dos sulcos entre
        painéis, e qualquer regra baseada em "virar tudo para fora do centro"
        estraga exactamente essas. Com DoubleSide o winding deixa de importar,
        e o custo de uma bola de 14 cm no ecrã é nulo.
        */
        const cores = {
            'Bianco': { color: 0xf2f2f2, roughness: 0.55, metalness: 0.03, side: THREE.DoubleSide },
            'Nero.001': { color: 0x1a1a1a, roughness: 0.5, metalness: 0.03, side: THREE.DoubleSide }
        };

        for (const parte of BallMesh.partes) {
            const geo = new THREE.BufferGeometry();
            const pos = BallMesh.posicoes(parte, raio);
            geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            geo.setIndex(new THREE.BufferAttribute(BallMesh.indices(parte), 1));

            /*
            Normais analíticas em vez de computeVertexNormals(): a bola está
            centrada na origem, por isso a normal de cada vértice é a própria
            posição normalizada. É exacta na superfície dos painéis, aproximada
            nas paredes dos sulcos (9% das faces, 2.6 mm de profundidade — não
            se vê a esta escala), e não depende do winding, que no OBJ vem
            inconsistente. computeVertexNormals() daria lixo por causa disso.
            */
            const nrm = new Float32Array(pos.length);
            for (let i = 0; i < pos.length; i += 3) {
                const d = Math.hypot(pos[i], pos[i + 1], pos[i + 2]) || 1;
                nrm[i] = pos[i] / d; nrm[i + 1] = pos[i + 1] / d; nrm[i + 2] = pos[i + 2] / d;
            }
            geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
            geo.computeBoundingSphere();

            const cor = cores[parte.material] ||
                { color: 0xcccccc, roughness: 0.6, metalness: 0.05, side: THREE.DoubleSide };
            const malha = new THREE.Mesh(geo, new THREE.MeshStandardMaterial(cor));
            malha.castShadow = true; malha.receiveShadow = true;
            grupo.add(malha);
        }

        return grupo;
    },

    criarBolaProcedural: function (raio) {
        const cvsBola = document.createElement('canvas'); cvsBola.width = 512; cvsBola.height = 256;
        const ctxBola = cvsBola.getContext('2d');
        ctxBola.fillStyle = '#ffffff'; ctxBola.fillRect(0, 0, 512, 256);
        ctxBola.fillStyle = '#1a1a1a';
        const pentagons = [
            [128, 64], [384, 64], [64, 192], [256, 192], [448, 192],
            [192, 128], [320, 128], [128, 64], [384, 64]
        ];
        for (const [cx, cy] of pentagons) {
            ctxBola.beginPath();
            for (let i = 0; i < 5; i++) {
                const a = (Math.PI * 2 / 5) * i - Math.PI / 2;
                const px = cx + 28 * Math.cos(a);
                const py = cy + 28 * Math.sin(a);
                if (i === 0) ctxBola.moveTo(px, py); else ctxBola.lineTo(px, py);
            }
            ctxBola.closePath(); ctxBola.fill();
        }
        ctxBola.strokeStyle = '#cccccc'; ctxBola.lineWidth = 1.5;
        for (const [cx, cy] of pentagons) {
            for (let i = 0; i < 5; i++) {
                const a = (Math.PI * 2 / 5) * i - Math.PI / 2;
                ctxBola.beginPath();
                ctxBola.moveTo(cx + 28 * Math.cos(a), cy + 28 * Math.sin(a));
                ctxBola.lineTo(cx + 44 * Math.cos(a), cy + 44 * Math.sin(a));
                ctxBola.stroke();
            }
        }
        const texBola = new THREE.CanvasTexture(cvsBola);
        texBola.wrapS = THREE.RepeatWrapping; texBola.wrapT = THREE.ClampToEdgeWrapping;
        const malha = new THREE.Mesh(
            new THREE.SphereGeometry(raio, 32, 32),
            new THREE.MeshStandardMaterial({ map: texBola, roughness: 0.55, metalness: 0.05 })
        );
        malha.castShadow = true; malha.receiveShadow = true;
        return malha;
    },

    createTeams: function () {
        // Skills fixas (data/player_skills.js) — atribuídas por ÍNDICE, não
        // por posição da formação: a formação pode mudar (442/433/4231),
        // mas o elenco (jogador 0..10) é sempre o mesmo, ver
        // tools/gen_player_skills.js.
        const skillsA = (typeof PlayerSkillsData !== 'undefined') ? PlayerSkillsData.teamA : null;
        const skillsB = (typeof PlayerSkillsData !== 'undefined') ? PlayerSkillsData.teamB : null;

        for (let i = 0; i < 11; i++) {
            let corCamisa = (i === 0) ? '#f1c40f' : '#3498db';
            let corCalcao = (i === 0) ? '#1e1b18' : '#34495e';
            let p = new FootballPlayer(i, corCamisa, corCalcao, 'TeamA');
            p.skills = skillsA ? skillsA[i] : null;
            this.players.push(p);
            this.scene.add(p.model);
        }

        for (let i = 0; i < 11; i++) {
            let corCamisa = (i === 0) ? '#e67e22' : '#e74c3c';
            let corCalcao = (i === 0) ? '#111111' : '#ffffff';
            let p = new FootballPlayer(i + 20, corCamisa, corCalcao, 'TeamB');
            p.skills = skillsB ? skillsB[i] : null;
            this.opponents.push(p);
            this.scene.add(p.model);
        }

        this.assignFormations();
    },

    assignFormations: function () {
        let compMult = 0.8;
        if (Tatics.compactness) {
            if (Tatics.compactness === 'large') compMult = 1.0;
            else if (Tatics.compactness === 'short') compMult = 0.6;
        }

        const fDataA = FormationsData[Tatics.formacaoA || '442'];
        const fDataB = FormationsData[Tatics.formacaoB || '442'];

        const processTeam = (teamList, fData, isTeamA) => {
            const campo = fData.filter(f => f.role !== 'gk');
            const zMin = Math.min(...campo.map(f => f.z));
            const zMax = Math.max(...campo.map(f => f.z));
            const zSpan = (zMax - zMin) || 1;
            const contagemPos = {};

            for (let i = 0; i < 11; i++) {
                const uVal = isTeamA ? (fData[i].x + 1) / 2 : (-fData[i].x + 1) / 2;
                const slot = (fData[i].role === 'gk') ? null : {
                    u: uVal,
                    v: (fData[i].z - zMin) / zSpan
                };

                const x = isTeamA ? fData[i].x : -fData[i].x;
                const z = isTeamA ? fData[i].z : -fData[i].z;

                teamList[i].baseTarget.set(x * (CAMPO_LARG / 2) * compMult, ALTURA_BASE_Y, z * (CAMPO_COMP / 2));
                teamList[i].role = fData[i].role;
                teamList[i].slot = slot;
                teamList[i].updateShirt(fData[i].num, fData[i].pos);
                
                const idxPos = contagemPos[fData[i].pos] || 0;
                contagemPos[fData[i].pos] = idxPos + 1;
                this.aplicarPlayingStyle(teamList[i], fData[i].pos, idxPos);
                
                if (fData[i].role === 'gk') {
                    teamList[i].gkStyleBase = isTeamA ? 'offensive' : 'defensive';
                    teamList[i].playingStyle = isTeamA ? 'offensive_gk' : 'defensive_gk';
                }
            }
        };

        processTeam(this.players, fDataA, true);
        processTeam(this.opponents, fDataB, false);
    },

    aplicarPlayingStyle: function (p, pos, idxPos) {
        if (typeof PlayingStyles === 'undefined') return;

        let chave = p.playingStyleFixo;
        if (!chave || !estiloValidoPara(chave, pos)) {
            const omissao = EstiloPorOmissao[pos];
            chave = Array.isArray(omissao) ? omissao[(idxPos || 0) % omissao.length] : omissao;
        }
        if (!chave || !PlayingStyles[chave]) chave = null;
        p.playingStyle = chave;
        // Por padrão os estilos começam ligados para espelhar o painel (Teams States: ON).
        if (p.playingStyleDesligado === undefined) {
            p.playingStyleDesligado = (typeof window.allPlayingStylesEnabled !== 'undefined') ? !window.allPlayingStylesEnabled : false;
        }
        // Espelhos para os sistemas que já existiam antes do catálogo.
        if (pos === 'LB' || pos === 'RB') {
            if (chave === 'defensive_fullback') p.fbStyle = 'defensive';
            else if (chave === 'fullback_finisher') p.fbStyle = 'finisher';
            else p.fbStyle = 'offensive';
        }
        if (pos === 'GK') {
            p.gkStyleBase = (chave === 'offensive_gk') ? 'offensive' : 'defensive';
        }
    },

    resetPlay: function (forcingKickoffTeam = null) {
        this.mudarEstado('PLAY', 'reset_play'); this.ballVel.set(0, 0, 0);

        /*
        Disciplina zerada e expulsos de volta ao plantel. O `Sim` chama isto
        entre jogos do lote (js/simulate.js), e sem esta reposicao as
        expulsoes acumulavam-se de jogo para jogo ate as equipas ficarem sem
        gente.
        */
        this.reporExpulsos();
        [...this.players, ...this.opponents].forEach(p => { p.temAmarelo = false; });
        if (typeof Officials !== 'undefined') Officials.resetFaltas();

        this.intendedReceiver = null;
        this.passTargetPos = null;
        this.chaserA = null;
        this.chaserB = null;
        this.setPieceTaker = null;
        this.setPieceTimer = 0;
        this.recuoParaGR = null;
        this.peitosSeguidos = 0;
        [...this.players, ...this.opponents].forEach(p => { p.jostleAncora = null; });
        this.counterAttackTeam = null;
        this.counterAttackTimer = 0;
        this.goalSequenceStage = undefined;
        this.tempoParada = 0;

        document.getElementById('alerta-golo').style.opacity = '0';
        window.bolaChutada = false;

        this.ball.position.set(0, BallPhysics.raio, 0);

        this.players[0].model.position.set(0, ALTURA_BASE_Y, -48);
        lookAtBola(this.players[0].model, this.ball.position);
        this.players[0].fsm.changeState('IDLE');

        this.opponents[0].model.position.set(0, ALTURA_BASE_Y, 48);
        lookAtBola(this.opponents[0].model, this.ball.position);
        this.opponents[0].fsm.changeState('IDLE');

        // Reset do estado por-instância de cada GK. Kickoff pode interromper
        // um GR a meio dos 8s de segurando — sem isto o gkHoldingBall ficava
        // preso em true (só GK_RELEASE_BALL, disparado no fim normal do
        // timer, o desligava) e afastarDoGuardaRedes/commit continuavam a
        // achar que ele tinha a bola na mão depois do reposicionamento.
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
                // Tiro de meta interrompido a meio (golo do outro lado, etc.).
                gk.gkKickAction = null;
                gk.gkKickTipo = null;
                gk.gkKickBlend = null;
                gk.gkTiroFase = 0;
                gk.gkTiroAlvo = null;
            }
        });
        this.golKickProntos = false;
        this.golKickEspera = 0;
        this.golKickAlvoEspera = 0;
        this.golKickPendente = false;
        this.golKickAtrasoInicio = 0;
        this.lateralPendente = false;
        this.lateralAtraso = 0;
        this.cantoBolaAlvo = null;
        this.cantoAguardaChao = false;
        this.cantoBolaAtraso = 0;
        this.faltaPendente = false;
        this.faltaAtraso = 0;
        this.penaltiPendente = false;
        this.penaltiAtraso = 0;
        [...this.players, ...this.opponents].forEach(p => {
            p.lateralAction = null;
            p.lateralLargou = false;
        });
        this.golKickBolaAtraso = 0;
        this.golKickBolaAlvo = null;
        this.golKickAguardaChao = false;

        // dirA/dirB: sentido de ataque de cada equipa. O campo de defesa é o
        // lado oposto — por isso o clamp abaixo usa z*dir <= -margem.
        const margem = 1.5;
        [{ list: this.players, dir: 1 }, { list: this.opponents, dir: -1 }].forEach(({ list, dir }) => {
            list.forEach(p => {
                p.isCross = false;
                if (p.role !== 'gk') {
                    let z = p.baseTarget.z;
                    if (p.role === 'def') {
                        // Linha de defesa respeita o ajuste "Linha Defensiva"
                        // do painel também na saída, não só durante o jogo —
                        // TeamShape.linhaDefensiva está no referencial de
                        // ataque, por isso converte para mundo por *dir.
                        const cap = TeamShape.linhaDefensiva[Tatics.linhaDefensiva] ?? TeamShape.linhaDefensiva.medium;
                        z = cap * dir;
                    }
                    if (z * dir > -margem) z = -margem * dir; // força para o campo de defesa
                    p.model.position.set(p.baseTarget.x, ALTURA_BASE_Y, z);
                    p.hasBall = false;
                    // Sem isto ficavam com a rotação da jogada anterior — de
                    // costas, de lado, o que calhasse — em vez de virados
                    // para a bola antes do kickoff.
                    lookAtBola(p.model, this.ball.position);
                }
                // dynamicTarget é o que o MOVE_TO_POS persegue (steerArrive);
                // sem isto ele ficava com o alvo antigo da jogada anterior e
                // saía a correr para lá assim que o update() volta a chamar
                // p.update(dt), mesmo com o runTeamAI travado no kickoff.
                p.dynamicTarget = p.model.position.clone();
                p.fsm.changeState('MOVE_TO_POS');
                p.speedMult = 3.5;
            });
        });

        // Sorteio do time que dá a saída, ou usa o time forçado.
        const startA = forcingKickoffTeam ? (forcingKickoffTeam === 'TeamA') : (Math.random() < 0.5);
        const takerList = startA ? this.players : this.opponents;
        const attDir = startA ? 1 : -1;

        const atacantes = takerList.filter(p => p.role === 'atk');
        const taker = atacantes[0] || takerList.find(p => p.role !== 'gk');

        // Apoio sorteado entre o outro atacante e os meio-campistas — cada
        // saída escolhe um companheiro diferente, não sempre o mesmo.
        const candidatosApoio = takerList.filter(p => p !== taker && (p.role === 'atk' || p.role === 'mid'));
        const apoio = candidatosApoio.length
            ? candidatosApoio[Math.floor(Math.random() * candidatosApoio.length)]
            : takerList.find(p => p.role === 'mid');

        if (taker) {
            // Ele é quem dá a saída — pode ficar no campo de ataque, encostado
            // à bola (~0.4m), diferente do resto da equipa que fica atrás.
            taker.model.position.set(0, ALTURA_BASE_Y, attDir * 0.4);
            taker.fsm.changeState('IDLE');
        }
        if (apoio) {
            // Posição varia a cada saída — perto do taker, mas nunca igual.
            const apoioX = (Math.random() - 0.5) * 6;
            const apoioDist = 3 + Math.random() * 3;
            apoio.model.position.set(apoioX, ALTURA_BASE_Y, -attDir * apoioDist);
            apoio.fsm.changeState('IDLE');
            lookAtBola(apoio.model, this.ball.position);
            // alvoDePasse mira o tacticalTarget do BT (posição da jogada
            // ANTERIOR, ainda não recalculada) em vez de onde ele está agora
            // — sem isto o passe de saída ia para o meio do campo adversário.
            apoio.tacticalTarget = apoio.model.position.clone();
        }
        if (taker) lookAtBola(taker.model, apoio ? apoio.model.position : this.ball.position);

        // Time que NÃO dá a saída fica todo fora do círculo central — só o
        // taker (e o apoio, na prática) podem ficar perto da bola.
        const raioCirculo = 9.15 + 0.5;
        const naoKickList = startA ? this.opponents : this.players;
        naoKickList.forEach(p => {
            if (p.role === 'gk') return;
            const pos = p.model.position;
            const dist = Math.hypot(pos.x, pos.z);
            if (dist < raioCirculo && dist > 0.001) {
                const k = raioCirculo / dist;
                pos.x *= k; pos.z *= k;
                p.dynamicTarget = pos.clone();
            }
        });

        this.ballCarrier = taker || takerList[0];
        this.lastTouchedTeam = startA ? 'TeamA' : 'TeamB';
        this.lastTouchedPlayer = this.ballCarrier;
        if (this.ballCarrier) this.ballCarrier.hasBall = true;

        // Trava o jogo uns segundos antes do toque inicial: ninguém circula
        // livremente pelo campo (runTeamAI/BT não corre) até o timer zerar,
        // e aí o "taker" toca para o apoio — isso é que dá o pontapé de saída.
        this.kickoffActive = true;
        this.kickoffTimer = ESPERA_APOS_REPOSICAO;
        /*
        O apito da saída não é dado aqui: é dado `APITO_ANTES_DA_SAIDA`
        segundos antes do toque, no update do kickoff. Apitar na montagem
        punha-o os 3 s inteiros antes da bola sair — ouvia-se como um apito
        solto, sem relação com o lance. O árbitro apita e a bola sai a
        seguir.
        */
        this.kickoffApitado = false;
        this.kickoffTaker = taker;
        this.kickoffApoio = apoio;
        this.kickoffTeam = startA ? 'TeamA' : 'TeamB';
        this.kickoffPendingPassToDef = true;
        this.kickoffPassToDefTimer = KICKOFF_PRAZO_PASSE_DEFESA;
    },

    reporExpulsos: function () {
        if (!this.expulsos || !this.expulsos.length) return;
        for (const p of this.expulsos) {
            p.expulso = false;
            p.temAmarelo = false;
            if (p.model) p.model.visible = true;
            const lista = (p.team === 'TeamA') ? this.players : this.opponents;
            const idx = (typeof p.indiceNaFormacao === 'number')
                ? Math.min(p.indiceNaFormacao, lista.length) : lista.length;
            lista.splice(idx, 0, p);
        }
        this.expulsos.length = 0;
    },
});
