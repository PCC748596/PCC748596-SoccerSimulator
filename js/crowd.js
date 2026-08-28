/*
=============================================================================
CROWD — 10 000 adeptos com o modelo dos jogadores, que reagem ao jogo
=============================================================================
O público era um boneco simplificado próprio (`createSpectatorGeometry`, seis
caixas fundidas numa peça só e uma cor por adepto). Aqui usa-se o MODELO DOS
JOGADORES — o mesmo `buildBody`, em quatro poses.

O PROBLEMA DA COR, e como se resolve: um InstancedMesh tem uma geometria e um
material, e `setColorAt` dá UMA cor por instância. O modelo do jogador tem
quatro cores independentes (pele, camisa, calção, cabelo), portanto não cabe
num InstancedMesh só.

    A solução é um InstancedMesh POR CANAL DE COR.

Fundem-se as peças do corpo em quatro geometrias — as de pele numa, as de
camisa noutra, e assim — e criam-se quatro InstancedMesh com a MESMA matriz por
instância. Cada um leva a sua cor: o adepto 7 tem a camisa vermelha no mesh das
camisas e a pele morena no mesh das peles, e as quatro peças coincidem no
espaço porque partilham a matriz.

Custo: 4 draw calls para 10 000 adeptos, e a geometria é construída UMA vez.

-----------------------------------------------------------------------------
O PROBLEMA DO MOVIMENTO, e como se resolve
-----------------------------------------------------------------------------
As poses são ASSADAS na geometria. Não há hierarquia nem rig por adepto —
monta-se um esqueleto temporário de Object3D, poem-se-lhe as rotações da pose,
deixa-se o THREE calcular as matrizes de mundo, e cada caixa é transformada por
essa matriz antes de ser fundida. A hierarquia existe só durante a construção e
é deitada fora.

Sem rig não há como animar do lado da CPU sem reescrever as matrizes de
instância — 10 000 × 4 malhas = 40 000 `setMatrixAt` por frame. Está fora de
questão.

    TODO O MOVIMENTO VIVE NO VERTEX SHADER.

A mesma função de construção é chamada QUATRO vezes, com quatro dicionários de
ângulos: sentado, idle, de pé e a festejar. Como são as mesmas caixas pela
mesma ordem, os vértices correspondem 1:1 entre as quatro — servem de morph
target directo. A geometria leva `position` (sentado) e mais três atributos de
vértice com as outras poses, e o shader interpola.

    ISTO É A INVARIANTE QUE PARTE TUDO SE FOR QUEBRADA: as quatro poses têm de
    dar EXACTAMENTE o mesmo número de vértices por canal. Se divergirem, o
    morph lê fora do sítio e os adeptos explodem em picos. Ver
    tests/crowd_vida.test.js.

Quem está de pé sai de uma COMPARAÇÃO no shader, não de um valor guardado por
instância: cada adepto tem um limiar fixo, e levanta-se se o limiar for menor
que a fracção que a claque tem no momento. Assim mudar de "ninguém de pé" para
"metade de pé" custa DOIS uniforms, não 10 000 escritas. As matrizes de
instância nunca mudam e continuam `StaticDrawUsage`.

Repouso, expectativa e golo são o MESMO mecanismo com três valores de fracção.
Não há casos especiais.
=============================================================================
*/

const CrowdModel = {
    total: 10000,

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
    Variação por adepto: sem isto 10 000 bonecos com a mesma cor exacta leem-se
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
    AS QUATRO POSES, em radianos.

    `sentado` é a base — é o `position` da geometria. A coxa vai quase à
    horizontal e o joelho devolve a canela à vertical: `anca` e `joelho` são
    simétricos de propósito, e é isso que põe o pé por baixo do joelho em vez
    de à frente dele.

    `alturaBacia` é onde a bacia fica em relação ao lugar, em unidades do
    modelo. Nas poses de pé sobe para 2.40 — com as pernas esticadas a bacia
    fica 2.3 unidades acima dos pés, e é isso que mantém os pés à altura a que
    já estavam sentados, em vez de o adepto afundar no degrau.

    `festa` roda o ombro para lá da vertical (-2.85 rad, mais de 160°), que é o
    que leva os braços acima da cabeça.
    */
    poses: {
        sentado: {
            anca: -1.45, joelho: 1.45, tronco: 0.12,
            ombro: -0.35, cotovelo: 0.85, alturaBacia: 1.55
        },
        /*
        `idle` é o sentado com o tronco mais à frente e os braços um pouco
        recolhidos. É o outro extremo da oscilação de repouso — ninguém no
        estádio fica alguma vez completamente imóvel.
        */
        idle: {
            anca: -1.45, joelho: 1.45, tronco: 0.26,
            ombro: -0.20, cotovelo: 1.05, alturaBacia: 1.53
        },
        dePe: {
            anca: 0.0, joelho: 0.0, tronco: 0.04,
            ombro: -0.15, cotovelo: 0.25, alturaBacia: 2.40
        },
        festa: {
            anca: 0.0, joelho: 0.0, tronco: -0.06,
            ombro: -2.85, cotovelo: 0.35, alturaBacia: 2.40
        }
    },

    /*
    ANIMAÇÃO. Tudo isto vai para uniforms; nada disto se lê por frame na CPU.

    `duracaoTransicao` é o tempo que um adepto leva a levantar-se ou a
    sentar-se. `amplitudeIdle` é quanto da pose `idle` entra na oscilação de
    repouso — 1.0 iria da pose sentada à idle e de volta, o que é exagerado.
    `bobDePe` é a oscilação vertical de quem está de pé à espera: pequena, só
    para não parecer um poste. `salto` é o do golo.
    */
    duracaoTransicao: 0.55,
    amplitudeIdle: 0.35,
    ritmoIdle: 1.6,
    bobDePe: 0.06,
    salto: 0.42,
    ritmoSalto: 7.0,

    /*
    AS TRÊS FRACÇÕES. É a fatia da claque que está de pé em cada situação.

    `repouso` não é zero de propósito: num estádio a sério há sempre gente de
    pé — a chegar, a sair, a bater palmas. A zero a bancada lia-se como uma
    plateia de teatro.
    */
    fraccaoRepouso: 0.08,
    fraccaoAtaque: 0.50,
    fraccaoGolo: 1.00,

    /*
    OS ULTRAS — a fatia que salta SEMPRE, jogo parado ou não.

    As três fracções acima descrevem uma bancada que reage ao lance, e o lance
    quase nunca chega ao terço ofensivo (1,7% do tempo, medido): sem isto a
    bancada passa o jogo inteiro quieta, que é o que se via no ecrã.

    Estes não esperam por nada. Saem do MESMO limiar por adepto que decide
    quem se levanta, passado por um `fract(x * 7.3)` — descorrelacionar é o
    ponto: sem isso os saltadores seriam exactamente os de limiar mais baixo,
    isto é, os primeiros a levantar-se, e ficariam todos amontoados na mesma
    zona da bancada em vez de espalhados por ela.

    Não custa attribute nenhum (o orçamento está em 13 de 16) nem escrita por
    frame: é mais um uniform, comparado no shader.
    */
    fraccaoSaltoSempre: 0.10,

    /*
    GATILHO DO ATAQUE. A claque levanta-se quando a equipa tem a posse e a bola
    entrou no terço ofensivo dela. `tercoZ` é a fronteira desse terço: o campo
    tem 106 m, portanto o terço final começa a 106/6 do meio-campo.

    A HISTERESE existe porque a bola passa a linha do terço para trás e para a
    frente numa disputa, e sem ela a bancada pisca. Entrar é rápido (o lance
    perigoso não espera), sair é lento, e uma vez de pé fica-se de pé um tempo
    mínimo.
    */
    tercoZ: 106 / 6,
    entradaMin: 0.4,
    saidaMin: 1.5,
    permanenciaMin: 2.0
};

/*
=============================================================================
CROWDTRIGGER — que fracção de cada claque está de pé
=============================================================================
Função pura, sem Three.js lá dentro: recebe o que o Match já sabe e devolve as
duas fracções. Fica separada do resto para se poder testar sem GPU — é aqui que
vivem as regras, e regras erradas são o que se nota no ecrã.

O estado é só o dos temporizadores da histerese. `reset()` limpa-o.
=============================================================================
*/
const CrowdTrigger = {
    // Um por equipa: se está a atacar, há quanto tempo a condição se mantém, e
    // há quanto tempo o estado actual dura.
    _estado: null,

    reset() {
        this._estado = {
            TeamA: { ativo: false, tCond: 0, tEstado: 999 },
            TeamB: { ativo: false, tCond: 0, tEstado: 999 }
        };
        return this;
    },

    /*
    A equipa ataca para que lado? `zSinal < 0` é a baliza do TeamA (ver a
    detecção de golo em match.js), portanto o TeamA ataca para z positivo.
    */
    noTercoOfensivo(team, bolaZ) {
        return team === 'TeamA'
            ? bolaZ > CrowdModel.tercoZ
            : bolaZ < -CrowdModel.tercoZ;
    },

    /*
    Aplica a histerese a uma equipa e devolve se ela conta como "a atacar".

    Três tempos, e a ordem em que se testam importa: primeiro a permanência
    (uma vez de pé fica-se), depois a saída, depois a entrada.
    */
    _histerese(team, condicao, dt) {
        const e = this._estado[team];
        e.tEstado += dt;
        e.tCond = (condicao === e.ativo) ? 0 : e.tCond + dt;

        if (e.ativo) {
            if (!condicao &&
                e.tEstado >= CrowdModel.permanenciaMin &&
                e.tCond >= CrowdModel.saidaMin) {
                e.ativo = false; e.tEstado = 0; e.tCond = 0;
            }
        } else if (condicao && e.tCond >= CrowdModel.entradaMin) {
            e.ativo = true; e.tEstado = 0; e.tCond = 0;
        }
        return e.ativo;
    },

    /*
    `dados`: { estado, posse, bolaZ, equipaQueMarcou, dt }.

    Devolve { A, B, festa }, com as fracções por CLAQUE (a claque A é a do
    TeamA) e qual delas festeja, se alguma.
    */
    avaliar(dados) {
        if (!this._estado) this.reset();
        const dt = dados.dt || 0;

        /*
        GOLO salta a histerese. Não faz sentido esperar 0.4 s para uma bancada
        reagir a um golo, e o estado 'GOAL' dura até a bola voltar ao centro,
        portanto não pisca.
        */
        if (dados.estado === 'GOAL' && dados.equipaQueMarcou) {
            // O golo interrompe qualquer ataque em curso: quando o jogo
            // recomeçar, ninguém fica de pé por inércia de um lance que já era.
            this.reset();
            const marcouA = dados.equipaQueMarcou === 'TeamA';
            return {
                A: marcouA ? CrowdModel.fraccaoGolo : 0,
                B: marcouA ? 0 : CrowdModel.fraccaoGolo,
                festa: marcouA ? 'A' : 'B'
            };
        }

        const posse = dados.posse;
        const bolaZ = dados.bolaZ || 0;
        const saida = { A: CrowdModel.fraccaoRepouso, B: CrowdModel.fraccaoRepouso, festa: null };

        for (const team of ['TeamA', 'TeamB']) {
            const condicao = (posse === team) && this.noTercoOfensivo(team, bolaZ);
            if (this._histerese(team, condicao, dt)) {
                saida[team === 'TeamA' ? 'A' : 'B'] = CrowdModel.fraccaoAtaque;
            }
        }
        return saida;
    }
};

const Crowd = {
    _meshes: null,
    _uniforms: null,
    _tempo: 0,
    // Fracção actual por claque, para se saber quando mudou.
    _frac: { A: -1, B: -1 },

    /*
    Constrói o esqueleto temporário na pose dada e devolve as peças já
    transformadas para o espaço do modelo, agrupadas por canal de cor.

    `pose` é um dos dicionários de `CrowdModel.poses`. A estrutura das caixas
    NÃO depende da pose — só as rotações dependem — e é isso que garante a
    correspondência 1:1 dos vértices entre poses.

    Devolve { pele: [geo...], camisa: [...], calcao: [...], cabelo: [...] }.
    */
    _pecas(pose) {
        const u = 1.0;
        const P = pose || CrowdModel.poses.sentado;
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

    // Nome antigo, mantido para quem já o chamava.
    _pecasSentadas() { return this._pecas(CrowdModel.poses.sentado); },

    /*
    Uma geometria fundida por canal, para UMA pose, já à escala do jogo.

    A escala é a mesma do `buildBody` — (1.8 / 5.5) * 0.9 — para o adepto ter o
    tamanho de um jogador.
    */
    _geometriasDaPose(pose) {
        const pecas = this._pecas(pose);
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
    Geometrias finais por canal: a pose sentada em `position`/`normal`, e as
    outras três penduradas como atributos de vértice, para o shader interpolar.

    As poses extra são descartadas depois de se lhes copiar os arrays — o que
    vai para a GPU é uma geometria por canal, não quatro.
    */
    geometrias() {
        const base = this._geometriasDaPose(CrowdModel.poses.sentado);
        const extras = {
            Idle: this._geometriasDaPose(CrowdModel.poses.idle),
            DePe: this._geometriasDaPose(CrowdModel.poses.dePe),
            Festa: this._geometriasDaPose(CrowdModel.poses.festa)
        };

        for (const canal in base) {
            const n = base[canal].attributes.position.count;
            for (const nome in extras) {
                const g = extras[nome][canal];
                /*
                A INVARIANTE. Se as contagens divergirem o morph lê fora do
                sítio; mais vale gritar aqui do que descobrir no ecrã.
                */
                if (!g || g.attributes.position.count !== n) {
                    throw new Error(`Crowd: a pose ${nome} tem ` +
                        `${g ? g.attributes.position.count : 0} vértices no canal ` +
                        `${canal}, e a sentada tem ${n}`);
                }
                base[canal].setAttribute('aPos' + nome,
                    new THREE.BufferAttribute(g.attributes.position.array, 3));
                /*
                A pose idle não leva normal: só inclina o tronco uns graus, e a
                normal da pose sentada serve. Cada attribute custa um dos 16
                slots do hardware, e este era o mais fácil de dispensar.
                */
                if (nome !== 'Idle') {
                    base[canal].setAttribute('aNor' + nome,
                        new THREE.BufferAttribute(g.attributes.normal.array, 3));
                }
            }
        }
        return base;
    },

    /*
    Qual das claques neste ponto da bancada.

    `t` é 0 numa ponta do estádio e 1 na outra. As pontas são puras; no meio a
    probabilidade transita, e é aí que as duas claques se misturam.

    QUE LADO É DE QUEM: `t = 0` é o z mais negativo, que é onde está a baliza
    do TeamA (`ownGoalZ = -(CAMPO_COMP/2) * dirZ`, com dirZ +1 para o TeamA).
    Lá fica a claque **B** — cada claque senta-se atrás da baliza que a sua
    equipa ATACA, e não atrás da que defende, que é o que se vê no ecrã.
    */
    claqueEm(t, rnd) {
        const f = CrowdModel.fracaoPura;
        if (t <= f) return 'B';
        if (t >= 1 - f) return 'A';
        // Faixa do meio: transição linear de B para A.
        const k = (t - f) / Math.max(1e-6, 1 - 2 * f);
        return (rnd() < k) ? 'A' : 'B';
    },

    /*
    Os uniforms, partilhados pelos quatro materiais — um adepto tem de estar na
    mesma pose nos quatro canais, e a maneira mais segura de garantir isso é os
    quatro shaders lerem os MESMOS objectos.

    Os vectores por claque são `[A, B]`, indexados pelo `aAdepto.w` da instância.
    */
    _criarUniforms() {
        return {
            uTempo: { value: 0 },
            uDurTransicao: { value: CrowdModel.duracaoTransicao },
            uAmpIdle: { value: CrowdModel.amplitudeIdle },
            uRitmoIdle: { value: CrowdModel.ritmoIdle },
            uBobDePe: { value: CrowdModel.bobDePe },
            uSalto: { value: CrowdModel.salto },
            uRitmoSalto: { value: CrowdModel.ritmoSalto },
            uFracSalto: { value: CrowdModel.fraccaoSaltoSempre },
            uFracAnt: { value: new THREE.Vector2(0, 0) },
            uFracNova: { value: new THREE.Vector2(0, 0) },
            uTempoTroca: { value: new THREE.Vector2(-99, -99) },
            uFesta: { value: new THREE.Vector2(0, 0) }
        };
    },

    /*
    Enxerta o morph e a animação no MeshStandardMaterial.

    O ORÇAMENTO DE ATTRIBUTES É 16, e é apertado. Cada `attribute` ocupa um
    slot, e a `instanceMatrix` sozinha come QUATRO (é uma mat4); com
    `instanceColor`, `position` e `normal` já vão sete antes de eu escrever a
    primeira linha. Os quatro valores por adepto vão por isso num `vec4` só, e
    a pose idle não tem normal própria. Passar dos 16 dá
    `Too many attributes` no link do programa e o público desaparece — já
    aconteceu. Ver o teste do orçamento em tests/crowd_vida.test.js.

    O GLSL AQUI DENTRO É ASCII, comentários incluídos. O código-fonte de GLSL
    ES 1.00 é ASCII, e o compilador do Windows (ANGLE) recusa qualquer byte
    fora disso — um `ç` num comentário chega para o programa não compilar e as
    quatro malhas do público desaparecerem do ecrã, com o resto da cena
    intacto. Já aconteceu; ver o teste do ASCII em tests/crowd_vida.test.js.

    Porquê `onBeforeCompile` e não um ShaderMaterial próprio: o material padrão
    já traz luzes, sombras, fog e — o que aqui interessa mesmo — o suporte de
    `instanceColor`, que é o que dá a cada adepto a sua cor. Reescrever isso à
    mão era trocar quatro linhas de patch por umas centenas de GLSL.
    */
    _aplicarShader(mat, uniforms) {
        mat.onBeforeCompile = (shader) => {
            for (const k in uniforms) shader.uniforms[k] = uniforms[k];

            const prefixo = `
attribute vec3 aPosIdle;
attribute vec3 aPosDePe;
attribute vec3 aPosFesta;
attribute vec3 aNorDePe;
attribute vec3 aNorFesta;
// Os quatro valores por adepto num vec4 e nao em quatro floats: cada
// attribute ocupa um slot dos 16 que o hardware da, e a instanceMatrix
// sozinha come quatro. Ver o comentario em _aplicarShader.
// x = limiar, y = fase, z = ritmo, w = claque (0 = A, 1 = B).
attribute vec4 aAdepto;
uniform float uTempo;
uniform float uDurTransicao;
uniform float uAmpIdle;
uniform float uRitmoIdle;
uniform float uBobDePe;
uniform float uSalto;
uniform float uRitmoSalto;
uniform float uFracSalto;
uniform vec2 uFracAnt;
uniform vec2 uFracNova;
uniform vec2 uTempoTroca;
uniform vec2 uFesta;

// Pesos deste adepto neste instante. Usados pela posicao E pela normal, que
// tem de andar juntas: senao o sombreamento denuncia a pose antiga.
// (Comentarios sem acentos de proposito: o GLSL e ASCII, ver _aplicarShader.)
void crowdPesos(out float dePe, out float w1, out float w2,
                out float osc, out float festa) {
    bool claqueA = aAdepto.w < 0.5;
    float fAnt = claqueA ? uFracAnt.x : uFracAnt.y;
    float fNova = claqueA ? uFracNova.x : uFracNova.y;
    float tTroca = claqueA ? uTempoTroca.x : uTempoTroca.y;
    festa = claqueA ? uFesta.x : uFesta.y;

    // O estado sai de uma comparacao com o limiar fixo do adepto: e isso que
    // deixa mudar a bancada inteira com dois uniforms.
    float antes = step(aAdepto.x, fAnt);
    float depois = step(aAdepto.x, fNova);
    float k = clamp((uTempo - tTroca) / max(uDurTransicao, 0.0001), 0.0, 1.0);
    dePe = mix(antes, depois, smoothstep(0.0, 1.0, k));

    // OS ULTRAS: saltam sempre, sem esperar pelo lance. O limiar passa por um
    // fract para nao serem os mesmos que se levantam primeiro: senao ficavam
    // amontoados numa zona so. Estao de pe por definicao: nao se salta
    // sentado.
    float ultra = step(fract(aAdepto.x * 7.3), uFracSalto);
    dePe = max(dePe, ultra);
    festa = max(festa, ultra);

    // s em 0..2: 0 sentado, 1 de pe, 2 a festejar.
    float s = dePe * (1.0 + festa);
    w1 = clamp(s, 0.0, 1.0);
    w2 = clamp(s - 1.0, 0.0, 1.0);

    osc = 0.5 + 0.5 * sin(uTempo * uRitmoIdle * aAdepto.z + aAdepto.y);
}
`;

            const corpoPos = `
    float dePe, w1, w2, osc, festa;
    crowdPesos(dePe, w1, w2, osc, festa);

    vec3 crowdPos = mix(position, aPosDePe, w1);
    crowdPos = mix(crowdPos, aPosFesta, w2);
    // Oscilacao de repouso: some a medida que o adepto se levanta.
    crowdPos = mix(crowdPos, aPosIdle, osc * uAmpIdle * (1.0 - w1));
    // De pe a espera: uma oscilacao vertical pequena, para nao ser um poste.
    crowdPos.y += uBobDePe * w1 * (1.0 - festa) * (osc - 0.5);
    // Salto do golo, so a quem esta de pe.
    crowdPos.y += uSalto * festa * dePe *
        abs(sin(uTempo * uRitmoSalto * aAdepto.z + aAdepto.y));

    vec3 transformed = crowdPos;
`;

            const corpoNor = `
    float nDePe, nW1, nW2, nOsc, nFesta;
    crowdPesos(nDePe, nW1, nW2, nOsc, nFesta);
    vec3 crowdNor = mix(normal, aNorDePe, nW1);
    crowdNor = mix(crowdNor, aNorFesta, nW2);
    // A pose idle nao tem normal propria: inclina o tronco uns graus e a
    // normal da pose sentada serve. Um attribute a menos, e sao contados.
    vec3 objectNormal = normalize(crowdNor);
`;

            let vs = prefixo + shader.vertexShader;
            const antes = vs;
            vs = vs.replace('#include <beginnormal_vertex>', corpoNor);
            vs = vs.replace('#include <begin_vertex>', corpoPos);

            /*
            O `onBeforeCompile` procura strings de chunks do THREE. Se um dia
            mudarem de nome, a substituição falha em SILÊNCIO e o público volta
            a ser uma fotografia, sem nada no ecrã a dizer porquê. O modo de
            falha tem de ser ruidoso.
            */
            if (vs === antes || vs.indexOf('crowdPesos(dePe') === -1) {
                console.warn('Crowd: o patch do vertex shader não pegou — ' +
                    'os chunks begin_vertex/beginnormal_vertex mudaram? ' +
                    'O público fica estático.');
                return;
            }
            shader.vertexShader = vs;
        };
        // Força recompilação se o material for reutilizado.
        mat.needsUpdate = true;
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
        
        let crowdLimit = CrowdModel.total;
        if (typeof window !== 'undefined') {
            const ponteiroGrosso = window.matchMedia
                ? window.matchMedia('(pointer: coarse)').matches
                : (('ontouchstart' in window) || navigator.maxTouchPoints > 0);
            const isTabletOrMobile = ponteiroGrosso || window.innerWidth <= 1024;
            if (isTabletOrMobile) crowdLimit = 5000;
        }
        
        const nTotal = Math.min(crowdLimit, lugares.length);

        const dummy = new THREE.Object3D();
        const cor = new THREE.Color();
        const uniforms = this._criarUniforms();

        let semente = 20260824;
        const rnd = () => {
            semente = (semente * 1103515245 + 12345) & 0x7fffffff;
            return semente / 0x7fffffff;
        };

        // Extremos em Z
        let zMin = Infinity, zMax = -Infinity;
        for (const l of lugares) { if (l.z < zMin) zMin = l.z; if (l.z > zMax) zMax = l.z; }
        const spanZ = Math.max(1e-6, zMax - zMin);

        // Baralha os lugares
        const ordem = lugares.map((_, i) => i);
        for (let i = ordem.length - 1; i > 0; i--) {
            const j = Math.floor(rnd() * (i + 1));
            const tmp = ordem[i]; ordem[i] = ordem[j]; ordem[j] = tmp;
        }

        // Corta os lugares para o total pedido (nTotal), e ORDENA POR ANGULO
        // Agrupa os lugares em 'fatias' espaciais. Assim o frustum culling de um chunk funciona!
        const lugaresEscolhidos = [];
        for (let i = 0; i < nTotal; i++) {
            lugaresEscolhidos.push(lugares[ordem[i]]);
        }
        lugaresEscolhidos.sort((a, b) => Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x));

        const variar = (hex) => {
            cor.set(hex);
            const k = 1 + (rnd() - 0.5) * 2 * CrowdModel.variacaoCor;
            cor.multiplyScalar(k);
            return cor;
        };

        // Aumenta a bounding sphere base para compensar o facto de eles se levantarem no shader
        for (const canal of canais) {
            if (!geos[canal].boundingSphere) geos[canal].computeBoundingSphere();
        }

        // 4 InstancedMesh (um por canal de cor) para o total de adeptos
        const TAMANHO_CHUNK = nTotal;
        const numChunks = Math.ceil(nTotal / TAMANHO_CHUNK);
        this._grupos = [];

        for (let c = 0; c < numChunks; c++) {
            const inicio = c * TAMANHO_CHUNK;
            const fim = Math.min(inicio + TAMANHO_CHUNK, nTotal);
            const nChunk = fim - inicio;

            // Calcular bounding sphere real do chunk
            const chunkBox = new THREE.Box3();
            for (let i = 0; i < nChunk; i++) {
                const l = lugaresEscolhidos[inicio + i];
                chunkBox.expandByPoint(new THREE.Vector3(l.x, l.y, l.z));
            }
            const chunkSphere = new THREE.Sphere();
            chunkBox.getBoundingSphere(chunkSphere);
            chunkSphere.radius += 3.0; // Dar folga para quando se levantam/festejam

            const aAdepto = new Float32Array(nChunk * 4);
            const meshes = {};

            for (const canal of canais) {
                // CLONAR A GEOMETRIA POR CHUNK!
                // Se não clonarmos, o aAdepto atributo partilhado vai sobescrever-se a cada loop, e só o último chunk é que desenha.
                const geoChunk = geos[canal].clone();
                
                geoChunk.boundingSphere = chunkSphere;

                const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.0 });
                this._aplicarShader(mat, uniforms);
                const m = new THREE.InstancedMesh(geoChunk, mat, nChunk);
                m.castShadow = false;
                m.receiveShadow = false;
                m.instanceMatrix.setUsage(THREE.StaticDrawUsage);
                
                m.frustumCulled = true;
                
                geoChunk.setAttribute('aAdepto', new THREE.InstancedBufferAttribute(aAdepto, 4));
                meshes[canal] = m;
            }

            for (let i = 0; i < nChunk; i++) {
                const l = lugaresEscolhidos[inicio + i];
                const t = (l.z - zMin) / spanZ;
                const claque = this.claqueEm(t, rnd);
                const eq = CrowdModel.equipas[claque];
                const escala = CrowdModel.escalaMin + rnd() * (CrowdModel.escalaMax - CrowdModel.escalaMin);

                dummy.position.set(l.x, l.y, l.z);
                dummy.rotation.set(0, l.rotY + (rnd() - 0.5) * 2 * CrowdModel.variacaoRotacao, 0);
                dummy.scale.set(escala, escala, escala);
                dummy.updateMatrix();

                for (const canal of canais) meshes[canal].setMatrixAt(i, dummy.matrix);

                aAdepto[i * 4 + 0] = rnd();
                aAdepto[i * 4 + 1] = rnd() * Math.PI * 2;
                aAdepto[i * 4 + 2] = 0.85 + rnd() * 0.30;
                aAdepto[i * 4 + 3] = (claque === 'A') ? 0 : 1;

                meshes.camisa && meshes.camisa.setColorAt(i, variar(eq.camisa));
                meshes.calcao && meshes.calcao.setColorAt(i, variar(eq.calcao));
                meshes.pele && meshes.pele.setColorAt(i, variar(CrowdModel.peles[Math.floor(rnd() * CrowdModel.peles.length)]));
                meshes.cabelo && meshes.cabelo.setColorAt(i, variar(CrowdModel.cabelos[Math.floor(rnd() * CrowdModel.cabelos.length)]));
            }

            for (const canal of canais) {
                meshes[canal].instanceMatrix.needsUpdate = true;
                if (meshes[canal].instanceColor) meshes[canal].instanceColor.needsUpdate = true;
                meshes[canal].geometry.attributes.aAdepto.needsUpdate = true;
                meshes[canal].count = nChunk;
                scene.add(meshes[canal]);
            }
            
            this._grupos.push(meshes);
        }

        if (typeof console !== 'undefined' && console.log) {
            console.log(`Crowd: ${nTotal} adeptos em ${lugares.length} lugares particionados em ${numChunks} chunks com frustum culling ativo!`);
        }

        this._meshes = this._grupos[0]; 
        this._uniforms = uniforms;
        this._tempo = 0;
        this._frac = { A: -1, B: -1 };
        CrowdTrigger.reset();

        this.setFraccao('A', CrowdModel.fraccaoRepouso, false);
        this.setFraccao('B', CrowdModel.fraccaoRepouso, false);
        return this._meshes;
    },

    /*
    Muda a fracção de uma claque que está de pé.
    */
    setFraccao(claque, fraccao, festa) {
        if (!this._uniforms) return;
        const i = (claque === 'A') ? 'x' : 'y';
        const u = this._uniforms;

        if (this._frac[claque] !== fraccao) {
            u.uFracAnt.value[i] = (this._frac[claque] < 0) ? fraccao : this._frac[claque];
            u.uFracNova.value[i] = fraccao;
            u.uTempoTroca.value[i] = this._tempo;
            this._frac[claque] = fraccao;
        }
        u.uFesta.value[i] = festa ? 1 : 0;
    },

    /*
    Corre por frame, a partir do `Match.updateCrowd`.

    O único uniform escrito por frame é o tempo. As fracções só se escrevem
    quando o lance muda — e o `setFraccao` já filtra o que não mudou.
    */
    update(dt) {
        if (!this._uniforms) return;
        this._tempo += dt;
        this._uniforms.uTempo.value = this._tempo;

        if (typeof Match === 'undefined' || !Match.ball) return;

        const r = CrowdTrigger.avaliar({
            estado: Match.state,
            posse: Match.possessionTeam,
            bolaZ: Match.ball.position.z,
            equipaQueMarcou: Match.lastTouchedTeam,
            dt: dt
        });
        this.setFraccao('A', r.A, r.festa === 'A');
        this.setFraccao('B', r.B, r.festa === 'B');
    },

    setVisivel(on) {
        if (!this._grupos) return;
        for (const meshes of this._grupos) {
            for (const canal in meshes) {
                meshes[canal].visible = on;
            }
        }
    }
};
