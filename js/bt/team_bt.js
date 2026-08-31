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

/*
Esta equipa manda alguém à bola?

Função pura, à parte, porque foi aqui que se perdeu a bola durante 25 segundos
em quatro dos vinte jogos de um lote: as duas guardas abaixo, cada uma
sensata sozinha, DESLIGAVAM AS DUAS EQUIPAS AO MESMO TEMPO.

O caso: bola SOLTA no terço ofensivo do TeamA, posse nominal do TeamB.
  - o TeamB não perseguia porque "está a atacar" — mas não tinha portador
    nenhum, a bola estava parada no chão;
  - o TeamA não perseguia porque a bola estava no seu campo de ataque, e sem
    pressão alta não se avança para lá.

Ninguém ia buscá-la. O vigia do js/simulate.js apanhou-o com a bola imóvel
perto da linha e os 22 jogadores em MOVE_TO_POS, MARKING e SUPPORT_PASS — nem
um único a perseguir.

    COM A BOLA SOLTA, AS DUAS GUARDAS NÃO SE APLICAM.

É o que o futebol faz: bola no chão sem dono, vai-se buscar, esteja onde
estiver. As guardas continuam a valer para bola COM portador, que é o caso
que elas foram escritas para tratar (não subir o bloco para pressionar quem
tem a bola).
*/
function deveMandarChaser(o) {
    // Guarda-redes com a bola: não se vai lá.
    if (o.gkTemBola) return false;

    if (o.bolaSolta) return true;

    if (o.isAttacking) return false;

    /*
    EMERGÊNCIA: com a bola no próprio terço defensivo persegue-se sempre, seja
    qual for a pressão escolhida. Sem isto, uma equipa em pressão baixa deixava
    o portador entrar na área a conduzir sem ninguém lhe sair ao caminho.
    */
    if (typeof o.tercoDeEmergencia === 'number' &&
        o.bolaZ * o.dir < o.tercoDeEmergencia) return true;

    // Sem pressão alta, a perseguição activa é só no próprio campo de defesa.
    if (!o.pressaoAlta && o.bolaZ * o.dir > 0) return false;

    /*
    E SÓ SE VALER A PENA SAIR. Isto não existia: mandava-se um caçador em todos
    os frames em que a bola estava do lado certo do campo, sem condição de
    distância nenhuma, e ele corria atrás do portador o jogo inteiro. Um bloco
    mantém a forma e só sai quando o portador entra no alcance de quem está de
    guarda — ver MarkingModel.raioDeAccionamento.

    Sem a medida (chamadas antigas, testes) mantém-se o comportamento de
    sempre: quem não sabe a distância não pode decidir com ela.
    */
    if (typeof o.distAoPortador === 'number' && typeof o.raioAccionamento === 'number') {
        return o.distAoPortador <= o.raioAccionamento;
    }
    return true;
}

/*
Alguem esta a conduzir a bola neste instante? Percorre os dois planteis: o
condutor pode ser do outro lado, e e justamente esse o caso que interessa —
nao se manda um cacador atras de uma bola que o adversario esta a conduzir com
o toque a frente.
*/
function alguemAConduzir() {
    if (typeof Match === 'undefined') return false;
    const listas = [Match.players, Match.opponents];
    for (const lista of listas) {
        if (!lista) continue;
        for (const p of lista) {
            if (p && (p.carryTouchGrace || 0) > 0) return true;
        }
    }
    return false;
}

function pickChaser(bb) {
    const ballPos = Match.ball.position;
    /*
    A BOLA SO ESTA SOLTA SE NINGUEM A ESTIVER A CONDUZIR.

    `!Match.ballCarrier` sozinho nao chega, e era por aqui que fugia a
    perseguicao ao campo todo: o toque da conducao LARGA a bola de proposito —
    `ballCarrier = null` por ~0.3 s a cada toque (ver o case CARRY na fsm.js).
    Nessa janela `bolaSolta` ficava true, e o `deveMandarChaser` devolve true
    incondicionalmente com bola solta: sem metade do campo, sem raio, sem nada.

    Como conduzir e uma sequencia de toques, isso reabria a porta a CADA TOQUE.
    Resultado no ecra: o avancado adversario a pressionar o central o campo
    inteiro, com pressao balanceada e mentalidade equilibrada — exactamente o
    que essas duas opcoes dizem que nao deve acontecer.

    A graca de conducao e o campo que diz "esta bola tem dono, ele ja vem
    busca-la". Contar com ela aqui e o que faz a equipa sem bola voltar ao
    bloco em vez de correr atras dela.
    */
    /*
    E UMA BOLA NO AR COM DESTINATARIO NAO ESTA SOLTA — ESTA ENDERECADA.

    Assim que o passe sai, `ballCarrier` fica null e a bola contava como solta;
    o `deveMandarChaser` responde true incondicionalmente a bola solta, antes
    sequer de olhar para a fase, para a metade do campo ou para o raio. A
    equipa que defende mandava um chaser atras da bola AO MESMO TEMPO que o
    `pickIntercetor` mandava um intercetor, e a equipa que passou ja tinha o
    destinatario a caminho: tres pessoas a convergir na mesma bola, duas delas
    do mesmo lado a fazer o mesmo trabalho.

    Das duas, o chaser e a pior: aponta a posicao ACTUAL da bola, um ponto que
    ja se moveu quando ele la chega. O intercetor tem a conta do tempo de voo e
    o ponto de encontro — e esse fica.

    Com o destinatario conhecido, o chaser volta as guardas normais (distancia
    ao portador, metade do campo, pressao) e so arranca quando a bola aterra e
    volta a ter dono. O `intendedReceiver` e limpo quando o passe morre (ver
    updateBall em match.js), portanto uma bola realmente perdida volta a ser
    disputada no frame seguinte.
    */
    const bolaSolta = !Match.ballCarrier && !alguemAConduzir() && !Match.intendedReceiver;

    /*
    A que distância está o mais perto do portador. É esta medida que decide se
    vale a pena sair à bola — tem de ser calculada ANTES da decisão, e é sobre
    o portador e não sobre a bola: são coisas diferentes enquanto ele a conduz.
    */
    let distAoPortador = Infinity;
    if (Match.ballCarrier) {
        for (const p of bb.outfield) {
            const d = p.model.position.distanceTo(Match.ballCarrier.model.position);
            if (d < distAoPortador) distAoPortador = d;
        }
    }
    const M = (typeof MarkingModel !== 'undefined') ? MarkingModel : null;
    const pressao = (typeof Tatics !== 'undefined' && Tatics.pressaoDefensiva) || 'balanced';
    const raioAccionamento = (M && M.raioDeAccionamento &&
        M.raioDeAccionamento[pressao] !== undefined)
        ? M.raioDeAccionamento[pressao] : undefined;

    /*
    PASSE EM CURSO: QUEM VAI A BOLA E QUEM A VAI RECEBER.

    Sem isto o PASSADOR corria atras da sua propria bola. No instante em que o
    passe sai, `Match.ballCarrier` fica null e o passador e, por construcao,
    quem esta mais perto dela: ganhava a eleicao contra o destinatario e ia
    atras do passe que acabara de dar.

    Corre ANTES do `deveMandarChaser`, e nao depois. Uma bola endereçada deixou
    de contar como solta (ver o `bolaSolta` la em baixo), e com a equipa em
    posse o `deveMandarChaser` responde `false` — o destinatario ficava sem
    ninguem a ir buscar o passe que vinha para ele. Quem tem o passe a caminho
    vai busca-lo, e isso nao e uma decisao de bloco: e o passe da propria
    equipa.

    Serve tambem a conducao: o toque a frente poe `intendedReceiver` no proprio
    condutor, e assim continua a ser ele a ir buscar a bola.
    */
    if (Match.intendedReceiver && Match.intendedReceiver.team === bb.team &&
        bb.outfield.indexOf(Match.intendedReceiver) !== -1) {
        if (typeof MatchStats !== 'undefined' && bb.chaser &&
            bb.chaser !== Match.intendedReceiver) {
            MatchStats[bb.team].trocasChaser++;
        }
        bb.chaser = Match.intendedReceiver;
        return;
    }

    const podeIr = deveMandarChaser({
        distAoPortador: distAoPortador,
        raioAccionamento: raioAccionamento,
        tercoDeEmergencia: M ? M.tercoDeEmergencia : undefined,
        isAttacking: bb.isAttacking,
        bolaSolta: bolaSolta,
        bolaZ: ballPos.z,
        dir: bb.dir,
        pressaoAlta: (typeof Tatics !== 'undefined' && Tatics.pressaoDefensiva === 'high'),
        gkTemBola: (bb.oppCarrier && bb.oppCarrier.role === 'gk') ||
            (bb.carrier && bb.carrier.role === 'gk')
    });
    if (!podeIr) { bb.chaser = null; return; }

    const prevChaser = bb.chaser;

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

    /*
    BOLA SOLTA MAS JÁ COM ALGUÉM A CAMINHO: mais ninguém vai atrás dela.

    `Match.ballCarrier` não chega como guarda. O toque da condução larga a bola
    de propósito — `hasBall = false`, `ballCarrier = null` por ~0.3 s (ver o
    case CARRY em fsm.js) — e nessa janela a eleição corria na mesma. O próprio
    condutor está fora da lista de candidatos (`intendedReceiver === p`), mas os
    COLEGAS não: o que estivesse mais perto do ponto de interceção batia o tempo
    dele por `margemMelhor`, entrava em INTERCEPT e ia disputar a bola com quem
    a estava a conduzir. Dois do mesmo lado a tirar a bola um ao outro.

    Num passe normal o destinatário já vai lá, mas num lançamento alto errado
    um colega por trás pode e deve cabecear a bola antes que ela caia no
    adversário. O `escolherIntercetor` só o escolhe se for claramente melhor do
    que o destinatário (margemMelhor), por isso passes normais não sofrem
    interferência.
    */
    for (const p of bb.outfield) {
        if (p && p.carryTouchGrace > 0) return;
    }
    if (typeof PerceptionModel === 'undefined') return;

    const janela = PerceptionModel.janelaIntercetar;
    const margem = PerceptionModel.margemMelhor;

    const candidatos = [];
    for (const p of bb.outfield) {
        if (!p || p.role === 'gk') continue;
        if (bb.chaser === p) continue;
        if (Match.intendedReceiver === p) continue;

        const bola = p.blackboard && p.blackboard.ball;
        const pz = p.model.position.z;
        const emDisputaAereaNaArea = (bola && bola.tipo === 'cabeca' || (typeof Match !== 'undefined' && Match.ball && Match.ball.position.y > 0.8)) && Math.abs(pz) > 26;
        if (!emDisputaAereaNaArea && typeof estouAMarcar === 'function' && estouAMarcar(p)) continue;

        if (!bola || !bola.interceptable || !bola.interceptionPoint) continue;
        if (bola.timeToIntercept > janela) continue;

        const ipt = bola.interceptionPoint;
        const px = p.model.position.x;
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
4. O centro fica 5 metros À FRENTE da linha da bola, e "à frente" depende da
   fase: com bola (T.Ataque/Ataque) é entre a bola e a baliza ATACADA (+5);
   sem bola (T.Defesa/Defesa) é entre a bola e a baliza DEFENDIDA (-5).
*/
/*
O COMPRIMENTO DO BLOCO — quem manda, e por que ordem.

    1. A FASE. A defender é sempre `short` (30 m), e nada por cima disso.
    2. A MENTALIDADE. T.Defensiva e Defensiva impõem `short` também a atacar.
    3. O PAINEL (Length Compactness), para o resto.

A fase entrava no CENTRO do bloco (o ±5 do targetOffsetZ) mas nunca no
comprimento: a defender desenhava-se o mesmo rectângulo de 50 m que se desenha
a atacar, e via-se no ecrã como uma equipa esticada sem bola. Não havia caminho
nenhum no código que levasse a `short` por ser fase defensiva — só a
Mentalidade lá chegava, e essa é uma escolha do utilizador para o jogo todo, não
uma resposta ao momento.

O PAINEL DEIXA DE MANDAR NO COMPRIMENTO A DEFENDER, e isso é de propósito: o
Length Compactness passa a ser o bloco COM bola. A largura fica de fora, como
sempre esteve — fechar em largura entrega as alas e isso continua a ser escolha
de quem joga.
*/
function escolherProfundidade(bb) {
    const B = BlockShape;
    if (bb && !bb.isAttacking) return 'short';

    const mental = (typeof MentalidadeModel !== 'undefined') ? MentalidadeModel[Tatics.estilo] : null;
    const pedido = (mental && mental.profundidade) ? mental.profundidade : Tatics.lengthCompactness;
    return B.profundidade[pedido] !== undefined ? pedido : 'median';
}

function computeBlock(bb) {
    const B = BlockShape;
    const modo = bb.isAttacking ? 'comBola' : 'semBola';
    const compac = B.amplitude[Tatics.compactness] !== undefined
        ? Tatics.compactness : 'median';
    const compacLength = escolherProfundidade(bb);

    /* --- profundidade --------------------------------------------------- */
    const profundidade = CAMPO_COMP * B.profundidade[compacLength];

    /* --- centro em Z (Regra 1 e Regra 4) -------------------------------
       CENTRO 5 METROS À FRENTE DA LINHA DA BOLA, com o sinal a depender da fase
       No referencial de ataque da equipa (bb.dir):
       - + é em direção ao ataque (à frente)
       - - é em direção à defesa (atrás)
    */
    const dtMatch = (typeof Match !== 'undefined' && Match.delta) ? Match.delta : 0.016;
    const reposta = (typeof Match !== 'undefined' && Match.state !== 'PLAY');

    /*
    NOVO SISTEMA DE BLOCOS (Defesa, Meio, Ataque)
    As posições baseiam-se na linha da bola, mas têm comportamentos diferentes
    dependendo da fase do jogo, evitando que o time estique num único retângulo gigante.
    */
    let isOffensive = typeof Tatics !== 'undefined' && 
        (Tatics.estilo === 'ataque' || Tatics.estilo === 'muito_ofensiva');
    let bZ = (typeof bb.bolaZSuave === 'number' ? bb.bolaZSuave : (bb.ballZ || 0)) * bb.dir;
    
    let targetOffsetZ = 0;
    let offsetDefesa = (isOffensive ? 5.0 : 0.0) + (profundidade / 3);
    let offsetMeio = 10.0;
    let offsetAtaque = 5.0 - (profundidade / 3);

    if (bb.isAttacking) {
        if (bZ < -20.0) {
            let dist = Math.min(10.0, -20.0 - bZ);
            let f = dist / 10.0;
            targetOffsetZ = offsetMeio * (1 - f) + offsetDefesa * f;
        } else if (bZ > 20.0) {
            let dist = Math.min(10.0, bZ - 20.0);
            let f = dist / 10.0;
            targetOffsetZ = offsetMeio * (1 - f) + offsetAtaque * f;
        } else {
            targetOffsetZ = offsetMeio;
        }
    } else {
        targetOffsetZ = -5.0;
        // Pedido: Na T.ofensive e Offensive no setor defensivo, o centro do retângulo de defesa 
        // tem que se manter uns 5 metros a frente da bola para puxar o time a frente.
        if (isOffensive && bZ < 0) {
            targetOffsetZ = offsetDefesa;
        }
    }

    if (bb.blocoZSuave === undefined) {
        bb.blocoZSuave = targetOffsetZ;
    } else {
        bb.blocoZSuave = seguirBola(bb.blocoZSuave, targetOffsetZ, BlockShape.seguimentoBola, dtMatch, reposta);
    }

    const mentalBloco = (typeof MentalidadeModel !== 'undefined' &&
        MentalidadeModel[Tatics.estilo] &&
        typeof MentalidadeModel[Tatics.estilo].blocoZ === 'number')
        ? MentalidadeModel[Tatics.estilo].blocoZ : 0;

    const bolaZDir = bb.bolaZSuave * bb.dir;
    let centroZ = bolaZDir + bb.blocoZSuave + mentalBloco;

    let z0 = centroZ - (profundidade / 2);
    let z1 = centroZ + (profundidade / 2);

    /* --- limites em Z (Regra 2 e Regra 3) ------------------------------- */
    const fundo = typeof LINHA_FUNDO !== 'undefined' ? LINHA_FUNDO : CAMPO_COMP / 2;
    const profArea = typeof Area !== 'undefined' ? Area.profundidade : 16.5;
    const minZ = -(fundo - profArea);
    
    // No tiro de meta, ninguem pode invadir a area (quem defende o tiro de meta tem o maxZ capado)
    const isGoalKick = typeof Match !== 'undefined' && Match.state === 'GOAL_KICK';
    let maxZ = (fundo - 1.5);
    if (isGoalKick) {
        maxZ = fundo - profArea;
    }

    // Bloco rígido, não pode se deformar (a distância entre z0 e z1 será sempre `profundidade`)
    if (z0 < minZ) {
        let shift = minZ - z0;
        z0 = minZ;
        z1 += shift;
    } else if (z1 > maxZ) {
        let shift = maxZ - z1;
        z1 = maxZ;
        z0 += shift;
    }

    if (!bb.isAttacking && typeof TeamShape !== 'undefined' &&
        typeof Tatics !== 'undefined' && TeamShape.linhaDefensiva) {
        
        const capBase = TeamShape.linhaDefensiva[Tatics.linhaDefensiva]
            ?? TeamShape.linhaDefensiva.medium;
        const pesoMental = (typeof MentalidadeModel !== 'undefined' &&
            typeof MentalidadeModel.pesoNaLinha === 'number')
            ? MentalidadeModel.pesoNaLinha : 0;
        const capLinha = capBase + mentalBloco * pesoMental;

        let maisRecuadoDir = null, pisoDir = null;
        if (bb.opp && bb.opp.length) {
            for (const o of bb.opp) {
                if (!o || o.role === 'gk' || !o.model) continue;
                const zDir = o.model.position.z * bb.dir;
                if (maisRecuadoDir === null || zDir < maisRecuadoDir) maisRecuadoDir = zDir;
            }
        }
        if (bb.own && bb.own.length) {
            const gk = bb.own.find(pl => pl && pl.role === 'gk' && pl.model);
            if (gk) pisoDir = gk.model.position.z * bb.dir + 1.0;
        }

        const M = (typeof MarkingModel !== 'undefined') ? MarkingModel : null;
        const distancia = (M && M.distanciaPorPressao)
            ? (M.distanciaPorPressao[Tatics.pressaoDefensiva] ?? M.distanciaPorPressao.balanced)
            : 3.0;

        let lastLine = recuoDaUltimaLinha(z0, maisRecuadoDir, distancia, pisoDir, capLinha);
        
        // Empurra o bloco inteiro a partir da nova âncora traseira, para não haver deformação
        let diff = lastLine - z0;
        z0 += diff;
        z1 += diff;

        // Se a nova âncora jogar o ataque pra fora, corrigimos rigidamente:
        if (z0 < minZ) {
            let shift = minZ - z0;
            z0 = minZ;
            z1 += shift;
        } else if (z1 > maxZ) {
            let shift = maxZ - z1;
            z1 = maxZ;
            z0 += shift;
        }
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

    const L = (typeof BlockShape !== 'undefined' && BlockShape.linhas)
        ? BlockShape.linhas : { defesa: 0.0, meio: 0.5, ataque: 1.0 };

    bb.bloco = {
        x0: x0,
        x1: x1,
        z0: z0,
        z1: z1,
        /*
        AS TRÊS LINHAS. Fracções em BlockShape.linhas — ver a nota lá, com a
        medição. O ataque era `z0 + 2/3 da profundidade`, e isso deixava o
        terço da frente do bloco vazio por construção: o avançado (v = 1.0)
        parava a dois terços e arrastava a formação toda com ele.
        */
        zDef: z0 + (z1 - z0) * L.defesa,
        zMid: z0 + (z1 - z0) * L.meio,
        zAtk: z0 + (z1 - z0) * L.ataque,
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
        return ballCorredor * (o.isLateral ? 1.0 : 1.25);
    }

    // Mesmo lado da bola: o lateral abre para dar linha de passe pela ala, e
    // so com bola — sem ela, abrir e deixar o corredor interior a descoberto.
    if (o.isLateral && o.isAttacking) return ballCorredor * 4.0;
    return 0;
}

/*
Calcula a posição no mundo de um slot específico dentro do bloco tático.
*/
/*
OS LIMITES DO BLOCO NO MUNDO, com o empurrão que o mete dentro das linhas.

Existe porque o corte final do nível 1 (tickBase) e o corte de dentro do
`calcularPontoDoSlot` têm de usar EXACTAMENTE a mesma moldura — dois cálculos
do mesmo rectângulo é como se acaba com o anel do debug meio metro fora da
linha desenhada.

Devolve x/z já no referencial do mundo (o `bloco.z*` é do referencial de
ataque da equipa, ver computeBlock).
*/
function limitesDoBloco(bb) {
    const bloco = bb && bb.bloco;
    if (!bloco) return null;

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

    const zA = (bloco.z0 + empurraZ) * bb.dir;
    const zB = (bloco.z1 + empurraZ) * bb.dir;

    return {
        empurraX: empurraX,
        empurraZ: empurraZ,
        xMin: Math.min(bloco.x0, bloco.x1) + empurraX,
        xMax: Math.max(bloco.x0, bloco.x1) + empurraX,
        zMin: Math.min(zA, zB),
        zMax: Math.max(zA, zB)
    };
}

function calcularPontoDoSlot(slot, pos, role, fbStyle, bb, linhaActual, fecharPorPar, ordemNaLinha, totalNaLinha) {
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
            let fbSt = (pos === 'LB' || pos === 'RB') ? FullBackStyle[fbStyle] : null;
            const isDefMental = (typeof Tatics !== 'undefined' && (Tatics.estilo === 'defesa' || Tatics.estilo === 'muito_defensiva'));
            let mult = fbSt ? fbSt.comBolaMult : 1;
            if (isDefMental) {
                if (pos === 'LB' || pos === 'RB') mult = FullBackStyle.defensive.comBolaMult;
                if (pos === 'LM' || pos === 'RM') mult = 0.0;
            }
            v += nudge.comBola * mult;
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

    /*
    A LINHA FECHA-SE QUANDO PERDE GENTE. Com a linha completa este factor é 1.0
    e o `u` sai exactamente como saía — foi a condição imposta a esta
    alteração. A perder um, os que ficam aproximam-se do eixo: é isto que faz
    o central que sobra e o lateral do lado oposto fecharem para o meio quando
    o outro central sobe. Ver LineShape.porFalta e classificarLinhas.
    */
    const fechoOcup = (typeof fechoPorOcupacao === 'function')
        ? fechoPorOcupacao(bb, linhaActual || role) : 1.0;

    // O de trás do par lateral/meia-lateral fecha para o eixo — ver a regra do
    // par em classificarLinhas.
    const fechoPar = (fecharPorPar && LineShape && typeof LineShape.parFecho === 'number')
        ? LineShape.parFecho : 1.0;

    /*
    LINHA INCOMPLETA: REPARTE-SE POR INTERVALOS IGUAIS, CENTRADA.

    Encolher a linha mantendo o `u` da formação preserva o espaçamento original,
    e com a 442 isso dá dois juntos ao centro e um muito aberto — medido, 3.65 m
    de diferença entre os dois intervalos de um trio.

    Com `n` na linha, os lugares são 1/(n+1), 2/(n+1)... — três dão 0.25, 0.50 e
    0.75, iguais e centrados. A ORDEM é a da formação (`ordemNaLinha`), portanto
    ninguém troca de lado: o da esquerda continua à esquerda.

    Com a linha completa não se toca em nada: o `u` da formação é a intenção do
    treinador e é ela que manda.
    */
    let uBase = slot.u;
    if (typeof ordemNaLinha === 'number' && typeof totalNaLinha === 'number' &&
        totalNaLinha > 0 && bb.linhas && bb.linhas.nominal) {
        const nom = bb.linhas.nominal[linhaActual || role] || 0;
        if (nom > 0 && totalNaLinha < nom) {
            uBase = (ordemNaLinha + 1) / (totalNaLinha + 1);
        }
    }

    const u = THREE.MathUtils.clamp(
        0.5 + (uBase - 0.5) * fecho * fechoSec * fechoAdicional * fechoOcup * fechoPar, 0.02, 0.98);
    // Uma fonte só para a moldura — ver limitesDoBloco.
    const limB = limitesDoBloco(bb);
    const empurraX = limB.empurraX;
    const empurraZ = limB.empurraZ;

    let xTarget = bloco.x0 + u * (bloco.x1 - bloco.x0) + empurraX;
    
    /*
    O `v` da formação (0 = mais recuado, 1 = mais adiantado) interpola entre as
    TRÊS linhas do bloco. O ponto de charneira é o `v` = 0.5 da formação e não
    a fracção da linha do meio: são coisas diferentes — o primeiro é onde o
    jogador está na formação, o segundo é onde a linha do meio está no bloco.
    */
    let targetZRaw;
    if (v < 0.5) {
        // Metade de trás da formação: entre a linha de defesa e a do meio.
        targetZRaw = bloco.zDef + (v / 0.5) * (bloco.zMid - bloco.zDef);
    } else {
        // Metade da frente: entre a linha do meio e a do ataque.
        targetZRaw = bloco.zMid + ((v - 0.5) / 0.5) * (bloco.zAtk - bloco.zMid);
    }
    
    let zTarget = (targetZRaw + empurraZ) * bb.dir;

    if (bb.isAttacking) {
        // A linha defensiva (centrais e laterais) acompanha a linha da bola.
        const bolaZDir = (typeof bb.bolaZSuave === 'number' ? bb.bolaZSuave : (bb.ballZ || 0)) * bb.dir;
        let zAlvoDir = zTarget * bb.dir;
        
        let distFrente = 5;
        let distTras = 5;

        let emProfundidade = bb.isCounter || role === 'atk' || pos === 'LW' || pos === 'RW' || pos === 'LWB' || pos === 'RWB';
        if (emProfundidade) {
            distFrente = 20;
        }
        
        if (role === 'def' || pos === 'DM') {
            distTras = 15;
            distFrente = 0; 
            
            if (pos === 'LB' || pos === 'RB' || pos === 'LWB' || pos === 'RWB') {
                distFrente = 10;
            }
        }
        
        let isGkHolding = typeof Match !== 'undefined' && Match.gkHoldingBall && Match.gkHoldingBall[bb.team];
        let isGkCarrier = bb.carrier && bb.carrier.role === 'gk' && bb.carrier.team === bb.team;
        let gkComBola = isGkHolding || isGkCarrier;
        let portadorBloqueado = false;
        
        if (bb.carrier && bb.carrier.team === bb.team && !gkComBola) {
            const oppCarrier = bb.oppCarrier;
            if (oppCarrier && bb.carrier.model.position.distanceTo(oppCarrier.model.position) < 4.0) {
                portadorBloqueado = true;
            }
        }
        
        if (portadorBloqueado) {
            distTras = 12; 
            distFrente = Math.min(distFrente, 3); 
        }
        
        if (gkComBola) {
            distFrente = Math.max(distFrente, 60); // Permite que o time se espalhe pelo campo todo
            distTras = Math.max(distTras, 15);
        }

        if (zAlvoDir > bolaZDir + distFrente) {
            zAlvoDir = bolaZDir + distFrente;
        }
        
        if (zAlvoDir < bolaZDir - distTras) {
            zAlvoDir = bolaZDir - distTras;
        }

        const isWideRole = pos === 'LB' || pos === 'RB' || pos === 'LM' || pos === 'RM';
        let forceOffensiveWide = isWideRole; // Aplica-se na T.Ofensiva e Ofensiva (que é bb.isAttacking)

        if (forceOffensiveWide) {
            // Pedido: laterais e meias pelas laterais tem que se projetar uns 7 metros a frente da posição do teamsBT
            zAlvoDir += 7.0;
        }

        if (role === 'def') {
            const limiteCirculo = (typeof TeamShape !== 'undefined' && typeof TeamShape.limiteSaidaCirculoCentral === 'number')
                ? TeamShape.limiteSaidaCirculoCentral : 0.0;
            const zMidDir = bloco.z0 + 0.45 * (bloco.z1 - bloco.z0);
            const zDefTeto = zMidDir - 3.5;
            
            const zLatAcompanha = Math.min(limiteCirculo, zDefTeto + 1.5);
            const zCBAcompanha = Math.min(limiteCirculo, zDefTeto);
            
            if (pos === 'CB' && zAlvoDir > zCBAcompanha) {
                zAlvoDir = zCBAcompanha;
            } else if ((pos === 'LB' || pos === 'RB') && zAlvoDir > zLatAcompanha && !forceOffensiveWide) {
                zAlvoDir = zLatAcompanha;
            }
        }

        const minZDef = -(CAMPO_COMP / 2 - 1.5);
        if (zAlvoDir < minZDef) zAlvoDir = minZDef;
        const maxZAtk = (CAMPO_COMP / 2 - 1.5);
        if (zAlvoDir > maxZAtk) zAlvoDir = maxZAtk;

        /*
        O BLOCO É O ÚLTIMO A FALAR, E FALA SEMPRE.

        Toda a régua acima — `distFrente`/`distTras` a partir da linha da bola,
        o +7 dos corredores, o tecto do círculo central — é medida À BOLA, não
        ao rectângulo, e podia pôr o slot a dezenas de metros fora dele. O caso
        extremo era o tiro de meta: bola na própria linha de fundo, traseira do
        bloco travada em `-(LINHA_FUNDO - Area.profundidade)`, e os slots iam
        à bola 11 m atrás da moldura.

        Com o corte aqui, o anel GRANDE do debug (`slotTarget`, o nível 1) está
        SEMPRE dentro do rectângulo desenhado. O que sai de lá é obra do nível 2
        (marcação, mola, inquietação — o anel médio), e isso é a diferença que
        permite dizer qual das camadas desalinhou o jogador.

        `empurraZ` entra porque é o mesmo desvio que o `targetZRaw` leva quando
        o bloco assoma para fora das linhas do campo.
        */
        const zMinBloco = Math.min(bloco.z0, bloco.z1) + empurraZ;
        const zMaxBloco = Math.max(bloco.z0, bloco.z1) + empurraZ;
        zAlvoDir = THREE.MathUtils.clamp(zAlvoDir, zMinBloco, zMaxBloco);

        zTarget = zAlvoDir * bb.dir;
    }

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
    return calcularPontoDoSlot(p.slot, p.pos, p.role, p.fbStyle, bb, p.linhaActual, p.fecharPorPar,
        p.ordemNaLinha, p.totalNaLinha);
}

/*
Garante a estabilidade dos slots táticos por posição (evita cruzamentos erráticos de centrais ou médios).
*/
function otimizarSlotsPorPosicao(lista, bb) {
    // Foi removido o congelamento (slotInicial) porque quebrava a inversão de 
    // campo ao intervalo e ignorava mudanças táticas feitas pelo utilizador.
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
    /*
    SÓ A DEFENDER. A árvore do jogador já tinha esta guarda no `podeMarcar`;
    esta camada não tinha nenhuma, e corria para as duas equipas todos os
    frames. A equipa COM a bola era puxada até 10 m na direcção do adversário
    mais perto de cada slot: os avançados colavam-se aos centrais em vez de
    procurarem espaço, e em campo lia-se como "os atacantes correm atrás dos
    defensores".

    Sem `bb` também não se marca: não se sabe a fase, e adivinhar uma é
    exactamente o defeito que isto vem corrigir.
    */
    if (!bb || bb.isAttacking) {
        return { x: targetX, z: targetZ };
    }

    const M = MarkingModel;
    let distancia = M.distanciaPorPressao[Tatics.pressaoDefensiva]
        ?? M.distanciaPorPressao.balanced;

    /*
    A METADE DEFENSIVA DO ESTILO aperta ou alivia esta distância — ver
    `distanciaComEstilo` (playing_styles.js). O `pressao` estava na config
    desde sempre e não era lido por ninguém: um The Destroyer marcava
    exactamente como um Creative Playmaker.

    Aqui e não mais abaixo: as correcções que se seguem (campo de ataque sem
    pressão alta, `biasMax`) são regras da EQUIPA e têm de continuar a valer
    por cima da personalidade de um jogador.
    */
    if (typeof distanciaComEstilo === 'function') distancia = distanciaComEstilo(p, distancia);
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

    /*
    A ATACAR NÃO SE ATRIBUI HOMEM, E LARGA-SE O QUE ESTAVA.

    Não chega o `aplicarMarcacaoPosicional` não usar o `marcRef`: ele é lido
    noutros sítios (o `podeMarcar` da árvore, o `estouAMarcar` que tira o
    jogador das intercepções). Deixá-lo escrito em quem está a atacar é lixo de
    estado, da mesma família do `actionState` pendurado — e volta a agir no
    instante em que a posse muda, com um homem escolhido para uma jogada que já
    acabou.
    */
    if (bb && bb.isAttacking) {
        for (const p of lista) {
            if (!p) continue;
            p.marcRef = null;
            p.marcTimer = 0;
        }
        return;
    }

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
            // Posição REAL: o leilão precisa dela para não dar o homem a quem
            // tem o posto perto mas está longe (ver medir() em atribuirMarcacoes).
            px: p.model.position.x,
            pz: p.model.position.z,
            pos: p.pos,          // par natural da posição (paresPorPosicao)
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

    marcarQuemVaiReceber(lista, bb);
}

/*
O DEFESA MAIS PRÓXIMO DE QUEM VAI RECEBER FICA COM ELE.

Enquanto a bola vai no ar para um destinatário, o defesa mais próximo desse
destinatário — dentro de `MarkingModel.raioReceptor` — passa a tê-lo como
marcação, por cima do que o leilão tinha decidido.

Medido antes desta regra, defesas a menos de 6 m de quem ia receber: em 55.6%
dos casos não tinham esse adversário atribuído, e o alvo deles apontava para
2.30 m MAIS LONGE dele — o slot do bloco, que é atrás. O adversário recebia
livre e de frente.

SÓ O MAIS PRÓXIMO: dois defesas a largarem o bloco pelo mesmo passe abrem mais
espaço do que fecham.

Ao HOMEM e não à bola. Quem quer cortar tem o INTERCEPT, com critérios próprios
— e o portador tem o chaser. Nenhum dos dois é tocado aqui.
*/
function marcarQuemVaiReceber(lista, bb) {
    if (typeof Match === 'undefined' || typeof MarkingModel === 'undefined') return;
    const raio = MarkingModel.raioReceptor;
    if (typeof raio !== 'number') return;

    const recv = Match.intendedReceiver;
    if (!recv || !recv.model || recv.role === 'gk') return;
    if (recv.team === bb.team) return;               // é nosso: não se marca
    if (Match.ballCarrier) return;                   // a bola já não vai no ar

    let melhor = null, melhorD = Infinity;
    for (const p of lista) {
        if (!p || p.role !== 'def' || !p.model) continue;
        if (p === bb.chaser || p === bb.intercetor) continue;
        const d = p.model.position.distanceTo(recv.model.position);
        if (d < melhorD) { melhorD = d; melhor = p; }
    }
    if (!melhor || melhorD > raio) return;

    melhor.marcRef = recv;
    melhor.marcTimer = 0;
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
    /*
    Um DEFESA só se oferece como apoio na SAÍDA A JOGAR — bola no nosso terço.

    Não havia filtro de função nenhum: qualquer jogador entrava no leilão, e o
    custo é a distância do PONTO ao slot dele (`desvioMax` = 8 m). Com a bola a
    meio-campo, os pontos de apoio atrás do portador (o leque inclui ±150°)
    caem em cima dos slots dos centrais e laterais — e lá iam eles para
    SUPPORT_PASS, a deixar a última linha para dar uma linha de passe que o
    médio ao lado dava melhor. Era o caso do CB e do RB reportados.

    Mesmo corte de terço usado no TeamBT (bolaNoNossoTerco, -17 m no
    referencial de ataque).
    */
    const bolaNoNossoTerco = (refZ * dirZref) < -17.0;

    const candidatos = [];
    for (const p of lista) {
        if (!p || p.role === 'gk' || !p.postoBase) continue;
        if (portador && p === portador) continue;
        if (p.role === 'def' && !bolaNoNossoTerco) continue;
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

/*
=============================================================================
QUEM ESTÁ EM QUE LINHA, AGORA — e não segundo a formação
=============================================================================
O `p.role` vem da formação e NUNCA MUDA: um lateral que sobe para o meio-campo
continua a contar como defesa para o `LineShape`, para o fecho e para tudo o
resto. Era por isso que a linha de trás não se recompunha quando perdia gente.

A LINHA DE TRÁS é quem está a menos de `faixaDaLinha` do jogador mais RECUADO da
equipa — relativa aos COMPANHEIROS, que é o que se vê no ecrã. Medir contra os
terços do bloco não serve: o bloco é empurrado pela bola e pela linha de
fora-de-jogo, e há frames em que os onze caem todos no mesmo terço (medido, a
contagem oscilava entre 0 e 10).

`nominal` é quantos a FORMAÇÃO põe naquela linha — é contra ele que se mede a
falta. Sai do `role`, que para isto serve: é a intenção do treinador.

Escreve em `p.linhaActual` e `bb.linhas`. Corre uma vez por equipa por frame,
ANTES do posicionamento, porque o `u` de cada um vai depender de quantos são.
*/
function classificarLinhas(lista, bb) {
    const L = (typeof LineShape !== 'undefined') ? LineShape : null;
    const faixa = (L && typeof L.faixaDaLinha === 'number') ? L.faixaDaLinha : 6.0;

    const campo = lista.filter(p => p && p.role !== 'gk' && p.model);
    if (!campo.length) { bb.linhas = null; return; }

    const comZ = campo.map(p => ({ p: p, z: p.model.position.z * bb.dir }))
        .sort((a, b) => a.z - b.z);
    const traseira = comZ[0].z;

    const linhas = { def: [], mid: [], atk: [] };
    const nominal = { def: 0, mid: 0, atk: 0 };

    for (const o of comZ) {
        const p = o.p;
        // A intenção da formação, para se saber quantos DEVIAM lá estar.
        const nom = (p.role === 'def') ? 'def' : (p.role === 'atk' ? 'atk' : 'mid');
        nominal[nom]++;

        /*
        A linha REAL. Só a de trás é definida pela distância ao mais recuado —
        é a que a regra do mínimo protege e a que se fecha ao perder gente. As
        outras duas ficam pela intenção da formação: um médio que sobe não deixa
        de ser médio para efeitos de largura, e o ataque não tem linha atrás de
        si para se recompor.
        */
        const naTraseira = (o.z <= traseira + faixa);
        const linha = naTraseira ? 'def' : (nom === 'def' ? 'mid' : nom);
        p.linhaActual = linha;
        linhas[linha].push(p);
    }

    /*
    O MÍNIMO DA LINHA DE TRÁS. Por muito que a equipa suba, não pode ficar com
    menos de `minimoAtras` atrás — medido antes desta regra, 11.6% dos frames
    tinham UM só jogador na linha de trás.

    Quem completa são os mais recuados a seguir, e ficam marcados com
    `seguraLinha`: o `tickBase` trava-lhes a profundidade à altura da linha em
    vez de os deixar subir. Marca-se e limpa-se aqui, todos os frames, para
    ninguém ficar preso a segurar uma linha que já não precisa dele.
    */
    const minimo = (L && typeof L.minimoAtras === 'number') ? L.minimoAtras : 2;
    for (const o of comZ) o.p.seguraLinha = false;

    if (linhas.def.length < minimo) {
        for (const o of comZ) {
            if (linhas.def.length >= minimo) break;
            if (o.p.linhaActual === 'def') continue;
            o.p.linhaActual = 'def';
            o.p.seguraLinha = true;
            const i = linhas.mid.indexOf(o.p);
            if (i >= 0) linhas.mid.splice(i, 1);
            else { const j = linhas.atk.indexOf(o.p); if (j >= 0) linhas.atk.splice(j, 1); }
            linhas.def.push(o.p);
        }
    }

    /*
    UM LATERAL DE CADA VEZ: sobe o do LADO DA JOGADA, o outro segura a zaga.

    Medido antes desta regra, em fase de ataque: os dois laterais fora da linha
    de trás 76.8% do tempo, e quando subia só um era o do lado ERRADO da bola em
    69.5% dos casos.

    A escolha tem ZONA MORTA (`zonaMortaLado`): com a bola perto do eixo não há
    lado, e mantém-se a escolha anterior. Sem isso os dois trocavam de papel a
    cada passe pelo meio, e um lateral a subir e a descer todos os frames é pior
    do que dois lá em cima.

    Só em ATAQUE. A defender ninguém apoia coisa nenhuma e os dois pertencem à
    linha de trás.
    */
    const zonaMorta = (L && typeof L.zonaMortaLado === 'number') ? L.zonaMortaLado : 5.0;
    const latEsq = campo.find(p => p.pos === 'LB');
    const latDir = campo.find(p => p.pos === 'RB');

    if (latEsq && latDir && bb.isAttacking) {
        const bolaX = (typeof bb.bolaXSuave === 'number') ? bb.bolaXSuave : (bb.ballX || 0);
        if (Math.abs(bolaX) > zonaMorta) bb.ladoQueSobe = Math.sign(bolaX);
        if (!bb.ladoQueSobe) bb.ladoQueSobe = 1;

        const ladoDe = (p) => Math.sign(p.baseTarget ? p.baseTarget.x : p.model.position.x) || 1;
        for (const lat of [latEsq, latDir]) {
            if (ladoDe(lat) !== bb.ladoQueSobe) {
                // O do lado contrário fica: é ele que auxilia a zaga.
                lat.seguraLinha = true;
                lat.linhaActual = 'def';
                const i = linhas.mid.indexOf(lat);
                if (i >= 0) { linhas.mid.splice(i, 1); linhas.def.push(lat); }
            }
        }
    }

    /*
    COM UM LATERAL ATRÁS, O OUTRO NÃO VOLTA TANTO.

    Se um dos laterais já está na linha de trás, o outro ganha um PISO na linha
    média: não cai abaixo dela. Não é um empurrão para a frente — é deixá-lo
    ficar onde está em vez de o obrigar a correr até à zaga.

    Medido antes desta regra, em fase defensiva: o lateral mais adiantado ficava
    a 0.431 do bloco, aquém da linha média, com um deles já atrás 81.8% do
    tempo. Voltavam os dois.

    A CONDIÇÃO É O OUTRO ESTAR LÁ: sem ninguém na linha de trás não há piso, e
    os dois voltam como devem. Ver LineShape.pisoLinhaMedia.
    */
    if (latEsq && latDir) {
        const naTras = (p) => p.linhaActual === 'def';
        if (naTras(latEsq) !== naTras(latDir)) {
            const adiantado = naTras(latEsq) ? latDir : latEsq;
            adiantado.pisoLinhaMedia = true;
        } else {
            latEsq.pisoLinhaMedia = false;
            latDir.pisoLinhaMedia = false;
        }
    }

    /*
    O PAR DO MESMO LADO. Quando o lateral e o meia-lateral do mesmo flanco
    ficam na MESMA linha e no mesmo corredor, o de trás fecha para dentro — o
    corredor é de quem subiu. Ver LineShape.parDistX / parFecho.

    Medido antes desta regra: 3.0 m entre eles em x, e 14.7% dos frames a menos
    de 4 m em linha recta.
    */
    const distX = (L && typeof L.parDistX === 'number') ? L.parDistX : 7.0;
    for (const o of comZ) o.p.fecharPorPar = false;

    for (const par of [['LB', 'LM'], ['RB', 'RM']]) {
        const lat = campo.find(p => p.pos === par[0]);
        const ala = campo.find(p => p.pos === par[1]);
        if (!lat || !ala) continue;
        if (lat.linhaActual !== ala.linhaActual) continue;
        if (Math.abs(lat.model.position.x - ala.model.position.x) > distX) continue;

        // O de trás fecha; o da frente fica com o corredor.
        const zLat = lat.model.position.z * bb.dir;
        const zAla = ala.model.position.z * bb.dir;
        (zLat < zAla ? lat : ala).fecharPorPar = true;
    }

    /*
    O CENTRAL MAIS PRÓXIMO NÃO FICA LONGE DA BOLA, com ela no próprio terço.
    Medido antes desta regra: 11.9 m de média, e 72.4% dos frames acima de 9 m.
    Ver MarkingModel.distMaxDaBola.
    */
    for (const o of comZ) o.p.puxarParaBola = false;

    const MM = (typeof MarkingModel !== 'undefined') ? MarkingModel : null;
    if (MM && typeof MM.distMaxDaBola === 'number' && !bb.isAttacking &&
        typeof Match !== 'undefined' && Match.ball) {
        const avancoBola = Match.ball.position.z * bb.dir;
        if (avancoBola < (MM.tercoParaTectoDaBola ?? -17.7)) {
            let maisPerto = null, dMin = Infinity;
            for (const o of comZ) {
                if (o.p.pos !== 'CB') continue;
                const d = o.p.model.position.distanceTo(Match.ball.position);
                if (d < dMin) { dMin = d; maisPerto = o.p; }
            }
            if (maisPerto && dMin > MM.distMaxDaBola) maisPerto.puxarParaBola = true;
        }
    }

    /*
    A ORDEM DE CADA UM DENTRO DA SUA LINHA, da esquerda para a direita, pelo `u`
    da formação. É o que permite redistribuir uma linha incompleta por
    intervalos IGUAIS sem ninguém trocar de lado — ver calcularPontoDoSlot.

    Sem isto, encolher a linha mantinha o espaçamento ORIGINAL: com a 442, se o
    lateral esquerdo subia, ficavam RB(0.150) CB(0.350) CB(0.650) — dois juntos
    ao centro e um muito aberto à direita. Medido: 3.65 m de diferença entre os
    dois intervalos do trio.
    */
    for (const nome of ['def', 'mid', 'atk']) {
        const membros = linhas[nome].slice().sort((a, b) => {
            const ua = (a.slot && typeof a.slot.u === 'number') ? a.slot.u : 0.5;
            const ub = (b.slot && typeof b.slot.u === 'number') ? b.slot.u : 0.5;
            return ua - ub;
        });
        membros.forEach((p, i) => { p.ordemNaLinha = i; p.totalNaLinha = membros.length; });
    }

    bb.linhas = {
        def: linhas.def, mid: linhas.mid, atk: linhas.atk,
        nominal: nominal
    };
}

/*
O FACTOR DE FECHO de uma linha: 1.0 com a linha completa (e aí NADA muda), e
menos por cada jogador em falta face ao que a formação lá põe. Ver
LineShape.porFalta.
*/
function fechoPorOcupacao(bb, linha) {
    const L = (typeof LineShape !== 'undefined') ? LineShape : null;
    if (!L || !bb || !bb.linhas || typeof L.porFalta !== 'number') return 1.0;

    const actual = bb.linhas[linha] ? bb.linhas[linha].length : 0;
    const nom = bb.linhas.nominal ? bb.linhas.nominal[linha] : 0;
    if (!nom || actual >= nom) return 1.0;

    const falta = nom - actual;
    const chao = (typeof L.fechoMinimo === 'number') ? L.fechoMinimo : 0.45;
    return Math.max(chao, 1.0 - falta * L.porFalta);
}

const PosicionamentoAI = {
    otimizarSlotsPorPosicao: otimizarSlotsPorPosicao,
    classificarLinhas: classificarLinhas,

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

        /*
        SEGURAR A LINHA: quem foi chamado para completar o mínimo atrás não
        sobe acima da linha de trás. Ver a regra do mínimo em
        classificarLinhas.
        */
        if (p.seguraLinha && bb.bloco) {
            const L = (typeof LineShape !== 'undefined') ? LineShape : null;
            const faixa = (L && typeof L.faixaDaLinha === 'number') ? L.faixaDaLinha : 6.0;
            const tecto = bb.bloco.z0 + faixa;
            if (targetZ * p.dirZ > tecto) targetZ = tecto * p.dirZ;
        }

        /*
        E O CONTRÁRIO: com o outro lateral já na linha de trás, este não cai
        abaixo da linha média. Ver LineShape.pisoLinhaMedia.
        */
        /*
        TECTO DA DISTÂNCIA À BOLA: o central mais próximo aproxima-se até ficar
        a `distMaxDaBola`. Não vai à bola — fica a essa distância, na direcção
        dela. Ver MarkingModel.distMaxDaBola.
        */
        if (p.puxarParaBola && typeof Match !== 'undefined' && Match.ball &&
            typeof MarkingModel !== 'undefined') {
            const bx = Match.ball.position.x, bz = Match.ball.position.z;
            const dx = targetX - bx, dz = targetZ - bz;
            const d = Math.hypot(dx, dz);
            const tecto = MarkingModel.distMaxDaBola;
            if (d > tecto && d > 0.001) {
                targetX = bx + (dx / d) * tecto;
                targetZ = bz + (dz / d) * tecto;
            }
        }

        if (p.pisoLinhaMedia && bb.bloco) {
            const L = (typeof LineShape !== 'undefined') ? LineShape : null;
            const fr = (L && typeof L.pisoLinhaMedia === 'number') ? L.pisoLinhaMedia : 0.5;
            const piso = bb.bloco.z0 + (bb.bloco.z1 - bb.bloco.z0) * fr;
            if (targetZ * p.dirZ < piso) targetZ = piso * p.dirZ;
        }

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
                    const ux = distCarrier > 0.001 ? dx / distCarrier : ((p.slot && p.slot.u >= 0.5) ? 1 : -1);
                    const uz = distCarrier > 0.001 ? dz / distCarrier : 0;
                    targetX += ux * falta;
                    targetZ += uz * falta;
                }
            }
        }

        /*
        O RECTÂNGULO FECHA O NÍVEL 1.

        Tudo o que corre acima — segurar a linha, o tecto da distância à bola,
        o piso da linha média, a inércia pós-passe, o afastamento do portador —
        mede-se à BOLA ou a um companheiro, nunca à moldura, e qualquer um
        deles empurrava o slot para fora dela.

        A regra pedida: o nível 1 fica SEMPRE dentro do rectângulo. Quem sai é
        o nível 2 (marcação, inquietação, mola de coesão — o anel médio), e é
        precisamente por os dois anéis poderem discordar que se consegue dizer
        qual das camadas pôs o jogador onde ele está.

        O `aplicarEstiloPosicional`, a seguir, fica DE FORA deste corte de
        propósito: o desvio do playing style é a terceira leitura (anel pequeno)
        e tem de poder ver-se a sair do bloco, senão não há como distingui-lo.
        */
        const limB = limitesDoBloco(bb);
        if (limB) {
            targetX = THREE.MathUtils.clamp(targetX, limB.xMin, limB.xMax);
            targetZ = THREE.MathUtils.clamp(targetZ, limB.zMin, limB.zMax);
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
            ? aplicarTectoDoEstilo(p, comInquietacao.z, bb)
            : comInquietacao.z;

        let finalZ = comTecto;
        // Inércia pós-passe de 4 segundos: mantém a presença ofensiva sem recuar contra o fluxo do jogo
        if (bb && bb.isAttacking && p.passInertiaTimer > 0 && typeof p.passInertiaZDir === 'number') {
            const zDirFinal = finalZ * p.dirZ;
            if (zDirFinal < p.passInertiaZDir) {
                finalZ = p.passInertiaZDir * p.dirZ;
            }
        }

        /*
        MOLA DE COESAO A BOLA — ver molaParaABola (utils.js) e MolaDeCoesao
        (config.js).

        AQUI e nao noutro sitio: depois do tecto do estilo e da inercia (que
        dizem onde o jogador QUER estar) e ANTES do corte de fora-de-jogo e do
        clamp do campo. Se corresse depois, a mola podia empurrar alguem para
        posicao irregular ou para fora das linhas, e nenhum dos dois cortes
        voltava a falar.

        O guarda-redes fica de fora: a posicao dele vem do gkAnchor.
        */
        let molaX = comInquietacao.x;
        if (p.role !== 'gk' && typeof MolaDeCoesao !== 'undefined' &&
            typeof molaParaABola === 'function' &&
            typeof Match !== 'undefined' && Match.ball) {
            const M = MolaDeCoesao;
            const forca = (bb && bb.isAttacking) ? M.forcaComBola : M.forcaSemBola;
            const puxado = molaParaABola(
                molaX, finalZ,
                Match.ball.position.x, Match.ball.position.z,
                forca, M.distMin, M.puxaoMax);
            molaX = puxado.x;
            finalZ = puxado.z;
        }

        // Respeito ao limite legal de fora-de-jogo (offside) mesmo com inércia
        if (bb && bb.isAttacking && bb.offsideLimitDir !== undefined && bb.offsideLimitDir !== null) {
            const maxLegalZDir = bb.offsideLimitDir - 0.5;
            if (finalZ * p.dirZ > maxLegalZDir) {
                finalZ = maxLegalZDir * p.dirZ;
            }
        }

        /*
        LANCE DE LATERAL: quem se aproxima, e quanto.

        O nivel 2 fica ligado no THROW_IN e a mola de coesao (aqui em cima)
        puxa o bloco inteiro para a bola: o central sai da posicao, o CM
        cola-se a linha, e um lance que precisa de duas ou tres opcoes curtas
        acaba com seis pessoas em cima umas das outras — todas cobertas pelo
        mesmo adversario.

        A distancia minima por posicao (ThrowInModel.distanciaMinimaPorPos)
        empurra de volta para fora quem nao tem nada a fazer ali. O batedor
        fica de fora: o lugar dele e escrito a mao no setupSetPiece.

        Corre DEPOIS da mola — e ela que causa a aproximacao, e desfaze-la
        antes era so ve-la voltar no mesmo frame.
        */
        if (typeof Match !== 'undefined' && Match.state === 'THROW_IN' &&
            typeof distanciaMinimaNoLateral === 'function' &&
            Match.setPieceTaker !== p && Match.ball) {
            const minDist = distanciaMinimaNoLateral(p.pos);
            if (minDist > 0) {
                const bx = Match.ball.position.x, bz = Match.ball.position.z;
                const dx = molaX - bx, dz = finalZ - bz;
                const d = Math.hypot(dx, dz);
                if (d < minDist) {
                    // Sem direccao nenhuma (em cima da bola) empurra-se para o
                    // campo, que e o unico lado que existe.
                    const ux = (d > 0.001) ? dx / d : -Math.sign(bx || 1);
                    const uz = (d > 0.001) ? dz / d : 0;
                    molaX = bx + ux * minDist;
                    finalZ = bz + uz * minDist;
                }
            }
        }

        // Afastar companheiros de equipa no mesmo espaco (evitar o empilhamento tatico como o caso LB + LM + LW)
        if (p.role !== 'gk' && typeof Match !== 'undefined') {
            const companheiros = (p.team === 'TeamA' ? Match.players : Match.opponents).filter(c => c !== p && c.role !== 'gk' && c.postoBase);
            let repelX = 0;
            let repelZ = 0;
            const RAIO_REPULSAO = 3.5; 
            
            for (const c of companheiros) {
                // A forca repulsiva usa o posto base tatico do colega
                const dx = molaX - c.postoBase.x;
                const dz = finalZ - c.postoBase.z;
                const distSq = dx*dx + dz*dz;
                
                if (distSq > 0.001 && distSq < RAIO_REPULSAO * RAIO_REPULSAO) {
                    const dist = Math.sqrt(distSq);
                    const forca = (RAIO_REPULSAO - dist) / RAIO_REPULSAO; 
                    repelX += (dx / dist) * forca * 3.0; 
                    repelZ += (dz / dist) * forca * 3.0;
                }
            }
            molaX += repelX;
            finalZ += repelZ;
            
            // Procurar espaco vazio nas imediacoes quando ataca (fuga de adversarios)
            if (bb && bb.isAttacking) {
                const adversarios = (p.team === 'TeamA' ? Match.opponents : Match.players).filter(o => o.role !== 'gk');
                let fugirX = 0;
                let fugirZ = 0;
                const RAIO_FUGA = 6.0; 
                
                // Só aplica fuga do meio-campo para a frente (ou pouco antes da linha do meio-campo).
                // Evita que médios fujam dos atacantes correndo para trás em direção à própria baliza na saída de bola.
                if (finalZ * p.dirZ > -5.0) { 
                    for (const o of adversarios) {
                        const dx = molaX - o.model.position.x;
                        const dz = finalZ - o.model.position.z;
                        const distSq = dx*dx + dz*dz;
                        
                        if (distSq > 0.001 && distSq < RAIO_FUGA * RAIO_FUGA) {
                            const dist = Math.sqrt(distSq);
                            const forca = (RAIO_FUGA - dist) / RAIO_FUGA;
                            fugirX += (dx / dist) * forca * 4.0;
                            fugirZ += (dz / dist) * forca * 4.0;
                        }
                    }
                    molaX += fugirX;
                    finalZ += fugirZ;
                }
            }
            
            // Suaviza a tentativa de espacamento mantendo-a dentro da faixa de accao original (nao empurrar alas pra lateral muito longe)
            // molaX ja estara com a forca aplicada
        }

        const tx = THREE.MathUtils.clamp(molaX, -34, 34);
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

        /*
        ESPERAR PELO POSTO — ver esperarPeloSlot/EsperaPeloSlotModel (config.js).

        Quem esta adiantado em relacao ao seu posto e ve o posto VIR NA SUA
        DIRECCAO nao vai para tras busca-lo: fica, e deixa-o chegar. Sem isto
        ele inverte o sentido, a inercia do velocity.lerp leva-o 2-3 m longe de
        mais, e quando o passe sai o apoio que devia estar ali vem a meio
        caminho no sentido errado — a jogada morre por falta de um apoio que
        existia e estava a fazer marcha atras.

        Guarda-se o posto do frame anterior (`slotAnterior`) porque a
        velocidade do alvo nao esta guardada em lado nenhum: o alvo e um ponto
        recalculado do zero em cada frame.

        FORA DA REGRA quem tem tarefa com a bola — portador, chaser, intercetor
        e destinatario. Esses nao estao a ocupar posicao nenhuma, e a folha da
        arvore reescreve o `dynamicTarget` a seguir; deixa-los esperar era
        travar quem vai a bola.

        O `tacticalTarget` (o anel do debug) NAO congela: continua a mostrar
        onde o TeamBT o quer, que e o que faz a espera perceber-se ao olhar.
        */
        let esperar = false;
        if (typeof esperarPeloSlot === 'function' && p.slotAnterior) {
            const semTarefaDeBola = !p.hasBall &&
                !(bb && (bb.chaser === p || bb.intercetor === p)) &&
                !(typeof Match !== 'undefined' && Match.intendedReceiver === p);
            if (semTarefaDeBola) {
                esperar = esperarPeloSlot({
                    px: p.model.position.x, pz: p.model.position.z,
                    slotX: tx, slotZ: tz,
                    slotAnteriorX: p.slotAnterior.x, slotAnteriorZ: p.slotAnterior.z,
                    dt: dt
                });
            }
        }

        if (!p.slotAnterior) p.slotAnterior = { x: tx, z: tz };
        p.slotAnterior.x = tx;
        p.slotAnterior.z = tz;

        if (esperar) {
            p.dynamicTarget.x = p.model.position.x;
            p.dynamicTarget.z = p.model.position.z;
            p.dynamicTarget.y = ALTURA_BASE_Y;
            return;
        }

        p.dynamicTarget.x = lerp(p.dynamicTarget.x, tx, k);
        p.dynamicTarget.z = lerp(p.dynamicTarget.z, tz, k);
        p.dynamicTarget.y = ALTURA_BASE_Y;
    }
};
