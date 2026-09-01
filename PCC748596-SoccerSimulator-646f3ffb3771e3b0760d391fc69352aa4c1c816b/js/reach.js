/*
=============================================================================
REACH — alcançar um ponto do mundo com a mão ou com o pé
=============================================================================
A camada que evita ter de gravar uma animação por situação. Diz-se ONDE o
membro tem de chegar, e daqui sai o gesto todo: a cintura gira, o tronco
contrapesa, a anca levanta, o joelho dobra.

Sobre a arquitectura, e porquê assim — ver
docs/superpowers/specs/2026-08-24-reach-animacao-procedural-design.md.

    CAMADA ADITIVA. O ciclo de passada (animateBones) continua a correr e o
    Reach sobrepõe-se SÓ na cadeia envolvida, com um peso. É por isso que o
    jogador continua a correr enquanto estica a perna, que é o que acontece
    num corte a sprintar. Não é um estado exclusivo como o ShotClip ou o
    ThrowInClip, que escrevem a pose inteira.

    A ORDEM DOS PASSOS É O QUE IMPORTA. Cintura primeiro, membro depois. Ao
    contrário, a perna roda sozinha na anca e lê como um boneco articulado —
    é a diferença entre "o pé está no sítio certo" e "o corpo foi buscar a
    bola".

    A POSE É O JOGO. `pontaNoMundo` devolve onde o pé/mão está MESMO, e é
    contra isso que o contacto se decide. O `gk_dive.defender` já trabalha
    assim; aqui isso passa a estar disponível para toda a gente. Pose e
    gameplay deixam de poder discordar.

Geometria do rig, lida de buildBody (player.js) — em unidades do MODELO, que
o IK converte sozinho (ver paraEspacoDoPai em ik.js):

    braço:  lArm  -> lElbow -> lHand    L1 = 1.0   L2 = 0.8   (0.53 m)
    perna:  lLeg  -> lKnee  -> lFoot    L1 = 1.0   L2 = 0.9   (0.56 m)

Em repouso os membros apontam para -Y e a flexão do meio é `rotation.x`
NEGATIVO. O ik.js já assume isto; aqui só se escolhe o pole vector.
=============================================================================
*/

const ReachModel = {
    /*
    Fracção do alcance do membro a partir da qual a CINTURA começa a ajudar.
    Abaixo disto o alvo está confortável e o braço/perna resolve-o sozinho —
    é o que impede o corpo de se contorcer para tocar numa bola que está ali
    ao lado.
    */
    zonaConfortavel: 0.65,

    // Quanto a cintura pode girar e inclinar para ajudar o membro a chegar.
    // Ficam dentro dos JointLimits do `chest` (45° de rotação, 30° lateral).
    giroMax: 40 * Math.PI / 180,
    inclinacaoMax: 26 * Math.PI / 180,

    /*
    CONTRAPESO. O membro oposto abre na direcção contrária, e é isto que dá
    leitura de equilíbrio em vez de boneco de pau. Escala com a mesma folga
    que faz a cintura entrar.
    */
    contrapesoBraco: 0.9,      // rad, abertura máxima do braço oposto
    contrapesoPernaApoio: 0.5, // rad, flexão do joelho de apoio

    /*
    Raio da ponta do membro para efeito de CONTACTO, em metros. O pé é maior
    do que a mão — é uma chuteira, não um ponto.

    Comparar com o `BallControl.reach`, que é 0.9 m medido ao CORPO: o teste
    antigo é bastante mais generoso do que o corpo consegue ser, e é por isso
    que se vê tocar a bola sem lhe chegar.
    */
    raioPe: 0.16,
    raioMao: 0.12,

    // Suavização por omissão quando quem chama não dá peso.
    pesoOmissao: 0.75
};

const Reach = {
    _alvo: new THREE.Vector3(),
    _raiz: new THREE.Vector3(),
    _polo: new THREE.Vector3(),
    _d: new THREE.Vector3(),
    _frente: new THREE.Vector3(),
    _cima: new THREE.Vector3(0, 1, 0),
    _ponta: new THREE.Vector3(),

    /*
    Descrição de cada cadeia: que ossos, que comprimentos, e para que lado
    dobra a articulação do meio.

    O POLE VECTOR é o que separa um membro de um membro partido:
      - perna: a FRENTE do corpo, para o joelho dobrar para a frente;
      - braço: o CIMA do mundo, para o cotovelo ficar por baixo da linha
        ombro-mão (é o que o gk_dive já usa).
    */
    cadeias: {
        peD: { raiz: 'rLeg', meio: 'rKnee', ponta: 'rFoot', tipo: 'perna', lado: -1 },
        peE: { raiz: 'lLeg', meio: 'lKnee', ponta: 'lFoot', tipo: 'perna', lado: +1 },
        maoD: { raiz: 'rArm', meio: 'rElbow', ponta: 'rHand', tipo: 'braco', lado: -1 },
        maoE: { raiz: 'lArm', meio: 'lElbow', ponta: 'lHand', tipo: 'braco', lado: +1 }
    },

    /*
    Comprimento do membro em METROS do mundo, já com a escala do modelo.

    A escala é lida do próprio modelo e não escrita à mão: se o `buildBody`
    mudar de proporções, isto acompanha.
    */
    comprimentoDe(p, nomeCadeia) {
        const c = this.cadeias[nomeCadeia];
        if (!c) return 0;
        const ch = IKChains[c.tipo];
        const escala = (p.model && p.model.scale) ? p.model.scale.x : 1;
        return (ch.L1 + ch.L2) * escala;
    },

    /*
    Alcance TOTAL a partir do corpo, já com o que a cintura acrescenta.

    É isto que o BT deve perguntar antes de tentar um corte, em vez de um
    número fixo: um jogador não decide ir à bola por ela estar a menos de X, e
    sim por lhe conseguir chegar.
    */
    alcanceDe(p, nomeCadeia, comCintura = true) {
        const membro = this.comprimentoDe(p, nomeCadeia);
        if (!comCintura) return membro;
        // O giro da cintura leva o ombro/anca para o lado, e esse deslocamento
        // soma-se ao alcance. O braço de alavanca é a distância do osso ao eixo
        // do corpo.
        const c = this.cadeias[nomeCadeia];
        const rig = p.rig;
        if (!rig || !rig[c.raiz]) return membro;
        const escala = (p.model && p.model.scale) ? p.model.scale.x : 1;
        const offLateral = Math.abs(rig[c.raiz].position.x) * escala;
        return membro + offLateral * Math.sin(ReachModel.giroMax);
    },

    /*
    Onde a ponta do membro está MESMO, no mundo. É contra isto que o contacto
    com a bola se decide — nunca contra uma estimativa.
    */
    pontaNoMundo(p, nomeCadeia, saida) {
        const c = this.cadeias[nomeCadeia];
        const alvo = saida || this._ponta;
        if (!c || !p.rig || !p.rig[c.ponta]) return null;
        p.rig[c.ponta].updateWorldMatrix(true, false);
        return alvo.setFromMatrixPosition(p.rig[c.ponta].matrixWorld);
    },

    // Raio de contacto da ponta desta cadeia, em metros.
    raioDaPonta(nomeCadeia) {
        const c = this.cadeias[nomeCadeia];
        if (!c) return 0;
        return (c.tipo === 'perna') ? ReachModel.raioPe : ReachModel.raioMao;
    },

    /*
    A ponta desta cadeia está a tocar a bola?

    Substitui o teste de distância ao CORPO nos gestos que passam por aqui.
    */
    tocaBola(p, nomeCadeia) {
        const ponta = this.pontaNoMundo(p, nomeCadeia, this._ponta);
        if (!ponta || typeof Match === 'undefined' || !Match.ball) return false;
        const d = ponta.distanceTo(Match.ball.position);
        return d <= this.raioDaPonta(nomeCadeia) + BallPhysics.raio;
    },

    /*
    O GESTO.

        p          jogador
        nomeCadeia 'peD' | 'peE' | 'maoD' | 'maoE'
        alvoMundo  ponto do mundo a alcançar
        opts       { peso, contrapeso }

    Devolve { alcancou, folga, ponta } — `alcancou` false quer dizer que o
    membro ficou esticado na direcção certa sem lá chegar, que é o
    comportamento humano correcto e não um erro.
    */
    alcancar(p, nomeCadeia, alvoMundo, opts) {
        const c = this.cadeias[nomeCadeia];
        const rig = p && p.rig;
        if (!c || !rig || !rig[c.raiz] || !rig[c.meio]) return null;

        const o = opts || {};
        const peso = (typeof o.peso === 'number') ? o.peso : ReachModel.pesoOmissao;
        const M = ReachModel;
        const ch = IKChains[c.tipo];

        this._alvo.copy(alvoMundo);

        /*
        --- 1. FOLGA: quanto o alvo está fora do alcance confortável --------
        Medida a partir da RAIZ do membro (ombro ou anca), não do centro do
        corpo: é o ombro que tem de lá chegar.
        */
        rig[c.raiz].updateWorldMatrix(true, false);
        this._raiz.setFromMatrixPosition(rig[c.raiz].matrixWorld);

        const membro = this.comprimentoDe(p, nomeCadeia);
        const confortavel = membro * M.zonaConfortavel;
        const dist = this._raiz.distanceTo(this._alvo);
        const folga = THREE.MathUtils.clamp(
            (dist - confortavel) / Math.max(0.001, membro), 0, 1);

        /*
        --- 2. CINTURA E TRONCO, ANTES DO MEMBRO ---------------------------
        Roda para o lado do alvo e inclina na direcção dele. É este passo que
        faz a perna levantar POR CAUSA da cintura, em vez de rodar sozinha na
        anca.

        O ângulo é medido no plano, entre a frente do corpo e a direcção do
        alvo; a inclinação sai da componente vertical.
        */
        if (rig.chest && folga > 0.001) {
            this._d.subVectors(this._alvo, this._raiz);
            this._frente.set(0, 0, 1).applyQuaternion(p.model.quaternion);

            const angPlano = Math.atan2(
                this._frente.z * this._d.x - this._frente.x * this._d.z,
                this._frente.x * this._d.x + this._frente.z * this._d.z);

            const giro = THREE.MathUtils.clamp(
                angPlano, -M.giroMax, M.giroMax) * folga * peso;

            // Alvo abaixo da raiz inclina o tronco para a frente/baixo.
            const dv = this._d.y;
            const inclinacao = THREE.MathUtils.clamp(
                -dv * 1.2, -M.inclinacaoMax, M.inclinacaoMax) * folga * peso;

            const lim = (typeof JointLimits !== 'undefined') ? JointLimits : null;
            const gy = lim ? lim.clamp('chest', 'y', giro) : giro;
            const gx = lim ? lim.clamp('chest', 'x', inclinacao) : inclinacao;

            rig.chest.rotation.y = gy;
            rig.chest.rotation.x = rig.chest.rotation.x + (gx - rig.chest.rotation.x) * peso;

            /*
            A cintura acabou de rodar, e o braço é FILHO do chest: sem
            actualizar as matrizes aqui, o IK a seguir converte o alvo para o
            espaço do pai usando a matriz ANTERIOR à rotação, e resolve para o
            sítio errado. Custa uma passagem pela hierarquia e evita um erro
            que só aparece quando a cintura entra.
            */
            p.model.updateWorldMatrix(false, true);
        }

        /*
        --- 3. O MEMBRO, POR IK --------------------------------------------
        O alvo é primeiro limitado ao cone que a articulação alcança (ver
        limitarAlvo): o IK resolve para um alvo já legal, em vez de se lhe
        mexer na pose depois.

        O pole vector decide para que lado a articulação do meio dobra, e é a
        diferença entre um membro e um membro partido.
        */
        this.limitarAlvo(p, nomeCadeia, this._alvo, this._alvoLim || (this._alvoLim = new THREE.Vector3()));

        if (c.tipo === 'perna') {
            this._poloIK = this._poloIK || new THREE.Vector3();
            this._poloIK.set(0, 0, 1).applyQuaternion(p.model.quaternion);
        } else {
            this._poloIK = this._poloIK || new THREE.Vector3();
            this._poloIK.copy(this._cima);
        }

        const alcancou = IK.resolverSuave(
            rig[c.raiz], rig[c.meio], ch.L1, ch.L2, this._alvoLim, this._poloIK, peso);

        /*
        --- 4. CONTRAPESO ---------------------------------------------------
        O membro oposto abre para o lado contrário e a perna de apoio flecte.
        Sem isto o jogador estica-se para a bola como uma tábua.
        */
        if (o.contrapeso !== false && folga > 0.001) {
            this.aplicarContrapeso(p, nomeCadeia, folga * peso);
        }

        // --- 5. LIMITES ANATÓMICOS -------------------------------------
        this.aplicarLimites(p, nomeCadeia);

        return {
            alcancou: alcancou,
            folga: folga,
            /*
            O alvo EFECTIVO — depois de o cone o ter cortado, e já com a
            cintura rodada. Não é necessariamente o que foi pedido, e quem
            precisar de saber onde a ponta ficou tem de olhar para este, não
            para o alvo original.
            */
            alvo: this._alvoLim,
            ponta: this.pontaNoMundo(p, nomeCadeia, this._ponta)
        };
    },

    /*
    Contrapeso: o que o resto do corpo faz enquanto um membro vai à bola.

    Perna a alcançar  -> braço oposto abre e sobe, joelho de apoio flecte.
    Braço a alcançar  -> braço oposto abre para o lado contrário.
    */
    aplicarContrapeso(p, nomeCadeia, k) {
        const c = this.cadeias[nomeCadeia];
        const rig = p.rig;
        const M = ReachModel;

        if (c.tipo === 'perna') {
            // Braço do lado OPOSTO à perna que alcança.
            const bracoOposto = (c.lado > 0) ? rig.rArm : rig.lArm;
            if (bracoOposto) {
                const abertura = -c.lado * M.contrapesoBraco * k;
                bracoOposto.rotation.z = bracoOposto.rotation.z * (1 - k) + abertura * k;
                bracoOposto.rotation.x = bracoOposto.rotation.x * (1 - k) + (-0.7 * k) * k;
            }
            // Joelho da perna de apoio dobra — é ele que aguenta o peso.
            const joelhoApoio = (c.lado > 0) ? rig.rKnee : rig.lKnee;
            if (joelhoApoio) {
                const flex = -M.contrapesoPernaApoio * k;
                joelhoApoio.rotation.x = joelhoApoio.rotation.x * (1 - k) + flex * k;
            }
        } else {
            const bracoOposto = (c.lado > 0) ? rig.rArm : rig.lArm;
            if (bracoOposto) {
                const abertura = -c.lado * M.contrapesoBraco * 0.6 * k;
                bracoOposto.rotation.z = bracoOposto.rotation.z * (1 - k) + abertura * k;
            }
        }
    },

    /*
    Limite da DOBRADIÇA (joelho/cotovelo), aplicado depois do IK.

    Só aqui é que limitar a pose directamente é válido: nestas duas
    articulações o `rotation.x` É a flexão, e o mapeamento para o
    `JointLimits` é directo. A flexão é NEGATIVA neste rig, os limites estão
    em módulo.

    A raiz (anca/ombro) NÃO é limitada aqui — ver `limitarAlvo`, e a nota
    sobre porquê.
    */
    aplicarLimites(p, nomeCadeia) {
        const lim = (typeof JointLimits !== 'undefined') ? JointLimits : null;
        if (!lim) return;
        const c = this.cadeias[nomeCadeia];
        const meio = p.rig[c.meio];
        if (!meio) return;

        if (c.tipo === 'perna') {
            const j = lim.clampJoelho(-meio.rotation.x, meio.rotation.z);
            meio.rotation.x = -j.x;
            meio.rotation.z = j.z;
        } else {
            const flex = lim.clamp('elbow', 'x', -meio.rotation.x);
            meio.rotation.x = -flex;
        }
    },

    /*
    Limita o ALVO ao que a articulação consegue alcançar, ANTES de resolver o
    IK — e não a pose depois dele.

    A primeira versão limitava a pose: convertia o quaternião que o IK escreve
    na raiz para Euler XYZ e aplicava-lhe o `JointLimits`. Media-se e o membro
    ficava a mais de UM METRO do alvo. Duas razões, e a segunda é de fundo:

      1. limitar depois desfaz, por construção, o trabalho do IK — o solver
         pôs a ponta no alvo, e mexer na raiz a seguir tira-a de lá;

      2. o Euler XYZ do quaternião do IK NÃO É o referencial anatómico. Os
         limites do `hip` estão em flexão / abdução / rotação, medidos a
         partir da posição de repouso do membro; o Euler da matriz de rotação
         mistura os três de forma que não se lhes mapeia. Aplicar um ao outro
         é comparar coisas diferentes.

    O que se faz em vez disso é o que os sistemas de animação chamam "reach
    target clamping": projecta-se o alvo para dentro do CONE que a
    articulação alcança, e o IK resolve para esse alvo já legal. O resultado
    está dentro do envelope por construção, sem lhe tocar depois.

    O cone é assimétrico, porque a anca é: muita flexão à frente, pouca
    extensão atrás. Trabalha-se no espaço do PAI da raiz, onde o repouso do
    membro é -Y.
    */
    limitarAlvo(p, nomeCadeia, alvoMundo, saida) {
        const c = this.cadeias[nomeCadeia];
        const rig = p.rig;
        const out = saida.copy(alvoMundo);
        const cone = this.cones[c.tipo];
        if (!cone || !rig[c.raiz]) return out;

        // Direcção raiz -> alvo, no espaço do pai da raiz (repouso = -Y).
        IK.paraEspacoDoPai(rig[c.raiz], alvoMundo, this._d);
        this._d.sub(rig[c.raiz].position);
        const dist = this._d.length();
        if (dist < 1e-5) return out;
        this._d.divideScalar(dist);

        // Ângulo ao repouso, e semi-ângulo permitido nesta direcção.
        const cosAng = -this._d.y;                       // (0,-1,0) . d
        const ang = Math.acos(THREE.MathUtils.clamp(cosAng, -1, 1));

        // Interpola o semi-ângulo entre os quatro quadrantes pelo peso de
        // cada eixo na componente lateral do alvo.
        const lx = this._d.x, lz = this._d.z;
        const nLat = Math.hypot(lx, lz);
        let maxAng = 0;
        if (nLat < 1e-6) {
            maxAng = cone.frente;
        } else {
            const wz = lz / nLat, wx = lx / nLat;
            const aZ = (wz >= 0) ? cone.frente : cone.tras;
            const aX = (wx * c.lado >= 0) ? cone.fora : cone.dentro;
            /*
            Pesos QUADRÁTICOS. Com `|wz|` e `|wx|` a soma vai até √2, e a
            "interpolação" dava mais do que o maior dos dois limites: medido,
            um alvo com wz=0.86 e wx=0.50 dava 0.86×120 + 0.50×45 = 126°,
            acima dos 120° da flexão máxima da anca. Os quadrados somam 1 por
            construção (wz² + wx² = 1) e desenham uma elipse entre os quatro
            semi-ângulos, que é a forma que o cone deve ter.
            */
            maxAng = wz * wz * aZ + wx * wx * aX;
        }

        /*
        O cone é da ARTICULAÇÃO, portanto limita o OSSO DE CIMA (fémur/úmero)
        — e esse não aponta para o alvo: fica a `A` graus da linha até ele,
        porque a articulação do meio está dobrada. `A` sai da lei dos cossenos,
        a mesma que o IK usa.

        Sem descontar o `A`, o alvo ficava dentro do cone e o fémur saía dele:
        medido, 128° com um cone de 120°. O desvio é sempre na direcção do pole
        vector, logo desconta-se sempre.
        */
        const ch = IKChains[c.tipo];
        const Dmin = Math.abs(ch.L1 - ch.L2) + 1e-3;
        const Dmax = ch.L1 + ch.L2 - 1e-3;
        const D = Math.min(Dmax, Math.max(Dmin, dist));
        const cosA = (ch.L1 * ch.L1 + D * D - ch.L2 * ch.L2) / (2 * ch.L1 * D);
        const A = Math.acos(THREE.MathUtils.clamp(cosA, -1, 1));
        maxAng = Math.max(0, maxAng - A);

        if (ang <= maxAng) return out;

        /*
        Fora do cone: roda a direcção de volta até à borda, à volta do eixo
        perpendicular ao plano (repouso, alvo). O alvo mantém a distância —
        muda de sítio, não de longe.
        */
        const repouso = this._polo.set(0, -1, 0);
        const eixo = this._frente.crossVectors(repouso, this._d);
        if (eixo.lengthSq() < 1e-9) return out;
        eixo.normalize();

        const q = this._q || (this._q = new THREE.Quaternion());
        q.setFromAxisAngle(eixo, maxAng);
        this._d.copy(repouso).applyQuaternion(q).multiplyScalar(dist).add(rig[c.raiz].position);

        // De volta ao mundo.
        rig[c.raiz].parent.updateWorldMatrix(true, false);
        return out.copy(this._d).applyMatrix4(rig[c.raiz].parent.matrixWorld);
    },

    /*
    Semi-ângulos do cone de alcance, em radianos, medidos a partir do repouso
    do membro (que aponta para -Y).

    Anca: os valores do `JointLimits.hip` — 120° de flexão à frente, 30° de
    extensão atrás, 45° de abdução para fora, 30° de adução para dentro.

    Ombro: quase esférico. O `JointLimits.shoulder` dá 180° de elevação
    frontal e lateral, portanto o cone quase não corta nada — o que limita um
    braço é o comprimento e o cotovelo, não o cone.
    */
    cones: {
        perna: {
            frente: 120 * Math.PI / 180,
            tras: 30 * Math.PI / 180,
            fora: 45 * Math.PI / 180,
            dentro: 30 * Math.PI / 180
        },
        braco: {
            frente: 170 * Math.PI / 180,
            tras: 60 * Math.PI / 180,
            fora: 170 * Math.PI / 180,
            dentro: 130 * Math.PI / 180
        }
    }
};
