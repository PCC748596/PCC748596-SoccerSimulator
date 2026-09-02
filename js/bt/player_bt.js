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
        /*
        O `ctx` sobrevive entre frames (`player.btCtx`), portanto uma escolha de
        passe guardada tem de morrer AQUI. O ConduzirEmEspaco guarda-a para o
        ProcurarPasse a reaproveitar no MESMO frame; sobrevivendo ao frame,
        apontaria para um companheiro que entretanto se moveu ou que ja recebeu
        a bola — e o passe sairia para onde ele estava.
        */
        this.currentPassChoice = null;

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
        return semMarcacaoAFrente(this.p, this.opponents, 20.0, 45.0);
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

        /*
        NAS LATERAIS DA ÁREA, o lançamento RASTEIRO cede ao cruzamento — a
        penalização é maior do que a do passe normal (`penalLancamentoRasteiro`
        contra `penalPasseRasteiro`), porque dali um lançamento rasteiro é a
        pior das três opções: atravessa a defesa toda junto ao chão, no sítio
        onde ela está mais junta.

        Em rampa e não em degrau (ver zonaLateralDaArea em utils.js).
        */
        if (typeof zonaLateralDaArea === 'function' && typeof CrossModel !== 'undefined') {
            const naAla = zonaLateralDaArea(p.model.position.x, p.model.position.z * p.dirZ);
            if (naAla > 0) {
                const cheio = CrossModel.penalLancamentoRasteiro ?? 0.35;
                nota *= 1 - (1 - cheio) * naAla;
            }
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
    if (!p.hasBall && p.gkSaida) {
        p.gkSaida = null;
        p.gkThrowTarget = null;
    }
}

/*
Defesa disponível para a saída curta: o mais desmarcado, dentro do alcance.
"Desmarcado" aqui é literal — adversário mais próximo a mais de `folgaMinima`;
um defesa com um extremo em cima não é saída, é oferta.

CANDIDATOS: laterais (LB/RB) **e** centrais (CB/DC), com PREFERÊNCIA pelos
laterais.

Só aceitava LB/RB. Com dois candidatos apenas, e os dois a terem de estar a
mais de 4 m de qualquer adversário, era frequente não haver nenhum — e aí o
guarda-redes esperava `esperaMaxSemLinha` e acabava a chutar. A saída a jogar
existia mas quase não se via.

A preferência pelo lateral é o `bonusLateral` somado à folga: entre um lateral
e um central igualmente livres sai pelo lateral, que é por onde se sai a jogar;
o central entra quando é ele o que está mesmo livre.
*/
function acharLateralParaSaida(ctx) {
    const p = ctx.p;
    const G = GoalkeeperDistribution;
    let melhor = null, melhorNota = -Infinity;
    // Lateral com folga de sobra: sai por ali, sem concorrer com os centrais.
    // Ver folgaPreferencialLateral em config.js.
    let melhorLateralLivre = null, melhorFolgaLateral = -Infinity;

    for (const mate of ctx.teammates) {
        if (mate === p) continue;
        const ehLateral = (mate.pos === 'LB' || mate.pos === 'RB');
        const ehCentral = (mate.pos === 'CB' || mate.pos === 'DC');
        if (!ehLateral && !ehCentral) continue;
        if (p.model.position.distanceTo(mate.model.position) > G.distanciaMaxLateral) continue;

        let folga = Infinity;
        for (const opp of ctx.opponents) {
            if (opp.role === 'gk') continue;
            const d = mate.model.position.distanceTo(opp.model.position);
            if (d < folga) folga = d;
        }
        if (folga < G.folgaMinima) continue;

        if (ehLateral && G.folgaPreferencialLateral !== undefined &&
            folga >= G.folgaPreferencialLateral && folga > melhorFolgaLateral) {
            melhorFolgaLateral = folga;
            melhorLateralLivre = mate;
        }

        const nota = folga + (ehLateral ? (G.bonusLateral || 0) : 0);
        if (nota > melhorNota) { melhorNota = nota; melhor = mate; }
    }
    return melhorLateralLivre || melhor;
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
    let defs = (teammates || []).filter(m => m !== p && m.role === 'def');
    if (!defs.length) return null;

    /*
    ATRAS PRIMEIRO. A pontuacao la em baixo mede linha livre, adversario mais
    perto e distancia — nenhum termo dizia ATRAS, e por isso um lateral subido
    ganhava ao central que ficou. O toque para tras saia para a frente na
    mesma, agora por escolha do alvo em vez do tipo de passe.

    `zDir` e o referencial de ataque (z * dirZ): negativo e do lado da propria
    baliza. Meio metro de folga para dois jogadores na mesma linha nao
    dependerem do ruido da posicao.

    Se nao houver nenhum atras joga-se no que houver — melhor um lateral subido
    do que a bandeira a expirar e a saida a nao se ver de todo.
    */
    const zDirDoPortador = p.model.position.z * p.dirZ;
    const atras = defs.filter(d => d.model.position.z * d.dirZ < zDirDoPortador - 0.5);
    if (atras.length) defs = atras;

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

/*
O DESTINO NAO ESTA EM VOTACAO.

Chamava-se aqui o `PassTypes.escolher(p, defTarget)`, e ali o defesa entra como
SUGESTAO: vale o `bonusSugerido` e concorre com todos os companheiros numa nota
dominada pelo PROGRESSO para a baliza. Um passe para tras tem progresso
negativo por definicao, portanto perdia quase sempre — a bola saia para a
frente e o ramo da saida dava-se por cumprido na mesma.

O `paraCompanheiro` e a segunda metade do `escolher` sozinha: mesma balistica,
mesmo leque, mesmo sorteio de tipo por zona, sem escolher destino nenhum.
*/
function executarPasseSaidaParaDefesas(p, defTarget) {
    p.carryRecuo = false;
    p.apoioAtivo = false;
    if (typeof PassTypes !== 'undefined' && PassTypes.paraCompanheiro) {
        const escolha = PassTypes.paraCompanheiro(p, defTarget);
        if (escolha) {
            aplicarMiraDoPasse(p, escolha.tipo, escolha.ponto);
            p.initiatePass(defTarget);
            return;
        }
    }
    p.passAimPoint = null;
    p.passTipo = 'direct';
    p.initiatePass(defTarget);
}

/*
Distância ao adversário mais próximo (sem contar guarda-redes), no plano.
*/
function distAdversarioMaisPerto(p) {
    const advs = (p.team === 'TeamA') ? Match.opponents : Match.players;
    let d = Infinity;
    for (const o of advs) {
        if (o.role === 'gk' || !o.model) continue;
        const dd = Math.hypot(p.model.position.x - o.model.position.x,
            p.model.position.z - o.model.position.z);
        if (dd < d) d = dd;
    }
    return d;
}

/*
SEGURAR A BOLA ou RECUAR COM ELA — ver CarryModel.segurar.

Corre antes dos ramos que passam a bola para trás, e só quando NÃO há passe
bom e ninguém está em cima dele. Devolve true se tratou do assunto.

A paragem tem duração própria (`carryHold`) e é reavaliada quando acaba: sem
isso, o BT voltava a decidir no frame seguinte e a "paragem" durava 16 ms.
*/
function tratarSegurarBola(ctx) {
    const p = ctx.p;
    const S = (typeof CarryModel !== 'undefined') ? CarryModel.segurar : null;
    if (!S) return false;

    // Já está a segurar: mantém-se até o tempo acabar ou alguém chegar perto.
    if (p.carryHold > 0) {
        if (ctx.underPressure || distAdversarioMaisPerto(p) < S.distCorte) {
            p.carryHold = 0;
            return false;
        }
        p.carryRecuo = false;
        p.apoioAtivo = false;
        p.fsm.changeState('CARRY');
        return true;
    }

    if (ctx.underPressure) return false;
    if (distAdversarioMaisPerto(p) < S.distSemPressao) return false;

    const r = Math.random();
    if (r < S.chanceParar) {
        p.carryHold = S.duracaoMin + Math.random() * (S.duracaoMax - S.duracaoMin);
        p.carryRecuo = false;
        p.apoioAtivo = false;
        p.fsm.changeState('CARRY');
        return true;
    }
    if (r < S.chanceParar + S.chanceRecuar) {
        p.carryHold = 0;
        p.carryRecuo = true;
        p.apoioAtivo = false;
        actCarry(ctx);      // condução, com o recuoMult da velocidade
        return true;
    }
    return false;
}

/*
=============================================================================
JOGADAS COMBINADAS — cara a cara, tabelinha, overlap
=============================================================================
Ver o cabeçalho do `JogadasCombinadas` (config.js) para o porquê de serem um
ramo próprio e não um bónus na nota do `PassTypes.escolher`.

`tratarJogadaCombinada` devolve true quando resolveu o que fazer com a bola.
Corre ANTES da escolha normal de passe, e testa por esta ordem:

    1. devolução de tabelinha pedida (sou eu que a tenho de devolver AGORA)
    2. cara a cara
    3. tabelinha (iniciar)
    4. passe para quem está a fazer overlap

A CORRIDA do overlap e o arranque de quem pediu a tabelinha não se decidem
aqui: vivem na parte da árvore de quem NÃO tem a bola (ver actOverlap e
actEsperarDevolucao).
=============================================================================
*/

// Adversário mais próximo de um jogador, no plano.
function distAoAdversarioMaisPerto(p) {
    const advs = (p.team === 'TeamA') ? Match.opponents : Match.players;
    let d = Infinity;
    for (const o of advs) {
        if (o.role === 'gk' || !o.model) continue;
        const dd = Math.hypot(p.model.position.x - o.model.position.x,
            p.model.position.z - o.model.position.z);
        if (dd < d) d = dd;
    }
    return d;
}

/*
Corredor livre entre dois PONTOS: nenhum adversário a menos de `meiaLargura` da
recta que os une, contando só quem está entre um e outro.

É a mesma pergunta da linha de passe, escrita aqui para poder ser feita com
pontos e não só com jogadores — o cara a cara precisa dela entre o ponto do
passe e a baliza.
*/
function corredorLivre(ax, az, bx, bz, adversarios, meiaLargura, ignorarGK) {
    const lx = bx - ax, lz = bz - az;
    const len2 = lx * lx + lz * lz;
    if (len2 < 0.01) return true;
    for (const o of adversarios) {
        if (!o.model) continue;
        if (ignorarGK && o.role === 'gk') continue;
        const t = ((o.model.position.x - ax) * lx + (o.model.position.z - az) * lz) / len2;
        if (t < 0.02 || t > 0.98) continue;
        const px = ax + t * lx, pz = az + t * lz;
        if (Math.hypot(o.model.position.x - px, o.model.position.z - pz) < meiaLargura) return false;
    }
    return true;
}

/*
CARA A CARA. Companheiro que, recebendo no espaço, fica isolado com o
guarda-redes: à frente do último defensor, com o corredor até à baliza livre e
a ganhar a corrida ao ponto.

A corrida ao ponto é a mesma pergunta do `PassCandidates.venceACorrida` — o
critério do resto do jogo, não um inventado aqui.

Devolve `{ mate, ponto }` ou null.
*/
function procurarCaraACara(p) {
    const C = (typeof JogadasCombinadas !== 'undefined') ? JogadasCombinadas.caraACara : null;
    if (!C) return null;

    const colegas = (p.team === 'TeamA') ? Match.players : Match.opponents;
    const advs = (p.team === 'TeamA') ? Match.opponents : Match.players;

    // Último defensor adversário, no nosso referencial de ataque.
    let ultimoDef = null;
    for (const o of advs) {
        if (o.role === 'gk' || !o.model) continue;
        const z = o.model.position.z * p.dirZ;
        if (ultimoDef === null || z > ultimoDef) ultimoDef = z;
    }

    const bb = (typeof TeamAI !== 'undefined') ? TeamAI.get(p.team) : null;
    const golZ = p.targetGoalZ;
    let melhor = null, melhorDist = Infinity;

    for (const mate of colegas) {
        if (mate === p || mate.role === 'gk' || !mate.model) continue;

        const mz = mate.model.position.z * p.dirZ;
        if (ultimoDef !== null && mz < ultimoDef - C.margemUltimoDefensor) continue;

        // O ponto do passe: à frente dele, na direcção da baliza.
        const dx = 0 - mate.model.position.x, dz = golZ - mate.model.position.z;
        const d = Math.hypot(dx, dz) || 1;
        const ponto = {
            x: mate.model.position.x + (dx / d) * C.avancoDoPasse,
            z: mate.model.position.z + (dz / d) * C.avancoDoPasse
        };

        const distBaliza = Math.hypot(0 - ponto.x, golZ - ponto.z);
        if (distBaliza > C.distBalizaMax) continue;

        // Fora-de-jogo: o ponto não pode estar além da linha.
        if (bb && bb.offsideLimitDir !== null && bb.offsideLimitDir !== undefined &&
            ponto.z * p.dirZ > bb.offsideLimitDir - 0.5) continue;

        /*
        Do ponto à baliza sem defensores. O guarda-redes NÃO conta: é
        exactamente ele o duelo que se quer criar.
        */
        if (!corredorLivre(ponto.x, ponto.z, 0, golZ, advs, C.corredorMeiaLargura, true)) continue;

        // E a linha do passe também tem de estar livre.
        if (!corredorLivre(Match.ball.position.x, Match.ball.position.z, ponto.x, ponto.z,
            advs, 1.6, true)) continue;

        if (typeof PassCandidates !== 'undefined' && PassCandidates.venceACorrida &&
            !PassCandidates.venceACorrida(mate, ponto.x, ponto.z, advs)) continue;

        if (distBaliza < melhorDist) { melhorDist = distBaliza; melhor = { mate: mate, ponto: ponto }; }
    }
    return melhor;
}

/*
TABELINHA — a metade que INICIA. Passa curto ao parceiro e deixa-lhe o pedido
de devolução; o arranque para o espaço é do `actEsperarDevolucao`.

Só sob pressão: sem ninguém em cima não há razão nenhuma para dar e receber —
com espaço, o passe normal (ou a condução) é melhor.
*/
function procurarTabelinha(p) {
    const T = (typeof JogadasCombinadas !== 'undefined') ? JogadasCombinadas.tabelinha : null;
    if (!T) return null;
    if (distAoAdversarioMaisPerto(p) > T.distAdversario) return null;

    const colegas = (p.team === 'TeamA') ? Match.players : Match.opponents;
    const advs = (p.team === 'TeamA') ? Match.opponents : Match.players;

    // Há espaço à frente para onde arrancar? Sem isso a tabelinha não tem
    // segundo tempo.
    const golZ = p.targetGoalZ;
    const dirParaGolo = Math.sign(golZ - p.model.position.z) || p.dirZ;
    const alvoArranque = {
        x: p.model.position.x,
        z: p.model.position.z + dirParaGolo * T.avancoDaDevolucao
    };
    if (!corredorLivre(p.model.position.x, p.model.position.z,
        alvoArranque.x, alvoArranque.z, advs, T.espacoAFrente * 0.5, true)) return null;

    let melhor = null, melhorDist = Infinity;
    for (const mate of colegas) {
        if (mate === p || mate.role === 'gk' || !mate.model) continue;
        const d = p.model.position.distanceTo(mate.model.position);
        if (d < T.distParceiroMin || d > T.distParceiroMax) continue;
        if (!corredorLivre(Match.ball.position.x, Match.ball.position.z,
            mate.model.position.x, mate.model.position.z, advs, 1.4, true)) continue;
        if (d < melhorDist) { melhorDist = d; melhor = mate; }
    }
    if (!melhor) return null;
    return { mate: melhor, alvo: alvoArranque };
}

/*
O ramo, chamado do topo do `actPass`. Devolve true se a bola foi jogada.
*/
function tratarJogadaCombinada(ctx) {
    const p = ctx.p;
    if (typeof JogadasCombinadas === 'undefined' || typeof PassTypes === 'undefined') return false;
    const J = JogadasCombinadas;

    /*
    1. DEVOLUÇÃO DE TABELINHA. Alguém me passou a pedir a devolução e o pedido
    ainda está de pé. Vem antes de tudo: é o segundo tempo de uma jogada já
    começada, e hesitar aqui é o mesmo que não a ter começado.
    */
    if (p.devolverPara && p.devolverPara.timer > 0 && p.devolverPara.mate &&
        p.devolverPara.mate.model) {
        const pedido = p.devolverPara;
        p.devolverPara = null;
        aplicarMiraDoPasse(p, PassTypes.LEADING, pedido.alvo);
        p.initiatePass(pedido.mate);
        return true;
    }

    // 2. CARA A CARA.
    const isolado = procurarCaraACara(p);
    if (isolado) {
        p.carryRecuo = false;
        p.carryHold = 0;
        aplicarMiraDoPasse(p, PassTypes.LEADING, isolado.ponto);
        p.initiatePass(isolado.mate);
        if (typeof MatchStats !== 'undefined' && MatchStats[p.team] &&
            MatchStats[p.team].caraACara !== undefined) MatchStats[p.team].caraACara++;
        return true;
    }

    // 3. TABELINHA (iniciar).
    const tab = procurarTabelinha(p);
    if (tab) {
        p.carryRecuo = false;
        p.carryHold = 0;

        tab.mate.devolverPara = {
            mate: p, alvo: tab.alvo, timer: J.tabelinha.duracaoPedido
        };
        p.esperarDevolucao = { alvo: tab.alvo, timer: J.tabelinha.duracaoPedido };

        aplicarMiraDoPasse(p, PassTypes.DIRECT, null);
        p.initiatePass(tab.mate);
        if (typeof MatchStats !== 'undefined' && MatchStats[p.team] &&
            MatchStats[p.team].tabelinhas !== undefined) MatchStats[p.team].tabelinhas++;
        return true;
    }

    // 4. PASSE PARA QUEM ESTÁ EM OVERLAP.
    const colegas = (p.team === 'TeamA') ? Match.players : Match.opponents;
    const advs = (p.team === 'TeamA') ? Match.opponents : Match.players;
    for (const mate of colegas) {
        if (mate === p || !mate.model || !(mate.overlapTimer > 0)) continue;
        if (!corredorLivre(Match.ball.position.x, Match.ball.position.z,
            mate.model.position.x, mate.model.position.z, advs, 1.5, true)) continue;
        aplicarMiraDoPasse(p, PassTypes.LEADING, {
            x: mate.model.position.x,
            z: mate.model.position.z + p.dirZ * 4.0
        });
        p.initiatePass(mate);
        if (typeof MatchStats !== 'undefined' && MatchStats[p.team] &&
            MatchStats[p.team].overlaps !== undefined) MatchStats[p.team].overlaps++;
        return true;
    }

    return false;
}

/*
QUEM NÃO TEM A BOLA — as duas metades que faltam.

`actEsperarDevolucao`: pedi a tabelinha, arranco para o espaço. O alvo é o
ponto que ficou combinado no pedido, e a velocidade é de desmarque.

`actOverlap`: corro por fora de quem tem a bola, pelo corredor do meu lado.
O `overlapTimer` é o que diz a quem tem a bola que eu sou opção (ver o ramo 4
do tratarJogadaCombinada) — e era ele que estava permanentemente a zero desde
que o overlap foi desligado.
*/
/*
UM CENTRAL NAO ARRANCA PARA O ESPACO.

O `podeCorrerNoEspaco` ja filtrava por posicao (`posicaoCorreAoEspaco`: os
defesas so correm se forem laterais), mas a tabelinha e o overlap metiam o
jogador em RUN_INTO_SPACE sem passar por esse filtro. Medido: 15% dos casos em
que um CENTRAL estava a mais de 8 m do slot dele vinham de RUN_INTO_SPACE.
*/
function posicaoPodeArrancar(p) {
    return (typeof posicaoCorreAoEspaco !== 'function') ||
        posicaoCorreAoEspaco(p.role, p.pos);
}

function podeEsperarDevolucao(ctx) {
    const p = ctx.p;
    // Um central nao arranca para o espaco — ver posicaoPodeArrancar.
    if (!posicaoPodeArrancar(p)) return false;
    return !!(p.esperarDevolucao && p.esperarDevolucao.timer > 0 && p !== Match.ballCarrier);
}

function actEsperarDevolucao(ctx) {
    const p = ctx.p;
    const T = JogadasCombinadas.tabelinha;
    p.dynamicTarget.set(p.esperarDevolucao.alvo.x, ALTURA_BASE_Y, p.esperarDevolucao.alvo.z);
    p.speedMult = T.velocidadeArranque;
    /*
    O `runTimer` tem de vir com o estado. O `case RUN_INTO_SPACE` da FSM aborta
    logo à entrada quando ele está a zero — e abortava, todos os frames, porque
    esta folha pedia o estado e nunca lho punha. Ninguém guiava o jogador e a
    velocidade do último frame ficava congelada a integrar: linha recta para
    fora do campo. Vale o que resta do pedido de tabelinha.
    */
    p.runTimer = Math.max(p.runTimer || 0, p.esperarDevolucao.timer);
    // `runTimer > 0` significa "corrida em curso" para o actRunIntoSpace, que
    // a partir daí lê o `runTarget` sem o voltar a criar. Os dois andam juntos.
    p.runTarget = { x: p.dynamicTarget.x, z: p.dynamicTarget.z };
    p.fsm.changeState('RUN_INTO_SPACE');
}

function podeCorrerOverlap(ctx) {
    const p = ctx.p;
    const O = (typeof JogadasCombinadas !== 'undefined') ? JogadasCombinadas.overlap : null;
    if (!O || p.role === 'gk') return false;
    // Idem: quem nao corre ao espaco tambem nao faz overlap.
    if (!posicaoPodeArrancar(p)) return false;

    // Já a correr: mantém-se até o tempo acabar.
    if (p.overlapTimer > 0) return true;

    const portador = Match.ballCarrier;
    if (!portador || portador === p || portador.team !== p.team) return false;
    if (p.model.position.z * p.dirZ < O.avancoMin) return false;

    // Só quem está do MESMO lado e ATRÁS do portador ultrapassa por fora.
    const ladoDele = Math.sign(p.model.position.x) || 1;
    if (Math.sign(portador.model.position.x) !== ladoDele) return false;
    if (p.model.position.z * p.dirZ > portador.model.position.z * p.dirZ) return false;

    // Corredor de fora livre à frente dele.
    const advs = (p.team === 'TeamA') ? Match.opponents : Match.players;
    const alvo = alvoDoOverlap(p, portador, O);
    if (!corredorLivre(p.model.position.x, p.model.position.z, alvo.x, alvo.z,
        advs, 2.5, true)) return false;

    p.overlapTimer = O.duracao;
    return true;
}

// Ponto do overlap: à frente do portador, no corredor lateral do lado dele.
function alvoDoOverlap(p, portador, O) {
    const lado = Math.sign(p.model.position.x) || 1;
    return {
        x: lado * O.larguraDoCorredor,
        z: portador.model.position.z + p.dirZ * O.avancoDaCorrida
    };
}

function actOverlap(ctx) {
    const p = ctx.p;
    const O = JogadasCombinadas.overlap;
    const portador = Match.ballCarrier;
    const alvo = portador && portador.model
        ? alvoDoOverlap(p, portador, O)
        : { x: p.model.position.x, z: p.model.position.z + p.dirZ * O.avancoDaCorrida };

    p.dynamicTarget.set(
        THREE.MathUtils.clamp(alvo.x, -(CAMPO_LARG / 2 - 2), CAMPO_LARG / 2 - 2),
        ALTURA_BASE_Y,
        THREE.MathUtils.clamp(alvo.z, -(CAMPO_COMP / 2 - 2), CAMPO_COMP / 2 - 2));
    p.speedMult = O.velocidade;
    // Ver a nota do runTimer no actEsperarDevolucao: sem ele o RUN_INTO_SPACE
    // aborta à entrada e ninguém guia o jogador.
    p.runTimer = Math.max(p.runTimer || 0, p.overlapTimer || O.duracao);
    p.runTarget = { x: p.dynamicTarget.x, z: p.dynamicTarget.z };
    p.fsm.changeState('RUN_INTO_SPACE');
}

function actPass(ctx) {
    const p = ctx.p;
    if (p.aguardarPassada()) return true;

    /*
    JOGADAS COMBINADAS primeiro — cara a cara, tabelinha, overlap. Ver
    `tratarJogadaCombinada` e o `JogadasCombinadas` (config.js): na nota do
    `PassTypes.escolher` estas jogadas competem com o progresso para a baliza
    e perdem, por isso são um ramo à frente e não um bónus.
    */
    if (tratarJogadaCombinada(ctx)) return;
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
        p.carryHold = 0;
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

    /*
    0. Parar com ela ou recuar com ela. Vem ANTES dos ramos de passe atrasado:
    se ficasse depois nunca corria — o `melhorRecuo` quase sempre existe, e a
    bola saía do pé antes de ele sequer considerar segurá-la.
    */
    if (tratarSegurarBola(ctx)) return;

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
    // O utilizador pediu para não girar 180 graus com marcadores próximos (< 5m).
    // Se houver qualquer adversário a menos de 5m (ou sob pressão), NUNCA gira 180 graus; passa a bola.
    if (escolha && escolha.mate) {
        let adversarioProximo = false;
        const allOpps = (p.team === 'TeamA') ? Match.opponents : Match.players;
        for (const o of allOpps) {
            if (o.role === 'gk') continue;
            if (p.model.position.distanceToSquared(o.model.position) < 25.0) { // 5.0m
                adversarioProximo = true;
                break;
            }
        }

        // Só pode recuar com a bola se tiver espaço limpo em redor (sem marcadores a menos de 5m)
        if (!adversarioProximo && !ctx.underPressure) {
            p.carryRecuo = true;
            p.apoioAtivo = false;
            p.fsm.changeState('CARRY');
            return;
        }

        // Com marcador perto: se existe escolha, passa em vez de girar.
        if (adversarioProximo || ctx.underPressure) {
            p.carryRecuo = false;
            aplicarMiraDoPasse(p, escolha.tipo, escolha.ponto);
            p.initiatePass(escolha.mate);
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

    const mult = typeof getPositionalTendency === 'function' ? getPositionalTendency(p.pos, 'dribble') : 1.0;

    // Se a tendência for menor que 1.0, o jogador pode "desistir" da ideia do drible por mentalidade
    if (mult < 1.0 && Math.random() > mult) return false;

    // Regra 4: Adversário próximo, espaço atrás do adversário, técnica >= 75 - Driblar
    // Jogadores com tendência alta (ex: Pontas) arriscam driblar mesmo com técnica ligeiramente menor
    let baseTec = 75 / Math.max(0.5, mult);
    const tec = p.skillFor ? p.skillFor('TEC') : ctx.skillTec;
    if (tec < baseTec) return false;

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

/*
CONDUZIR — e a velocidade de conduzir, que faltava.

Isto era so o `changeState('CARRY')`, sem tocar no `speedMult`: o portador
ficava com o da folha anterior, e num jogador que acaba de ganhar a bola essa e
sempre uma das rapidas (9.00 m/s do actTackle, 7.88 do sprint do
actRunIntoSpace). Saia a conduzir mais depressa do que qualquer sprint SEM bola
— era o "disparar demais com a bola" que se via.

Os numeros vivem no CarryModel; aqui e so a conta.
*/
function actCarry(ctx) {
    const p = ctx.p;
    const C = (typeof CarryModel !== 'undefined') ? CarryModel : null;

    if (C && typeof C.velocidadeBase === 'number') {
        // Sem skill no ctx assume-se o medio: ha chamadas a esta folha sem ele,
        // e um NaN aqui congela o jogador no sitio.
        const skill = (typeof ctx.skillSpeed === 'number') ? ctx.skillSpeed : 50;
        let vel = C.velocidadeBase + ((skill - 50) / 50) * C.velocidadePorSkill;
        if (p.carryRecuo) vel *= C.recuoMult;
        if (typeof Match !== 'undefined' && Match.counterAttackTeam === p.team) {
            vel *= C.contraAtaqueMult;
        }
        p.speedMult = vel;
    }

    p.fsm.changeState('CARRY');
}

/* =========================================================================
   SEM BOLA
   ========================================================================= */

function actSlideTackle(ctx) {
    const p = ctx.p;
    /*
    O MEDO DO ADVERTIDO: quem tem amarelo nao faz carrinhos. Sem isto o
    segundo amarelo dava ~46% de jogos com expulsao (5,22 cartoes repartidos
    por 22 jogadores, problema do aniversario) quando o real e 8%. Ver
    js/officials.js e o spec das faltas.
    */
    if (typeof Officials !== 'undefined' && !Officials.podeFazerCarrinho(p)) {
        /*
        SÓ com portador: o `actTackle` lê `Match.ballCarrier.model.position`
        sem guarda, enquanto esta folha também corre com a bola solta (usa
        `Match.ball.position` mais abaixo). Mandar para lá um caso sem
        portador atirava TypeError a meio do BT.
        */
        if (Match.ballCarrier) return actTackle(ctx);
        return;
    }
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
    // Sem portador não há a quem desarmar. A guarda existe porque uma
    // excepção aqui rebenta o BT a meio e leva o frame inteiro atrás.
    if (!Match.ballCarrier || !Match.ballCarrier.model) return;
    if (typeof MatchStats !== 'undefined') MatchStats[p.team].desarmes.tentados++;
    p.speedMult = 8.0 * 1.25 * 0.9; // +25% depois -10% pedidos: velocidade máxima SEM bola
    p.dynamicTarget.copy(Match.ballCarrier.model.position);
    p.fsm.changeState('TACKLE');
}

function actChaseBall(ctx) {
    const p = ctx.p;

    /*
    O DESTINATÁRIO DE UM PASSE NÃO É UM PERSEGUIDOR.

    `bb.chaser = Match.intendedReceiver` (team_bt.js): quem tem o passe a
    caminho é quem vai buscá-lo, e faz sentido. O que não fazia sentido era a
    folha: `dynamicTarget = Match.ball.position` manda-o para onde a bola ESTÁ
    NESTE FRAME — e num passe no espaço, no instante em que ela sai, isso é
    atrás dele, em cima do passador.

    Era este o defeito que se via: o companheiro arrancava para o espaço, o
    passe saía, e ele dava meia-volta para ir ao encontro da bola. Medido meio
    segundo depois do passe: 56% dos lançamentos com o destinatário mais longe
    do ponto do que estava (8.9 m -> 10.7 m).

    Como o ramo `IrABola` corre ANTES do ramo `Receber` na árvore, corrigir só
    o `actReceivePass` não chegava — nunca lá chegava. Aqui delega-se: se sou o
    destinatário, a recepção é que sabe para onde ir (ponto do passe se chego a
    tempo, ponto de intercepção se não chego).
    */
    if (typeof Match !== 'undefined' && Match.intendedReceiver === p &&
        Match.lastTouchedPlayer !== p) {
        actReceivePass(ctx);
        return;
    }

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
        const cabeca = preverBolaEmAltura(ALTURA_BASE_Y + ALTURA_TESTA);
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

        /*
        O PONTO DO PASSE GANHA AO PONTO DE INTERCEPÇÃO — quando ele lá chega.

        O `interceptionPoint` (perception.js) é o PRIMEIRO instante da
        trajectória a que este jogador chega. Para uma bola que vem na direcção
        dele, esse ponto está ATRÁS do sítio para onde o passe foi dado: entre
        ele e o passador. Como este ramo o preferia sempre, o destinatário de um
        passe no espaço dava meia-volta e ia BUSCAR a bola em vez de correr para
        o espaço — exactamente o contrário do que o passe pedia.

        Medido num tempo de jogo, meio segundo depois do passe sair: 56% dos
        lançamentos e 60% dos passes no espaço tinham o destinatário MAIS LONGE
        do ponto do que no instante do passe (8.9 m -> 10.7 m nos lançamentos).
        No instante do passe ele ia na direcção certa (28°); era logo a seguir
        que invertia.

        A regra passa a ser uma corrida: se ele chega ao ponto pedido antes da
        bola (mais `folgaTempo`), vai para lá. Só quando não chega é que o
        ponto de intercepção — ir ao encontro dela — é a melhor opção que tem.

        O passe AOS PÉS não muda: aí o ponto está a menos de `distEspaco` dele,
        e ir ao encontro da bola continua a ser o certo.
        */
        const R = (typeof PassModel !== 'undefined') ? PassModel.recepcao : null;
        let alvoDoEspaco = null;
        if (R && Match.passTargetPos && Match.intendedReceiver === p &&
            typeof tempoDoJogadorAte === 'function') {
            const ax = Match.passTargetPos.x, az = Match.passTargetPos.z;
            const dx = ax - p.model.position.x, dz = az - p.model.position.z;
            const dJog = Math.hypot(dx, dz);

            if (dJog > R.distEspaco) {
                const vProj = dJog > 0.001
                    ? (p.velocity.x * dx + p.velocity.z * dz) / dJog : 0;
                const tJog = tempoDoJogadorAte(dJog, vProj, p.speedMult);

                const dBola = Math.hypot(ax - bola.x, az - bola.z);
                const tBola = (typeof tempoRasteiroDaBola === 'function')
                    ? tempoRasteiroDaBola(dBola, Math.hypot(Match.ballVel.x, Match.ballVel.z))
                    : null;

                // `null` = a bola morre antes do ponto; aí ele tem todo o tempo.
                if (tBola === null || tJog <= tBola + R.folgaTempo) {
                    alvoDoEspaco = { x: ax, z: az };
                }
            }
        }

        if (alvoDoEspaco) {
            p.dynamicTarget.set(alvoDoEspaco.x, ALTURA_BASE_Y, alvoDoEspaco.z);
        } else if (bb && bb.interceptionPoint) {
            p.dynamicTarget.set(bb.interceptionPoint.x, ALTURA_BASE_Y, bb.interceptionPoint.z);
        } else if (typeof Match !== 'undefined' && Match.passTargetPos) {
            p.dynamicTarget.set(Match.passTargetPos.x, ALTURA_BASE_Y, Match.passTargetPos.z);
        } else {
            p.dynamicTarget.copy(bola);
        }

        const distAlvo = Math.hypot(p.model.position.x - p.dynamicTarget.x, p.model.position.z - p.dynamicTarget.z);
        const distBola = Math.hypot(p.model.position.x - bola.x, p.model.position.z - bola.z);
        if (distAlvo < 0.8 && distBola > 1.2) {
            p.velocity.set(0, 0, 0);
            p.fsm.changeState('IDLE');
            lookAtBola(p.model, bola);
            return;
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
function posicaoCorreAoEspaco(role, pos) {
    if (role === 'gk') return false;
    if (role !== 'def') {
        if (typeof Tatics !== 'undefined' && (Tatics.estilo === 'defesa' || Tatics.estilo === 'muito_defensiva')) {
            if (pos === 'LM' || pos === 'RM') return false;
        }
        return true;
    }
    if (typeof Tatics !== 'undefined' && (Tatics.estilo === 'defesa' || Tatics.estilo === 'muito_defensiva')) {
        return false;
    }
    return pos === 'LB' || pos === 'RB';
}

/*
QUEM SERVE DE REFERENCIA PARA A CORRIDA.

Normalmente o portador. Mas durante o VOO de um passe nao ha portador nenhum
(`Match.ballCarrier` fica null ate alguem receber) — e e exactamente esse o
instante em que o passador tem de arrancar para receber de volta. Sem isto o
toca-e-recebe era impossivel por construcao: quem passa nunca podia correr.
*/
function referenciaDaBola() {
    if (typeof Match === 'undefined') return null;
    return Match.ballCarrier || Match.intendedReceiver || null;
}

function podeCorrerNoEspaco(ctx) {
    const p = ctx.p;
    if (typeof RunIntoSpaceModel === 'undefined') return false;

    const bb = ctx.bb;
    if (!bb || !bb.isAttacking) {
        p.runTimer = 0;
        p.runCarrier = null;
        return false;
    }

    if ((p.runTimer || 0) > 0) return true;          // ja vai a caminho

    if (!posicaoCorreAoEspaco(p.role, p.pos)) return false;
    if ((p.runCooldown || 0) > 0) return false;

    const referencia = referenciaDaBola();
    if (!referencia || referencia === p || referencia.team !== p.team) return false;

    const R = RunIntoSpaceModel;
    const dist = p.model.position.distanceTo(referencia.model.position);
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
    // A MESMA referencia da condicao (ver referenciaDaBola): se aqui fosse so
    // o portador, quem acabou de passar passava na condicao e nao encontrava
    // destino nenhum, e a corrida morria entre as duas.
    const portador = referenciaDaBola();
    if (!portador || portador === p) return null;

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
            let nota = ganho + Math.min(maisPerto, 8.0);
            
            // "Quando um lateral recebe a bola, um meia pela lateral ou ponta 
            // deve tentar se projetar para receber o lancamento"
            if (portador.pos === 'LB' || portador.pos === 'RB') {
                if (['LW', 'RW', 'LM', 'RM', 'LB', 'RB'].includes(p.pos) && p.playingStyle) {
                    const isOutward = (pos.x >= 0 && dx > 0) || (pos.x <= 0 && dx < 0);
                    const isInward = (pos.x > 0 && dx < 0) || (pos.x < 0 && dx > 0);
                    const isStraight = (dx === 0);
                    
                    if (p.playingStyle === 'prolific_winger' || p.playingStyle === 'cross_specialist') {
                        // Nas costas do lateral oposto (flanco)
                        if (isOutward || isStraight) nota += 8.0;
                    } else if (p.playingStyle === 'hole_player' || p.playingStyle === 'fullback_finisher') {
                        // Nas costas na diagonal pelo meio
                        if (isInward) nota += 8.0;
                    } else if (p.playingStyle === 'roaming_flank') {
                        // Seja nas costas do lateral oposto ou na diagonal pelo meio
                        if (isOutward || isStraight || isInward) nota += 8.0;
                    }
                }
            }

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
        const goalPos = _v1.set(0, 0, ctx.bb.ownGoalZ);
        const ballPos = Match.ball.position;
        const ballToGoal = _v2.subVectors(goalPos, ballPos);
        ballToGoal.y = 0;
        
        if (ballToGoal.lengthSq() > 0.001) {
            ballToGoal.normalize();
        } else {
            ballToGoal.set(0, 0, ctx.bb.dir);
        }
        
        // Fica a uma distância de "cercar" (jockey) da bola na direção do gol
        const jockeyDist = 5.0; // metros
        p.dynamicTarget.copy(ballPos).add(ballToGoal.multiplyScalar(jockeyDist));
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
    /*
    O `trocasMarcacao` do MatchStats estava declarado e exportado desde
    sempre mas NINGUEM o incrementava: o zero que aparecia nos relatorios
    nao era um resultado, era a ausencia de instrumentacao. Aqui e o unico
    sitio onde a marcacao muda de homem.
    */
    if (typeof MatchStats !== 'undefined' && p.markingTarget && p.markingTarget !== homem) {
        MatchStats[p.team].trocasMarcacao++;
    }
    p.markingTarget = homem;

    /*
    O ponto fica na recta homem->propria baliza, a `MarkingModel.distancia`
    dele — o mesmo pontoDeMarcacao E o mesmo tecto da camada posicional: o
    `biasMaxPara` do SETOR onde esta o slot.

    O tecto estava aberto ate ao `raioSetor` (12 m), e isso colava duas coisas
    diferentes no mesmo numero: o raio e de PROCURA — a que distancia do slot
    ainda se considera um homem — e nao de DESLOCACAO. Quem marcava saia ate
    12 m do posto que o TeamBT lhe deu, em qualquer terco, incluindo dentro da
    propria defesa; em campo lia-se como a marcacao a mandar mais do que o
    bloco. Agora fecha na defesa (3 m) e folga no ataque (7 m), que e onde
    perder o homem custa menos do que perder a forma.

    A zona sai do SLOT (`base.z * p.dirZ`) e nao da posicao do homem, para os
    dois passos darem o mesmo tecto ao mesmo jogador no mesmo frame.

    Meio segundo de antecipacao na posicao do homem, como na camada
    posicional — sem isso o marcador anda sempre atras dele.
    */
    const base = p.postoBase || p.model.position;
    const dist = MarkingModel.distanciaPara(homem.model.position.z * p.dirZ);
    const v = homem.velocity;
    const hx = homem.model.position.x + (v ? v.x * 0.5 : 0);
    const hz = homem.model.position.z + (v ? v.z * 0.5 : 0);

    const ponto = pontoDeMarcacao(base.x, base.z, hx, hz,
        p.ownGoalZ, dist, MarkingModel.biasMaxPara(base.z * p.dirZ));

    /*
    NA TRANSICAO DEFENSIVA NAO SE SOBE PARA MARCAR.

    O ponto de marcacao fica do lado da propria baliza EM RELACAO AO HOMEM —
    mas se o homem esta a frente do marcador, o ponto tambem esta, e o que se
    ve nos primeiros segundos depois de perder a bola e meia equipa a SUBIR
    para colar aos seus homens enquanto o adversario sai em contra-ataque.
    Medido: cinco jogadores em MARKING, todos com o alvo 3 a 6 m a frente,
    com a equipa em T.Defensive.

    A camada posicional ja corta isto (ver BlockShape.transicaoDefensivaRecuaSo
    em team_bt.js); a marcacao corre DEPOIS dela e reescrevia o alvo, por isso
    o corte tem de se repetir aqui. Quem vai a bola nao entra nesta guarda: o
    chaser tem de poder ir para a frente.
    */
    let alvoZ = ponto.z;
    const bbM = ctx.bb;
    if (bbM && bbM.state === TeamState.TRANSITION_DEFENSIVE &&
        typeof BlockShape !== 'undefined' && BlockShape.transicaoDefensivaRecuaSo &&
        bbM.chaser !== p && bbM.intercetor !== p && !p.hasBall) {
        const folga = BlockShape.folgaTransicao || 0;
        const meuZDir = p.model.position.z * p.dirZ;
        if (alvoZ * p.dirZ > meuZDir + folga) alvoZ = (meuZDir + folga) * p.dirZ;
    }

    p.dynamicTarget.set(ponto.x, ALTURA_BASE_Y, alvoZ);
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
    const p = ctx.p;

    const mult = typeof getPositionalTendency === 'function' ? getPositionalTendency(p.pos, 'shoot') : 1.0;
    
    // Se a tendência for menor que 1.0 (ex: Zagueiro ou Meia armador), pode preferir não finalizar logo de cara
    if (mult < 1.0 && Math.random() > mult) return false;

    /*
    DENTRO DA GRANDE ÁREA remata-se, e mais nada tem voto.

    O `shootingRange` é uma distância ao CENTRO DA BALIZA e não cobria a área:
    com a skill de ataque a 50 dá 13.0 m no eixo, e a área tem 16.5 m de fundo;
    fora do eixo a `centralidade` ainda o encolhe (a 15 m de X sobram 10.2 m,
    e dali a baliza está a 15.5 m). Medido numa grelha de 20 posições dentro da
    área, rematava-se em **6** — 30%. Da entrada da área, nunca.

    Também não se aplica aqui o corte da camada CHUTE do SpatialGrid: uma
    célula não autorada dentro da própria área é um buraco na grelha, não uma
    decisão táctica.

    O `zoneAhead` fica de fora pela mesma razão — quem está dentro da área do
    adversário está, por definição, à frente no campo.
    */
    const A = ShootingModel.dentroDaArea;
    if (A) {
        const distFundo = Math.abs(p.targetGoalZ - p.model.position.z);
        if (distFundo <= A.profundidade && Math.abs(p.model.position.x) <= A.meiaLargura) {
            return true;
        }
    }

    if (ctx.zoneAhead <= 15) return false;
    _v1.set(0, 0, p.targetGoalZ);
    const dist = p.model.position.distanceTo(_v1);
    const range = p.shootingRange() * mult;
    const maxOffset = ShootingModel.maxOffsetX * mult;
    if (!(dist < range && Math.abs(p.model.position.x) < maxOffset)) return false;

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
/*
APROXIMAR-SE DO BATEDOR NUM LATERAL.

Os companheiros ficavam nos slots do bloco, a vinte e tal metros, e o lateral
saía para ninguém. Os `apoioQuantos` mais próximos do batedor são puxados para
a faixa `apoioMin`..`apoioMax` (ver ThrowInModel).

ESCRITO NO NÍVEL 3 e não no setupSetPiece, de propósito: o nível 2 reescreve o
`dynamicTarget` de toda a gente TODOS os frames, e um alvo posto uma vez no
setup era apagado no frame seguinte sem deixar rasto. A ordem por frame é
1 -> 2 -> 3, portanto quem escreve por último é quem manda.

Só a equipa QUE REPÕE: os adversários têm a sua própria regra (ficam a 2.5 m
da bola, ver setupSetPiece) e puxá-los para aqui era pô-los a infringi-la.
*/
function aproximarNoLateral(p) {
    const T = (typeof ThrowInModel !== 'undefined') ? ThrowInModel : null;
    if (!T || typeof alvoDeApoioNoLateral !== 'function') return;

    const batedor = Match.setPieceTaker;
    if (!batedor || batedor === p || batedor.team !== p.team) return;
    if (p.role === 'gk') return;

    /*
    Os N mais próximos, medidos ao BATEDOR. Recalculado por frame e não
    guardado: os jogadores estão a mover-se, e uma lista fixada no início
    deixava de fora quem entretanto ficou mais perto.
    */
    const meus = (p.team === 'TeamA') ? Match.players : Match.opponents;
    const d = p.model.position.distanceTo(batedor.model.position);
    let maisPertoQueEu = 0;
    for (const outro of meus) {
        if (outro === p || outro === batedor || outro.role === 'gk') continue;
        if (outro.model.position.distanceTo(batedor.model.position) < d) maisPertoQueEu++;
    }
    if (maisPertoQueEu >= T.apoioQuantos) return;

    const alvo = alvoDeApoioNoLateral(
        p.model.position.x, p.model.position.z,
        batedor.model.position.x, batedor.model.position.z,
        T.apoioMin, T.apoioMax);
    p.dynamicTarget.set(alvo.x, ALTURA_BASE_Y, alvo.z);
}

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
    } else if (Match.state === 'FREE_KICK' || Match.state === 'PENALTY') {
        /*
        Posições impostas pelo setupSetPiece (barreira, meia-lua): ninguém
        decide nada até a bola sair.

        EXCEPÇÃO: o batedor a meio do gesto. A falta e o penálti passaram a ter
        corrida (um `ActionState` que só joga a bola no `contactTime`), e o
        `changeState` limpa o `actionState` — mandá-lo para SET_PIECE_WAIT aqui
        apagava o gesto e a bola nunca era batida.
        */
        if (p === Match.setPieceTaker && p.actionState) return;
        if (s !== 'SET_PIECE_WAIT') fsm.changeState('SET_PIECE_WAIT');
    } else if (Match.state === 'THROW_IN') {
        // O batedor está em LATERAL (pose + gesto) e não passa por aqui.
        if (s !== 'LATERAL' && s !== 'MOVE_TO_POS') {
            fsm.changeState('MOVE_TO_POS');
        }
        aproximarNoLateral(p);
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

    /*
    Quando o GR segura a bola nas mãos, o relançamento é tratado pelo estado
    'segurando' do updateGK (lançamento com as mãos ou chutão). O BT aqui
    limita-se a escolher o destinatário e deixar a mecânica do gesto fazer o
    trabalho; chamar actPassParaAlvo/puntBall faria o passe sair do pé ou
    disparava o chutão fora do timing do 'segurando'.
    */
    if (p.gkEstado === 'segurando') {
        if (saida === 'laterais') {
            const lateral = acharLateralParaSaida(ctx);
            if (lateral) {
                p.gkThrowTarget = lateral;
                return;
            }
            // Sem lateral livre: desiste da saída curta e cai no chutão.
            p.gkSaida = 'chuteFrente';
        }
        // No 'segurando' o próprio updateGK dispara o relançamento quando
        // chegar a hora; não se chama puntBall aqui.
        return;
    }

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
            /*
            SAÍDA DE JOGO: quem recebe a primeira bola toca para trás.

            Está ACIMA do `Dominar` de propósito. Estava abaixo, e o `Dominar`
            executa `actCarry` durante a cadência inteira de decisão (até ~3 s
            no CadenceModel.posseBase): o receptor dominava e saía a conduzir
            para a frente, e quando este ramo finalmente ganhava já ia no
            meio-campo. É o contrário de sair a jogar de trás — que é o que se
            quer poder ver.

            Continua ABAIXO do `RecuperarControlo`: com a bola fugida do pé não
            se passa a ninguém, vai-se buscá-la primeiro.

            A bandeira apaga-se aqui, no acto, e não na condição — uma condição
            que muda o mundo dispara na avaliação de um ramo que pode nem ser o
            escolhido.
            */
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
                    /*
                    De primeira: a bola nem chegou a ser dominada (ver
                    FirstTouchModel e o `resolveBallContact`). Esperar aqui era
                    exactamente o contrário do que a jogada é.
                    */
                    if (ctx.p.jogarDePrimeira) return false;
                    let settling = ctx.underPressure ? CadenceModel.posseSobPressao : CadenceModel.posseBase;
                    settling *= 1.0 - (ctx.skillTec / 100) * 0.25;
                    const naDefesa = (ctx.p.model.position.z * ctx.p.dirZ < 0) || ctx.p.role === 'def';
                    if (naDefesa) {
                        settling = Math.min(settling, ctx.underPressure ? 0.25 : 0.5);
                    }
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
                    let mult = estiloAtivoDe(ctx.p).cruzar;
                    if (typeof getPositionalTendency === 'function') {
                        mult *= getPositionalTendency(ctx.p.pos, 'cross');
                    }
                    return Math.random() < Math.min(CrossModel.chanceMax, ctx.cross.chance * mult);
                }),
                act('cruzar', actCross)
            ),

            // 3. Conduzir em espaço aberto (+150 pontos se sem marcação a 10m em 20 graus)
            seq('ConduzirEmEspaco',
                cond('campoAberto', (ctx) => {
                    const p = ctx.p;
                    if (p.role === 'gk') return false;

                    /*
                    O PASSE VEM PRIMEIRO — ver CarryModel.conduzirSoAcimaDe.

                    Este ramo estava ACIMA do ProcurarPasse e o fallback da
                    arvore e conduzir: conduzir era a opcao por omissao e
                    passar a excepcao. Medido num lote: 7309 conducoes contra
                    5604 passes, quase um para um, quando o futebol e varias
                    vezes mais passes do que corridas.

                    Agora, HAVENDO PASSE BOM, so se conduz a partir do ultimo
                    terco — que e onde conduzir decide alguma coisa. Fora dai
                    passa-se, e a conducao fica para quem nao tem a quem dar.

                    Sem passe disponivel isto nao faz nada: o `haPasse` da
                    falso e o ramo segue como sempre.
                    */
                    const limite = (typeof CarryModel.conduzirSoAcimaDe === 'number')
                        ? CarryModel.conduzirSoAcimaDe : -Infinity;
                    if (ctx.zoneAhead < limite) {
                        const passe = findBestPassAnywhere(ctx);
                        if (passe) {
                            // Guardado para o ProcurarPasse nao repetir a busca
                            // no mesmo frame: e a parte cara desta decisao.
                            ctx.currentPassChoice = passe;
                            return false;
                        }
                    }

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
                    /*
                    Reaproveita a escolha que o ConduzirEmEspaco ja fez neste
                    frame, se a fez: `findBestPassAnywhere` percorre todos os
                    companheiros e todas as linhas, e corre-lo duas vezes no
                    mesmo frame e o dobro do custo pela mesma resposta.
                    */
                    const passChoice = ctx.currentPassChoice || findBestPassAnywhere(ctx);
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
                    let timeThreshold = 1.2;
                    let isUnderPressure = ctx.underPressure;
                    
                    if (typeof getPositionalTendency === 'function') {
                        const tendMult = getPositionalTendency(ctx.p.pos, 'clearance');
                        timeThreshold /= Math.max(0.5, tendMult);
                        
                        // Zagueiros (tendência > 1.0) dão chutão sem pestanejar se pressionados
                        // Atacantes (tendência < 1.0) hesitam em dar chutão e podem tentar segurar a bola
                        if (isUnderPressure && tendMult < 1.0 && Math.random() > tendMult) {
                            isUnderPressure = false; // hesita
                        }
                    }
                    return isUnderPressure || ctx.p.decisionTimer > timeThreshold;
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
                    let carrierFwd = _v1;
                    if (carrier.velocity && carrier.velocity.lengthSq() > 0.1) {
                        carrierFwd.copy(carrier.velocity).normalize();
                    } else {
                        carrierFwd.set(0, 0, 1).applyQuaternion(carrier.model.quaternion);
                    }
                    const toDefender = _v2.subVectors(ctx.p.model.position, carrier.model.position);
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

            /*
            Pedi a tabelinha: arranco para o espaço combinado. Antes do
            `Receber` porque quem pede a tabelinha NÃO é o destinatário do
            passe — o parceiro é —, e o movimento tem de acontecer enquanto a
            bola vai e volta.
            */
            seq('EsperarDevolucao',
                cond('pediTabelinha', podeEsperarDevolucao),
                act('arrancar', actEsperarDevolucao)
            ),

            // Ultrapassar por fora quem tem a bola.
            seq('Overlap',
                cond('vouPorFora', podeCorrerOverlap),
                act('overlap', actOverlap)
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
            /* ============================================================
               A DEFENDER — os ramos que so existem sem a posse
               ============================================================
               A guarda da FASE vive aqui em cima, uma vez, em vez de estar
               repetida dentro de cada folha. Ler esta lista responde a "o que
               e importante quando nao temos a bola?" sem ter de abrir as
               condicoes uma a uma.

               Os ramos de BOLA (desarme, intercepcao, perseguicao, recepcao) e
               o guarda-redes ficam ACIMA e fora das duas fases, de proposito:
               valem nas duas. Uma bola solta persegue-se com posse nominal ou
               sem ela, e o guarda-redes posiciona-se sempre.
               ============================================================ */
            seq('SemBolaDefendendo',
                cond('equipaSemPosse', (ctx) => !ctx.bb || !ctx.bb.isAttacking),

                sel('DecisaoDefendendo',
                    /*
                    Marcacao por zona. Vem depois de tudo o que e bola e ANTES
                    das folhas de posicionamento: quem tem um homem no sector
                    acompanha-o em vez de ir ocupar um ponto no mapa.
                    */
                    seq('Marcar',
                        cond('temHomemNoSector', podeMarcar),
                        act('marcar', actMarcar)
                    )
                )
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
                    // Se o jogador é o destinatário ou pode disputar no ar, liberta o alvo fixo
                    if (Match.intendedReceiver === p || (Match.ball && Match.ball.position.y > 0.6)) {
                        p.setPieceTarget = null;
                        return false;
                    }
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
                    p.speedMult = (6.0 + ((ctx.skillSpeed - 50) / 50) * 1.5) * 1.15;
                    p.fsm.changeState('MOVE_TO_POS');
                })
            ),

            /*
            Apoio de circulacao antes da corrida ao espaco: oferecer-se a
            distancia de passe serve a jogada seguinte; atacar o espaco serve
            a jogada depois dessa. Sem opcao de passe agora, nao ha jogada
            depois dessa.
            */
            /* ============================================================
               A ATACAR SEM A BOLA — o movimento que faz a jogada existir
               ============================================================
               Mesma razao da lista de cima: a fase num sitio so. E estes tres
               nunca competem com a marcacao nem com o desarme — sao de
               momentos diferentes do jogo, e ate hoje estavam intercalados
               com eles numa lista de onze, onde `CorrerNoEspaco` aparecia
               ABAIXO de `Marcar` sem que isso quisesse dizer nada.
               ============================================================ */
            seq('SemBolaAtacando',
                cond('equipaComPosse', (ctx) => !!(ctx.bb && ctx.bb.isAttacking)),

                sel('DecisaoAtacando',
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
                )
                )
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

/*
=============================================================================
MARCAR NO CANTO — e o duelo aéreo
=============================================================================
Enquanto o canto está vivo (`Match.cantoVivo`, posto no instante da batida e
limpo no Match.update), quem tem um homem atribuído no setup fica com ele. Sem
isto o bloco retomava o comando na batida e, como o bloco segue a bola — que
está na bandeirola —, os defensores saíam da própria área com o cruzamento
ainda no ar.

Dois modos, e é a distinção entre eles que faz a disputa aérea existir:

  COLADO AO HOMEM: fica `distanciaAoHomem` metros dele, do lado da BALIZA, que
  é onde o marcador tem de estar para lhe ganhar o corpo.

  À BOLA: quando a bola vem alta e já está dentro do `raioContestacao`, larga a
  colagem e vai ao ponto onde ela vai estar. É este o passo que faltava: o
  marcador ficava agarrado ao homem, o atacante saltava sozinho, e a "disputa"
  do executeHeader resolvia-se com um adversário que estava a ver. Agora os
  dois vão ao mesmo ponto, e o gatilho do salto (avaliarSaltoDeCabeceio) dispara
  para ambos — dois corpos no ar, e o duelo a decidir qual deles cabeceia.

Devolve `true` quando tomou conta do jogador, para o resto da árvore não lhe
reescrever o alvo a seguir.
*/
function tratarMarcacaoNoCanto(p) {
    if (typeof Match === 'undefined' || !Match.cantoVivo) return false;
    if (!p.marcaNoCanto || !p.marcaNoCanto.model) return false;
    if (p.role === 'gk' || p.hasBall) return false;
    if (typeof CornerDefenseModel === 'undefined') return false;

    const C = CornerDefenseModel;
    const homem = p.marcaNoCanto.model.position;
    const bola = Match.ball.position;

    /*
    Bola alta e perto: vai à BOLA, não ao homem. `preverBolaEm` dá o ponto de
    encontro; sem previsão ele corria para onde a bola ESTÁ e chegava atrasado
    ao sítio onde ela vai estar.
    */
    const dBola = Math.hypot(bola.x - p.model.position.x, bola.z - p.model.position.z);
    if (bola.y > C.alturaContestacao && dBola < C.raioContestacao) {
        let alvoX = bola.x, alvoZ = bola.z;
        if (typeof preverBolaEm === 'function') {
            const S = (typeof SaltoCabeceio !== 'undefined') ? SaltoCabeceio : { duracao: 0.62 };
            const prev = preverBolaEm(S.duracao * 0.5);
            if (prev) { alvoX = prev.x; alvoZ = prev.z; }
        }
        p.dynamicTarget.set(alvoX, ALTURA_BASE_Y, alvoZ);
        p.speedMult = p.sprintSpeed || p.speedMult;
        p.fsm.changeState('MOVE_TO_POS');
        return true;
    }

    /*
    Colado ao homem, do lado da baliza QUE ELE DEFENDE. `p.dirZ` é a direcção
    de ataque deste jogador, portanto a baliza dele está no sentido oposto.
    */
    const linhaDefendida = -p.dirZ * (CAMPO_COMP / 2);
    let dx = 0, dz = linhaDefendida - homem.z;
    const d = Math.hypot(dx, dz) || 1;
    p.dynamicTarget.set(
        homem.x + (dx / d) * C.distanciaAoHomem,
        ALTURA_BASE_Y,
        homem.z + (dz / d) * C.distanciaAoHomem);
    p.markingTarget = p.marcaNoCanto;
    p.fsm.changeState('MARKING');
    return true;
}

/* --- Ponto de entrada --------------------------------------------------- */

const PlayerAI = {
    tick: function (player, dt) {
        const s = player.fsm ? player.fsm.currentState : "";
        const bbAlvo = (typeof TeamAI !== 'undefined') ? TeamAI.get(player.team) : null;

        /*
        O ALVO E RESOLVIDO UMA VEZ, NO FIM — ver js/bt/alvo.js.

        Mesmo quando a arvore nao corre (gesto em curso, passe, remate), as
        propostas da camada posicional deste frame tem de ser resolvidas: sem
        isso o `dynamicTarget` ficava congelado no valor do frame anterior
        durante todo o gesto.
        */
        const fechar = () => {
            if (typeof resolverAlvo === 'function') resolverAlvo(player, bbAlvo);
        };

        // LATERAL entra na lista: é um gesto com duração própria (ThrowInClip),
        // e deixar o BT decidir por cima dele tirava-lhe a bola das mãos a meio.
        if (player.actionState || s === "PASS" || s === "SHOOT" || s === "CROSS" || s === "TACKLE" || s === "SLIDE_TACKLE" || s === "CHEST_CONTROL" || s === "LATERAL") { fechar(); return; }

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
        MARCAÇÃO NO CANTO, antes de tudo o resto: enquanto o lance está vivo a
        marcação individual do canto tem prioridade sobre o bloco e sobre os
        estilos. Ver tratarMarcacaoNoCanto.
        */
        if (tratarMarcacaoNoCanto(player)) { fechar(); return; }

        /*
        1. BT do Playing Style — só na FASE DE ATAQUE da equipa.

        Os estilos são identidade COM bola: cortar para dentro, atacar a
        área, segurar a bola de costas. A defender, quem manda é a forma
        colectiva (bloco do TeamBT + marcação do PositionBT); um estilo a
        puxar o jogador para a sua zona preferida enquanto a equipa defende
        é exactamente o que abre buracos no bloco.
        */
        const bbEquipa = bbAlvo;
        const emAtaque = !!(bbEquipa && bbEquipa.isAttacking);

        /*
        O QUE A ARVORE ESCREVER NESTE FRAME VIRA UMA PROPOSTA.

        As folhas continuam a escrever no `dynamicTarget` — sao dezenas e
        migra-las uma a uma seria outro trabalho. Guarda-se o alvo ANTES de
        elas correrem; se mudarem alguma coisa, essa mudanca entra como
        proposta, com a prioridade da TAREFA e nao da folha:

            tarefa de bola (portador, chaser, intercetor, receptor)  -> BOLA
            tudo o resto (estilos, corridas, apoios, marcacao)        -> ACCAO

        E por isso que um apoio deixa de furar o rest defense e o fora-de-jogo,
        e um chaser continua a poder ir aonde tem de ir.
        */
        const alvoAntes = {
            x: player.dynamicTarget.x,
            z: player.dynamicTarget.z
        };

        /*
        QUEM TEM A BOLA CHEGA SEMPRE AO PlayerBT.

        Estas duas árvores correm primeiro e, devolvendo SUCCESS, cortavam o
        PlayerBT — que é onde vive o ramo `ComBola`. Um estilo que ACTIVA e não
        faz nada deixava o portador a "posicionar-se" com a bola nos pés, para
        sempre: medido, um CB em MOVE_TO_POS com `hasBall: true` e o
        `decisionTimer` em 662 SEGUNDOS, e o jogo inteiro parado à volta dele.

        O estilo era o `extra_frontman`, que o próprio relatório de calibração
        marca `semEfeito: true` — activa 1067 vezes e não desloca nada. Mas o
        problema não é esse estilo: é qualquer folha destas duas árvores poder
        engolir a decisão de quem tem a bola, e o número de folhas só cresce.

        Continuam a correr — precisam de escrever alvos e são a identidade do
        jogador. O que deixam de poder fazer é IMPEDIR a decisão com bola.
        */
        const comBola = !!player.hasBall || (player.carryTouchGrace || 0) > 0;

        /*
        O que a arvore escreve entra como proposta (ver `alvoAntes`); a
        prioridade sai da TAREFA. Fica numa funcao para os tres pontos de
        saida da arvore a usarem.
        */
        const proporOQueAArvoreEscreveu = () => {
            if (typeof proporAlvo !== 'function') return;
            /*
            NAO CHEGA VER SE O ALVO MUDOU.

            Um chaser que ja vai a caminho escreve o MESMO alvo que escreveu no
            frame anterior — e o frame anterior ja o tinha resolvido para o
            `dynamicTarget`. Sem proposta, a estrutura ganhava e puxava-o de
            volta ao slot: medido, o jogo parava (9 passes em 15 minutos de
            fisica, contra ~210).

            Por isso a evidencia de que a arvore quer o alvo dela e o ESTADO:
            `MOVE_TO_POS` e `IDLE` sao os estados sem tarefa, tudo o resto e
            uma accao em curso.
            */
            const est = player.fsm ? player.fsm.currentState : '';
            const semTarefa = (est === 'MOVE_TO_POS' || est === 'IDLE' || est === '');
            const mudou = Math.abs(player.dynamicTarget.x - alvoAntes.x) > 0.001 ||
                Math.abs(player.dynamicTarget.z - alvoAntes.z) > 0.001;

            /*
            E QUEM VAI A BOLA PROPOE SEMPRE, mude ou nao mude o alvo.

            O chaser vai a bola no estado MOVE_TO_POS — o estado nao distingue
            "vou buscar a bola" de "estou a ocupar posicao", e o alvo dele nao
            muda de frame para frame porque a bola esta parada. Sem esta linha
            ele nao propunha nada, a estrutura ganhava, e ninguem ia a bola:
            medido, 17 passes em 8 minutos de fisica contra 100 com o
            resolvedor desligado.
            */
            const tarefaDeBola = (typeof temTarefaDeBola === 'function') &&
                temTarefaDeBola(player, bbEquipa);
            if (!mudou && semTarefa && !tarefaDeBola) return;
            const prio = tarefaDeBola ? AlvoPrio.BOLA : AlvoPrio.ACCAO;
            proporAlvo(player, prio, player.dynamicTarget.x, player.dynamicTarget.z,
                'arvore:' + (player.fsm ? player.fsm.currentState : '?'));
        };

        // No tiro de meta, os jogadores de campo seguem somente o TeamBT (BolaParada)
        if (typeof Match !== 'undefined' && Match.state === 'GOAL_KICK' && player !== Match.setPieceTaker) {
            PlayerBT.tick(ctx);
            fechar();
            return;
        }

        if (emAtaque && player.playingStyle && player.styleAtivo && PlayingStyleBTs[player.playingStyle]) {
            const res = PlayingStyleBTs[player.playingStyle].tick(ctx);
            if (res === SUCCESS && !comBola) { proporOQueAArvoreEscreveu(); fechar(); return; }
        }

        // 2. Prioridade: BT específico da Posição (se registado)
        if (player.pos && PositionBTs[player.pos]) {
            const res = PositionBTs[player.pos].tick(ctx);
            if (res === SUCCESS && !comBola) { proporOQueAArvoreEscreveu(); fechar(); return; }
        }

        // 3. BT Base Unificado
        PlayerBT.tick(ctx);

        // 4. As propostas do frame resolvem-se aqui, e so aqui.
        proporOQueAArvoreEscreveu();
        fechar();
    }
};
