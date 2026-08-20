/*
=============================================================================
SG PASS/MARKING — grid espacial em camadas
=============================================================================
Campo dividido em 25 (largura) x 32 (comprimento) células — ~2.7 x 3.3m
cada. Cada célula ainda sabe quem está fisicamente dentro dela (usado por
findFreeSpace/occupancy, ex.: findThroughBall), mas os BÓNUS por célula
deixaram de ser calculados dinamicamente (influência/ocupação) — agora são
AUTORADOS por camada, uma por finalidade: PASSE, CRUZAMENTO, CHUTE,
LANÇAMENTO, MARCAÇÃO, etc. Começando só pelo PASSE.

Convenção de autoria: cada camada é lida no referencial de ataque de CADA
equipa — avanco = z * dirZ dela, o MESMO dirZ usado em todo o resto do jogo
(targetGoalZ, ownGoalZ, findThroughBall, etc: TeamA/BLUE dirZ=+1, TeamB/RED
dirZ=-1). avanco=+53 é sempre a baliza que essa equipa ataca de verdade.

(Correcção: chegou a estar amarrado ao "referencial do RED" isolado, dir=+1
fixo pro RED e -1 pro BLUE, independente do dirZ real de cada um — resultado
medido: CHUTE ficava 0 na zona de remate real das DUAS equipas, avançado
nunca rematava, só tocava pra trás. Alinhar com dirZ resolve.)

Convenção de cor/equipa igual ao placar (ver Match.updatePlacar): TeamA =
BLUE, TeamB = RED.
=============================================================================
*/
const SpatialGrid = {
    /*
    Grid fixa por contagem de células, não por tamanho de célula: 32 colunas
    ao longo do COMPRIMENTO (106m, `rows`, eixo Z) por 25 à LARGURA (68m,
    `cols`, eixo X).
    */
    cols: 25,   // eixo X (largura)
    rows: 32,   // eixo Z (comprimento)
    cellSizeX: 0, cellSizeZ: 0,
    minX: 0, minZ: 0,
    cells: null,

    debug: false,
    _mesh: null, _canvas: null, _ctx: null, _tex: null,
    _redrawAccum: 0,
    _redrawEvery: 0.15, // debug é caro (texto por célula) — não vale redesenhar a 60fps

    init: function () {
        this.minX = -CAMPO_LARG / 2;
        this.minZ = -CAMPO_COMP / 2;
        this.cellSizeX = CAMPO_LARG / this.cols;
        this.cellSizeZ = CAMPO_COMP / this.rows;
        this.cells = new Array(this.cols * this.rows);
        for (let i = 0; i < this.cells.length; i++) this.cells[i] = this.blankCell();
    },

    blankCell: function () {
        return { TeamA: [], TeamB: [] };
    },

    idx: function (ix, iz) { return iz * this.cols + ix; },

    cellIndexAt: function (x, z) {
        let ix = Math.floor((x - this.minX) / this.cellSizeX);
        let iz = Math.floor((z - this.minZ) / this.cellSizeZ);
        ix = Math.max(0, Math.min(this.cols - 1, ix));
        iz = Math.max(0, Math.min(this.rows - 1, iz));
        return { ix: ix, iz: iz };
    },

    // Chamado uma vez por frame a partir de Match.update(). Só actualiza a
    // ocupação física (quem está em cada célula) — as camadas de bónus são
    // estáticas, não precisam de recálculo por frame.
    update: function (dt) {
        if (!this.cells) this.init();
        for (let i = 0; i < this.cells.length; i++) {
            this.cells[i].TeamA.length = 0;
            this.cells[i].TeamB.length = 0;
        }
        for (const p of Match.players) {
            const c = this.cellIndexAt(p.model.position.x, p.model.position.z);
            this.cells[this.idx(c.ix, c.iz)].TeamA.push(p);
        }
        for (const p of Match.opponents) {
            const c = this.cellIndexAt(p.model.position.x, p.model.position.z);
            this.cells[this.idx(c.ix, c.iz)].TeamB.push(p);
        }

        if (this.debug) {
            this._redrawAccum += (dt || 0);
            if (this._redrawAccum >= this._redrawEvery) {
                this._redrawAccum = 0;
                this.updateDebugVisual();
            }
        }
    },

    /*
    =========================================================================
    CAMADAS — cada uma é uma função (avanco, cx) -> valor, autorada no
    referencial de ataque (avanco: -53 baliza própria .. +53 baliza
    adversária; cx: largura, sem espelho — só a Z importa por equipa).
    =========================================================================
    */
    LAYERS: {
        /*
        PASSE: 100 no meio-campo (avanco=0), descendo 5 por célula de
        distância à medida que se aproxima de qualquer área, com piso 50
        (não desce mais do que isso, mesmo dentro da área).
        */
        pass: function (avanco, cx) {
            const distCelulas = Math.floor(Math.abs(avanco) / SpatialGrid.cellSizeZ);
            return Math.max(50, 100 - 5 * distCelulas);
        },

        /*
        MARCAÇÃO: 100 desde a linha de fundo própria até 1 célula fora da
        própria grande área (à frente dela, ainda dentro da largura da
        área) — a "zona núcleo". A partir daí desconta 5 por célula em DUAS
        direcções, que se somam:
            longitudinal — em direcção à linha central (fora do núcleo em Z)
            lateral      — em direcção à linha lateral, nas células ao lado
                           da área mas ainda ao nível dela (fora do núcleo em X)
        Sem bónus no meio-campo adversário (avanco > 0) — marcação é coisa
        do terço defensivo.
        */
        marking: function (avanco, cx) {
            if (avanco > 0) return 0;

            let meioComp = CAMPO_COMP / 2;
            const limiteAreaZ = -(meioComp - 16.5);              // -36.5, linha da própria área
            const nucleoZ = limiteAreaZ + SpatialGrid.cellSizeZ; // 1 célula à frente da área
            const nucleoX = 20.16;                          // meia-largura da área

            const distZ = (avanco > nucleoZ) ? Math.floor((avanco - nucleoZ) / SpatialGrid.cellSizeZ) : 0;
            const distX = (Math.abs(cx) > nucleoX) ? Math.floor((Math.abs(cx) - nucleoX) / SpatialGrid.cellSizeX) : 0;

            return Math.max(0, 100 - 5 * (distZ + distX));
        },
        /*
        CRUZAMENTO: faixa lateral entre a grande área e a linha lateral,
        junto à linha de fundo adversária. Duas escadinhas independentes,
        as DUAS na faixa fora da área (nunca para dentro dela):
            - para DENTRO (1ª coluna a partir da borda da área, mesma
              profundidade 0-4 fileiras) -> 90
            - ao longo da própria faixa lateral, da quina da área em diante
              (fileiras 0-4 -> 100, depois desce fileira a fileira rumo ao
              meio-campo): fileira 5 -> 80, 6 -> 70, 7 -> 60, daí -> 0
        */
        cruzamento: function (avanco, cx) {
            let meioComp = CAMPO_COMP / 2;
            const rowFromGoal = Math.max(0, Math.floor((meioComp - avanco) / SpatialGrid.cellSizeZ));
            const areaXedge = 20.16; // meia-largura da grande área (mesma ref. do MARKING/CHUTE)
            const distX = Math.abs(cx) - areaXedge;

            if (distX >= 0) {
                // faixa lateral, fora da área até a linha lateral
                if (rowFromGoal <= 4) return 100;
                if (rowFromGoal === 5) return 80;
                if (rowFromGoal === 6) return 70;
                if (rowFromGoal === 7) return 60;
                return 0;
            }

            // dentro da área, só a 1ª coluna pra dentro, mesma profundidade da faixa
            if (rowFromGoal > 4) return 0;
            const colIn = Math.ceil(-distX / SpatialGrid.cellSizeX);
            return colIn <= 1 ? 90 : 0;
        },

        /*
        CHUTE: zonas concêntricas à frente da baliza adversária (avanco=53),
        contadas em fileiras (linhas de células) a partir da linha de fundo:
            fileiras 0-1 (dentro da pequena área)        -> 100
            fileira 2   (1ª fileira em volta da pequena) -> 90
            fileiras 3-4 (próximas 2, ainda na grande)   -> 85
            fileira 5   (1ª fora da grande área)         -> 80
            fileira 6   (2ª fora da grande área)         -> 75
            daí em diante -5 por fileira
        As fileiras 2-6 valem só no corredor de 7 tiles centrado na baliza
        (|cx| <= 3.5 células); fora do corredor desconta 5 por célula lateral
        de distância. Piso 50 — abaixo disso o valor cai a zero.
        */
        chute: function (avanco, cx) {
            let meioComp = CAMPO_COMP / 2;
            const rowFromGoal = Math.max(0, Math.floor((meioComp - avanco) / SpatialGrid.cellSizeZ));

            let base;
            if (rowFromGoal <= 1) base = 100;
            else if (rowFromGoal === 2) base = 90;
            else if (rowFromGoal <= 4) base = 85;
            else if (rowFromGoal === 5) base = 80;
            else if (rowFromGoal === 6) base = 75;
            else base = 75 - 5 * (rowFromGoal - 6);

            const colDistCel = Math.max(0, Math.abs(cx) / SpatialGrid.cellSizeX - 3.5);
            const valor = base - 5 * Math.floor(colDistCel);

            return valor < 50 ? 0 : valor;
        },

        lancamento: function (avanco, cx) { return 0; }
    },

    /*
    Valor de uma camada numa posição do MUNDO, para uma equipa. team =
    'TeamA' | 'TeamB'. dir = dirZ REAL dessa equipa (igual ao player.dirZ
    usado em todo o resto do jogo) — avanco=+53 cai sempre na baliza que ela
    ataca de verdade. TeamA/BLUE ataca +Z (dir=+1), TeamB/RED ataca -Z
    (dir=-1).
    */
    layerValueAt: function (layerName, x, z, team) {
        const fn = this.LAYERS[layerName];
        if (!fn) return 0;
        const dir = (team === 'TeamA') ? 1 : -1;
        return fn(z * dir, x);
    },

    cellAt: function (x, z) {
        const c = this.cellIndexAt(x, z);
        return this.cells[this.idx(c.ix, c.iz)];
    },

    // Nº de jogadores de uma equipa numa janela quadrada de `raioCelulas`
    // células ao redor de (x,z). team = 'TeamA' | 'TeamB'.
    occupancy: function (x, z, raioCelulas, team) {
        const c = this.cellIndexAt(x, z);
        let n = 0;
        for (let dz = -raioCelulas; dz <= raioCelulas; dz++) {
            for (let dx = -raioCelulas; dx <= raioCelulas; dx++) {
                const cx = c.ix + dx, cz = c.iz + dz;
                if (cx < 0 || cx >= this.cols || cz < 0 || cz >= this.rows) continue;
                n += this.cells[this.idx(cx, cz)][team].length;
            }
        }
        return n;
    },

    /*
    Ponto mais livre de `equipaAEvitar` dentro de `raioMetros` de (x,z).
    Devolve {x,z} ou null se não achar candidato dentro dos limites do campo.
    */
    findFreeSpace: function (x, z, raioMetros, equipaAEvitar) {
        if (!this.cells) this.init();
        const raioCelX = Math.max(1, Math.round(raioMetros / this.cellSizeX));
        const raioCelZ = Math.max(1, Math.round(raioMetros / this.cellSizeZ));
        const c = this.cellIndexAt(x, z);
        let melhor = null, melhorNota = -Infinity;

        for (let dz = -raioCelZ; dz <= raioCelZ; dz++) {
            for (let dx = -raioCelX; dx <= raioCelX; dx++) {
                const cx = c.ix + dx, cz = c.iz + dz;
                if (cx < 0 || cx >= this.cols || cz < 0 || cz >= this.rows) continue;
                const distM = Math.hypot(dx * this.cellSizeX, dz * this.cellSizeZ);
                if (distM > raioMetros) continue;

                const px = this.minX + (cx + 0.5) * this.cellSizeX;
                const pz = this.minZ + (cz + 0.5) * this.cellSizeZ;
                const ocupacao = this.occupancy(px, pz, 1, equipaAEvitar);
                const nota = -ocupacao * 10 - distM * 0.15;

                if (nota > melhorNota) { melhorNota = nota; melhor = { x: px, z: pz }; }
            }
        }
        return melhor;
    },

    /* --- Visualização de debug -------------------------------------------
    Fundo transparente (o relvado escuro do campo já fica visível por
    baixo) + linhas mais claras a cada célula + valor de cada camada activa
    (por agora só PASS; MARKING aparece a 0 até ser autorada).
    ----------------------------------------------------------------------- */

    pxPerMeter: 32,

    buildDebugVisual: function () {
        const w = Math.round(CAMPO_LARG * this.pxPerMeter);
        const h = Math.round(CAMPO_COMP * this.pxPerMeter);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        const tex = new THREE.CanvasTexture(canvas);
        // Mipmap em texto fino borra tudo a qualquer ângulo/zoom que não seja
        // 1:1 — desliga mipmap e usa filtro linear simples (nítido, sem serrilhado).
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false });
        const geo = new THREE.PlaneGeometry(CAMPO_LARG, CAMPO_COMP);
        const mesh = new THREE.Mesh(geo, mat);
        // SÓ o rotation.x deita o plano no chão, alinhado com o campo
        // (68 de largura em X, 106 de comprimento em Z). Rodar a MALHA
        // inteira troca essas dimensões de eixo — ver histórico no commit
        // anterior. O giro pedido é só do TEXTO (ctx.rotate), não da malha.
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = 0.03;
        mesh.visible = false;
        Match.scene.add(mesh);
        this._canvas = canvas; this._ctx = ctx; this._tex = tex; this._mesh = mesh;
    },

    updateDebugVisual: function () {
        if (!this._mesh) this.buildDebugVisual();
        this._mesh.visible = this.debug;
        if (!this.debug) return;

        const ctx = this._ctx;
        const csX = this.cellSizeX * this.pxPerMeter;
        const csZ = this.cellSizeZ * this.pxPerMeter;
        const w = this._canvas.width, h = this._canvas.height;
        ctx.clearRect(0, 0, w, h);

        // Linhas mais claras a cada célula, sobre o verde escuro do campo
        // (que fica por baixo — este canvas é transparente).
        ctx.strokeStyle = 'rgba(200, 255, 210, 0.22)';
        ctx.lineWidth = 1;
        for (let ix = 0; ix <= this.cols; ix++) {
            ctx.beginPath(); ctx.moveTo(ix * csX, 0); ctx.lineTo(ix * csX, h); ctx.stroke();
        }
        for (let iz = 0; iz <= this.rows; iz++) {
            ctx.beginPath(); ctx.moveTo(0, iz * csZ, 0); ctx.lineTo(w, iz * csZ); ctx.stroke();
        }

        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Só o TEXTO gira (90° anti-horário pedido), a malha fica alinhada
        // com o campo. Um único sítio pra ajustar o sinal se sair invertido.
        const textAngle = -Math.PI / 2;

        for (let iz = 0; iz < this.rows; iz++) {
            for (let ix = 0; ix < this.cols; ix++) {
                // Linha 0 do canvas = topo = -Z no mundo (plano roda -90° em
                // X); inverte a linha pra bater com o campo.
                const linha = this.rows - 1 - iz;
                const px = ix * csX + csX / 2;
                const py = linha * csZ + csZ / 2;

                const cx = this.minX + (ix + 0.5) * this.cellSizeX;
                const cz = this.minZ + (iz + 0.5) * this.cellSizeZ;

                const passA = this.layerValueAt('pass', cx, cz, 'TeamA');
                const passB = this.layerValueAt('pass', cx, cz, 'TeamB');
                const markA = this.layerValueAt('marking', cx, cz, 'TeamA');
                const markB = this.layerValueAt('marking', cx, cz, 'TeamB');
                const shotA = this.layerValueAt('chute', cx, cz, 'TeamA');
                const shotB = this.layerValueAt('chute', cx, cz, 'TeamB');
                const crossA = this.layerValueAt('cruzamento', cx, cz, 'TeamA');
                const crossB = this.layerValueAt('cruzamento', cx, cz, 'TeamB');

                const l1 = 'PASS | R:' + passB + ', B:' + passA;
                const l2 = 'MARK | R:' + markB + ', B:' + markA;
                const l3 = 'SHOT | R:' + shotB + ', B:' + shotA;
                const l4 = 'CROSS| R:' + crossB + ', B:' + crossA;

                ctx.save();
                ctx.translate(px, py);
                ctx.rotate(textAngle);

                ctx.fillStyle = 'rgba(0,0,0,0.55)';
                ctx.fillText(l1, 0.6, -csZ * 0.33 + 0.6);
                ctx.fillText(l2, 0.6, -csZ * 0.11 + 0.6);
                ctx.fillText(l3, 0.6, csZ * 0.11 + 0.6);
                ctx.fillText(l4, 0.6, csZ * 0.33 + 0.6);
                ctx.fillStyle = 'rgba(235,255,235,0.92)';
                ctx.fillText(l1, 0, -csZ * 0.33);
                ctx.fillText(l2, 0, -csZ * 0.11);
                ctx.fillText(l3, 0, csZ * 0.11);
                ctx.fillText(l4, 0, csZ * 0.33);

                ctx.restore();
            }
        }

        this._tex.needsUpdate = true;
    },

    setDebug: function (on) {
        this.debug = on;
        if (!this._mesh) this.buildDebugVisual();
        this._mesh.visible = on;
        if (on) this.updateDebugVisual();
    }
};
