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
        this._bestPass = undefined;
        this._sidePass = undefined;
        this._backPass = undefined;
        this._cross = undefined;
        this._throughBall = undefined;

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
        const naDefesa = (this.p.model.position.z * this.p.dirZ < 0) || this.p.role === 'def';
        const espacoReq = naDefesa ? (CarryModel.espacoLivreDefesa || 24.0) : CarryModel.espacoLivre;
        if (this.espacoAFrente < espacoReq && !this.livreAFrente10m20g) return false;

        // O orçamento escala com o Estilo Ofensivo da equipa: correr com a
        // bola é o plano do contra-ataque, não do jogo de posse.
        const maxDist = (naDefesa ? (CarryModel.distanciaMaxDefesa || 6.0) : CarryModel.distanciaMax)
            * multiplicadorConducao();
        if ((this.p.carryDist || 0) < maxDist) return true;

        /*
        Orçamento GASTO. Estar livre à frente ainda deixa continuar, mas só no
        ÚLTIMO TERÇO e sem ser em sprint (ver CarryModel.zonaLivre/velMaxLivre).

        Antes era `|| this.livreAFrente10m20g` sem condição nenhuma, o que
        anulava o orçamento: quem arranca em velocidade limpa o cone de 20° por
        si próprio, logo a condição era sempre verdadeira e o portador
        atravessava o campo inteiro. Tirá-la de todo também não serve — com a
        baliza à frente e o caminho aberto, obrigar a passar é o que produz o
        toque para trás em vez da progressão para a zona de remate.
        */
        if (this.zoneAhead <= CarryModel.zonaLivre) return false;
        if (!this.livreAFrente10m20g) return false;
        const vel = this.p.velocity ? this.p.velocity.length() : 0;
        return vel <= CarryModel.velMaxLivre;
    }

    get livreAFrente10m20g() {
        return semMarcacaoAFrente(this.p, this.opponents, 10.0, 20.0);
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

/*
Multiplicador do orçamento de condução, vindo do Estilo Ofensivo da equipa
(TeamPlayStyles.conducao, config.js). 1.0 se o estilo não o definir.
*/
function multiplicadorConducao() {
    if (typeof TeamPlayStyles === 'undefined' || typeof Tatics === 'undefined') return 1.0;
    const e = TeamPlayStyles[Tatics.teamPlayStyle] || TeamPlayStyles.positional;
    return (e && typeof e.conducao === 'number') ? e.conducao : 1.0;
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
    if (ctx._throughBall !== undefined) return ctx._throughBall;
    const p = ctx.p;

    // Um defesa a lançar é o jogo directo que se quer evitar: a bola tem de
    // passar pelo meio-campo. O lançamento é arma de médios e avançados.
    if (p.role === 'def' || p.role === 'gk') {
        ctx._throughBall = null;
        return null;
    }
    if (Math.random() > PassModel.throughBallChance) {
        ctx._throughBall = null;
        return null;
    }

    const linhaAdv = ctx.oppBB.defLineDir;      // no referencial de ataque DELES
    if (linhaAdv === undefined || linhaAdv === null) { ctx._throughBall = null; return null; }

    // A mesma linha, no nosso referencial de ataque.
    const linhaNoNosso = -linhaAdv;
    const meuZ = p.model.position.z * p.dirZ;

    // Só faz sentido lançar de trás da linha e com campo para correr.
    if (meuZ > linhaNoNosso - 4) { ctx._throughBall = null; return null; }
    if (linhaNoNosso > 44) { ctx._throughBall = null; return null; }

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

        // Limita o lançamento estritamente à área útil de jogo (margem de segurança lateral e de fundo)
        const margemLateral = (typeof PassModel !== 'undefined' && PassModel.margemSegurancaLinha) ? PassModel.margemSegurancaLinha : 3.0;
        const limLateral = (CAMPO_LARG / 2) - margemLateral;
        alvoX = THREE.MathUtils.clamp(alvoX, -limLateral, limLateral);

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

        // A camada `lancamento` da SpatialGrid somava-se aqui com peso 0.5, mas
        // a função devolvia 0 em toda a parte — nunca chegou a ser autorada.
        // Saiu com a camada; a nota é a distância e o ganho de profundidade.
        let nota = 100 - dist * 0.5 + (linhaNoNosso - mateZ) * 2.0;
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
    ctx._throughBall = melhor;
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
    if (ctx._cross !== undefined) return ctx._cross;
    const p = ctx.p;
    const C = CrossModel;

    const meuX = Math.abs(p.model.position.x);
    if (meuX < C.alaX || ctx.zoneAhead < C.zonaZ) { ctx._cross = null; return null; }

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
    if (!alvo) { ctx._cross = null; return null; }

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

    const distAlvo = p.model.position.distanceTo(alvo.model.position);

    // Penalidade por cruzar de muito longe (distância excessiva do alvo)
    const distBase = (C.distBaseIdeal !== undefined) ? C.distBaseIdeal : 18.0;
    const taxaPenal = (C.penalDistancia !== undefined) ? C.penalDistancia : 0.035;
    const distExcesso = Math.max(0, distAlvo - distBase);
    chance -= distExcesso * taxaPenal;

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

    // Pontuação do ALTO: quem estiver no caminho pesa muito, distância e jogo
    // aéreo do alvo pesam menos.
    let notaAlto = bloqueadores * 0.45
        + THREE.MathUtils.clamp((distAlvo - 14) / 20, 0, 1) * 0.35
        + ((alvo.skillFor('STRENGTH') - 50) / 100) * 0.30;

    ctx._cross = {
        alvo: alvo,
        chance: THREE.MathUtils.clamp(chance, 0, C.chanceMax),
        alto: notaAlto >= 0.5,
        bloqueadores: bloqueadores
    };
    return ctx._cross;
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
    const G = GoalkeeperDistribution;
    let chance = G.laterais;
    if (G.porEstilo && typeof Tatics !== 'undefined' &&
        G.porEstilo[Tatics.teamPlayStyle] !== undefined) {
        chance = G.porEstilo[Tatics.teamPlayStyle];
    }
    p.gkSaida = (Math.random() < chance) ? 'laterais' : 'chuteFrente';
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
// Saída de bola: encontrar o melhor defesa (zagueiro ou lateral) para tocar após o primeiro passe do kickoff
function encontrarDefesaParaSaida(p) {
    if (typeof Match === 'undefined') return null;
    const teammates = (p.team === 'TeamA') ? Match.players : Match.opponents;
    const opponents = (p.team === 'TeamA') ? Match.opponents : Match.players;
    const defs = (teammates || []).filter(m => m !== p && m.role === 'def');
    if (!defs.length) return null;

    const obstaculos = (opponents || []).filter(o => o.role !== 'gk').map(o => ({
        x: o.model.position.x,
        z: o.model.position.z
    }));

    let melhorDef = null;
    let melhorScore = -Infinity;

    for (const d of defs) {
        const dPos = d.model.position;
        const pPos = p.model.position;
        const dist = Math.hypot(dPos.x - pPos.x, dPos.z - pPos.z);
        
        // Verifica se a linha de passe direta está livre
        const livre = (typeof linhaLivre === 'function')
            ? linhaLivre(pPos.x, pPos.z, dPos.x, dPos.z, obstaculos, 1.5)
            : true;

        let distAdvMaisPerto = 999;
        for (const o of obstaculos) {
            const da = Math.hypot(dPos.x - o.x, dPos.z - o.z);
            if (da < distAdvMaisPerto) distAdvMaisPerto = da;
        }

        let score = (livre ? 25.0 : 0.0) + distAdvMaisPerto * 1.5;
        if (distAdvMaisPerto >= 3.5) score += 200.0;
        if (dist >= 8 && dist <= 30) score += 10.0;
        else score -= Math.abs(dist - 18) * 0.4;

        if (score > melhorScore) {
            melhorScore = score;
            melhorDef = d;
        }
    }

    return melhorDef || defs[0];
}

function executarPasseSaidaParaDefesas(p, defTarget) {
    p.carryRecuo = false;
    p.apoioAtivo = false;
    if (typeof PassTypes !== 'undefined' && PassTypes.escolher) {
        const escolha = PassTypes.escolher(p, defTarget);
        if (escolha && escolha.mate) {
            aplicarMiraDoPasse(p, escolha.tipo, escolha.ponto);
            p.initiatePass(escolha.mate);
            return;
        }
    }
    p.passAimPoint = null;
    p.passTipo = 'direct';
    p.initiatePass(defTarget);
}

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
    const naDefesa = (p.model.position.z * p.dirZ < 0) || p.role === 'def';

    // 1. Atrasar / circular a alguém perto, para reiniciar a jogada e circular o jogo
    const recuo = PassTypes.melhorRecuo(p);
    if (recuo && (naDefesa || !ctx.campoAberto || ctx.underPressure)) {
        p.carryRecuo = false;
        const r = PassTypes.paraMate(p, recuo);
        aplicarMiraDoPasse(p, r.tipo, r.ponto);
        p.initiatePass(recuo);
        return;
    }

    // 2. Levar a bola, se a técnica der para isso e houver espaço à frente (fora da defesa)
    if (!naDefesa && tec >= E.tecnicaDrible && ctx.campoAberto) {
        p.carryRecuo = false;
        p.apoioAtivo = false;
        p.fsm.changeState('CARRY');
        return;
    }

    // 2b. Recuo como alternativa se não conduziu
    if (recuo) {
        p.carryRecuo = false;
        const r = PassTypes.paraMate(p, recuo);
        aplicarMiraDoPasse(p, r.tipo, r.ponto);
        p.initiatePass(recuo);
        return;
    }

    // 3. Voltar com a bola e esperar (Giro de 180 graus).
    // O utilizador pediu para não girar 180 graus com marcadores próximos (< 3.5m).
    // Se houver qualquer adversário a menos de 3.5m (ou sob pressão), NUNCA gira 180 graus; passa a bola.
    if (escolha && escolha.mate) {
        let adversarioProximo = false;
        const allOpps = (p.team === 'TeamA') ? Match.opponents : Match.players;
        for (const o of allOpps) {
            if (o.role === 'gk') continue;
            if (p.model.position.distanceToSquared(o.model.position) < 12.25) { // 3.5m
                adversarioProximo = true;
                break;
            }
        }

        // Só pode recuar com a bola se tiver espaço limpo em redor (sem marcadores a menos de 3.5m)
        if (!adversarioProximo && !ctx.underPressure) {
            p.carryRecuo = true;
            p.apoioAtivo = false;
            p.fsm.changeState('CARRY');
            return;
        }
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
    // Um defesa não dribla, em zona nenhuma do campo: tira a bola da zona a
    // passar. Perder o duelo com a bola ao pé de um central é golo do outro
    // lado, e o ganho de um drible bem sucedido ali é nenhum.
    if (p.role === 'def') return false;

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
    if (ctx._bestPass !== undefined) return ctx._bestPass;
    const p = ctx.p;
    if (!ctx.underPressure) {
        const tb = findThroughBall(ctx);
        if (tb) {
            ctx._bestPass = { type: 'through', data: tb };
            return ctx._bestPass;
        }
    }
    
    let target = p.findPassTarget(); // Avalia todos e escolhe o melhor
    
    // Na defesa, se não houver passe perfeitamente seguro, procura alternativas para forçar a circulação
    const naDefesa = (p.model.position.z * p.dirZ < 0) || p.role === 'def';
    
    if (!target && (ctx.underPressure || naDefesa)) target = p.findPassTargetRelaxed();
    if (!target && (ctx.underPressure || naDefesa) && p.decisionTimer > 0.8) target = p.findPassTargetDesperate();
    
    if (target) {
        ctx._bestPass = { type: 'pass', target: target };
    } else {
        ctx._bestPass = null;
    }
    return ctx._bestPass;
}

function findPassSide(ctx) {
    if (ctx._sidePass !== undefined) return ctx._sidePass;
    const p = ctx.p;
    let target = p.findPassTarget('lado');
    if (!target && ctx.underPressure) target = p.findPassTargetRelaxed('lado');
    if (target) {
        ctx._sidePass = { type: 'pass', target: target };
    } else {
        ctx._sidePass = null;
    }
    return ctx._sidePass;
}

function findPassBack(ctx) {
    if (ctx._backPass !== undefined) return ctx._backPass;
    const p = ctx.p;
    let target = p.findPassTarget('tras');
    if (!target && ctx.underPressure) target = p.findPassTargetRelaxed('tras');
    if (!target && ctx.underPressure && p.decisionTimer > 0.8) target = p.findPassTargetDesperate();
    if (target) {
        ctx._backPass = { type: 'pass', target: target };
    } else {
        ctx._backPass = null;
    }
    return ctx._backPass;
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
    return false;
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
        resto (posição genérica, fora de fase de bola) -> MOVE_TO_POS
    */
    if (p.markingTarget) {
        p.apoioAtivo = false;
        p.fsm.changeState('MARKING');
    } else if (ctx.bb && ctx.bb.blocker === p) {
        p.apoioAtivo = false;
        
        // O blocker quer ficar entre o carrier e o gol, cercando o carrier para atrasá-lo
        const goalPos = new THREE.Vector3(0, 0, ctx.bb.ownGoalZ);
        const ballPos = Match.ball.position;
        const ballToGoal = new THREE.Vector3().subVectors(goalPos, ballPos);
        ballToGoal.y = 0;
        
        if (ballToGoal.lengthSq() > 0.001) {
            ballToGoal.normalize();
        } else {
            ballToGoal.set(0, 0, ctx.bb.dir);
        }
        
        // Fica a uma distância de "cercar" (jockey) da bola na direção do gol
        const jockeyDist = 5.0; // metros
        const projPos = new THREE.Vector3().copy(ballPos).add(ballToGoal.multiplyScalar(jockeyDist));
        
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

/*
MARCACAO POR ZONA — acompanhar o homem que entrou no meu sector.

Quem escolhe o par e o nivel de equipa (atribuirMarcacoesDaEquipa, team_bt.js),
com histerese e exclusividade: `p.marcRef` e o homem deste jogador. O que
faltava era alguem EXECUTAR essa escolha — o estado MARKING da FSM existia
inteiro (circulo a volta do homem, recuo quando ele vem para cima) mas nunca
era activado, porque dependia de `p.markingTarget`, que ninguem escrevia. A
marcacao resumia-se ao desvio posicional limitado a `biasMax` (poucos metros),
e por isso nao se via marcacao nenhuma.

Zonal: so acompanha se o homem estiver dentro de `MarkingModel.raioSetor` do
POSTO dele (nao da posicao actual) — sai do sector, deixa de ser problema
dele e o nivel de equipa entrega-o a outro. E so a defender: com bola quem
manda sao os estilos e a circulacao.

Nao entra quem ja tem tarefa com a bola (chaser, blocker, intercetor) — essas
folhas estao acima na arvore, isto e a rede de quem sobra.
*/
function podeMarcar(ctx) {
    const p = ctx.p;
    if (p.role === 'gk') return false;
    if (typeof MarkingModel === 'undefined') return false;

    const bb = ctx.bb;
    if (!bb || bb.isAttacking) return false;

    const homem = p.marcRef;
    if (!homem || !homem.model) return false;

    if (Match.chaserA === p || Match.chaserB === p) return false;
    if (bb.blocker === p || bb.intercetor === p) return false;

    const base = p.postoBase || p.model.position;
    const d = Math.hypot(homem.model.position.x - base.x,
        homem.model.position.z - base.z);
    if (d > MarkingModel.raioSetor) return false;

    ctx.marcado = homem;
    return true;
}

function actMarcar(ctx) {
    const p = ctx.p;
    const homem = ctx.marcado;
    p.markingTarget = homem;

    /*
    O ponto fica na recta homem->propria baliza, a `MarkingModel.distancia`
    dele — e o mesmo pontoDeMarcacao da camada posicional, mas com o tecto
    aberto ate ao raio do sector em vez do `biasMax` de poucos metros: aqui a
    intencao E acompanhar o homem, nao inclinar o slot. O raio do sector
    continua a ser o limite, portanto ninguem atravessa o campo atras de
    ninguem.

    Meio segundo de antecipacao na posicao do homem, como na camada
    posicional — sem isso o marcador anda sempre atras dele.
    */
    const base = p.postoBase || p.model.position;
    const dist = MarkingModel.distanciaPara(homem.model.position.z * p.dirZ);
    const v = homem.velocity;
    const hx = homem.model.position.x + (v ? v.x * 0.5 : 0);
    const hz = homem.model.position.z + (v ? v.z * 0.5 : 0);

    const ponto = pontoDeMarcacao(base.x, base.z, hx, hz,
        p.ownGoalZ, dist, MarkingModel.raioSetor);

    p.dynamicTarget.set(ponto.x, ALTURA_BASE_Y, ponto.z);
    p.speedMult = (5.8 + ((ctx.skillSpeed - 50) / 50) * 1.4) * 1.25 * 0.9;
    p.apoioAtivo = false;
    p.fsm.changeState('MARKING');
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
    } else if (Match.state === 'THROW_IN') {
        // O batedor está em LATERAL (pose + gesto) e não passa por aqui; os
        // outros continuam a posicionar-se normalmente pelo nível 2.
        if (s !== 'LATERAL' && s !== 'MOVE_TO_POS') {
            fsm.changeState('MOVE_TO_POS');
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

    const G = GoalkeeperDistribution;
    // Sorteada UMA vez por posse (ver decidirSaidaGK) — a cada frame seria
    // "o que calhar primeiro" em vez da proporção pedida.
    const saida = p.gkSaida || decidirSaidaGK(p);

    if (saida === 'laterais') {
        const lateral = acharLateralParaSaida(ctx);
        if (lateral) {
            if (p.decisionTimer > G.esperaSaidaCurta) actPassParaAlvo(ctx, lateral);
            else actCarry(ctx);
            return;
        }
        /*
        Decidiu sair a jogar mas nenhum lateral está livre. Espera a ver se
        algum se desmarca; passado `esperaMaxSemLinha` desiste e chuta, senão
        ficava com a bola no pé até alguém lha tirar.
        */
        if (p.decisionTimer <= G.esperaMaxSemLinha) { actCarry(ctx); return; }
        p.gkSaida = 'chuteFrente';
    }

    if (p.decisionTimer > G.esperaChutao) p.puntBall();
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
// Na defesa, basta 1 adversário no corredor à frente para fechar o caminho e forçar a circulação.
function caminhoFechadoAFrente(ctx) {
    const naDefesa = (ctx.p.model.position.z * ctx.p.dirZ < 0) || ctx.p.role === 'def';
    const minAdv = naDefesa ? 1 : PassModel.bloqueioMin;
    
    // Bloqueio directo no corredor de progressão
    if (adversariosAFrente(ctx) >= minAdv) return true;
    
    // Bloqueio por congestionamento geral do sector (ex: 3 adversários na frente, mas espalhados)
    if (ctx.bb && ctx.bb.congestion) {
        const x = ctx.p.model.position.x;
        const banda = x < -10 ? 'esq' : (x > 10 ? 'dir' : 'centro');
        // Se há 3+ adversários neste terço longitudinal, o sector está congestionado (75 = 3 adv)
        if (ctx.bb.congestion[banda] >= 75) {
            return true;
        }
    }
    
    return false;
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
                let carryPts = 0;
                if (ctx.campoAberto) carryPts += 100;
                if (ctx.livreAFrente10m20g) carryPts += 150;
                ctx.carryScore = carryPts;
                if (window.showPlayerPoints) {
                    ctx.p.debugPoints = ctx.p.debugPoints || {};
                    ctx.p.debugPoints['Shot'] = emZonaDeRemate(ctx) ? 'SIM' : 'NAO';
                    ctx.p.debugPoints['Carry'] = carryPts;
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

            // 0. Saída de bola: após o primeiro passe do kickoff, o receptor toca para os zagueiros ou laterais
            seq('PasseSaidaDeBola',
                cond('precisaPassarAosDefesas', (ctx) => {
                    if (typeof Match === 'undefined' || !Match.kickoffPendingPassToDef) return false;
                    if (ctx.p.role === 'gk') return false;
                    const defTarget = encontrarDefesaParaSaida(ctx.p);
                    if (!defTarget) return false;
                    ctx.kickoffDefTarget = defTarget;
                    return true;
                }),
                act('passarAosDefesas', (ctx) => {
                    Match.kickoffPendingPassToDef = false;
                    executarPasseSaidaParaDefesas(ctx.p, ctx.kickoffDefTarget);
                })
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

            // 3. Conduzir em espaço aberto (+150 pontos se sem marcação a 10m em 20 graus)
            seq('ConduzirEmEspaco',
                cond('campoAberto', (ctx) => {
                    const p = ctx.p;
                    if (p.role === 'gk') return false;
                    // Só `campoAberto` — ele já pesa o `livreAFrente10m20g` por
                    // dentro, contra o orçamento de condução. Aceitá-lo aqui
                    // outra vez era saltar o orçamento pela segunda vez.
                    if (!ctx.campoAberto) return false;
                    /*
                    Um defesa conduz para SAIR A JOGAR, não para atacar. Sem este
                    tecto ele recebia atrás — com campo aberto à frente, que é o
                    caso normal — e levava a bola até à área adversária, porque
                    este ramo está acima do CircularNaDefesa e o CircularNaDefesa
                    desiste justamente quando há campo aberto.
                    */
                    if (p.role === 'def' && ctx.zoneAhead > CarryModel.limiteConducaoDefesa) {
                        return false;
                    }
                    return true;
                }),
                act('atacarOEspaco', actCarry)
            ),

            /*
            4. Caminho fechado / Circulação: se há adversário à frente no corredor
            e não tem espaço para conduzir, prioriza o passe antes sequer de tentar driblar.
            */
            seq('CaminhoFechado',
                cond('doisPelaFrente', (ctx) => {
                    if (ctx.livreAFrente10m20g || !caminhoFechadoAFrente(ctx)) return false;
                    const saida = findBestPassAnywhere(ctx) || findPassSide(ctx) || findPassBack(ctx);
                    if (!saida) return false;
                    ctx.passType = saida.type;
                    ctx.passTarget = saida.target;
                    ctx.throughBall = saida.data;
                    return true;
                }),
                act('passarLadoOuTras', (ctx) => {
                    if (ctx.passType === 'through') {
                        actThroughBall(ctx);
                    } else {
                        actPass(ctx);
                    }
                })
            ),

            /*
            4b. Circulação na defesa: se o jogador está na sua metade defensiva ou é defesa
            e não tem espaço livre para conduzir à frente, circula a bola.
            */
            seq('CircularNaDefesa',
                cond('circulacaoDefensiva', (ctx) => {
                    // Mesma razão do ConduzirEmEspaco: o teste é o `campoAberto`,
                    // que já tem o orçamento lá dentro. Com o `livreAFrente10m20g`
                    // solto aqui, um portador com o orçamento gasto mas o cone
                    // livre não conduzia (bem) nem circulava (mal) — caía até ao
                    // fundo da árvore.
                    if (ctx.campoAberto) return false;
                    const naDefesa = (ctx.p.model.position.z * ctx.p.dirZ < 0) || ctx.p.role === 'def';
                    if (!naDefesa) return false;
                    const passChoice = findBestPassAnywhere(ctx);
                    if (!passChoice) return false;
                    ctx.currentPassChoice = passChoice;
                    return true;
                }),
                act('executarPasseDefesa', (ctx) => {
                    if (ctx.currentPassChoice.type === 'through') {
                        ctx.throughBall = ctx.currentPassChoice.data;
                        actThroughBall(ctx);
                    } else {
                        ctx.passTarget = ctx.currentPassChoice.target;
                        actPass(ctx);
                    }
                })
            ),

            // 5. Adversário próximo, espaço atrás do adversário, técnica >= 75 - Driblar
            seq('Driblar',
                cond('podeDriblar', podeDriblar),
                act('driblar', actDribble)
            ),

            // 6. Escolha de passe baseada na avaliação geral
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

            // 7. Não tem passe viável e está sob pressão - chute para a lateral
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
            O DESARME E O CARRINHO ESTÃO DE VOLTA (pedido do utilizador).
            Adicionamos de novo o bloco de decisão de desarme e carrinho que estava desligado,
            agora com verificações de ângulo e probabilidade para não fazerem demasiadas faltas.
            */
            seq('Desarme',
                cond('podeDesarmar', (ctx) => {
                    const carrier = Match.ballCarrier;
                    if (!carrier || carrier.team === ctx.p.team || carrier.role === 'gk') return false;

                    // Marcação com roubo de bola no Defensive Pressure Balanceado (e Low) SOMENTE no campo de defesa.
                    // No campo de ataque (carrierZ * dirZ > 0), a equipa marca à distância e não faz roubo de bola,
                    // a não ser que a pressão defensiva esteja configurada como High ('high').
                    const carrierZInAtk = carrier.model.position.z * ctx.p.dirZ;
                    if (typeof Tatics !== 'undefined' && Tatics.pressaoDefensiva !== 'high' && carrierZInAtk > 0) {
                        return false;
                    }
                    
                    const dist = ctx.distToBall;
                    if (dist > 3.0) return false; // Longe demais para carrinho
                    
                    // Bloqueio por ângulo: se o defensor estiver bem atrás do portador (ângulo < -0.3), 
                    // não vale a pena fazer carrinho/desarme porque vai falhar e a animação não rouba a bola.
                    let carrierFwd;
                    if (carrier.velocity && carrier.velocity.lengthSq() > 0.1) {
                        carrierFwd = carrier.velocity.clone().normalize();
                    } else {
                        carrierFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(carrier.model.quaternion);
                    }
                    const toDefender = new THREE.Vector3().subVectors(ctx.p.model.position, carrier.model.position);
                    toDefender.y = 0;
                    if (toDefender.lengthSq() > 0) toDefender.normalize();
                    const dotAngle = carrierFwd.x * toDefender.x + carrierFwd.z * toDefender.z;
                    
                    if (dotAngle < -0.3) return false;
                    
                    // Se muito perto e de frente, faz desarme em pé imediatamente.
                    if (dist < 1.4 && dotAngle > 0.5) return true;
                    
                    // Se estiver no alcance do carrinho (1.4 a 3.0m), tem uma chance por frame.
                    // A probabilidade escala com o atributo DEF e com a distância (quanto mais perto, mais provável).
                    const agressividade = ctx.p.skillFor('DEF') / 50.0;
                    if (Math.random() < (0.015 * agressividade)) return true;
                    
                    return false;
                }),
                act('tentarDesarme', (ctx) => {
                    if (ctx.distToBall > 1.4) {
                        actSlideTackle(ctx);
                    } else {
                        actTackle(ctx);
                    }
                })
            ),

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
            Marcacao por zona. Vem depois de tudo o que e bola (desarme,
            intercepcao, perseguicao, recepcao) e ANTES das folhas de
            posicionamento: quem tem um homem no sector acompanha-o em vez de
            ir ocupar um ponto no mapa.
            */
            seq('Marcar',
                cond('temHomemNoSector', podeMarcar),
                act('marcar', actMarcar)
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
        // LATERAL entra na lista: é um gesto com duração própria (ThrowInClip),
        // e deixar o BT decidir por cima dele tirava-lhe a bola das mãos a meio.
        if (player.actionState || s === "PASS" || s === "SHOOT" || s === "CROSS" || s === "TACKLE" || s === "SLIDE_TACKLE" || s === "CHEST_CONTROL" || s === "LATERAL") return;

        if (!player.btCtx) player.btCtx = new PlayerContext(player);
        const ctx = player.btCtx.prepare(dt);

        /*
        `markingTarget` vale para o tick em que a folha Marcar o escreve, e
        mais nada. Limpo aqui, no unico sitio por onde todos os ramos passam:
        se a arvore levar o jogador a outra coisa qualquer neste frame, ele
        deixa de estar a marcar, e nem a FSM (case MARKING) nem o
        estouAMarcar ficam a olhar para um homem que ele ja largou.
        */
        player.markingTarget = null;

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
