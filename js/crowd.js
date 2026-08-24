/*
=============================================================================
CROWD — 15 000 adeptos sentados, com o modelo dos jogadores
=============================================================================
O público era um boneco simplificado próprio (`createSpectatorGeometry`, seis
caixas fundidas numa peça só e uma cor por adepto). Aqui usa-se o MODELO DOS
JOGADORES — o mesmo `buildBody`, na pose sentada.

O PROBLEMA, e como se resolve: um InstancedMesh tem uma geometria e um
material, e `setColorAt` dá UMA cor por instância. O modelo do jogador tem
quatro cores independentes (pele, camisa, calção, cabelo), portanto não cabe
num InstancedMesh só.

    A solução é um InstancedMesh POR CANAL DE COR.

Fundem-se as peças do corpo em quatro geometrias — as de pele numa, as de
camisa noutra, e assim — e criam-se quatro InstancedMesh com a MESMA matriz por
instância. Cada um leva a sua cor: o adepto 7 tem a camisa vermelha no mesh das
camisas e a pele morena no mesh das peles, e as quatro peças coincidem no
espaço porque partilham a matriz.

Custo: 4 draw calls para 15 000 adeptos, e a geometria é construída UMA vez.

A POSE SENTADA é assada na geometria. Não há hierarquia nem rig por adepto —
monta-se um esqueleto temporário de Object3D, poem-se-lhe as rotações de quem
está sentado, deixa-se o THREE calcular as matrizes de mundo, e cada caixa é
transformada por essa matriz antes de ser fundida. A hierarquia existe só
durante a construção e é deitada fora.

Tudo estático: sem animação, sem update por frame.
=============================================================================
*/

const CrowdModel = {
    total: 15000,

    /*
    Cores das duas claques, iguais às camisolas das equipas (ver createTeams em
    match.js): TeamA de azul, TeamB de vermelho.
    */
    equipas: {
        A: { camisa: '#3498db', calcao: '#34495e' },
        B: { camisa: '#e74c3c', calcao: '#ffffff' }
    },

    /*
    DISTRIBUIÇÃO: uma claque de cada lado e mescla no meio.

    `fracaoPura` é a fatia de cada ponta onde a bancada é toda de uma cor; o
    que sobra no meio é a faixa mesclada, onde a probabilidade transita de uma
    claque para a outra. Sem a transição via-se uma fronteira a direito no meio
    da bancada, que não é como um estádio se enche.
    */
    fracaoPura: 0.35,

    // Tons de pele e de cabelo, sorteados por adepto.
    peles: ['#f5cba7', '#e8b98a', '#c68642', '#8d5524', '#5c3317', '#ffdbac'],
    cabelos: ['#2f2f2f', '#1a1a1a', '#5b3a1e', '#8b5a2b', '#c9a227', '#eeeeee', '#7a4a2b'],

    /*
    Variação por adepto: sem isto 15 000 bonecos com a mesma cor exacta leem-se
    como um padrão impresso, não como gente. Multiplica-se a cor por um factor
    à volta de 1.
    */
    variacaoCor: 0.14,

    // Altura: nem toda a gente tem o mesmo tamanho.
    escalaMin: 0.88,
    escalaMax: 1.06,

    // Quanto o adepto pode rodar em relação à frente do lugar, em radianos.
    variacaoRotacao: 0.25,

    /*
    POSE SENTADA, em radianos. A coxa vai quase à horizontal e o joelho
    devolve a canela à vertical: `anca` e `joelho` são simétricos de propósito,
    e é isso que põe o pé por baixo do joelho em vez de à frente dele.
    */
    pose: {
        anca: -1.45,
        joelho: 1.45,
        tronco: 0.12,
        ombro: -0.35,
        cotovelo: 0.85,
        // Onde a bacia fica em relação ao lugar, em unidades do modelo.
        alturaBacia: 1.55
    }
};

const Crowd = {
    _meshes: null,

    /*
    Constrói o esqueleto temporário na pose sentada e devolve as peças já
    transformadas para o espaço do modelo, agrupadas por canal de cor.

    Devolve { pele: [geo...], camisa: [...], calcao: [...], cabelo: [...] }.
    */
    _pecasSentadas() {
        const u = 1.0;
        const P = CrowdModel.pose;
        const canais = { pele: [], camisa: [], calcao: [], cabelo: [] };

        const raiz = new THREE.Object3D();

        // Cada peça é uma caixa pendurada num Object3D; o `add` devolve o nó
        // para se lhe pendurarem filhos.
        const no = (pai, x, y, z) => {
            const o = new THREE.Object3D();
            o.position.set(x, y, z);
            pai.add(o);
            return o;
        };
        const caixa = (pai, canal, w, h, d, x, y, z) => {
            const g = new THREE.BoxGeometry(w, h, d);
            g.translate(x, y, z);
            canais[canal].push({ geo: g, no: pai });
        };

        /* --- bacia e tronco ------------------------------------------- */
        const pelvis = no(raiz, 0, P.alturaBacia, 0);
        caixa(pelvis, 'pele', u * 1.3, u * 0.6, u * 0.8, 0, 0, 0);
        caixa(pelvis, 'calcao', u * 1.35, u * 0.65, u * 0.85, 0, 0, 0);

        const chest = no(pelvis, 0, 0.9, 0);
        chest.rotation.x = P.tronco;
        caixa(chest, 'pele', u * 1.4, u * 1.45, u * 0.75, 0, 0.125, 0);
        caixa(chest, 'camisa', u * 1.45, u * 1.5, u * 0.8, 0, 0.125, 0);

        const neck = no(chest, 0, 0.8, 0);
        caixa(neck, 'pele', u * 0.35, u * 0.15, u * 0.35, 0, 0, 0);

        const head = no(neck, 0, 0.575, 0);
        caixa(head, 'pele', u * 0.8, u * 1.0, u * 0.85, 0, 0, 0);
        // Cabelo: as cinco peças do modelo do jogador.
        caixa(head, 'cabelo', u * 0.88, u * 0.25, u * 0.9, 0, u * 0.5, 0);
        caixa(head, 'cabelo', u * 0.88, u * 0.7, u * 0.25, 0, u * 0.15, -u * 0.35);
        caixa(head, 'cabelo', u * 0.15, u * 0.6, u * 0.65, -u * 0.4, u * 0.2, -u * 0.1);
        caixa(head, 'cabelo', u * 0.15, u * 0.6, u * 0.65, u * 0.4, u * 0.2, -u * 0.1);
        caixa(head, 'cabelo', u * 0.88, u * 0.15, u * 0.2, 0, u * 0.45, u * 0.38);

        /* --- braços ---------------------------------------------------- */
        for (const lado of [-1, 1]) {
            const ombro = no(chest, lado * 0.8, 0.525, 0);
            ombro.rotation.x = P.ombro;
            caixa(ombro, 'pele', u * 0.35, u * 1.0, u * 0.35, 0, -0.5, 0);
            caixa(ombro, 'camisa', u * 0.4, u * 0.5, u * 0.4, 0, -0.25, 0);

            const cotovelo = no(ombro, 0, -1.0, 0);
            cotovelo.rotation.x = P.cotovelo;
            caixa(cotovelo, 'pele', u * 0.3, u * 0.8, u * 0.3, 0, -0.4, 0);
            caixa(cotovelo, 'pele', u * 0.35, u * 0.4, u * 0.2, 0, -0.9, 0);
        }

        /* --- pernas ---------------------------------------------------- */
        for (const lado of [-1, 1]) {
            const anca = no(pelvis, lado * 0.4, -0.3, 0);
            anca.rotation.x = P.anca;
            caixa(anca, 'pele', u * 0.45, u * 1.0, u * 0.45, 0, -0.5, 0);
            caixa(anca, 'calcao', u * 0.5, u * 0.5, u * 0.5, 0, -0.25, 0);

            const joelho = no(anca, 0, -1.0, 0);
            joelho.rotation.x = P.joelho;
            caixa(joelho, 'pele', u * 0.35, u * 0.9, u * 0.35, 0, -0.45, 0);
            // Pé, em pele escura (as chuteiras do modelo não valem a pena a
            // esta distância — um canal a mais por um par de caixas).
            caixa(joelho, 'pele', u * 0.4, u * 0.25, u * 0.7, 0, -1.0, u * 0.2);
        }

        raiz.updateWorldMatrix(true, true);

        // Aplica a matriz de mundo de cada nó à respectiva caixa e devolve só
        // as geometrias, já no espaço do modelo.
        const saida = {};
        for (const canal in canais) {
            saida[canal] = canais[canal].map(({ geo, no }) => {
                no.updateWorldMatrix(true, false);
                return geo.toNonIndexed().applyMatrix4(no.matrixWorld);
            });
        }
        return saida;
    },

    /*
    Geometrias finais por canal, já à escala do jogo e com a base no lugar.

    A escala é a mesma do `buildBody` — (1.8 / 5.5) * 0.9 — para o adepto ter o
    tamanho de um jogador.
    */
    geometrias() {
        const pecas = this._pecasSentadas();
        const escala = (1.8 / 5.5) * 0.9;
        const saida = {};
        for (const canal in pecas) {
            if (!pecas[canal].length) continue;
            const g = mergeNonIndexedGeometries(pecas[canal]);
            g.scale(escala, escala, escala);
            saida[canal] = g;
        }
        return saida;
    },

    /*
    Qual das claques neste ponto da bancada.

    `t` é 0 numa ponta do estádio e 1 na outra. As pontas são puras; no meio a
    probabilidade transita, e é aí que as duas claques se misturam.
    */
    claqueEm(t, rnd) {
        const f = CrowdModel.fracaoPura;
        if (t <= f) return 'A';
        if (t >= 1 - f) return 'B';
        // Faixa do meio: transição linear de A para B.
        const k = (t - f) / Math.max(1e-6, 1 - 2 * f);
        return (rnd() < k) ? 'B' : 'A';
    },

    /*
    Constrói a multidão nos `lugares` dados — `{ x, y, z, rotY }`, recolhidos
    de quem constrói as bancadas.

    `t` para a mescla sai do Z do lugar: as duas pontas do estádio são as duas
    claques. É o eixo longo, o mesmo onde o campo tem as balizas.
    */
    build(scene, lugares) {
        if (!lugares || !lugares.length) return null;

        const geos = this.geometrias();
        const canais = Object.keys(geos);
        const n = Math.min(CrowdModel.total, lugares.length);

        const dummy = new THREE.Object3D();
        const cor = new THREE.Color();
        const meshes = {};

        for (const canal of canais) {
            const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.0 });
            const m = new THREE.InstancedMesh(geos[canal], mat, n);
            m.castShadow = false;
            m.receiveShadow = false;
            // Estáticos: o THREE não tem de reenviar as matrizes por frame.
            m.instanceMatrix.setUsage(THREE.StaticDrawUsage);
            meshes[canal] = m;
        }

        /*
        Gerador com semente: a multidão tem de ser a MESMA em cada arranque.
        Com `Math.random` o estádio mudava de cor a cada refresh, e qualquer
        comparação visual entre duas execuções passava a ser impossível.
        */
        let semente = 20260824;
        const rnd = () => {
            semente = (semente * 1103515245 + 12345) & 0x7fffffff;
            return semente / 0x7fffffff;
        };

        // Extremos em Z, para saber onde ficam as duas pontas do estádio.
        let zMin = Infinity, zMax = -Infinity;
        for (const l of lugares) { if (l.z < zMin) zMin = l.z; if (l.z > zMax) zMax = l.z; }
        const spanZ = Math.max(1e-6, zMax - zMin);

        // Baralha os lugares, para os que sobram (quando há mais lugares do
        // que adeptos) ficarem espalhados em vez de concentrados numa ponta.
        const ordem = lugares.map((_, i) => i);
        for (let i = ordem.length - 1; i > 0; i--) {
            const j = Math.floor(rnd() * (i + 1));
            const tmp = ordem[i]; ordem[i] = ordem[j]; ordem[j] = tmp;
        }

        const variar = (hex) => {
            cor.set(hex);
            const k = 1 + (rnd() - 0.5) * 2 * CrowdModel.variacaoCor;
            cor.multiplyScalar(k);
            return cor;
        };

        for (let i = 0; i < n; i++) {
            const l = lugares[ordem[i]];
            const t = (l.z - zMin) / spanZ;
            const eq = CrowdModel.equipas[this.claqueEm(t, rnd)];

            const escala = CrowdModel.escalaMin +
                rnd() * (CrowdModel.escalaMax - CrowdModel.escalaMin);

            dummy.position.set(l.x, l.y, l.z);
            dummy.rotation.set(0, l.rotY + (rnd() - 0.5) * 2 * CrowdModel.variacaoRotacao, 0);
            dummy.scale.set(escala, escala, escala);
            dummy.updateMatrix();

            for (const canal of canais) meshes[canal].setMatrixAt(i, dummy.matrix);

            meshes.camisa && meshes.camisa.setColorAt(i, variar(eq.camisa));
            meshes.calcao && meshes.calcao.setColorAt(i, variar(eq.calcao));
            meshes.pele && meshes.pele.setColorAt(i,
                variar(CrowdModel.peles[Math.floor(rnd() * CrowdModel.peles.length)]));
            meshes.cabelo && meshes.cabelo.setColorAt(i,
                variar(CrowdModel.cabelos[Math.floor(rnd() * CrowdModel.cabelos.length)]));
        }

        for (const canal of canais) {
            meshes[canal].instanceMatrix.needsUpdate = true;
            if (meshes[canal].instanceColor) meshes[canal].instanceColor.needsUpdate = true;
            meshes[canal].count = n;
            scene.add(meshes[canal]);
        }

        /*
        Diz quantos adeptos entraram mesmo. Se o estádio tiver menos lugares do
        que `CrowdModel.total`, a multidão fica pelo número de lugares — e sem
        isto isso passava despercebido, com o estádio a parecer meio vazio sem
        se saber porquê.
        */
        if (typeof console !== 'undefined' && console.log) {
            console.log(`Crowd: ${n} adeptos em ${lugares.length} lugares ` +
                `(pedidos ${CrowdModel.total}), ${canais.length} InstancedMesh`);
        }

        this._meshes = meshes;
        return meshes;
    },

    setVisivel(on) {
        if (!this._meshes) return;
        for (const canal in this._meshes) this._meshes[canal].visible = on;
    }
};
