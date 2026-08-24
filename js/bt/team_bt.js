/*
=============================================================================
NÍVEL 1 — TEAM BEHAVIOR TREE
=============================================================================
Corre uma vez por equipa por frame, ANTES de qualquer jogador decidir.
Não mexe em nenhum jogador individualmente: produz o *plano colectivo* num
blackboard (TeamBlackboard) que o nível 2 (PositionBT) consome.

O que sai daqui:
    posture            a intenção colectiva (ver TeamPosture)
    pushMultiplier     quanto a equipa sobe no campo quando ataca
    advanceFactor      0..1, quão avançada está a manobra ofensiva
    chaser             quem vai à bola
    flankAlert         'left' | 'right' | null — flanco em perigo
    markingTarget/isCovering  escritos nos jogadores (marcação é decisão colectiva)

Nada aqui deve saber desenhar, animar ou mover — só decidir.
=============================================================================
*/

const TeamState = {
    OFFENSIVE: 'Offensive',
    DEFENSIVE: 'Defensive',
    TRANSITION_OFFENSIVE: 'T.Offensive',
    TRANSITION_DEFENSIVE: 'T.Defensive'
};
window.TeamState = TeamState;

/* --- Vocabulário de posturas -------------------------------------------- */

const TeamPosture = {
    SET_PIECE: 'SET_PIECE',              // bola parada, o plano normal está suspenso
    BUILD_UP: 'BUILD_UP',                // posse acabada de ganhar, a construir
    ATTACK_SUSTAINED: 'ATTACK_SUSTAINED',// posse prolongada, equipa instalada
    FINAL_THIRD: 'FINAL_THIRD',          // bola no último terço adversário
    COUNTER: 'COUNTER',                  // transição rápida após recuperação
    HIGH_PRESS: 'HIGH_PRESS',            // pressão no meio-campo adversário
    MID_BLOCK: 'MID_BLOCK',              // bloco a meio campo
    LOW_BLOCK: 'LOW_BLOCK',              // bloco baixo, defesa do último terço
    FLANK_SHIFT: 'FLANK_SHIFT'           // basculação para um flanco em perigo
};

/*
A POSTURA JA NAO MEXE NO BLOCO.

Havia um TeamPostureTuning com um deslocamento em Z por postura (COUNTER +10,
BUILD_UP/ATTACK_SUSTAINED/FINAL_THIRD +5, MID_BLOCK -3, LOW_BLOCK -6). A
postura nao e um ajuste do painel: e um estado que a arvore deduz do jogo. O
bloco responde aos ajustes que existem e mais nada -

    Formacao          FormationsData
    Mentalidade       MentalidadeModel.blocoZ (centro do bloco e tecto da linha)
    Estilo            TeamPlayStyles (nao mexe no bloco: pesa nas decisoes)
    Linha Defensiva   TeamShape.linhaDefensiva (tecto da traseira)
    Width Compactness BlockShape.amplitude
    Length Compactness BlockShape.profundidade
    Defensive Pressure MarkingModel.distanciaPorPressao (a que distância se
                       acompanha o homem; o tecto do bloco passou para a
                       Mentalidade, MentalidadeModel.tectoBloco)
    Setores           Tatics.setores

A postura continua a existir e a aparecer no HUD (ver main.js); so deixou de
deslocar o rectangulo.
*/

/* --- Blackboard --------------------------------------------------------- */

class TeamBlackboard {
    constructor(team) {
        this.team = team;
        this.own = [];
        this.opp = [];
        this.outfield = [];

        this.dir = (team === 'TeamA') ? 1 : -1;
        this.ownGoalZ = ownGoalZCenter(team);
        this.atkGoalZ = -this.ownGoalZ;

        this.posture = TeamPosture.MID_BLOCK;
        this.isAttacking = false;
        this.isCounter = false;
        this.phase = 1;

        this.pushMultiplier = 1.0;
        this.advanceFactor = 0.0;

        this.chaser = null;
        this.blocker = null;
        this.intercetor = null;   // quem vai cortar a bola solta (pickIntercetor)
        this.carrier = null;      // portador da bola desta equipa
        this.oppCarrier = null;   // portador adversário
        this.flankAlert = null;

        this.ballX = 0;
        this.ballZ = 0;

        /*
        Sistema tático coletivo (ver MentalidadeModel/TeamPlayStyles em
        config.js) — persistem entre frames de propósito, este objecto não é
        recriado a cada tick (ver TeamAI.get). `momentumX` suaviza-se aqui;
        `congestion`/`aggression` são recalculados do zero a cada gather().
        */
        this.momentumX = 0;                          // -1 (esq) .. +1 (dir), suavizado
        // Posição longitudinal da bola, suavizada — o centro do bloco em Z.
        // Não confundir com momentumX, que é o LADO do campo (ver
        // updateMomentum e seguirBolaZ em utils.js).
        this.bolaZSuave = 0;
        this.bolaXSuave = 0;
        this.maisRecuadoDirSuaveA = null;  // adversário mais recuado suavizado (TeamA)
        this.maisRecuadoDirSuaveB = null;  // adversário mais recuado suavizado (TeamB)
        this.congestion = { esq: 0, centro: 0, dir: 0 };
        this.aggression = 0.5;                        // 0..1, ver computeAggression

        this.trace = [];
    }

    // Recolhe o contexto cru do Match. Sem decisões — só factos.
    gather(match) {
        this.own = (this.team === 'TeamA') ? match.players : match.opponents;
        this.opp = (this.team === 'TeamA') ? match.opponents : match.players;
        this.outfield = this.own.filter(p => p.role !== 'gk');

        this.ballX = match.ball.position.x;
        this.ballZ = match.ball.position.z;

        const carrier = match.ballCarrier;
        this.carrier = (carrier && carrier.team === this.team) ? carrier : null;
        this.oppCarrier = (carrier && carrier.team !== this.team) ? carrier : null;

        this.isAttacking = (match.possessionTeam === this.team);
        this.isCounter = (match.counterAttackTeam === this.team);
        
        const gkHoldingBall = typeof Match !== 'undefined' && Match.gkHoldingBall && Match.gkHoldingBall[this.team];
        const isGoalKick = typeof Match !== 'undefined' && Match.state === 'GOAL_KICK' && Match.setPieceTaker && Match.setPieceTaker.team === this.team;

        if (this.isAttacking !== this.wasAttacking) {
            this.possessionTime = 0;
            this.wasAttacking = this.isAttacking;
        } else {
            if (!gkHoldingBall && !isGoalKick) {
                this.possessionTime = (this.possessionTime || 0) + (match.delta || 0.016);
            }
        }

        if (this.isAttacking) {
            this.state = (this.possessionTime < 3) ? TeamState.TRANSITION_OFFENSIVE : TeamState.OFFENSIVE;
        } else {
            this.state = (this.possessionTime < 3) ? TeamState.TRANSITION_DEFENSIVE : TeamState.DEFENSIVE;
        }

        // Vãos já escolhidos por colegas neste frame (Fox in the Box/Goal
        // Poacher) — ver melhorVaoX em position_bt.js. Limpa aqui, antes do
        // nível 2 correr jogador a jogador.
        this.vaosReivindicados = [];

        /*
        Histerese de zona morta para o alerta de flanco: guarda o valor deste
        frame antes de o limpar, para detectFlankThreat decidir com memória
        do frame anterior (entra a um limiar, só sai a um limiar maior). Sem
        isto o alerta ligava/desligava a cada frame perto da fronteira, e com
        ele a postura FLANK_SHIFT e os alvos que dependem dela.
        */
        this.prevFlankAlert = this.flankAlert;

        // Limpo aqui e não só em detectFlankThreat: esse nó só corre no ramo
        // defensivo, e um alerta antigo não pode sobreviver a uma recuperação.
        this.flankAlert = null;

        updateMomentum(this, match.delta || 0.016);
        this.congestion = computeCongestion(this);
        this.aggression = computeAggression(this);

        this.trace.length = 0;
    }
}

/*
=============================================================================
MOMENTUM, CONGESTÃO E AGRESSIVIDADE — ver config.js (MentalidadeModel,
TeamPlayStyles) para o catálogo de pesos que estas funções consultam.
=============================================================================
*/

/*
MOMENTUM é o LADO do campo onde o jogo está a acontecer: eixo X, a largura,
os sectores Left/Right/Center. É isto e só isto.

Suavizado porque uma troca lateral isolada não é momentum — um passe para o
outro lado não vira o jogo sozinho, precisa de insistir.

O `bolaZSuave`, mais abaixo, é outra coisa e por isso mudou de nome: a posição
LONGITUDINAL da bola, que dá o centro do bloco. Chamava-se `momentumZ` e, por
causa do nome, tinha constantes de tempo de momentum — 2.5 s a defender, 4.0 s
com a bola a recuar. Um seguimento com 2.5 s de constante fica ~25 m atrás de
uma bola a 10 m/s, e era isso que punha os dois rectângulos do TeamBT atrás da
jogada em vez de sobre ela.
*/
function updateMomentum(bb, dt) {
    const alvoX = THREE.MathUtils.clamp(bb.ballX / (CAMPO_LARG / 2), -1, 1);
    const kX = 1 - Math.exp(-0.8 * dt);
    bb.momentumX += (alvoX - bb.momentumX) * kX;

    /*
    Seguimento longitudinal: a bola, e mais nada.

    Os offsets de estado saíram daqui. Estavam nos DOIS sítios — este somava
    +10 m em TRANSITION_OFFENSIVE ao alvo do seguimento e o computeBlock
    somava outros +10 ao centro, o que dava 20 m de avanço numa transição em
    vez dos 10 pedidos (e -10 em vez de -7 na defensiva, misturado com o -3
    daqui). O offset de estado é decisão de POSTURA e pertence ao computeBlock,
    onde vive o resto da forma do bloco; aqui só se segue a bola.
    */
    const reposta = (typeof Match !== 'undefined' && Match.state !== 'PLAY');
    bb.bolaZSuave = seguirBola(bb.bolaZSuave, bb.ballZ, BlockShape.seguimentoBola, dt, reposta);
    bb.bolaXSuave = seguirBola(bb.bolaXSuave, bb.ballX, BlockShape.seguimentoBola, dt, reposta);
}

// Congestão por banda lateral (esq/centro/dir, mesmo corte de
// Tatics.getWeightedSectorX): adversários de campo perto da bola em Z,
// contados por banda de X, normalizado 0-100. Só o que está PERTO da jogada
// conta — um zagueiro adversário parado no próprio último terço não torna o
// lado congestionado se a bola está no meio-campo.
function computeCongestion(bb) {
    const bandas = { esq: 0, centro: 0, dir: 0 };
    for (const o of bb.opp) {
        if (o.role === 'gk') continue;
        if (Math.abs(o.model.position.z - bb.ballZ) > 22) continue;
        const x = o.model.position.x;
        const banda = x < -10 ? 'esq' : (x > 10 ? 'dir' : 'centro');
        bandas[banda]++;
    }
    // ~4 adversários numa banda já é "cheio" (100) — 11 jogadores por
    // equipa, 3 bandas, densidade média ~3-4 por banda quando o bloco está
    // todo daquele lado.
    return {
        esq: Math.min(100, bandas.esq * 25),
        centro: Math.min(100, bandas.centro * 25),
        dir: Math.min(100, bandas.dir * 25)
    };
}

// Agressividade dinâmica: Mentalidade dá a base, TeamPlayStyle e o espaço no
// lado ONDE A BOLA ESTÁ modulam por cima. Não é fixa — equipa Ofensiva
// contra bloco compacto do lado da bola arrisca menos, sem o utilizador
// mexer em nada (ver docs/tacticSystem.md secção 9).
function computeAggression(bb) {
    const base = (typeof MentalidadeModel !== 'undefined' && MentalidadeModel[Tatics.estilo])
        ? MentalidadeModel[Tatics.estilo].agressao : 0.5;
    const ladoBola = bb.ballX < -10 ? 'esq' : (bb.ballX > 10 ? 'dir' : 'centro');
    const congestaoLado = bb.congestion[ladoBola] / 100;
    // Congestão 0 não mexe; congestão 100 corta a agressividade a 40% da base.
    return THREE.MathUtils.clamp(base * (1 - congestaoLado * 0.6), 0, 1);
}

/* --- Acções do nível de equipa ------------------------------------------ */

/*
Quem persegue a bola: o jogador de campo mais próximo. É decisão colectiva
(só um vai) e não individual, por isso vive aqui.

Histerese por "top-3": recalcular o argmax do zero todos os frames faz o
chaser alternar entre dois jogadores com pontuações quase empatadas — um
salta para a bola, o outro para trás, o alvo de posicionamento de ambos
salta com eles. Em vez disso, quem já é chaser só perde o papel se cair
para fora das 3 melhores opções deste frame.
*/
/*
O blocker é o único jogador da equipe focado em interceptar a linha da bola 
para o centro do gol defendido, movendo-se perpendicularmente a essa linha.
*/
function pickBlocker(bb) {
    if (bb.isAttacking) { bb.blocker = null; return; }
    
    // Tem que haver um portador da bola adversário
    const carrier = bb.oppCarrier;
    if (!carrier) { bb.blocker = null; return; }
    
    const ballPos = Match.ball.position;
    // O blocker só é ativado se a bola estiver no campo de defesa
    if (ballPos.z * bb.dir >= 0) { bb.blocker = null; return; }
    
    let bestScore = Infinity;
    let bestBlocker = null;
    
    for (const p of bb.own) {
        if (!p || p.role === 'gk') continue;
        
        // A distância do jogador para o carrier
        const distPlayerToCarrier = p.model.position.distanceTo(carrier.model.position);
        
        // Se o carry estiver muito longe do posto do jogador, penaliza
        let distPostToCarrier = 0;
        if (p.baseTarget) {
            distPostToCarrier = p.baseTarget.distanceTo(carrier.model.position);
        } else {
            distPostToCarrier = distPlayerToCarrier; // Fallback
        }
        
        // O jogador cujo POSTO está mais próximo da bola ganha (não abandona o posto totalmente).
        // Se o carry sair da zona (posto), o distPostToCarrier aumenta e outro jogador assume.
        const score = distPlayerToCarrier + (distPostToCarrier * 1.5);
        
        if (score < bestScore) {
            bestScore = score;
            bestBlocker = p;
        }
    }

    bb.blocker = bestBlocker;
}

function pickChaser(bb) {
    if (bb.isAttacking) { bb.chaser = null; return; }

    if (bb.oppCarrier && bb.oppCarrier.role === 'gk') {
        bb.chaser = null;
        return;
    }
    if (bb.carrier && bb.carrier.role === 'gk') {
        bb.chaser = null;
        return;
    }

    const ballPos = Match.ball.position;

    // No Defensive Pressure Balanceado (e Low), perseguição ativa e roubo de bola
    // acontecem EXCLUSIVAMENTE no campo de defesa (ballPos.z * bb.dir <= 0).
    // No campo de ataque, a equipa não avança para roubar bola nem manda chaser;
    // mantém a linha e marca à distância acompanhando a jogada (a não ser em High Press).
    if (typeof Tatics !== 'undefined' && Tatics.pressaoDefensiva !== 'high' && (ballPos.z * bb.dir > 0)) {
        bb.chaser = null;
        return;
    }

    const prevChaser = bb.chaser;
    const bolaSolta = !Match.ballCarrier;

    const candidatos = bb.outfield.map(p => {
        let score;
        if (bolaSolta && typeof Perception !== 'undefined' && p.blackboard) {
            score = Perception.claimScore(p);
            if (score === -Infinity) score = 100 - p.model.position.distanceTo(ballPos) - 50;
        } else {
            score = 100 - p.model.position.distanceTo(ballPos);
        }

        // Atacantes não devem recuar excessivamente para perseguir a bola no seu próprio meio-campo
        if (p.role === 'atk' && ballPos.z * p.dirZ < 5.0) {
            score -= 100;
        }
        return { p, score };
    });
    candidatos.sort((a, b) => b.score - a.score);

    const prevIdx = prevChaser ? candidatos.findIndex(c => c.p === prevChaser) : -1;
    if (prevIdx === 0 || (prevIdx === 1 && (candidatos[0].score - candidatos[prevIdx].score < 4.0))) {
        bb.chaser = prevChaser;
    } else {
        bb.chaser = candidatos.length ? candidatos[0].p : null;
        if (typeof MatchStats !== 'undefined' && prevChaser && bb.chaser !== prevChaser) {
            MatchStats[bb.team].trocasChaser++;
        }
    }
}


/*
QUEM INTERCEPTA — decisão colectiva, uma por equipa e por frame, tal como o
chaser logo acima.

Era decidida dentro da árvore de cada jogador (podeIntercetar, player_bt.js),
com uma reivindicação no blackboard: quem corresse primeiro reivindicava e os
seguintes só cediam se fossem PIORES. Um jogador MELHOR a correr depois
reivindicava na mesma, e o primeiro já tinha mudado de estado nesse frame —
ficavam dois em INTERCEPT, e de forma permanente, porque a ordem da lista da
equipa não muda de frame para frame. A conta está em escolherIntercetor
(utils.js), com testes em tests/intercetor.test.js.

Elegibilidade: bola solta, jogo a correr, a percepção diz que ele lá chega
dentro da janela, e não é nem o chaser, nem o destinatário do passe, nem
alguém que esteja a marcar um homem.
*/
function pickIntercetor(bb) {
    bb.intercetor = null;

    if (typeof Match === 'undefined') return;
    if (Match.ballCarrier) return;                // bola já tem dono
    if (Match.state !== 'PLAY') return;
    if (typeof PerceptionModel === 'undefined') return;

    const janela = PerceptionModel.janelaIntercetar;
    const margem = PerceptionModel.margemMelhor;

    const candidatos = [];
    for (const p of bb.outfield) {
        if (!p || p.role === 'gk') continue;
        if (bb.chaser === p) continue;
        if (Match.intendedReceiver === p) continue;
        if (typeof estouAMarcar === 'function' && estouAMarcar(p)) continue;

        const bola = p.blackboard && p.blackboard.ball;
        if (!bola || !bola.interceptable || !bola.interceptionPoint) continue;
        if (bola.timeToIntercept > janela) continue;

        const ipt = bola.interceptionPoint;
        const px = p.model.position.x;
        const pz = p.model.position.z;
        const distP = Math.hypot(ipt.x - px, ipt.z - pz);

        // Se outro colega está no caminho / mais bem posicionado entre o jogador e o ponto de intercepção,
        // o jogador não deve sair da posição para cruzar o caminho dele.
        let temColegaNoCaminho = false;
        for (const outro of bb.outfield) {
            if (!outro || outro === p || outro.role === 'gk') continue;
            const ox = outro.model.position.x;
            const oz = outro.model.position.z;
            const distOutro = Math.hypot(ipt.x - ox, ipt.z - oz);
            
            // Outro colega está significativamente mais perto do ponto de intercepção
            if (distOutro < distP - 1.2) {
                // E está no caminho entre p e o alvo, ou no corredor central onde o lateral não deve cruzar
                const dPO = Math.hypot(ox - px, oz - pz);
                if (dPO + distOutro < distP + 2.0 || (Math.abs(ipt.x) < 10 && Math.abs(ox) < 10 && Math.abs(px) > 11)) {
                    temColegaNoCaminho = true;
                    break;
                }
            }
        }
        if (temColegaNoCaminho) continue;

        candidatos.push({ p: p, t: bola.timeToIntercept });
    }
    if (!candidatos.length) return;

    /*
    O tempo de quem JÁ está encarregue da bola. Sem dados de percepção
    assume-se que ele trata disto (Infinity seria o contrário: mandava toda a
    gente atrás da bola).
    */
    let tQuemJaVai = Infinity;
    for (const outro of [bb.chaser, Match.intendedReceiver]) {
        if (!outro) continue;
        const bOutro = outro.blackboard && outro.blackboard.ball;
        const t = (bOutro && bOutro.interceptable) ? bOutro.timeToIntercept : 0;
        if (t < tQuemJaVai) tQuemJaVai = t;
    }

    bb.intercetor = escolherIntercetor(candidatos, tQuemJaVai, margem);
}

/*
A MARCACAO SAIU DAQUI.

Quem marca quem passou para o nivel 2 (PositionAI.assignMarking, em
position_bt.js), junto com o resto da defesa. Marcar nao e a forma
colectiva - e onde cada jogador se poe.

O nivel 1 mantem o pickChaser: quem vai a bola e decisao de equipa, so um
vai, e a postura do bloco depende disso.
*/

/*
Detecta se o portador adversário está a atacar por um flanco dentro do
nosso terço — dispara a basculação colectiva (postura FLANK_SHIFT).

Zona morta assimétrica: entra em alerta a 8m do eixo, só sai acima de 11m.
Com um único limiar, o portador a rondar os 8m ligava e desligava o alerta
a cada frame, e com ele a postura e os alvos de vários jogadores
(defendFlankShift). bb.prevFlankAlert é guardado em gather(), antes do
reset — ver o comentário lá.
*/
function detectFlankThreat(bb) {
    const carrier = bb.oppCarrier;
    if (!carrier) { bb.flankAlert = null; return; }

    const inDefThird = (carrier.model.position.z * bb.dir < -10.0);
    if (!inDefThird) { bb.flankAlert = null; return; }

    const x = carrier.model.position.x * bb.dir;
    const ENTRA = 8.0, SAI = 11.0;
    const limiteEsq = (bb.prevFlankAlert === 'left') ? SAI : ENTRA;
    const limiteDir = (bb.prevFlankAlert === 'right') ? SAI : ENTRA;

    if (x < -limiteEsq) bb.flankAlert = 'left';
    else if (x > limiteDir) bb.flankAlert = 'right';
    else bb.flankAlert = null;
}

/*
Quem desce a dar linha de passe na construção.

Sem isto nenhum médio alguma vez aparecia no nosso terço (medido: 0.0% do
tempo), e a bola tinha de sair da defesa directamente para o ataque. Escolhe o
médio mais perto da bola quando ela está no nosso meio-campo, e o nível 2
manda-o oferecer-se em vez de ocupar a posição normal.
*/
function pickSupportMid(bb) {
    if (!bb.isAttacking || bb.ballZ * bb.dir > TeamShape.supportBallZ) {
        bb.supportMid = null;
        return;
    }

    /*
    Guarda-redes com a bola nas mãos não é construção a sair a jogar: não há
    linha de passe para oferecer enquanto ele a segura, e supportBuildUp() põe
    o médio em `ballZ` — ou seja, dentro da própria área, colado ao GR. Era
    isso que fazia o médio (tipicamente o 8, o mais perto) ignorar o bloco a
    meio-campo que o computeBlock manda formar nesta situação.
    */
    if ((bb.carrier && bb.carrier.role === 'gk') ||
        (typeof Match !== 'undefined' && Match.gkHoldingBall && Match.gkHoldingBall[bb.team])) {
        bb.supportMid = null;
        return;
    }

    // Histerese, como no chaser e na marcação: supportBuildUp() substitui o
    // slot inteiro do médio escolhido, por isso trocar de escolhido a cada
    // frame (dois médios a distâncias parecidas) fazia o alvo saltar entre
    // o slot normal e "ir buscar a bola" de um jogador para o outro.
    const prev = bb.supportMid;
    // Só médios CENTRAIS — RM/LM são alas, arrastá-los pro meio pra apoiar a
    // construção junto ao GR quebra a largura da equipa (é função de um
    // 6/8, não de um ala). Sem este filtro, um RM/LM que calhasse ser o
    // "mid" mais perto da bola (ex.: depois de recuar marcando) tinha o slot
    // inteiro substituído por uma posição central — parecia sem sentido.
    const candidatos = bb.outfield
        .filter(p => p.role === 'mid' && p.pos !== 'RM' && p.pos !== 'LM')
        .map(p => ({ p, dist: p.model.position.distanceTo(Match.ball.position) }));
    candidatos.sort((a, b) => a.dist - b.dist);

    const prevIdx = prev ? candidatos.findIndex(c => c.p === prev) : -1;
    if (prevIdx >= 0 && prevIdx < 3) {
        bb.supportMid = prev;
    } else {
        bb.supportMid = candidatos.length ? candidatos[0].p : null;
        if (typeof MatchStats !== 'undefined' && prev && bb.supportMid !== prev) {
            MatchStats[bb.team].trocasSupportMid++;
        }
    }
}

/*
Rampa de avanço colectivo — quão avançada está a manobra ofensiva.

Depende SÓ da Mentalidade. Tinha por cima dois factores que não são ajustes
do painel: o `phaseMultiplier` (1.1/1.3, inalcançável — bb.phase nunca sai de
1) e um ×1.35 em contra-ataque. Este era o último sítio onde um estado de
jogo mexia na forma da equipa, ao lado da postura.
*/
function computeCollectiveShape(bb) {
    let pushMultiplier = 1.0;
    if (Tatics.estilo === 'muito_ofensiva') pushMultiplier = 1.30;
    else if (Tatics.estilo === 'ataque') pushMultiplier = 1.15;
    else if (Tatics.estilo === 'defesa') pushMultiplier = 0.85;
    else if (Tatics.estilo === 'muito_defensiva') pushMultiplier = 0.70;
    bb.pushMultiplier = pushMultiplier;

    /*
    Quão avançada está a manobra: 0 na nossa linha de fundo, 1 no ataque.

    O clamp tem de ser aplicado DEPOIS do pushMultiplier. Antes era
    `clamp(...) * pushMultiplier`, o que deixava o factor chegar a 2.02 — e como
    ele é usado como `t` num lerp, o lerp extrapolava: médios desenhados para
    parar aos 26.5 m acabavam a 48 m, dentro da área. O meio-campo esvaziava-se
    e a bola saía da defesa directamente para o ataque.
    */
    const ballPushNorm = THREE.MathUtils.clamp((bb.ballZ * bb.dir + 53) / 106, 0, 1);
    bb.advanceFactor = THREE.MathUtils.clamp(ballPushNorm * 1.3 * pushMultiplier, 0, 1);
}

/*
Compactação do bloco.

Sem isto a equipa estica: os avançados ficam colados à área adversária enquanto
os defesas seguram a linha lá atrás. Aqui a equipa passa a viver numa faixa de
profundidade limitada, ancorada na linha defensiva (sem bola) ou na bola (com
bola) — é o que faz o bloco subir e descer *inteiro* com a jogada.

Quem vai à bola (chaser) e quem a tem estão isentos: um pressionador tem de
poder sair do bloco, senão ninguém ataca o portador.
*/
/*
O RECTÂNGULO DO BLOCO — o produto principal do nível 1.

Substitui o `enforceCompactness`, que era um `clamp(z, anchor, top)` por
jogador. Um clamp projecta todos os que estão fora sobre o MESMO valor de
fronteira: quatro jogadores acima do tecto saíam com z idêntico ao centímetro,
e o resultado em campo era um monte de gente no mesmo sítio.

Aqui não se toca em ninguém. Calcula-se um rectângulo e o nível 2 coloca cada
jogador dentro dele por percentagem. Comprimir passa a ser encolher o
rectângulo — toda a gente encolhe junta e a forma mantém-se.

Tudo no referencial de ataque (-53 baliza própria, +53 baliza adversária).
*/
/*
CÁLCULO DO BLOCO / RETÂNGULO TÁTICO
1. Os retângulos acompanham as coordenadas da bola (X e Z).
2. Os retângulos ficam limitados nos limites do campo.
3. Os retângulos ficam limitados à linha da pequena área.
4. Na T.Ataque e Ataque o centro fica 5 metros à frente da linha da bola (+5m).
   Na T.Defesa e Defesa o centro fica 5 metros atrás da linha da bola (-5m).
*/
function computeBlock(bb) {
    const B = BlockShape;
    const modo = bb.isAttacking ? 'comBola' : 'semBola';
    const compac = B.amplitude[Tatics.compactness] !== undefined
        ? Tatics.compactness : 'median';
    const compacLength = B.profundidade[Tatics.lengthCompactness] !== undefined
        ? Tatics.lengthCompactness : 'median';

    /* --- profundidade --------------------------------------------------- */
    const profundidade = CAMPO_COMP * B.profundidade[compacLength];

    /* --- centro em Z (Regra 1 e Regra 4) -------------------------------
       NA T.ATAQUE E ATAQUE: CENTRO 5 METROS A FRENTE DA LINHA DA BOLA (+5m)
       NA T.DEFESA E DEFESA: CENTRO 5 METROS ATRAS DA LINHA DA BOLA (-5m)
       No referencial de ataque da equipa (bb.dir):
       - + é em direção ao ataque (à frente)
       - - é em direção à defesa (atrás)
    */
    const dtMatch = (typeof Match !== 'undefined' && Match.delta) ? Match.delta : 0.016;
    const reposta = (typeof Match !== 'undefined' && Match.state !== 'PLAY');

    const isAtaque = (bb.state === TeamState.TRANSITION_OFFENSIVE || bb.state === TeamState.OFFENSIVE || bb.isAttacking);
    const targetOffsetZ = isAtaque ? 5.0 : -5.0;

    if (bb.blocoZSuave === undefined) {
        bb.blocoZSuave = targetOffsetZ;
    } else {
        bb.blocoZSuave = seguirBola(bb.blocoZSuave, targetOffsetZ, BlockShape.seguimentoBola, dtMatch, reposta);
    }

    const bolaZDir = bb.bolaZSuave * bb.dir;
    let centroZ = bolaZDir + bb.blocoZSuave;

    let z0 = centroZ - (profundidade / 2);
    let z1 = centroZ + (profundidade / 2);

    /* --- limites em Z (Regra 2 e Regra 3) -------------------------------
       LIMITADOS NOS LIMITES DO CAMPO E A LINHA DA PEQUENA ÁREA (5.5m da linha de fundo)
       - Pequena área da defesa: -(CAMPO_COMP / 2 - 5.5) = -47.5m
       - Pequena área do ataque: +(CAMPO_COMP / 2 - 5.5) = +47.5m
    */
    const minZ = -(CAMPO_COMP / 2 - 5.5);
    const maxZ = (CAMPO_COMP / 2 - 5.5);

    if (z0 < minZ) {
        z0 = minZ;
        z1 = z0 + profundidade;
        if (z1 > maxZ) z1 = maxZ;
    } else if (z1 > maxZ) {
        z1 = maxZ;
        z0 = z1 - profundidade;
        if (z0 < minZ) z0 = minZ;
    }

    /* --- largura e centro em X (Regra 1 e Regra 2) ----------------------
       ACOMPANHA AS COORDENADAS DA BOLA EM X E LIMITA NOS LIMITES DO CAMPO (-34 a +34)
    */
    const largura = CAMPO_LARG * B.amplitude[compac];
    const meiaLarg = largura / 2;

    const centroX = bb.bolaXSuave;
    let x0 = centroX - meiaLarg;
    let x1 = centroX + meiaLarg;

    const maxX = CAMPO_LARG / 2;
    if (x0 < -maxX) {
        x0 = -maxX;
        x1 = x0 + largura;
        if (x1 > maxX) x1 = maxX;
    } else if (x1 > maxX) {
        x1 = maxX;
        x0 = x1 - largura;
        if (x0 < -maxX) x0 = -maxX;
    }

    bb.bloco = {
        x0: x0,
        x1: x1,
        z0: z0,
        z1: z1,
        modo: modo
    };

    bb.defLineDir = z0;
    bb.defLineZ = z0 * bb.dir;

    bb.blockBottom = z0;
    bb.blockTop = z1;

    return bb.bloco;
}

/*
DESLOCAMENTO LATERAL POR CORREDOR — quanto cada jogador desliza conforme o
corredor onde a bola esta.

Estava inline no slotNoBloco, com tres numeros a mao. Fora daqui nao havia
maneira de testar o que interessa, que nao e cada numero por si: e a
DISTANCIA ENTRE ELES depois de todos deslizarem.

    ballCorredor   -1 esquerda, 0 eixo, +1 direita (mundo)
    pCorredor      o mesmo, para o alvo deste jogador
    isLateral      LB/RB/LM/RM/LWB/RWB/LW/RW
    isDefesa       role 'def' — os centrais deslizam com a linha
    isAttacking    a equipa tem a bola
    sectorPedido   o painel pediu o corredor onde este jogador esta

Devolve os metros a somar ao x do alvo, ja com sinal do mundo.

O que mudou, e porque (pedido explicito depois de ver em campo):

    lado oposto, lateral   8.0 -> 5.0   fechava demais, ficava no eixo
    lado oposto, central   3.0 -> 4.0   passa a acompanhar o lateral

O par 8/3 encolhia a distancia entre o lateral e o central do lado oposto em
5 m de uma vez, e os dois acabavam em cima um do outro. Fechar tem de ser um
movimento do bloco, nao de um homem so: agora sao 5 e 4, e a distancia entre
eles so encolhe 1 m.

    mesmo lado, lateral    6.0 -> 4.0   abriam demais
    corredor central       2.0 -> 3.5 (defesas), 2.0 (o resto)

Pura: sem Match, sem Tatics, sem THREE.
*/
function deslocamentoDeCorredor(o) {
    const ballCorredor = o.ballCorredor;
    const pCorredor = o.pCorredor;

    if (ballCorredor === 0) {
        /*
        Bola no eixo: os corredores fechavam 4 m para dentro. Era o mais
        perverso dos estreitamentos — quanto MAIS central estava a bola, mais
        a equipa fechava, o oposto de jogar pelas pontas.

        Quem esta num corredor que o painel pediu nao e puxado: se o senhor
        ligou a ala, e para haver alguem na ala quando a bola esta no meio,
        que e exactamente quando a ala serve para alguma coisa.
        */
        if (o.sectorPedido) return 0;
        return -pCorredor * 4.0;
    }

    /*
    A BASCULAÇÃO JÁ FOI FEITA PELO BLOCO.

    Estes deslocamentos — 3.5 m para o defesa no corredor central, 5.0 m para o
    lateral do lado oposto — foram calibrados quando o centro do rectângulo
    seguia a bola só a 0.7 em X (`BlockShape.basculacao`) e a equipa tinha de
    compensar por jogador. Com o bloco a acompanhar a bola 1:1, isto passou a
    somar-se por cima: medido, o lateral do lado oposto colava-se ao central
    (1.5 m) e os quatro defesas ficavam com os alvos a menos de 3 m uns dos
    outros em 92% do tempo.

    Fica um resto pequeno, só para a linha não ficar perfeitamente recta: quem
    está do lado contrário ao da bola fecha um pouco, e mais nada.
    */
    if (pCorredor === 0) {
        return ballCorredor * (o.isDefesa ? 1.5 : 1.0);
    }

    if (pCorredor === -ballCorredor) {
        return ballCorredor * (o.isLateral ? 2.0 : 1.5);
    }

    // Mesmo lado da bola: o lateral abre para dar linha de passe pela ala, e
    // so com bola — sem ela, abrir e deixar o corredor interior a descoberto.
    if (o.isLateral && o.isAttacking) return ballCorredor * 4.0;
    return 0;
}

/*
Calcula a posição no mundo de um slot específico dentro do bloco tático.
*/
function calcularPontoDoSlot(slot, pos, role, fbStyle, bb) {
    const bloco = bb.bloco;
    if (!bloco || !slot) return null;

    const linha = LineShape[role] || LineShape.mid;
    const desvioLinha = bb.isAttacking ? linha.comBola : linha.semBola;

    let v = slot.v + desvioLinha;

    // Ajuste fino por posicao especifica (lateral a frente do central, medio
    // de ponta sobe mais na construcao) - ver PositionDepthNudge.
    const nudge = PositionDepthNudge[pos];
    if (nudge) {
        if (bb.isAttacking) {
            const fbSt = (pos === 'LB' || pos === 'RB') ? FullBackStyle[fbStyle] : null;
            v += nudge.comBola * (fbSt ? fbSt.comBolaMult : 1);
        } else {
            v += nudge.semBola;
        }
    }
    v = THREE.MathUtils.clamp(v, 0, 1);

    // u: fecha lateralmente em torno do eixo central do bloco (0.5).
    const fechoLinha = LineShape.fecho[role] || LineShape.fecho.mid;
    const fecho = bb.isAttacking ? fechoLinha.comBola : fechoLinha.semBola;

    const fechoSec = (typeof fechoDoSector === 'function' && typeof Tatics !== 'undefined')
        ? fechoDoSector(Tatics.setores)
        : 1.0;
        
    let fechoAdicional = 1.0;
    if (!bb.isAttacking && (pos === 'CB' || pos === 'DM' || pos === 'CM')) {
        const fatorCentral = Math.max(0, 1.0 - Math.abs(bb.bolaXSuave) / 18.0);
        fechoAdicional = 1.0 - (0.40 * fatorCentral); // aperta até mais 40% para fechar o meio
    }

    const u = THREE.MathUtils.clamp(0.5 + (slot.u - 0.5) * fecho * fechoSec * fechoAdicional, 0.02, 0.98);

    const MARGEM_LINHA_SLOT = 1.5;
    const limX = CAMPO_LARG / 2 - MARGEM_LINHA_SLOT;
    const limZ = CAMPO_COMP / 2 - MARGEM_LINHA_SLOT;

    const dentro = (v0, v1, lim) => {
        if (v1 > lim) return -(v1 - lim);      // empurra para dentro pela direita
        if (v0 < -lim) return (-lim - v0);     // e pela esquerda
        return 0;
    };
    const empurraX = dentro(bloco.x0, bloco.x1, limX);
    const empurraZ = dentro(bloco.z0, bloco.z1, limZ);

    let xTarget = bloco.x0 + u * (bloco.x1 - bloco.x0) + empurraX;
    const zTarget = ((bloco.z0 + v * (bloco.z1 - bloco.z0)) + empurraZ) * bb.dir;

    const ballX = bb.ballX || 0;
    const CORREDOR_LIMITE = 11.33; 

    let ballCorredor = 0;
    if (ballX > CORREDOR_LIMITE) ballCorredor = 1;
    else if (ballX < -CORREDOR_LIMITE) ballCorredor = -1;

    let pCorredor = 0;
    if (xTarget > CORREDOR_LIMITE) pCorredor = 1;
    else if (xTarget < -CORREDOR_LIMITE) pCorredor = -1;

    const isLateral = ['LB', 'RB', 'LM', 'RM', 'LWB', 'RWB', 'LW', 'RW'].includes(pos);

    const meuSector = (typeof Tatics !== 'undefined' && Tatics.sectorDeX)
        ? Tatics.sectorDeX(xTarget, bb.dir)
        : 'cen';
    const sectorPedido = (typeof Tatics !== 'undefined' && Tatics.setores)
        ? Tatics.setores.indexOf(meuSector) >= 0
        : true;

    xTarget += deslocamentoDeCorredor({
        ballCorredor: ballCorredor,
        pCorredor: pCorredor,
        isLateral: isLateral,
        isDefesa: role === 'def',
        isAttacking: bb.isAttacking,
        sectorPedido: sectorPedido
    });

    xTarget = THREE.MathUtils.clamp(xTarget, bloco.x0 + empurraX, bloco.x1 + empurraX);

    return {
        x: xTarget,
        z: zTarget
    };
}

/*
Onde este jogador fica dentro do bloco, em metros no mundo.
*/
function slotNoBloco(p, bb) {
    if (!bb || !p || !p.slot) return null;
    return calcularPontoDoSlot(p.slot, p.pos, p.role, p.fbStyle, bb);
}

/*
SISTEMA DE DETECÇÃO DO ALVO MAIS PRÓXIMO PARA JOGADORES DA MESMA POSIÇÃO
Evita que dois atacantes (CF), dois médios (CM) ou dois centrais (CB) corram
para o mesmo lugar. Pareia os slots da formação dinamicamente por proximidade,
com tratamento dedicado para quando um deles é o portador da bola.
*/
function otimizarSlotsPorPosicao(lista, bb) {
    if (!lista || !bb || !bb.bloco) return;

    // Agrupa jogadores de campo pela posição (ex: CF, CB, CM, etc)
    const grupos = {};
    for (const p of lista) {
        if (!p || p.role === 'gk' || !p.slot) continue;
        if (!p.slotInicial) {
            p.slotInicial = { u: p.slot.u, v: p.slot.v };
        }
        if (!grupos[p.pos]) grupos[p.pos] = [];
        grupos[p.pos].push(p);
    }

    const carrier = (typeof Match !== 'undefined' && Match.ballCarrier) ? Match.ballCarrier : null;

    for (const pos in grupos) {
        const grupo = grupos[pos];
        if (grupo.length < 2) continue;

        // Slots iniciais da formação para este grupo
        const slots = grupo.map(p => p.slotInicial);
        
        // Posição espacial no mundo de cada slot no bloco atual
        const alvosSlots = slots.map(s => calcularPontoDoSlot(s, pos, grupo[0].role, grupo[0].fbStyle, bb));
        if (alvosSlots.some(a => !a)) continue;

        const k = grupo.length;
        if (k === 2) {
            const p0 = grupo[0];
            const p1 = grupo[1];
            const pos0 = p0.model ? p0.model.position : p0.baseTarget;
            const pos1 = p1.model ? p1.model.position : p1.baseTarget;
            const s0 = alvosSlots[0];
            const s1 = alvosSlots[1];

            // Caso 1: Um dos jogadores do grupo é o portador da bola
            const isP0Carrier = (carrier === p0) || (p0.fsm && (p0.fsm.currentState === 'CARRY' || p0.fsm.currentState === 'DRIBBLE'));
            const isP1Carrier = (carrier === p1) || (p1.fsm && (p1.fsm.currentState === 'CARRY' || p1.fsm.currentState === 'DRIBBLE'));

            if (isP0Carrier && !isP1Carrier) {
                // p0 é o portador: atribui a p0 o slot mais próximo dele, e p1 obrigatoriamente fica com o outro slot
                const d0_s0 = Math.hypot(pos0.x - s0.x, pos0.z - s0.z);
                const d0_s1 = Math.hypot(pos0.x - s1.x, pos0.z - s1.z);
                if (d0_s0 <= d0_s1) {
                    p0.slot = slots[0];
                    p1.slot = slots[1];
                } else {
                    p0.slot = slots[1];
                    p1.slot = slots[0];
                }
                continue;
            } else if (isP1Carrier && !isP0Carrier) {
                // p1 é o portador: atribui a p1 o slot mais próximo dele, e p0 obrigatoriamente fica com o outro slot
                const d1_s0 = Math.hypot(pos1.x - s0.x, pos1.z - s0.z);
                const d1_s1 = Math.hypot(pos1.x - s1.x, pos1.z - s1.z);
                if (d1_s1 <= d1_s0) {
                    p1.slot = slots[1];
                    p0.slot = slots[0];
                } else {
                    p1.slot = slots[0];
                    p0.slot = slots[1];
                }
                continue;
            }

            // Caso 2: Nenhum é o portador da bola (jogo posicional)
            // Compara configuração direta (p0->s0, p1->s1) vs invertida (p0->s1, p1->s0)
            const d00 = (pos0.x - s0.x) ** 2 + (pos0.z - s0.z) ** 2;
            const d11 = (pos1.x - s1.x) ** 2 + (pos1.z - s1.z) ** 2;
            const custoDireto = d00 + d11;

            const d01 = (pos0.x - s1.x) ** 2 + (pos0.z - s1.z) ** 2;
            const d10 = (pos1.x - s0.x) ** 2 + (pos1.z - s0.z) ** 2;
            const custoInvertido = d01 + d10;

            const HISTERESE = 4.0; // metros quadrados de folga para estabilidade dinâmica
            const atualmenteDireto = (p0.slot === slots[0]);

            if (atualmenteDireto) {
                if (custoInvertido < custoDireto - HISTERESE) {
                    p0.slot = slots[1];
                    p1.slot = slots[0];
                } else {
                    p0.slot = slots[0];
                    p1.slot = slots[1];
                }
            } else {
                if (custoDireto < custoInvertido - HISTERESE) {
                    p0.slot = slots[0];
                    p1.slot = slots[1];
                } else {
                    p0.slot = slots[1];
                    p1.slot = slots[0];
                }
            }
        }
    }
}

/*
Playing style do GK — Offensive (sweeper, sai da baliza) vs Defensive (fica
perto da linha, padrão). Dispara evento só na mudança, não todo frame.

Offensive: adversário com a bola no corredor central (|x|<8) e sem nenhum
defensor nosso entre ele e a nossa baliza.
Defensive: qualquer outro caso (padrão).
*/
function updateGkStyle(bb) {
    const gk = bb.own.find(pl => pl.role === 'gk');
    if (!gk) return;

    // Traço fixo do jogador (ver createTeams/assignFormations em match.js).
    // Defensive nunca sai da linha — ignora o gatilho de sweeper por completo.
    if (gk.gkStyleBase === 'defensive') {
        if (gk.gkStyle !== 'defensive') {
            gk.gkStyle = 'defensive';
            if (typeof EventBus !== 'undefined') EventBus.emit('GK_STYLE_DEFENSIVE', { gk: gk });
        }
        return;
    }

    let offensive = false;
    const opp = bb.oppCarrier;
    if (opp && Math.abs(opp.model.position.x) < 8) {
        const oppAvanco = opp.model.position.z * bb.dir;
        const temDefensorPelaFrente = bb.outfield.some(d =>
            (d.model.position.z * bb.dir) < oppAvanco - 1 &&
            Math.abs(d.model.position.x - opp.model.position.x) < 10
        );
        offensive = !temDefensorPelaFrente;
    }

    const newStyle = offensive ? 'offensive' : 'defensive';
    if (gk.gkStyle !== newStyle) {
        gk.gkStyle = newStyle;
        if (typeof EventBus !== 'undefined') {
            EventBus.emit(newStyle === 'offensive' ? 'GK_STYLE_OFFENSIVE' : 'GK_STYLE_DEFENSIVE', { gk: gk });
        }
    }
}

const setPosture = (posture) => act('posture:' + posture, (bb) => { bb.posture = posture; });

/* --- A árvore ----------------------------------------------------------- */

const TeamBT = sel('TeamRoot',

    // 1. Bola parada suspende o plano normal.
    seq('BolaParada',
        cond('jogoParado', () => Match.state !== 'PLAY'),
        setPosture(TeamPosture.SET_PIECE)
    ),

    // 2. Com bola: qual a fase da manobra ofensiva?
    seq('ComBola',
        cond('temPosse', (bb) => bb.isAttacking),
        sel('FaseOfensiva',
            seq('Transicao',
                cond('emContraAtaque', (bb) => bb.isCounter),
                setPosture(TeamPosture.COUNTER)
            ),
            seq('UltimoTerco',
                cond('bolaNoUltimoTerco', (bb) => bb.ballZ * bb.dir > 17.0),
                setPosture(TeamPosture.FINAL_THIRD)
            ),
            seq('PosseInstalada',
                cond('posseProlongada', (bb) => bb.phase >= 2),
                setPosture(TeamPosture.ATTACK_SUSTAINED)
            ),
            setPosture(TeamPosture.BUILD_UP)
        )
    ),

    // 3. Sem bola: que bloco defensivo?
    seq('SemBola',
        act('lerAmeacaDeFlanco', detectFlankThreat),
        sel('BlocoDefensivo',
            seq('Basculacao',
                cond('flancoEmPerigo', (bb) => bb.flankAlert !== null),
                setPosture(TeamPosture.FLANK_SHIFT)
            ),
            seq('BlocoBaixo',
                cond('bolaNoNossoTerco', (bb) => bb.ballZ * bb.dir < -17.0),
                setPosture(TeamPosture.LOW_BLOCK)
            ),
            seq('PressaoAlta',
                // Precisa do Estilo=Ataque E do Defensive Pressure em High — só
                // um dos dois (ex: Ataque + Balanced) não basta pra pressionar
                // no campo do adversário o jogo inteiro.
                cond('pressionamosAlto', (bb) =>
                    (Tatics.estilo === 'ataque' || Tatics.estilo === 'muito_ofensiva') && Tatics.pressaoDefensiva === 'high' && bb.ballZ * bb.dir > 0),
                setPosture(TeamPosture.HIGH_PRESS)
            ),
            setPosture(TeamPosture.MID_BLOCK)
        )
    )
);

/* --- Ponto de entrada --------------------------------------------------- */

const TeamAI = {
    blackboards: {},

    get: function (team) {
        if (!this.blackboards[team]) this.blackboards[team] = new TeamBlackboard(team);
        return this.blackboards[team];
    },

    // Um tick completo do nível 1 para uma equipa.
    tick: function (team, match) {
        const bb = this.get(team);
        bb.gather(match);

        pickChaser(bb);
        pickBlocker(bb);
        // Depois do chaser, de propósito: o intercetor tem de bater o tempo
        // de quem já vai à bola, e o chaser deste frame é quem já vai lá.
        pickIntercetor(bb);
        updateGkStyle(bb);
        // Estilos de jogo: avalia condições e emite eventos nas transições.
        if (typeof PlayingStyleEvents !== 'undefined') PlayingStyleEvents.tick(bb);
        TeamBT.tick(bb);
        computeCollectiveShape(bb);

        /*
        O bloco é calculado AQUI, antes do nível 2, porque agora é ele que dá a
        posição a toda a gente — deixou de ser uma compressão aplicada no fim.

        Usa o `offsideLimitDir` do frame anterior (o Match só o
        publica depois das posições estarem escritas). Um frame de atraso numa
        grandeza que varia devagar é preferível ao nó de ordem que a alternativa
        obrigaria a desatar.
        */
        computeBlock(bb);

        pickSupportMid(bb);

        return bb;
    },

    /*
    Ja nao ha passos colectivos depois do nivel 2.

    `compact` era um no-op desde que comprimir passou a ser encolher o
    rectangulo no computeBlock. `holdLine` puxava os defesas para a linha de
    fora-de-jogo, por cima do que o nivel 2 tinha escrito — largava a marca
    de quem estivesse a marcar um homem adiantado. Vao ser refeitos sobre
    triangulacao de Delaunay, so para a equipa com bola.
    */
};

/* =========================================================================
   ONDE CADA JOGADOR SE POE
   =========================================================================
   Era o nivel 2, num ficheiro proprio (js/bt/position_bt.js). Deixou de
   haver nivel 2: ha o TeamBT e ha os Playing Styles.

   Ficou isto, que e o minimo para alguem se mexer: o slot no bloco que o
   nivel 1 acabou de calcular, inclinado pelo estilo do jogador, cortado
   pelos limites do campo e suavizado. Escreve `p.dynamicTarget`, que e o
   ponto que o steerArrive persegue.

   Foram apagados com o nivel 2: a marcacao (atribuirMarcacao/cobertura), o
   tackling (TacklingAI) e a malha de passe de Delaunay (TriangulacaoAI).
   ========================================================================= */
/*
MARCAÇÃO POSICIONAL — o desvio que faz o jogador acompanhar quem lhe entra no
setor. Corre depois do estilo inclinar o slot e antes do clamp do campo.

Não é tackling: isto só desloca o ALVO de posicionamento. Nunca muda o estado da
FSM, nunca manda ninguém à bola. Quem decide ir à bola continua a ser o chaser e
as folhas actTackle/actSlideTackle da árvore do jogador.

A decisão tem histerese de MarkingModel.histerese segundos, nos dois sentidos —
quem acompanha continua, quem está no slot fica — com duas saídas de emergência:
a referência afastar-se para lá de metade do raio, ou desaparecer do campo.
*/
function aplicarMarcacaoPosicional(p, bb, targetX, targetZ) {
    if (typeof MarkingModel === 'undefined' || !p.marcRef) {
        return { x: targetX, z: targetZ };
    }

    const M = MarkingModel;
    let distancia = M.distanciaPorPressao[Tatics.pressaoDefensiva]
        ?? M.distanciaPorPressao.balanced;
    let biasMax = M.biasMaxPara(targetZ * p.dirZ);

    // No campo de ataque com pressão não-High, a marcação é feita a distância acompanhando a jogada
    const isAtkHalf = (targetZ * p.dirZ > 0);
    if (typeof Tatics !== 'undefined' && Tatics.pressaoDefensiva !== 'high' && isAtkHalf) {
        distancia = Math.max(distancia, 4.5);
        biasMax = Math.min(biasMax, 3.0);
    }

    // Permite que os CBs fechem mais a passagem (antes era 0.3)
    if (p.pos === 'CB') biasMax *= 0.7;

    const refVel = p.marcRef.velocity;
    const px = p.marcRef.model.position.x + (refVel ? refVel.x * 0.5 : 0);
    const pz = p.marcRef.model.position.z + (refVel ? refVel.z * 0.5 : 0);

    return pontoDeMarcacao(targetX, targetZ,
        px, pz,
        p.ownGoalZ, distancia, biasMax);
}

/*
Quem acompanha quem, para a equipa toda de uma vez.

Corre entre as duas fases do PosicionamentoAI: precisa do posto de todos
(`p.postoBase`, ja com o estilo) e tem de escrever o `p.marcRef` antes de
qualquer um aplicar a sua marcacao.

Aqui vive a histerese (nao se troca de homem todos os frames) e a validacao
da referencia; a exclusividade e do `atribuirMarcacoes`, em config.js.
*/
function atribuirMarcacoesDaEquipa(lista, bb) {
    if (typeof MarkingModel === 'undefined' ||
        typeof atribuirMarcacoes !== 'function') return;

    const M = MarkingModel;
    const dt = (typeof Match !== 'undefined' && Match.delta) ? Match.delta : 0.016;
    const adversarios = (bb && bb.opp) ? bb.opp : [];

    const jogadores = [];
    const marcadores = [];

    for (const p of lista) {
        if (!p || p.role === 'gk' || !p.postoBase) continue;
        p.marcTimer = (p.marcTimer || 0) + dt;

        // A referencia ainda serve? Sai ja se desapareceu do campo ou se fugiu
        // do setor - manter a decisao nesses casos era pior do que trocar.
        if (p.marcRef) {
            const vivo = adversarios.indexOf(p.marcRef) >= 0;
            const dx = p.marcRef.model.position.x - p.postoBase.x;
            const dz = p.marcRef.model.position.z - p.postoBase.z;
            const fugiu = Math.hypot(dx, dz) > M.raioSetor * 1.5;
            if (!vivo || fugiu) { p.marcRef = null; p.marcTimer = 0; }
        }

        jogadores.push(p);
        marcadores.push({
            x: p.postoBase.x,
            z: p.postoBase.z,
            manter: p.marcTimer < M.histerese,
            ref: p.marcRef
        });
    }

    const escolha = atribuirMarcacoes(marcadores, adversarios, M.raioSetor);

    for (let i = 0; i < jogadores.length; i++) {
        const p = jogadores[i];
        p.marcRef = escolha[i];
        // So quem foi a leilao reinicia o relogio da histerese.
        if (!marcadores[i].manter) p.marcTimer = 0;
    }
}

/*
INQUIETAÇÃO — o micro-movimento de quem já chegou ao alvo.

Só age em quem está a menos de RestlessModel.limiarChegada do alvo: enquanto se
desloca, o alvo fica quieto, senão o micro-movimento competia com a deslocação e
o jogador serpenteava pelo campo em vez de ir a direito.

Fora: quem tem a bola e o chaser, que têm destino próprio. O guarda-redes nem
chega aqui.

Parte sempre do alvo corrente e não acumula — ver RestlessModel em config.js.
*/
function aplicarInquietacao(p, bb, targetX, targetZ) {
    if (typeof RestlessModel === 'undefined' ||
        typeof offsetInquietacao !== 'function') {
        return { x: targetX, z: targetZ };
    }
    if (p.hasBall || (bb && bb.chaser === p)) return { x: targetX, z: targetZ };

    const R = RestlessModel;
    const pos = p.model.position;
    if (Math.hypot(pos.x - targetX, pos.z - targetZ) > R.limiarChegada) {
        return { x: targetX, z: targetZ };
    }

    const dt = (typeof Match !== 'undefined' && Match.delta) ? Match.delta : 0.016;
    p.inqTimer = (p.inqTimer || 0) + dt;

    if (!p.inqIntervalo || p.inqTimer >= p.inqIntervalo) {
        p.inqAngulo = Math.random() * Math.PI * 2;
        p.inqRaio = Math.random() * R.raio;
        p.inqIntervalo = R.intervaloMin + Math.random() * (R.intervaloMax - R.intervaloMin);
        p.inqTimer = 0;
    }

    const o = offsetInquietacao(p.inqAngulo, p.inqRaio);
    return { x: targetX + o.x, z: targetZ + o.z };
}

/*
Quem se oferece como opcao de passe, decidido para a EQUIPA de uma vez.

Corre depois do tickBase (precisa do `postoBase` de toda a gente: o custo de
um apoio e a distancia do SLOT dele ao ponto) e antes do nivel 3, que e quem
executa — a folha ApoioDeCirculacao do player_bt.

So a equipa com a bola se oferece. Escreve `p.apoioPonto` em quem foi
escolhido e limpa-o nos outros; sem a limpeza, um apoio ficava agarrado ao
ponto da jogada anterior depois de a bola mudar de dono.
*/
function atribuirApoiosDaEquipa(lista, bb) {
    if (typeof SupportModel === 'undefined' || !SupportModel.circulacao) return;
    if (typeof atribuirApoios !== 'function') return;

    const semApoio = () => { for (const p of lista) p.apoioPonto = null; };

    /*
    A referencia e a BOLA, nao o portador.

    Medido: so 34% dos frames tem `ballCarrier` — o resto do tempo a bola vai
    no ar ou anda solta. Com o portador como referencia, os apoios eram
    apagados dois em cada tres frames e a duracao media de um apoio ficava em
    0.2 s: ninguem chegava a chegar ao ponto. Oferecer-se e em relacao a onde
    a bola esta, e isso existe sempre.

    A condicao passa a ser a POSSE da equipa (isAttacking), que sobrevive a
    bola estar em movimento entre dois companheiros.
    */
    if (!bb.isAttacking) { semApoio(); return; }
    if (typeof Match === 'undefined' || !Match.ball) { semApoio(); return; }
    if (Match.gkHoldingBall && Match.gkHoldingBall[bb.team]) { semApoio(); return; }

    const portador = bb.carrier;
    const refX = Match.ball.position.x;
    const refZ = Match.ball.position.z;
    const dirZref = lista[0] ? lista[0].dirZ : 1;

    const C = SupportModel.circulacao;
    const adversarios = (bb.opp || [])
        .filter(o => o && o.role !== 'gk' && o.model)
        .map(o => ({ x: o.model.position.x, z: o.model.position.z }));

    /*
    O `apoioActual` e o que liga a histerese: sem ele, cada frame refazia a
    atribuicao do zero e o encargo saltava de pessoa para pessoa — medido, a
    duracao media de um apoio era 0.2 s e ninguem chegava ao ponto.

    Por isso a limpeza dos pontos NAO pode ser feita antes disto: o ponto
    anterior tem de sobreviver ate a nova atribuicao o confirmar ou largar.
    */
    const candidatos = [];
    for (const p of lista) {
        if (!p || p.role === 'gk' || !p.postoBase) continue;
        if (portador && p === portador) continue;
        // Quem esta em cima da bola tambem nao: e ele que a vai jogar.
        if (Math.hypot(p.model.position.x - refX, p.model.position.z - refZ) < 2.0) continue;
        // Quem vai receber a bola tem tarefa; oferecer-se e para os outros.
        if (typeof Match !== 'undefined' && Match.intendedReceiver === p) continue;
        // Dummy Runner faz corrida de desmarque/arrasto e não apoio curto aos pés
        if (typeof estiloAtivoDe === 'function' && estiloAtivoDe(p).atraiDefesa) continue;
        candidatos.push({
            id: p.id,
            slotX: p.postoBase.x,
            slotZ: p.postoBase.z,
            apoioActual: p.apoioPonto || null
        });
    }
    if (!candidatos.length) {
        for (const p of lista) p.apoioPonto = null;
        return;
    }

    const escolhidos = atribuirApoios({
        portador: { x: refX, z: refZ, dirZ: dirZref },
        candidatos: candidatos,
        adversarios: adversarios,
        offsideLimitDir: (typeof bb.offsideLimitDir === 'number') ? bb.offsideLimitDir : null,
        maxApoios: C.maxApoios,
        raioMin: C.raioMin,
        raioMax: C.raioMax,
        desvioMax: C.desvioMax,
        margemLinha: C.margemLinha,
        margemAdversario: C.margemAdversario,
        // Pesos da escolha do ponto (ver notaPontoDeApoio, utils.js).
        pesos: {
            pesoFolgaLinha: C.pesoFolgaLinha,
            pesoFolgaPonto: C.pesoFolgaPonto,
            pesoCusto: C.pesoCusto,
            folgaCap: C.folgaCap
        }
    });

    const comApoio = new Set(escolhidos.map(e => e.id));
    for (const p of lista) if (!comApoio.has(p.id)) p.apoioPonto = null;

    for (const e of escolhidos) {
        const p = lista.find(j => j.id === e.id);
        if (p) p.apoioPonto = { x: e.x, z: e.z };
    }
}

const PosicionamentoAI = {
    otimizarSlotsPorPosicao: otimizarSlotsPorPosicao,

    /*
    FASE 1 - o posto de cada um antes da marcacao: slot no bloco + estilo.

    Sai em `p.postoBase` porque a atribuicao de marcacoes precisa dos postos da
    EQUIPA INTEIRA antes de decidir quem acompanha quem (ver
    atribuirMarcacoesDaEquipa). Enquanto isto vivia tudo num `tick` por
    jogador, cada um escolhia o seu homem as cegas e dois caiam no mesmo.
    */
    tickBase: function (p, bb) {
        if (p.role === 'gk') return;   // o GK posiciona-se em updateGK()

        const slot = slotNoBloco(p, bb);
        let targetX = slot ? slot.x : p.baseTarget.x;
        let targetZ = slot ? slot.z : p.baseTarget.z;

        // Inércia pós-passe de 4 segundos: se a equipa estiver no ataque, não recua para trás da cota onde passou
        if (bb && bb.isAttacking && p.passInertiaTimer > 0 && typeof p.passInertiaZDir === 'number') {
            const zDirAtual = targetZ * p.dirZ;
            if (zDirAtual < p.passInertiaZDir) {
                targetZ = p.passInertiaZDir * p.dirZ;
            }
        }

        // Abertura de Linha de Passe & Espaçamento com o Portador da Bola:
        // Se a equipa está no ataque e um colega tem/conduz a bola, afasta-se para não esbarrar e abrir linha de passe
        if (bb && bb.isAttacking && typeof Match !== 'undefined' && Match.ballCarrier && Match.ballCarrier.team === p.team && Match.ballCarrier !== p) {
            const carrier = Match.ballCarrier;
            const carrierPos = carrier.model ? carrier.model.position : null;
            if (carrierPos) {
                const dx = targetX - carrierPos.x;
                const dz = targetZ - carrierPos.z;
                const distCarrier = Math.hypot(dx, dz);
                const RAIO_MIN_PORTADOR = 7.5;
                if (distCarrier < RAIO_MIN_PORTADOR) {
                    const falta = RAIO_MIN_PORTADOR - distCarrier;
                    let dirX = dx >= 0 ? 1 : -1;
                    if (Math.abs(dx) < 0.5) {
                        dirX = (p.slot && p.slot.u >= 0.5) ? 1 : -1;
                    }
                    targetX += dirX * falta;
                }
            }
        }

        // Anel grande do debug: o slot puro, antes de qualquer desvio.
        if (!p.slotTarget) p.slotTarget = new THREE.Vector3();
        p.slotTarget.set(targetX, ALTURA_BASE_Y, targetZ);

        const comEstilo = (typeof aplicarEstiloPosicional === 'function')
            ? aplicarEstiloPosicional(p, bb, targetX, targetZ)
            : { x: targetX, z: targetZ };

        if (!p.postoBase) p.postoBase = { x: 0, z: 0 };
        p.postoBase.x = comEstilo.x;
        p.postoBase.z = comEstilo.z;
    },

    /*
    FASE 2 - marcacao, inquietacao, tecto e alisamento. Corre DEPOIS de
    atribuirMarcacoesDaEquipa, que ja poe o `p.marcRef` de cada um.
    */
    tickFinal: function (p, bb) {
        if (p.role === 'gk') return;
        if (!p.postoBase) return;
        const comEstilo = p.postoBase;

        // Quinto passo: acompanhar quem entra no setor. Depois do estilo, para
        // a marcação partir do slot que o estilo já inclinou.
        const comMarcacao = (typeof aplicarMarcacaoPosicional === 'function')
            ? aplicarMarcacaoPosicional(p, bb, comEstilo.x, comEstilo.z)
            : comEstilo;

        // Sexto passo: quem já chegou não fica estátua. Antes do tecto, para
        // dois metros de irrequietude não voltarem a furá-lo.
        const comInquietacao = (typeof aplicarInquietacao === 'function')
            ? aplicarInquietacao(p, bb, comMarcacao.x, comMarcacao.z)
            : comMarcacao;

        /*
        O tecto do estilo é o ÚLTIMO a falar: o Box-to-Box não passa da entrada
        da área, e a marcação (acima) chega a desviar 10 m no terço de ataque.
        Enquanto o tecto vivia dentro do aplicarEstiloPosicional, a marcação
        voltava a furá-lo.
        */
        const comTecto = (typeof aplicarTectoDoEstilo === 'function')
            ? aplicarTectoDoEstilo(p, comInquietacao.z)
            : comInquietacao.z;

        let finalZ = comTecto;
        // Inércia pós-passe de 4 segundos: mantém a presença ofensiva sem recuar contra o fluxo do jogo
        if (bb && bb.isAttacking && p.passInertiaTimer > 0 && typeof p.passInertiaZDir === 'number') {
            const zDirFinal = finalZ * p.dirZ;
            if (zDirFinal < p.passInertiaZDir) {
                finalZ = p.passInertiaZDir * p.dirZ;
            }
        }

        // Respeito ao limite legal de fora-de-jogo (offside) mesmo com inércia
        if (bb && bb.isAttacking && bb.offsideLimitDir !== undefined && bb.offsideLimitDir !== null) {
            const maxLegalZDir = bb.offsideLimitDir - 0.5;
            if (finalZ * p.dirZ > maxLegalZDir) {
                finalZ = maxLegalZDir * p.dirZ;
            }
        }

        const tx = THREE.MathUtils.clamp(comInquietacao.x, -34, 34);
        const tz = THREE.MathUtils.clamp(finalZ, -50, 50);

        const dt = (typeof Match !== 'undefined' && Match.delta) ? Match.delta : 0.016;
        let k = 1 - Math.exp(-PositionSmoothing * dt);
        if (p.snapPosition) { k = 1; p.snapPosition = false; }

        if (!p.tacticalTarget) p.tacticalTarget = new THREE.Vector3(tx, ALTURA_BASE_Y, tz);
        p.tacticalTarget.x = lerp(p.tacticalTarget.x, tx, k);
        p.tacticalTarget.z = lerp(p.tacticalTarget.z, tz, k);
        p.tacticalTarget.y = ALTURA_BASE_Y;

        /*
        Anel do PlayingStyleBT: o posto DEPOIS do estilo e ANTES da marcação —
        p.postoBase, escrito no tickBase. Era uma cópia do alvo final, e por
        isso coincidia com o anel do PositionBT: desligar os estilos não mudava
        nada nos anéis, porque o que ali se via era marcação + inquietação +
        alisamento. Assim a linha entre o anel do TeamBT e este É o desvio do
        estilo, e mais nada.
        */
        if (!p.styleTarget) p.styleTarget = new THREE.Vector3(0, ALTURA_BASE_Y, 0);
        p.styleTarget.set(comEstilo.x, ALTURA_BASE_Y, comEstilo.z);

        p.dynamicTarget.x = lerp(p.dynamicTarget.x, tx, k);
        p.dynamicTarget.z = lerp(p.dynamicTarget.z, tz, k);
        p.dynamicTarget.y = ALTURA_BASE_Y;
    }
};
