function ownGoalZCenter(team) {
    return (team === 'TeamA') ? -48 : 48;
}

/*
Efeito real do passe: bola sai do pé. Chamado UMA vez por ActionState.onContact
(ver initiatePass em player.js), no frame em que a pose de chute atinge o
tempo de contacto — não no frame em que o BT decidiu passar. Corpo idêntico
ao antigo bloco `if (p.hasBall && p.passTarget)` do case 'PASS', só movido
para fora do timer bruto.
*/
function executePassGameplay(p) {
    // Lançamento: a bola vai para o ESPAÇO, não para o colega. A força é
    // calibrada para lá chegar mesmo (ver PassModel).
    let ehLancamento = false;
    let lancamentoAlto = false;
    if (p.isThroughBall && p.throughBallTarget) {
        p.isThroughBall = false;
        p.throughBallTarget = null;
        ehLancamento = true;
        lancamentoAlto = !!p.throughBallAlto;
        p.throughBallAlto = false;
    }
    const ehCruzamento = !!p.isCross;
    // Capturado antes de p.isCross ser limpo mais abaixo.
    const tipoPasseStats = ehLancamento ? 'lancamento' : (ehCruzamento ? 'cruzamento' : 'passe');

    _v1.copy(p.passTargetPos);

    /*
    Direcção e distância no PLANO. Antes usava-se a distância 3D e a direcção
    normalizada em 3D — e depois `ballVel.copy(_v2).multiplyScalar(forca)`
    escrevia as TRÊS componentes.

    Isso apagava, no mesmo instante, todos os `Match.ballVel.y = ...` que os
    ramos acima tinham acabado de definir: o `6.8` do cruzamento, o
    `2 + dist*0.12` do passe longo, tudo. A altura da bola vinha só de
    `_v2.y`, ou seja da diferença de alturas entre a bola e o alvo — quase
    zero. Nenhum passe longo nem cruzamento subia alguma vez do chão.
    */
    const dxAlvo = _v1.x - Match.ball.position.x;
    const dzAlvo = _v1.z - Match.ball.position.z;
    let distToTarget = Math.hypot(dxAlvo, dzAlvo);

    /*
    ERRO DE DIRECCAO. Antes o passe saia sempre na linha exacta do alvo: o
    unico erro era no peso, e por isso nenhuma bola se perdia por ter saido
    torta. Ver PassErrorModel/sigmaDePasse.

    A rotacao e aplicada a DIRECCAO e nao ao ponto: rodar o ponto mudava
    tambem a distancia, e a distancia ja tem o seu proprio erro logo abaixo.
    */
    const passSkill = p.skillFor ? p.skillFor('PASS') : 50;
    const tecSkill = p.skillFor ? p.skillFor('TEC') : 50;

    /*
    Adversario mais proximo de QUEM PASSA (nao da linha de passe: isso ja e
    o filtro de sombra no findPassTarget). E o que mede o aperto.
    */
    const adversarios = (p.team === 'TeamA') ? Match.opponents : Match.players;
    let distAdversario = Infinity;
    for (const o of adversarios) {
        if (o.role === 'gk' || !o.model) continue;
        // Distancia no PLANO (ver comentario acima) — nao 3D, senao a
        // altura do adversario entra na conta do aperto sem fazer sentido.
        const d = Math.hypot(
            p.model.position.x - o.model.position.x,
            p.model.position.z - o.model.position.z);
        if (d < distAdversario) distAdversario = d;
    }

    /*
    ANGULO DO CORPO. A leitura tem de ser a que foi guardada em initiatePass
    (this.cosCorpoNoPasse), NAO a lida agora: o case 'PASS' abaixo (ver
    slerp de p.model.quaternion) roda o jogador para o alvo a 25*dt por
    frame desde o instante em que o passe arranca, por isso a esta altura
    (contacto) ele ja esta praticamente virado para o alvo e cosCorpo daria
    quase sempre ~1 — a penalizacao de costas nunca dispararia num jogo
    real, so nos testes unitarios que chamam sigmaDePasse directamente.
    */
    let cosCorpo;
    if (typeof p.cosCorpoNoPasse === 'number') {
        cosCorpo = p.cosCorpoNoPasse;
    } else {
        // Frente local do modelo e +Z (ver pass_candidates.js).
        _vFrenteCorpo.set(0, 0, 1).applyQuaternion(p.model.quaternion);
        const normDir = Math.hypot(dxAlvo, dzAlvo) || 1;
        cosCorpo = (_vFrenteCorpo.x * dxAlvo + _vFrenteCorpo.z * dzAlvo) / normDir;
    }
    p.cosCorpoNoPasse = null;

    const sigma = sigmaDePasse({
        passSkill: passSkill,
        tecSkill: tecSkill,
        distAdversario: distAdversario,
        cosCorpo: cosCorpo,
        distPasse: distToTarget
    });
    const desvio = sigma * amostraGaussiana(Math.random);
    const rodado = rodarNoPlano(dxAlvo, dzAlvo, desvio);

    const dirX = distToTarget > 0.001 ? rodado.x / distToTarget : 0;
    const dirZ = distToTarget > 0.001 ? rodado.z / distToTarget : 1;

    /*
    O erro de PESO tem de ser aplicado na DISTANCIA ALVO, antes da
    balistica. Aplicar um multiplicador na velocidade calculada com arrasto
    quadratico fazia o erro na distancia explodir de forma nao-linear —
    passes saiam absurdamente longos ou curtos.
    */
    const erroDist = 1 + (Math.random() * 2 - 1) * PassModel.erroPesoMax * (1 - passSkill / 100);
    distToTarget *= erroDist * fatorForcaSobPressao(distAdversario);

    /*
    A força do passe sai da BALÍSTICA, não de uma heurística.

    Era `forca = dist * 0.85` com `vy = min(6.5, 2 + dist*0.12)` — números
    calibrados contra a física antiga (g = 15, arrasto exponencial). Medido
    com a física real: o primeiro toque caía 4 m antes do alvo num passe de
    25 m e 17 m antes num de 70 m, e a bola nunca chegava a quem devia. Agora
    pede-se o ALCANCE e resolve-se a velocidade (ver utils.js).

    Elevação por distância: mais alto no passe curto-longo (para passar por
    cima de quem está no meio), mais raso no passe muito longo (chega antes).
    */
    let forcaPasse = 18.0;
    let usouBalistica = false;

    /*
    ENCONTRO. Quando o alvo é um PONTO à frente do companheiro — lançamento,
    passe no espaço, passe em profundidade — a força deixa de sair só da
    distância e passa a resolver o encontro: a bola chega ao ponto quando ele
    lá chega e a uma velocidade que ele consiga aceitar (ver `passeDeEncontro`
    em utils.js e PassModel.encontro).

    `null` quando o alvo é o próprio companheiro (passe aos pés): aí não há
    encontro nenhum para resolver, e é o caminho que já estava certo.
    */
    const encontro = (function () {
        const E = PassModel.encontro;
        const receptor = p.passTarget;
        if (!E || !receptor || !receptor.model) return null;

        const rx = receptor.model.position.x, rz = receptor.model.position.z;
        const distReceptor = Math.hypot(_v1.x - rx, _v1.z - rz);
        if (distReceptor < E.distMinAlvo) return null;

        // Velocidade dele NA DIRECÇÃO do ponto: quem vai para lá já está a
        // caminho, quem vai ao contrário tem de inverter, e isso é tempo.
        const ux = (_v1.x - rx) / distReceptor, uz = (_v1.z - rz) / distReceptor;
        const vRec = receptor.velocity
            ? receptor.velocity.x * ux + receptor.velocity.z * uz : 0;

        // A que ele CORRE, não a que vai agora: o speedMult é a velocidade
        // que o steerArrive persegue.
        const vMaxRec = (typeof receptor.speedMult === 'number' && receptor.speedMult > 0.5)
            ? receptor.speedMult : 6.0;

        /*
        Velocidade dele projectada na DIRECÇÃO DO PASSE (bola -> ponto): é a
        que se desconta ao tecto de chegada, porque quem foge da bola não a
        recebe à velocidade dela mas à diferença das duas. Positiva quando ele
        vai no mesmo sentido que ela.
        */
        const px = _v1.x - Match.ball.position.x, pz = _v1.z - Match.ball.position.z;
        const normP = Math.hypot(px, pz) || 1;
        const vRecNoPasse = receptor.velocity
            ? Math.max(0, (receptor.velocity.x * px + receptor.velocity.z * pz) / normP) : 0;

        return passeDeEncontro({
            distBola: distToTarget,
            distReceptor: distReceptor,
            vReceptor: vRec,
            vReceptorNoPasse: vRecNoPasse,
            vMaxReceptor: vMaxRec
        });
    })();

    if (ehLancamento) {
        /*
        TIPO 2 — LANÇAMENTO. A bola vai para o ESPAÇO à frente do companheiro,
        nunca para cima dele: o alvo (`throughBallTarget`) já é esse ponto.

        Pelo alto quando há marcadores no corredor (decidido em
        findThroughBall): passa por cima deles e aterra no mesmo sítio.
        Rasteiro quando o caminho está limpo — chega mais depressa e ele
        recebe-a a correr.
        */
        if (lancamentoAlto) {
            let elevL = resolverElevacaoPasse(distToTarget, true) ?? PassModel.elevacaoLancamento;
            /*
            O alcance é o mesmo para duas elevações; usa-se essa liberdade para
            casar o TEMPO com a corrida do companheiro, sem mexer no sítio onde
            a bola cai (ver elevacaoParaTempoDeVoo).
            */
            if (encontro) {
                elevL = elevacaoParaTempoDeVoo(distToTarget,
                    encontro.tempoReceptor + PassModel.encontro.folgaTempo,
                    PassModel.encontro.elevMin, PassModel.encontro.elevMax);
            }
            // E o tecto de altura: a faixa de ângulos sozinha deixava um
            // lançamento de 55 m subir 17 m (ver elevacaoComTectoDeApex).
            elevL = elevacaoComTectoDeApex(distToTarget, elevL,
                PassModel.passeArco.apexMax, PassModel.passeArco.elevMinLonga);
            const vL = velocidadeParaAlcance(distToTarget, elevL);
            Match.ballVel.y = vL * Math.sin(elevL);
            forcaPasse = vL * Math.cos(elevL);
        } else {
            /*
            O encontro manda quando existe: é exactamente para isto que ele
            serve — bola e homem no mesmo ponto ao mesmo tempo. Sem receptor
            conhecido cai no cálculo antigo, só pela distância, sem o reforço
            do passe curto (aqui o alvo já é o espaço à frente de quem corre).
            */
            forcaPasse = encontro
                ? encontro.v0
                : velocidadeRasteiraPara(distToTarget,
                    PassModel.vChegadaLancamento, { reforcoCurto: false });
            Match.ballVel.y = 0;
        }
        usouBalistica = true;
    } else if (p.isCross) {
        /*
        Alto ou rasteiro — decidido no findCross (player_bt.js) conforme haja
        alguém na linha do cruzamento, a distância ao alvo e o jogo aéreo dele.

        Rasteiro sai mais forte e junto ao chão: chega antes e não dá tempo ao
        guarda-redes de sair. Alto passa por cima de quem está no caminho.
        */
        if (p.crossAlto === false) {
            forcaPasse = velocidadeRasteiraPara(distToTarget, PassModel.vChegadaCruzamento);
            Match.ballVel.y = 0;
        } else {
            /*
            TIPO 3 — CRUZAMENTO ALTO. Tem de chegar à altura da CABEÇA dele,
            ainda no ar, para poder cabecear à baliza.

            `velocidadeParaAlcance` punha a bola no CHÃO no ponto do alvo —
            chegava sempre baixa de mais para cabecear. Aqui pede-se a
            velocidade que a põe a `alturaCruzamento` quando lá chega.
            */
            const elevC = PassModel.elevacaoCruzamento;
            let vC = velocidadeParaAlturaEm(distToTarget, PassModel.alturaCruzamento, elevC);
            // Longe de mais para chegar à cabeça: manda o melhor que consegue.
            if (vC === null) vC = velocidadeParaAlcance(distToTarget, elevC);
            Match.ballVel.y = vC * Math.sin(elevC);
            forcaPasse = vC * Math.cos(elevC);
        }
        usouBalistica = true;
        p.isCross = false;
        p.crossAlto = undefined;
    } else {
        /*
        TIPO 1 — PASSE NORMAL. Forma por faixa de distância (pedido
        explícito, ver PassModel.passeArco em config.js): <=15m sempre
        rasteiro; 15-30m sorteia entre rasteiro e um arco raso com tecto de
        altura por faixa; >=30m sorteia entre rasteiro e lançado, com ângulo
        entre 30-45°. Estilo de passe "longo" força sempre o arco acima
        de `rasteiroMax` (`forcarArco`), como já fazia antes.
        */
        /*
        A DEVOLUCAO DO GUARDA-REDES COM A MAO nao passa por aqui.

        O passe normal sorteia arco por faixa de distancia, e por isso a
        entrega do guarda-redes saia lobada: medida a 15.8 m, subia a 2.27 m
        de apex (3.27 no pior caso) — por cima da cabeca de quem a ia receber.
        Um guarda-redes rola a bola ou atira-a rente; nunca a lobe.

        Ate `rasteiraMax` vai pelo chao; dai para a frente e a trajectoria
        mais baixa que la chega, com o apex travado a altura do PEITO
        (`apexMax`). Sem solucao dentro do tecto, rola — ver GkThrowModel.
        */
        const G = (typeof GkThrowModel !== 'undefined') ? GkThrowModel : null;
        if (p.isGkThrow && G) {
            p.isGkThrow = false;
            let resolvido = false;
            // A bola parte da MAO: o que sobra ate ao tecto e o que ela pode
            // SUBIR. Medir o apex a partir da largada deixava-a a 2.3 m do chao.
            const y0Mao = Math.max(BallPhysics.raio, Match.ball.position.y);
            const subidaMax = G.apexMax - y0Mao;
            if (distToTarget > G.rasteiraMax && subidaMax > 0.05) {
                const elevG = elevacaoComTectoDeApex(
                    distToTarget, G.elevMax, subidaMax, G.elevMin);
                const vG = velocidadeParaAlcance(distToTarget, elevG);
                const subida = (vG !== null)
                    ? Math.pow(vG * Math.sin(elevG), 2) / (2 * BallPhysics.gravidade)
                    : Infinity;
                if (vG !== null && vG <= G.vMax && subida <= subidaMax + 0.02) {
                    Match.ballVel.y = vG * Math.sin(elevG);
                    forcaPasse = vG * Math.cos(elevG);
                    resolvido = true;
                }
            }
            if (!resolvido) {
                /*
                A BOLA ROLADA SAI DO CHAO, nao da mao.

                O `velocidadeRasteiraPara` resolve uma bola que ROLA desde o
                inicio; larga-la a 1.1 m fazia-a cair, ressaltar e perder a
                energia toda no caminho — medido, a 18 m chegava a 1.6 m/s em
                vez dos 7.5 pedidos, e a 20 m ja nao chegava. Um guarda-redes
                que rola a bola poe-lhe a mao no relvado, que e o que isto e.
                */
                Match.ball.position.y = BallPhysics.raio;
                forcaPasse = Math.min(G.vMax,
                    velocidadeRasteiraPara(distToTarget, G.vChegada));
                Match.ballVel.y = 0;
            }
            usouBalistica = true;
        }

        const forcarArco = (Tatics.passe === 'longo');
        const elev = (p.isGkThrow || usouBalistica)
            ? null : resolverElevacaoPasse(distToTarget, forcarArco);

        if (usouBalistica) {
            // Ja resolvido acima (entrega do guarda-redes).
        } else if (elev === null) {
            /*
            Passe rasteiro: chega jogável, não morto nem a queimar.

            Com alvo à frente do companheiro (passe no espaço, `passAimPoint`)
            é o encontro que decide — e é aí que estava o erro: a mesma conta
            do passe aos pés aplicada a um ponto 10 m à frente dele punha a
            bola no sítio muito antes dele. Aos pés, `encontro` é null e nada
            muda.
            */
            forcaPasse = encontro
                ? encontro.v0
                : velocidadeRasteiraPara(distToTarget, PassModel.vChegadaRasteira);
            Match.ballVel.y = 0;
        } else {
            /*
            PASSE PELO ALTO. O alcance pedido é o ponto de encontro com o
            colega, já antecipado por `alvoDePasse`. O recuo fixo de 1.5 m
            fazia a bola aterrar ANTES desse encontro: quando o receptor corria
            ao encontro da bola, chegava ao ponto de queda antes dela e via-a
            passar por cima; quando fugia, a bola caía atrás dele.

            O recuo passa a depender do movimento do receptor relativamente ao
            sentido do passe:
              - vem ao encontro da bola  -> recuo zero (encontram-se no ponto)
              - afasta-se do passador     -> bola adiantada (recuo negativo)
              - lateral/lento             -> pequeno recuo, como antes
            */
            let recuo = PassModel.recuoPasseAlto;
            const receiver = p.passTarget;
            if (receiver && receiver.velocity && distToTarget > 0.001) {
                const udx = dxAlvo / distToTarget;
                const udz = dzAlvo / distToTarget;
                const dot = receiver.velocity.x * udx + receiver.velocity.z * udz;
                if (dot > 1.0) {
                    // Corre no sentido do passe: a bola tem de cair à frente.
                    recuo = -PassModel.recuoPasseAlto * 0.7;
                } else if (dot < -1.0) {
                    // Vem ao encontro da bola: não encurtar.
                    recuo = 0;
                } else {
                    recuo = PassModel.recuoPasseAlto * 0.4;
                }
            }

            const alcancePasse = Math.max(1.0, distToTarget - recuo);

            /*
            Com alvo à frente do companheiro, a elevação passa a sair do TEMPO
            que ele leva ao ponto — mesma queda, outro tempo de voo. Aos pés
            (`encontro` null) fica a elevação que o resolverElevacaoPasse deu.
            */
            const elevFinal = encontro
                ? elevacaoParaTempoDeVoo(alcancePasse,
                    encontro.tempoReceptor + PassModel.encontro.folgaTempo,
                    PassModel.encontro.elevMin, PassModel.encontro.elevMax)
                : elev;

            /*
            O tecto de apex depende da distância: abaixo de `distanciaAlto`
            (30 m) a bola não passa de `apexMaxCurto` (1 m), com um piso de
            ângulo próprio para lá caber. Acima, vale o tecto normal.
            */
            const B = PassModel.passeArco;
            const curto = alcancePasse < B.distanciaAlto;
            const elevComTecto = elevacaoComTectoDeApex(alcancePasse, elevFinal,
                curto ? B.apexMaxCurto : B.apexMax,
                curto ? B.elevMinCurto : B.elevMinLonga);

            const v = velocidadeParaAlcance(alcancePasse, elevComTecto);
            Match.ballVel.y = v * Math.sin(elevComTecto);
            forcaPasse = v * Math.cos(elevComTecto);
        }
        usouBalistica = true;
    }

    /*
    O MULTIPLICADOR GLOBAL DE 1.20 SAIU DAQUI.

    Estava assim, para TODOS os passes, lancamentos e cruzamentos:

        forcaPasse *= 1.20;
        Match.ballVel.y /= 1.20;

    Passava por cima de toda a balistica que acabou de ser resolvida. A
    calibracao do passe e feita pela velocidade de CHEGADA
    (PassModel.vChegadaRasteira) e nao pela de saida — pede-se "quero que
    chegue a 7.5 m/s" e o velocidadeRasteiraPara inverte o arrasto e o
    rolamento para dar a saida. Com o 1.20 por cima, a chegada deixava de
    descrever o que sai: um passe de 5 m chegava a ~10.6 m/s, acima do
    `BallControl.easySpeed` (9.69), e o receptor falhava o primeiro toque numa
    bola de cinco metros.

    O `/1.20` na vertical era pior ainda: o passe alto foi resolvido para uma
    elevacao, e saia com outra — o alcance que a conta garantia deixava de
    valer.

    A manipula do ritmo continua a existir, e e o `vChegadaRasteira`: subi-lo
    acelera a bola toda sem partir a relacao entre saida, chegada e dominio.
    */

    /*
    E A REDUCAO DE 15% DOS LANCAMENTOS SAIU COM ELE.

    Estava aqui uma reducao de 15% para lancamentos longos ou laterais. Somada
    ao 1.20 global que vinha imediatamente antes dava 1.20 x 0.85 = 1.02, ou
    seja NADA: o 0.85 existia so para cancelar o 1.20 neste caminho.

    Tirar o 1.20 e deixar o 0.85 deixava os lancamentos 15% fracos, e um passe
    no espaco 15% fraco nao chega a lado nenhum — medido, um lancamento de 25 m
    morria aos 20. Era isso que se lia como "so os passes directos estao
    certos".

    Quem manda na forca do lancamento e o `PassModel.vChegadaLancamento`: e a
    velocidade a que a bola chega ao PONTO, e o ponto ja e a frente do
    companheiro.
    */

    /*
    E A REDUCAO DE 20% DOS CRUZAMENTOS TAMBEM. Mesmo par: 1.20 x 0.80 = 0.96,
    ou seja o 0.80 tambem existia so para cancelar o 1.20 global. Deixa-lo
    sozinho punha os cruzamentos 20% fracos — a bola cai antes da area.

    O cruzamento alto e resolvido para chegar a `PassModel.alturaCruzamento` no
    ponto do alvo (velocidadeParaAlturaEm): mexer na forca depois disso desfaz
    exactamente a conta que garante a bola a altura da cabeca.
    */

    // Percepção de limites do campo: se o vetor do passe estiver indo em direção à linha lateral
    // ou de fundo, o passador pondera a força de modo a não chutar a bola para além do gramado.
    if (typeof CAMPO_LARG !== 'undefined' && typeof CAMPO_COMP !== 'undefined') {
        const margemFisica = 1.8;
        const limFisicoX = (CAMPO_LARG / 2) - margemFisica;
        const limFisicoZ = (CAMPO_COMP / 2) - margemFisica;
        const posBola = Match.ball.position;

        // Calcula a distância máxima que a bola pode percorrer nessa direção antes de sair
        let distMaxLinha = Infinity;
        if (dirX > 0.05) {
            distMaxLinha = Math.min(distMaxLinha, (limFisicoX - posBola.x) / dirX);
        } else if (dirX < -0.05) {
            distMaxLinha = Math.min(distMaxLinha, (-limFisicoX - posBola.x) / dirX);
        }
        if (dirZ > 0.05) {
            distMaxLinha = Math.min(distMaxLinha, (limFisicoZ - posBola.z) / dirZ);
        } else if (dirZ < -0.05) {
            distMaxLinha = Math.min(distMaxLinha, (-limFisicoZ - posBola.z) / dirZ);
        }

        if (distMaxLinha > 0 && distMaxLinha < distToTarget) {
            // A trajetória apontaria para fora antes do alvo: dosar a força para morrer dentro do campo
            const fatorAjuste = Math.max(0.65, distMaxLinha / distToTarget);
            forcaPasse *= fatorAjuste;
            Match.ballVel.y *= fatorAjuste;
        }
    }

    // O erro (Skill do passador) já foi aplicado na distToTarget lá em cima,
    // para não quebrar a escala não-linear da balística.
    if (!usouBalistica) {
        forcaPasse *= 1.0 + ((TeamSkills[p.team].mid - 50) / 100) * 0.4;
    }

    // `forcaPasse` é a componente HORIZONTAL; o y já foi posto acima.
    Match.ballVel.set(dirX * forcaPasse, Match.ballVel.y, dirZ * forcaPasse);

    /*
    SOM DO CHUTE. Aqui e não no `initiatePass`: este é o instante do CONTACTO
    (o ActionState chama esta função no contactTime do clip), que é onde o som
    tem de cair para casar com a pose. A força escala com a velocidade de
    saída — um passe curto soa menos do que um lançamento.
    */
    if (typeof EfeitosSonoros !== 'undefined' && !p.semSomDeChute) {
        EfeitosSonoros.chute(Match.ball.position, forcaPasse / 20.0);
    }
    // Relançamento à mão do guarda-redes: reusa esta balística mas não é um
    // chute. Ver releaseFromHands (player.js).
    p.semSomDeChute = false;

    // A bola saiu do pé: a autorização de primeira morre com ela.
    p.jogarDePrimeira = false;
    p.hasBall = false;
    p.touchLock = BallControl.touchLock;
    if (p.role !== 'gk') {
        p.passInertiaTimer = 4.0;
        p.passInertiaZDir = p.model.position.z * p.dirZ;
    }
    /*
    TOCA E SEGUE. Quem acaba de passar fica livre para arrancar no frame
    seguinte, em vez de esperar o arrefecimento de uma corrida anterior. E o
    que faz o toca-e-recebe: sem isto o passador ficava a ver a bola sair e a
    jogada morria no sitio onde nasceu.
    */
    p.runCooldown = 0;

    /*
    RECUO PARA O GUARDA-REDES. Sai daqui porque daqui e que sai um passe com o
    PE — a cabecada e a matada no peito tem caminhos proprios e nao passam por
    esta funcao, que e exactamente a distincao que a regra faz.

    Marca a equipa; quem limpa e o toque seguinte de outra pessoa (ver
    resolveBallContact em match.js).
    */
    if (p.role !== 'gk' && p.passTarget && p.passTarget.role === 'gk' &&
        p.passTarget.team === p.team) {
        Match.recuoParaGR = p.team;
    }

    Match.ballCarrier = null;
    Match.intendedReceiver = p.passTarget;
    if (Match.passTargetVisual) Match.passTargetVisual.visible = false;
    if (Match.passLineVisual) Match.passLineVisual.visible = false;
    Match.passTargetPos = { x: p.passTargetPos.x, z: p.passTargetPos.z };
    Match.lastTouchedTeam = p.team;
    Match.lastTouchedPlayer = p;
    if (typeof MatchStats !== 'undefined') {
        // Telemetria: distância pedida, se saiu pelo alto e com que
        // velocidade horizontal. Ver MatchStats.resumoPasses.
        MatchStats.registarPasseIniciado(p.team, tipoPasseStats, {
            dist: distToTarget,
            alto: Match.ballVel.y > 0.01,
            vx: Match.ballVel.x,
            vz: Match.ballVel.z
        });
    }
}

/*
GAMEPLAY DO REMATE — o que acontece quando o pé bate na bola.

Vivia inline no case 'SHOOT', disparado no primeiro frame depois de
`timer >= 0.08`. Saiu para aqui pela mesma razão que o passe saiu (ver
executePassGameplay): o efeito tem de cair no CONTACTO do gesto, e quem o
dispara é o ActionState do ShotClip, não a passagem de um timer.

Nada aqui mudou de conteudo — os pesos de resultado, o duelo com o bloqueador
e o aviso ao guarda-redes sao os mesmos.
*/
function executeShotGameplay(p) {
    /*
    xG E ATAQUE PERIGOSO, no instante do contacto e antes de se saber o
    desfecho — que é a definição de xG: quanto VALIA a oportunidade, não o que
    ela deu. Contado aqui e não no `initiateShoot` porque ali o gesto ainda
    pode furar (bola a caminho do pé), e uma furada não é uma oportunidade.

    Bloqueados entram: um remate travado por um defensor à saída do pé foi uma
    oportunidade criada, e é assim que os fornecedores a contam.
    */
    if (typeof MatchStats !== 'undefined' && typeof xgDoRemate === 'function') {
        MatchStats[p.team].xg += xgDoRemate(
            p.model.position.x, p.model.position.z,
            p.targetGoalZ, LARGURA_BALIZA, XGModel);
        MatchStats.registarRemateNoAtaque(p.team);
    }

    const opponentsShoot = (p.team === 'TeamA') ? Match.opponents : Match.players;
    let bloqueador = null, distBloqueio = 999;
    for (const opp of opponentsShoot) {
        if (opp.role === 'gk') continue;
        const d = opp.model.position.distanceTo(p.model.position);
        if (d < 2.2 && d < distBloqueio) { distBloqueio = d; bloqueador = opp; }
    }
    // Bloqueado: Técnica (chutador) x Marcação (quem está em cima
    // dele) — base 0.6, favorece o chutador (defensor tem de
    // acertar o corte no timing certo).
    const bloqueado = bloqueador && !venceuDuelo(p.skillFor('TEC'), bloqueador.skillFor('MARKING'), 0.6);

    let pow, alvoX, alvoY;

    if (bloqueado) {
        // Bola desviada, curta e fraca — não mira a baliza.
        pow = 4.0 + Math.random() * 2.4;
        alvoX = p.model.position.x + (Math.random() - 0.5) * 4.0;
        alvoY = 0.3;
    } else {
        /*
        TIPO, MIRA E ERRO — ver o bloco novo do ShotModel (config.js) e as
        funções em utils.js. O desfecho NÃO se sorteia: escolhe-se onde a bola
        vai, erra-se por cima disso, e o resto resolve-se sozinho — a madeira
        no `colidirComBaliza` (match.js), o guarda-redes no GkCatchModel.
        */
        const gkDef = (p.team === 'TeamA') ? Match.opponents[0] : Match.players[0];

        _v1.set(0, 0, p.targetGoalZ);
        const distBaliza = p.model.position.distanceTo(_v1);

        // Ângulo com a perpendicular à linha de fundo: junto à linha a baliza
        // é uma fresta, e isso tem de pesar na mira.
        const dzBaliza = Math.abs(p.targetGoalZ - p.model.position.z);
        const anguloBaliza = Math.atan2(Math.abs(p.model.position.x), Math.max(0.1, dzBaliza));

        // Quanto o guarda-redes está adiantado (para o chapéu ser opção).
        const gkAdiantado = gkDef
            ? Math.max(0, Math.abs(p.targetGoalZ) - Math.abs(gkDef.model.position.z))
            : 0;

        const tipoRemate = tipoDeRemate({
            dist: distBaliza,
            tec: p.skillFor('TEC'),
            distAdversario: distBloqueio,
            gkAdiantado: gkAdiantado
        });

        const mira = miraDeRemate({
            tipo: tipoRemate,
            gkX: gkDef ? gkDef.model.position.x : 0
        });

        const sigma = sigmaDeRemate({
            dist: distBaliza,
            tec: p.skillFor('TEC'),
            distAdversario: distBloqueio,
            angulo: anguloBaliza,
            tipo: tipoRemate
        });

        alvoX = mira.x + sigma.lateral * amostraGaussiana(Math.random);
        alvoY = Math.max(0.08, mira.y + sigma.vertical * amostraGaussiana(Math.random));

        pow = Math.max(ShotModel.potenciaMin,
            ShotModel.potenciaBase + ((p.skillFor('TEC') - 50) / 50) * ShotModel.potenciaPorSkill)
            * ShotModel.tipos[tipoRemate].potencia;

        /*
        NO ALVO: agora é uma medida da bola e não uma etiqueta do sorteio —
        o ponto visado, depois do erro, cai dentro da moldura?

        Postes e travessão ficam de fora por definição (a bola bate na madeira
        e não entra), como nos fornecedores de estatística.
        */
        if (typeof MatchStats !== 'undefined' &&
            Math.abs(alvoX) < LARGURA_BALIZA / 2 && alvoY < ALTURA_BALIZA) {
            MatchStats[p.team].remates.noAlvo++;
        }

        p.ultimoRemateTipo = tipoRemate;
    }

    /*
    Mira: resolve a ELEVAÇÃO que põe a bola no ponto
    visado à velocidade `pow` (ver elevacaoParaAlvo).

    A conta antiga compensava a gravidade com
    `t = dZ / pow; cY = ½·g·t²` — usava a velocidade 3D
    como se fosse horizontal e ignorava o arrasto (12-22
    m/s² a esta velocidade), por isso subestimava o tempo
    de voo duas vezes e o remate saía sempre por baixo.
    */
    _v1.set(alvoX, alvoY, bloqueado ? Match.ball.position.z + p.dirZ * 3 : p.targetGoalZ);
    const dxR = _v1.x - Match.ball.position.x;
    const dzR = _v1.z - Match.ball.position.z;
    const distHR = Math.hypot(dxR, dzR);
    const elevR = elevacaoParaAlvo(distHR, _v1.y, pow);
    // Sem solução (longe demais para esta potência): sai no
    // ângulo de alcance máximo em vez de rasteiro ao chão.
    const eR = (elevR === null) ? ShotModel.elevacaoRecurso : elevR;
    const vhR = pow * Math.cos(eR);
    Match.ballVel.set(
        (distHR > 0.001 ? dxR / distHR : 0) * vhR,
        pow * Math.sin(eR),
        (distHR > 0.001 ? dzR / distHR : p.dirZ) * vhR
    );
    // Remate: o chute mais forte que há, sempre no máximo do som.
    if (typeof EfeitosSonoros !== 'undefined') {
        EfeitosSonoros.chute(Match.ball.position, 1.0);
    }

    // A bola saiu do pé: a autorização de primeira morre com ela.
    p.jogarDePrimeira = false;
    p.hasBall = false; p.touchLock = BallControl.touchLock;
    Match.ballCarrier = null;
    Match.lastTouchedTeam = p.team;
    Match.lastTouchedPlayer = p;

    // Impede que jogadores colados (colegas ou adversários) dominem o remate
    // no frame imediatamente a seguir, travando a bola.
    const allPlayers = Match.players.concat(Match.opponents);
    for (const other of allPlayers) {
        if (other !== p && other.model.position.distanceTo(p.model.position) < 2.0) {
            other.touchLock = Math.max(other.touchLock || 0, 0.4);
        }
    }

    if (!bloqueado) {
        let defendingTeam = (p.team === 'TeamA') ? 'TeamB' : 'TeamA';
        // Notifica o GK adversário via propriedade de instância.
        const gkDef = (p.team === 'TeamA') ? Match.opponents[0] : Match.players[0];
        if (gkDef) {
            /*
            TEMPO DE REACÇÃO NORMAL, sempre. Havia aqui um delay forçado
            que o sorteio de desfechos escrevia: 1.0 s nos remates marcados
            como golo (o guarda-redes ficava a ver) e 0 nos marcados como
            defesa. Com o desfecho a sair da bola, isso deixou de existir —
            e é o que faz o GkCatchModel valer alguma coisa.
            */
            gkDef.gkDelayReacao = 0.45 - ((TeamSkills[defendingTeam].gk - 50) / 50) * 0.35;
            gkDef.gkReagiu = false;
        }
        window.bolaChutada = true;
    }
}

class PlayerFSM {
    constructor(player) {
        this.p = player; this.currentState = 'IDLE'; this.timer = 0;
    }
    changeState(newState) {
        if (this.currentState === newState) return;
        if (this.currentState === 'SLIDE_TACKLE' || this.currentState === 'TACKLE' || this.currentState === 'SHOOT' || this.currentState === 'PASS') {
            this.p.resetBonesToDefault();
        }
        /*
        O `actionState` MORRE COM O ESTADO QUE O USA.

        Ele so era limpo dentro dos `case 'PASS'` e `case 'SHOOT'`, que sao os
        unicos que o consomem. Se alguem mudar o estado DE FORA — e o
        `tratarBolaParada` faz isso, `changeState('SET_PIECE_WAIT')` assim que o
        jogo para — esses cases nunca mais correm, e o `actionState` fica
        pendurado para sempre.

        O custo disso e total: a primeira linha do `PlayerAI.tick` e
        `if (player.actionState || ...) return`. O jogador NUNCA MAIS DECIDE
        NADA. Medido num lote de 20 jogos: sete encraves, todos com o portador
        em SET_PIECE_WAIT, `hasBall: true` e o jogo em PLAY — com a bola nos pes
        e o `decisionTimer` a subir sem ninguem a ir busca-la.

        Limpar aqui e o unico sitio que apanha TODAS as saidas, incluindo as que
        vierem a ser escritas. Os estados que o consomem ficam de fora da
        limpeza: o `initiatePass`/`initiateShoot` criam o ActionState ANTES de
        chamar o changeState, e limpa-lo aqui apagava-o no mesmo instante.
        */
        if (this.p.actionState &&
            newState !== 'PASS' && newState !== 'SHOOT' && newState !== 'CROSS' && newState !== 'BALL_CONTROL_RIGHT') {
            this.p.actionState = null;
        }

        this.currentState = newState; this.timer = 0;
        if (newState === 'CARRY') this.p.showActionBanner('CARRY');
        if (newState === 'DRIBBLE') this.p.showActionBanner('DRIBBLE');
        if (newState === 'BALL_CONTROL_RIGHT') this.p.showActionBanner('CONTROL');
        if (newState === 'TACKLE') this.p.showActionBanner('TACKLE');
        if (newState === 'SLIDE_TACKLE') this.p.showActionBanner('S.TACKLE');
        if (newState === 'INTERCEPT') {
            const bb = (typeof TeamAI !== 'undefined') ? TeamAI.get(this.p.team) : null;
            if (bb && bb.isAttacking) {
                this.p.showActionBanner('RECOVER');
            } else {
                this.p.showActionBanner('INTERCEPT');
            }
        }
        if (newState === 'BLOCKING') this.p.showActionBanner('BLOCK');
        if (newState === 'CHEST_CONTROL') this.p.showActionBanner('CHEST');
        if (newState === 'RUN_INTO_SPACE') this.p.showActionBanner('RUN');

        // A bola de cada canto começa no chão: ver o case WATCH_CORNER.
        if (newState === 'WATCH_CORNER') this.cornerBolaSubiu = false;

        if (newState === 'SLIDE_TACKLE') this.enterSlideTackle();
        if (newState === 'TACKLE') this.p.tackleResolvido = false;
    }

    /*
    Entrada no carrinho: decide sobre que anca desliza e qual o pé que estica.
    Estica o pé do lado da bola; se ela estiver mesmo em frente, escolhe ao
    acaso, porque os dois lados ficam bem.
    */
    enterSlideTackle() {
        const p = this.p;
        p.slideTouched = false;

        _v1.subVectors(Match.ball.position, p.model.position);
        _v2.set(0, 0, 1).applyQuaternion(p.model.quaternion);
        const lateral = _v2.z * _v1.x - _v2.x * _v1.z;

        if (Math.abs(lateral) < 0.3) p.slideSide = (Math.random() < 0.5) ? -1 : 1;
        else p.slideSide = (lateral > 0) ? 1 : -1;
    }

    /*
    Pose do carrinho, construida a mao a partir da foto de referencia: desliza
    sobre uma anca, uma perna esticada para a bola, a outra dobrada por baixo,
    tronco erguido e apoiado no braco de tras.

    `intens` vai de 0 (de pe) a 1 (pose completa), o que da a entrada e a saida
    suaves sem precisar de keyframes.
    */
    applySlidePose(intens) {
        const p = this.p;
        const rig = p.rig;
        if (!rig) return;

        const P = SlideTackleModel.pose;
        const s = p.slideSide || 1;
        const k = intens;

        // A perna que estica e a do lado `s`; deita-se sobre a anca oposta.
        const coxaEst = (s > 0) ? rig.rLeg : rig.lLeg;
        const joelhoEst = (s > 0) ? rig.rKnee : rig.lKnee;
        const peEst = (s > 0) ? rig.rFoot : rig.lFoot;
        const coxaDob = (s > 0) ? rig.lLeg : rig.rLeg;
        const joelhoDob = (s > 0) ? rig.lKnee : rig.rKnee;

        // O braco de apoio e o do lado em que esta deitado.
        const bracoApoio = (s > 0) ? rig.lArm : rig.rArm;
        const cotoveloApoio = (s > 0) ? rig.lElbow : rig.rElbow;
        const bracoLivre = (s > 0) ? rig.rArm : rig.lArm;
        const cotoveloLivre = (s > 0) ? rig.rElbow : rig.lElbow;

        rig.pelvis.rotation.z = -s * P.ancaRolar * k;
        rig.pelvis.rotation.x = P.ancaTras * k;
        rig.chest.rotation.x = P.peito * k;
        rig.chest.rotation.z = -s * P.peitoRolar * k;

        coxaEst.rotation.x = P.coxaEstendida * k;
        coxaEst.rotation.z = 0;
        joelhoEst.rotation.x = P.joelhoEstendido * k;
        if (peEst) peEst.rotation.x = P.peEstendido * k;

        coxaDob.rotation.x = P.coxaDobrada * k;
        coxaDob.rotation.z = 0;
        joelhoDob.rotation.x = P.joelhoDobrado * k;

        // rotation.z "para fora" e positivo no braco esquerdo, negativo no direito.
        bracoApoio.rotation.z = s * P.bracoApoioZ * k;
        bracoApoio.rotation.x = P.bracoApoioX * k;
        cotoveloApoio.rotation.x = P.cotoveloApoio * k;

        bracoLivre.rotation.z = -s * P.bracoLivreZ * k;
        bracoLivre.rotation.x = P.bracoLivreX * k;
        cotoveloLivre.rotation.x = P.cotoveloLivre * k;

        p.model.position.y = ALTURA_BASE_Y + SlideTackleModel.alturaAnca * k;
    }

    update(dt) {
        this.timer += dt;
        let p = this.p; let rig = p.rig;

        switch (this.currentState) {
            case 'SET_PIECE_WAIT':
                /*
                No canto disputa-se a posição antes de a bola sair: passo à
                frente, atrás ou para o lado à volta da âncora do slot (ver
                SetPieceJostle). Nas outras bolas paradas continua parado.
                */
                if (Match.state === 'CORNER_KICK' && p.jostleAncora &&
                    typeof SetPieceJostle !== 'undefined') {
                    const J = SetPieceJostle;
                    p.jostleTimer = (p.jostleTimer || 0) - dt;
                    /*
                    `jostleAngulo === undefined` tem de entrar aqui. O timer
                    arranca com um valor aleatório POSITIVO (para não pulsarem
                    todos ao mesmo tempo), portanto nos primeiros frames este
                    bloco não corria e o ângulo ficava por sortear — e
                    `Math.cos(undefined) * 0` é NaN, não 0. O jogador passava a
                    perseguir um alvo NaN, a posição dele virava NaN e o
                    SpatialGrid rebentava a indexar com NaN.
                    */
                    if (p.jostleTimer <= 0 || p.jostleAngulo === undefined) {
                        p.jostleAngulo = Math.random() * Math.PI * 2;
                        p.jostleRaio = Math.random() * J.raio;
                        p.jostleTimer = J.intervaloMin +
                            Math.random() * (J.intervaloMax - J.intervaloMin);
                    }
                    const o = offsetInquietacao(p.jostleAngulo, p.jostleRaio || 0);
                    _v1.set(p.jostleAncora.x + o.x, ALTURA_BASE_Y, p.jostleAncora.z + o.z);
                    p.velocity = p.steerArrive(_v1, J.velocidade, 0);
                } else if (!(p === Match.setPieceTaker && Match.state === 'FREE_KICK' && Match.faltaPendente && Match.faltaAtraso < (typeof ESPERA_APOS_REPOSICAO !== 'undefined' ? ESPERA_APOS_REPOSICAO / 3 : 1.0))) {
                    // O batedor da falta só mantém a velocidade durante a aproximação andada
                    // (último terço da espera). Durante a espera inicial e para os outros jogadores, velocidade é 0.
                    p.velocity.set(0, 0, 0);
                }
                if (Match.ball) {
                    let lookPos = _v2.copy(Match.ball.position);
                    lookPos.y = p.model.position.y;
                    lookAtBola(p.model, lookPos);
                }
                break;
            /*
            LATERAL: por agora só a POSE de quem vai repor — a reposição em si
            (alvo, força, quem recebe) ainda não existe. Fica em estado próprio
            para se poder afinar no ecrã e para a reposição ter onde encaixar.
            */
            case 'LATERAL':
                p.velocity.set(0, 0, 0);

                /*
                Vira-se para DENTRO do campo, não para a bola: a bola está nas
                mãos dele.

                E RODA PARA ONDE VAI ATIRAR. O `lateralGiroCorpo` é o que a
                cintura não alcança (ver prepararGiroLateral): sem ele o corpo
                ficava perpendicular à linha o gesto inteiro e um lançamento
                para trás saía com o jogador de lado para o alvo. É zero
                enquanto o alvo couber no giro da cintura, portanto os
                lançamentos curtos para a frente ficam exactamente como estavam.

                Vira aos poucos porque o gesto já começou: o corpo tem os
                `ESPERA_APOS_REPOSICAO` da espera mais a subida do clip até ao
                contacto, e uma rotação instantânea lê-se como um salto.
                */
                {
                    const alvoGiro = p.lateralGiroCorpo || 0;

                    // Persegue o ângulo alvo em vez de saltar para ele. A
                    // direcção "para dentro" é (-x, 0): aponta da linha para o
                    // eixo do campo, perpendicular à lateral.
                    const passo = LateralPose.velGiroCorpo * dt;
                    const falta = alvoGiro - (p.lateralGiroCorpoActual || 0);
                    p.lateralGiroCorpoActual = (Math.abs(falta) <= passo)
                        ? alvoGiro
                        : (p.lateralGiroCorpoActual || 0) + Math.sign(falta) * passo;

                    const d = rodarNoPlano(-p.model.position.x, 0, p.lateralGiroCorpoActual);
                    _v1.set(p.model.position.x + d.x, p.model.position.y, p.model.position.z + d.z);
                    lookAtBola(p.model, _v1);
                }

                /*
                Duas fases no mesmo estado:

                  sem `lateralAction`  espera com a bola nas mãos (frame 0 do
                                       ThrowInClip, que é a LateralPose)
                  com `lateralAction`  o gesto, com a bola a sair no
                                       contactTime (ver ActionAnimClips.throwIn)

                Quem cria o ActionState é o Match, depois da espera de
                ESPERA_APOS_REPOSICAO — o mesmo tempo das outras reposições.
                */
                if (p.lateralAction) {
                    const nL = p.lateralAction.update(dt, p);
                    const K = amostrarClipLateral(nL);
                    p.aplicarFrameLateral(K, !p.lateralLargou);
                    if (p.lateralAction.isDone()) {
                        p.lateralAction = null;
                        p.lateralLargou = false;
                        // Sem isto o giro ficava guardado e o lateral seguinte
                        // arrancava já com o corpo torcido do anterior.
                        p.lateralGiroCorpo = 0;
                        p.lateralGiroCorpoActual = 0;
                        p.resetBonesToDefault();
                        this.changeState('IDLE');
                    }
                } else {
                    p.aplicarPoseLateral(true);
                }
                break;
            case 'SET_PIECE_TAKER':
                p.velocity.set(0, 0, 0);
                /*
                No canto olha para a ÁREA, não para a bola: ele está fora do
                campo, atrás dela (ver pontoDeCanto), e virá-lo para a bola
                punha-o de costas para onde vai centrar. Nas outras bolas
                paradas continua a olhar para a bola.
                */
                if (Match.state === 'CORNER_KICK' && Match.cornerAlvo) {
                    let lookPos = _v2.copy(Match.cornerAlvo);
                    lookPos.y = p.model.position.y;
                    lookAtBola(p.model, lookPos);
                } else if (Match.ball) {
                    let lookPos = _v2.copy(Match.ball.position);
                    lookPos.y = p.model.position.y;
                    lookAtBola(p.model, lookPos);
                }
                /*
                Só se bate o canto com a bola JÁ na quina: ela pode ainda estar
                a rolar para trás da baliza (ver cantoBolaAlvo em match.js), e
                cruzar dali era cruzar de um sítio onde ela não está.
                */
                if (Match.setPieceTimer > ESPERA_APOS_REPOSICAO && !Match.cantoBolaAlvo) {
                    if (Match.state === 'CORNER_KICK') {
                        const lado = Math.sign(Match.ball.position.x) || 1;
                        const teammates = (p.team === 'TeamA') ? Match.players : Match.opponents;
                        const atkInBox = teammates.filter(pl => pl !== p && pl.role !== 'gk' && Math.abs(pl.model.position.z) > 25);
                        
                        // Seleciona o melhor cabeceador do ataque na área (atacante ou central que subiu)
                        let targetReceiver = null;
                        if (atkInBox.length > 0) {
                            atkInBox.sort((a, b) => {
                                const scoreA = a.skillFor('STRENGTH') * 0.55 + a.skillFor('TEC') * 0.45;
                                const scoreB = b.skillFor('STRENGTH') * 0.55 + b.skillFor('TEC') * 0.45;
                                return scoreB - scoreA;
                            });
                            const topCandidates = atkInBox.slice(0, Math.min(3, atkInBox.length));
                            targetReceiver = topCandidates[Math.floor(Math.random() * topCandidates.length)];
                        }

                        // Zona de cruzamento calibrada (1º poste, marca do pênalti / coração da área ou 2º poste)
                        let targetX, targetZ;
                        if (targetReceiver && targetReceiver.dynamicTarget && Math.abs(targetReceiver.dynamicTarget.z) > 26) {
                            targetX = targetReceiver.dynamicTarget.x;
                            targetZ = targetReceiver.dynamicTarget.z;
                        } else {
                            const zDepth = 6.5 + Math.random() * 4.5;
                            targetZ = (CAMPO_COMP / 2 - zDepth) * p.dirZ;
                            const rollZona = Math.random();
                            if (rollZona < 0.45) targetX = lado * (2.5 + Math.random() * 2.0);
                            else if (rollZona < 0.80) targetX = (Math.random() - 0.5) * 4.0;
                            else targetX = -lado * (2.5 + Math.random() * 2.0);
                        }

                        const dx = targetX - Match.ball.position.x;
                        const dz = targetZ - Match.ball.position.z;
                        const d = Math.max(0.0001, Math.hypot(dx, dz));
                        /*
                        A FORÇA DO CANTO, com o arrasto contado.

                        Era `vHoriz = d / tVoo` sobre um `vy` fixo — a conta do
                        tiro no VÁCUO. A física da bola trava as três
                        componentes com arrasto quadrático, e a 17-18 m/s isso
                        são ~4 m/s² durante os ~2 s de voo: medido, um canto de
                        35 m caía aos ~29 m, à entrada da área em vez de na
                        marca. Era o cruzamento a morrer sempre curto.

                        `velocidadeParaAlcance` (utils.js) resolve o mesmo
                        problema por simulação do voo com arrasto, e é o que o
                        resto do jogo já usa. A elevação mantém a forma do
                        cruzamento anterior (~29°); os detalhes estão em
                        CrossModel.canto.
                        */
                        const CC = (typeof CrossModel !== 'undefined' && CrossModel.canto)
                            ? CrossModel.canto : { elevacao: 29.0, variacaoElev: 3.0, forca: 1.0 };
                        const elevCanto = (CC.elevacao + (Math.random() - 0.5) * 2 * (CC.variacaoElev || 0))
                            * Math.PI / 180;
                        const vCanto = velocidadeParaAlcance(d, elevCanto) * (CC.forca || 1.0);
                        const vHoriz = vCanto * Math.cos(elevCanto);
                        const vy = vCanto * Math.sin(elevCanto);

                        Match.ballVel.set((dx / d) * vHoriz, vy, (dz / d) * vHoriz);
                        Match.mudarEstado('PLAY', 'canto_batido');
                        Match.ballCarrier = null;
                        Match.intendedReceiver = targetReceiver;
                        if (!Match.passTargetPos) Match.passTargetPos = new THREE.Vector3();
                        Match.passTargetPos.set(targetX, ALTURA_BASE_Y, targetZ);
                        Match.possessionTeam = p.team;
                        Match.possessionTimer = 0;
                        Match.lastTouchedTeam = p.team;
                        Match.lastTouchedPlayer = p;

                        /*
                        O LANCE PASSA A ESTAR VIVO. Enquanto estiver, os
                        marcadores emparelhados no setup (`marcaNoCanto`) ficam
                        com o seu homem em vez de voltarem ao bloco — ver
                        CornerDefenseModel e o ramo do canto no PlayerAI.tick.

                        Sem isto o bloco retomava o comando aqui mesmo, e como o
                        bloco segue a bola (que está na bandeirola de canto) os
                        defensores eram puxados para fora da própria área com o
                        cruzamento ainda no ar: medido, 8.1 defensores na área no
                        cruzamento e 0.8 quatro segundos depois.
                        */
                        Match.cantoVivo = { equipa: (p.team === 'TeamA') ? 'TeamB' : 'TeamA', timer: 0 };

                        Match.players.concat(Match.opponents).forEach(pl => {
                            pl.setPieceTarget = null;
                            if (pl.fsm.currentState === 'SET_PIECE_TAKER') {
                                pl.fsm.changeState('WATCH_CORNER');
                            } else if (pl.fsm.currentState === 'SET_PIECE_WAIT') {
                                pl.jostleAncora = null;
                                pl.fsm.changeState('MOVE_TO_POS');
                            }
                        });
                    }
                }
                break;
            case 'IDLE':
                p.velocity.set(0, 0, 0);
                if (typeof Match !== 'undefined' && Match.intendedReceiver === p && Match.ball) {
                    let lookPos = _v2.copy(Match.ball.position);
                    lookPos.y = p.model.position.y;
                    lookAtBola(p.model, lookPos);
                }
                break;
            case 'MOVE_TO_POS':
                {
                    const isBallTarget = p.dynamicTarget.distanceTo(Match.ball.position) < 0.8;
                    p.velocity = p.steerArrive(p.dynamicTarget, p.speedMult, isBallTarget ? 0 : 2.0);
                }
                break;
            /*
            MARKING / BLOCKING — mesma locomoção
            do MOVE_TO_POS (o alvo já vem calculado do nível 2: marcar(),
            cobertura ou posicionamento).
            */
            /*
            MARKING respeita o CÍRCULO à volta do homem: acompanha-o pelo
            lado de fora e nunca lhe entra dentro. O alvo já vem calculado
            fora do círculo (ver PosicionamentoAI.commit), mas o alvo é uma
            intenção — a inércia da corrida e os empurrões de coesão podem
            na mesma metê-lo lá dentro. Aqui a regra é geométrica: se estiver
            a entrar, a componente da velocidade que aponta ao homem é
            cortada, e ele fica a deslizar à volta do círculo.
            */
            case 'MARKING':
                p.velocity = p.steerArrive(p.dynamicTarget, p.speedMult);
                if (p.markingTarget) {
                    const hm = p.markingTarget.model.position;
                    const raio = MarkingModel.distanciaPara(hm.z * p.dirZ);
                    let dx = p.model.position.x - hm.x;
                    let dz = p.model.position.z - hm.z;
                    const d = Math.hypot(dx, dz);

                    /*
                    RECUO: o homem vem para cima dele, ele anda para trás.

                    Sem isto o marcador ficava parado no alvo à espera, e a
                    distância só era reposta depois de já ter sido violada —
                    o que se via era o portador a empurrá-lo. Aqui, ainda
                    antes de o círculo ser tocado (dentro de `margemRecuo`),
                    compara-se a velocidade RADIAL dos dois: se ele se
                    aproxima mais depressa do que eu me afasto, a diferença é
                    somada ao meu recuo. A distância mantém-se sozinha.

                    Só a componente radial é tocada — o acompanhamento
                    lateral (seguir o homem pelo campo) fica intacto.
                    */
                    if (d > 0.001 && d < raio + MarkingModel.margemRecuo) {
                        const nx = dx / d, nz = dz / d;
                        const vHomem = p.markingTarget.velocity;
                        if (vHomem) {
                            // >0 = o homem está a fechar a distância.
                            const vRadHomem = vHomem.x * nx + vHomem.z * nz;
                            const vRadMeu = p.velocity.x * nx + p.velocity.z * nz;
                            if (vRadHomem > 0 && vRadMeu < vRadHomem) {
                                const falta = vRadHomem - vRadMeu;
                                p.velocity.x += falta * nx;
                                p.velocity.z += falta * nz;
                            }
                        }
                    }

                    if (d > 0.001 && d < raio) {
                        const nx = dx / d, nz = dz / d;
                        // Empurra para cima da linha do círculo...
                        p.model.position.x = hm.x + nx * raio;
                        p.model.position.z = hm.z + nz * raio;
                        // ...e tira a parte da velocidade que ia para dentro.
                        const vn = p.velocity.x * nx + p.velocity.z * nz;
                        if (vn < 0) {
                            p.velocity.x -= vn * nx;
                            p.velocity.z -= vn * nz;
                        }
                    }
                }
                break;
            case 'BLOCKING':
            // INTERCEPT: mesma locomoção, estado próprio só para aparecer como
            // tal no debug. O alvo é o ponto de interceptação calculado pela
            // percepção (ver actIntercept), não a posição actual da bola.
            case 'INTERCEPT':
            // SUPPORT_PASS: ir para o ponto onde sou opcao de passe. Mesma
            // locomocao; estado proprio para se ver no debug quem se esta a
            // oferecer (ver atribuirApoiosDaEquipa).
            case 'SUPPORT_PASS':
                p.velocity = p.steerArrive(p.dynamicTarget, p.speedMult);
                break;

            /* =============================================================
               RUN_INTO_SPACE — a corrida ao espaço, sem bola.

               Estado próprio e não um desvio no alvo: a corrida tem de durar
               (é um compromisso, não uma preferência de posicionamento), e
               quem a vê no debug tem de perceber que aquilo é uma corrida e
               não o jogador a ir para o slot.

               Vida da corrida, pedida assim: DURA ATÉ AO PRÓXIMO PASSE. Se a
               bola vier para quem corre, ele continua — o ramo Receber do BT
               assume no frame seguinte. Se for para outro, acabou: ficar a
               correr para um espaço que já não serve para nada é o que faz
               os jogadores parecerem cegos.

               O `runCarrier` é quem tinha a bola quando a corrida começou.
               Compará-lo com o portador actual é o que deteta "houve passe"
               sem precisar de um evento novo.
               ============================================================= */
            case 'RUN_INTO_SPACE': {
                p.runTimer = (p.runTimer || 0) - dt;

                const perdemosABola = (Match.possessionTeam !== p.team);
                const houvePasse = (Match.ballCarrier && Match.ballCarrier !== p.runCarrier);
                const passeParaOutro = (Match.intendedReceiver && Match.intendedReceiver !== p);
                const chegou = p.dynamicTarget &&
                    p.model.position.distanceTo(p.dynamicTarget) < 1.5;

                if (p.runTimer <= 0 || perdemosABola || houvePasse || passeParaOutro || chegou) {
                    p.runTimer = 0;
                    p.runCarrier = null;
                    // Arrefecimento: sem isto ele reavalia no frame seguinte,
                    // volta a achar espaço no mesmo sítio e fica a arrancar
                    // e a parar no lugar.
                    p.runCooldown = RunIntoSpaceModel.arrefecimento;
                    p.fsm.changeState('MOVE_TO_POS');

                    /*
                    O ABORTO NÃO PODE DEIXAR UM FRAME MORTO.

                    Isto fazia `changeState` e `break` sem tocar na velocidade —
                    e o `player.update` integra a velocidade a seguir, corra ou
                    não corra a direcção. Um frame assim é invisível; o problema
                    é quando o aborto se repete todos os frames.

                    E repetia: o `actEsperarDevolucao` e o `actOverlap` metiam o
                    jogador em RUN_INTO_SPACE sem lhe porem `runTimer`, portanto
                    a condição `runTimer <= 0` aqui em cima era verdadeira logo
                    no primeiro frame. A árvore voltava a pedir RUN_INTO_SPACE no
                    frame seguinte (as guardas da tabelinha e do overlap não
                    olham para o `runCooldown`), e o ciclo fechava-se.

                    Medido: o jogador ficava com a velocidade CONGELADA do último
                    frame em que alguém o guiou, e a posição a integrá-la para
                    sempre — uma linha recta a 10 m/s para fora do campo, com
                    corpos medidos a |x| = 60 m, muito para lá da bancada. Era
                    disto que se via um jogador a sair do campo.

                    Guiar já neste frame, com o alvo do MOVE_TO_POS que acabou de
                    ser pedido, fecha a porta a este e a qualquer outro aborto
                    que venha a ser escrito aqui.
                    */
                    p.velocity = p.steerArrive(p.dynamicTarget, p.speedMult);
                    break;
                }

                p.velocity = p.steerArrive(p.dynamicTarget, p.speedMult);
                break;
            }
            /* =============================================================
               CARRY — Condução: carregar a bola com toques à frente.
               O jogador solta a bola num toque curto/médio/longo conforme
               o espaço e corre atrás dela. Não tem a bola grudada ao pé.
               ============================================================= */
            case 'CARRY':
                if (!p.hasBall) {
                    // Quando a bola foi solta num toque à frente, corre directamente para ela
                    // sem abrandar nem hesitar até re-adquirir o controlo!
                    p.dynamicTarget.copy(Match.ball.position);
                    p.velocity = p.steerArrive(p.dynamicTarget, p.speedMult * 1.05, 0);
                } else if (p.carryHold > 0) {
                    /*
                    PARADO COM A BOLA. Não é um estado novo: é o CARRY sem
                    direcção nenhuma escolhida — a bola fica no pé (o bloco
                    `hasBall` do player.update continua a colá-la lá) e ele
                    espera que a linha de passe apareça.

                    Faltava por completo: entre conduzir e passar não havia
                    nada, e por isso o portador ou ia para a frente ou largava
                    a bola. Quem decide entrar e sair daqui é o
                    `tratarSegurarBola` (player_bt.js); aqui só se conta o
                    tempo e se trava.

                    Vira-se para a BALIZA que ataca e não para onde ia: quem
                    segura a bola fica de frente para o jogo, à espera.
                    */
                    p.carryHold = Math.max(0, p.carryHold - dt);
                    p.velocity.multiplyScalar(Math.max(0, 1 - 8.0 * dt));

                    _v1.set(p.model.position.x, p.model.position.y,
                        p.model.position.z + p.dirZ * 10);
                    _v2.set(p.model.position.x * 2 - _v1.x, p.model.position.y,
                        p.model.position.z * 2 - _v1.z);
                    _m1.lookAt(p.model.position, _v2, p.model.up);
                    _q1.setFromRotationMatrix(_m1);
                    const giroHold = (typeof TurnModel !== 'undefined') ? TurnModel.comBola : 5.5;
                    p.model.quaternion.slerp(_q1, Math.min(1.0, giroHold * dt));
                } else {
                    // Escolhe a melhor direcção de condução (leque de ângulos adaptativo pela Técnica)
                    {
                        const todosJogadores = Match.players.concat(Match.opponents);
                        const px = p.model.position.x, pz = p.model.position.z;
                        let melhorNota = -Infinity;

                        /*
                        Sentido da condução. O cone de visão é o mesmo — a
                        técnica manda nele por igual, para a frente e para
                        trás — só o eixo em torno do qual abre é que muda.

                        Assim ele recua pelo corredor mais livre, com o mesmo
                        peso de espaço e o mesmo respeito pelo sector, em vez de
                        recuar às cegas.

                        Declarado ANTES do alvo de recurso de propósito: esse
                        usava p.dirZ, e num recuo sem candidato nenhum mandava-o
                        dez metros para a FRENTE — o contrário do pedido.
                        */
                        const sentido = p.carryRecuo ? -p.dirZ : p.dirZ;

                        /*
                        EIXO DO LEQUE — ver eixoDeConducao/GiroDeCostasModel em
                        config.js. Era sempre (0, sentido), ou seja a direcção
                        de ataque: quem recebia de costas apontava logo para a
                        frente, girava os 180 e ia dar de caras com o marcador
                        que tinha atrás. No próprio meio-campo isso é a perda de
                        bola mais cara que há.

                        Agora o eixo pode vir rodado — um toque de 30 graus para
                        o lado livre — e todo o resto do leque (o cone da
                        técnica, a nota de espaço, o sector) continua a abrir à
                        volta dele, sem saber que mudou.
                        */
                        const _fq = p.model.quaternion;
                        const eixo = (typeof eixoDeConducao === 'function')
                            ? eixoDeConducao({
                                dirZ: p.dirZ,
                                zDir: pz * p.dirZ,
                                facingX: _fq ? 2 * (_fq.x * _fq.z + _fq.w * _fq.y) : 0,
                                facingZ: _fq ? 1 - 2 * (_fq.x * _fq.x + _fq.y * _fq.y) : p.dirZ,
                                entradaX: p.dirEntradaBola ? p.dirEntradaBola.x : 0,
                                entradaZ: p.dirEntradaBola ? p.dirEntradaBola.z : p.dirZ,
                                carryRecuo: p.carryRecuo,
                                adversarios: (p.team === 'TeamA' ? Match.opponents : Match.players)
                                    .filter(o => o.role !== 'gk')
                                    .map(o => ({
                                        x: o.model.position.x - px,
                                        z: o.model.position.z - pz
                                    }))
                            })
                            : { bx: 0, bz: sentido };

                        // Recuo seguro se nenhum candidato passar os filtros:
                        // dez metros a direito, no sentido em que vai.
                        let alvoX = px + eixo.bx * 10, alvoZ = pz + eixo.bz * 10;

                        // Visão de jogo baseada na técnica — ver VisionModel
                        // em config.js, que é onde os números vivem agora.
                        const tec = p.skillFor ? p.skillFor('TEC') : 50;
                        const visDist = alcanceVisao(tec);
                        const maxAngRad = coneVisao(tec);

                        // Ponto mais avançado que vale a pena mirar: a faixa junto
                        // à linha de fundo está fora, senão ele corre contra a
                        // linha sem nunca poder adiantar a bola.
                        const avancoMax = CAMPO_COMP / 2 - CarryModel.margemLinhaFundo;

                        // Gera ângulos dinamicamente dentro do cone de visão do jogador
                        const passos = 9;
                        for (let k = 0; k < passos; k++) {
                            const ratio = (k / (passos - 1)) * 2 - 1; // de -1 a +1
                            const ang = ratio * maxAngRad;
                            // O leque abre em torno do eixo, que já não é
                            // obrigatoriamente a direcção de ataque.
                            const cosA = Math.cos(ang), sinA = Math.sin(ang);
                            const tx = px + (eixo.bx * cosA + eixo.bz * sinA) * visDist;
                            let tz = pz + (eixo.bz * cosA - eixo.bx * sinA) * visDist;
                            if (tz * sentido > avancoMax) tz = avancoMax * sentido;
                            if (Math.abs(tx) > 31 || Math.abs(tz) > 51) continue;

                            let maisPerto = 999;
                            const dx = tx - px, dz = tz - pz;
                            const len2 = dx * dx + dz * dz;

                            for (const pl of todosJogadores) {
                                if (pl === p || pl.role === 'gk') continue;
                                const plx = pl.model.position.x, plz = pl.model.position.z;
                                const isOpp = (pl.team !== p.team);
                                
                                let t = 0;
                                if (len2 > 0) t = ((plx - px) * dx + (plz - pz) * dz) / len2;
                                
                                // Verifica se o jogador está na frente no corredor de deslocamento
                                if (t > 0 && t < 1.2) {
                                    const projX = px + t * dx;
                                    const projZ = pz + t * dz;
                                    const distToLine = Math.hypot(plx - projX, plz - projZ);
                                    
                                    // Corredor de 2.4m para adversários (para não insistir em carregar de frente) e 1.2m para colegas
                                    const corredorLimite = isOpp ? 2.4 : 1.2;
                                    if (distToLine < corredorLimite) {
                                        const distObstacle = Math.hypot(plx - px, plz - pz);
                                        if (distObstacle < maisPerto) maisPerto = distObstacle;
                                    }
                                }
                            }

                            /*
                            Três termos normalizados a 0..1 e só depois pesados
                            (ver notaDireccaoCarry em utils.js). Antes eram
                            grandezas cruas em escalas diferentes, e o progresso
                            ganhava sempre ao espaço.
                            */
                            const espacoNorm = Math.min(maisPerto, CarryModel.spaceCap) / CarryModel.spaceCap;
                            let progressoNorm = Math.max(0, Math.min(1, ((tz - pz) * sentido) / visDist));
                            // Se estiver na defesa com adversários perto à frente, reduz drasticamente o valor do avanço frontal
                            if ((pz * p.dirZ < 0 || p.role === 'def') && maisPerto < 16.0) {
                                progressoNorm *= 0.2;
                            }
                            const sectorPen = Tatics.penalidadeSector(tx, p.dirZ);
                            const nota = notaDireccaoCarry(espacoNorm, progressoNorm, sectorPen, tec);

                            if (nota > melhorNota) { melhorNota = nota; alvoX = tx; alvoZ = tz; }
                        }

                        p.dynamicTarget.set(alvoX, ALTURA_BASE_Y, alvoZ);
                    }

                    if (p.role === 'gk') {
                        let minZ = Math.min(p.ownGoalZ, p.ownGoalZ + 14 * p.dirZ);
                        let maxZ = Math.max(p.ownGoalZ, p.ownGoalZ + 14 * p.dirZ);
                        p.dynamicTarget.z = Math.max(minZ, Math.min(maxZ, p.dynamicTarget.z));
                        p.dynamicTarget.x = Math.max(-18, Math.min(18, p.dynamicTarget.x));
                        if ((p.model.position.z - p.ownGoalZ) * p.dirZ >= 13) {
                            p.puntBall();
                        }
                    }
                    p.velocity = p.steerArrive(p.dynamicTarget, p.speedMult * 0.95, 0);
                }

                /*
                Toques de condução — soltar a bola à frente e correr atrás.
                Perto da linha de fundo não se adianta nada: o toque punha a
                bola fora e dava pontapé de baliza ao adversário. Continua a
                correr, mas com a bola no pé (ver pertoDaLinhaDeFundo).
                */
                if (p.hasBall && p.velocity.lengthSq() > 2.0 && this.timer > CarryModel.touchCooldown
                    && !pertoDaLinhaDeFundo(p) && !emZonaDeFinalizacao(p)
                    && p.gkEstado !== 'segurando') {
                    let forward = _v1.copy(p.velocity).normalize();
                    let allOpps = (p.team === 'TeamA') ? Match.opponents : Match.players;

                    // Adversário mais perto no cone frontal de visão (VisionModel).
                    const tec = p.skillFor ? p.skillFor('TEC') : 50;
                    const maxVisionAngleRad = coneVisao(tec);
                    const minDot = Math.cos(maxVisionAngleRad);
                    const visionRange = alcanceVisao(tec, 14.0);

                    let nearestOppDist = 999;
                    let nearestOpp = null;
                    for (let opp of allOpps) {
                        if (opp.role === 'gk') continue;
                        let dist = p.model.position.distanceTo(opp.model.position);
                        if (dist > visionRange) continue;
                        let dirToOpp = _v2.subVectors(opp.model.position, p.model.position).normalize();
                        let dotFwd = dirToOpp.dot(forward);
                        if (dotFwd >= minDot && dist < nearestOppDist) {
                            nearestOppDist = dist;
                            nearestOpp = opp;
                        }
                    }

                    /*
                    Distância do toque: a bola é adiantada uma distância ALVO em
                    metros (CarryModel.touchLong/Medium/Short), não uma fracção da
                    velocidade. A versão anterior somava 0.15 a 0.35 m/s à velocidade
                    de corrida; com o atrito de rolamento real (μg = 3.73 m/s²) esse
                    excesso morria em menos de 0.1 s e a bola ficava colada ao pé —
                    o toque à frente não se via.

                    Física: com o portador a velocidade constante, a bola afasta-se
                    até o excesso u ser consumido pelo atrito, ou seja lead = u²/(2a).
                    Logo u = sqrt(2 * a * lead) e a potência do toque é curSpeed + u.
                    */
                    const curSpeed = p.velocity.length();
                    const atritoBola = BallPhysics.atritoRolamento * BallPhysics.gravidade;
                    let leadDist;
                    if (nearestOppDist > 15) {
                        // Campo aberto (> 15m) — toque longo
                        leadDist = CarryModel.touchLong;
                    } else if (nearestOppDist > 10) {
                        // 10 a 15 metros — toque médio
                        leadDist = CarryModel.touchMedium;
                    } else if (nearestOppDist > 5) {
                        // 5 a 10 metros — toque curto
                        leadDist = CarryModel.touchShort;
                    } else if (nearestOppDist > DribbleModel.triggerDist) {
                        // 0 a 5 metros — toque muito curto, bola junto ao pé
                        leadDist = CarryModel.touchShort * 0.5;
                    } else {
                        // Adversário muito perto — transição para DRIBBLE 1v1
                        if (nearestOpp && nearestOppDist > 1.2) {
                            p.dribbleOpponent = nearestOpp;
                            p.dribbleCooldownTimer = 0;
                            if (typeof MatchStats !== 'undefined') MatchStats[p.team].dribles.tentados++;
                            this.changeState('DRIBBLE');
                        }
                        break;
                    }

                    /*
                    VALIDAÇÃO POR DISPUTA. As faixas acima escolheram o toque
                    pela distância do INSTANTE; aqui pergunta-se quem chega
                    primeiro ao sítio onde a bola vai ficar — que é a pergunta
                    certa, porque o toque só fecha ~0.7 s depois.

                    Devolve o maior toque que ele ainda ganha, ou 0. Zero quer
                    dizer "leva a bola no pé": sai-se sem tocar, e ele continua a
                    conduzir colado à bola em vez de a oferecer.

                    O guarda-redes entra na lista de propósito — está fora da
                    escolha da faixa (para não disparar drible contra ele), mas à
                    frente da baliza é quem chega à bola adiantada.
                    */
                    if (typeof maiorToqueSeguro === 'function') {
                        if (!p._advDisputa) p._advDisputa = [];
                        p._advDisputa.length = 0;
                        for (const opp of allOpps) {
                            p._advDisputa.push({ x: opp.model.position.x, z: opp.model.position.z });
                        }
                        leadDist = maiorToqueSeguro(
                            p.model.position.x, p.model.position.z,
                            forward.x, forward.z, curSpeed, leadDist, p._advDisputa);
                        if (leadDist <= 0) break;   // sem toque seguro: bola no pé
                    }

                    // Só solta a bola quando a perna de balanço está à frente do
                    // corpo (janela de toque da passada) — senão o toque sai com
                    // a perna atrás e parece que a bola volta para o jogador.
                    // Espera no máximo CarryModel.touchMaxWait antes de forçar.
                    if (!p.emJanelaDeToque() && p.touchWaitTimer < CarryModel.touchMaxWait) {
                        p.touchWaitTimer += dt;
                        break;
                    }
                    p.touchWaitTimer = 0;

                    // Executar o toque à frente com touchLock muito curto (0.08s) para que o
                    // próprio jogador retome a condução de forma fluida sem hesitação.
                    const excesso = Math.sqrt(2 * atritoBola * leadDist);
                    const touchPow = curSpeed + excesso;

                    /*
                    A graça de condução tem de cobrir o tempo real até recuperar a
                    bola, senão o BT dá a posse por perdida a meio do toque longo.
                    O afastamento fecha em t = 2u/a (subida e regresso ao pé); mais
                    uma margem, e um tecto para não ficar preso a uma bola perdida.
                    */
                    const tempoRecuperacao = 2 * excesso / atritoBola;

                    p.hasBall = false;
                    p.touchLock = 0.3;
                    p.carryTouchGrace = Math.min(3.0, tempoRecuperacao + 0.5);
                    Match.ballCarrier = null;
                    Match.intendedReceiver = p;
                    Match.ballVel.copy(forward).multiplyScalar(touchPow);
                    Match.ballVel.y = 0;
                    Match.lastTouchedTeam = p.team;
                    Match.lastTouchedPlayer = p;
                    window.bolaChutada = false;
                    this.timer = 0;
                }
                break;

            /* =============================================================
               DRIBBLE — Drible 1v1: ultrapassar um adversário directo.
               Detecta de que lado o defensor vem e toca a bola para o lado
               oposto (~35°). Se tentar ir reto, probabilidade de perda
               é muito maior.
               ============================================================= */
            case 'DRIBBLE':
                {
                    const opp = p.dribbleOpponent;
                    // Se perdeu a bola ou o adversário desapareceu, volta a CARRY
                    if (!p.hasBall || !opp) {
                        p.driblePlano = null;
                        this.changeState('CARRY');
                        break;
                    }

                    /*
                    O DRIBLE TEM DE DURAR O SUFICIENTE PARA SE VER.

                    Estava tudo resolvido no PRIMEIRO frame: decidia-se o
                    sucesso, largava-se a bola de lado e voltava-se a CARRY.
                    Medido em 25 minutos de jogo: 7 entradas no estado, todas
                    com **0.02 s** de duração — um frame. O lance existia nas
                    estatísticas e não existia no ecrã, que é o relato.

                    Agora o estado tem duas partes: o ARRANQUE (a decisão e a
                    direcção, calculados uma vez) e o GESTO, que dura
                    `DribbleModel.duracaoGesto` — o jogador leva a bola no pé,
                    virado para o lado de fuga e já em aceleração, e só no fim
                    é que a bola é tocada para lá do adversário.

                    A decisão é a mesma e é tomada no mesmo instante: o que
                    mudou foi o tempo entre decidir e executar, não a
                    probabilidade.
                    */
                    if (!p.driblePlano) {
                        let forward = p.velocity.lengthSq() > 0.1
                            ? _v2.copy(p.velocity).normalize()
                            : _v2.set(0, 0, p.dirZ);

                        // Calcular de que lado o adversário está
                        let toOpp = _v3.subVectors(opp.model.position, p.model.position);
                        toOpp.y = 0;
                        // Produto cruzado: positivo = adversário à direita, negativo = à esquerda
                        let cross = forward.x * toOpp.z - forward.z * toOpp.x;
                        // Ir para o lado OPOSTO ao adversário
                        let escapeSide = (cross >= 0) ? -1 : 1;

                        // Toque lateral (30-45°) para o lado oposto
                        let angle = DribbleModel.angleSide * escapeSide;
                        let cosA = Math.cos(angle), sinA = Math.sin(angle);
                        let pushDir = _v4.set(
                            forward.x * cosA - forward.z * sinA,
                            0,
                            forward.x * sinA + forward.z * cosA
                        ).normalize();

                        // Chance de sucesso: ir para o lado dá bónus
                        let successChance = DribbleModel.successBase + DribbleModel.successSideBonus;
                        // Skill do jogador modifica (+10% para skill > 70, -10% para skill < 40)
                        let skill = p.skillFor ? p.skillFor('TEC') : 50;
                        successChance += (skill - 50) * 0.003;

                        p.driblePlano = {
                            t: 0,
                            sucesso: (Math.random() < successChance),
                            dir: { x: pushDir.x, z: pushDir.z },
                            frente: { x: forward.x, z: forward.z }
                        };
                    }

                    const plano = p.driblePlano;
                    plano.t += dt;

                    /*
                    O GESTO. Ele acelera para o lado de fuga com a bola no pé —
                    é o `dynamicTarget` que o move (a camada de movimento é a
                    mesma de sempre) e o `speedMult` que lhe dá o arranque.
                    */
                    p.speedMult = DribbleModel.sprintBoost;
                    p.dynamicTarget.set(
                        p.model.position.x + plano.dir.x * DribbleModel.alcanceGesto,
                        ALTURA_BASE_Y,
                        p.model.position.z + plano.dir.z * DribbleModel.alcanceGesto);

                    if (plano.t < DribbleModel.duracaoGesto) break;

                    // ---- o toque, no fim do gesto
                    const dirFuga = _v4.set(plano.dir.x, 0, plano.dir.z);
                    const dirFrente = _v2.set(plano.frente.x, 0, plano.frente.z);
                    p.driblePlano = null;

                    if (plano.sucesso) {
                        if (typeof MatchStats !== 'undefined') MatchStats[p.team].dribles.sucesso++;
                        p.speedMult = DribbleModel.sprintBoost;
                        window.bolaChutada = false;

                        p.hasBall = false;
                        p.touchLock = 0.3;
                        p.carryTouchGrace = 1.2;
                        Match.ballCarrier = null;
                        Match.intendedReceiver = p;
                        Match.ballVel.copy(dirFuga).multiplyScalar(Math.max(6.0, p.velocity.length() + 3.5));
                        Match.ballVel.y = 0;
                        Match.lastTouchedTeam = p.team;
                        Match.lastTouchedPlayer = p;

                        this.changeState('CARRY');
                        break;
                    } else {
                        // FALHOU — bola fica solta, adversário pode roubar
                        p.hasBall = false;
                        p.touchLock = 0.5;
                        Match.ballCarrier = null;
                        Match.intendedReceiver = p;
                        // Bola para frente fraca, fácil para o defensor
                        Match.ballVel.copy(dirFrente).multiplyScalar(3.0 + Math.random() * 3.0);
                        Match.ballVel.y = 0;
                        Match.lastTouchedTeam = p.team;
                        Match.lastTouchedPlayer = p;
                        window.bolaChutada = false;
                    }

                    // Volta a CARRY após o toque (o BT decidirá o próximo passo)
                    this.changeState('CARRY');
                }
                break;

            /* =============================================================
               CHEST_CONTROL — matar no peito.

               O gesto: trava, inclina a cintura para trás para a bola bater
               no peito, e volta ao normal.

               Enquanto `peitoCola` não esgota, a bola vai sendo reencostada
               ao tronco todos os frames — é isso que a faz ver-se colada ao
               peito em vez de aparecer logo longe dele. No fim do prazo é
               largada com velocidade e cai sozinha.
               ============================================================= */
            case 'CHEST_CONTROL':
                {
                    p.peitoTimer = (p.peitoTimer || 0) + dt;

                    /*
                    Salto leve (ver controlarNoPeito/peitoPuloMax) — mesma
                    curva seno do salto de cabeceio, pico bem mais baixo
                    (1/3). Escrito aqui, não em animateBones, porque este
                    corre ANTES dele (ver a ordem em player.update) — o guard
                    em animateBones só evita que a linha do idle apague isto
                    a seguir.
                    */
                    if (p.peitoHopTimer > 0) {
                        p.peitoHopTimer -= dt;
                        const jt = Math.max(0, p.peitoHopTimer / BallControl.peitoDur);
                        p.model.position.y = ALTURA_BASE_Y + Math.sin(jt * Math.PI) * BallControl.peitoPuloMax;
                    } else {
                        p.model.position.y = lerpTo(p.model.position.y, ALTURA_BASE_Y, 0.3);
                    }

                    if (p.peitoCola > 0) {
                        p.peitoCola -= dt;
                        p.colarBolaAoPeito();
                        if (p.peitoCola <= 0) p.largarDoPeito();
                    }

                    const nP = Math.min(1, p.peitoTimer / BallControl.peitoDur);
                    p.velocity.multiplyScalar(0.75);

                    /*
                    Inclina depressa e desfaz devagar: a bola bate no peito no
                    início do gesto, não no fim. `sin(π·n)` daria o pico a
                    meio — tarde de mais.

                    A pose em si é escrita em player.aplicarCamadaPeito(),
                    depois do animateBones; aqui só se guarda a intensidade.
                    */
                    p.peitoIntens = (nP < 0.3) ? (nP / 0.3) : (1 - (nP - 0.3) / 0.7);

                    if (nP >= 1) {
                        p.peitoIntens = 0;
                        this.changeState('IDLE');
                    }
                }
                break;

            case 'PASS':
                p.velocity.multiplyScalar(0.95);
                if (p.passTarget && p.turnForPass) {
                    let targetPos = p.passTargetPos || p.passTarget.model.position;
                    _v1.set(p.model.position.x * 2 - targetPos.x, p.model.position.y, p.model.position.z * 2 - targetPos.z);
                    _m1.lookAt(p.model.position, _v1, p.model.up);
                    _q1.setFromRotationMatrix(_m1);
                    p.model.quaternion.slerp(_q1, Math.min(1.0, 25.0 * dt));
                }

                {
                    // p.actionState foi criado em initiatePass() (player.js) e já
                    // sabe o contactTime do clip 'pass' — este case só lê o tempo
                    // normalizado para posar o rig; o efeito real (bola sai do pé)
                    // dispara dentro do próprio ActionState, via onContact.
                    const norm = p.actionState.update(dt, p);

                    if (p.actionState.isDone() || !p.hasBall) {
                        p.actionState = null;
                        this.changeState('IDLE');
                        if (typeof Match !== 'undefined') {
                            if (Match.passTargetVisual) Match.passTargetVisual.visible = false;
                            if (Match.passLineVisual) Match.passLineVisual.visible = false;
                        }
                    }
                }
                break;

            case 'TACKLE':
                p.velocity.multiplyScalar(0.95);
                let tTackle = this.timer / 0.8;
                
                // --- NOVA ANIMAÇÃO PERPENDICULAR ---
                // Se estamos na fase inicial, calculamos a orientação perpendicular à trajetória do portador
                if (Match.ballCarrier && tTackle < 0.3) {
                    let carrierFwd = _v1;
                    if (Match.ballCarrier.velocity && Match.ballCarrier.velocity.lengthSq() > 0.1) {
                        carrierFwd.copy(Match.ballCarrier.velocity).normalize();
                    } else {
                        carrierFwd.set(0, 0, 1).applyQuaternion(Match.ballCarrier.model.quaternion);
                    }
                    
                    const toDef = _v2.subVectors(p.model.position, Match.ballCarrier.model.position);
                    toDef.y = 0;
                    
                    const lateral = _v3.set(-carrierFwd.z, 0, carrierFwd.x); // direção perpendicular 90 graus
                    const isRightSide = toDef.dot(lateral) > 0;
                    const lookDir = isRightSide ? lateral.negate() : lateral; // vira para o portador
                    
                    const lookPos = _vFrenteCorpo.copy(p.model.position).add(lookDir);
                    lookPos.y = p.model.position.y;
                    lookAtBola(p.model, lookPos); // encara o cruzamento da trajetória
                }
                
                if (tTackle < 0.2) {
                    /*
                    // --- ANIMAÇÃO ANTIGA (desativada) ---
                    rig.chest.rotation.x = lerpTo(rig.chest.rotation.x, 0.8, 0.3);
                    p.model.position.y = lerpTo(p.model.position.y, ALTURA_BASE_Y - 0.4, 0.3);
                    rig.rLeg.rotation.x = lerpTo(rig.rLeg.rotation.x, -Math.PI / 2.5, 0.3);
                    rig.lLeg.rotation.x = lerpTo(rig.lLeg.rotation.x, Math.PI / 4, 0.3);
                    */
                    
                    // --- NOVA POSE DE CORTE ---
                    rig.chest.rotation.x = lerpTo(rig.chest.rotation.x, 0.05, 0.3); // tronco erguido
                    p.model.position.y = lerpTo(p.model.position.y, ALTURA_BASE_Y - 0.5, 0.3); // baixa o centro de gravidade
                    
                    // Perna esquerda esticada para cortar a bola
                    rig.lLeg.rotation.x = lerpTo(rig.lLeg.rotation.x, -Math.PI / 2.2, 0.3);
                    rig.lLeg.rotation.z = lerpTo(rig.lLeg.rotation.z, Math.PI / 8, 0.3); 
                    rig.lKnee.rotation.x = lerpTo(rig.lKnee.rotation.x, 0.0, 0.3);
                    
                    // Perna direita fletida com joelho no chão a amparar
                    rig.rLeg.rotation.x = lerpTo(rig.rLeg.rotation.x, Math.PI / 5, 0.3);
                    rig.rKnee.rotation.x = lerpTo(rig.rKnee.rotation.x, -Math.PI / 1.6, 0.3);

                } else if (tTackle < 0.8) {
                    if (p.hasBall === false && Match.ballCarrier && Match.ballCarrier.team !== p.team && Match.ballCarrier.role !== 'gk') {
                        let distToBall = Match.ball.position.distanceTo(p.model.position);
                        if (distToBall < 1.4 && !p.tackleResolvido) {
                            p.tackleResolvido = true;
                            const carrier = Match.ballCarrier;

                            // Bloqueio por ângulo: defensor atrás do portador (>90°) não rouba.
                            let carrierFwd = _v1;
                            if (carrier.velocity && carrier.velocity.lengthSq() > 0.1) {
                                carrierFwd.copy(carrier.velocity).normalize();
                            } else {
                                carrierFwd.set(0, 0, 1).applyQuaternion(carrier.model.quaternion);
                            }
                            const toDefender = _v2.subVectors(p.model.position, carrier.model.position);
                            toDefender.y = 0;
                            toDefender.normalize();
                            const dotAngle = carrierFwd.x * toDefender.x + carrierFwd.z * toDefender.z;

                            /*
                            Desarme de pé é físico — carga de ombro: Velocidade
                            x Força de cada lado (média dos dois skills),
                            não Técnica. Base 0.5: disputa justa a skills
                            iguais. Só possível se o defensor estiver num
                            ângulo <=90° da frente do portador.
                            */
                            const forcaDef = (p.skillFor('SPEED') + p.skillFor('STRENGTH')) / 2;
                            const forcaAtk = (carrier.skillFor('SPEED') + carrier.skillFor('STRENGTH')) / 2;
                            const venceuTackle = dotAngle >= 0 && venceuDuelo(forcaDef, forcaAtk, 0.5);
                            /*
                            Desarme FALHADO: ate aqui nao custava nada a quem
                            errava. Agora o arbitro avalia (js/officials.js) e
                            pode dar falta. O desfecho ja era conhecido neste
                            ponto; so faltava a consequencia.
                            */
                            if (!venceuTackle && typeof Officials !== 'undefined') {
                                Officials.avaliarDueloPerdido(p, carrier, 'desarme');
                            }
                            if (venceuTackle) {
                                carrier.hasBall = false;
                                carrier.touchLock = BallControl.touchLock;
                                Match.ballCarrier = null;
                                Match.ballVel.x = (Math.random() - 0.5) * 15;
                                Match.ballVel.z = p.dirZ * 15;
                                Match.ballVel.y = 2.0;
                                Match.lastTouchedTeam = p.team;
                                Match.lastTouchedPlayer = p;
                                if (typeof MatchStats !== 'undefined') MatchStats[p.team].desarmes.sucesso++;
                            }
                        }
                    }
                } else {
                    p.model.position.y = ALTURA_BASE_Y;
                    this.changeState('MOVE_TO_POS');
                }
                break;

            case 'SLIDE_TACKLE':
                {
                    const S = SlideTackleModel;
                    const tSlide = this.timer;

                    // Desliza; a velocidade cai a zero no fim da fase de deslize.
                    // Depois disso fica caido, sem se arrastar pelo relvado.
                    _v2.set(0, 0, 1).applyQuaternion(p.model.quaternion).normalize();
                    if (tSlide < S.deslize) {
                        p.velocity.copy(_v2).multiplyScalar(S.velocidade * Math.max(0, 1.0 - tSlide / S.deslize));
                    } else {
                        p.velocity.multiplyScalar(0.8);
                    }

                    // Intensidade da pose: entra no lancamento, sai no levantar.
                    let intens = 1.0;
                    if (tSlide < S.lancamento) {
                        intens = tSlide / S.lancamento;
                    } else if (tSlide > S.paragem) {
                        intens = Math.max(0, 1.0 - (tSlide - S.paragem) / (S.levantar - S.paragem));
                    }

                    this.applySlidePose(intens);

                    // Toque na bola: uma unica vez por carrinho.
                    if (!p.slideTouched && !p.hasBall &&
                        tSlide > S.janelaToqueIni && tSlide < S.janelaToqueFim &&
                        Match.ball.position.distanceTo(p.model.position) < S.alcanceToque) {
                        p.slideTouched = true;

                        const carrierSlide = Match.ballCarrier;
                        const alvoValido = carrierSlide && carrierSlide.team !== p.team && carrierSlide.role !== 'gk';

                        // Bloqueio por ângulo: carrinho por trás (>90°) não rouba.
                        let slideAngleOk = true;
                        if (alvoValido) {
                            let cFwd = _v1;
                            if (carrierSlide.velocity && carrierSlide.velocity.lengthSq() > 0.1) {
                                cFwd.copy(carrierSlide.velocity).normalize();
                            } else {
                                cFwd.set(0, 0, 1).applyQuaternion(carrierSlide.model.quaternion);
                            }
                            const toDef = _v2.subVectors(p.model.position, carrierSlide.model.position);
                            toDef.y = 0;
                            toDef.normalize();
                            slideAngleOk = (cFwd.x * toDef.x + cFwd.z * toDef.z) >= 0;
                        }

                        /*
                        Carrinho é Técnica (drible do portador) x Marcação (do
                        defensor) — quem lê melhor o corpo do outro. Base 0.45:
                        um carrinho é um lance arriscado, o portador começa
                        ligeiramente favorito mesmo a skills iguais.
                        Só possível se o defensor estiver na frente/lado (<=90°).
                        */
                        const venceu = alvoValido && slideAngleOk && venceuDuelo(p.skillFor('MARKING'), carrierSlide.skillFor('TEC'), 0.45);

                        /*
                        Carrinho FALHADO sobre um alvo valido: e a fonte de
                        falta mais forte do jogo (corpo no chao, em movimento,
                        e o pe acerta na perna). Ver js/officials.js.
                        */
                        if (!venceu && alvoValido && typeof Officials !== 'undefined') {
                            Officials.avaliarDueloPerdido(p, carrierSlide, 'carrinho');
                        }

                        if (venceu) {
                            carrierSlide.hasBall = false;
                            carrierSlide.touchLock = BallControl.touchLock;
                            Match.ballCarrier = null;
                            if (typeof MatchStats !== 'undefined') MatchStats[p.team].carrinhos.sucesso++;
                        }

                        if (venceu || !alvoValido) {
                            // A bola sai na direccao do toque (para onde o pe ia)
                            // com forca para percorrer `empurraoBola` metros.
                            _v1.copy(_v2);
                            _v1.x += (Math.random() - 0.5) * 0.35;
                            _v1.y = 0;
                            _v1.normalize();
                            /*
                            `forceForDistance` (1.68) vinha do modelo de
                            arrasto antigo. Com a física real a bola percorria
                            muito mais do que os `empurraoBola` metros
                            pretendidos — pede-se agora a velocidade que a põe
                            a parar ali.
                            */
                            const vEmp = velocidadeRasteiraPara(S.empurraoBola, 0);
                            Match.ballVel.copy(_v1).multiplyScalar(vEmp);
                            Match.ballVel.y = S.alturaBola;
                            Match.intendedReceiver = null;
                            Match.passTargetPos = null;
                            Match.lastTouchedTeam = p.team;
                            Match.lastTouchedPlayer = p;
                            window.bolaChutada = false;
                        }
                        // Perdeu o duelo: o portador passa por cima do carrinho
                        // e segue com a bola, sem ela ser tocada.

                        // Esta no chao: nao pode ser ele a recolher a bola.
                        p.touchLock = S.bloqueioAposToque;
                    }

                    if (tSlide >= S.levantar) {
                        p.model.position.y = ALTURA_BASE_Y;
                        this.changeState('MOVE_TO_POS');
                    }
                }
                break;

            case 'SHOOT':
                p.velocity.multiplyScalar(0.95);
                {
                    _v1.set(0, 0, p.targetGoalZ);
                    _v2.set(p.model.position.x * 2 - _v1.x, p.model.position.y, p.model.position.z * 2 - _v1.z);
                    _m1.lookAt(p.model.position, _v2, p.model.up);
                    _q1.setFromRotationMatrix(_m1);
                    p.model.quaternion.slerp(_q1, Math.min(1.0, 15.0 * dt));
                }

                /*
                O gesto inteiro sai do ShotClip (12 keyframes) e a bola parte no
                contactTime, dentro do ActionState criado em initiateShoot.
                Antes eram duas poses com lerp e 0.2 s de estado — lia-se como
                uma estocada, não como um remate.
                */
                if (p.actionState) {
                    const normR = p.actionState.update(dt, p);
                    p.aplicarFrameRemate(amostrarClipRemate(normR));
                    if (p.actionState.isDone()) {
                        p.actionState = null;
                        p.resetBonesToDefault();
                        this.changeState('IDLE');
                    }
                } else {
                    this.changeState('IDLE');
                }
                break;
            case 'BALL_CONTROL_RIGHT':
                p.velocity.multiplyScalar(0.85);
                if (p.actionState) {
                    const normC = p.actionState.update(dt, p);
                    p.aplicarFrameDominioDireito(amostrarClipDominioDireito(normC));
                    if (p.actionState.isDone()) {
                        p.actionState = null;
                        p.resetBonesToDefault();
                        this.changeState('CARRY');
                    }
                } else {
                    this.changeState('CARRY');
                }
                break;
            case 'WATCH_CORNER':
                p.velocity.set(0, 0, 0);
                if (Match.ball) {
                    let lookPos = _v2.copy(Match.ball.position);
                    lookPos.y = p.model.position.y;
                    lookAtBola(p.model, lookPos);
                }

                /*
                A bola PARTE do chão (y = 0.11) e só passa os 0.5 m ao fim de
                quatro frames. Testar `y < 0.5` à cabeça dava verdade logo no
                primeiro frame e o batedor saía daqui 67 ms depois de bater —
                o comportamento não chegava a ver-se.

                Por isso a queda só conta depois de a bola ter subido. Sai para
                MOVE_TO_POS e não para IDLE: ele tem de voltar ao jogo, e IDLE
                deixa-o à espera que alguém o mande mexer.
                */
                if (Match.ball.position.y > 0.5) this.cornerBolaSubiu = true;
                if ((this.cornerBolaSubiu && Match.ball.position.y < 0.5) ||
                    Match.lastTouchedPlayer !== p) {
                    this.changeState('MOVE_TO_POS');
                }
                break;
        }
    }
}

