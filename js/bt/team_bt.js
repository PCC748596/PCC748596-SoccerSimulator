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
    /*
    COM O JOGO PARADO NAO HA CHASER.

    A bola saiu: quem ia atras dela tem de se colocar para o lance — o
    lateral, o tiro de meta, o canto. Sem esta guarda ele continuava a correr
    atras da bola que ja nao esta em jogo (e, com a multibola, atras do ponto
    onde ela esta invisivel, a caminho do cone com o batedor).

    O intercetor ja tinha a mesma guarda (`Match.state !== 'PLAY'`); o chaser
    nao.
    */
    if (typeof Match !== 'undefined' && Match.state !== 'PLAY') {
        bb.chaser = null;
        return;
    }

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
4. O centro fica À FRENTE da linha da bola, e "à frente" depende da fase: com
   bola (T.Ataque/Ataque) é entre a bola e a baliza ATACADA
   (+BlockShape.avancoDoCentroComBola, 8 m); sem bola (T.Defesa/Defesa) e entre
   a bola e a baliza DEFENDIDA (-BlockShape.recuoDoCentroSemBola, 5 m).
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
    O centro do bloco fica À FRENTE da linha da bola — e "à frente" muda de
    sentido com a fase:

        T.Offensive / Offensive   entre a bola e a baliza ATACADA   -> +8
        T.Defensive / Defensive   entre a bola e a baliza DEFENDIDA -> -5

    Estava fixo em +5.0 para as quatro fases, ou seja a defender o bloco era
    empurrado 5 m na direcção da baliza adversária — para trás da bola em vez
    de entre ela e a nossa baliza. Tudo isto no referencial de ataque (bb.dir),
    onde + é o sentido do ataque da equipa.

    Os dois numeros vivem no BlockShape.avancoDoCentroComBola / .recuoDoCentroSemBola:
    estavam escritos à mão aqui, e são a manípula mais directa que o bloco tem.

    ATENÇÃO: quem decide é o `isAttacking`, que é POSSE — T.Offensive e
    Offensive dão o mesmo avanço, e o mesmo para os dois estados sem bola.
    */
    const targetOffsetZ = bb.isAttacking
        ? BlockShape.avancoDoCentroComBola
        : -BlockShape.recuoDoCentroSemBola;

    if (bb.blocoZSuave === undefined) {
        bb.blocoZSuave = targetOffsetZ;
    } else {
        // Nota: na troca de posse o alvo salta de +5 para -5 (ou o inverso). O
        // seguirBola faz a travessia desses 10 m em rampa, que é o que se quer:
        // o bloco reorganiza-se, não teleporta.
        bb.blocoZSuave = seguirBola(bb.blocoZSuave, targetOffsetZ, BlockShape.seguimentoBola, dtMatch, reposta);
    }

    /*
    A MENTALIDADE, que não estava aqui.

    O `MentalidadeModel[estilo].blocoZ` existe desde sempre no config, com o
    comentário "A Mentalidade fala uma vez, pelo blocoZ" — e NUNCA era lido. A
    única coisa que a Mentalidade mexia era a `profundidade` (ver
    escolherProfundidade), e essa, a defender, é forçada a 'short' para toda a
    gente: ou seja, com a equipa sem bola, escolher Muito Defensiva ou Muito
    Ofensiva dava exactamente o mesmo bloco.

    Medido, com a equipa a defender (mediana da profundidade do alvo, no
    referencial de ataque):

                        Muito Defensiva   Muito Ofensiva
        defesas              -16.1             -16.6
        médios                -6.1              -7.0

    Um metro de diferença, e no sentido errado. Agora o `blocoZ` desloca o
    centro do bloco: negativo recua-o para o próprio meio-campo, positivo
    empurra-o para o do adversário.
    */
    const mentalBloco = (typeof MentalidadeModel !== 'undefined' &&
        MentalidadeModel[Tatics.estilo] &&
        typeof MentalidadeModel[Tatics.estilo].blocoZ === 'number')
        ? MentalidadeModel[Tatics.estilo].blocoZ : 0;

    const bolaZDir = bb.bolaZSuave * bb.dir;
    let centroZ = bolaZDir + bb.blocoZSuave + mentalBloco;

    let z0 = centroZ - (profundidade / 2);
    let z1 = centroZ + (profundidade / 2);

    /* --- limites em Z (Regra 2 e Regra 3) -------------------------------
       O rectângulo do bloco vai até perto da linha de fundo adversária.
       A traseira do bloco (minZ) está agora restrita à linha da própria
       grande área (16.5m), impedindo que os times recuem em demasia para
       dentro da área em fase defensiva regular.
    */
    const fundo = typeof LINHA_FUNDO !== 'undefined' ? LINHA_FUNDO : CAMPO_COMP / 2;
    const profArea = typeof Area !== 'undefined' ? Area.profundidade : 16.5;
    const minZ = -(fundo - profArea);
    const maxZ = (fundo - 1.5);

    if (z0 < minZ) {
        z0 = minZ;
        z1 = z0 + profundidade;
        if (z1 > maxZ) z1 = maxZ;
    } else if (z1 > maxZ) {
        /*
        A frente bate na marca de penálti adversária: o bloco ENCOLHE contra
        ela. Fazia `z0 = z1 - profundidade`, ou seja arrastava o rectângulo
        inteiro para trás — tocar numa borda recalculava a outra, o defeito que
        já tinha sido corrigido nos outros caminhos. Era ele que punha a
        traseira 26 m atrás do tecto da Linha Defensiva com bloco longo.
        */
        z1 = maxZ;
        if (z0 > z1) z0 = z1;
    }

    /* --- Linha Defensiva do painel (ÂNCORA da traseira) ------------------
       A TRASEIRA do bloco é a linha defensiva da equipa, e o painel diz ONDE
       ela se põe (TeamShape.linhaDefensiva, no referencial de ataque).

       Era só um TECTO — cortava a linha quando ela subia demais, mas nunca a
       fazia subir. Com bloco longo e a bola longe, a traseira saía do centro do
       bloco e o tecto nunca mordia: medido sem posse com a bola em +20 e Length
       `large`, `medium` (-18.25) e `high` (-2.0) davam os DOIS -20.0, ou seja o
       botão não separava nada. Passa a âncora: a traseira assume o valor
       pedido, e só recua de lá por uma razão de jogo.

       Quem manda recuar é `recuoDaUltimaLinha` (config.js), que estava escrita
       e nunca era chamada — os dois recuos legítimos são:

         - o adversário mais recuado: a linha põe-se `distancia` metros atrás
           dele (MarkingModel.distanciaPorPressao, do Defensive Pressure), senão
           deixava-se um atacante nas costas;
         - o piso do guarda-redes, que é um limite físico e ganha a tudo.

       Só SEM bola: com posse o bloco sobe com a jogada e quem trava a frente é
       o fora-de-jogo, não isto.

       CORRE DEPOIS DOS LIMITES DO CAMPO, e fica com a última palavra. Corria
       antes, e o `else if (z1 > maxZ)` recalculava `z0 = z1 - profundidade`,
       arrastando o rectângulo inteiro para trás e desfazendo o que acabara de
       ser aplicado.

       Quando a linha pedida e a profundidade pedida não cabem entre ela e a
       marca de penálti adversária, quem cede é a FRENTE: a traseira é escolha
       explícita do painel, a frente é derivada. O bloco encolhe, com um mínimo
       de `profundidadeMinima` para não colapsar numa linha só.
    */
    if (!bb.isAttacking && typeof TeamShape !== 'undefined' &&
        typeof Tatics !== 'undefined' && TeamShape.linhaDefensiva) {
        /*
        A LINHA DEFENSIVA É DO PAINEL, MAS A MENTALIDADE TAMBÉM FALA.

        A âncora da traseira vinha só do botão Low/Medium/High, e é ela que tem
        a última palavra sobre onde a última linha se põe. Resultado: o
        `blocoZ` da Mentalidade movia o centro do bloco mas os DEFESAS ficavam
        onde estavam — medido, um metro de diferença entre Muito Defensiva e
        Muito Ofensiva, que é o mesmo que dizer que a Mentalidade não existia
        para eles.

        `pesoNaLinha` é a fracção do `blocoZ` que passa para a âncora. Não é 1:
        o botão da Linha Defensiva continua a ser o controlo grosso, a
        Mentalidade inclina-o. Com 0.5, Muito Defensiva recua a linha 5 m e
        Muito Ofensiva sobe-a 6 m sobre o que o painel pediu.
        */
        const capBase = TeamShape.linhaDefensiva[Tatics.linhaDefensiva]
            ?? TeamShape.linhaDefensiva.medium;
        const pesoMental = (typeof MentalidadeModel !== 'undefined' &&
            typeof MentalidadeModel.pesoNaLinha === 'number')
            ? MentalidadeModel.pesoNaLinha : 0;
        const capLinha = capBase + mentalBloco * pesoMental;

        /*
        Adversário de campo mais recuado e piso do guarda-redes, ambos no
        referencial de ataque desta equipa. `null` quando não há lista de
        adversários (harness de teste, arranque): aí a âncora manda sozinha.
        */
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

        z0 = recuoDaUltimaLinha(z0, maisRecuadoDir, distancia, pisoDir, capLinha);

        if (z0 < minZ) z0 = minZ;
        z1 = Math.min(z0 + profundidade, maxZ);
        const profMin = B.profundidadeMinima ?? 20.0;
        if (z1 - z0 < profMin) z1 = Math.min(z0 + profMin, maxZ);
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
/*
O slot que o nivel 2 usa: a ATRIBUICAO deste frame se houver, senao a
FORMACAO. Ver o cabecalho do otimizarSlotsPorPosicao — `p.slot` e o desenho do
treinador e nao se toca.
*/
function slotEfectivo(p) {
    return p.slotAtribuido || p.slot;
}

function slotNoBloco(p, bb) {
    const slot = slotEfectivo(p);
    if (!bb || !p || !slot) return null;
    return calcularPontoDoSlot(slot, p.pos, p.role, p.fbStyle, bb);
}

/*
SISTEMA DE DETECÇÃO DO ALVO MAIS PRÓXIMO PARA JOGADORES DA MESMA POSIÇÃO
Evita que dois atacantes (CF), dois médios (CM) ou dois centrais (CB) corram
para o mesmo lugar. Pareia os slots da formação dinamicamente por proximidade,
com tratamento dedicado para quando um deles é o portador da bola.
*/
/*
A FORMACAO E IMUTAVEL — o que isto muda e a ATRIBUICAO, nao o desenho.

Dois jogadores da mesma posicao (os dois centrais, os dois avancados) podem
trocar de lugar entre si: o que estava mais perto do lugar da direita fica com
o da direita. Isso e uma troca de OCUPANTE, e e legitima.

O que NAO e legitimo — e era o que se fazia — e escrever isso no `p.slot`, que
e o registo da formacao escolhida pelo treinador. Medido: **29,5% das leituras
tinham o `slot` diferente do que a formacao dizia** (CM 37%, CF 37%, CB 26%).
A partir dai, ninguem no jogo conseguia dizer onde a formacao punha aquele
jogador: o desenho do painel deixava de existir como referencia.

Agora:

    p.slot           a FORMACAO. So o assignFormations lhe toca, e esse so
                     corre quando o treinador muda o Formation Team A/B (ou a
                     compacidade, que tambem e do painel).
    p.slotAtribuido  a atribuicao deste frame, que e o que o nivel 2 usa.

Quem le tem de usar `p.slotAtribuido || p.slot` — ver slotNoBloco.
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
                    p0.slotAtribuido = slots[0];
                    p1.slotAtribuido = slots[1];
                } else {
                    p0.slotAtribuido = slots[1];
                    p1.slotAtribuido = slots[0];
                }
                continue;
            } else if (isP1Carrier && !isP0Carrier) {
                // p1 é o portador: atribui a p1 o slot mais próximo dele, e p0 obrigatoriamente fica com o outro slot
                const d1_s0 = Math.hypot(pos1.x - s0.x, pos1.z - s0.z);
                const d1_s1 = Math.hypot(pos1.x - s1.x, pos1.z - s1.z);
                if (d1_s1 <= d1_s0) {
                    p1.slotAtribuido = slots[1];
                    p0.slotAtribuido = slots[0];
                } else {
                    p1.slotAtribuido = slots[0];
                    p0.slotAtribuido = slots[1];
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
            const atual0 = p0.slotAtribuido || p0.slot;
            const atualmenteDireto = (!atual0 || (atual0.u === slots[0].u && atual0.v === slots[0].v));

            if (atualmenteDireto) {
                if (custoInvertido < custoDireto - HISTERESE) {
                    p0.slotAtribuido = slots[1];
                    p1.slotAtribuido = slots[0];
                } else {
                    p0.slotAtribuido = slots[0];
                    p1.slotAtribuido = slots[1];
                }
            } else {
                if (custoDireto < custoInvertido - HISTERESE) {
                    p0.slotAtribuido = slots[0];
                    p1.slotAtribuido = slots[1];
                } else {
                    p0.slotAtribuido = slots[1];
                    p1.slotAtribuido = slots[0];
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
    /*
    GUARDA-REDES A SEGURAR: A EQUIPA ABRE, NÃO DESAPARECE.

    Isto era um `return`: com a bola nas mãos dele, ninguém se oferecia —
    medido, zero apoios em 100% dos frames, e a equipa a encolher para 36,3 m
    de largura. Ele repunha para ninguém.

    Agora os apoios continuam, com o filtro da saída a jogar aplicado mais
    abaixo: fora da própria área e longe dele (ver SupportModel).
    */
    /*
    NO TIRO DE META, QUEM MANDA E O DESENHO DO LANCE.

    A equipa que bate tem uma forma propria (GoalkeeperPose.tiroMetaForma):
    centrais abertos nos cantos da area, laterais subidos na linha, medios
    escalonados. Deixar os apoios por cima disso desfazia-a — os pontos de
    apoio nascem a volta da bola/marca, que aqui e a quina da pequena area, e
    puxavam os centrais para tras da linha da area: medido, -44,3 m de avanco
    contra os -34 do desenho.
    */
    if (typeof Match !== 'undefined' && Match.state === 'GOAL_KICK' &&
        Match.setPieceTaker && Match.setPieceTaker.team === bb.team) {
        semApoio();
        return;
    }

    const gkComBola = !!(Match.gkHoldingBall && Match.gkHoldingBall[bb.team]);
    if (gkComBola && !(typeof SupportModel !== 'undefined' && SupportModel.saidaComGuardaRedes)) {
        semApoio();
        return;
    }

    const portador = bb.carrier;

    /*
    DURANTE UMA REPOSICAO, A REFERENCIA E A MARCA — NAO A BOLA.

    Com a multibola, a bola do jogo acompanha quem a foi buscar: no tiro de
    meta ela esta ATRAS DA BALIZA durante segundos. Os pontos de apoio saem da
    posicao da bola, e por isso dois jogadores iam oferecer-se atras da propria
    baliza — um deles dentro dela, que e o que se via na imagem.

    O sitio onde a bola VAI ESTAR e que interessa: a marca do lance.
    */
    const reposicaoActiva = (typeof Match !== 'undefined' && Match.reposicao &&
        Match.reposicao.taker && Match.reposicao.taker.team === bb.team)
        ? Match.reposicao : null;
    const refX = reposicaoActiva ? reposicaoActiva.marca.x : Match.ball.position.x;
    const refZ = reposicaoActiva ? reposicaoActiva.marca.z : Match.ball.position.z;
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

    /*
    NA SAÍDA COM O GR, os pontos que caem dentro da própria área ou em cima
    dele não servem — é o que o `return` de antes evitava, e é só isso que ele
    tinha de evitar. Ver SupportModel.distMinAoGuardaRedes.
    */
    let validos = escolhidos;
    if (gkComBola) {
        const gk = (bb.own || []).find(o => o && o.role === 'gk' && o.model);
        const linhaPropria = -dirZref * (typeof LINHA_FUNDO !== 'undefined' ? LINHA_FUNDO : 53);
        const distMin = (typeof SupportModel !== 'undefined' && SupportModel.distMinAoGuardaRedes) || 0;
        validos = escolhidos.filter(e => {
            if (SupportModel.foraDaAreaNaSaida && typeof Area !== 'undefined' &&
                Area.contem(e.x, e.z, linhaPropria)) return false;
            if (gk && distMin > 0) {
                const d = Math.hypot(e.x - gk.model.position.x, e.z - gk.model.position.z);
                if (d < distMin) return false;
            }
            return true;
        });
    }

    const comApoio = new Set(validos.map(e => e.id));
    for (const p of lista) if (!comApoio.has(p.id)) p.apoioPonto = null;

    for (const e of validos) {
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

        /*
        O FRAME COMECA AQUI: fora as propostas do frame anterior.

        Sem isto, uma proposta de uma tarefa que ja acabou sobrevivia e o
        jogador ficava presa a ela — e a prioridade dela ganhava a tudo o que
        se propusesse de novo. Ver js/bt/alvo.js.
        */
        if (typeof limparPropostas === 'function') limparPropostas(p);

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
                    const slotP = slotEfectivo(p);
                    const ux = distCarrier > 0.001 ? dx / distCarrier : ((slotP && slotP.u >= 0.5) ? 1 : -1);
                    const uz = distCarrier > 0.001 ? dz / distCarrier : 0;
                    targetX += ux * falta;
                    targetZ += uz * falta;
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

        /*
        FORA-DE-JOGO — LEIS DO JOGO, a prioridade mais forte de todas.

        Era so um corte no alvo aqui, e media-se que nao valia nada: 9,4% dos
        alvos da equipa com bola estavam alem da linha e 100% deles tinham sido
        escritos DEPOIS disto (ver docs/auditoria_nivel2.md). Como LIMITE, vale
        sobre tudo o que se propuser no frame — so o portador e quem vai a bola
        lhe escapam, e esses escapam pela regra e nao por acidente.
        */
        if (bb && bb.isAttacking && bb.offsideLimitDir !== undefined && bb.offsideLimitDir !== null) {
            const maxLegalZDir = bb.offsideLimitDir - 0.5;
            if (finalZ * p.dirZ > maxLegalZDir) {
                finalZ = maxLegalZDir * p.dirZ;
            }
            if (!temTarefaDeBola(p, bb)) {
                proporLimiteAvanco(p, AlvoPrio.LEIS, maxLegalZDir, 'fora-de-jogo');
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

        /*
        TRANSICAO DEFENSIVA: NINGUEM SOBE.

        Ver BlockShape.transicaoDefensivaRecuaSo. Nos 3 s a seguir a perder a
        bola o bloco ainda esta desenhado a volta dela, e quem estava recuado
        via o proprio slot a frente de si — subia, com a equipa a recuperar.
        Aqui o slot e cortado para nunca ficar a frente do jogador.

        Excepcoes: quem vai a bola, quem intercepta e o guarda-redes.
        */
        if (bb && bb.state === TeamState.TRANSITION_DEFENSIVE &&
            typeof BlockShape !== 'undefined' && BlockShape.transicaoDefensivaRecuaSo &&
            p.role !== 'gk' && bb.chaser !== p && bb.intercetor !== p && !p.hasBall) {
            const folga = BlockShape.folgaTransicao || 0;
            const meuZDir = p.model.position.z * p.dirZ;
            const alvoZDir = finalZ * p.dirZ;
            if (alvoZDir > meuZDir + folga) {
                finalZ = (meuZDir + folga) * p.dirZ;
            }
            // E como LIMITE, para valer sobre o que a arvore escrever depois.
            proporLimiteAvanco(p, AlvoPrio.SEGURO, meuZDir + folga, 'transicao defensiva');
        }

        /*
        O TECTO DO DESVIO AO SLOT — ver BlockShape.desvioMaxDoSlot.

        Corre ANTES das regras de faixa (pendulo, separacao lateral/extremo, folga
        do central) e depois de tudo o resto: corta a SOMA da marcacao, da mola e
        da inquietacao, que era o que
        tirava o central do desenho do treinador — 6,2 m de desvio medio e 20,8
        no p95. Cada regra continua a pedir o que quer; o que muda e o total.

        A ORDEM IMPORTA: com o tecto no fim, ele desfazia as regras de faixa —
        medido, o lateral voltava a aparecer por dentro dos centrais em 9,3%
        das leituras (eram 1,6%) e do lado errado do campo em 4,5% (eram 0%).
        As regras de faixa sao invariantes do desenho; o tecto e um limite de
        distancia. Primeiro corta-se a distancia, depois arruma-se a faixa.

        O nivel 3 nao passa por aqui: uma corrida ou uma ida a bola sao ACCAO
        ou BOLA e ganham a isto (js/bt/alvo.js).
        */
        if (p.slotTarget && typeof BlockShape !== 'undefined' && BlockShape.desvioMaxDoSlot) {
            const tecto = BlockShape.desvioMaxDoSlot[p.role];
            if (tecto) {
                const dxS = molaX - p.slotTarget.x;
                const dzS = finalZ - p.slotTarget.z;
                const dS = Math.hypot(dxS, dzS);
                if (dS > tecto && dS > 0.001) {
                    const k = tecto / dS;
                    molaX = p.slotTarget.x + dxS * k;
                    finalZ = p.slotTarget.z + dzS * k;
                }
            }
        }

        /*
        PENDULO PARA O LADO DA JOGADA. Ver BlockShape.penduloParaABola: com a
        bola numa ala, quem fica na ala oposta esta a 25-45 m dela em x e nao
        tem linha de passe nenhuma. O tecto puxa-o em x — a profundidade
        continua a ser a do bloco, e a largura do rectangulo nao muda.

        O LATERAL DO LADO CONTRARIO NAO ENTRA. Ele nao esta ali a dar largura
        ao ataque: esta a cobrir o extremo adversario do lado dele, que e
        exactamente quem sai no contra-ataque quando a bola se perde do outro
        lado. Puxa-lo para a bola era abrir esse corredor.
        */
        const lateralOposto = (p.role === 'def' &&
            (p.pos === 'LB' || p.pos === 'RB' || p.pos === 'LWB' || p.pos === 'RWB') &&
            typeof Match !== 'undefined' && Match.ball &&
            Math.sign(p.baseTarget.x) !== 0 &&
            Math.sign(Match.ball.position.x) !== 0 &&
            Math.sign(p.baseTarget.x) !== Math.sign(Match.ball.position.x));

        if (bb && bb.isAttacking && typeof BlockShape !== 'undefined' &&
            BlockShape.penduloParaABola && p.role !== 'gk' && !p.hasBall &&
            bb.chaser !== p && typeof Match !== 'undefined' && Match.ball) {
            /*
            O LATERAL DO LADO CONTRARIO TEM TECTO PROPRIO, MAIS LARGO.

            Estava FORA do pendulo, para nao ser puxado para a bola: ele esta
            a cobrir o extremo adversario. So que "fora" e demais — o bloco
            acompanha a bola em x e ele ficava sozinho no outro lado do campo:
            medido, 15,6 m ate ao colega mais perto e 55% das leituras fora do
            rectangulo.

            Agora o tecto dele e o `distanciaMaxXLateralOposto`, mais largo do
            que o dos outros: continua a segurar a ala, mas ligado a equipa.
            */
            const tecto = lateralOposto
                ? (BlockShape.distanciaMaxXLateralOposto || BlockShape.distanciaMaxX)
                : BlockShape.distanciaMaxX;
            const bolaX = Match.ball.position.x;
            const dxPendulo = molaX - bolaX;
            if (Math.abs(dxPendulo) > tecto) {
                molaX = bolaX + Math.sign(dxPendulo) * tecto;
            }
        }


        /*
        SEM BOLA: A FRENTE DO BLOCO E O TECTO DE TODA A GENTE.

        Ver BlockShape.limiteFrenteDoBlocoSemBola. Nivel SEGURO, portanto vale
        sobre a marcacao (que e ACCAO) e sobre a estrutura, e cede a quem vai a
        bola. Sem isto, um marcador seguia o homem dele para fora do bloco e a
        equipa defendia com cinco.
        */
        if (bb && !bb.isAttacking && bb.bloco && typeof BlockShape !== 'undefined' &&
            BlockShape.limiteFrenteDoBlocoSemBola && p.role !== 'gk' && !p.hasBall &&
            bb.chaser !== p && bb.intercetor !== p && bb.blocker !== p &&
            typeof proporLimiteAvanco === 'function') {
            proporLimiteAvanco(p, AlvoPrio.SEGURO,
                bb.bloco.z1 + (BlockShape.folgaFrenteDoBloco || 0), 'frente do bloco');
        }

        /*
        SEM BOLA, DEFESAS E MEDIOS DO LADO DE CA DA BOLA — ver
        BlockShape.limiteAlemDaBolaSemBola. A frente do bloco (acima) nao
        chegava: com 30 m de fundura, um medio podia estar 16 m a frente da
        bola e continuar dentro do bloco.
        */
        if (bb && !bb.isAttacking && typeof BlockShape !== 'undefined' &&
            BlockShape.limiteAlemDaBolaSemBola && p.role !== 'gk' && !p.hasBall &&
            bb.chaser !== p && bb.intercetor !== p && bb.blocker !== p &&
            typeof Match !== 'undefined' && Match.ball &&
            typeof proporLimiteAvanco === 'function' &&
            (BlockShape.recuamAlemDaBola || []).indexOf(p.role) >= 0) {
            const bolaAvanco = Match.ball.position.z * p.dirZ;
            proporLimiteAvanco(p, AlvoPrio.SEGURO,
                bolaAvanco + (BlockShape.folgaAlemDaBola || 0), 'do lado de ca da bola');
        }

        /*
        REST DEFENSE — ver BlockShape.restDefense.

        Com posse, os `defesasAtrasDaBola` defesas mais recuados e o
        `medioAtrasDaBola` medio mais recuado nao passam a linha da bola (menos
        `recuoDaBola`). Medido sem esta regra: 0.76 adversarios sem ninguem
        entre eles e a propria baliza, e tres ou mais em 12% do tempo — os
        centrais e o organizador subiam com a jogada e ficava tudo aberto.

        Quem fica e escolhido pela POSICAO ACTUAL (os mais recuados), nao pela
        etiqueta: assim o par de centrais que ja esta atras e que segura, e o
        lateral que subiu nao e chamado de volta a meio caminho.
        */
        if (bb && bb.isAttacking && typeof BlockShape !== 'undefined' &&
            BlockShape.restDefense && p.role !== 'gk' && !p.hasBall &&
            bb.chaser !== p && typeof Match !== 'undefined' && Match.ball) {
            const R = BlockShape.restDefense;
            const meus = (bb.own || []).filter(o => o && o.role !== 'gk' && o.model);
            /*
            A ESCOLHA E PELO POSTO, NAO PELA POSICAO DO MOMENTO.

            Escolher os mais recuados AGORA cria uma porta giratoria: o defesa
            que sobe deixa de ser dos mais recuados, perde o limite, e sobe
            mais — e outro qualquer herda o limite no lugar dele. Medido com a
            escolha pela posicao: os centrais em -12.0 m de avanco medio,
            contra -18.0 m quando o limite se aguenta.

            Pelo `baseTarget` (o posto na formacao) o grupo e sempre o mesmo, e
            o limite vale para quem tem mesmo de ficar.
            */
            const ordenar = (arr) => arr.slice().sort(
                (a, b) => ((a.baseTarget ? a.baseTarget.z : a.model.position.z) * a.dirZ) -
                    ((b.baseTarget ? b.baseTarget.z : b.model.position.z) * b.dirZ));

            const defesas = ordenar(meus.filter(o => o.role === 'def'))
                .slice(0, R.defesasAtrasDaBola);
            const medios = ordenar(meus.filter(o => o.role === 'mid'))
                .slice(0, R.medioAtrasDaBola);

            if (defesas.indexOf(p) >= 0 || medios.indexOf(p) >= 0) {
                /*
                LIMITE, e nao um corte no alvo: assim ele vale tambem sobre o
                que a arvore escrever a seguir (era ai que se perdia), mas
                cede a uma tarefa de bola — o central que vai a bola vai.
                Ver js/bt/alvo.js.
                */
                const tectoAvanco = Match.ball.position.z * p.dirZ - R.recuoDaBola;
                proporLimiteAvanco(p, AlvoPrio.SEGURO, tectoAvanco, 'rest defense');
                if (finalZ * p.dirZ > tectoAvanco) finalZ = tectoAvanco * p.dirZ;
            }
        }

        /*
        LATERAL E EXTREMO NAO PARTILHAM A FAIXA (BlockShape.separacaoLateral).

        Com o pendulo a puxar gente para o lado da bola, o par do mesmo lado
        colava-se: medido, a menos de 4 m um do outro em 10% do tempo (eram
        4%), e em 211 desses 269 casos os ALVOS estavam juntos — nao era so
        inercia dos corpos.

        QUEM FICA POR FORA DEPENDE DO LADO, e e a mesma regra dos dois lados:

          lado da bola      o EXTREMO da a largura (e a ala do ataque);
                            o lateral sobe por dentro dele.
          lado contrario    o LATERAL segura a ala (esta a cobrir o extremo
                            adversario, que e quem sai no contra-ataque);
                            o extremo fecha por dentro.

        Cada um dos dois aplica a regra a si proprio, comparando com o ALVO do
        outro — assim o resultado nao depende da ordem por que os jogadores
        sao processados, e os dois convergem para a mesma separacao. Comparar
        com a POSICAO do outro nao chega: os dois estao em movimento e vao os
        dois atras um do outro.
        */
        const ehExtremo = (p.pos === 'LM' || p.pos === 'RM' || p.pos === 'LW' || p.pos === 'RW');
        const ehLateral = (p.role === 'def' &&
            (p.pos === 'LB' || p.pos === 'RB' || p.pos === 'LWB' || p.pos === 'RWB'));

        if (bb && typeof BlockShape !== 'undefined' && BlockShape.separacaoLateral &&
            (ehExtremo || ehLateral)) {
            const ladoDele = Math.sign(p.baseTarget.x) || 1;
            const parPos = ehExtremo
                ? [(ladoDele < 0 ? 'LB' : 'RB'), (ladoDele < 0 ? 'LWB' : 'RWB')]
                : [(ladoDele < 0 ? 'LM' : 'RM'), (ladoDele < 0 ? 'LW' : 'RW')];
            const par = (bb.own || []).find(o => o && o.model && o !== p &&
                parPos.indexOf(o.pos) >= 0);

            if (par) {
                const alvoPar = (par.tacticalTarget) ? par.tacticalTarget.x : par.model.position.x;
                const bolaXsep = (typeof Match !== 'undefined' && Match.ball)
                    ? Match.ball.position.x : 0;
                const ladoDaBola = (Math.sign(bolaXsep) === ladoDele);
                const souODeFora = ladoDaBola ? ehExtremo : ehLateral;
                const sep = BlockShape.separacaoLateral;

                /*
                O LATERAL DO LADO CONTRARIO NAO E EMPURRADO PARA FORA.

                A regra manda o "de fora" ficar por fora do outro — e do lado
                contrario ao da bola o de fora e ele. Isso empurrava-o para
                alem da borda do bloco e desfazia o tecto do pendulo: medido,
                51% dos ALVOS dele fora do rectangulo, a 15,6 m do colega mais
                perto. Ali quem tem de ceder e o extremo, que ja e o que a
                regra faz do outro lado.
                */
                if (souODeFora) {
                    molaX = ladoDele * Math.max(Math.abs(molaX), Math.abs(alvoPar) + sep);
                    /*
                    E O LATERAL DO LADO CONTRARIO NAO SAI DO BLOCO POR CAUSA
                    DISTO. Sem tecto, esta regra empurrava-o para fora do
                    rectangulo (51% dos alvos dele, 15,6 m ate ao colega mais
                    perto); sem a regra, ficava no eixo do campo (31% das
                    leituras com |x| < 5). Com tecto, fica por fora do extremo
                    mas ligado a equipa. Ver BlockShape.folgaLateralOposto.
                    */
                    if (ehLateral && lateralOposto && bb.bloco && BlockShape.folgaLateralOposto) {
                        const borda = (ladoDele > 0)
                            ? bb.bloco.x1 + BlockShape.folgaLateralOposto
                            : -(bb.bloco.x0 - BlockShape.folgaLateralOposto);
                        molaX = ladoDele * Math.min(Math.abs(molaX), Math.max(0, borda));
                    }
                } else {
                    molaX = ladoDele * Math.min(Math.abs(molaX), Math.max(0, Math.abs(alvoPar) - sep));
                }
            }
        }

        /*
        E O TECTO OUTRA VEZ, FOLGADO, DEPOIS DAS FAIXAS.

        As regras de faixa correm depois do tecto de proposito (senao ele
        desfazia-as), mas sem nada a seguir elas voltavam a esticar o desvio:
        p95 de 27,9 m nos defesas. Aqui repete-se o tecto com a folga de uma
        faixa (`separacaoLateral`), que e exactamente o que elas precisam de
        pedir. Fica o desenho arrumado E o desvio limitado.
        */
        if (p.slotTarget && typeof BlockShape !== 'undefined' && BlockShape.desvioMaxDoSlot) {
            const tectoBase = BlockShape.desvioMaxDoSlot[p.role];
            if (tectoBase) {
                const tectoFolgado = tectoBase + (BlockShape.separacaoLateral || 0);
                const dxS = molaX - p.slotTarget.x;
                const dzS = finalZ - p.slotTarget.z;
                const dS = Math.hypot(dxS, dzS);
                if (dS > tectoFolgado && dS > 0.001) {
                    const k = tectoFolgado / dS;
                    molaX = p.slotTarget.x + dxS * k;
                    finalZ = p.slotTarget.z + dzS * k;
                }
            }
        }

        /*
        E, POR FIM, O LATERAL NUNCA POR DENTRO DO SEU CENTRAL.

        Esta e a ultima palavra em X, e tem de ser: quando corria antes do
        tecto de desvio, o tecto puxava o lateral de volta para dentro dos
        centrais — medido, 5,5% das leituras contra 1,6% com a regra no fim.
        E uma invariante do desenho (uma linha de quatro tem quatro faixas),
        nao um ajuste de distancia.
        */
        if (bb && typeof BlockShape !== 'undefined' && BlockShape.folgaDoCentral &&
            p.role === 'def' &&
            (p.pos === 'LB' || p.pos === 'RB' || p.pos === 'LWB' || p.pos === 'RWB')) {
            const ladoLat = Math.sign(p.baseTarget.x) || 1;
            let central = null;
            for (const o of (bb.own || [])) {
                if (!o || !o.model || o === p) continue;
                if (o.pos !== 'CB' && o.pos !== 'DC') continue;
                const ox = (o.tacticalTarget) ? o.tacticalTarget.x : o.model.position.x;
                if (!central || ox * ladoLat > central * ladoLat) central = ox;
            }
            if (central !== null) {
                const minimo = central * ladoLat + BlockShape.folgaDoCentral;
                if (molaX * ladoLat < minimo) molaX = minimo * ladoLat;
            }
        }


        /*
        TIRO DE META: O SLOT VALE, COM DUAS GUARDAS.

        A equipa que bate vai para as posicoes do TeamBT (pedido) — mas a area
        e do guarda-redes e ninguem se poe na frente do chuto. As duas guardas
        que estavam escritas na montagem passam para aqui, onde ha um slot a
        que as aplicar. Ver GoalkeeperPose.tiroMetaMargemForaDaArea /
        .tiroMetaCorredorDoChuto.
        */
        if (typeof Match !== 'undefined' && Match.state === 'GOAL_KICK' &&
            Match.setPieceTaker && Match.setPieceTaker.team === p.team &&
            p.role !== 'gk' && typeof GoalkeeperPose !== 'undefined' && Match.ball) {
            const Gk = GoalkeeperPose;
            const linhaPropria = -p.dirZ * (typeof LINHA_FUNDO !== 'undefined' ? LINHA_FUNDO : 53);
            const margemTM = Gk.tiroMetaMargemForaDaArea || 0;

            /*
            E O LIMITE E POR PROFUNDIDADE, NAO SO PELO RECTANGULO DA AREA.

            A traseira do bloco encosta a linha da area (`minZ` no
            computeBlock), portanto o slot quase nunca cai DENTRO dela — mas
            cai em cima da linha, e o corpo entra: medido, 22,8% das leituras
            com o jogador dentro da propria area. O limite passa a ser a
            profundidade da area mais a margem, sempre.
            */
            const limiteAvanco = -( (typeof LINHA_FUNDO !== 'undefined' ? LINHA_FUNDO : 53)
                - Area.profundidade - margemTM );
            if (finalZ * p.dirZ < limiteAvanco) finalZ = limiteAvanco * p.dirZ;
            const corredorTM = Gk.tiroMetaCorredorDoChuto || 0;
            const bolaTM = Match.ball.position;
            if (corredorTM > 0 && Math.abs(molaX - bolaTM.x) < corredorTM &&
                (finalZ - linhaPropria) * p.dirZ < Area.profundidade + margemTM + 6.0) {
                const paraFora = Math.sign(molaX - bolaTM.x) || -Math.sign(bolaTM.x) || 1;
                molaX = bolaTM.x + paraFora * corredorTM;
            }
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

        /*
        DAQUI PARA A FRENTE NINGUEM ESCREVE O ALVO: PROPOE.

        Ver js/bt/alvo.js. A camada posicional propoe em ESTRUTURA (4) e a
        espera pelo slot em MICRO (6) — que e a prioridade mais fraca de todas,
        e por isso qualquer coisa que aconteca no frame (uma tarefa de bola,
        um estilo) passa-lhe a frente, como deve ser.

        O `dynamicTarget` continua a ser lido por toda a gente; o que mudou e
        quem o escreve, e que passou a ser um so sitio (resolverAlvo).
        */
        const alisadoX = lerp(p._alvoEstruturaX !== undefined ? p._alvoEstruturaX : tx, tx, k);
        const alisadoZ = lerp(p._alvoEstruturaZ !== undefined ? p._alvoEstruturaZ : tz, tz, k);
        p._alvoEstruturaX = alisadoX;
        p._alvoEstruturaZ = alisadoZ;

        const comResolvedor = (typeof BlockShape !== 'undefined' &&
            BlockShape.resolverAlvoActivo && typeof proporAlvo === 'function');

        if (esperar) {
            if (comResolvedor) {
                proporAlvo(p, AlvoPrio.MICRO, p.model.position.x, p.model.position.z,
                    'espera pelo slot');
            } else {
                p.dynamicTarget.x = p.model.position.x;
                p.dynamicTarget.z = p.model.position.z;
                p.dynamicTarget.y = ALTURA_BASE_Y;
            }
            return;
        }

        if (comResolvedor) {
            proporAlvo(p, AlvoPrio.ESTRUTURA, alisadoX, alisadoZ, 'slot no bloco');
        } else {
            p.dynamicTarget.x = alisadoX;
            p.dynamicTarget.z = alisadoZ;
            p.dynamicTarget.y = ALTURA_BASE_Y;
        }

        /*
        E O CORTE DA TRANSICAO REPETE-SE DEPOIS DO ALISAMENTO.

        Cortar so o alvo CRU nao chega: o `PositionSmoothing` faz o alvo
        alisado convergir devagar, e nos primeiros segundos a seguir a perder
        a bola ele ainda traz o valor da fase ofensiva. Medido a 0.05 s da
        troca de posse: quatro defesas com o alvo alisado 10 a 21 m a frente
        deles, a subir, com a equipa ja em T.Defensive. Sao esses os segundos
        que se veem no ecra.
        */
        if (bb && bb.state === TeamState.TRANSITION_DEFENSIVE &&
            typeof BlockShape !== 'undefined' && BlockShape.transicaoDefensivaRecuaSo &&
            p.role !== 'gk' && bb.chaser !== p && bb.intercetor !== p && !p.hasBall) {
            const folga = BlockShape.folgaTransicao || 0;
            const tectoZDir = p.model.position.z * p.dirZ + folga;
            if (p.dynamicTarget.z * p.dirZ > tectoZDir) {
                p.dynamicTarget.z = tectoZDir * p.dirZ;
            }
            if (p.tacticalTarget && p.tacticalTarget.z * p.dirZ > tectoZDir) {
                p.tacticalTarget.z = tectoZDir * p.dirZ;
            }
        }
    }
};
