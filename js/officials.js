/*
=============================================================================
EQUIPA DE ARBITRAGEM — árbitro e dois assistentes
=============================================================================
Ficheiro auto-contido de propósito: os árbitros não entram em `Match.players`
nem em `Match.opponents`, não têm blackboard, não passam pelo BT, não disputam
a bola e não colidem com ninguém. Tudo o que fazem é ir para um ponto e animar
a passada. Metê-los nas listas dos jogadores obrigaria a filtrá-los em cada
ciclo que percorre um plantel — e são dezenas.

POSICIONAMENTO

  Assistentes: cada um cobre METADE de uma linha lateral, e as duas metades
  são diagonalmente opostas. Cada um acompanha a linha de fora-de-jogo da sua
  metade, que é o SEGUNDO ÚLTIMO jogador da equipa que ali defende — a mesma
  definição que o `publicarLinhaDeForaDeJogo` do Match usa, mas calculada aqui
  para não depender do estado de posse (o assistente segue a linha esteja ou
  não a equipa a atacar).

  Árbitro: corre a DIAGONAL contrária, a que o deixa sempre do lado oposto ao
  do assistente daquela metade. Com o assistente 1 em +X na metade -Z e o
  assistente 2 em -X na metade +Z, a diagonal do árbitro vai de (-X, -Z) a
  (+X, +Z).

  A diagonal é a do LATERAL DIREITO ao PONTA ESQUERDA do TeamB — de (+X, +Z) a
  (-X, -Z). O árbitro projecta a bola nela e depois AFASTA-SE ao longo dela até
  ficar a `RefereeModel.distanciaBola` da bola (15 m).
=============================================================================
*/
const RefereeModel = {
    /*
    Diagonal do árbitro, em fracção da meia-largura e do meio-campo.

    É a diagonal do LATERAL DIREITO ao PONTA ESQUERDA do TeamB (vermelho): esse
    lado ataca -Z, portanto a sua direita é +X e o lateral direito fica em
    (+X, +Z); o ponta esquerda fica no canto oposto, (-X, -Z). É a mesma recta
    percorrida nos dois sentidos, e é a que deixa o árbitro sempre do lado
    contrário ao do assistente daquela metade.

    Os extremos são LARGOS (0.68 → ±23 m) e não muito FUNDOS (0.75 → ±40 m),
    porque são as posições de um lateral e de um extremo, não das bandeirolas
    de canto.
    */
    diagonalX: 0.68,
    diagonalZ: 0.75,
    distanciaBola: 15.0,     // afastamento à bola, em metros
    /*
    Colocação inicial do árbitro: junto ao círculo central, do lado da sua
    diagonal — entre as duas linhas que se formam para o pontapé de saída. 12 m
    põe-no logo por fora do círculo (raio 9.15) sem ficar longe do lance.
    Depois do arranque passa a mandar o `distanciaBola`.
    */
    distanciaInicial: 12.0,
    raioCirculoCentral: 9.15,
    velocidade: 7.5,         // m/s, ritmo de quem acompanha o jogo

    // Assistentes: quanto ficam PARA FORA da linha lateral.
    margemLinha: 1.4,
    velocidadeAssistente: 8.5,

    /*
    Equipamento, preto por agora. Em texto e não em hexadecimal numérico: o
    `buildBody` dos jogadores pinta as texturas da camisola e dos meiões num
    canvas 2D, e o canvas quer uma cor CSS.
    */
    corCamisa: '#14161a',
    corCalcao: '#14161a',
    corBota: '#0f1114'
};

const Officials = {
    arbitro: null,
    assistentes: [],
    _ativo: true,

    /*
    Corpo: o MESMO modelo dos jogadores. Instancia-se um `FootballPlayer` só
    para nos dar `model` + `rig`, com o equipamento todo preto.

    O construtor do FootballPlayer é seguro para isto: não se inscreve em lado
    nenhum, não toca no `Match`, e o que acrescenta à cena são dois sprites
    (etiqueta e banner) que nascem invisíveis dentro do próprio `model`. O
    `discoTatico` — esse sim vive na cena — é criado dentro do `updateShirt`,
    que nunca chamamos: sem número nas costas e sem disco na vista táctica, que
    é o que se quer para um árbitro.

    Os ossos têm os mesmos nomes (`lLeg`, `rKnee`, `lArm`, `chest`…), por isso o
    `mover()` aqui em baixo não muda nada.
    */
    criarCorpo: function (id) {
        const R = RefereeModel;
        const jogador = new FootballPlayer(id, R.corCamisa, R.corCalcao, 'TeamA');

        /*
        As chuteiras saem do baralho de aparências (`escolherAparencia`) e vêm
        às cores. Aqui pintam-se de preto: recalcula-se a mesma aparência para
        saber QUE cor procurar, e trocam-se só os materiais com essa cor — a
        pele, o cabelo e os olhos ficam intactos.
        */
        if (typeof escolherAparencia === 'function') {
            const ap = escolherAparencia(id, 11, 0);
            const alvoBota = new THREE.Color(ap.corChuteira).getHex();
            jogador.model.traverse(function (o) {
                if (!o.material || !o.material.color) return;
                if (o.material.color.getHex() === alvoBota) {
                    o.material = o.material.clone();
                    o.material.color.set(R.corBota);
                }
            });
        }

        return { corpo: jogador.model, rig: jogador.rig, jogador: jogador };
    },

    criarOficial: function (scene, id) {
        const feito = this.criarCorpo(id);
        scene.add(feito.corpo);
        return {
            model: feito.corpo,
            rig: feito.rig,
            animTimer: 0
        };
    },

    init: function (scene) {
        if (this.arbitro) return;
        this.arbitro = this.criarOficial(scene, 0);
        this.assistentes = [this.criarOficial(scene, 1), this.criarOficial(scene, 2)];
        this.colocarInicial();
    },

    /*
    Coloca os três no sítio LOGO no arranque, em vez de os deixar nascer em
    (0,0) e virem a correr do meio do campo até à posição — que era o que se
    via nos primeiros segundos.

    Assistentes: já sobre a linha de impedimento da metade que cobrem.
    Árbitro: `distanciaInicial` da bola, sobre a sua diagonal e por fora do
    círculo central.
    */
    colocarInicial: function () {
        if (!this.arbitro) return;
        if (typeof Match === 'undefined' || !Match.ball ||
            !Match.players || !Match.players.length) return;

        const R = RefereeModel;
        const meiaLarg = CAMPO_LARG / 2;

        const zA = this.linhaDeImpedimento(Match.players, 1);
        const zB = this.linhaDeImpedimento(Match.opponents, -1);

        this.assistentes[0].model.position.set(
            meiaLarg + R.margemLinha, 0,
            THREE.MathUtils.clamp(zA, -(CAMPO_COMP / 2), 0));
        this.assistentes[1].model.position.set(
            -(meiaLarg + R.margemLinha), 0,
            THREE.MathUtils.clamp(zB, 0, CAMPO_COMP / 2));

        const bola = Match.ball.position;
        const ax = -meiaLarg * R.diagonalX, az = -(CAMPO_COMP / 2) * R.diagonalZ;
        const bx = meiaLarg * R.diagonalX, bz = (CAMPO_COMP / 2) * R.diagonalZ;
        const dx = bx - ax, dz = bz - az;
        const comprimento = Math.hypot(dx, dz);

        // Ponto da diagonal mais perto da bola, recuado `distanciaInicial`.
        let t = ((bola.x - ax) * dx + (bola.z - az) * dz) / (comprimento * comprimento);
        t = THREE.MathUtils.clamp(t - R.distanciaInicial / comprimento, 0, 1);
        let px = ax + dx * t, pz = az + dz * t;

        // Nunca dentro do círculo central.
        const dCentro = Math.hypot(px, pz);
        if (dCentro < R.raioCirculoCentral) {
            const k = (dCentro > 0.001) ? (R.raioCirculoCentral + 1.0) / dCentro : 1;
            px *= k; pz *= k;
        }
        this.arbitro.model.position.set(px, 0, pz);

        // Virados para a bola, para não nascerem de costas.
        const olhar = (o) => {
            o.model.rotation.y = Math.atan2(
                bola.x - o.model.position.x, bola.z - o.model.position.z);
        };
        olhar(this.arbitro);
        olhar(this.assistentes[0]);
        olhar(this.assistentes[1]);
    },

    /*
    SEGUNDO ÚLTIMO jogador de uma equipa, medido a partir da baliza dela: é
    esta a linha que o assistente acompanha. Inclui o guarda-redes, porque a
    regra conta jogadores e não funções — com o GK na baliza, o segundo último
    acaba por ser o defesa mais recuado, que é o que se quer.
    */
    linhaDeImpedimento: function (lista, dirZ) {
        const zs = [];
        for (let i = 0; i < lista.length; i++) {
            const p = lista[i];
            if (p && p.model) zs.push(p.model.position.z * dirZ);
        }
        if (zs.length < 2) return 0;
        zs.sort(function (a, b) { return a - b; });   // do mais recuado ao mais adiantado
        return zs[1] * dirZ;                          // o segundo mais recuado
    },

    /*
    Ponto da diagonal do árbitro mais próximo da bola, depois afastado ao longo
    dela até `distanciaBola`. Devolve {x, z}.
    */
    pontoDoArbitro: function (bola) {
        const R = RefereeModel;
        const ax = -(CAMPO_LARG / 2) * R.diagonalX, az = -(CAMPO_COMP / 2) * R.diagonalZ;
        const bx = (CAMPO_LARG / 2) * R.diagonalX, bz = (CAMPO_COMP / 2) * R.diagonalZ;

        const dx = bx - ax, dz = bz - az;
        const len2 = dx * dx + dz * dz;
        const comprimento = Math.sqrt(len2);

        let t = ((bola.x - ax) * dx + (bola.z - az) * dz) / len2;
        t = THREE.MathUtils.clamp(t, 0, 1);

        let px = ax + dx * t, pz = az + dz * t;

        /*
        Afasta-se ao longo da diagonal até estar a `distanciaBola` da bola, e
        para o lado de onde a jogada NÃO está — atravessar o meio do lance para
        cumprir a distância seria pior do que não a cumprir.
        */
        const dist = Math.hypot(px - bola.x, pz - bola.z);
        if (dist < R.distanciaBola) {
            const falta = (R.distanciaBola - dist) / comprimento;
            const sentido = (bola.z >= 0) ? -1 : 1;
            t = THREE.MathUtils.clamp(t + sentido * falta, 0, 1);
            px = ax + dx * t; pz = az + dz * t;
        }
        return { x: px, z: pz };
    },

    /*
    Desloca um oficial para o alvo e anima a passada com o ciclo do jogo.

    `olharPara` (opcional, {x, z}) é o ponto que o oficial quer ter debaixo de
    olho — para o árbitro, a bola. Sem isso vira-se para onde anda.

    ORIENTAÇÃO, e porque não é simplesmente "olha sempre para a bola": prender o
    corpo à bola em plena corrida põe o ciclo de passada frontal por cima de uma
    deslocação de lado, e o boneco DESLIZA. Medido em
    tests/arbitro_passada.test.js: com o corpo a 90° do movimento ele percorria
    **2.85×** o chão que as pernas davam.

    Vale a mesma regra dos jogadores (LateralGait, ver animateBones em
    player.js), que existe exactamente para isto:

        acima de `velViragem` (3.6 m/s)  o corpo roda PARA O MOVIMENTO
        abaixo dela                      fica virado para a bola e dá passo
                                         lateral, com a velocidade encolhida

    Ou seja: em corrida aberta corre de frente, como um árbitro a fechar espaço;
    em ritmo de acompanhamento — que é a maior parte do tempo — anda de lado, de
    cara para o jogo.

    A velocidade é encolhida pelo MESMO factor que encolhe a passada. Sem isso o
    passo lateral continuava a deslizar: as pernas dão passos curtos e o corpo
    percorria na mesma o caminho todo. Quem anda de lado anda mais devagar.

    A orientação é escrita mesmo com ele parado — daí não passar pelo corte de
    `d > 0.4` que a viragem para o movimento tem (esse existe para não fazer
    piruetas quando o deslocamento é ruído).
    */
    mover: function (o, alvoX, alvoZ, velMax, dt, olharPara) {
        const dx = alvoX - o.model.position.x;
        const dz = alvoZ - o.model.position.z;
        const d = Math.hypot(dx, dz);

        const L = (typeof LateralGait !== 'undefined') ? LateralGait : null;

        /*
        Decidir ORIENTAÇÃO e LATERALIDADE antes de dar o passo: é a lateralidade
        que limita a velocidade deste frame.
        */
        let lateralidade = 0, ladoMov = 0;
        const velDesejada = (d > 0.05) ? Math.min(velMax, d / Math.max(dt, 1e-4)) : 0;
        const emCorrida = !L || velDesejada > L.velViragem;

        if (olharPara && !emCorrida) {
            const ox = olharPara.x - o.model.position.x;
            const oz = olharPara.z - o.model.position.z;
            if (Math.hypot(ox, oz) > 0.05) o.model.rotation.y = Math.atan2(ox, oz);
        } else if (d > 0.4) {
            // Vira-se para onde anda; quase parado, mantém a orientação.
            o.model.rotation.y = Math.atan2(dx, dz);
        }

        if (L && d > 0.0001) {
            const fx = Math.sin(o.model.rotation.y), fz = Math.cos(o.model.rotation.y);
            const mx = dx / d, mz = dz / d;
            const alinhamento = fx * mx + fz * mz;
            const desvio = Math.acos(THREE.MathUtils.clamp(Math.abs(alinhamento), -1, 1));
            if (desvio > L.anguloMin) {
                lateralidade = Math.min(1, (desvio - L.anguloMin) /
                    (Math.PI / 2 - L.anguloMin));
                // >0 = movimento para a direita do corpo.
                ladoMov = Math.sign(fz * mx - fx * mz) || 1;
            }
        }

        const amp = 1 - lateralidade * (L ? L.reducaoPassada : 0);

        let passo = 0;
        if (d > 0.05) {
            passo = Math.min(d, velMax * amp * dt);
            o.model.position.x += (dx / d) * passo;
            o.model.position.z += (dz / d) * passo;
        }
        const vel = dt > 0.0001 ? passo / dt : 0;

        const rig = o.rig;
        if (vel > 0.1 && typeof getGaitPose === 'function') {
            /*
            A cadência sai da velocidade REAL e da passada JÁ ENCOLHIDA — é esta
            divisão que faz o pé ficar colado ao chão. Usar a passada inteira
            aqui era metade do deslize.
            */
            const P0 = getGaitPose(0, vel);
            o.animTimer += (vel * dt) / (P0.passada * amp);
            const t = ((o.animTimer % 1.0) + 1.0) % 1.0;
            const P = getGaitPose(t, vel);

            rig.lLeg.rotation.x = P.lHip * amp; rig.lKnee.rotation.x = P.lKnee * amp;
            rig.rLeg.rotation.x = P.rHip * amp; rig.rKnee.rotation.x = P.rKnee * amp;
            rig.lArm.rotation.x = P.lArm * amp; rig.rArm.rotation.x = P.rArm * amp;
            rig.lElbow.rotation.x = P.cotovelo; rig.rElbow.rotation.x = P.cotovelo;
            rig.chest.rotation.x = P.tronco * amp;
            o.model.position.y = P.ressalto;

            if (lateralidade > 0.001) {
                const A = LateralGait.abertura * lateralidade;
                const osc = Math.sin(t * Math.PI * 2) * A;
                rig.lLeg.rotation.z = lerpTo(rig.lLeg.rotation.z, ladoMov * A * 0.5 + osc, 0.35);
                rig.rLeg.rotation.z = lerpTo(rig.rLeg.rotation.z, ladoMov * A * 0.5 - osc, 0.35);
            } else {
                rig.lLeg.rotation.z = lerpTo(rig.lLeg.rotation.z, 0);
                rig.rLeg.rotation.z = lerpTo(rig.rLeg.rotation.z, 0);
            }
        } else {
            const ossos = ['lLeg', 'rLeg', 'lKnee', 'rKnee', 'lArm', 'rArm', 'lElbow', 'rElbow'];
            for (let i = 0; i < ossos.length; i++) {
                rig[ossos[i]].rotation.x = lerpTo(rig[ossos[i]].rotation.x, 0, 0.2);
            }
            rig.chest.rotation.x = lerpTo(rig.chest.rotation.x, 0, 0.2);
            // Fecha também a abdução do passo lateral, senão ficava de pernas
            // abertas ao parar.
            rig.lLeg.rotation.z = lerpTo(rig.lLeg.rotation.z, 0, 0.2);
            rig.rLeg.rotation.z = lerpTo(rig.rLeg.rotation.z, 0, 0.2);
            o.model.position.y = lerpTo(o.model.position.y, 0, 0.2);
        }
    },

    update: function (dt) {
        if (!this.arbitro || !this._ativo) return;
        if (typeof Match === 'undefined' || !Match.ball) return;

        const R = RefereeModel;
        const meiaLarg = CAMPO_LARG / 2;

        /*
        Assistente 1: linha lateral +X, metade z <= 0 — a que o TeamA defende
        (dirZ +1, baliza em -Z), logo segue a linha do TeamA.
        Assistente 2: linha lateral -X, metade z >= 0, linha do TeamB.
        As duas metades são diagonalmente opostas, como na arbitragem real.
        */
        const zA = this.linhaDeImpedimento(Match.players, 1);
        const zB = this.linhaDeImpedimento(Match.opponents, -1);

        this.mover(this.assistentes[0],
            meiaLarg + R.margemLinha,
            THREE.MathUtils.clamp(zA, -(CAMPO_COMP / 2), 0),
            R.velocidadeAssistente, dt);

        this.mover(this.assistentes[1],
            -(meiaLarg + R.margemLinha),
            THREE.MathUtils.clamp(zB, 0, CAMPO_COMP / 2),
            R.velocidadeAssistente, dt);

        const alvoArb = this.pontoDoArbitro(Match.ball.position);
        this.mover(this.arbitro, alvoArb.x, alvoArb.z, R.velocidade, dt,
            Match.ball.position);
    },

    setVisivel: function (on) {
        this._ativo = on;
        if (this.arbitro) this.arbitro.model.visible = on;
        for (let i = 0; i < this.assistentes.length; i++) {
            this.assistentes[i].model.visible = on;
        }
    }
};
