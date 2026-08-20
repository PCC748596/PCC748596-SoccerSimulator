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
    Defensive Pressure TeamShape.pressaoLineCap (tecto do centro sem bola)
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
        this.momentumZ = 0;                          // Z do mundo em metros, suavizado
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

        // Reivindicação de "vou intercetar" desta equipa neste frame — ver
        // podeIntercetar em player_bt.js. Limpa aqui (nível 1, antes do nível
        // 3 correr para todos os jogadores da equipa).
        this.intercetorFrame = null;

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

// EMA do lado do campo onde a bola anda — sem isto qualquer troca lateral
// de bola mudava o "lado" instantaneamente; suavizado, um passe isolado
// pro lado oposto não vira Momentum sozinho, precisa insistir.
function updateMomentum(bb, dt) {
    const alvoX = THREE.MathUtils.clamp(bb.ballX / (CAMPO_LARG / 2), -1, 1);
    const kX = 1 - Math.exp(-0.8 * dt);
    bb.momentumX += (alvoX - bb.momentumX) * kX;
    
    let alvoZ = bb.ballZ;
    if (bb.state === TeamState.TRANSITION_OFFENSIVE) {
        alvoZ += 10 * bb.dir;
    } else if (bb.state === TeamState.TRANSITION_DEFENSIVE) {
        alvoZ -= 3 * bb.dir;
    }

    let kZ;
    if (bb.isAttacking) {
        if (alvoZ * bb.dir < bb.momentumZ * bb.dir) kZ = 1 - Math.exp(-0.25 * dt);
        else kZ = 1 - Math.exp(-1.5 * dt);
    } else {
        // Reduzido de -1.0 para -0.4 para a transição defensiva ser mais gradual
        kZ = 1 - Math.exp(-0.4 * dt);
    }
    /*
    Salto instantâneo só quando a bola foi REPOSTA (fora de PLAY: golo, canto,
    lançamento). Em jogo o teste era `|alvoZ - momentumZ| > 30`, e qualquer
    alívio ou bola longa punha o centro do bloco no destino num único frame —
    os onze alvos saltavam juntos.
    */
    const reposta = (typeof Match !== 'undefined' && Match.state !== 'PLAY');
    if (reposta || dt >= 1) bb.momentumZ = alvoZ;
    else bb.momentumZ += (alvoZ - bb.momentumZ) * kZ;
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
// mexer em nada (ver tacticSystem.md secção 9).
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
function pickChaser(bb) {
    /*
    Só a equipa que NÃO tem a bola persegue. Sem isto, pickChaser corria
    igual para as duas equipas (só o caso do GK estava tratado abaixo) — se
    um companheiro do próprio portador calhasse ser o mais perto da bola
    (fora o portador), virava chaser da PRÓPRIA equipa e o IrABola (nível 3)
    mandava-o direito ao portador, por cima do que o PositionBT já lhe tinha
    dado (ex.: um RB "colava" no colega com a bola em vez de subir no
    corredor via attackFullBack).
    */
    if (bb.isAttacking) { bb.chaser = null; return; }

    /*
    Guarda-redes adversário já agarrou a bola com as mãos: ninguém pressiona
    — ele não pode ser desarmado (ver resolveBallContact/FSM), então correr
    até ele só amontoa gente na área. A equipa larga a marcação individual e
    volta ao bloco/forma (defendZonal continua a reorganizar sozinho).
    */
    if (bb.oppCarrier && bb.oppCarrier.role === 'gk') {
        bb.chaser = null;
        return;
    }
    // Mesma lógica para o PRÓPRIO GK: com a bola já segura em casa, ninguém
    // de campo precisa "correr atrás dela" — isso era exactamente o que
    // mandava o CB mais próximo (chaser) por cima dele via IrABola.
    if (bb.carrier && bb.carrier.role === 'gk') {
        bb.chaser = null;
        return;
    }

    const prevChaser = bb.chaser;

    /*
    Reação defensiva: quem perdeu a bola não decide pressionar/bloquear no
    mesmo frame — observa primeiro. Espera controlada por Defensive Pressure
    (painel esquerdo): Low 6s, Balanced 4s, High 2s. Match.possessionTimer
    conta desde a última troca de equipa na posse (ver updatePossession).
    */
    const teamStyle = (typeof TeamPlayStyles !== 'undefined') ? TeamPlayStyles[Tatics.teamPlayStyle] : null;
    const reactionDelay = (DefensivePressureModel[Tatics.pressaoDefensiva] || DefensivePressureModel.balanced)
        * (teamStyle ? teamStyle.pressaoPosPerda : 1.0);
    if (!bb.isAttacking && prevChaser && Match.possessionTimer < reactionDelay) {
        bb.chaser = prevChaser;
        return;
    }

    const ballPos = Match.ball.position;

    /*
    Ball Claim (Perception System, secção 16): com bola solta, usa o
    claimScore da percepção (timeToIntercept/confiança), mais realista do
    que "100 - distância" — considera se o jogador REALMENTE alcança a
    bola, não só quem está mais perto dela agora. Com bola já na posse de
    alguém (perseguir o portador, não uma bola solta) a percepção de
    interceptação não se aplica (ver Perception.computeInterception) — cai
    de volta na distância bruta, como sempre foi.
    */
    const bolaSolta = !Match.ballCarrier;
    const candidatos = bb.outfield.map(p => {
        let score;
        if (bolaSolta && typeof Perception !== 'undefined' && p.blackboard) {
            score = Perception.claimScore(p);
            if (score === -Infinity) score = 100 - p.model.position.distanceTo(ballPos) - 50;
        } else {
            score = 100 - p.model.position.distanceTo(ballPos);
        }

        // Atacantes não devem recuar para perseguir a bola no seu próprio meio-campo
        if (p.role === 'atk' && ballPos.z * p.dirZ < 5.0) {
            score -= 100;
        }
        return { p, score };
    });
    candidatos.sort((a, b) => b.score - a.score);

    const prevIdx = prevChaser ? candidatos.findIndex(c => c.p === prevChaser) : -1;
    if (prevIdx >= 0 && prevIdx < 3) {
        bb.chaser = prevChaser;
    } else {
        bb.chaser = candidatos.length ? candidatos[0].p : null;
        if (typeof MatchStats !== 'undefined' && prevChaser && bb.chaser !== prevChaser) {
            MatchStats[bb.team].trocasChaser++;
        }
    }
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
function computeBlock(bb) {
    const B = BlockShape;
    const modo = bb.isAttacking ? 'comBola' : 'semBola';
    const compac = B.amplitude[Tatics.compactness] !== undefined
        ? Tatics.compactness : 'median';
    const compacLength = B.profundidade[Tatics.lengthCompactness] !== undefined
        ? Tatics.lengthCompactness : 'median';

    /* --- profundidade --------------------------------------------------- */

    // Pedido explicito: bloco do mesmo tamanho independente de quem tem a
    // bola - esticar a atacar nao e comportamento pedido nesta conversa.
    const profundidade = CAMPO_COMP * B.profundidade[compacLength];

    const gkHoldingBall = typeof Match !== 'undefined' && Match.gkHoldingBall && Match.gkHoldingBall[bb.team];
    const isGoalKick = typeof Match !== 'undefined' && Match.state === 'GOAL_KICK';
    const defendingGoalKick = isGoalKick && !bb.isAttacking;

    let centro;
    const ment = MentalidadeModel[Tatics.estilo] || MentalidadeModel.balanceado;

    if (defendingGoalKick) {
        // No tiro de meta adversário, o time que defende volta para o meio-campo
        centro = 0;
    } else if (isGoalKick && bb.isAttacking) {
        // No próprio tiro de meta, avança o time 10m para a frente
        centro = (bb.momentumZ * bb.dir) + 10 + ment.blocoZ;
    } else if (gkHoldingBall) {
        // Centro a 10 metros a frente da linha da grande area
        centro = -26.5; 
    } else {
        // O centro do bloco no eixo Z acompanha a bola.
        centro = bb.momentumZ * bb.dir;

        if (typeof TeamState !== 'undefined') {
            if (bb.state === TeamState.TRANSITION_OFFENSIVE) {
                centro += 10;
            } else if (bb.state === TeamState.TRANSITION_DEFENSIVE) {
                centro -= 3;
            }
        }

        // O centro não pode ficar para trás da linha da bola (longitudinalmente)
        const bolaDir = bb.ballZ * bb.dir;
        if (bb.isAttacking) {
            if (centro < bolaDir) centro = bolaDir;
        } else {
            if (centro > bolaDir) centro = bolaDir;
        }

        /*
        MENTALIDADE: o offset do painel, aplicado ao bloco INTEIRO e nas DUAS
        fases. Antes vivia so neste ramo `isAttacking`, e o ramo sem bola nao
        tinha termo nenhum - em Muito Ofensiva a perda de posse mudava o centro
        de +12+5 para -3, 20 m num frame, e a equipa toda arrancava para tras.
        */
        centro += ment.blocoZ;
    }

    let z0 = centro - (profundidade / 2);
    let z1 = centro + (profundidade / 2);

    /*
    Tecto da TRASEIRA do bloco: e aqui que o ajuste "Linha Defensiva" do painel
    entra, porque a linha do fora-de-jogo E a traseira do bloco (bb.defLineDir,
    no fim desta funcao). Enquanto eram dois calculos independentes discordavam
    uns 10 m: os defesas recebiam o slot na traseira do bloco e o holdOffsideLine
    puxava-os logo a seguir todos para o MESMO z da outra linha - a ultima linha
    saia achatada, quatro jogadores no mesmo ponto.
    */
    if (!bb.isAttacking) {
        /*
        A Mentalidade desloca o tecto com o resto do bloco. Sem isto ela nao
        chegava a ver-se a defender: com a bola no meio-campo e "Linha
        Defensiva: Medium", o tecto -18.25 travava na mesma altura tanto a
        Equilibrada como a Muito Ofensiva, e a diferenca entre as duas voltava
        a aparecer de golpe na recuperacao da posse - o salto de 20 m que se
        queria tirar. Com o tecto deslocado o salto e igual em todas as
        mentalidades (~8 m) e vem so da postura.
        */
        const tectoBase = TeamShape.linhaDefensiva[Tatics.linhaDefensiva] ?? TeamShape.linhaDefensiva.medium;
        const tectoLinha = tectoBase + ment.blocoZ;
        if (z0 > tectoLinha) {
            z0 = tectoLinha;
            z1 = z0 + profundidade;
        }

        /*
        A BOLA TEM DE CABER DENTRO DO BLOCO.

        O tecto acima e ABSOLUTO: com "Linha Defensiva: Medium" prendia z0 em
        -18.25 e, por tabela, o centro em -3.2 - o bloco ficava parado no
        meio-campo enquanto a bola andava ate a linha de fundo adversaria.
        Medido: d(centro)/d(bola) = 0.00 em todo o meio campo de ataque.

        Este escape existia no antigo computeDefensiveLine
        (`Math.max(lineDir, ballDir - blockDepthDef)`) e veio-se abaixo com
        ele. Sem isto os defesas seguram-se la atras enquanto um colega
        pressiona 60 m a frente. Corre DEPOIS do tecto, de proposito: e o
        tecto que cede, nao a coesao do bloco.
        */
        const bolaDir = bb.momentumZ * bb.dir;
        if (z1 < bolaDir) {
            z1 = bolaDir;
            z0 = z1 - profundidade;
        }

        /*
        Limite duro do avanco sem bola, por Defensive Pressure: meio-campo
        (Low), 1/3 do campo de ataque (Balanced), 2/3 (High). E o ULTIMO a
        falar - e ele que decide ate onde a equipa acompanha uma bola que
        esta no campo adversario, e por isso ganha ao escape acima.
        */
        const pressCap = TeamShape.pressaoLineCap[Tatics.pressaoDefensiva] ?? TeamShape.pressaoLineCap.balanced;
        const centroAtual = (z0 + z1) / 2;
        if (centroAtual > pressCap) {
            z0 -= (centroAtual - pressCap);
            z1 -= (centroAtual - pressCap);
        }
    }

    // O fora-de-jogo trava a frente do bloco (so a atacar)
    if (bb.isAttacking && bb.offsideLimitDir !== null && bb.offsideLimitDir !== undefined) {
        if (z1 > bb.offsideLimitDir) {
            z1 = bb.offsideLimitDir;
            z0 = z1 - profundidade;
        }
    }

    /*
    LIMITES: as LINHAS DE FUNDO, e mais nada. O rectangulo desloca-se inteiro
    para dentro do campo e NUNCA muda de tamanho - encolher aproximaria as
    linhas da equipa sem ninguem ter mexido na compacidade.

    Sairam daqui tres travoes que paravam o bloco antes das linhas: o
    margemFundo (0.94, ~3.2 m antes) e o recuoMax (-42, na marca de grande
    penalidade), mais a compressao contra eles.
    */
    const fundo = CAMPO_COMP / 2;

    if (z0 < -fundo) {
        z0 = -fundo;
        z1 = z0 + profundidade;
    }
    if (z1 > fundo) {
        z1 = fundo;
        z0 = z1 - profundidade;
    }

    /* --- largura -------------------------------------------------------- */

    const largura = CAMPO_LARG * B.amplitude[compac];
    const meiaLarg = largura / 2;

    // Limite lateral: a LINHA LATERAL. A borda do bloco encosta-lhe.
    const borda = CAMPO_LARG / 2;
    const maxCentroX = borda - meiaLarg;

    /*
    BASCULACAO: o centro do rectangulo ACOMPANHA A BOLA, 1:1, ate onde o campo
    deixa.

    Nao e uma fraccao do desvio da bola. Com a bola em x = 10 o centro esta em
    x = 10; a partir dai o rectangulo encosta a margem e o centro fica em
    maxCentroX (a folga entre a borda do bloco e a margem do campo), que e o
    mais longe que ele pode ir sem sair do campo.

    Duas versoes anteriores escalavam o desvio - `momentumX * maxCentroX`
    (1:0.34) e `momentumX * (CAMPO_LARG/2) * BlockShape.bascular` (1:0.22) - e
    o bloco andava sempre muito menos do que a bola.
    */
    let centroX = THREE.MathUtils.clamp(
        bb.momentumX * (CAMPO_LARG / 2), -maxCentroX, maxCentroX);

    // O centro não pode ficar para trás da linha da bola (lateralmente)
    let bolaX = bb.ballX;
    if (bolaX > 0 && centroX < bolaX) centroX = bolaX;
    if (bolaX < 0 && centroX > bolaX) centroX = bolaX;

    // Sem basculacao extra por postura: o centro segue a bola e mais nada.

    // Garante que o rectangulo nao sai do campo
    centroX = THREE.MathUtils.clamp(centroX, -maxCentroX, maxCentroX);

    bb.bloco = {
        x0: centroX - meiaLarg,
        x1: centroX + meiaLarg,
        z0: z0,
        z1: z1,
        modo: modo
    };

    /*
    A linha do fora-de-jogo da equipa E a traseira do bloco - um calculo so.
    Substitui o computeDefensiveLine, que a calculava por uma formula propria
    (`bola - 8 m`, com os seus proprios tectos) e discordava do rectangulo.
    */
    bb.defLineDir = z0;
    bb.defLineZ = z0 * bb.dir;

    // O painel de debug desenha estes: mantidos em sincronia com o que e
    // mesmo aplicado, ao contrario do blockBottom/blockTop antigos, que eram
    // calculados, desenhados e depois ignorados pelo clamp.
    bb.blockBottom = z0;
    bb.blockTop = z1;

    return bb.bloco;
}

/*
Onde este jogador fica dentro do bloco, em metros no mundo.

    p.slot.u   0..1 da esquerda para a direita do bloco
    p.slot.v   0..1 da última linha para a frente do bloco

O LineShape puxa o v conforme a linha (def/mid/atk) e conforme a equipa tem ou
não a bola, e fecha o u lateralmente. É a camada 2 que o senhor pediu: um
ajuste por linha, com e sem bola, por cima da forma da formação.
*/
function slotNoBloco(p, bb) {
    const bloco = bb.bloco;
    if (!bloco || !p.slot) return null;

    const linha = LineShape[p.role] || LineShape.mid;
    const desvioLinha = bb.isAttacking ? linha.comBola : linha.semBola;

    /*
    v: a profundidade da FORMACAO, deslocada pela linha (ver LineShape).

    Era `lerp(p.slot.v, alvo, empurrar)` - um lerp para um alvo comum, com
    empurrar ate 0.80, que projectava a linha inteira quase no mesmo v: num
    4-4-2 sem bola os centrais saiam em 0.016 e os laterais em 0.034, meio
    metro de diferenca dentro de um bloco de 30 m. A formacao tactica nao
    chegava ao campo. Deslocar em vez de projectar mantem o espacamento.
    */
    let v = p.slot.v + desvioLinha;

    // Ajuste fino por posicao especifica (lateral a frente do central, medio
    // de ponta sobe mais na construcao) - ver PositionDepthNudge.
    const nudge = PositionDepthNudge[p.pos];
    if (nudge) {
        if (bb.isAttacking) {
            const fbStyle = (p.pos === 'LB' || p.pos === 'RB') ? FullBackStyle[p.fbStyle] : null;
            v += nudge.comBola * (fbStyle ? fbStyle.comBolaMult : 1);
        } else {
            v += nudge.semBola;
        }
    }
    v = THREE.MathUtils.clamp(v, 0, 1);

    // u: fecha lateralmente em torno do eixo central do bloco (0.5).
    const fechoLinha = LineShape.fecho[p.role] || LineShape.fecho.mid;
    const fecho = bb.isAttacking ? fechoLinha.comBola : fechoLinha.semBola;

    /*
    Sem espelho aqui. O `u` JA vem no referencial do mundo: o match.js
    espelha-o para a TeamB (`(-x + 1) / 2`), tal como espelha o baseTarget.
    O `if (bb.dir === -1) u = 1 - u` que aqui estava era um SEGUNDO espelho -
    desfazia o primeiro e punha o lateral direito da TeamB no lado esquerdo
    do campo, em contradicao com o baseTarget dele.
    */
    const u = 0.5 + (p.slot.u - 0.5) * fecho;

    return {
        x: bloco.x0 + u * (bloco.x1 - bloco.x0),
        z: (bloco.z0 + v * (bloco.z1 - bloco.z0)) * bb.dir
    };
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
const PosicionamentoAI = {
    tick: function (p, bb) {
        if (p.role === 'gk') return;   // o GK posiciona-se em updateGK()

        const slot = slotNoBloco(p, bb);
        let targetX = slot ? slot.x : p.baseTarget.x;
        let targetZ = slot ? slot.z : p.baseTarget.z;

        // Anel grande do debug: o slot puro, antes de qualquer desvio.
        if (!p.slotTarget) p.slotTarget = new THREE.Vector3();
        p.slotTarget.set(targetX, ALTURA_BASE_Y, targetZ);

        const comEstilo = (typeof aplicarEstiloPosicional === 'function')
            ? aplicarEstiloPosicional(p, bb, targetX, targetZ)
            : { x: targetX, z: targetZ };

        const tx = THREE.MathUtils.clamp(comEstilo.x, -32, 32);
        const tz = THREE.MathUtils.clamp(comEstilo.z, -50, 50);

        const dt = (typeof Match !== 'undefined' && Match.delta) ? Match.delta : 0.016;
        let k = 1 - Math.exp(-PositionSmoothing * dt);
        if (p.snapPosition) { k = 1; p.snapPosition = false; }

        if (!p.tacticalTarget) p.tacticalTarget = new THREE.Vector3(tx, ALTURA_BASE_Y, tz);
        p.tacticalTarget.x = lerp(p.tacticalTarget.x, tx, k);
        p.tacticalTarget.z = lerp(p.tacticalTarget.z, tz, k);
        p.tacticalTarget.y = ALTURA_BASE_Y;

        if (!p.styleTarget) p.styleTarget = new THREE.Vector3(tx, ALTURA_BASE_Y, tz);
        p.styleTarget.copy(p.tacticalTarget);

        p.dynamicTarget.x = lerp(p.dynamicTarget.x, tx, k);
        p.dynamicTarget.z = lerp(p.dynamicTarget.z, tz, k);
        p.dynamicTarget.y = ALTURA_BASE_Y;
    }
};
