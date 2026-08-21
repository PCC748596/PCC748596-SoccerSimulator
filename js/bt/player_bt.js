/*
=============================================================================
NÍVEL 3 — PLAYER BEHAVIOR TREE
=============================================================================
Corre uma vez por jogador por frame, DEPOIS dos níveis 1 e 2.

Responde à última pergunta da cadeia: **o que é que este jogador faz agora?**
Passar, rematar, lançar, driblar, conduzir, pressionar, desarmar, cortar.

O BT decide; quem executa ao longo do tempo é sempre a PlayerFSM. Nenhuma folha
aqui deve durar mais do que um frame — muda o estado e devolve SUCCESS.

Ligação com os níveis de cima:
    bb (TeamBlackboard)  postura colectiva, linha defensiva do adversário
    p.dynamicTarget      onde o nível 2 o mandou colocar-se
=============================================================================
*/

/* --- Contexto por jogador ----------------------------------------------- */

class PlayerContext {
    constructor(player) {
        this.p = player;
        this.dt = 1 / 60;
        this.skillSpeed = 80;
        this.skillTec = 80;
        this.underPressure = false;
        this.distToBall = 0;
        this.trace = [];
    }

    prepare(dt) {
        const p = this.p;
        this.dt = dt;
        // Skills individuais (data/player_skills.js) por contexto — SPEED
        // pras fórmulas de velocidade, TEC pra cadência de decisão/leitura
        // de jogo. skillFor() cai no genérico (médias do painel) se o
        // jogador ainda não tiver skills carregados.
        this.skillSpeed = p.skillFor('SPEED');
        this.skillTec = p.skillFor('TEC');
        this.distToBall = p.model.position.distanceTo(Match.ball.position);
        this.trace.length = 0;

        // Sob pressão: um adversário a menos de 3.5 m.
        // Espaço à frente: adversário mais próximo dentro de um corredor que
        // abre com a distância. Infinity se o caminho estiver limpo.
        this.underPressure = false;
        this.espacoAFrente = Infinity;

        /*
        Metros percorridos com a bola no pé. Zera quando ele a perde.
        É o que trava as conduções infinitas: a condição de espaço aberto não
        tem memória, e sozinha mantinha-se verdadeira enquanto ele corria.
        */
        if (!p.hasBall) {
            p.carryDist = 0;
            // A bola mudou de pé: o recuo com bola acabou.
            p.carryRecuo = false;
        } else if (p.ultimaPosCarry) {
            // Passos maiores do que isto não são corrida — são um recomeço, uma
            // bola parada ou um reposicionamento. Contá-los enchia o orçamento
            // de uma vez e desligava o ramo para sempre.
            const passo = p.model.position.distanceTo(p.ultimaPosCarry);
            if (passo < 1.0) p.carryDist = (p.carryDist || 0) + passo;
        }
        if (!p.ultimaPosCarry) p.ultimaPosCarry = new THREE.Vector3();
        p.ultimaPosCarry.copy(p.model.position);

        /*
        Playing style: ligar ou não NESTE frame.

        O estilo não é um traço permanentemente ligado — é uma forma de jogar
        que só interessa em certas alturas. Um Goal Poacher colado ao último
        defensor com a bola na nossa área é um jogador a menos; um Cross
        Specialist encostado à linha com a bola do lado contrário também.

        Fica aqui, no nível 3, e não numa folha da árvore, porque tem de
        correr todos os frames independentemente do ramo que venha a ganhar:
        o estilo comanda o POSICIONAMENTO (nível 2, via estiloAtivoDe no
        commit) tanto quanto a decisão.
        */
        if (typeof avaliarEstilo === 'function' && this.bb) {
            avaliarEstilo(p, this.bb, dt);
        }

        // Eventos de posse — disparam na transição sem bola -> com bola.
        if (p.hasBall && !p._hadBallPrev && typeof EventBus !== 'undefined') {
            if (p.pos === 'CB') EventBus.emit('CB_HAS_BALL', { p: p });
            else if (p.pos === 'CM') EventBus.emit('CM_HAS_BALL', { p: p });
        }
        p._hadBallPrev = p.hasBall;
        if (p.role === 'gk') limparSaidaGK(p);
        // Perdida a posse (ou com a bola no pé), ninguém é ocupante de uma
        // vaga de apoio — senão a vantagem do ocupante sobrevivia à
        // transição e falseava a disputa na posse seguinte.
        if (p.hasBall || !this.bb || !this.bb.isAttacking) p.apoioAtivo = false;

        /*
        Tempo seguido perto do portador adversário — Defensive Pressure não
        manda só a DISTÂNCIA de marcação (MarkingModel.distanciaPara:
        5/4/3m no ataque e no meio, 4/3/2m na defesa),
        manda também quanto tempo aguenta essa distância antes de tentar
        roubar (DefensivePressureModel: 6/4/2s, Low/Bal/High). Carrinho e
        Desarme só entravam a rolar dado por segundo sem olhar há quanto
        tempo estava perto — tentavam a bola assim que chegavam.
        */
        const cAdv = Match.ballCarrier;
        if (cAdv && cAdv.team !== p.team && p.model.position.distanceTo(cAdv.model.position) < 4.5) {
            p.tempoPertoDoPortador = (p.tempoPertoDoPortador || 0) + dt;
        } else {
            p.tempoPertoDoPortador = 0;
        }

        const tec = p.skillFor ? p.skillFor('TEC') : 50;
        const maxVisionDist = alcanceVisao(tec, 15.0);
        const halfAngleRad = coneVisao(tec);
        const aberturaCorredor = Math.tan(halfAngleRad);

        for (const opp of this.opponents) {
            if (opp.role === 'gk') continue;
            const oPos = opp.model.position;
            if (p.model.position.distanceTo(oPos) < 3.5) this.underPressure = true;

            const dz = (oPos.z - p.model.position.z) * p.dirZ;
            if (dz <= 0 || dz > maxVisionDist) continue;
            const dx = Math.abs(oPos.x - p.model.position.x);
            if (dx > CarryModel.corredor + dz * aberturaCorredor) continue;
            if (dz < this.espacoAFrente) this.espacoAFrente = dz;
        }
        return this;
    }

    /*
    Campo aberto: há relva que chegue à frente para conduzir em vez de passar,
    E ainda sobra orçamento de condução.

    A segunda metade é essencial. Sem ela o portador conduz enquanto houver
    espaço — e como ele próprio abre espaço ao correr, isso é sempre.
    */
    get campoAberto() {
        if (this.underPressure) return false;
        if (this.espacoAFrente < CarryModel.espacoLivre) return false;
        return (this.p.carryDist || 0) < CarryModel.distanciaMax;
    }

    get opponents() { return (this.p.team === 'TeamA') ? Match.opponents : Match.players; }
    get teammates() { return (this.p.team === 'TeamA') ? Match.players : Match.opponents; }
    get zoneAhead() { return this.p.model.position.z * this.p.dirZ; }
    // Blackboard da equipa adversária: dá-nos a linha que um lançamento tem de bater.
    get oppBB() { return TeamAI.get(this.p.team === 'TeamA' ? 'TeamB' : 'TeamA'); }
    // Blackboard da própria equipa — usado por actHoldPosition para escolher
    // entre MARKING/BLOCKING/SUPPORT.
    get bb() { return TeamAI.get(this.p.team); }
}

/* =========================================================================
   COM BOLA
   ========================================================================= */

/*
Lançamento: passe para o espaço nas costas da última linha adversária.

É o único conceito da lista que não existia de todo — todos os passes miravam a
posição actual de um colega. Aqui miramos o ESPAÇO à frente de um colega que
esteja em condições de lá chegar primeiro.

Aproveita o `defLineDir` que o nível 1 do adversário já calcula.
*/
function findThroughBall(ctx) {
    const p = ctx.p;

    // Um defesa a lançar é o jogo directo que se quer evitar: a bola tem de
    // passar pelo meio-campo. O lançamento é arma de médios e avançados.
    if (p.role === 'def' || p.role === 'gk') return null;
    if (Math.random() > PassModel.throughBallChance) return null;

    const linhaAdv = ctx.oppBB.defLineDir;      // no referencial de ataque DELES
    if (linhaAdv === undefined || linhaAdv === null) return null;

    // A mesma linha, no nosso referencial de ataque.
    const linhaNoNosso = -linhaAdv;
    const meuZ = p.model.position.z * p.dirZ;

    // Só faz sentido lançar de trás da linha e com campo para correr.
    if (meuZ > linhaNoNosso - 4) return null;
    if (linhaNoNosso > 44) return null;

    let melhor = null;
    let melhorNota = -Infinity;

    for (const mate of ctx.teammates) {
        if (mate === p || mate.role === 'gk') continue;
        if (mate.role === 'def') continue;              // defesas não fazem desmarcações

        // Alvo do PositionBT, não a posição actual — ver alvoDePasse().
        const mateAlvo = alvoDePasse(mate);
        const mateZ = mateAlvo.z * p.dirZ;
        // Tem de estar aquém da linha (senão já está em fora-de-jogo) mas perto dela.
        if (mateZ > linhaNoNosso) continue;
        if (mateZ < linhaNoNosso - PassModel.throughBallGap) continue;

        const dist = p.model.position.distanceTo(mateAlvo);
        // Lançamento é bola longa: abaixo de distMinLonga é passe normal.
        if (dist < PassModel.distMinLonga || dist > PassModel.throughBallMaxDist) continue;

        // Calcula o alvo baseado na velocidade relativa (bola ~15m/s, jogador ~7m/s)
        // O jogador corre aproximadamente 45% da distância do passe durante o tempo de voo.
        let corridaM = dist * 0.45;
        let zFuturo = mateZ + corridaM;
        
        // Garante que o passe rompe a linha defensiva
        if (zFuturo < linhaNoNosso + 2) zFuturo = linhaNoNosso + 2;
        // Impede que saia de campo ou vá directo ao guarda-redes (linha de fundo é 50)
        if (zFuturo > 46) zFuturo = 46;

        let alvoZ = zFuturo * p.dirZ;
        let alvoX = mateAlvo.x * 0.85;
        const oppTeamKey = (p.team === 'TeamA') ? 'TeamB' : 'TeamA';

        if (typeof SpatialGrid !== 'undefined' && SpatialGrid.cells) {
            const livreSpot = SpatialGrid.findFreeSpace(alvoX, alvoZ, 6, oppTeamKey);
            if (!livreSpot) continue;
            if (SpatialGrid.occupancy(livreSpot.x, livreSpot.z, 1, oppTeamKey) > 0) continue;
            alvoX = livreSpot.x; alvoZ = livreSpot.z;
        } else {
            _v1.set(alvoX, 0, alvoZ);
            let livre = true;
            for (const opp of ctx.opponents) {
                if (opp.role === 'gk') continue;
                if (opp.model.position.distanceTo(_v1) < 6.0) { livre = false; break; }
            }
            if (!livre) continue;
        }

        let nota = 100 - dist * 0.5 + (linhaNoNosso - mateZ) * 2.0;
        if (typeof SpatialGrid !== 'undefined' && SpatialGrid.cells) {
            nota += SpatialGrid.layerValueAt('lancamento', alvoX, alvoZ, p.team) * 0.5;
        }
        if (window.showPlayerPoints) { mate.debugPoints = mate.debugPoints || {}; mate.debugPoints['Lanç'] = Math.round(nota); }
        if (nota > melhorNota) { melhorNota = nota; melhor = { mate: mate, alvoX: alvoX, alvoZ: alvoZ }; }
    }

    /*
    Rasteiro ou pelo alto? Um lançamento rasteiro por entre a linha adversária
    é bola entregue ao primeiro que corte. Se há alguém no corredor do passe,
    levanta-se a bola por cima deles — continua a cair no mesmo sítio, o
    espaço à frente do companheiro.
    */
    if (melhor) {
        _v1.set(p.model.position.x, 0, p.model.position.z);
        _v2.set(melhor.alvoX, 0, melhor.alvoZ);
        _line1.set(_v1, _v2);
        let naLinha = 0;
        for (const opp of ctx.opponents) {
            if (opp.role === 'gk') continue;
            _line1.closestPointToPoint(opp.model.position, true, _v3);
            _v3.y = 0;
            if (_v3.distanceTo(opp.model.position.clone().setY(0)) < PassModel.corredorBloqueio) naLinha++;
        }
        melhor.alto = naLinha > 0;
    }

    return melhor;
}

/*
Escolha de passe por PONTUAÇÃO em vez de por função.

Antes era `findPassTarget('atk') || findPassTarget('mid') || findPassTarget('def')`:
um avançado marcado ganhava sempre a um médio livre, só por ser avançado. Agora
pedimos os candidatos das três funções e ficamos com o melhor de todos, com um
empurrão para a função preferida desta posição.
*/
function bestPassTarget(ctx, preferida) {
    const p = ctx.p;
    let melhor = p.findPassTarget();

    if (!melhor && ctx.underPressure) melhor = p.findPassTargetRelaxed();

    /*
    Preso sob pressão há mais de 1s sem achar passe nenhum (defensor em cima
    da linha de qualquer opção): passe de pânico, ignora a linha, só olha se
    o colega está livre no destino. Sem isto caía sempre no fallback
    actCarry — corta, retoma, corta, retoma, nunca alcançava quem estava
    livre.
    */
    if (!melhor && ctx.underPressure && p.decisionTimer > 1.0) melhor = p.findPassTargetDesperate();

    return melhor;
}
// Remate.
function actShoot(ctx) {
    if (ctx.p.aguardarPassada()) return true;
    ctx.p.initiateShoot();
}

/*
Cruzamento da ala para a área.

Devolve o alvo e a probabilidade, ou null se não houver ninguém na área — sem
alguém lá dentro um cruzamento é só devolver a bola ao adversário.

A "área" aqui é mesmo a grande área (34 m à frente da linha central, 20.5 m de
meia-largura), e não o `z > 24 && |x| < 14` de antes, que apanhava meio
meio-campo. Entre vários candidatos escolhe o mais central: quem ataca o
primeiro poste tem melhor ângulo do que quem está encostado à linha de fundo.
*/
function findCross(ctx) {
    const p = ctx.p;
    const C = CrossModel;

    const meuX = Math.abs(p.model.position.x);
    if (meuX < C.alaX || ctx.zoneAhead < C.zonaZ) return null;

    let alvo = null;
    let alvos = 0;
    let melhorX = Infinity;

    for (const m of ctx.teammates) {
        if (m === p || m.role === 'gk') continue;
        if (m.model.position.z * p.dirZ < C.areaZ) continue;
        const mx = Math.abs(m.model.position.x);
        if (mx > C.areaX) continue;
        // Perto de mais para cruzamento pelo ar — é um passe curto, não uma
        // bola lançada por cima de todos (ver CrossModel.distMin).
        if (m.model.position.distanceTo(p.model.position) < C.distMin) continue;
        alvos++;
        if (mx < melhorX) { melhorX = mx; alvo = m; }
    }
    if (!alvo) return null;

    const largura = THREE.MathUtils.clamp((meuX - C.alaX) / (28.0 - C.alaX), 0, 1);
    const fundo = THREE.MathUtils.clamp((ctx.zoneAhead - C.zonaZ) / (C.fundoZ - C.zonaZ), 0, 1);

    let chance = C.chanceBase + C.chancePorAlvo * (alvos - 1) +
        C.bonusLargura * largura + C.bonusFundo * fundo;
    if (ctx.underPressure) chance -= C.penalPressao;

    // TeamPlayStyle (docs/tacticSystem.md) — Wing Play cruza bem mais, Direct/
    // Counter Attack ficam no neutro (ver TeamPlayStyles em config.js).
    if (typeof TeamPlayStyles !== 'undefined') {
        const teamStyle = TeamPlayStyles[Tatics.teamPlayStyle] || TeamPlayStyles.positional;
        chance *= teamStyle.cruzamento;
    }

    // Grid espacial (camada CRUZAMENTO): soma o valor autorado da célula do cruzador.
    if (typeof SpatialGrid !== 'undefined' && SpatialGrid.cells) {
        const crossVal = SpatialGrid.layerValueAt('cruzamento', p.model.position.x, p.model.position.z, p.team);
        chance += (crossVal / 100) * C.pesoGrid;
    }

    if (window.showPlayerPoints && alvo) {
        alvo.debugPoints = alvo.debugPoints || {};
        alvo.debugPoints['Cross'] = Math.round(chance);
    }

    /*
    Alto ou rasteiro?

    Rasteiro é o cruzamento que corta a linha da defesa junto ao chão — melhor
    quando NÃO há ninguém no caminho e o alvo está perto do primeiro poste,
    porque chega mais depressa e não dá tempo ao guarda-redes de sair.

    Alto é o que passa POR CIMA de quem está entre a bola e o alvo. Se há
    gente na linha do cruzamento, rasteiro é bola entregue ao primeiro
    defensor. Também se prefere alto quando o alvo é longe (segundo poste) ou
    quando ele ganha bem de cabeça (FORÇA).
    */
    _line1.set(p.model.position, alvo.model.position);
    let bloqueadores = 0;
    for (const opp of ctx.opponents) {
        if (opp.role === 'gk') continue;
        _line1.closestPointToPoint(opp.model.position, true, _v1);
        if (_v1.distanceTo(opp.model.position) < 1.6) bloqueadores++;
    }

    const distAlvo = p.model.position.distanceTo(alvo.model.position);
    // Pontuação do ALTO: quem estiver no caminho pesa muito, distância e jogo
    // aéreo do alvo pesam menos.
    let notaAlto = bloqueadores * 0.45
        + THREE.MathUtils.clamp((distAlvo - 14) / 20, 0, 1) * 0.35
        + ((alvo.skillFor('STRENGTH') - 50) / 100) * 0.30;

    return {
        alvo: alvo,
        chance: THREE.MathUtils.clamp(chance, 0, C.chanceMax),
        alto: notaAlto >= 0.5,
        bloqueadores: bloqueadores
    };
}

function actCross(ctx) {
    const p = ctx.p;
    if (p.aguardarPassada()) return true;
    p.isCross = true;
    // Consumido em executePassGameplay (fsm.js) para escolher a altura.
    p.crossAlto = ctx.cross.alto;
    p.initiatePass(ctx.cross.alvo);
}

function actThroughBall(ctx) {
    const lance = ctx.throughBall;
    if (ctx.p.aguardarPassada()) return true;
    ctx.p.isThroughBall = true;
    // Consumido em executePassGameplay: rasteiro por entre a defesa, ou pelo
    // alto por cima dela (ver findThroughBall).
    ctx.p.throughBallAlto = !!lance.alto;
    ctx.p.throughBallTarget = { x: lance.alvoX, z: lance.alvoZ };
    ctx.p.initiatePass(lance.mate);
}

/*
Saída do guarda-redes: sorteada UMA vez por posse.

A cada frame seria um sorteio novo enquanto ele segura a bola, e ao fim de
uma dúzia de frames alguma das faces já tinha saído — o resultado real seria
"o que calhar primeiro", não os 80/20 pedidos. Fica gravada no jogador e só
é limpa quando ele deixa de ter a bola (ver limparSaidaGK).
*/
function decidirSaidaGK(p) {
    if (p.gkSaida) return p.gkSaida;
    p.gkSaida = (Math.random() < GoalkeeperDistribution.laterais) ? 'laterais' : 'chuteFrente';
    return p.gkSaida;
}

function limparSaidaGK(p) {
    if (!p.hasBall && p.gkSaida) p.gkSaida = null;
}

/*
Lateral disponível para a saída curta: o mais desmarcado dos dois, dentro do
alcance. "Desmarcado" aqui é literal — adversário mais próximo a mais de
`folgaMinima`; um lateral com um extremo em cima não é saída, é oferta.
*/
function acharLateralParaSaida(ctx) {
    const p = ctx.p;
    const G = GoalkeeperDistribution;
    let melhor = null, melhorFolga = -Infinity;

    for (const mate of ctx.teammates) {
        if (mate === p) continue;
        if (mate.pos !== 'LB' && mate.pos !== 'RB') continue;
        if (p.model.position.distanceTo(mate.model.position) > G.distanciaMaxLateral) continue;

        let folga = Infinity;
        for (const opp of ctx.opponents) {
            if (opp.role === 'gk') continue;
            const d = mate.model.position.distanceTo(opp.model.position);
            if (d < folga) folga = d;
        }
        if (folga < G.folgaMinima) continue;
        if (folga > melhorFolga) { melhorFolga = folga; melhor = mate; }
    }
    return melhor;
}

/*
Passe para um receptor JÁ decidido: o PassTypes escolhe o ponto, mas não
troca a pessoa. É o que a saída pelos laterais precisa — trocar o receptor
aqui desfazia a decisão que acabou de ser tomada.
*/
function actPassParaAlvo(ctx, alvo) {
    const p = ctx.p;
    if (p.aguardarPassada()) return true;
    if (typeof PassTypes !== 'undefined') {
        const r = PassTypes.paraMate(p, alvo);
        aplicarMiraDoPasse(p, r.tipo, r.ponto);
    } else {
        p.passAimPoint = null;
        p.passTipo = 'direct';
    }
    p.initiatePass(alvo);
}

/*
Aplica o ponto de mira decidido pelo PassTypes.

Um passe para o ESPAÇO não é um passe normal apontado para longe: tem de
chegar ao ponto a um ritmo em que se corre para ela. Reaproveita a balística
do lançamento (PassModel.vChegadaLancamento, 5 m/s à chegada) em vez da do
passe aos pés — sem isto, um leading a 25 m era resolvido como passe normal,
passava o limiar de `distAereo` (20 m), subia, e chegava à altura do PEITO do
receptor. Daí vinham as duas queixas de uma vez: bola "muito forte" e
jogadores a inclinarem-se para trás a matá-la no peito.
*/
function aplicarMiraDoPasse(p, tipo, ponto) {
    p.passTipo = tipo;
    p.passAimPoint = ponto ? { x: ponto.x, z: ponto.z } : null;

    /*
    O ponto CURTO (pontoLiderancaCurta, em pass_types.js) não leva balística de
    lançamento: são 4 m à frente do companheiro, não uma bola para ele correr
    atrás. Com vChegadaLancamento (5 m/s à chegada) ficava a rolar mansa à
    frente dele. Vai como passe normal, só com o alvo deslocado.
    */
    const paraOEspaco = ponto && !ponto.curto &&
        (tipo === PassTypes.SPACE || tipo === PassTypes.LEADING);

    if (paraOEspaco) {
        p.isThroughBall = true;
        p.throughBallTarget = { x: ponto.x, z: ponto.z };
        // Rasteiro: o corredor já foi validado pelo filtro do leque (nenhum
        // adversário a menos de 2 m, linha de passe livre).
        p.throughBallAlto = false;
    }
}

/*
O BT já escolheu um companheiro; o PassTypes decide COMO a bola lhe chega (aos
pés, no espaço à frente, ou no ponto mais adiantado do leque) e pode trocar o
receptor por outro claramente melhor para o tipo sorteado.

Quando nem o melhor candidato chega a `notaMinima`, desce-se a cascata em vez de
passar por passar — era daí que vinha o toque eterno para o companheiro isolado
na lateral, onde não havia jogada nenhuma:

    1. driblar, se a técnica der para isso e houver espaço à frente;
    2. atrasar a alguém PERTO, para reiniciar a jogada;
    3. voltar com a bola e esperar que apareça linha.

Sem PassTypes carregado, ou sem nada melhor a propor, fica o caminho antigo.
*/
function actPass(ctx) {
    const p = ctx.p;
    if (p.aguardarPassada()) return true;
    if (typeof PassTypes === 'undefined') {
        p.passAimPoint = null;
        p.passTipo = 'direct';
        p.initiatePass(ctx.passTarget);
        return;
    }

    const E = PassTypeModel.escolha;
    const escolha = PassTypes.escolher(p, ctx.passTarget);
    // Se está sob pressão na defesa, a nota mínima é ignorada para forçar o passe e evitar perder a bola
    const naDefesaSobPressao = ctx.underPressure && (p.model.position.z * p.dirZ < 0);
    const boa = escolha && escolha.mate && (escolha.nota >= E.notaMinima || naDefesaSobPressao);

    if (boa) {
        p.carryRecuo = false;
        aplicarMiraDoPasse(p, escolha.tipo, escolha.ponto);
        p.initiatePass(escolha.mate);
        return;
    }

    /*
    1. Levar a bola, se a técnica der para isso e houver espaço à frente.

    CARRY e não DRIBBLE: o estado DRIBBLE é o 1x1 contra um adversário
    NOMEADO (p.dribbleOpponent), e aqui não há nenhum — é campo aberto. Por
    isso também não conta como drible tentado nas estatísticas: contava, e
    inflacionava o número de dribles com conduções que nunca foram um 1x1.
    Quem conta dribles é o actDribble, que tem mesmo um adversário pela frente.
    */
    const tec = p.skillFor ? p.skillFor('TEC') : 50;
    if (tec >= E.tecnicaDrible && ctx.campoAberto) {
        p.carryRecuo = false;
        p.apoioAtivo = false;
        p.fsm.changeState('CARRY');
        return;
    }

    // 2. Atrasar a alguém perto, para reiniciar a jogada.
    const recuo = PassTypes.melhorRecuo(p);
    if (recuo) {
        p.carryRecuo = false;
        const r = PassTypes.paraMate(p, recuo);
        aplicarMiraDoPasse(p, r.tipo, r.ponto);
        p.initiatePass(recuo);
        return;
    }

    // 3. Voltar com a bola e esperar.
    if (escolha && escolha.mate) {
        p.carryRecuo = true;
        p.apoioAtivo = false;
        p.fsm.changeState('CARRY');
        return;
    }

    // Sem candidato nenhum: o caminho antigo, para nunca ficar sem saída.
    p.passAimPoint = null;
    p.passTipo = 'direct';
    p.initiatePass(ctx.passTarget);
}

function podeDriblar(ctx) {
    const p = ctx.p;
    if (p.role === 'gk') return false;

    // Regra 4: Adversário próximo, espaço atrás do adversário, técnica >= 75 - Driblar
    const tec = p.skillFor ? p.skillFor('TEC') : ctx.skillTec;
    if (tec < 75) return false;
    if (p.fsm.currentState === 'DRIBBLE') return false;
    if (p.model.position.z * p.dirZ < 0) return false; // Na defesa, prioriza o passe em vez do drible

    // Verificar se há adversário próximo à sua frente bloqueando a passagem
    let oppProximo = null;
    let menorDist = Infinity;
    for (const opp of ctx.opponents) {
        if (opp.role === 'gk') continue;
        const d = p.model.position.distanceTo(opp.model.position);
        if (d >= 0.8 && d <= 4.8) {
            const dz = (opp.model.position.z - p.model.position.z) * p.dirZ;
            if (dz > -0.5 && dz < 4.8) {
                const dx = Math.abs(opp.model.position.x - p.model.position.x);
                if (dx < 3.6 && d < menorDist) {
                    menorDist = d;
                    oppProximo = opp;
                }
            }
        }
    }
    if (!oppProximo) return false;

    // Verificar espaço atrás do adversário (costas do adversário desimpedidas para progressão)
    const oppZ = oppProximo.model.position.z;
    const oppX = oppProximo.model.position.x;
    let espacoAtrasLivre = true;
    for (const opp2 of ctx.opponents) {
        if (opp2 === oppProximo || opp2.role === 'gk') continue;
        const dzAtras = (opp2.model.position.z - oppZ) * p.dirZ;
        if (dzAtras > 0 && dzAtras < 6.5) {
            const dxAtras = Math.abs(opp2.model.position.x - oppX);
            if (dxAtras < 3.2) {
                espacoAtrasLivre = false;
                break;
            }
        }
    }
    if (!espacoAtrasLivre) return false;

    ctx.dribbleOpponent = oppProximo;
    return true;
}

function actDribble(ctx) {
    const p = ctx.p;
    if (p.aguardarPassada()) return true;
    p.dribbleOpponent = ctx.dribbleOpponent;
    if (typeof MatchStats !== 'undefined') MatchStats[p.team].dribles.tentados++;
    p.fsm.changeState('DRIBBLE');
}

function findBestPassAnywhere(ctx) {
    const p = ctx.p;
    if (!ctx.underPressure) {
        const tb = findThroughBall(ctx);
        if (tb) return { type: 'through', data: tb };
    }
    
    let target = p.findPassTarget(); // Avalia todos e escolhe o melhor
    if (!target && ctx.underPressure) target = p.findPassTargetRelaxed();
    if (!target && ctx.underPressure && p.decisionTimer > 0.8) target = p.findPassTargetDesperate();
    
    if (target) return { type: 'pass', target: target };
    return null;
}

function findPassSide(ctx) {
    const p = ctx.p;
    let target = p.findPassTarget('lado');
    if (!target && ctx.underPressure) target = p.findPassTargetRelaxed('lado');
    if (target) return { type: 'pass', target: target };
    return null;
}

function findPassBack(ctx) {
    const p = ctx.p;
    let target = p.findPassTarget('tras');
    if (!target && ctx.underPressure) target = p.findPassTargetRelaxed('tras');
    if (!target && ctx.underPressure && p.decisionTimer > 0.8) target = p.findPassTargetDesperate();
    if (target) return { type: 'pass', target: target };
    return null;
}

function actClearance(ctx) {
    const p = ctx.p;
    if (p.aguardarPassada()) return true;
    if (typeof MatchStats !== 'undefined') MatchStats[p.team].passes.tentados++;

    const meiaLarg = CAMPO_LARG / 2;
    // Chuta em direção à lateral mais próxima para aliviar o perigo
    const ladoX = (p.model.position.x >= 0) ? (meiaLarg + 2.0) : (-meiaLarg - 2.0);
    const alvoZ = p.model.position.z + p.dirZ * 12.0;

    _v1.set(ladoX - p.model.position.x, 0, alvoZ - p.model.position.z).normalize();
    const forca = 16.0 + Math.random() * 6.0;
    const elev = THREE.MathUtils.degToRad(18 + Math.random() * 14);
    const vh = forca * Math.cos(elev);

    Match.ballVel.set(_v1.x * vh, forca * Math.sin(elev), _v1.z * vh);
    p.hasBall = false;
    p.touchLock = BallControl.touchLock;
    Match.ballCarrier = null;
    Match.intendedReceiver = null;
    Match.passTargetPos = null;
    Match.lastTouchedTeam = p.team;
    Match.lastTouchedPlayer = p;
    window.bolaChutada = true;

    p.fsm.changeState('MOVE_TO_POS');
}

function actCarry(ctx) {
    ctx.p.fsm.changeState('CARRY');
}

/* =========================================================================
   SEM BOLA
   ========================================================================= */

function actSlideTackle(ctx) {
    const p = ctx.p;
    if (typeof MatchStats !== 'undefined') MatchStats[p.team].carrinhos.tentados++;
    if (Match.ballCarrier) {
        _v1.copy(Match.ballCarrier.model.position);
    } else {
        _v1.copy(Match.ball.position);
    }
    _v1.y = p.model.position.y;
    lookAtBola(p.model, _v1);
    p.fsm.changeState('SLIDE_TACKLE');
}

function actTackle(ctx) {
    const p = ctx.p;
    if (typeof MatchStats !== 'undefined') MatchStats[p.team].desarmes.tentados++;
    p.speedMult = 8.0 * 1.25 * 0.9; // +25% depois -10% pedidos: velocidade máxima SEM bola
    p.dynamicTarget.copy(Match.ballCarrier.model.position);
    p.fsm.changeState('TACKLE');
}

function actChaseBall(ctx) {
    const p = ctx.p;
    p.speedMult = (5.8 + ((ctx.skillSpeed - 50) / 50) * 1.5) * 1.25 * 0.9;
    if (Match.counterAttackTeam === p.team) p.speedMult *= 1.25;
    p.dynamicTarget.copy(Match.ball.position);
    p.fsm.changeState('MOVE_TO_POS');
}

/*
Vale a pena eu ir a esta bola solta, mesmo não sendo o chaser?

Três perguntas, por esta ordem (a mais barata primeiro):
    1. há bola solta e eu consigo mesmo chegar-lhe? (percepção)
    2. chego lá depressa? (janelaIntercetar)
    3. chego antes de quem já vai lá? (chaser e destinatário do passe)

A terceira é o que impede a equipa toda de largar a posição e correr atrás da
mesma bola: só reage quem tem vantagem real sobre quem já está encarregue dela.
*/
function podeIntercetar(ctx) {
    const p = ctx.p;
    const bb = ctx.bb;

    /*
    A escolha é do nível 1 (pickIntercetor, team_bt.js): um intercetor por
    equipa e por frame, com todas as condições — bola solta, jogo a correr,
    janela da percepção, não ser chaser/destinatário/marcador, e bater quem
    já vai à bola.

    Era decidido aqui, jogador a jogador, com uma reivindicação no
    blackboard que só travava quem corresse DEPOIS e fosse pior — e por isso
    dois jogadores da mesma equipa ficavam em INTERCEPT ao mesmo tempo.
    */
    if (!bb || bb.intercetor !== p) return false;

    const bola = p.blackboard && p.blackboard.ball;
    if (!bola || !bola.interceptionPoint) return false;

    ctx.pontoIntercepcao = bola.interceptionPoint;
    return true;
}

/*
Corre para onde a bola VAI ESTAR, não para onde ela está.

É esta a diferença entre interceptar e perseguir: o actChaseBall aponta para
`Match.ball.position` (e por isso corre sempre atrás dela), enquanto aqui o
alvo é o `interceptionPoint` que a percepção já calculou — o primeiro ponto da
trajectória a que este jogador consegue chegar a tempo.
*/
function actIntercept(ctx) {
    const p = ctx.p;
    const ponto = ctx.pontoIntercepcao || Match.ball.position;
    p.speedMult = (5.8 + ((ctx.skillSpeed - 50) / 50) * 1.5) * 1.25 * 0.9;
    if (Match.counterAttackTeam === p.team) p.speedMult *= 1.25;
    p.dynamicTarget.set(ponto.x, ALTURA_BASE_Y, ponto.z);
    p.fsm.changeState('INTERCEPT');
}

/*
Receber o passe.

Corria para `Match.ball.position` — a posição ACTUAL da bola. Num passe pelo
alto isso é um ponto a 3-4 m de altura que se desloca a cada frame: o
receptor perseguia-a, passava-lhe por baixo e ficava atrás dela. Se vinha de
frente, então, cruzavam-se a meio caminho.

Agora vai para onde ela vai CAIR (preverQuedaDaBola) e espera lá. O
steerArrive trava sozinho ao chegar, por isso "parar e esperar" não precisa
de estado próprio — precisa é de um alvo que não fuja.

Bola rasteira mantém o comportamento antigo: aí a posição actual é o alvo
certo, e ir para onde ela pára seria deixá-la morrer sozinha.
*/
function actReceivePass(ctx) {
    const p = ctx.p;
    p.speedMult = 5.8 * 1.25 * 0.9;

    const bola = Match.ball.position;
    const noAr = bola.y > BallPhysics.raio + 0.35 && Match.ballVel.lengthSq() > 1.0;

    if (!noAr && Match.lastTouchedPlayer === p && Match.intendedReceiver === p) {
        // Toque próprio em condução: segue directamente para a bola em velocidade de corrida sem hesitar
        p.dynamicTarget.copy(bola);
        p.speedMult = (6.0 + ((ctx.skillSpeed - 50) / 50) * 1.2);
        p.fsm.changeState('CARRY');
        return;
    }

    if (noAr) {
        /*
        Bola que ainda vem alta: o ponto de encontro é onde ela DESCE pela
        altura da testa, não onde aterra. Ir para o ponto de queda deixava-o
        parado à espera que ela lhe caísse aos pés — e o salto de cabeceio
        (SaltoCabeceio) disparava no último instante, com a bola já quase no
        chão. Só vale a pena se lá chegar a tempo; senão, ponto de queda.
        */
        const cabeca = preverBolaEmAltura(ALTURA_BASE_Y + ALTURA_CABECA);
        if (cabeca) {
            const dCab = Math.hypot(p.model.position.x - cabeca.x, p.model.position.z - cabeca.z);
            if (dCab <= p.speedMult * cabeca.tempo * 0.95) {
                p.dynamicTarget.set(cabeca.x, ALTURA_BASE_Y, cabeca.z);
                p.fsm.changeState('MOVE_TO_POS');
                return;
            }
        }

        const queda = preverQuedaDaBola();
        p.dynamicTarget.set(queda.x, ALTURA_BASE_Y, queda.z);

        /*
        Já está no ponto de queda e a bola ainda vem no ar: fica quieto. Sem
        isto o steerArrive continua a corrigir centímetros e ele fica a
        oscilar por baixo da bola no momento em que ela chega.
        */
        const distQueda = Math.hypot(p.model.position.x - queda.x, p.model.position.z - queda.z);
        if (distQueda < 1.0) {
            p.velocity.set(0, 0, 0);
            p.fsm.changeState('IDLE');
            lookAtBola(p.model, bola);
            return;
        }
    } else {
        const bb = p.blackboard && p.blackboard.ball;
        if (bb && bb.interceptionPoint) {
            p.dynamicTarget.set(bb.interceptionPoint.x, ALTURA_BASE_Y, bb.interceptionPoint.z);
        } else if (typeof Match !== 'undefined' && Match.passTargetPos) {
            p.dynamicTarget.set(Match.passTargetPos.x, ALTURA_BASE_Y, Match.passTargetPos.z);
        } else {
            p.dynamicTarget.copy(bola);
        }
    }

    p.fsm.changeState('MOVE_TO_POS');
}

/*
Vaga de apoio: `p` é um dos SupportModel.maxPorLado mais perto da bola, de
entre os colegas que caem no MESMO lado (à frente da bola ou atrás dela)?

Contar estados já atribuídos não servia: o BT corre jogador a jogador dentro
do frame, por isso quem tickasse primeiro ficava com as vagas — a escolha
mudava com a ordem da lista em vez de com o jogo. O critério aqui não depende
de ordem nenhuma: cada jogador mede-se contra os colegas e chega sozinho à
mesma resposta.
*/
// Distância à bola para efeitos de disputa da vaga: quem já está a apoiar
// conta como estando `bonusOcupante` metros mais perto (ver SupportModel).
function distDisputaApoio(jogador, bola) {
    const d = jogador.model.position.distanceTo(bola);
    return jogador.apoioAtivo ? d - SupportModel.bonusOcupante : d;
}

function temVagaDeApoio(ctx, aFrenteDaBola) {
    const p = ctx.p;
    // O guarda-redes nunca participa nem ocupa vagas de apoio FWR/AFT
    if (p.role === 'gk') return false;
    // Guarda-redes com a bola nas mãos ou em posse: não há vagas de apoio FWR/AFT
    if (typeof Match !== 'undefined' && Match.gkHoldingBall && Match.gkHoldingBall[p.team]) return false;
    if (ctx.bb && ctx.bb.carrier && ctx.bb.carrier.role === 'gk') return false;
    // Quem vai buscar a bola (destinatário de um passe, ou do seu próprio
    // toque de condução) tem tarefa; apoiar é para os outros.
    if (Match.intendedReceiver === p) return false;
    /*
    Tecto a zero é o apoio DESLIGADO, e tem de ser verificado ANTES do ciclo.

    O corte vivia só lá dentro (`if (melhores >= maxPorLado) return false`),
    portanto só falava se houvesse pelo menos um companheiro a chegar ao fim
    do corpo do ciclo. Quem estivesse sozinho do seu lado da bola — todos os
    outros filtrados pelos `continue` — saía por baixo com `return true` e
    entrava em FWR/AFT_SUPPORT mesmo com o tecto a 0. Era o caso reportado:
    um jogador isolado à frente da bola rotulado FWR_SUPPORT com o apoio
    desligado no painel.
    */
    if (SupportModel.maxPorLado <= 0) return false;

    const bola = Match.ball.position;
    const minhaDist = distDisputaApoio(p, bola);
    let melhores = 0;

    for (const mate of ctx.teammates) {
        if (mate === p || mate.role === 'gk') continue;
        if (mate === Match.ballCarrier) continue;
        // Mesmo lado da bola que eu? (zoneAhead no referencial de ataque)
        if ((mate.model.position.z * mate.dirZ > ctx.bb.ballZ) !== aFrenteDaBola) continue;

        const d = distDisputaApoio(mate, bola);
        // Empate exacto desempata pelo id, para os dois lados do teste
        // concordarem sobre quem vem primeiro.
        if (d < minhaDist || (d === minhaDist && mate.id < p.id)) melhores++;
        if (melhores >= SupportModel.maxPorLado) return false;
    }
    return true;
}

/*
Põe o alvo do apoio em ângulos próximos a 45º para cada lado do deslocamento do carry,
onde houver espaço livre:
- FWR_SUPPORT: à frente do carry (+45º e -45º em relação ao vetor de deslocamento)
- AFT_SUPPORT: para trás do carry (+135º e -135º em relação ao vetor de deslocamento, i.e. 45º para trás de cada lado)
*/
function alvoDeApoio(p, aFrenteDaBola, ctx) {
    if (p.role === 'gk') return;
    const bola = (typeof Match !== 'undefined' && Match.ball && Match.ball.position) ? Match.ball.position : { x: 0, y: 0, z: 0 };
    const carrier = (typeof Match !== 'undefined' && Match.ballCarrier) ? Match.ballCarrier : null;
    const carryPos = (carrier && carrier.model && carrier.model.position) ? carrier.model.position : bola;

    // Vetor de deslocamento do portador (ou direção de ataque da equipa)
    let vx = 0;
    let vz = (p && p.dirZ) ? p.dirZ : 1;

    if (carrier && carrier.velocity && Math.hypot(carrier.velocity.x, carrier.velocity.z) > 0.35) {
        const velLen = Math.hypot(carrier.velocity.x, carrier.velocity.z);
        vx = carrier.velocity.x / velLen;
        vz = carrier.velocity.z / velLen;
    } else if (carrier && carrier.model && typeof carrier.model.rotation === 'object' && carrier.fsm && (carrier.fsm.currentState === 'CARRY' || carrier.fsm.currentState === 'DRIBBLE')) {
        const sinR = Math.sin(carrier.model.rotation.y || 0);
        const cosR = Math.cos(carrier.model.rotation.y || 0);
        if (Math.hypot(sinR, cosR) > 0.1) {
            vx = sinR;
            vz = cosR;
        }
    }

    const vNorm = Math.hypot(vx, vz);
    if (vNorm > 0.001) {
        vx /= vNorm;
        vz /= vNorm;
    } else {
        vx = 0;
        vz = (p && p.dirZ) ? p.dirZ : 1;
    }

    // Ângulo base do vetor de deslocamento
    const thetaDesl = Math.atan2(vx, vz);

    // Distância desejada (respeita a janela [raioMin, raioMax])
    const pTargetPos = p.dynamicTarget || (p.model ? p.model.position : carryPos);
    let dxSlot = pTargetPos.x - carryPos.x;
    let dzSlot = pTargetPos.z - carryPos.z;
    let dSlot = Math.hypot(dxSlot, dzSlot);
    const raio = Math.min(Math.max(dSlot, SupportModel.raioMin), SupportModel.raioMax);

    // Ângulo base: 45º (+PI/4 e -PI/4) para FWR; 135º (+3PI/4 e -3PI/4) para AFT
    const anguloBase = SupportModel.anguloApoio || (Math.PI / 4);
    const nominalEsquerda = aFrenteDaBola ? -anguloBase : -(Math.PI - anguloBase);
    const nominalDireita  = aFrenteDaBola ?  anguloBase :  (Math.PI - anguloBase);

    // Lado natural do jogador em relação à linha de deslocamento (produto vetorial 2D)
    const cross = dxSlot * vz - dzSlot * vx;
    const prefereDireita = cross > 0;

    // Colegas e adversários para avaliar espaço livre
    const teammates = (ctx && ctx.teammates) ? ctx.teammates : ((typeof Match !== 'undefined' && Match.players) ? ((p.team === 'TeamA') ? Match.players : Match.opponents) : []);
    const opponents = (ctx && ctx.opponents) ? ctx.opponents : ((typeof Match !== 'undefined' && Match.opponents) ? ((p.team === 'TeamA') ? Match.opponents : Match.players) : []);

    // Verifica se outro apoio ativo já ocupa a direita ou a esquerda
    let outroOcupouDireita = false;
    let outroOcupouEsquerda = false;
    for (const mate of teammates) {
        if (mate === p || mate.role === 'gk' || !mate.apoioAtivo) continue;
        const targetPos = mate.dynamicTarget || (mate.model ? mate.model.position : null);
        if (!targetPos) continue;
        const mateDx = targetPos.x - carryPos.x;
        const mateDz = targetPos.z - carryPos.z;
        const mateCross = mateDx * vz - mateDz * vx;
        if (mateCross > 0.5) outroOcupouDireita = true;
        else if (mateCross < -0.5) outroOcupouEsquerda = true;
    }

    // Variações de ângulo ao redor dos 45º nominais para buscar espaço livre
    const variacoes = [-0.22, -0.11, 0, 0.11, 0.22];
    const lados = [
        { lado: 'esquerda', nominal: nominalEsquerda, ocupado: outroOcupouEsquerda, natural: !prefereDireita },
        { lado: 'direita',  nominal: nominalDireita,  ocupado: outroOcupouDireita,  natural: prefereDireita }
    ];

    let melhorPonto = null;
    let melhorScore = -Infinity;

    for (const l of lados) {
        for (const v of variacoes) {
            const ang = thetaDesl + l.nominal + v;
            const cx = carryPos.x + Math.sin(ang) * raio;
            const cz = carryPos.z + Math.cos(ang) * raio;

            let score = 100;

            // 1. Limites do campo (largura 68m, comprimento 106m)
            if (Math.abs(cx) > 33.0 || Math.abs(cz) > 52.0) {
                score -= 1000;
            } else if (Math.abs(cx) > 30.0) {
                score -= (Math.abs(cx) - 30.0) * 20;
            }

            // 2. Espaço livre de adversários (evitar marcação próxima e linhas tapadas)
            for (const opp of opponents) {
                if (opp.role === 'gk' || !opp.model) continue;
                const oppPos = opp.model.position;
                const distOpp = Math.hypot(cx - oppPos.x, cz - oppPos.z);
                if (distOpp < 2.2) {
                    score -= (2.2 - distOpp) * 40;
                } else if (distOpp > 4.5) {
                    score += 5;
                }

                // Verifica se o adversário está a bloquear a linha de passe do carry
                const segDx = cx - carryPos.x;
                const segDz = cz - carryPos.z;
                const segLenSq = segDx * segDx + segDz * segDz;
                if (segLenSq > 0.01) {
                    const t = Math.max(0, Math.min(1, ((oppPos.x - carryPos.x) * segDx + (oppPos.z - carryPos.z) * segDz) / segLenSq));
                    const projX = carryPos.x + t * segDx;
                    const projZ = carryPos.z + t * segDz;
                    const distLinha = Math.hypot(oppPos.x - projX, oppPos.z - projZ);
                    if (distLinha < 1.3) {
                        score -= (1.3 - distLinha) * 35;
                    }
                }
            }

            // 3. Distribuição entre colegas de equipa (evitar embolar apoios)
            for (const mate of teammates) {
                if (mate === p || mate.role === 'gk' || !mate.apoioAtivo) continue;
                const targetPos = mate.dynamicTarget || (mate.model ? mate.model.position : null);
                if (!targetPos) continue;
                const distMate = Math.hypot(cx - targetPos.x, cz - targetPos.z);
                if (distMate < 3.5) {
                    score -= (3.5 - distMate) * 30;
                }
            }

            // 4. Preferência pelo lado natural e lado livre
            if (l.natural) score += 20;
            if (!l.ocupado) score += 25;

            // 5. Preferência pelo ângulo nominal exato de 45º
            score -= Math.abs(v) * 15;

            if (score > melhorScore) {
                melhorScore = score;
                melhorPonto = { x: cx, z: cz };
            }
        }
    }

    if (melhorPonto) {
        p.dynamicTarget.set(melhorPonto.x, ALTURA_BASE_Y, melhorPonto.z);
    } else {
        const angFallback = thetaDesl + (prefereDireita ? nominalDireita : nominalEsquerda);
        p.dynamicTarget.set(carryPos.x + Math.sin(angFallback) * raio, ALTURA_BASE_Y, carryPos.z + Math.cos(angFallback) * raio);
    }
}

// Ocupa a posição que o nível 2 lhe deu.
/*
APOIO DE CIRCULACAO — ir para o ponto onde sou opcao de passe.

O ponto ja vem escolhido pelo nivel de equipa (atribuirApoiosDaEquipa, em
team_bt.js): aqui e so execucao. Estado proprio na FSM para se ver no debug
quem esta a oferecer-se e quem esta so a ocupar a posicao.
*/
function podeApoiarCirculacao(ctx) {
    const p = ctx.p;
    if (!p.apoioPonto) return false;
    if (p.role === 'gk') return false;
    if (p === Match.ballCarrier) return false;
    return true;
}

function actApoioCirculacao(ctx) {
    const p = ctx.p;
    p.dynamicTarget.set(p.apoioPonto.x, ALTURA_BASE_Y, p.apoioPonto.z);
    // Ritmo de quem se desmarca: mais do que posicionar-se, menos do que
    // atacar o espaco (ver actRunIntoSpace).
    p.speedMult = (6.2 + ((ctx.skillSpeed - 50) / 50) * 1.3) * 1.25 * 0.9;
    p.apoioAtivo = false;
    p.fsm.changeState('SUPPORT_PASS');
}

/*
CORRIDA AO ESPACO — arrancar para um espaco livre a frente, sem bola.

Quem ja esta a correr continua (o `runTimer` e a corrida em curso; quem a
termina e a FSM, ver o case RUN_INTO_SPACE). Quem nao esta tem de cumprir
tudo isto para arrancar:

  - a equipa tem a bola, e nao sou eu que a tenho
  - sou medio ou avancado (um central a arrancar para o espaco deixa a linha
    a descoberto; isso e outra conversa, com outro nome)
  - estou entre distMin e distMax do portador
  - o arrefecimento passou (senao arranca e para no lugar, em ciclo)
  - ha mesmo espaco livre a frente

Ver RunIntoSpaceModel em config.js.
*/
function podeCorrerNoEspaco(ctx) {
    const p = ctx.p;
    if (typeof RunIntoSpaceModel === 'undefined') return false;
    if ((p.runTimer || 0) > 0) return true;          // ja vai a caminho

    if (p.role === 'gk' || p.role === 'def') return false;
    if ((p.runCooldown || 0) > 0) return false;

    const bb = ctx.bb;
    if (!bb || !bb.isAttacking) return false;

    const portador = Match.ballCarrier;
    if (!portador || portador === p || portador.team !== p.team) return false;

    const R = RunIntoSpaceModel;
    const dist = p.model.position.distanceTo(portador.model.position);
    if (dist < R.distMin || dist > R.distMax) return false;

    return escolherDestinoDeCorrida(p, bb) !== null;
}

/*
Onde ir. O SpatialGrid da a celula mais vazia num raio a frente do jogador; o
destinoDeCorrida (utils.js) decide se ela serve e corta-a a medida (a frente,
dentro do campo, aquem do fora-de-jogo, com comprimento de corrida).

Devolve { x, z } ou null. Nao muda nada no jogador — e chamado tambem pela
condicao, que nao pode ter efeitos.
*/
function escolherDestinoDeCorrida(p, bb) {
    const R = RunIntoSpaceModel;
    const portador = Match.ballCarrier;
    if (!portador) return null;

    const pos = p.model.position;
    const cp = portador.model.position;
    const adversarios = ((p.team === 'TeamA') ? Match.opponents : Match.players)
        .filter(o => o.role !== 'gk')
        .map(o => ({ x: o.model.position.x, z: o.model.position.z }));

    /*
    A PRIMEIRA VERSAO PROCURAVA ESPACO LIVRE E MAIS NADA (SpatialGrid.
    findFreeSpace a frente do jogador). Media, 10 sementes: os companheiros a
    10-22 m do portador subiam de 4.4 para 4.3 e os que tinham LINHA LIVRE
    ficavam nos 1.6-1.7 — ou seja, zero. Correr para um espaco onde ninguem
    consegue servir a bola nao abre opcao de passe nenhuma; abre so um buraco
    na formacao.

    Agora o destino tem de cumprir as duas coisas ao mesmo tempo:

        estar livre        sem adversario a menos de `margemDestino`
        ser servivel       a linha PORTADOR -> destino aberta, e a uma
                           distancia de passe (10 a 22 m dele)

    A procura e um leque a frente do jogador, no sentido de ataque: tres
    distancias por cinco angulos. Chega para 15 hipoteses por jogador, num
    tick que ja e de 15 Hz.
    */
    let melhor = null, melhorNota = -Infinity;

    for (const alcance of [8.0, 13.0, 18.0]) {
        for (const graus of [-50, -25, 0, 25, 50]) {
            const rad = graus * Math.PI / 180;
            // Frente do jogador = sentido de ataque dele.
            const dx = Math.sin(rad) * alcance;
            const dz = Math.cos(rad) * alcance * p.dirZ;

            const cand = destinoDeCorrida({
                px: pos.x,
                pz: pos.z,
                dirZ: p.dirZ,
                candidatoX: pos.x + dx,
                candidatoZ: pos.z + dz,
                offsideLimitDir: (typeof bb.offsideLimitDir === 'number') ? bb.offsideLimitDir : null,
                maxCorrida: R.maxCorrida
            });
            if (!cand) continue;

            // Distancia de passe a partir de quem tem a bola.
            const distPasse = Math.hypot(cand.x - cp.x, cand.z - cp.z);
            if (distPasse < R.passeMin || distPasse > R.passeMax) continue;

            // O destino esta mesmo livre?
            let maisPerto = Infinity;
            for (const o of adversarios) {
                const d = Math.hypot(o.x - cand.x, o.z - cand.z);
                if (d < maisPerto) maisPerto = d;
            }
            if (maisPerto < R.margemDestino) continue;

            // E da para lhe chegar a bola?
            if (!linhaLivre(cp.x, cp.z, cand.x, cand.z, adversarios, R.margemLinha)) continue;

            // Entre os que servem, o que ganha mais campo e tem mais folga.
            const ganho = (cand.z - pos.z) * p.dirZ;
            const nota = ganho + Math.min(maisPerto, 8.0);
            if (nota > melhorNota) { melhorNota = nota; melhor = cand; }
        }
    }

    return melhor;
}

function actRunIntoSpace(ctx) {
    const p = ctx.p;
    const R = RunIntoSpaceModel;

    // Corrida nova: fixa destino, prazo e quem tinha a bola ao arrancar.
    if (!((p.runTimer || 0) > 0)) {
        const destino = escolherDestinoDeCorrida(p, ctx.bb);
        if (!destino) { actHoldPosition(ctx); return; }
        p.runTarget = { x: destino.x, z: destino.z };
        p.runTimer = R.duracao;
        p.runCarrier = Match.ballCarrier;
    }

    /*
    REVALIDAÇÃO POR FRAME contra a linha de fora-de-jogo.

    A corrida é fixada `R.duracao` segundos (4 s) e só o instante do arranque
    passava pelo corte da linha (destinoDeCorrida). Nesses 4 s a última linha
    adversária sobe, ou a bola avança, e o jogador continuava a correr para um
    ponto entretanto ilegal — era o caso reportado dos dummy runners a passar
    a linha.

    Se o corte deixar o destino atrás do próprio jogador, a corrida deixou de
    fazer sentido: aborta e volta a posicionar-se.
    */
    const limite = (ctx.bb && typeof ctx.bb.offsideLimitDir === 'number') ? ctx.bb.offsideLimitDir : null;
    const avancoAlvo = avancoLegalDeCorrida(p.runTarget.z * p.dirZ, limite);
    p.runTarget.z = avancoAlvo * p.dirZ;

    if (avancoAlvo <= p.model.position.z * p.dirZ) {
        p.runTimer = 0;
        actHoldPosition(ctx);
        return;
    }

    p.dynamicTarget.set(p.runTarget.x, ALTURA_BASE_Y, p.runTarget.z);
    // Sprint: quem ataca o espaco vai a fundo, senao chega depois da bola.
    p.speedMult = (7.0 + ((ctx.skillSpeed - 50) / 50) * 1.5) * 1.25 * 0.9;
    p.apoioAtivo = false;
    p.fsm.changeState('RUN_INTO_SPACE');
}

function actHoldPosition(ctx) {
    const p = ctx.p;
    if (p.role === 'gk') {
        p.apoioAtivo = false;
        actGoalkeeperPosition(ctx);
        return;
    }
    const dist = p.model.position.distanceTo(p.dynamicTarget);

    // Longe da posição (a recuperar/marcar): velocidade máxima até uns 2m
    // do alvo. Dentro disso (já posicionado, só a ajustar): ritmo moderado
    // — o steerArrive já trava sozinho perto do alvo, isto é só sobre a
    // velocidade de cruzeiro. +25% pedido: velocidade máxima SEM bola.
    if (dist > 2.0) {
        p.speedMult = (6.6 + ((ctx.skillSpeed - 50) / 50) * 1.4) * 1.25 * 0.9;
    } else {
        p.speedMult = (4.2 + ((ctx.skillSpeed - 50) / 50) * 1.2) * 1.25 * 0.9;
    }
    if (Match.counterAttackTeam === p.team) p.speedMult *= 1.25;

    /*
    O nível 2 (defendZonal/marcar em position_bt.js) já decidiu O ALVO
    (p.dynamicTarget) — aqui só se rotula o que está a acontecer, pra não
    ficar tudo escondido atrás de "MOVE_TO_POS":
        marcando um adversário específico  -> MARKING
        sem par E perto da bola, a fechar a linha -> BLOCKING (p.isCovering)
        equipa tem a bola, à frente dela    -> FWR_SUPPORT
        equipa tem a bola, atrás dela       -> AFT_SUPPORT
        resto (posição genérica, fora de fase de bola) -> MOVE_TO_POS
    */
    const aFrenteDaBola = ctx.zoneAhead > ctx.bb?.ballZ;
    if (ctx.bb && ctx.bb.isAttacking && temVagaDeApoio(ctx, aFrenteDaBola)) {
        // O apoio posiciona-se a 45º do deslocamento do carry onde houver espaço livre
        alvoDeApoio(p, aFrenteDaBola, ctx);
        p.apoioAtivo = true;
        // zoneAhead/ballZ já no referencial de ataque — comparação directa.
        p.fsm.changeState(aFrenteDaBola ? 'FWR_SUPPORT' : 'AFT_SUPPORT');
    } else if (p.markingTarget) {
        p.apoioAtivo = false;
        p.fsm.changeState('MARKING');
    } else if (ctx.bb && ctx.bb.blocker === p) {
        p.apoioAtivo = false;
        
        // Calcular o alvo do blocker (projeção perpendicular na linha bola-gol)
        const goalPos = new THREE.Vector3(0, 0, ctx.bb.ownGoalZ);
        const ballPos = Match.ball.position;
        const ballToGoal = new THREE.Vector3().subVectors(goalPos, ballPos);
        ballToGoal.y = 0;
        const dirBallToGoal = ballToGoal.normalize();
        
        const ballToPlayer = new THREE.Vector3().subVectors(p.model.position, ballPos);
        ballToPlayer.y = 0;
        
        const projLen = ballToPlayer.dot(dirBallToGoal);
        const projPos = new THREE.Vector3().copy(ballPos).add(dirBallToGoal.multiplyScalar(projLen));
        
        p.dynamicTarget.copy(projPos);
        p.fsm.changeState('BLOCKING');
    } else if (p.isCovering) {
        p.apoioAtivo = false;
        p.fsm.changeState('BLOCKING');
    } else {
        p.apoioAtivo = false;
        p.fsm.changeState('MOVE_TO_POS');
    }
}

function actGoalkeeperPosition(ctx) {
    const p = ctx.p;
    p.apoioAtivo = false;
    p.speedMult = (4.2 + ((ctx.skillSpeed - 50) / 50) * 1.2) * 1.25 * 0.9;
    /*
    Delega em gkAnchor() (config.js), a mesma função que updateGK() usa. Esta
    folha nunca corre — update() manda os guarda-redes para updateGK e nunca
    para runBehaviorTree — mas continua referenciada pela árvore, por isso fica
    ligada à fórmula real em vez de guardar uma cópia que pode divergir.
    */
    const style = GoalkeeperStyle[p.gkStyle] || GoalkeeperStyle.defensive;
    const alvo = gkAnchor(Match.ball.position.x, Match.ball.position.z,
        p.ownGoalZ, p.dirZ, style);
    p.dynamicTarget.set(alvo.x, ALTURA_BASE_Y, alvo.z);
    p.fsm.changeState('MOVE_TO_POS');
}

/* =========================================================================
   A ÁRVORE
   ========================================================================= */

// carryTouchGrace cobre a janela entre o toque à frente na condução e o
// jogador retomar o toque — sem isto, o instante em que hasBall fica false
// (touchLock, para ninguém tocar de novo cedo demais) já bastava para o BT
// achar que ele "perdeu a bola" e mandá-lo para SemBola/MOVE_TO_POS,
// abandonando a bola que ele mesmo tinha acabado de tocar à frente.
const temBola = (ctx) => ctx.p.hasBall || ctx.p.carryTouchGrace > 0;
const ehGK = (ctx) => ctx.p.role === 'gk';

// Zona/ângulo de finalizar — usado por Rematar E por Dominar (para não fazer
// o jogador "pensar" 3s com o guarda-redes já batido à sua frente).
function emZonaDeRemate(ctx) {
    if (ctx.zoneAhead <= 15) return false;
    const p = ctx.p;
    _v1.set(0, 0, p.targetGoalZ);
    const dist = p.model.position.distanceTo(_v1);
    if (!(dist < p.shootingRange() && Math.abs(p.model.position.x) < ShootingModel.maxOffsetX)) return false;

    // Grid espacial (camada CHUTE): fora das zonas autoradas (valor 0) não remata.
    if (typeof SpatialGrid !== 'undefined' && SpatialGrid.cells) {
        const chuteVal = SpatialGrid.layerValueAt('chute', p.model.position.x, p.model.position.z, p.team);
        if (chuteVal <= 0) return false;
    }
    return true;
}

/* =========================================================================
   COMPORTAMENTOS QUE NÃO SÃO DECISÃO

   Bola parada, o guarda-redes com a bola na mão, ser o destinatário de um
   passe: são regras de jogo, não escolhas. Vivem aqui, fora das folhas da
   árvore, para não ficarem espalhados por vários ramos e divergirem.

   Regra para quem mexer nisto: um comportamento que não dependa de
   prioridade vive AQUI, não dentro da árvore.
   ========================================================================= */

/*
Bola parada: ninguém decide nada, esperam pelo lance.

GOAL_KICK deixa MOVE_TO_POS sobreviver: quem bate posiciona-se "como no chute
do goleiro", um pouco mais adiantado (ver setupSetPiece), e chamar changeState
aqui apagaria o dynamicTarget calculado no setup. Chegando ao alvo, match.js
muda para SET_PIECE_WAIT.
*/
function tratarBolaParada(p) {
    const fsm = p.fsm;
    const s = fsm.currentState;

    if (Match.state === 'CORNER_KICK') {
        if (s !== 'SET_PIECE_TAKER' && s !== 'SET_PIECE_WAIT') {
            fsm.changeState('SET_PIECE_WAIT');
        }
    } else if (Match.state === 'GOAL_KICK') {
        if (s !== 'SET_PIECE_TAKER' && s !== 'SET_PIECE_WAIT' && s !== 'MOVE_TO_POS') {
            fsm.changeState('SET_PIECE_WAIT');
        }
    } else if (Match.state === 'GOAL') {
        if (s !== 'MOVE_TO_POS') {
            fsm.changeState('IDLE');
        }
    } else {
        fsm.changeState('IDLE');
    }
}

/*
Guarda-redes: sair a jogar pelos laterais (80%) ou chutão (20%), e sem a bola
volta a posicionar-se. Ver GoalkeeperDistribution.
*/
function tratarGuardaRedes(ctx) {
    const p = ctx.p;
    if (!(p.hasBall || p.carryTouchGrace > 0)) {
        limparSaidaGK(p);
        actGoalkeeperPosition(ctx);
        return;
    }

    const saida = decidirSaidaGK(p);
    const lateral = (saida === 'laterais') ? acharLateralParaSaida(ctx) : null;

    if (lateral) actPassParaAlvo(ctx, lateral);
    else if (p.decisionTimer > (saida === 'chuteFrente' ? 0.6 : 1.2)) p.puntBall();
    else actCarry(ctx);
}

// A bola vem para mim (passe, ou o meu próprio toque de condução): vou buscá-la.
function souODestinatario(p) {
    return Match.intendedReceiver === p;
}

/*
Estou incumbido de MARCAR alguém (e não sou o perseguidor da equipa)?

Quem marca acompanha o homem e mais nada: não larga a marca para ir à bola,
não sai a interceptar um passe do outro lado, não se atira ao portador que
não é o seu. A bola é tarefa do perseguidor designado (bb.chaser, um por
equipa) — os outros seguram a estrutura.

Sem isto, o marcador continuava elegível para intercepções e desarmes, e
bastava a bola passar-lhe perto para ele abandonar o homem. Onze jogadores
com essa liberdade dão o jogo em bloco atrás da bola.
*/
function estouAMarcar(p) {
    if (!p.markingTarget) return false;
    return Match.chaserA !== p && Match.chaserB !== p;
}

/*
Quantos adversários fecham o caminho em frente do portador.

Conta só os que estão no corredor de progressão dele (à frente, dentro de
PassModel.bloqueioLargura para cada lado, até bloqueioDist). Um adversário
ao lado ou atrás não fecha caminho.
*/
function adversariosAFrente(ctx) {
    const p = ctx.p;
    const M = PassModel;
    const px = p.model.position.x, pz = p.model.position.z;
    let n = 0;

    for (const opp of ctx.opponents) {
        if (opp.role === 'gk') continue;
        const dz = (opp.model.position.z - pz) * p.dirZ;
        if (dz <= 0 || dz > M.bloqueioDist) continue;
        if (Math.abs(opp.model.position.x - px) > M.bloqueioLargura) continue;
        n++;
    }
    return n;
}

// Caminho fechado: vale mais sair pelo lado ou por trás do que insistir.
function caminhoFechadoAFrente(ctx) {
    return adversariosAFrente(ctx) >= PassModel.bloqueioMin;
}

const PlayerBT = sel('PlayerRoot',

    /* --- Bola parada ---------------------------------------------------- */
    seq('BolaParada',
        cond('jogoParado', () => Match.state !== 'PLAY'),
        act('esperarLance', (ctx) => tratarBolaParada(ctx.p))
    ),

    /* --- Acção em curso: não voltar a decidir ---------------------------- */
    seq('AccaoEmCurso',
        cond('estadoBloqueante', (ctx) => {
            const s = ctx.p.fsm.currentState;
            return s === 'PASS' || s === 'SHOOT' || s === 'TACKLE' || s === 'SLIDE_TACKLE' ||
                s === 'CHEST_CONTROL';
        }),
        act('deixarTerminar', () => { })
    ),

    /* --- Com bola -------------------------------------------------------- */
    seq('ComBola',
        cond('tenhoABola', temBola),

        sel('DecisaoComBola',
            seq('RecuperarControlo',
                cond('bolaFugiu', (ctx) => !ctx.p.hasBall),
                act('correrParaBola', actCarry)
            ),
            cond('CalculaDebug', (ctx) => {
                if (window.showPlayerPoints) {
                    ctx.p.debugPoints = ctx.p.debugPoints || {};
                    ctx.p.debugPoints['Shot'] = emZonaDeRemate(ctx) ? 'SIM' : 'NAO';
                    ctx.p.debugPoints['Carry'] = ctx.campoAberto ? 'SIM' : 'NAO';
                    let cr = findCross(ctx);
                    if (cr) ctx.p.debugPoints['Cross'] = Math.round(cr.chance);
                    let tb = findThroughBall(ctx);
                    if (tb && tb.mate && tb.mate.debugPoints) ctx.p.debugPoints['Lanç'] = tb.mate.debugPoints['Lanç'];
                    let pass = ctx.p.findPassTarget();
                    if (pass && pass.debugPoints) ctx.p.debugPoints['Pass'] = pass.debugPoints['Pass'];
                }
                return false;
            }),
            /*
            Domina antes de decidir. Cadência real: ~3s a avaliar as opções
            (CadenceModel.posseBase), bem menos sob pressão pesada — aí é
            toque de primeira, decisão quase imediata. Skill acelera um
            pouco (jogador melhor lê o jogo mais depressa). Durante a espera
            protege a bola (actHoldBall) — não fica estático, mas não se
            atira a correr para a frente enquanto "não decidiu".
            */
            seq('Dominar',
                cond('aindaADominar', (ctx) => {
                    // Cara a cara com o guarda-redes: não "pensa", remata. Sem
                    // isto o jogador entrava na área de frente pro gol e ainda
                    // esperava a janela de cadência inteira antes de chutar.
                    if (emZonaDeRemate(ctx)) return false;
                    let settling = ctx.underPressure ? CadenceModel.posseSobPressao : CadenceModel.posseBase;
                    settling *= 1.0 - (ctx.skillTec / 100) * 0.25;
                    // Cadência do estilo: Target Man aguenta a bola (1.6),
                    // Fox in the Box resolve num toque (0.6).
                    settling *= estiloAtivoDe(ctx.p).cadencia;
                    if (ctx.p.decisionTimer < settling) return true;
                    ctx.p.decisionTimer = settling;
                    return false;
                }),
                act('proteger', actCarry)
            ),

            /*
            Guarda-redes: 80% sai a jogar pelos LATERAIS, 20% chuta para a
            frente (GoalkeeperDistribution). O sorteio é por posse, não por
            frame.

            Antes procurava qualquer 'def' ou 'mid' e só chutava quando não
            achava ninguém — na prática saía quase sempre a jogar curto, e
            muitas vezes para um central no meio da área.
            */
            // Guarda-redes: comportamento partilhado (ver tratarGuardaRedes).
            seq('GuardaRedesJoga',
                cond('souGR', ehGK),
                act('sairAJogar', tratarGuardaRedes)
            ),

            // 1. Verificar chute - chutar
            seq('Rematar',
                cond('emZonaDeRemate', emZonaDeRemate),
                act('rematar', actShoot)
            ),

            // 2. Verificar cruzamento se tiver nas laterais das áreas - cruzar
            seq('Cruzar',
                cond('valeCruzar', (ctx) => {
                    ctx.cross = findCross(ctx);
                    if (!ctx.cross) return false;
                    const mult = estiloAtivoDe(ctx.p).cruzar;
                    return Math.random() < Math.min(CrossModel.chanceMax, ctx.cross.chance * mult);
                }),
                act('cruzar', actCross)
            ),

            // 3. Verificar se tem espaço livre à frente - carry (conduzir)
            seq('ConduzirEmEspaco',
                cond('campoAberto', (ctx) => ctx.p.role !== 'gk' && ctx.campoAberto),
                act('atacarOEspaco', actCarry)
            ),

            /*
            3b. Caminho fechado: dois ou mais adversários no corredor à
            frente. Sai pelo lado; não havendo lado, joga para trás. Vem
            ANTES do drible e do passe para a frente de propósito — com dois
            homens pela frente, insistir na frente é perder a bola.
            */
            seq('CaminhoFechado',
                cond('doisPelaFrente', (ctx) => {
                    if (!caminhoFechadoAFrente(ctx)) return false;
                    const saida = findPassSide(ctx) || findPassBack(ctx);
                    if (!saida) return false;
                    ctx.passTarget = saida.target;
                    return true;
                }),
                act('passarLadoOuTras', actPass)
            ),

            // 4. Adversário próximo, espaço atrás do adversário, técnica >= 75 - Driblar
            seq('Driblar',
                cond('podeDriblar', podeDriblar),
                act('driblar', actDribble)
            ),

            // 5. Escolha de passe baseada na avaliação geral
            seq('ProcurarPasse',
                cond('haOpcaoDePasse', (ctx) => {
                    const passChoice = findBestPassAnywhere(ctx);
                    if (!passChoice) return false;
                    ctx.currentPassChoice = passChoice;
                    return true;
                }),
                act('executarPasse', (ctx) => {
                    if (ctx.currentPassChoice.type === 'through') {
                        ctx.throughBall = ctx.currentPassChoice.data;
                        actThroughBall(ctx);
                    } else {
                        ctx.passTarget = ctx.currentPassChoice.target;
                        actPass(ctx);
                    }
                })
            ),

            // 6. Não tem passe viável e está sob pressão - chute para a lateral
            seq('ChuteLateral',
                cond('semOpcoesSeguras', (ctx) => {
                    return ctx.underPressure || ctx.p.decisionTimer > 1.2;
                }),
                act('chutarParaLateral', actClearance)
            ),

            act('conduzir', actCarry)
        )
    ),

    /* --- Sem bola -------------------------------------------------------- */
    seq('SemBola',
        sel('DecisaoSemBola',
            /*
            O DESARME E O CARRINHO SAIRAM DAQUI.

            Tirar a bola ao adversario e defesa, e a defesa passou toda para o
            nivel 2 (ver TacklingAI em position_bt.js), junto com a marcacao.
            O nivel 3 fica com o que faz com a bola.

            De momento o tackling esta DESLIGADO por inteiro
            (TacklingModel.ativo = false): queremos ver a marcacao a funcionar
            sozinha primeiro. As accoes actTackle/actSlideTackle continuam aqui
            porque sao execucao, nao decisao - e o nivel 2 que as dispara.
            */

            /*
            Intercetar: a bola vem na minha direcção e eu chego-lhe primeiro.

            Vem ANTES do IrABola de propósito. O chaser é UM por equipa,
            escolhido pelo nível 1 — quem não fosse chaser nem destinatário do
            passe não tinha nenhuma folha que reagisse a uma bola a passar-lhe
            ao lado, e ficava parado a vê-la passar. Os dados já existiam na
            percepção (interceptable/timeToIntercept/interceptionPoint); não
            havia era ninguém a lê-los.

            Não é "toda a gente corre para a bola": só entra quem lá chega
            dentro de PerceptionModel.janelaIntercetar E com vantagem sobre
            quem já vai lá (ver melhorQueOsOutros).
            */
            seq('Intercetar',
                cond('bolaPassaPorMim', podeIntercetar),
                act('intercetar', actIntercept)
            ),

            // Ir à bola: sou o perseguidor designado pela equipa.
            seq('IrABola',
                cond('souEuAIr', (ctx) =>
                    ctx.distToBall < 12 &&
                    (Match.chaserA === ctx.p || Match.chaserB === ctx.p)),
                act('perseguir', actChaseBall)
            ),

            // Sou o destinatário do passe.
            seq('Receber',
                cond('vemParaMim', (ctx) => souODestinatario(ctx.p)),
                act('receber', actReceivePass)
            ),

            seq('GuardaRedes',
                cond('souGR', ehGK),
                act('posicionarGR', actGoalkeeperPosition)
            ),

            /*
            Ataque à área: colega na ala em posição de cruzar (mesmos limiares
            do findCross/CrossModel) e eu sou atacante/médio sem bola — em vez
            do slot genérico do PositionBT, ataco a área a sério (perto/longe
            do 1º poste, alternando por id). Sem isto o findCross nunca tinha
            ninguém lá dentro pra mirar (exige alvo já na área ANTES do
            cruzamento sair) — os cruzamentos morriam sempre por falta de
            gente a atacar a bola.
            */
            /*
            Corrida ao espaco. Vem ANTES do AtacarArea e do ocuparPosicao: os
            dois levam o jogador para uma posicao, e uma corrida ao espaco e
            justamente o contrario de ocupar a posicao dele.

            Depois do Receber, que tem prioridade: quem vai receber a bola nao
            arranca para outro sitio.
            */
            seq('EsperarNaArea',
                cond('foiCanto', (ctx) => {
                    const p = ctx.p;
                    if (!p.setPieceTarget) return false;
                    // Se a bola saiu da zona de perigo (z < 25), cancela
                    if (Math.abs(Match.ball.position.z) < 25) {
                        p.setPieceTarget = null;
                        return false;
                    }
                    // Se alguém dominar a bola e não for um toque imediato no ar
                    if (Match.ballCarrier) {
                        p.setPieceTarget = null;
                        return false;
                    }
                    return true;
                }),
                act('manterPosicao', (ctx) => {
                    const p = ctx.p;
                    p.dynamicTarget.copy(p.setPieceTarget);
                    p.speedMult = 4.0;
                    p.fsm.changeState('MOVE_TO_POS');
                })
            ),

            /*
            Apoio de circulacao antes da corrida ao espaco: oferecer-se a
            distancia de passe serve a jogada seguinte; atacar o espaco serve
            a jogada depois dessa. Sem opcao de passe agora, nao ha jogada
            depois dessa.
            */
            seq('ApoioDeCirculacao',
                cond('fuiChamadoAApoiar', podeApoiarCirculacao),
                act('apoiarCirculacao', actApoioCirculacao)
            ),

            seq('CorrerNoEspaco',
                cond('haEspacoAFrente', podeCorrerNoEspaco),
                act('correrNoEspaco', actRunIntoSpace)
            ),

            seq('AtacarArea',
                cond('colegaVaiCruzar', (ctx) => {
                    const p = ctx.p;
                    if (p.role === 'def' || p.role === 'gk') return false;
                    const c = Match.ballCarrier;
                    if (!c || c.team !== p.team || c === p) return false;
                    const carrierX = Math.abs(c.model.position.x);
                    const carrierZ = c.model.position.z * c.dirZ;
                    return carrierX >= CrossModel.alaX && carrierZ >= CrossModel.zonaZ;
                }),
                act('atacarArea', (ctx) => {
                    const p = ctx.p;
                    const c = Match.ballCarrier;
                    const side = Math.sign(c.model.position.x) || 1;
                    // Metade dos candidatos ataca o 1º poste (lado do cruzamento),
                    // a outra o 2º poste — leque simples, sem coordenação fina.
                    const targetX = (p.id % 2 === 0) ? -side * 5.0 : side * 9.0;
                    const targetZ = (CrossModel.areaZ + 6.0) * p.dirZ;
                    p.dynamicTarget.set(targetX, ALTURA_BASE_Y, targetZ);
                    p.speedMult = (5.5 + ((ctx.skillSpeed - 50) / 50) * 1.2) * 1.25 * 0.9;
                    p.fsm.changeState('MOVE_TO_POS');
                })
            ),

            act('ocuparPosicao', actHoldPosition)
        )
    )
);

/* =========================================================================
   SISTEMA DE BTs POR POSIÇÃO E PLAYING STYLE
   ========================================================================= */

const PositionBTs = {
    GK: null,
    CB: null,
    LB: null,
    RB: null,
    DM: null,
    CM: null,
    AM: null,
    LM: null,
    RM: null,
    LW: null,
    RW: null,
    CF: null,
    SS: null,
    register: function (pos, node) {
        this[pos] = node;
    }
};

const PlayingStyleBTs = {
    goal_poacher: null,
    fox_in_the_box: null,
    target_man: null,
    creative_playmaker: null,
    classic_no10: null,
    hole_player: null,
    prolific_winger: null,
    cross_specialist: null,
    roaming_flank: null,
    box_to_box: null,
    the_destroyer: null,
    orchestrator: null,
    anchor_man: null,
    build_up: null,
    extra_frontman: null,
    offensive_fullback: null,
    fullback_finisher: null,
    defensive_fullback: null,
    register: function (style, node) {
        this[style] = node;
    }
};

/* --- Ponto de entrada --------------------------------------------------- */

const PlayerAI = {
    tick: function (player, dt) {
        const s = player.fsm ? player.fsm.currentState : "";
        if (player.actionState || s === "PASS" || s === "SHOOT" || s === "CROSS" || s === "TACKLE" || s === "SLIDE_TACKLE" || s === "CHEST_CONTROL") return;

        if (!player.btCtx) player.btCtx = new PlayerContext(player);
        const ctx = player.btCtx.prepare(dt);

        /*
        1. BT do Playing Style — só na FASE DE ATAQUE da equipa.

        Os estilos são identidade COM bola: cortar para dentro, atacar a
        área, segurar a bola de costas. A defender, quem manda é a forma
        colectiva (bloco do TeamBT + marcação do PositionBT); um estilo a
        puxar o jogador para a sua zona preferida enquanto a equipa defende
        é exactamente o que abre buracos no bloco.
        */
        const bbEquipa = (typeof TeamAI !== 'undefined') ? TeamAI.get(player.team) : null;
        const emAtaque = !!(bbEquipa && bbEquipa.isAttacking);

        if (emAtaque && player.playingStyle && player.styleAtivo && PlayingStyleBTs[player.playingStyle]) {
            const res = PlayingStyleBTs[player.playingStyle].tick(ctx);
            if (res === SUCCESS) return;
        }

        // 2. Prioridade: BT específico da Posição (se registado)
        if (player.pos && PositionBTs[player.pos]) {
            const res = PositionBTs[player.pos].tick(ctx);
            if (res === SUCCESS) return;
        }

        // 3. BT Base Unificado
        PlayerBT.tick(ctx);
    }
};
