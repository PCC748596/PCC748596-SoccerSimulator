/*
QUEM COBRA O LATERAL — ver ThrowInModel.ordemBatedor.

Era o jogador de campo mais PERTO do ponto da linha, e num lateral no proprio
meio-campo isso da quase sempre o CENTRAL: o homem que menos devia estar a por a
bola em jogo fica com ela nas maos e a linha defensiva abre ao meio enquanto ele
la vai.

A ordem e a do futebol — lateral do lado, medio da ala, CM — e o lado sai do
sinal do x da bola, a mesma convencao das formacoes (LB em +x, RB em -x).

Duas saidas de emergencia, ambas deliberadas:
  - candidato da ordem longe de mais (`distanciaMaxBatedor`): passa-se ao
    seguinte, senao o lance ficava parado a espera de quem vem de 45 m;
  - nenhum dos tres em campo (expulsoes, formacoes sem medios de ala): cobra o
    mais perto, como antes. Um batedor imperfeito e melhor do que nenhum.
*/
function escolherBatedorDoLateral(candidatos, bolaPos) {
    const T = ThrowInModel;
    const lado = (bolaPos.x >= 0) ? 'esquerda' : 'direita';
    const ordem = T.ordemBatedor[lado];

    const dist = (p) => Math.hypot(
        p.model.position.x - bolaPos.x, p.model.position.z - bolaPos.z);

    for (const pos of ordem) {
        let melhor = null, melhorD = Infinity;
        for (const p of candidatos) {
            if (!p || p.role === 'gk' || p.pos !== pos) continue;
            const d = dist(p);
            if (d > T.distanciaMaxBatedor) continue;
            if (d < melhorD) { melhorD = d; melhor = p; }
        }
        if (melhor) return melhor;
    }

    let maisPerto = null, minD = Infinity;
    for (const p of candidatos) {
        if (!p || p.role === 'gk') continue;
        const d = dist(p);
        if (d < minD) { minD = d; maisPerto = p; }
    }
    return maisPerto;
}

/*
PRAZO DA SAÍDA DE JOGO.

Quem recebe a primeira bola do pontapé de saída toca para um defesa (o ramo
`PasseSaidaDeBola`, em js/bt/player_bt.js), para se poder ver a construção
desde trás. Isto é o que garante que a intenção não sobrevive à jogada.

A bandeira já se apagava com o toque do adversário e com qualquer bola parada,
mas faltava o caso normal: ninguém achar defesa livre (o
`encontrarDefesaParaSaida` devolve null com a linha toda tapada). Sem prazo, a
bandeira ficava acesa e o toque para trás saía muito depois, no meio de outra
jogada — um passe atrasado sem razão nenhuma, que é pior do que não o ter.

Seis segundos: dá para receber, dominar e tocar sem pressa, e acaba muito antes
de a jogada seguinte começar.
*/
const KICKOFF_PRAZO_PASSE_DEFESA = 6.0;

function correrPrazoDaSaida(M, dt) {
    if (!M.kickoffPendingPassToDef) return;
    M.kickoffPassToDefTimer -= dt;
    if (M.kickoffPassToDefTimer <= 0) {
        M.kickoffPendingPassToDef = false;
        M.kickoffPassToDefTimer = 0;
    }
}

const Match = {
    scene: null, ball: null, ballVisual: null, ballVel: new THREE.Vector3(),
    players: [], opponents: [], ballCarrier: null, intendedReceiver: null, state: 'PLAY',
    // Matadas no peito seguidas sem a bola assentar. Ver maxPeitosSeguidos em
    // config.js: era por aqui que o jogo encravava, com a bola presa no ar
    // entre dois jogadores a matá-la no peito um ao outro.
    peitosSeguidos: 0,
    // Equipa cujo guarda-redes nao pode usar as maos (recuo com o pe de um
    // companheiro). Null e o caso normal. Ver maosProibidasNoRecuo em utils.js.
    recuoParaGR: null,
    tempoParada: 0, delta: 0,
    placarA: 0, placarB: 0, tempoDeJogo: 0,
    chaserA: null, chaserB: null,
    possessionTeam: null, possessionTimer: 0,
    lastTouchedTeam: 'TeamA', lastTouchedPlayer: null,
    setPieceTaker: null, setPieceTimer: 0,
    // Tiro de meta: espera 3-6s depois de todos posicionados (ver
    // updateGoalKickWait / setupSetPiece).
    golKickProntos: false, golKickEspera: 0, golKickAlvoEspera: 0,
    golKickPendente: false, golKickAtrasoInicio: 0,
    lateralPendente: false, lateralAtraso: 0,
    cantoBolaAlvo: null, cantoAguardaChao: false, cantoBolaAtraso: 0,
    faltaPendente: false, faltaAtraso: 0,
    penaltiPendente: false, penaltiAtraso: 0,
    counterAttackTeam: null, counterAttackTimer: 0,
    specMesh: null, specData: [], specDummy: new THREE.Object3D(),
    crowdExcitement: 0, crowdTimer: 0,
    currentLookTarget: null, // Usado para interpolação da câmara
    kickoffActive: false, kickoffTimer: 0, kickoffTaker: null, kickoffApoio: null,
    kickoffTeam: null, kickoffPendingPassToDef: false, kickoffPassToDefTimer: 0,

    // Migração por eventos (ver EventBus) — parte 1: GK. Substitui o polling
    // directo de gk.gkEstado === 'apanhar'/'segurando' espalhado por vários
    // ficheiros (match.js afastarDoGuardaRedes, position_bt.js commit).
    // TeamA/TeamB -> true enquanto o GR dessa equipa está com a bola na mão.
    gkHoldingBall: { TeamA: false, TeamB: false },

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
                new THREE.RingGeometry(0.55, 0.85, 24),
                new THREE.MeshBasicMaterial({ color: cor, side: THREE.DoubleSide })
            );
            m.rotation.x = -Math.PI / 2;
            m.position.y = 0.06;
            m.visible = false;
            this.scene.add(m);
            return m;
        };
        this.btPosCentroA = criarCentro(0x3498db);
        this.btPosCentroB = criarCentro(0xe74c3c);

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
                if(this.defLineA) this.defLineA.visible = this.showOffsideLines;
                if(this.defLineB) this.defLineB.visible = this.showOffsideLines;
            }
            if (e.key === 'f' || e.key === 'F') this.setSpeed('frame');
            if (e.key === '1') this.setSpeed(0.7);
            if (e.key === '2') this.setSpeed(1.0);
            if (e.key === '3') this.setSpeed(1.2);
            if (e.key === '4') this.setCameraMode('center');
            if (e.key === '5') this.setCameraMode('sideline');
            if (e.key === '6') this.setCameraMode('topdown');
            if (e.key === '7') this.setCameraMode('lateraltv');
            if (e.key === ' ' || e.code === 'Space') {
                this.togglePause();
                e.preventDefault();
            }
            if (e.key === 'x' || e.key === 'X') togglePainel();
            /*
            Ctrl+C: canto forçado, para se ver a jogada sem esperar que
            aconteça sozinha. Vai para a equipa que está a atacar (a posse, ou
            o último toque se ainda não houver posse), na quina do lado onde a
            bola está e na linha de fundo que essa equipa ataca.
            */
            if ((e.key === 'c' || e.key === 'C') && e.ctrlKey) {
                this.forcarCanto();
                e.preventDefault();
            }
        });
    },

    /*
    Canto de encomenda (Ctrl+C). Quem bate é quem está a atacar; a quina é a
    do lado onde a bola está, na linha de fundo que essa equipa ataca — daí o
    `dirZ` do plantel dela e não um sinal fixo.
    */
    forcarCanto: function () {
        const equipa = this.possessionTeam || this.lastTouchedTeam || 'TeamA';
        const plantel = (equipa === 'TeamA') ? this.players : this.opponents;
        const attDir = (plantel[0] && plantel[0].dirZ) ? plantel[0].dirZ : 1;

        // A bola diz o LADO (o sinal do x); o setupSetPiece lê daqui.
        const ladoX = Math.sign(this.ball.position.x) || 1;
        this.ball.position.set(ladoX * 20, BallPhysics.raio, attDir * 50);
        this.ballVel.set(0, 0, 0);

        this.setupSetPiece('CORNER_KICK', equipa);
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
        if (speed === 'frame' && window.speedMultiplier === 'frame') {
            this.stepNextFrame = true;
        }
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
            let cvs = document.createElement('canvas');
            cvs.width = 128; cvs.height = 128;
            let ctx = cvs.getContext('2d');
            
            // Desenha a bola (branco com pentágonos pretos)
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(64, 64, 60, 0, Math.PI*2);
            ctx.fill();
            
            ctx.fillStyle = '#1a1a1a';
            // Pentágono central
            ctx.beginPath();
            for (let i=0; i<5; i++) {
                let a = (Math.PI*2/5)*i - Math.PI/2;
                let px = 64 + 18*Math.cos(a);
                let py = 64 + 18*Math.sin(a);
                if (i===0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
            // Pentágonos exteriores
            for (let i=0; i<5; i++) {
                let a = (Math.PI*2/5)*i - Math.PI/2;
                let cx = 64 + 44*Math.cos(a);
                let cy = 64 + 44*Math.sin(a);
                ctx.beginPath();
                for (let j=0; j<5; j++) {
                    let a2 = (Math.PI*2/5)*j + a;
                    let px = cx + 14*Math.cos(a2);
                    let py = cy + 14*Math.sin(a2);
                    if (j===0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.fill();
            }
            
            // Borda exterior
            ctx.lineWidth = 4;
            ctx.strokeStyle = '#cccccc';
            ctx.beginPath();
            ctx.arc(64, 64, 60, 0, Math.PI*2);
            ctx.stroke();

            let tex = new THREE.CanvasTexture(cvs);

            this.discoBola = new THREE.Group();

            this.discoIcon = new THREE.Mesh(
                new THREE.CircleGeometry(0.4675 * 0.75, 20),
                new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
            );
            this.discoIcon.rotation.x = -Math.PI / 2;
            this.discoBola.add(this.discoIcon);

            // Sombra
            let cvsS = document.createElement('canvas');
            cvsS.width = 64; cvsS.height = 64;
            let ctxS = cvsS.getContext('2d');
            let grad = ctxS.createRadialGradient(32, 32, 0, 32, 32, 32);
            grad.addColorStop(0, 'rgba(0,0,0,0.6)');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctxS.fillStyle = grad;
            ctxS.fillRect(0,0,64,64);
            let texS = new THREE.CanvasTexture(cvsS);
            
            this.discoSombra = new THREE.Mesh(
                new THREE.PlaneGeometry(1.0 * 0.75, 1.0 * 0.75),
                new THREE.MeshBasicMaterial({ map: texS, transparent: true, depthWrite: false })
            );
            this.discoSombra.rotation.x = -Math.PI / 2;
            this.discoSombra.position.y = -0.01;
            this.discoBola.add(this.discoSombra);

            this.discoBola.visible = false;
            this.scene.add(this.discoBola);
        }

        this.discoBola.visible = tatico;
        this.ball.visible = !tatico;

        if (tatico) {
            // BallPhysics.raio approx 0.11
            let altura = Math.max(0, this.ball.position.y - 0.11); 
            
            // Aumenta o tamanho do ícone da bola em até 35% no ápice
            let escalaBola = 1.0 + Math.min(0.35, altura * 0.08); 
            this.discoIcon.scale.set(escalaBola, escalaBola, escalaBola);
            
            // Para dar ainda mais a sensação de 3D, a bola "sobe" um pouquinho para o Sul (Z+) no ecrã
            // simulando a perspectiva da câmara que não é 100% perfeitamente a pino ou apenas a paralaxe.
            this.discoIcon.position.z = altura * 0.3;

            // Suaviza a sombra conforme a bola sobe
            let opacidadeSombra = Math.max(0.15, 1.0 - altura * 0.15);
            this.discoSombra.material.opacity = opacidadeSombra;
            // E a sombra cresce ligeiramente e fica difusa
            let escalaSombra = 1.0 + Math.min(0.5, altura * 0.1);
            this.discoSombra.scale.set(escalaSombra, escalaSombra, escalaSombra);

            // Mantemos o grupo na vertical da sombra
            this.discoBola.position.set(this.ball.position.x, 0.06, this.ball.position.z);
        }
    },

    updateCamera: function () {
        if (window.cameraMode === 'orbit') return;

        if (!this.ball) return;
        const zoom = window.cameraZoom || 1.0;
        if (!this._cTPos) { this._cTPos = new THREE.Vector3(); this._cLTar = new THREE.Vector3(); this._cFwd = new THREE.Vector3(); } let targetPos = this._cTPos;
        let lookTarget = this._cLTar;

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

            if (typeof TeamAI !== 'undefined') {
                const teamA = TeamAI.get('TeamA');
                const teamB = TeamAI.get('TeamB');
                if (teamA && teamB) {
                    const defTeam = teamA.isAttacking ? teamB : teamA;
                    if (defTeam.bloco && defTeam.bloco.x1 !== undefined) {
                        // edgeX é a linha de baixo do bloco da defesa (lado +X)
                        const edgeX = defTeam.bloco.x1;
                        // O máximo normal seria o limite do campo (34)
                        const recuo = 34 - edgeX;
                        if (recuo > 0) {
                            // Aproxima a câmera na direção do seu próprio look target (frente/trás local)
                            let fwd = this._cFwd.subVectors(lookTarget, targetPos).normalize();
                            targetPos.addScaledVector(fwd, recuo * 0.5);
                        }
                    }
                }
            }
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
    resetPlay: function (forcingKickoffTeam = null) {
        this.state = 'PLAY'; this.ballVel.set(0, 0, 0);

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
        this.kickoffTaker = taker;
        this.kickoffApoio = apoio;
        this.kickoffTeam = startA ? 'TeamA' : 'TeamB';
        this.kickoffPendingPassToDef = true;
        this.kickoffPassToDefTimer = KICKOFF_PRAZO_PASSE_DEFESA;
    },

    /*
    Cronómetro do próprio update, ligado por `Match.profiling = true` na
    consola. Ficava sempre ligado e despejava uma linha por segundo na
    consola, para sempre — o que enterra tudo o resto que lá se queira ver
    (avisos do lote, expulsões, erros).

    NA SIMULAÇÃO EM LOTE nunca corre, mesmo ligado à mão. Não é só o ruído:
    um lote de 11 jogos de 90 minutos são ~3,5 milhões de updates, e dois
    `performance.now()` em cada um são tempo real gasto a medir em vez de
    simular. E a média não diria nada de útil — no lote o update corre em
    ciclo fechado, sem render nem frame, que é o oposto do que se quer medir.
    */
    profiling: false,

    _profilingActivo: function () {
        return this.profiling && !(typeof Sim !== 'undefined' && Sim.running);
    },

    update: function (dt) {
        if (!this._pf_stats) this._pf_stats = { count: 0, time: 0 };
        const medir = this._profilingActivo();
        const t0 = medir ? performance.now() : 0;
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
        // Relógio em segundos simulados, para a telemetria do passe (o
        // tempoDeJogo acima vem multiplicado pelo timeScale).
        if (typeof MatchStats !== 'undefined') MatchStats.tick(dt);
        this.updatePlacar();

        if (this.state === 'CORNER_KICK') {
            this.setPieceTimer += dt;

            /*
            Bola ainda "a sair": segue o movimento até tocar no relvado, espera
            `cantoBolaAtraso`, e só então vai para a quina e trava. Os jogadores
            já se posicionaram no setupSetPiece — isto é só a bola.
            */
            if (this.cantoBolaAlvo) {
                if (this.cantoAguardaChao) {
                    if (this.ball.position.y <= BallPhysics.raio + 0.01) {
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
        }

        if (this.state === 'FREE_KICK') {
            this.setPieceTimer += dt;
            if (this.faltaPendente) {
                this.faltaAtraso -= dt;
                if (this.faltaAtraso <= 0) {
                    this.faltaPendente = false;
                    const t = this.setPieceTaker;
                    if (t) t.baterFalta();
                    else this.state = 'PLAY';
                }
            }
            if (this.setPieceTimer > 15.0) { this.setPieceTimer = 0; this.state = 'PLAY'; this.faltaPendente = false; }
        }

        if (this.state === 'PENALTY') {
            this.setPieceTimer += dt;
            if (this.penaltiPendente) {
                this.penaltiAtraso -= dt;
                if (this.penaltiAtraso <= 0) {
                    this.penaltiPendente = false;
                    const t = this.setPieceTaker;
                    if (t) t.baterPenalti();
                    else this.state = 'PLAY';
                }
            }
            if (this.setPieceTimer > 15.0) { this.setPieceTimer = 0; this.state = 'PLAY'; this.penaltiPendente = false; }
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
                        this.state = 'PLAY';
                    }
                }
            }

            // Rede de segurança: gesto interrompido, batedor derrubado, etc.
            if (this.setPieceTimer > 15.0) {
                this.setPieceTimer = 0;
                this.state = 'PLAY';
                this.lateralPendente = false;
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
            if (typeof TeamShape !== 'undefined' && typeof Tatics !== 'undefined') {
                const cap = TeamShape.linhaDefensiva[Tatics.linhaDefensiva] ?? TeamShape.linhaDefensiva.medium;
                this.defLineA.position.z = cap * 1;
                this.defLineB.position.z = cap * -1;
            }
        }

        this.btPosRectA.visible = false;
        this.btPosRectB.visible = false;
        this.btPosDiagA.visible = false;
        this.btPosDiagB.visible = false;
        this.btPosCentroA.visible = false;
        this.btPosCentroB.visible = false;

        const updateRect = (teamName, rectMesh, diagMesh, centroMesh) => {
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

                // Diagonais canto a canto, e a marca no cruzamento delas.
                diagMesh.visible = true;
                const d = diagMesh.geometry.attributes.position.array;
                d[0] = x0; d[1] = 0.05; d[2] = minZ;
                d[3] = x1; d[4] = 0.05; d[5] = maxZ;
                d[6] = x1; d[7] = 0.05; d[8] = minZ;
                d[9] = x0; d[10] = 0.05; d[11] = maxZ;
                diagMesh.geometry.attributes.position.needsUpdate = true;

                centroMesh.visible = true;
                centroMesh.position.x = (x0 + x1) / 2;
                centroMesh.position.z = (minZ + maxZ) / 2;
            }
        };

        if (window.teamBTPosState === 'TeamA' || window.teamBTPosState === 'Both') {
            updateRect('TeamA', this.btPosRectA, this.btPosDiagA, this.btPosCentroA);
        }
        if (window.teamBTPosState === 'TeamB' || window.teamBTPosState === 'Both') {
            updateRect('TeamB', this.btPosRectB, this.btPosDiagB, this.btPosCentroB);
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

    /*
    Orquestrador dos níveis de decisão. Esta função já não decide nada por si:

        1. updatePossession()  quem tem a bola — facto, não decisão
        2. TeamAI.tick()       nível 1: o plano colectivo de cada equipa
        3. PosicionamentoAI.tick()   onde cada jogador se coloca (team_bt.js)
        4. publicarLinhaDeForaDeJogo()  a linha do fora-de-jogo de quem ataca

    O nível 3 (o que este jogador faz com a bola) corre depois, em
    FootballPlayer.update → runBehaviorTree, e comanda a PlayerFSM.
    */
    /*
    O nível 2 (PosicionamentoAI.tick) corre? É ele que escreve `slotTarget` e
    `styleTarget` em cada jogador — os anéis do debug do TeamBT — e só corre em
    jogo corrido e no tiro de meta.

    Isto vive aqui, num sítio só, de propósito. A regra estava escrita à mão no
    `return` do runTeamAI E implícita no desenho dos anéis (player.js), e as
    duas divergiram: depois de um golo o rectângulo do bloco ia para o
    meio-campo (o nível 1 corre sempre) mas os anéis ficavam junto à baliza, a
    mostrar o slot congelado do último frame de jogo corrido.
    */
    nivel2Activo: function () {
        // THROW_IN incluído: só o batedor fica parado na linha, os outros dez
        // continuam a mover-se para dar e tapar linhas de reposição.
        return this.state === 'PLAY' || this.state === 'GOAL_KICK' ||
            this.state === 'THROW_IN';
        // FREE_KICK e PENALTY ficam de FORA: ali as posições são impostas pelo
        // setupSetPiece (barreira, meia-lua) e o nível 2 desfá-las-ia no frame
        // seguinte, como acontece no canto.
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
        if (typeof PosicionamentoAI.otimizarSlotsPorPosicao === 'function') {
            PosicionamentoAI.otimizarSlotsPorPosicao(this.players, bbA);
            PosicionamentoAI.otimizarSlotsPorPosicao(this.opponents, bbB);
        }

        this.players.forEach(p => PosicionamentoAI.tickBase(p, bbA));
        this.opponents.forEach(p => PosicionamentoAI.tickBase(p, bbB));

        if (typeof atribuirMarcacoesDaEquipa === 'function') {
            atribuirMarcacoesDaEquipa(this.players, bbA);
            atribuirMarcacoesDaEquipa(this.opponents, bbB);
        }

        this.players.forEach(p => PosicionamentoAI.tickFinal(p, bbA));
        this.opponents.forEach(p => PosicionamentoAI.tickFinal(p, bbB));

        /*
        Quem se oferece como opcao de passe. Tambem e decisao de EQUIPA: cada
        um a escolher sozinho o melhor ponto escolhe o MESMO ponto (foi o erro
        que a marcacao tinha). Corre depois do posicionamento porque o custo de
        um apoio e a distancia do slot dele ao ponto.
        */
        if (typeof atribuirApoiosDaEquipa === 'function') {
            atribuirApoiosDaEquipa(this.players, bbA);
            atribuirApoiosDaEquipa(this.opponents, bbB);
        }

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
            const d = gk.model.position.distanceTo(this.ball.position);
            if (d > 1.3) continue;
            const dentroArea = Math.abs(this.ball.position.x) < 20.16 &&
                (this.ball.position.z - gk.ownGoalZ) * gk.dirZ < 16.5 &&
                (this.ball.position.z - gk.ownGoalZ) * gk.dirZ > -1.0;
            if (!dentroArea) continue;
            /*
            RECUO COM O PE: as maos estao proibidas. Nao se agarra, e a bola
            segue para o tratamento normal aqui em baixo — o guarda-redes
            joga-a com o pe como qualquer outro jogador.
            */
            if (typeof maosProibidasNoRecuo === 'function' &&
                maosProibidasNoRecuo(this.recuoParaGR, gk.team)) continue;
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
            // Companheiro de time NÃO tira a bola do próprio jogador com a bola
            if (this.ballCarrier && p !== this.ballCarrier && p.team === this.ballCarrier.team) return;
            // Distância ao CORPO (pés..testa), não à origem do modelo — ver
            // distanciaAoCorpo em utils.js.
            const r = distanciaAoCorpo(p, this.ball.position);
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
        const maxHeaders = (typeof HeaderModel !== 'undefined' && HeaderModel.maxHeadersSeguidos) ? HeaderModel.maxHeadersSeguidos : 2;
        const atingiuLimiteCabeca = this.aerialHeaderCount >= maxHeaders;

        const maxPeitos = (typeof BallControl.maxPeitosSeguidos === 'number')
            ? BallControl.maxPeitosSeguidos : 2;
        if ((bestAltura >= BallControl.peitoYMin && bestAltura <= BallControl.peitoYMax && best.jumpTimer <= 0) ||
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
    /*
    A BOLA POUSADA EM CIMA DA BALIZA.

    O pano de cima da rede (ver colidirComRede) e horizontal e devolve a bola
    com `v.y = -v.y * restituicao`: quem chega la de cima ressalta cada vez
    menos ate ficar parada em cima da rede. Fica inalcancavel, e o jogo nao
    recomeca porque a deteccao de bola fora precisa de `|z| - raio` PASSAR a
    linha de fundo — uma bola assente em cima do travessao esta praticamente
    EM CIMA dessa linha e nao a passa.

    A regra pratica e a do arbitro: bola que fica em cima da rede sai de jogo
    pela linha de fundo. Aqui empurra-se `z` o suficiente para a deteccao que
    ja existe a apanhar e decidir entre canto e pontape de baliza conforme
    quem tocou por ultimo — em vez de duplicar essa decisao.

    So actua com a bola LENTA: uma bola a passar por cima do travessao a
    caminho da bancada nao pode ser interrompida a meio do voo.
    */
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
                if (typeof NetWave !== 'undefined') NetWave.bater(zSinal, v.x);
                if (v.x > 0) { b.x = meiaLarg - rB; } else { b.x = meiaLarg + rB; }
                v.x = -v.x * N.restituicao;
                v.z *= N.atrito; v.y *= N.atrito;
            } else if (Math.abs(b.x + meiaLarg) < rB) {
                if (typeof NetWave !== 'undefined') NetWave.bater(zSinal, v.x);
                if (v.x < 0) { b.x = -meiaLarg + rB; } else { b.x = -meiaLarg - rB; }
                v.x = -v.x * N.restituicao;
                v.z *= N.atrito; v.y *= N.atrito;
            }
        }

        // --- pano de cima ---------------------------------------------
        if (d >= 0 && d <= N.profTopo && Math.abs(b.x) <= meiaLarg) {
            if (Math.abs(b.y - ALTURA_BALIZA) < rB) {
                if (typeof NetWave !== 'undefined') NetWave.bater(zSinal, v.y);
                if (v.y > 0) { b.y = ALTURA_BALIZA - rB; } else { b.y = ALTURA_BALIZA + rB; }
                v.y = -v.y * N.restituicao;
                v.x *= N.atrito; v.z *= N.atrito;
            }
        }

        // --- pano de trás, inclinado ----------------------------------
        let res = N.restituicao;
        let atr = N.atrito;
        
        // Efeito Visual de Golo: A rede ampara a bola
        // Se a bola está dentro da baliza, a cair, e já perto da rede, 
        // "puxamos" a bola contra a rede e anulamos o ressalto para que escorregue.
        if (d > 0.3 && v.y < 0 && Math.abs(b.x) <= meiaLarg && dist > -rB - 0.5 && dist <= 0) {
            vd += 12.0 * (this.delta || 0.016); // empurra contra o pano
            res = 0.0;  // anula ressalto
            atr = 0.98; // retém energia para escorregar depressa
        }

       if (Math.abs(b.x) <= meiaLarg) {
            if (Math.abs(dist) < 0.8) {
                const nd = a / norma, ny = 1 / norma;
                const vn = vd * nd + v.y * ny;

                if (dist > 0 && vn < 0) { // Bola vem de fora para dentro
                    // A rede abana: quanto mais forte a componente normal, mais.
                    if (typeof NetWave !== 'undefined') NetWave.bater(zSinal, vn);
                    const correccao = rB - dist;
                    if (correccao > 0) {
                        d += nd * correccao; b.y += ny * correccao;
                    }
                    vd -= vn * nd * (1 + res);
                    v.y -= vn * ny * (1 + res);
                    vd *= atr; v.y *= atr; v.x *= atr;
                } else if (dist <= 0 && vn > 0) { // Bola vem de dentro para fora
                    // Bateu pelo lado de dentro (Golo)
                    if (typeof NetWave !== 'undefined') NetWave.bater(zSinal, vn);
                    const correccao = dist + rB;
                    if (correccao > 0) {
                        d -= nd * correccao; b.y -= ny * correccao;
                    }
                    vd -= vn * nd * (1 + res);
                    v.y -= vn * ny * (1 + res);
                    vd *= atr; v.y *= atr; v.x *= atr;
                } else if (dist > 0 && vn > 0) { 
                    // Bola passou o pano, ou teste que a lanca ja la
                    if (typeof NetWave !== 'undefined') NetWave.bater(zSinal, vn);
                    const correccao = dist + rB;
                    d -= nd * correccao; b.y -= ny * correccao;
                    vd -= vn * nd * (1 + res);
                    v.y -= vn * ny * (1 + res);
                    vd *= atr; v.y *= atr; v.x *= atr;
                }
            }
        }

        b.z = (d + CAMPO_COMP / 2) * zSinal;
        v.z = vd * zSinal;
    },

    /*
    A bola está DENTRO da armação da baliza (entre os postes, abaixo do
    travessão e à frente do pano de trás)?

    Serve para o bloco da linha de fundo saber que a bola não está "fora": a
    seguir a um golo ela escorrega pelo pano e vai encostar por dentro ao pano
    lateral, onde a `colidirComRede` a fixa em `LARGURA_BALIZA/2 - raio`
    (3.55 m). O teste de golo é `|x| < LARGURA_BALIZA/2 - 0.1` (3.56 m) e o
    passo de integração leva a bola até ~3.61 m antes de a rede a corrigir,
    porque a `colidirComRede` corre DEPOIS. Sem esta guarda, ~10% dos golos
    acabavam com a bola teleportada para cima da linha e congelada lá.

    As margens de raio são de propósito: o critério é o volume da bola tocar o
    interior da armação, não o centro dela.
    */
    dentroDaArmacao: function (zSinal) {
        const rB = BallPhysics.raio;
        const b = this.ball.position;
        const d = b.z * zSinal - CAMPO_COMP / 2;
        return Math.abs(b.x) <= LARGURA_BALIZA / 2 + rB &&
               b.y <= ALTURA_BALIZA + rB &&
               d <= GoalNet.profBase + rB;
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

        if (this.ball.position.y > r + 0.001) this.ballVel.y -= B.gravidade * dt;

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
            if (Math.abs(this.ball.position.x) < (LARGURA_BALIZA / 2 - 0.1) && this.ball.position.y < ALTURA_BALIZA) {

                if (this.state === 'PLAY') {
                    this.state = 'GOAL';
                    this.goalSequenceStage = 0;
                    this.tempoParada = 0;
                    
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

    /*
    Devolve ao plantel quem foi expulso, na ordem em que sairam.

    A ORDEM IMPORTA: ha codigo que indexa `Match.players` por POSICAO NA
    LISTA — a cobertura de estilos do js/simulate.js e o exemplo — portanto
    reinserir no fim deixava o jogador com o indice trocado e a calibracao
    passava a atribuir estilos ao jogador errado, sem se queixar. Cada um
    volta ao indice que tinha.
    */
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

    /*
    FALTA no sítio onde a bola está, a favor de quem a tem. Sem portador
    (bola solta), usa-se quem lhe tocou por último — que é a mesma convenção
    das saídas pela linha.
    */
    triggerFreeKick: function (forceTeam = null) {
        const team = forceTeam ||
            (this.ballCarrier ? this.ballCarrier.team : null) ||
            this.possessionTeam || this.lastTouchedTeam || 'TeamA';
        this.setupSetPiece('FREE_KICK', team);
    },

    // Penálti a favor de quem tem a bola, na baliza que essa equipa ataca.
    triggerPenalty: function (forceTeam = null) {
        const team = forceTeam ||
            (this.ballCarrier ? this.ballCarrier.team : null) ||
            this.possessionTeam || this.lastTouchedTeam || 'TeamA';
        this.setupSetPiece('PENALTY', team);
    },

    /*
    LATERAL a favor de quem NÃO tocou por último, como na regra — a bola volta
    ao ponto da linha mais próximo de onde está agora (ver o ramo THROW_IN do
    setupSetPiece, que trava o x na linha e mantém o z).
    */
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

    setupSetPiece: function (type, team) {
        this.state = type;
        this.setPieceTeam = team;

        /*
        A ETIQUETA DA MARCACAO, por cima do arbitro. Aqui e nao em cada
        `trigger*`: este e o unico sitio por onde TODOS os lances parados
        passam, incluindo os que vierem a ser escritos.

        Ver Officials.rotuloDaMarcacao — um estado sem nome de marcacao nao
        acende nada, e sem arbitros na cena isto nao faz nem rebenta.
        */
        if (typeof Officials !== 'undefined' && Officials.anunciar) {
            Officials.anunciar(Officials.rotuloDaMarcacao(type));
            // E o braco: a direccao do ataque de quem beneficia, ou a marca de
            // penalti. Ver Officials.sinalizarMarcacao.
            if (Officials.sinalizarMarcacao) Officials.sinalizarMarcacao(type, team);
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
                p.setPieceTarget = new THREE.Vector3().copy(p.model.position);
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
            defendersInBox.forEach((p, idx) => {
                const cfg = defenseSetup[idx] || defenseSetup[defenseSetup.length - 1];
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

            let takerFK = null, minFK = 999;
            attackingPlayers.forEach(p => {
                if (p.role === 'gk') return;
                const d = p.model.position.distanceTo(bolaFK);
                if (d < minFK) { minFK = d; takerFK = p; }
            });
            this.setPieceTaker = takerFK || null;

            if (takerFK) {
                takerFK.model.position.set(
                    bolaFK.x - dirFK.x * F.recuoBatedor, ALTURA_BASE_Y,
                    bolaFK.z - dirFK.z * F.recuoBatedor);
                lookAtBola(takerFK.model, bolaFK);
                takerFK.fsm.changeState('SET_PIECE_WAIT');
            }

            /*
            Barreira: mais gente quanto mais perto da baliza. Perpendicular à
            linha bola->baliza, ombro com ombro, centrada nessa linha.
            */
            const avancoFK = bolaFK.z * attDir;
            const nBarreira = (avancoFK > F.barreiraZonaZ) ? F.barreiraMax : F.barreiraMin;
            const perpFK = new THREE.Vector3(-dirFK.z, 0, dirFK.x);

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
            GENTE NA ÁREA À ESPERA DO CRUZAMENTO
            ==========================================================
            Até aqui só o batedor e a barreira eram colocados: os outros nove
            atacantes ficavam onde a jogada os tinha deixado, e cruzava-se para
            uma área vazia.

            Mesmo desenho do canto (ver attackSetup mais acima): slots
            relativos à baliza, `initial` onde se espera e `target` para onde
            se ataca quando a bola sai, com a disputa de posição (jostle) por
            cima. O que muda é a quantidade — cinco e não nove, porque numa
            falta a bola tanto pode sair em cruzamento como em remate directo,
            e a equipa inteira dentro da área deixava o contra-ataque aberto.

            Só a partir de `zonaDeArea`: mais longe do que isso a falta é de
            recomposição e não de ataque.
            */
            const povoarArea = avancoFK >= F.zonaDeArea;
            if (povoarArea) {
                const ladoFK = Math.sign(bolaFK.x) || 1;
                const linhaFundoFK = attDir * (CAMPO_COMP / 2);

                /*
                Quem vai à área: avançados primeiro, laterais e trincos por
                último — a mesma ordem do canto, e pela mesma razão (sem ela o
                slot saía pela ordem do plantel e um lateral ficava no primeiro
                pau com o ponta-de-lança na sobra).
                */
                const naArea = attackingPlayers
                    .filter(p => p !== takerFK && p.role !== 'gk')
                    .sort((a, b) => {
                        const ordem = { 'ata': 1, 'mid': 2, 'def': 3 };
                        return (ordem[a.role] || 2) - (ordem[b.role] || 2);
                    })
                    .slice(0, F.slotsArea.length);

                naArea.forEach((p, idx) => {
                    const cfg = F.slotsArea[idx];
                    const initX = ladoFK * cfg.initial.relX;
                    const initZ = linhaFundoFK - attDir * cfg.initial.dist;

                    p.model.position.set(initX, ALTURA_BASE_Y, initZ);
                    p.dynamicTarget.set(
                        ladoFK * cfg.target.relX, ALTURA_BASE_Y,
                        linhaFundoFK - attDir * cfg.target.dist);
                    p.setPieceTarget = new THREE.Vector3().copy(p.model.position);
                    p.jostleAncora = { x: initX, z: initZ };
                    p.jostleAngulo = Math.random() * Math.PI * 2;
                    p.jostleRaio = Math.random() * SetPieceJostle.raio;
                    p.jostleTimer = Math.random() * SetPieceJostle.intervaloMax;
                    p.fsm.changeState('SET_PIECE_WAIT');
                    lookAtBola(p.model, bolaFK);
                });

                /*
                E os marcadores. Só os defensores que SOBRAM da barreira — ela
                é obrigação e vem primeiro. Sem isto os atacantes ficavam na
                área sozinhos, que é tão irreal como a área vazia.
                */
                const livres = defesaOrdenada.slice(nBarreira);
                for (let i = 0; i < naArea.length && i < livres.length; i++) {
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
            const naEntrada = lista => {
                const restantes = lista.filter(p => p !== takerPen && p.role !== 'gk');
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

            // Guarda-redes que defende: SOBRE a linha de golo, pronto a reagir.
            const gkPen = defendingPlayers.find(p => p.role === 'gk');
            if (gkPen) {
                gkPen.model.position.set(0, ALTURA_BASE_Y, linhaGolPen - attDir * 0.05);
                gkPen.gkEstado = 'idle';
                gkPen.gkReagiu = false;
                gkPen.gkDelayReacao = 0;
                gkPen.dive = null;
                lookAtBola(gkPen.model, this.ball.position);
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

