const Match = {
    scene: null, ball: null, ballVisual: null, ballVel: new THREE.Vector3(),
    players: [], opponents: [], ballCarrier: null, intendedReceiver: null, state: 'PLAY',
    tempoParada: 0, delta: 0,
    placarA: 0, placarB: 0, tempoDeJogo: 0,
    chaserA: null, chaserB: null,
    possessionTeam: null, possessionTimer: 0,
    lastTouchedTeam: 'TeamA', lastTouchedPlayer: null,
    setPieceTaker: null, setPieceTimer: 0,
    // Tiro de meta: espera 3-6s depois de todos posicionados (ver
    // updateGoalKickWait / setupSetPiece).
    golKickProntos: false, golKickEspera: 0, golKickAlvoEspera: 0,
    counterAttackTeam: null, counterAttackTimer: 0,
    specMesh: null, specData: [], specDummy: new THREE.Object3D(),
    crowdExcitement: 0, crowdTimer: 0,
    currentLookTarget: null, // Usado para interpolação da câmara
    kickoffActive: false, kickoffTimer: 0, kickoffTaker: null, kickoffApoio: null,

    // Migração por eventos (ver EventBus) — parte 1: GK. Substitui o polling
    // directo de gk.gkEstado === 'apanhar'/'segurando' espalhado por vários
    // ficheiros (match.js afastarDoGuardaRedes, position_bt.js commit).
    // TeamA/TeamB -> true enquanto o GR dessa equipa está com a bola na mão.
    gkHoldingBall: { TeamA: false, TeamB: false },

    init: function (scene) {
        this.scene = scene;
        this.currentLookTarget = new THREE.Vector3(0, 0, 0);

        if (typeof EventBus !== 'undefined') {
            EventBus.on('GK_CATCH_BALL', (d) => {
                this.gkHoldingBall[d.team] = true;
                // Reposicionamento instantâneo: os dois times reorganizam já
                // pro PositionBT deles, não esperam o lerp de suavização
                // normal (PositionSmoothing) convergir devagar ao longo de
                // vários segundos.
                for (const p of this.players) p.snapPosition = true;
                for (const p of this.opponents) p.snapPosition = true;
            });
            EventBus.on('GK_RELEASE_BALL', (d) => { this.gkHoldingBall[d.team] = false; });

            /*
            Migração por eventos — parte 2: CB. Quando um CB fica com a bola,
            a equipa reorganiza a saída: CB oposto recua 3m, lateral do
            mesmo lado avança 3m, lateral oposto avança 5m. Bias temporário
            (5s), consumido em commit() (position_bt.js).
            */
            EventBus.on('CB_HAS_BALL', (d) => {
                const p = d.p;
                const teammates = (p.team === 'TeamA') ? this.players : this.opponents;
                const outroCB = teammates.find(t => t.pos === 'CB' && t !== p);
                const lb = teammates.find(t => t.pos === 'LB');
                const rb = teammates.find(t => t.pos === 'RB');

                const ladoBase = (p.baseTarget) ? p.baseTarget.x : p.model.position.x;
                const mesmoLado = (ladoBase < 0) ? lb : rb;
                const ladoOposto = (ladoBase < 0) ? rb : lb;

                const aplicar = (jog, metros) => {
                    if (!jog) return;
                    jog.buildOutBias = { x: 0, z: metros * jog.dirZ };
                    jog.buildOutTimer = 5.0;
                };
                aplicar(outroCB, -3);
                aplicar(mesmoLado, 3);
                aplicar(ladoOposto, 5);
            });

            /*
            Migração por eventos — parte 3: CM. Quando um CM fica com a
            bola: médio-ala do lado da jogada avança 5m, lateral do mesmo
            lado avança 10m, CM oposto recua (dá support atrás), médio-ala
            do lado oposto avança 3m. Mesmo bias temporário (5s) do CB.
            */
            EventBus.on('CM_HAS_BALL', (d) => {
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
            });
        }

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

        this.btPosRectA = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x3498db, linewidth: 2 }));
        this.btPosRectA.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4 * 3), 3));
        this.btPosRectA.visible = false;
        this.scene.add(this.btPosRectA);

        this.btPosRectB = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xe74c3c, linewidth: 2 }));
        this.btPosRectB.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4 * 3), 3));
        this.btPosRectB.visible = false;
        this.scene.add(this.btPosRectB);

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

        this.showOffsideLines = false;

        this.createTeams();
        this.resetPlay();
        this.setupKeyboardListeners();
    },

    /*
    A bola.

    Usa a malha de assets/Ball.obj (convertida para assets/ball_mesh.js) se ela
    estiver carregada; senão constrói a esfera com textura de painéis desenhada
    à mão, que é o que existia antes. Assim o jogo abre na mesma se o ficheiro
    da malha faltar ou for removido.
    */
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

    setupKeyboardListeners: function () {
        window.addEventListener('keydown', (e) => {
            if (e.key === 'o' || e.key === 'O') {
                this.showOffsideLines = !this.showOffsideLines;
                this.offsideLineA.visible = this.showOffsideLines;
                this.offsideLineB.visible = this.showOffsideLines;
            }
            if (e.key === '1') this.setSpeed(0.5);
            if (e.key === '2') this.setSpeed(1.0);
            if (e.key === '3') this.setSpeed(1.3);
            if (e.key === '4') this.setCameraMode('center');
            if (e.key === '5') this.setCameraMode('sideline');
            if (e.key === '6') this.setCameraMode('topdown');
            if (e.key === '7') this.setCameraMode('lateraltv');
            if (e.key === ' ' || e.code === 'Space') {
                this.togglePause();
                e.preventDefault();
            }
            if (e.key === 'x' || e.key === 'X') togglePainel();
        });
    },

    // Também acionado pela tecla Espaço (ver setupKeyboardListeners) — usado
    // pelo botão Pause/Continue do painel esquerdo.
    togglePause: function () {
        window.isPaused = !window.isPaused;
        const btn = document.getElementById('btn-pause');
        if (btn) btn.textContent = window.isPaused ? 'Continue' : 'Pause';
        if (typeof TouchControls !== 'undefined' && TouchControls.updateButtonsState) {
            TouchControls.updateButtonsState();
        }
    },

    setSpeed: function (speed) {
        window.speedMultiplier = speed;
        document.querySelectorAll('.btn-speed').forEach(b => b.classList.remove('active'));
        const btn = document.getElementById('spd-' + speed);
        if (btn) btn.classList.add('active');
        if (typeof TouchControls !== 'undefined' && TouchControls.updateButtonsState) {
            TouchControls.updateButtonsState();
        }
    },

    setCameraMode: function (mode) {
        if (mode === 'orbit' && window.cameraMode !== 'orbit' && typeof orbitControls !== 'undefined') {
            orbitControls.syncFromCamera(window.cameraCore, this.currentLookTarget);
        }

        window.cameraMode = mode;
        document.querySelectorAll('.btn-cam').forEach(b => b.classList.remove('active'));
        const btn = document.getElementById('cam-' + mode);
        if (btn) btn.classList.add('active');

        window.cameraCore.up.set(0, 1, 0);
        if (mode === 'topdown') {
            // Roda a câmara 90 graus: Vermelho (Z = +53) à esquerda, Azul (Z = -53) à direita
            window.cameraCore.up.set(-1, 0, 0);
        }
        if (typeof TouchControls !== 'undefined' && TouchControls.updateButtonsState) {
            TouchControls.updateButtonsState();
        }
    },

    /*
    VISTA TÁCTICA — a bola.

    Na câmara de cima a bola é um disco branco pousado no relvado, como os
    jogadores são discos da cor da equipa (ver updateShirt em player.js). A
    bola a sério é pequena e, vista de 40 m, some-se contra o relvado; e a
    altura dela não se lê de cima, por isso um disco no chão diz mais.

    O disco fica no plano, na vertical da bola: quando ela vai pelo ar, ele
    marca a SOMBRA dela, que é o que interessa a quem lê a jogada.
    */
    atualizarVistaTatica: function () {
        if (!this.ball) return;
        const tatico = (window.cameraMode === 'topdown');

        if (!this.discoBola) {
            this.discoBola = new THREE.Mesh(
                new THREE.CircleGeometry(0.55, 20),
                new THREE.MeshBasicMaterial({ color: 0xffffff })
            );
            this.discoBola.rotation.x = -Math.PI / 2;
            this.discoBola.visible = false;
            this.scene.add(this.discoBola);
        }

        this.discoBola.visible = tatico;
        // Ligeiramente acima dos discos dos jogadores: a bola nunca fica
        // escondida por baixo de quem a tem.
        this.discoBola.position.set(this.ball.position.x, 0.06, this.ball.position.z);
        this.ball.visible = !tatico;
    },

    updateCamera: function () {
        if (window.cameraMode === 'orbit') return;

        if (!this.ball) return;
        const zoom = window.cameraZoom || 1.0;
        let targetPos = new THREE.Vector3();
        let lookTarget = new THREE.Vector3();

        if (window.cameraMode === 'center') {
            // Câmara de TV mais próxima da ação, na altura do último degrau
            targetPos.set(58 * zoom, 39 * zoom, 0);
            lookTarget.copy(this.ball.position);
        } else if (window.cameraMode === 'sideline') {
            // Câmara Lateral bem mais próxima, acompanhando a bola no eixo Z
            let bz = THREE.MathUtils.clamp(this.ball.position.z, -45, 45);
            targetPos.set(35 * zoom, 14 * zoom, bz);
            lookTarget.copy(this.ball.position);
        } else if (window.cameraMode === 'lateraltv') {
            // Mistura de TV Centro e Lateral Móvel
            // Acompanha até metade do meio-campo, depois fica parada e só roda
            let bz = THREE.MathUtils.clamp(this.ball.position.z, -26.5, 26.5);
            targetPos.set(48 * zoom, 23 * zoom, bz);
            lookTarget.copy(this.ball.position);
        } else if (window.cameraMode === 'topdown') {
            const aspect = window.innerWidth / window.innerHeight;
            // Campo deitado: precisamos caber (CAMPO_COMP + margem) na horizontal e (CAMPO_LARG + margem) na vertical
            const reqYForHeight = (CAMPO_LARG + 10) / 0.8284;
            const reqYForWidth = (CAMPO_COMP + 10) / (0.8284 * aspect);
            const optimalY = Math.max(reqYForHeight, reqYForWidth);
            targetPos.set(0, optimalY * zoom, 0);
            lookTarget.set(0, 0, 0);
        }

        // Interpolação de posição (suave)
        window.cameraCore.position.lerp(targetPos, 0.05);

        // Interpolação do ponto de foco
        if (!this.currentLookTarget) this.currentLookTarget = new THREE.Vector3();
        this.currentLookTarget.lerp(lookTarget, 0.08);

        // Usando lookAt direto evita que a câmara torça ou olhe para o céu ao alternar modos
        window.cameraCore.lookAt(this.currentLookTarget);
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

        const cvsRede = document.createElement('canvas'); cvsRede.width = 32; cvsRede.height = 32; const ctxRede = cvsRede.getContext('2d');
        ctxRede.fillStyle = 'rgba(240, 240, 245, 0.35)'; ctxRede.fillRect(0, 0, 32, 32);
        ctxRede.strokeStyle = 'rgba(255, 255, 255, 0.9)'; ctxRede.lineWidth = 1.5; ctxRede.strokeRect(0, 0, 32, 32);
        ctxRede.strokeStyle = 'rgba(220, 220, 230, 0.5)'; ctxRede.lineWidth = 0.8;
        ctxRede.beginPath(); ctxRede.moveTo(0, 0); ctxRede.lineTo(32, 32); ctxRede.stroke();
        ctxRede.beginPath(); ctxRede.moveTo(32, 0); ctxRede.lineTo(0, 32); ctxRede.stroke();
        const texRede = new THREE.CanvasTexture(cvsRede); texRede.wrapS = THREE.RepeatWrapping; texRede.wrapT = THREE.RepeatWrapping;
        const matRede = new THREE.MeshBasicMaterial({ map: texRede, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });

        function criarFaceRede(p1, p2, p3, p4, repX, repY) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...p1, ...p2, ...p3, ...p4]), 3));
            geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, repX, 0, 0, repY, repX, repY]), 2));
            geo.setIndex([0, 1, 2, 1, 3, 2]); geo.computeVertexNormals();
            return new THREE.Mesh(geo, matRede);
        }

        [1, -1].forEach(lado => {
            const zSinal = comp / 2 * lado; const dir = -lado;
            const zGA = zSinal + (16.5 / 2) * dir; addLinha(40.32, esp, 0, zSinal + 16.5 * dir); addLinha(esp, 16.5 + esp, 40.32 / 2, zGA); addLinha(esp, 16.5 + esp, -40.32 / 2, zGA);
            const zPA = zSinal + (5.5 / 2) * dir; addLinha(18.32, esp, 0, zSinal + 5.5 * dir); addLinha(esp, 5.5 + esp, 18.32 / 2, zPA); addLinha(esp, 5.5 + esp, -18.32 / 2, zPA);

            const ptPen = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16), matLinha); ptPen.rotation.x = -Math.PI / 2; ptPen.position.set(0, 0.02, zSinal + 11 * dir); campoGrupo.add(ptPen);
            const theta = Math.acos(5.5 / 9.15); const arcRot = lado === 1 ? Math.PI / 2 - theta : -Math.PI / 2 - theta;
            const arco = new THREE.Mesh(new THREE.RingGeometry(9.15 - esp / 2, 9.15 + esp / 2, 32, 1, arcRot, theta * 2), matLinha); arco.rotation.x = -Math.PI / 2; arco.position.set(0, 0.02, zSinal + 11 * dir); campoGrupo.add(arco);

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

            const redeCima = criarFaceRede(tLE, tLD, tTE, tTD, 30, 4); const redeTras = criarFaceRede(tTE, tTD, bTE, bTD, 30, 10);
            const redeEsq = criarFaceRede(bFE, tLE, bTE, tTE, 8, 10); const redeDir = criarFaceRede(tLD, bFD, tTD, bTD, 8, 10);

            const redes = new THREE.Group(); redes.add(redeCima, redeTras, redeEsq, redeDir);
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

        const seatGeo = new THREE.BoxGeometry(0.5, 0.3, 0.4);
        const seatMat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.1 });

        const maxSeats = 12000;
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

        const palette = [
            new THREE.Color('#3498db'),
            new THREE.Color('#e74c3c'),
            new THREE.Color('#ffffff'),
            new THREE.Color('#f1c40f')
        ];
        function getSeatColor() {
            return palette[Math.floor(Math.random() * palette.length)];
        }

        function addSeatInstance(x, y, z, rotY) {
            if (seatIndex >= maxSeats) return;
            dummy.position.set(x, y, z);
            dummy.rotation.set(0, rotY, 0);
            dummy.updateMatrix();
            seatMesh.setMatrixAt(seatIndex, dummy.matrix);
            seatMesh.setColorAt(seatIndex, getSeatColor());
            seatIndex++;

            if (Math.random() < 0.75 && spectatorIndex < maxSeats) {
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

        function buildCorner(cx, cz, startAngle) {
            for (let r = 0; r < 20; r++) {
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
                    addSeatInstance(sx, seatYOffset, sz, rotY);
                }
            }
        }

        const rows = 20;
        // Bancada Oeste (Esquerda)
        for (let r = 0; r < rows; r++) {
            const standX = -(CAMPO_LARG / 2 + 4.5) - (r * 1.2);
            const standY = 0.25 + (r * 0.5);
            addStepBox(1.2, 0.5, CAMPO_COMP + 2, standX, standY, 0, 0);

            const seatYOffset = standY + 0.25 + 0.15;
            for (let z = -(CAMPO_COMP / 2) + 1; z <= (CAMPO_COMP / 2) - 1; z += 0.85) {
                addSeatInstance(standX, seatYOffset, z, Math.PI / 2);
            }
        }

        // Bancada Este (Direita)
        for (let r = 0; r < rows; r++) {
            const standX = (CAMPO_LARG / 2 + 4.5) + (r * 1.2);
            const standY = 0.25 + (r * 0.5);
            addStepBox(1.2, 0.5, CAMPO_COMP + 2, standX, standY, 0, 0);

            const seatYOffset = standY + 0.25 + 0.15;
            for (let z = -(CAMPO_COMP / 2) + 1; z <= (CAMPO_COMP / 2) - 1; z += 0.85) {
                addSeatInstance(standX, seatYOffset, z, -Math.PI / 2);
            }
        }

        // Bancada Norte (Fundo)
        for (let r = 0; r < rows; r++) {
            const standZ = (CAMPO_COMP / 2 + 5.5) + (r * 1.2);
            const standY = 0.25 + (r * 0.5);
            addStepBox(CAMPO_LARG - 4, 0.5, 1.2, 0, standY, standZ, 0);

            const seatYOffset = standY + 0.25 + 0.15;
            for (let x = -(CAMPO_LARG / 2) + 2; x <= (CAMPO_LARG / 2) - 2; x += 0.85) {
                if (Math.abs(x) > 4.5 || r > 1) {
                    addSeatInstance(x, seatYOffset, standZ, Math.PI);
                }
            }
        }

        // Bancada Sul (Fundo oposto)
        for (let r = 0; r < rows; r++) {
            const standZ = -(CAMPO_COMP / 2 + 5.5) - (r * 1.2);
            const standY = 0.25 + (r * 0.5);
            addStepBox(64, 0.5, 1.2, 0, standY, standZ, 0);

            const seatYOffset = standY + 0.25 + 0.15;
            for (let x = -32; x <= 32; x += 0.85) {
                if (Math.abs(x) > 4.5 || r > 1) {
                    addSeatInstance(x, seatYOffset, standZ, 0);
                }
            }
        }

        let cornerX = (CAMPO_LARG / 2) - 2;
        let cornerZ = (CAMPO_COMP / 2) - 1;
        buildCorner(-cornerX, cornerZ, Math.PI / 2);
        buildCorner(cornerX, cornerZ, 0);
        buildCorner(-cornerX, -cornerZ, Math.PI);
        buildCorner(cornerX, -cornerZ, 3 * Math.PI / 2);

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
        if (typeof Tatics !== 'undefined' && Tatics.compactness) {
            if (Tatics.compactness === 'large') compMult = 1.0;
            else if (Tatics.compactness === 'short') compMult = 0.6;
        }

        const fDataA = FormationsData[typeof Tatics !== 'undefined' && Tatics.formacaoA ? Tatics.formacaoA : '442'];
        const fDataB = FormationsData[typeof Tatics !== 'undefined' && Tatics.formacaoB ? Tatics.formacaoB : '442'];

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

    /*
    Atribui o playing style de um jogador.

    Respeita uma escolha já feita (`p.playingStyleFixo`, posta à mão ou pela
    UI) desde que ela seja válida para a posição — trocar de formação não pode
    apagar a escolha do utilizador. Sem escolha, cai no estilo por omissão da
    posição (`EstiloPorOmissao`).

    `idxPos` é a ordem deste jogador entre os da MESMA posição nesta
    formação (0 = primeiro CM, 1 = segundo CM, etc). Quando a entrada de
    `EstiloPorOmissao` é uma lista, cada ordem cai num estilo diferente — dois
    CM não jogam iguais (ex.: CM(1) Box-to-Box, CM(2) Orchestrator).

    `gkStyleBase` e `fbStyle` continuam a existir por baixo: são eles que os
    ramos do GR e do lateral já lêem. Aqui só se garante que ficam coerentes
    com o estilo escolhido, em vez de serem uma segunda fonte de verdade.
    */
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

    // TeamB = RED, TeamA = BLUE. Ver #placar em index.html.
    updatePlacar: function () {
        const elA = document.getElementById('placar-a');
        const elB = document.getElementById('placar-b');
        const elT = document.getElementById('placar-tempo');
        if (elA) elA.textContent = this.placarB;
        if (elB) elB.textContent = this.placarA;
        if (elT) {
            const total = Math.floor(this.tempoDeJogo);
            const mm = String(Math.floor(total / 60)).padStart(2, '0');
            const ss = String(total % 60).padStart(2, '0');
            elT.textContent = mm + ':' + ss;
        }
    },

    /*
    Saída de bola padrão (kickoff): bola ao centro, as duas equipas na sua
    metade de campo (via baseTarget da formação), sorteio de quem inicia, e
    um jogador dessa equipa junto à bola para tocar para um companheiro
    posicionado atrás dele. O jogo só "começa" quando esse primeiro toque
    sai — mas isso já é o comportamento normal do BT (Dominar/CadenceModel)
    assim que o jogador tem a bola em IDLE, tal como no reinício antigo.

    Usado tanto pelo botão do painel como no reinício automático após golo.
    */
    resetPlay: function () {
        this.state = 'PLAY'; this.ballVel.set(0, 0, 0);

        this.intendedReceiver = null;
        this.passTargetPos = null;
        this.chaserA = null;
        this.chaserB = null;
        this.setPieceTaker = null;
        this.setPieceTimer = 0;
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
                gk.gkTiroFase = 0;
                gk.gkTiroAlvo = null;
            }
        });
        this.golKickProntos = false;
        this.golKickEspera = 0;
        this.golKickAlvoEspera = 0;
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

        // Sorteio do time que dá a saída.
        const startA = Math.random() < 0.5;
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
        this.kickoffTimer = 0.0;
        this.kickoffTaker = taker;
        this.kickoffApoio = apoio;
    },

    update: function (dt) {
        if (!this._pf_stats) this._pf_stats = { count: 0, time: 0 };
        const t0 = performance.now();
        for (let p of this.players) { p.debugPoints = null; }
        for (let p of this.opponents) { p.debugPoints = null; }
        this.delta = dt;

        if (this.kickoffActive) {
            this.kickoffTimer -= dt;
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

        const clockScale = (typeof MatchDuration !== 'undefined' && MatchDuration.timeScale)
            ? MatchDuration.timeScale
            : 4.5;
        this.tempoDeJogo += dt * clockScale;
        this.updatePlacar();

        if (this.state === 'CORNER_KICK') {
            this.setPieceTimer += dt;
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
                    if (this.ball.position.y <= BallPhysics.raio + 0.01) {
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

            this.updateGoalKickWait(dt);
            // Orçamento maior que antes: posicionamento + espera de 3-6s +
            // corrida/cobrança cabem lá dentro sem disparar o reset.
            if (this.setPieceTimer > 20.0) {
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

        let isPassing = false;
        if (this.ballCarrier && this.ballCarrier.fsm && (this.ballCarrier.fsm.currentState === 'PASS' || this.ballCarrier.fsm.currentState === 'CROSS')) {
            isPassing = true;
        }
        if (!this.intendedReceiver && !isPassing) {
            if (this.passTargetVisual) this.passTargetVisual.visible = false;
            if (this.passLineVisual) this.passLineVisual.visible = false;
        }

        this.updateBall();
        if (typeof SpatialGrid !== 'undefined') SpatialGrid.update(dt);
        // Sem isto o leque de candidatos era desenhado UMA vez, no instante em
        // que se liga o toggle, e ficava congelado nesse frame: os jogadores
        // saíam de baixo dos pontos e parecia que os pontos desapareciam.
        if (typeof PassCandidates !== 'undefined') PassCandidates.update(dt);
        if (typeof Perception !== 'undefined') Perception.tick(this, dt);
        this.runTeamAI();

        this.players.forEach(p => p.update(dt));
        this.opponents.forEach(p => p.update(dt));

        if (this.showOffsideLines) {
            let outfieldA = this.players.filter(p => p.role !== 'gk');
            if (outfieldA.length > 0) {
                outfieldA.sort((a, b) => a.model.position.z - b.model.position.z);
                this.offsideLineA.position.z = outfieldA[0].model.position.z;
            }
            let outfieldB = this.opponents.filter(p => p.role !== 'gk');
            if (outfieldB.length > 0) {
                outfieldB.sort((a, b) => b.model.position.z - a.model.position.z);
                this.offsideLineB.position.z = outfieldB[0].model.position.z;
            }
        }

        this.btPosRectA.visible = false;
        this.btPosRectB.visible = false;

        const updateRect = (teamName, rectMesh) => {
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
            }
        };

        if (window.teamBTPosState === 'TeamA' || window.teamBTPosState === 'Both') {
            updateRect('TeamA', this.btPosRectA);
        }
        if (window.teamBTPosState === 'TeamB' || window.teamBTPosState === 'Both') {
            updateRect('TeamB', this.btPosRectB);
        }

        const allPlayers = this.players.concat(this.opponents);
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
        const t1 = performance.now();
        this._pf_stats.time += (t1 - t0);
        this._pf_stats.count++;
        if (this._pf_stats.count === 60) {
            console.log("Avg Match.update ms:", this._pf_stats.time / 60);
            this._pf_stats.count = 0;
            this._pf_stats.time = 0;
        }
    },

    updateCrowd: function (dt) {
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

    /*
    Orquestrador dos níveis de decisão. Esta função já não decide nada por si:

        1. updatePossession()  quem tem a bola — facto, não decisão
        2. TeamAI.tick()       nível 1: o plano colectivo de cada equipa
        3. PosicionamentoAI.tick()   onde cada jogador se coloca (team_bt.js)
        4. publicarLinhaDeForaDeJogo()  a linha do fora-de-jogo de quem ataca

    O nível 3 (o que este jogador faz com a bola) corre depois, em
    FootballPlayer.update → runBehaviorTree, e comanda a PlayerFSM.
    */
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
        if (this.state !== 'PLAY' && this.state !== 'GOAL_KICK') return;

        this.players.forEach(p => PosicionamentoAI.tick(p, bbA));
        this.opponents.forEach(p => PosicionamentoAI.tick(p, bbB));

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

    // Quem tem a bola, há quanto tempo, e se isto é um contra-ataque.
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
            */
            const alvo = this.intendedReceiver;
            if (alvo && this.ballVel.lengthSq() > 0.5) {
                const dx = ballPos.x - alvo.model.position.x;
                const dz = ballPos.z - alvo.model.position.z;
                const dist = Math.hypot(dx, dz);
                if (dist > PerceptionModel.passePerdidoDist) {
                    // Afasta-se dele? (a bola vai no sentido oposto ao alvo)
                    const afasta = (this.ballVel.x * dx + this.ballVel.z * dz) > 0;
                    if (afasta) {
                        this.intendedReceiver = null;
                        this.passTargetPos = null;
                    }
                }
            }

            if (!this.resolveBallContact() && this.possessionTeam) {
                this.possessionTimer += this.delta;
            }
        }
    },

    /*
    Disputa da bola solta: recepção, intercepção e desvio.

    Corre uma vez por frame sobre o jogador mais próximo da bola que esteja em
    condições de lhe tocar. Devolve true se alguém ficou com ela.

    Cada jogador só tem direito a uma tentativa por aproximação (`retryLock`),
    senão uma bola rápida a passar por ele daria uma dezena de rolagens de dados
    e a intercepção seria certa.
    */
    resolveBallContact: function () {
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
            const d = gk.model.position.distanceTo(this.ball.position);
            if (d > 1.3) continue;
            const dentroArea = Math.abs(this.ball.position.x) < 20.16 &&
                (this.ball.position.z - gk.ownGoalZ) * gk.dirZ < 16.5 &&
                (this.ball.position.z - gk.ownGoalZ) * gk.dirZ > -1.0;
            if (!dentroArea) continue;
            gk.grabBall();
            return true;
        }

        const speed = this.ballVel.length();

        let best = null;
        let bestDist = 999;
        let bestAltura = 0;
        const considerar = (p) => {
            if (p.touchLock > 0) return;
            // O guarda-redes nunca controla a bola com o pé por aqui — só
            // apanha com as mãos, sempre via updateGK() (gkEstado 'apanhar').
            if (p.role === 'gk') return;
            // Distância ao CORPO (pés..testa), não à origem do modelo — ver
            // distanciaAoCorpo em utils.js.
            const r = distanciaAoCorpo(p, this.ball.position);
            if (r.dist < bestDist) { bestDist = r.dist; bestAltura = r.alturaContacto; best = p; }
        };
        this.players.forEach(considerar);
        this.opponents.forEach(considerar);

        if (!best || bestDist > BallControl.reach) return false;

        /*
        Bola à altura do peito: não se domina com o pé.

        Tem de ser testado ANTES da disputa normal — essa resolve tudo como
        toque de pé e punha uma bola a 1.4 m de altura a colar-se ao pé dele.

        Mata-se no peito com os pés no chão. `bestAltura` é medida a partir
        da base do modelo, que SOBE no salto: uma bola a 1.9 m com o jogador
        0.55 m no ar dava 1.35 m de "altura de peito" e ele matava-a no ar a
        meio de um cabeceio. `jumpTimer <= 0` fecha isso — no ar a bola é
        para cabecear, não para amortecer.
        */
        if (bestAltura >= BallControl.peitoYMin &&
            bestAltura <= BallControl.peitoYMax &&
            best.jumpTimer <= 0 &&
            best.fsm.currentState !== 'CHEST_CONTROL') {
            best.controlarNoPeito(bestAltura);
            return true;
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
        this.intendedReceiver = null;
        this.passTargetPos = null;
        this.lastTouchedTeam = best.team;
        this.lastTouchedPlayer = best;


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
        }
        return true;
    },

    // Toque falhado: a bola sai desviada e mais lenta, e fica disputável.
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

    /*
    Um alvo de "apoio" perto da baliza pode coincidir com a posição real do
    guarda-redes, e o jogador entrava mesmo por cima dele. Empurra o alvo
    para fora de um raio mínimo do GR.
    */
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

    /*
    LINHA DE FORA-DE-JOGO da equipa que ataca.

    Nao e posicionamento: e um facto sobre as posicoes REAIS do adversario.
    Leem-no o computeBlock (que trava a frente do bloco), o PassCandidates
    (que descarta companheiros em fora-de-jogo) e o nivel 2.

    Vivia dentro do relaxConstraints. Sobreviveu a apagar desse passo porque
    era a unica coisa la dentro que nao mexia em ninguem.
    */
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

    /*
    Colisão da bola com a REDE, com a forma que a rede tem mesmo: pano de
    cima horizontal até `profTopo`, e daí um pano inclinado até ao chão a
    `profBase`. Mais as duas laterais e o pano de trás.

    A bola é empurrada para dentro do pano e a velocidade decomposta em
    normal (absorvida, `restituicao`) e tangencial (travada, `atrito`). É a
    componente tangencial que faz a bola DESCER pelo pano até ao chão, em vez
    de parar no ar onde bateu.

    `zSinal` é o lado da baliza (+1 / -1). Tudo aqui é feito em
    profundidade `d` (metros para lá da linha), que não tem sinal.
    */
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

        // Se a bola estiver completamente atrás da rede (mais de 0.5m), não tentamos puxá-la para dentro!
        // Ela veio de fora.
        const a = ALTURA_BALIZA / (N.profBase - N.profTopo);
        const c = a * N.profBase;
        const norma = Math.hypot(a, 1);
        const dist = (a * d + b.y - c) / norma;
        if (dist > 0.8) return; 

        // --- laterais -------------------------------------------------
        if (d >= 0 && d <= N.profBase && b.y <= ALTURA_BALIZA) {
            if (Math.abs(b.x - meiaLarg) < rB) {
                if (v.x > 0) { b.x = meiaLarg - rB; } else { b.x = meiaLarg + rB; }
                v.x = -v.x * N.restituicao;
                v.z *= N.atrito; v.y *= N.atrito;
            } else if (Math.abs(b.x + meiaLarg) < rB) {
                if (v.x < 0) { b.x = -meiaLarg + rB; } else { b.x = -meiaLarg - rB; }
                v.x = -v.x * N.restituicao;
                v.z *= N.atrito; v.y *= N.atrito;
            }
        }

        // --- pano de cima ---------------------------------------------
        if (d >= 0 && d <= N.profTopo && Math.abs(b.x) <= meiaLarg) {
            if (Math.abs(b.y - ALTURA_BALIZA) < rB) {
                if (v.y > 0) { b.y = ALTURA_BALIZA - rB; } else { b.y = ALTURA_BALIZA + rB; }
                v.y = -v.y * N.restituicao;
                v.x *= N.atrito; v.z *= N.atrito;
            }
        }

        // --- pano de trás, inclinado ----------------------------------
       if (Math.abs(b.x) <= meiaLarg) {
            if (Math.abs(dist) < 0.8) {
                const nd = a / norma, ny = 1 / norma;
                const vn = vd * nd + v.y * ny;

                if (dist > 0 && vn < 0) { // Bola vem de fora para dentro
                    const correccao = rB - dist;
                    if (correccao > 0) {
                        d += nd * correccao; b.y += ny * correccao;
                    }
                    vd -= vn * nd * (1 + N.restituicao);
                    v.y -= vn * ny * (1 + N.restituicao);
                    vd *= N.atrito; v.y *= N.atrito; v.x *= N.atrito;
                } else if (dist <= 0 && vn > 0) { // Bola vem de dentro para fora
                    const correccao = dist + rB;
                    if (correccao > 0) {
                        d -= nd * correccao; b.y -= ny * correccao;
                    }
                    vd -= vn * nd * (1 + N.restituicao);
                    v.y -= vn * ny * (1 + N.restituicao);
                    vd *= N.atrito; v.y *= N.atrito; v.x *= N.atrito;
                } else if (dist > 0 && vn > 0) { 
                    // Bola passou o pano, ou teste que a lanca ja la
                    const correccao = dist + rB;
                    d -= nd * correccao; b.y -= ny * correccao;
                    vd -= vn * nd * (1 + N.restituicao);
                    v.y -= vn * ny * (1 + N.restituicao);
                    vd *= N.atrito; v.y *= N.atrito; v.x *= N.atrito;
                }
            }
        }

        b.z = (d + CAMPO_COMP / 2) * zSinal;
        v.z = vd * zSinal;
    },

    /*
    Colisão da bola com postes e travessão das duas balizas.

    Os postes são cilindros VERTICAIS: a colisão resolve-se no plano XZ,
    desde que a bola esteja abaixo do travessão. O travessão é um cilindro
    HORIZONTAL ao longo de X: resolve-se no plano YZ, desde que a bola esteja
    dentro da largura da baliza.

    Em ambos os casos a bola é empurrada para fora da superfície do cilindro
    (senão fica presa a colidir frame após frame) e a velocidade é reflectida
    na normal do contacto — é essa reflexão que faltava por completo, e por
    isso uma bola na trave nunca ressaltava.

    Corre ANTES da detecção de golo: a bola tem de bater na armação antes de
    lhe ser perguntado se passou a linha toda.
    */
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

    updateBall: function () {
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

        if (this.ball.position.y > r + 0.001) this.ballVel.y -= B.gravidade * dt;

        this.ball.position.addScaledVector(this.ballVel, dt);

        if (this.ball.position.y <= r) {
            this.ball.position.y = r;

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
            _q1.setFromAxisAngle(_v1, (speed * this.delta) / (r * BallPhysics.escalaVisual));
            this.ballVisual.quaternion.premultiply(_q1);
            this.ballVisual.quaternion.normalize();
        } else if (this.ballCarrier && this.ballCarrier.velocity.lengthSq() > 0.1) {
            let speed = this.ballCarrier.velocity.length();
            _v1.set(this.ballCarrier.velocity.z, 0, -this.ballCarrier.velocity.x).normalize();
            _q1.setFromAxisAngle(_v1, (speed * this.delta) / (r * BallPhysics.escalaVisual));
            this.ballVisual.quaternion.premultiply(_q1);
            this.ballVisual.quaternion.normalize();
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

        if (Math.abs(this.ball.position.z) - BallPhysics.raio > CAMPO_COMP / 2) {
            let zSinal = Math.sign(this.ball.position.z);
            if (Math.abs(this.ball.position.x) < (LARGURA_BALIZA / 2 - 0.1) && this.ball.position.y < ALTURA_BALIZA) {

                if (this.state === 'PLAY') {
                    this.state = 'GOAL';
                    this.goalSequenceStage = 0;
                    this.tempoParada = 0;

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
                                p.dynamicTarget = new THREE.Vector3(0, ALTURA_BASE_Y, -48 * dir);
                            } else {
                                let z = p.baseTarget.z;
                                if (p.role === 'def') {
                                    const cap = TeamShape.linhaDefensiva[Tatics.linhaDefensiva] ?? TeamShape.linhaDefensiva.medium;
                                    z = cap * dir;
                                }
                                if (z * dir > -margem) z = -margem * dir;
                                p.dynamicTarget = new THREE.Vector3(p.baseTarget.x, ALTURA_BASE_Y, z);
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
                } else if (!(this.state === 'GOAL_KICK' && this.golKickBolaAlvo)) {
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
                    */
                    this.ball.position.z = (CAMPO_COMP / 2) * zSinal;
                    this.ballVel.set(0, 0, 0);
                }
            }
            this.colidirComRede(zSinal);
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
                        const distSq = p.model.position.distanceToSquared(new THREE.Vector3(targetX, ALTURA_BASE_Y, targetZ));
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
                    this.resetPlay();
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

    setupSetPiece: function (type, team) {
        this.state = type;
        this.setPieceTeam = team;
        
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
        if (type !== 'GOAL_KICK') this.ballVel.set(0, 0, 0);
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
            let flagX = Math.sign(this.ball.position.x) * 33.5;
            let flagZ = attDir * 52.5;

            this.ball.position.set(flagX, BallPhysics.raio, flagZ);

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

            taker.model.position.set(flagX - Math.sign(flagX) * 1.5, ALTURA_BASE_Y, flagZ - attDir * 1.5);
            lookAtBola(taker.model, new THREE.Vector3(0, ALTURA_BASE_Y, flagZ - attDir * 10));
            taker.fsm.changeState('SET_PIECE_TAKER');

            let attackersInBox = attackingPlayers.filter(p => p !== taker && p.role !== 'gk');
            let boxPositions = [
                { x: -5, z: flagZ - attDir * 8 },
                { x: 5, z: flagZ - attDir * 8 },
                { x: 0, z: flagZ - attDir * 12 },
                { x: -8, z: flagZ - attDir * 14 },
                { x: 8, z: flagZ - attDir * 14 },
                { x: -2, z: flagZ - attDir * 5 },
                { x: 2, z: flagZ - attDir * 5 },
                { x: -12, z: flagZ - attDir * 18 },
                { x: 12, z: flagZ - attDir * 18 },
                { x: 0, z: flagZ - attDir * 20 }
            ];

            attackersInBox.forEach((p, idx) => {
                let pos = boxPositions[idx] || { x: 0, z: flagZ - attDir * 15 };
                p.model.position.set(pos.x + (Math.random() - 0.5) * 2, ALTURA_BASE_Y, pos.z + (Math.random() - 0.5) * 2);
                p.fsm.changeState('SET_PIECE_WAIT');
                p.dynamicTarget.copy(p.model.position);
            });

            let defendersInBox = defendingPlayers.filter(p => p.role !== 'gk');
            defendersInBox.forEach((p, idx) => {
                let attToMark = attackersInBox[idx % attackersInBox.length];
                if (attToMark) {
                    p.model.position.set(attToMark.model.position.x, ALTURA_BASE_Y, attToMark.model.position.z + defDir * 1.5);
                    p.fsm.changeState('SET_PIECE_WAIT');
                    p.dynamicTarget.copy(p.model.position);
                }
            });

            let defGK = defendingPlayers.find(p => p.role === 'gk');
            if (defGK) {
                defGK.model.position.set(0, ALTURA_BASE_Y, flagZ);
                lookAtBola(defGK.model, this.ball.position);
                defGK.fsm.changeState('SET_PIECE_WAIT');
            }

            let attGK = attackingPlayers.find(p => p.role === 'gk');
            if (attGK) {
                attGK.model.position.set(0, ALTURA_BASE_Y, -flagZ);
                lookAtBola(attGK.model, this.ball.position);
                attGK.fsm.changeState('SET_PIECE_WAIT');
            }

        } else if (type === 'GOAL_KICK') {
            /*
            Tiro de meta. `team` é quem BATE (a equipa que defende aquela
            baliza). A bola vai para a quina da pequena área do lado por onde
            saiu — `attDir` aqui é a direcção de ataque de quem bate, logo a
            baliza dele está em -attDir.
            */
            const G = GoalkeeperPose;
            const ladoX = Math.sign(this.ball.position.x) || 1;
            const linhaZ = -attDir * (CAMPO_COMP / 2);            // linha de fundo dele
            const bolaX = ladoX * G.pequenaAreaX;
            const bolaZ = linhaZ + attDir * G.pequenaAreaZ;       // para dentro do campo

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
            this.golKickAlvoEspera = 3.0 + Math.random() * 3.0;

            const gk = attackingPlayers.find(p => p.role === 'gk');
            this.setPieceTaker = gk || null;

            if (gk) {
                gk.hasBall = false;
                gk.gkEstado = 'tiro_meta';
                gk.gkTiroFase = 0;              // 0 = caminhar, 1 = corrida
                gk.gkTempoMergulho = 0;
                gk.gkKickAction = null;
                /*
                Ponto de onde arranca: na linha de fundo, atrás da bola. É o
                que o utilizador descreveu — caminha até à linha, depois corre
                e chuta.
                */
                gk.gkTiroAlvo = {
                    x: bolaX + ladoX * 1.0,
                    z: linhaZ
                };
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
                const dentroArea = Math.abs(p.model.position.x) < 20.16 &&
                    (p.model.position.z - linhaZ) * attDir < 16.5;
                if (dentroArea) {
                    p.model.position.z = linhaZ + attDir * 17.5;
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

    /*
    Espera do tiro de meta: 3-6s DEPOIS de quem bate estar posicionado, não a
    contar do apito. Só entra em contagem quando o último jogador de fora
    chega perto do alvo (MOVE_TO_POS -> aqui já convertido a SET_PIECE_WAIT);
    a partir daí o guarda-redes fica autorizado a completar a cobrança (ver o
    gate em gkTiroFase 0->1 no updateGK, player.js).
    */
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
};

