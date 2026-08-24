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
        /*
        Uma coordenada inválida (NaN, Infinity) atravessava os clamps — 
        `Math.max(0, Math.min(24, NaN))` é NaN — e chegava ao `cells[NaN]`, que
        é undefined: um único jogador com a posição estragada derrubava o loop
        de render inteiro. Cai no centro do campo, que é errado mas visível e
        recuperável, em vez de rebentar.
        */
        if (!Number.isFinite(x) || !Number.isFinite(z)) {
            return { ix: (this.cols / 2) | 0, iz: (this.rows / 2) | 0 };
        }
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
        }
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
    }
};
