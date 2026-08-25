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
    ZONA MORTA COM HISTERESE, e um filtro na velocidade da animacao.

    Sem isto o boneco TREMIA sempre que o alvo estabilizava. A conta: o passo
    de um frame e `min(d, velMax*amp*dt)`, portanto perto do alvo o passo e o
    proprio `d`, e a velocidade que alimenta o ciclo de passada e `d/dt` — com
    dt de 1/60, seis centimetros dao 3.6 m/s. O movimento parava em d <= 0.05 e
    a animacao ligava em vel > 0.1, ou seja a velocidade saltava entre 0 e ~3
    m/s sem nada pelo meio. Alvo a oscilar dois centimetros = correr/parar a
    cada frame, com o ressalto vertical a acompanhar.

    `paragemMax` e onde se considera chegado; `arranqueMin` e o quanto o alvo
    tem de se afastar para valer a pena voltar a andar. Serem DIFERENTES e o
    ponto: com um so limiar volta o mesmo tremor, mais fino.

    MAS A FOLGA TEM DE SER PEQUENA. Esteve em 0.25/0.60 e trocou o tremor por
    SOLAVANCOS nos assistentes: o alvo deles corre ao longo da linha atras da
    bola, portanto afasta-se SEMPRE — com 60 cm de folga o boneco esperava,
    acumulava distancia e arrancava de repente para a recuperar, em ciclo.
    Quem tem um alvo em movimento continuo precisa de sair logo atras dele.

    O tremor nao volta porque quem o resolve nao e esta folga: e o
    `suavizacaoVel`, que filtra a velocidade vista pela ANIMACAO. Era ela que
    saltava entre 0 e ~3 m/s num passo curto e ligava e desligava o ciclo de
    passada a cada frame. A zona morta so evita os micro-passos.

    A MARGEM E ESTREITA, e esta medida (tests/arbitro_passada.test.js):

        0.25 / 0.60   sem tremor, mas 3.0 m/s de solavanco
        0.10 / 0.18   sem tremor, ainda 3.0 m/s de solavanco
        0.06 / 0.10   sem tremor, sem solavanco     <- aqui
        0.04 / 0.07   volta o tremor

    Mexer nestes dois numeros sem correr o teste e reintroduzir um dos dois.
    */
    paragemMax: 0.06,
    arranqueMin: 0.10,
    suavizacaoVel: 0.20,

    /*
    Equipamento, preto por agora. Em texto e não em hexadecimal numérico: o
    `buildBody` dos jogadores pinta as texturas da camisola e dos meiões num
    canvas 2D, e o canvas quer uma cor CSS.
    */
    corCamisa: '#14161a',
    corCalcao: '#14161a',
    corBota: '#0f1114',

    /*
    DISCOS DA VISTA TACTICA. De 40 m de altura o boneco le-se mal, e os
    jogadores ja aparecem como discos da cor da equipa (ver updateShirt em
    player.js) — sem isto os arbitros eram os unicos bonecos no meio de vinte e
    dois discos, e ficavam a parecer o que nao sao.

    Preto com amarelo, que e o equipamento de arbitro. O RAIO E O MESMO dos
    jogadores (ver a CircleGeometry do discoTatico em player.js): de cima, um
    disco mais pequeno lia-se como estando mais longe.

    `R` de arbitro, `A` de assistente — as duas letras que cabem num disco
    deste tamanho sem encolherem ate deixarem de se ler.
    */
    discoRaio: 0.85,
    discoFundo: '#101216',
    discoLinha: '#f2c400',

    /*
    =========================================================================
    FALTAS E CARTÕES
    =========================================================================
    Spec em docs/superpowers/specs/2026-08-25-faltas-e-cartoes-design.md.

    Alvo: 27,63 faltas e 5,22 cartões por jogo de 90 minutos, com 0,08
    vermelhos. Nada disto existia — o `triggerFreeKick` estava escrito mas só
    o botão do painel o chamava.

    DUAS FONTES de falta, e a calibração delas é ACOPLADA: as duas somam para
    a mesma média, portanto subir uma obriga a descer a outra. Por isso existe
    a `escala`, que multiplica ambas e deixa mexer no TOTAL sem tocar no
    equilíbrio entre elas.
    */
    faltas: {
        /*
        Multiplicador global das duas fontes. Sobe ou desce o total de faltas
        por jogo sem mudar a proporcao entre desarme e contacto.

        HISTORICO DA AFINACAO (medido em lotes de 20 jogos de 90 min, com
        1080 s de fisica por jogo — ver GAME_SPEED e MatchDuration):

            1.0   dava 4,65 faltas por jogo
            4.3   pedidas 20 por jogo

        O salto e grande porque o raio de accionamento do chaser
        (MarkingModel.raioDeAccionamento) cortou a perseguicao constante, e com
        ela os duelos de onde saem as faltas. Menos rush, menos contacto: o
        numero de faltas e o preco directo dessa mudanca, e este multiplicador
        e onde se paga.
        */
        escala: 4.3,

        /*
        FONTE A — o duelo perdido. O desfecho já existe (venceuDuelo, em
        utils.js) e hoje não custa nada a quem falha; agora custa.

        O carrinho é muito mais punido do que o desarme de pé porque é o que
        acontece no jogo: o corpo vai no chão, em movimento, e quem falha a
        bola acerta na perna.
        */
        probCarrinhoFalhado: 0.15,
        probDesarmeFalhado: 0.030,

        /*
        FONTE B — o contacto sem tentativa de desarme: empurrões e choques.

        `raio` é a distância a que dois corpos se tocam; `velRelMin` é a
        velocidade relativa abaixo da qual o encontro é só um roçar. O
        `arrefecimento` impede que o mesmo par marque falta atrás de falta
        enquanto continua encostado — sem ele um único choque dava dezenas.
        */
        contacto: {
            raio: 1.0,
            velRelMin: 4.5,
            prob: 0.035,
            arrefecimento: 3.0
        },

        /*
        GRAVIDADE: quatro parcelas somadas. Serve só para decidir o cartão.

        `pesoAngulo` usa 0 de frente e π por trás, portanto entra a dobrar num
        carrinho pelas costas. `travouAtaque` é a falta táctica.
        */
        gravidade: {
            base: { carrinho: 0.35, desarme: 0.14, contacto: 0.10 },
            pesoVelocidade: 0.020,   // por m/s do contacto
            pesoAngulo: 0.30,        // × (angulo / π)
            travarAtaque: 0.25,

            /*
            O JOGADOR também conta, não só o lance.

            `pesoMarcacao` DESCE a gravidade: quem marca bem entra com o tempo
            certo e leva mais bola do que perna, portanto a falta que comete
            é mais limpa. `pesoForca` SOBE-a: no mesmo lance, um jogador forte
            magoa mais.

            Os dois entram normalizados a partir de 50 — a skill média — e
            saturam nos extremos: um defensor de marcação 100 tira
            `pesoMarcacao` inteiro à gravidade, um de 0 soma-o.
            */
            pesoMarcacao: 0.14,
            pesoForca: 0.12
        },

        /*
        LIMIARES, calibrados contra uma corrida de 2 jogos de 25 minutos.

        A PRIMEIRA CALIBRAÇÃO FALHOU, e vale a pena saber porquê: dava ~12,6
        vermelhos e ~34 amarelos por 90 minutos, contra 0,08 e 5,22. O erro
        foi tratar o carrinho por trás como caso excepcional quando ele é o
        caso COMUM — o fsm.js garante que um carrinho por trás nunca rouba a
        bola, portanto falha sempre, portanto vira falta sempre. Com o
        `pesoAngulo` a somar e o limiar de vermelho em 1.05, davam-se
        vermelhos DIRECTOS a eito (uma equipa fez 0 amarelos e 3 vermelhos).

        Agora, com o carrinho a deslizar a 9 m/s (SlideTackleModel):

            carrinho de frente      0.35 + 0.18          = 0.53   nada
            carrinho por trás       0.35 + 0.18 + 0.30   = 0.83   nada
            por trás a travar       0.83 + 0.25          = 1.08   AMARELO
            idem, a 12 m/s          0.35+0.24+0.30+0.25  = 1.14   VERMELHO

        O vermelho DIRECTO fica assim quase inalcançável — como deve ser:
        quase todos os vermelhos reais saem do segundo amarelo.
        */
        limiarAmarelo: 0.85,
        limiarVermelho: 1.10
    }
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
    `discoTatico` do FootballPlayer — esse sim vive na cena — é criado dentro
    do `updateShirt`, que nunca chamamos: um árbitro não leva número nas
    costas. O disco da vista táctica é outro, feito aqui em `criarDisco` com as
    cores e a letra dele.

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

    /*
    O DISCO DA VISTA TACTICA, com a letra ja rodada.

    Vive na CENA e nao dentro do `model`: assim nao sobe nem roda com o
    boneco, fica sempre pousado no relvado — a mesma razao por que o disco dos
    jogadores tambem vive la fora.

    A letra leva `rotate(-PI/2)` no canvas pela mesma razao que a dos
    jogadores: o disco esta deitado (`rotation.x = -PI/2`) e sem isso a letra
    aparecia de lado para quem olha de cima.
    */
    criarDisco: function (scene, etiqueta) {
        const R = RefereeModel;
        const cv = document.createElement('canvas');
        cv.width = 128; cv.height = 128;
        const c = cv.getContext('2d');

        c.fillStyle = R.discoFundo;
        c.beginPath(); c.arc(64, 64, 58, 0, Math.PI * 2); c.fill();

        // Duas linhas: o aro de fora e um anel fino por dentro. So o aro
        // ficava a ler como um disco de jogador com outra cor.
        c.strokeStyle = R.discoLinha;
        c.lineWidth = 8;
        c.beginPath(); c.arc(64, 64, 58, 0, Math.PI * 2); c.stroke();
        c.lineWidth = 3;
        c.beginPath(); c.arc(64, 64, 46, 0, Math.PI * 2); c.stroke();

        c.fillStyle = R.discoLinha;
        c.font = 'bold 54px sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.save();
        c.translate(64, 64);
        c.rotate(-Math.PI / 2);
        c.fillText(etiqueta, 0, 0);
        c.restore();

        const disco = new THREE.Mesh(
            new THREE.CircleGeometry(R.discoRaio, 24),
            new THREE.MeshBasicMaterial({
                map: new THREE.CanvasTexture(cv),
                transparent: true,
                depthWrite: false
            })
        );
        disco.rotation.x = -Math.PI / 2;
        disco.visible = false;
        scene.add(disco);
        return disco;
    },

    criarOficial: function (scene, id, etiqueta) {
        const feito = this.criarCorpo(id);
        scene.add(feito.corpo);
        return {
            model: feito.corpo,
            rig: feito.rig,
            animTimer: 0,
            disco: this.criarDisco(scene, etiqueta)
        };
    },

    init: function (scene) {
        if (this.arbitro) return;
        this.arbitro = this.criarOficial(scene, 0, 'R');
        this.assistentes = [this.criarOficial(scene, 1, 'A'),
                            this.criarOficial(scene, 2, 'A')];
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
        /*
        CHEGOU OU NAO CHEGOU — com histerese (ver paragemMax/arranqueMin).
        Um limiar unico punha o boneco a correr/parar a cada frame quando o
        alvo estabilizava em cima dele.
        */
        const R = RefereeModel;
        if (o.paradoNoAlvo === undefined) o.paradoNoAlvo = true;
        if (o.paradoNoAlvo) {
            if (d > R.arranqueMin) o.paradoNoAlvo = false;
        } else if (d < R.paragemMax) {
            o.paradoNoAlvo = true;
        }

        let lateralidade = 0, ladoMov = 0;
        const velDesejada = o.paradoNoAlvo ? 0 : Math.min(velMax, d / Math.max(dt, 1e-4));
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
        if (!o.paradoNoAlvo && d > 0.0001) {
            passo = Math.min(d, velMax * amp * dt);
            o.model.position.x += (dx / d) * passo;
            o.model.position.z += (dz / d) * passo;
        }
        /*
        A velocidade que a ANIMACAO ve e filtrada. A instantanea (`passo/dt`)
        salta de 0 para varios m/s num unico passo curto, e era ela que ligava
        e desligava o ciclo de passada a cada frame.
        */
        const velInstant = dt > 0.0001 ? passo / dt : 0;
        o.velAnim = lerpTo(o.velAnim || 0, velInstant, R.suavizacaoVel);
        const vel = o.velAnim;

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
        if (typeof Match === 'undefined' || !Match.ball) return;

        /*
        As faltas por contacto sao vigiadas SEMPRE, mesmo com os arbitros
        escondidos (`_ativo` false, o botao do painel): esconder os bonecos e
        uma opcao de visualizacao, nao suspender a arbitragem. So o
        posicionamento, daqui para baixo, e que depende deles existirem.
        */
        this.detectarContactos(dt);

        if (!this.arbitro || !this._ativo) return;

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

        // Depois de mover, para os discos nao ficarem um frame atras.
        this.atualizarVista();
    },

    setVisivel: function (on) {
        this._ativo = on;
        // A vista corrente e que decide entre boneco e disco; aqui so se
        // guarda o interruptor e se aplica ja, para o botao do painel
        // responder no mesmo frame.
        this.atualizarVista();
    },

    /*
    BONECO OU DISCO, conforme a camara — o mesmo criterio dos jogadores (ver
    `vistaTatica` em player.js). Na vista de cima o boneco le-se mal, e um
    arbitro em boneco no meio de vinte e dois discos lia-se como uma coisa
    diferente do que e.

    Corre todos os frames e nao so na troca de camara: o `cameraMode` e uma
    variavel global que qualquer botao do painel pode mudar sem avisar
    ninguem, e um sinal para aqui era mais uma coisa para esquecer de ligar.
    */
    atualizarVista: function () {
        const tatico = (window.cameraMode === 'topdown');
        const todos = this.arbitro ? [this.arbitro].concat(this.assistentes) : [];
        for (let i = 0; i < todos.length; i++) {
            const o = todos[i];
            if (!o) continue;
            o.model.visible = this._ativo && !tatico;
            if (o.disco) {
                o.disco.visible = this._ativo && tatico;
                // A altura e a mesma do disco dos jogadores: pousado no
                // relvado, e nao ao nivel dele, senao as duas superficies
                // disputam o mesmo pixel e o disco pisca.
                o.disco.position.set(o.model.position.x, 0.04, o.model.position.z);
            }
        }
    },

    /*
    =========================================================================
    AS REGRAS
    =========================================================================
    Daqui para baixo é tudo função PURA — sem Match, sem cena, sem bola. É de
    propósito: as regras são o que se testa (tests/faltas_cartoes.test.js), e
    testá-las obrigando a montar um jogo seria trocar um teste de meio segundo
    por um de meio minuto.
    =========================================================================
    */

    /*
    Gravidade de uma falta, para decidir o cartão.

    `tipo`: 'carrinho' | 'desarme' | 'contacto'
    `velocidade`: m/s do contacto
    `angulo`: radianos entre a frente da vítima e o infractor — 0 de frente,
              π pelas costas
    `travouAtaque`: falta táctica sobre quem ia em progressão
    `marcacao`, `forca`: skills do INFRACTOR, 0..100. Omitidas valem 50 (a
              média), portanto não mexem no resultado — é o que mantém as
              contas do cabeçalho válidas para um jogador mediano.
    */
    gravidadeDaFalta: function (o) {
        const G = RefereeModel.faltas.gravidade;
        const base = G.base[o.tipo];
        // Um tipo desconhecido é um erro de quem chama, não uma falta leve.
        if (base === undefined) {
            console.warn('Officials: tipo de falta desconhecido:', o.tipo);
            return 0;
        }
        let g = base;
        g += Math.max(0, o.velocidade || 0) * G.pesoVelocidade;
        g += (Math.abs(o.angulo || 0) / Math.PI) * G.pesoAngulo;
        if (o.travouAtaque) g += G.travarAtaque;

        // O jogador: marcação alivia, força agrava. 50 é a média e não mexe.
        const marcacao = (typeof o.marcacao === 'number') ? o.marcacao : 50;
        const forca = (typeof o.forca === 'number') ? o.forca : 50;
        g -= ((marcacao - 50) / 50) * G.pesoMarcacao;
        g += ((forca - 50) / 50) * G.pesoForca;

        // Uma falta nunca é de gravidade negativa, por muito bom que o
        // defensor seja: continua a ser uma falta.
        return Math.max(0, g);
    },

    /*
    Que cartão sai desta gravidade, para este jogador.

    O SEGUNDO AMARELO é o que produz quase todos os vermelhos: o vermelho
    directo exige uma gravidade que quase nenhum lance atinge.
    */
    decidirCartao: function (gravidade, jogador) {
        const F = RefereeModel.faltas;
        if (gravidade >= F.limiarVermelho) return 'vermelho';
        if (gravidade >= F.limiarAmarelo) {
            return (jogador && jogador.temAmarelo) ? 'vermelho' : 'amarelo';
        }
        return null;
    },

    /*
    O MEDO DO ADVERTIDO.

    Sem isto o segundo amarelo dava ~46% de jogos com expulsão — problema do
    aniversário, com 5,22 cartões repartidos por 22 jogadores — quando o
    número real é 8%. Quem tem amarelo deixa de fazer carrinhos, e é isso, e
    não uma constante inventada para o efeito, que põe os vermelhos no sítio.

    Lido pelo js/bt/player_bt.js antes de escolher SLIDE_TACKLE.
    */
    podeFazerCarrinho: function (p) {
        return !(p && p.temAmarelo);
    },

    /*
    A falta é penálti? Só quando o infractor é de quem DEFENDE aquela área e
    a falta é dentro dela.

    `zSinal < 0` é a baliza do TeamA (a mesma convenção da detecção de golo em
    match.js), portanto o TeamA defende z negativo.
    */
    ehPenalti: function (x, z, teamInfractor) {
        const meiaLargArea = AREA_GRANDE_MEIA_LARG;
        if (Math.abs(x) > meiaLargArea) return false;

        const zLimite = CAMPO_COMP / 2 - AREA_GRANDE_PROF;
        const dentroEmZNegativo = z < -zLimite;
        const dentroEmZPositivo = z > zLimite;

        if (teamInfractor === 'TeamA') return dentroEmZNegativo;
        if (teamInfractor === 'TeamB') return dentroEmZPositivo;
        return false;
    },

    /*
    =========================================================================
    A APLICAÇÃO — daqui para baixo já se mexe no jogo
    =========================================================================
    */

    // Pares que acabaram de chocar, para o mesmo choque não marcar falta
    // atrás de falta enquanto os dois continuam encostados.
    _arrefecimento: null,

    resetFaltas: function () {
        this._arrefecimento = new Map();
    },

    /*
    Marca a falta: contadores, cartão, expulsão e reposição do jogo.

    A falta é no sítio onde o INFRACTOR está, que é onde o contacto foi.
    */
    marcarFalta: function (infractor, vitima, dados) {
        if (!infractor || !vitima || infractor.expulso) return;
        if (typeof Match === 'undefined' || Match.state !== 'PLAY') return;

        const gravidade = this.gravidadeDaFalta(dados);

        if (typeof MatchStats !== 'undefined') {
            MatchStats[infractor.team].faltas.cometidas++;
            MatchStats[vitima.team].faltas.sofridas++;
        }

        const cartao = this.decidirCartao(gravidade, infractor);
        if (cartao === 'amarelo') {
            infractor.temAmarelo = true;
            if (typeof MatchStats !== 'undefined') MatchStats[infractor.team].cartoes.amarelos++;
        } else if (cartao === 'vermelho') {
            /*
            O segundo amarelo conta como amarelo E como vermelho, que é como
            as estatísticas reais o contam — senão faltava um amarelo aos
            5,22 por jogo sempre que houvesse expulsão.
            */
            if (typeof MatchStats !== 'undefined') {
                if (infractor.temAmarelo) MatchStats[infractor.team].cartoes.amarelos++;
                MatchStats[infractor.team].cartoes.vermelhos++;
            }
            this.expulsar(infractor);
        }

        const pos = infractor.model.position;
        if (this.ehPenalti(pos.x, pos.z, infractor.team)) {
            if (typeof MatchStats !== 'undefined') MatchStats[vitima.team].penaltis++;
            Match.triggerPenalty(vitima.team);
        } else {
            Match.triggerFreeKick(vitima.team);
        }

        if (typeof EventBus !== 'undefined') {
            EventBus.emit('FOUL', {
                infractor: infractor, vitima: vitima,
                gravidade: gravidade, cartao: cartao
            });
        }
    },

    /*
    Expulsa: o jogador sai da lista da equipa e vai para `Match.expulsos`.

    Tirar da lista, em vez de lá deixar uma flag para toda a gente filtrar, é
    a mesma escolha que o cabeçalho deste ficheiro explica para os árbitros:
    quem não joga não anda nas listas de quem joga. Os outros dez MANTÊM as
    posições que tinham — não há reorganização para 4-4-1, porque isso exigia
    formações novas no FormationsData para cada posição perdida.
    */
    expulsar: function (p) {
        if (!p || p.expulso) return;
        p.expulso = true;
        p.hasBall = false;
        if (Match.ballCarrier === p) Match.ballCarrier = null;

        const lista = (p.team === 'TeamA') ? Match.players : Match.opponents;
        const i = lista.indexOf(p);
        /*
        Guarda o INDICE, nao so o jogador: ha codigo que indexa a lista por
        posicao (a cobertura de estilos do js/simulate.js), e devolver o
        expulso ao fim da lista trocava os indices de toda a gente a seguir.
        Ver Match.reporExpulsos.
        */
        if (i >= 0) { p.indiceNaFormacao = i; lista.splice(i, 1); }

        Match.expulsos = Match.expulsos || [];
        Match.expulsos.push(p);
        if (p.model) p.model.visible = false;

        console.log('Officials: ' + p.team + ' (' + p.pos + ') EXPULSO, ficam ' +
            lista.length + ' em campo.');
    },

    /*
    FONTE A: o duelo perdido. Chamado pelo js/fsm.js quando um desarme ou um
    carrinho falha — o desfecho já era conhecido ali, só não custava nada.
    */
    avaliarDueloPerdido: function (defensor, portador, tipo) {
        if (typeof Match === 'undefined' || Match.state !== 'PLAY') return;
        if (!defensor || !portador || defensor.expulso) return;

        const F = RefereeModel.faltas;
        const prob = (tipo === 'carrinho' ? F.probCarrinhoFalhado : F.probDesarmeFalhado) * F.escala;
        if (Math.random() >= prob) return;

        this.marcarFalta(defensor, portador, Object.assign({
            tipo: tipo,
            velocidade: defensor.velocity ? defensor.velocity.length() : 0,
            angulo: this._anguloDeAtaque(defensor, portador),
            travouAtaque: this._ehAtaqueEmProgressao(portador)
        }, this._skillsDe(defensor)));
    },

    /*
    FONTE B: contacto sem tentativa de desarme — empurrões e choques. Corre
    por frame, sobre os pares de adversários que estão perto.
    */
    detectarContactos: function (dt) {
        if (typeof Match === 'undefined' || Match.state !== 'PLAY') return;
        if (!this._arrefecimento) this.resetFaltas();

        const C = RefereeModel.faltas.contacto;
        const prob = C.prob * RefereeModel.faltas.escala * dt;

        for (const [chave, t] of this._arrefecimento) {
            const restante = t - dt;
            if (restante <= 0) this._arrefecimento.delete(chave);
            else this._arrefecimento.set(chave, restante);
        }

        const raio2 = C.raio * C.raio;
        for (const a of Match.players) {
            for (const b of Match.opponents) {
                const dx = a.model.position.x - b.model.position.x;
                const dz = a.model.position.z - b.model.position.z;
                if (dx * dx + dz * dz > raio2) continue;

                const chave = a.model.id + ':' + b.model.id;
                if (this._arrefecimento.has(chave)) continue;

                const vrx = (a.velocity ? a.velocity.x : 0) - (b.velocity ? b.velocity.x : 0);
                const vrz = (a.velocity ? a.velocity.z : 0) - (b.velocity ? b.velocity.z : 0);
                const vRel = Math.sqrt(vrx * vrx + vrz * vrz);
                if (vRel < C.velRelMin) continue;
                if (Math.random() >= prob) continue;

                /*
                Quem entra é quem vai mais depressa. Não é sempre verdade num
                choque real, mas é o critério que não precisa de saber a
                intenção de ninguém.
                */
                const vA = a.velocity ? a.velocity.length() : 0;
                const vB = b.velocity ? b.velocity.length() : 0;
                const infractor = (vA >= vB) ? a : b;
                const vitima = (infractor === a) ? b : a;

                this._arrefecimento.set(chave, C.arrefecimento);
                this.marcarFalta(infractor, vitima, Object.assign({
                    tipo: 'contacto',
                    velocidade: vRel,
                    angulo: this._anguloDeAtaque(infractor, vitima),
                    travouAtaque: this._ehAtaqueEmProgressao(vitima)
                }, this._skillsDe(infractor)));
                return;   // uma falta por frame chega
            }
        }
    },

    // Ângulo entre a frente da vítima e a direcção de onde o infractor vem:
    // 0 de frente, PI pelas costas.
    _anguloDeAtaque: function (infractor, vitima) {
        const vv = vitima.velocity;
        let fx, fz;
        if (vv && (vv.x * vv.x + vv.z * vv.z) > 0.1) {
            const n = Math.sqrt(vv.x * vv.x + vv.z * vv.z);
            fx = vv.x / n; fz = vv.z / n;
        } else {
            _v1.set(0, 0, 1).applyQuaternion(vitima.model.quaternion);
            fx = _v1.x; fz = _v1.z;
        }
        let dx = infractor.model.position.x - vitima.model.position.x;
        let dz = infractor.model.position.z - vitima.model.position.z;
        const d = Math.sqrt(dx * dx + dz * dz) || 1;
        dx /= d; dz /= d;
        return Math.acos(THREE.MathUtils.clamp(fx * dx + fz * dz, -1, 1));
    },

    /*
    Skills do infractor que pesam na gravidade. Se o jogador não tiver
    `skillFor` — os árbitros não têm, e um Match de teste pode não ter —
    devolve vazio, e a gravidade usa a média.
    */
    _skillsDe: function (p) {
        if (!p || typeof p.skillFor !== 'function') return {};
        return { marcacao: p.skillFor('MARKING'), forca: p.skillFor('STRENGTH') };
    },

    // Falta táctica: a vítima ia em progressão para a baliza adversária.
    _ehAtaqueEmProgressao: function (vitima) {
        if (!vitima || !vitima.velocity) return false;
        const vz = vitima.velocity.z * (vitima.dirZ || 1);
        return vz > 3.0;
    }
};
