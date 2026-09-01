/*
=============================================================================
PLAYING STYLES — resolução e eventos
=============================================================================
O catálogo (`PlayingStyles`, `EstiloBase`, `EstiloPorOmissao`) vive no
config.js: são só dados. Aqui está o que se FAZ com eles.

Duas responsabilidades:

  1. `estiloDe(p)` — devolve o objecto de estilo do jogador, já preenchido
     com os valores neutros do `EstiloBase`. Toda a gente lê por aqui, para
     nenhuma folha ter de saber se o campo existe ou não.

  2. `PlayingStyleEvents.tick(bb)` — avalia, uma vez por equipa por frame, as
     condições de cada estilo e emite um evento quando ela MUDA (nunca todo
     frame). O padrão é o mesmo do `updateGkStyle`: o estado corrente fica no
     jogador (`p.styleFlags`), o evento é só a notificação da transição.

Porquê eventos e não ifs espalhados: o `Match` (ou qualquer outro sistema)
subscreve `POACHER_ON_SHOULDER` e reorganiza quem tem de reorganizar, sem que
o código de posicionamento precise de saber que existe um poacher.
=============================================================================
*/

const PlayingStyleUtils = {
    // Cache para não reconstruir o objecto fundido a cada leitura.
    _cache: {},

    resolve: function (chave) {
        if (!chave) return EstiloBase;
        if (this._cache[chave]) return this._cache[chave];
        const def = PlayingStyles[chave];
        if (!def) return EstiloBase;
        const fundido = Object.assign({}, EstiloBase, def);
        this._cache[chave] = fundido;
        return fundido;
    }
};

/*
O estilo DECLARADO do jogador — o traço dele, esteja ou não a ser exercido
neste momento. Serve para a UI e para os gatilhos.
*/
function estiloDe(p) {
    return PlayingStyleUtils.resolve(p && p.playingStyle);
}

/*
O estilo EM VIGOR neste frame.

É esta a função que as folhas de posicionamento e de decisão devem usar. Um
estilo não está sempre ligado: um Goal Poacher só se cola ao último defensor
quando a equipa ataca no último terço — fora disso ocupa a posição normal
dele, senão passava o jogo inteiro fora do bloco a não fazer nada. O
`avaliarEstilo` (nível 3, ver player_bt.prepare) é quem liga e desliga.
*/
function estiloAtivoDe(p) {
    // Desligado no painel Player Skills: o jogador usa só o PositionBT puro,
    // sem nenhum desvio de estilo — ver toggle em popularPainelJogadores.
    if (!p || p.playingStyleDesligado || !p.styleAtivo) return EstiloBase;
    return PlayingStyleUtils.resolve(p.playingStyle);
}

/*
Estilo válido para uma posição? Usado na atribuição e na UI: escolher
"Anchor Man" para um avançado não faz sentido nenhum e seria um erro
silencioso (os modificadores aplicavam-se na mesma).
*/
function estiloValidoPara(chave, pos) {
    const def = PlayingStyles[chave];
    if (!def || !def.posicoes) return false;
    return def.posicoes.indexOf(pos) >= 0;
}

/*
=============================================================================
GATILHOS — quando é que vale a pena exercer o estilo
=============================================================================
Cada função responde a uma pergunta só: "AGORA interessa?". Recebe:

    p     o jogador
    bb    o TeamBlackboard da equipa dele
    s     atalhos já calculados (ver avaliarEstilo), para nenhuma função ter
          de repetir a mesma conta:
            s.avanco       profundidade DELE no referencial de ataque
            s.bolaAvanco   profundidade da BOLA no mesmo referencial
            s.atacando     a equipa tem a bola
            s.ultimoTerco  a bola já está no último terço (> 17 m)
            s.meuLado      a bola está do lado do campo dele
            s.distBola     distância dele à bola

Devolver `true` liga o estilo; `false` desliga (com histerese e tempo mínimo,
ver avaliarEstilo). Um estilo sem gatilho fica sempre ligado — é o caso dos
traços puramente defensivos, que não fazem sentido "desligar".
=============================================================================
*/
/*
CORRIDA DE ARRASTO DO DUMMY RUNNER — o episódio, no tempo.

Chamada do DESLOCAMENTO (`atraiDefesa` no aplicarEstiloPosicional) e não do
gatilho: o gatilho tem histerese própria (ESTILO_TEMPO_MINIMO) e ligava/
desligava com a posse, cortando o episódio em 1.2 s. Aqui a corrida tem mesmo
princípio e fim.

Máquina de dois estados por jogador, guardada nele próprio:

    _dummyRun     segundos que ainda faltam da corrida
    _dummyPausa   segundos até poder arrancar outra

Corre uma vez por frame, a partir do gatilho. O `dt` sai do `Match.delta`, que
é o mesmo relógio de todo o resto — usar um contador de frames tornava a
duração dependente do FPS, que é o defeito que o `chancePorSegundo` existe
para evitar.
*/
function correCorridaDeArrasto(p, bb, s) {
    const D = (typeof PlayingStyleTuning !== 'undefined')
        ? PlayingStyleTuning.dummyRunner
        : { duracao: 6.0, descanso: 4.0, bolaAvancoMin: -15.0 };
    const dt = (typeof Match !== 'undefined' && Match.delta) ? Match.delta : 1 / 60;

    if (p._dummyRun === undefined) { p._dummyRun = 0; p._dummyPausa = 0; }

    /*
    Sem jogada para arrastar (perdeu-se a bola, ou sou eu que a tenho): a
    corrida MORRE aqui, não fica em pausa à espera de retomar.

    Esta condição vive dentro da função e não no gatilho de propósito: no
    gatilho, o `&&` fazia curto-circuito e a função nem chegava a correr — o
    contador congelava a meio da corrida e ela retomava minutos depois, do
    ponto onde tinha ficado.
    */
    /*
    `bb.carrier` NÃO entra aqui: durante o voo de um passe não há portador
    nenhum, e com ele na condição a corrida morria a cada passe — medido, 0.5 s
    de mediana. O que importa é a EQUIPA manter a posse (`s.atacando`) e a bola
    não ser minha.
    */
    if (!s.atacando || bb.carrier === p) {
        if (p._dummyRun > 0) { p._dummyRun = 0; p._dummyPausa = D.descanso; }
        else if (p._dummyPausa > 0) p._dummyPausa -= dt;
        return false;
    }

    // A correr: conta e mantém-se ligado até acabar.
    if (p._dummyRun > 0) {
        p._dummyRun -= dt;
        if (p._dummyRun <= 0) {
            p._dummyRun = 0;
            p._dummyPausa = D.descanso;
        }
        return true;
    }

    // Em descanso: nada de corrida, e o estilo fica desligado — que é o que o
    // devolve às acções normais.
    if (p._dummyPausa > 0) {
        p._dummyPausa -= dt;
        return false;
    }

    // Parado: arranca uma nova se a jogada justificar.
    if (s.bolaAvanco < D.bolaAvancoMin) return false;
    p._dummyRun = D.duracao;
    return true;
}

const PlayingStyleTriggers = {
    // Corre na linha do último defensor — só quando há ataque para atacar.
    goal_poacher: (p, bb, s) => s.atacando && s.bolaAvanco > 5,

    // Puxa marcação para abrir espaço a outro: qualquer companheiro com bola no ataque.
    // A DURAÇÃO da corrida não se decide aqui — ver `correCorridaDeArrasto`,
    // chamado do deslocamento (o gatilho tem histerese própria de 1.2 s e
    // cortava o episódio antes do fim).
    dummy_runner: (p, bb, s) => s.atacando && bb.carrier && bb.carrier !== p,

    /*
    Espreita na área. O limiar era `bolaAvanco > 12` — a bola a mais de 12 m
    dentro do meio-campo adversário — e medido em jogo isso acontece em **2%**
    dos frames em posse. Ou seja o Fox in the Box era um avançado normal 98% do
    tempo, parado no slot puro a 25 m da área: era isto o "afasta-se muito da
    área".

    A partir do meio-campo já vale a pena ele ocupar a área — é o estilo
    inteiro. A que distância ele espera é problema da colocação (ver
    `dentroArea` no aplicarEstiloPosicional), que agora acompanha a bola em vez
    de o colar à linha da área desde o início.
    */
    fox_in_the_box: (p, bb, s) => s.atacando && s.bolaAvanco > -5,

    // Ponto de apoio: interessa na CONSTRUÇÃO (bola atrás), para dar saída.
    // Com a bola já lá à frente ele não tem de segurar nada.
    target_man: (p, bb, s) => s.atacando && s.bolaAvanco < 15,

    // Procura o espaço entre linhas: meio-campo em diante.
    creative_playmaker: (p, bb, s) => s.atacando && s.bolaAvanco > -10,

    // Playmaker estático: posse instalada, não em transição — o estilo é
    // exactamente o contrário de um contra-ataque.
    classic_no10: (p, bb, s) => s.atacando && !bb.isCounter && bb.phase >= 2,

    // Rompe para a área: último terço.
    hole_player: (p, bb, s) => s.atacando && s.ultimoTerco,

    // Ala: interessa com a bola do lado dele ou já adiantada.
    prolific_winger: (p, bb, s) => s.atacando && (s.meuLado || s.ultimoTerco),

    // Fecha para dentro: quando a bola está do lado CONTRÁRIO é que há espaço
    // no eixo para ele aparecer.
    roaming_flank: (p, bb, s) => s.atacando && !s.meuLado && s.bolaAvanco > 0,

    // Espera na linha para cruzar: precisa da bola do lado dele e avançada.
    cross_specialist: (p, bb, s) => s.atacando && s.meuLado && s.bolaAvanco > 5,

    // Cobre o campo todo: nas transições, que é quando falta gente.
    box_to_box: (p, bb, s) => bb.isCounter || s.distBola > 18,

    // Batalhador: só faz sentido a defender e com o portador ao alcance.
    the_destroyer: (p, bb, s) => !s.atacando && bb.oppCarrier &&
        p.model.position.distanceTo(bb.oppCarrier.model.position) < 18,

    // Inicia de trás: fase de construção. Permanece ativo na transição defensiva para não saltar à frente
    orchestrator: (p, bb, s) => s.bolaAvanco < 10,

    // Trinco: senta-se sempre que a equipa sobe, e a defender também.
    anchor_man: () => true,

    // Sai a jogar: bola no nosso terço. Permanece ativo na defesa.
    build_up: (p, bb, s) => s.bolaAvanco < -10,

    // Central que sobe: último terço, e não quando já se ganha por 2+ (não
    // vale a pena expor a defesa nesse caso).
    extra_frontman: (p, bb, s) => {
        if (!s.atacando || !s.ultimoTerco) return false;
        const meus = (p.team === 'TeamA') ? Match.placarA : Match.placarB;
        const deles = (p.team === 'TeamA') ? Match.placarB : Match.placarA;
        return (meus - deles) < 2;
    },

    // Laterais ofensivos: a partir do momento em que a equipa passa o meio.
    // Só ativam se a bola estiver no meio ou do seu lado (s.meuLado). No oposto, Position BT.
    offensive_fullback: (p, bb, s) => s.atacando && s.meuLado && s.bolaAvanco > -5,
    fullback_finisher: (p, bb, s) => s.atacando && s.ultimoTerco,

    // Restrição defensiva: está sempre em vigor.
    defensive_fullback: () => true
};

// Uma vez ligado, o estilo aguenta este tempo antes de poder desligar. Sem
// isto qualquer estilo cujo gatilho dependa da posição da bola ligava e
// desligava vários frames por segundo, e o alvo do jogador saltava com ele.
const ESTILO_TEMPO_MINIMO = 1.2;

/*
Decide se o estilo do jogador está em vigor neste frame. Chamado do
`prepare()` do PlayerBT — o nível 3 é que manda aqui, e por isso corre
independentemente do ramo da árvore que vier a ganhar.
*/
function avaliarEstilo(p, bb, dt) {
    if (typeof PlayingStyles === 'undefined' || !p.playingStyle) return;
    if (p.role === 'gk') { p.styleAtivo = true; return; }  // GR tem ciclo próprio

    p.styleTimer = (p.styleTimer || 0) + dt;

    const gatilho = PlayingStyleTriggers[p.playingStyle];
    // Sem gatilho declarado o estilo está sempre em vigor.
    if (!gatilho) { p.styleAtivo = true; return; }

    const avanco = p.model.position.z * p.dirZ;
    const bolaAvanco = bb.ballZ * bb.dir;
    const ladoDele = Math.sign(p.baseTarget.x) || 1;
    const s = {
        avanco: avanco,
        bolaAvanco: bolaAvanco,
        atacando: bb.isAttacking,
        ultimoTerco: bolaAvanco > 17,
        meuLado: Math.sign(bb.ballX) === ladoDele || Math.abs(bb.ballX) < 6,
        distBola: p.model.position.distanceTo(Match.ball.position)
    };

    let quer = !!gatilho(p, bb, s);

    /*
    A corrida de arrasto do Dummy Runner conta o tempo AQUI, e não no
    deslocamento: o `avaliarEstilo` corre todos os frames, o deslocamento só
    corre com o estilo activo. Com o relógio lá dentro, uma corrida de 6 s
    esticava-se por 70 s de tempo real, congelada em cada pausa do estilo.
    */
    if (p.playingStyle === 'dummy_runner') {
        p._dummyAtivo = correCorridaDeArrasto(p, bb, s);
    }

    // REGRA DE ESTADOS TÁTICOS
    // Se não estiver no estado ofensivo (posse estabelecida), desliga os estilos de movimentação
    // Exceção: estilos puramente defensivos ou que sempre ficam ativos na defesa
    if (typeof TeamState !== 'undefined' && bb.state !== TeamState.OFFENSIVE) {
        if (p.playingStyle !== 'anchor_man' && 
            p.playingStyle !== 'defensive_fullback' && 
            p.playingStyle !== 'the_destroyer' &&
            p.playingStyle !== 'orchestrator' &&
            p.playingStyle !== 'build_up') {
            quer = false;
        }
    }

    const antes = !!p.styleAtivo;

    // Histerese por tempo: só troca depois de aguentar o mínimo no estado
    // actual. Ligar é imediato; desligar é que espera.
    // Exceção: ao transitar para defesa (T.Defensive / Defensive / sem posse), desliga imediatamente
    // para não arrastar laterais e meias para o ataque sem a bola.
    const faseDefensiva = !bb.isAttacking || (typeof TeamState !== 'undefined' && (bb.state === TeamState.TRANSITION_DEFENSIVE || bb.state === TeamState.DEFENSIVE));
    if (quer === antes) return;
    if (!quer && !faseDefensiva && p.styleTimer < ESTILO_TEMPO_MINIMO) return;

    p.styleAtivo = quer;
    p.styleTimer = 0;
    if (typeof EventBus !== 'undefined') {
        EventBus.emit(quer ? 'STYLE_ON' : 'STYLE_OFF', { p: p, estilo: p.playingStyle });
    }
}

const PlayingStyleEvents = {
    /*
    Uma passagem por equipa. `bb` é o TeamBlackboard já preenchido (tem
    `own`, `opp`, `isAttacking`, `carrier`, `dir`...).
    */
    tick: function (bb) {
        if (typeof PlayingStyles === 'undefined') return;

        const linhaAdv = this._linhaUltimoDefensor(bb);

        for (const p of bb.own) {
            if (p.role === 'gk') continue;              // GK tem o seu próprio ciclo
            const est = estiloDe(p);
            if (!p.styleFlags) p.styleFlags = {};

            this._avaliar(p, 'ombroDefesa', est.ombroDefesa &&
                bb.isAttacking && linhaAdv !== null &&
                Math.abs(p.model.position.z * p.dirZ - linhaAdv) < 3.0,
                'POACHER_ON_SHOULDER');

            this._avaliar(p, 'naArea', est.dentroArea &&
                p.model.position.z * p.dirZ > CrossModel.areaZ &&
                Math.abs(p.model.position.x) < CrossModel.areaX,
                'FOX_IN_BOX');

            this._avaliar(p, 'segurando', est.seguraBola && p.hasBall,
                'TARGET_MAN_HOLD');

            this._avaliar(p, 'aAtrair', est.atraiDefesa &&
                bb.isAttacking && bb.carrier && bb.carrier !== p &&
                p.model.position.distanceTo(bb.carrier.model.position) > 12.0,
                'DUMMY_RUN');

            this._avaliar(p, 'corridaNaArea', (est.avancoComBola >= 8) &&
                bb.isAttacking &&
                p.model.position.z * p.dirZ > CrossModel.areaZ - 6,
                'HOLE_RUN');

            this._avaliar(p, 'naLinha', est.colaNaLinha &&
                bb.isAttacking &&
                Math.abs(p.model.position.x) > CrossModel.alaX + 5,
                'CROSS_READY');

            this._avaliar(p, 'aFechar', est.cortaParaDentro &&
                bb.isAttacking &&
                Math.abs(p.model.position.x) < CrossModel.alaX,
                'WINGER_CUT_INSIDE');

            this._avaliar(p, 'subiu', est.juntaSeAoAtaque &&
                bb.isAttacking && p.model.position.z * p.dirZ > 20,
                'DEFENDER_JOINS_ATTACK');

            this._avaliar(p, 'aPressionar', est.pressao >= 1.5 &&
                !bb.isAttacking && bb.oppCarrier &&
                p.model.position.distanceTo(bb.oppCarrier.model.position) < 6.0,
                'DESTROYER_PRESS');

            this._avaliar(p, 'recuado', (est.avanco <= -5) &&
                bb.isAttacking && p.model.position.z * p.dirZ < 0,
                'DEEP_PLAYMAKER_READY');
        }
    },

    /*
    Emite só na TRANSIÇÃO. Sem isto seriam ~10 eventos por jogador por frame
    (220 por frame no total) e o EventBus deixava de ser útil como sinal.
    */
    _avaliar: function (p, flag, valor, evento) {
        const antes = !!p.styleFlags[flag];
        const agora = !!valor;
        if (antes === agora) return;
        p.styleFlags[flag] = agora;
        if (typeof EventBus !== 'undefined') {
            EventBus.emit(agora ? evento : evento + '_END', { p: p, team: p.team });
        }
    },

    // Profundidade do último defensor adversário, no NOSSO referencial de
    // ataque — é a linha em que um poacher se quer manter.
    _linhaUltimoDefensor: function (bb) {
        let linha = null;
        for (const o of bb.opp) {
            if (o.role === 'gk') continue;
            const z = o.model.position.z * bb.dir;
            if (linha === null || z < linha) linha = z;
        }
        return linha;
    }
};

/*
Vão livre entre adversários, ao longo de uma linha Z fixa — testa uns
candidatos X e escolhe o mais longe do adversário mais próximo em cada um
(maximin: escolha entre pontos discretos, não gradiente nem física).

Usado por dois estilos:
    Fox in the Box  — vão entre 2 zagueiros, dentro da área.
    Goal Poacher    — brecha na última linha, à espera do lançamento.

`zAlvo` vem no referencial do MUNDO. Devolve 0 (centro) se não houver
adversários de campo para comparar.

Também evita convergir com um COLEGA que já reivindicou um vão perto neste
mesmo frame (`bb.vaosReivindicados`, limpo em TeamBlackboard.gather) — sem
isto, dois atacantes do mesmo estilo calculavam cada um o "melhor" vão sem
saber do outro, e batiam os dois no mesmo ponto.

Veio do antigo nível 2, que só o tinha porque duas folhas o usavam. Quem o
usa são os estilos, por isso vive aqui.
*/
function melhorVaoX(p, bb, zAlvo, candidatosX) {
    /*
    Lado preferido: o da JOGADA (bola), não o lado onde o jogador já está.
    Com a bola presa num lado, o vão "mais livre" no lado OPOSTO ganhava e o
    avançado ia atrás dele — alvo sem ligação nenhuma ao que estava a
    acontecer. Um bónus pequeno resolve os quase-empates sem impedir uma
    troca de lado genuína.
    */
    const meuLado = (bb && Math.abs(bb.ballX) > 3 ? Math.sign(bb.ballX) : 0) ||
        Math.sign(p.model.position.x) || Math.sign(p.baseTarget.x) || 1;
    const adversarios = (bb && bb.opp) ? bb.opp : [];

    let melhorX = 0, melhorNota = -Infinity;
    for (const x of candidatosX) {
        let minD = Infinity;
        for (const opp of adversarios) {
            if (opp.role === 'gk') continue;
            const d = Math.hypot(opp.model.position.x - x, opp.model.position.z - zAlvo);
            if (d < minD) minD = d;
        }
        if (bb && bb.vaosReivindicados) {
            for (const cx of bb.vaosReivindicados) {
                const d = Math.abs(cx - x);
                if (d < minD) minD = d;
            }
        }
        let nota = minD;
        if (Math.sign(x) === meuLado) nota += 4.0;
        if (nota > melhorNota) { melhorNota = nota; melhorX = x; }
    }

    if (bb) {
        if (!bb.vaosReivindicados) bb.vaosReivindicados = [];
        bb.vaosReivindicados.push(melhorX);
    }
    return melhorX;
}

/* =========================================================================
   CAMADA POSICIONAL DO PLAYING STYLE
   =========================================================================
   Vinha do PositionAI.commit, no antigo nivel 2. Com o nivel 2 apagado, o
   desvio pessoal do estilo passa para o lado dos estilos, que e onde
   pertence: o TeamBT poe o jogador no slot do bloco, e isto inclina-o.

   Recebe e devolve o alvo em coordenadas do mundo. So jogadores de campo —
   o guarda-redes tem o seu proprio ciclo (updateGK).
   ========================================================================= */
function aplicarEstiloPosicional(p, bb, targetX, targetZ) {
    if (!Config.usePlayingStyles || p.role === 'gk' || typeof estiloAtivoDe !== 'function') {
        return { x: targetX, z: targetZ };
    }

    const est = estiloAtivoDe(p);


        // Avanço/recuo, no referencial de ataque.
        let avanco = est.avanco;
        if (bb && bb.isAttacking) {
            avanco += est.avancoComBola;
        } else {
            // Em fase defensiva (T.Defensive / Defensive / sem posse), avanço ofensivo positivo é anulado
            if (avanco > 0) avanco = 0;
        }
        // Se a mentalidade tática for defensiva (defesa / muito_defensiva), laterais e médios de ala seguram a linha e não avançam pelo estilo
        if (typeof Tatics !== 'undefined' && (Tatics.estilo === 'defesa' || Tatics.estilo === 'muito_defensiva')) {
            if (['LB', 'RB', 'LM', 'RM'].includes(p.pos) && avanco > 0) {
                avanco = 0;
            }
        }
        if (avanco !== 0) {
            targetZ += avanco * p.dirZ;

            // Evitar que médios e atacantes recuem para trás da linha de centrais (CB)
            if (avanco < 0 && (p.role === 'mid' || p.role === 'atk')) {
                if (bb && bb.own) {
                    let maxCBZ = null;
                    for (const c of bb.own) {
                        if (c.role === 'def' && c.pos === 'CB' && c !== p && c.slotTarget) {
                            const cz = c.slotTarget.z * p.dirZ;
                            if (maxCBZ === null || cz > maxCBZ) maxCBZ = cz;
                        }
                    }
                    if (maxCBZ !== null) {
                        // O médio tem que estar pelo menos 2 metros à frente do CB mais avançado
                        const zAtk = targetZ * p.dirZ;
                        if (zAtk < maxCBZ + 2.0) {
                            targetZ = (maxCBZ + 2.0) * p.dirZ;
                        }
                    }
                }
            }
        }

        // Largura: + abre para a linha do LADO DELE, − fecha para o eixo.
        if (est.largura !== 0) {
            const ladoEst = Math.sign(p.baseTarget.x) || 1;
            targetX += est.largura * ladoEst;
        }

        /*
        `ombroDefesa` (Goal Poacher): cola-se à linha do último defensor,
        à espera do lançamento — pedido explícito: não num X fixo, na
        BRECHA da linha (o vão entre os dois zagueiros mais próximos ali,
        ver melhorVaoX). Z continua um alvo absoluto (a graça é estar
        exactamente no limite do fora-de-jogo).
        */
        if (est.ombroDefesa && bb && bb.isAttacking &&
            bb.offsideLimitDir !== null && bb.offsideLimitDir !== undefined) {
            
            let zAtk = bb.offsideLimitDir - 0.5;
            
            // O Goal Poacher procura a linha de impedimento, mas não deve se desligar
            // completamente do bloco da equipa (o que causaria a "movimentação maluca" 
            // de ir muito além do TeamBT e depois recuar tudo quando perde a posse).
            if (bb.bloco && bb.bloco.z1 !== undefined) {
                const limiteFrente = bb.bloco.z1 + 12.0; // Máximo 12m à frente do bloco
                if (zAtk > limiteFrente) zAtk = limiteFrente;
            }

            // Não deve recuar para trás da sua posição original projetada
            const zAtkBase = targetZ * p.dirZ;
            if (zAtk < zAtkBase) zAtk = zAtkBase;
            
            targetZ = zAtk * p.dirZ;
            targetX = melhorVaoX(p, bb, targetZ,
                [-16, -12, -8, -4, 0, 4, 8, 12, 16]);
        }

        /*
        `dentroArea` (Fox in the Box): dentro da grande área, mas no VÃO
        entre zagueiros — pedido explícito: "numa posição que não tenha
        adversário, ou entre 2 adversários", não um X qualquer dentro da
        caixa.
        */
        if (est.dentroArea && bb && bb.isAttacking) {
            /*
            A PROFUNDIDADE ACOMPANHA A BOLA. Era `targetZ >= CrossModel.areaZ`
            fixo: com o gatilho a ligar já a partir do meio-campo, isso colava-o
            à área com a bola ainda na defesa — um jogador a menos na jogada
            durante metade do campo.

            Agora espera `esperaAtras` metros à frente da bola e nunca aquém da
            entrada da área; quando a jogada chega, ele já lá está dentro. O
            tecto é `avancoMax`, para não ficar em cima do guarda-redes.
            */
            const F = (typeof PlayingStyleTuning !== 'undefined' && PlayingStyleTuning.foxInTheBox)
                ? PlayingStyleTuning.foxInTheBox
                : { entradaArea: 30.0, esperaAtras: 8.0, avancoMax: 46.0 };

            const bolaAvancoFox = bb.ballZ * bb.dir;
            const zDesejado = THREE.MathUtils.clamp(
                bolaAvancoFox + F.esperaAtras, F.entradaArea, F.avancoMax);

            if (targetZ * p.dirZ < zDesejado) targetZ = zDesejado * p.dirZ;
            targetX = melhorVaoX(p, bb, targetZ,
                [-16, -11, -6.5, -2, 2, 6.5, 11, 16]);
        }

        /*
        `atraiDefesa` (Dummy Runner): faz uma corrida de desmarque em profundidade
        e diagonal (puxa o zagueiro/marcador para a ponta/corredor), abrindo o
        corredor central para o condutor da bola ou jogadores de 2ª linha.
        */
        if (est.atraiDefesa && p._dummyAtivo &&
            bb && bb.isAttacking && bb.carrier && bb.carrier !== p) {
            const ladoEst = Math.sign(p.baseTarget.x) || 1;
            const carrierX = bb.carrier.model ? bb.carrier.model.position.x : 0;
            const carrierZ = bb.carrier.model ? bb.carrier.model.position.z : 0;

            // Desloca-se em X para o corredor lateral/meio-espaço para abrir o centro
            if (Math.abs(carrierX) < 8.0) {
                targetX = ladoEst * 15.0;
            } else {
                const fx = targetX - carrierX;
                const fd = Math.abs(fx) || 1;
                targetX += (fx / fd) * 7.0;
            }

            // Evita colapso de múltiplos Dummy Runners no mesmo alvo usando a base natural do slot
            const espalhamentoExtra = p.slot ? (p.slot.u - 0.5) * 6.0 : ((p.id % 3) - 1) * 3.0;
            targetX += espalhamentoExtra;

            // Desloca-se em Z à frente da jogada/portador (profundidade de ataque)
            const zAtkMin = (carrierZ * p.dirZ) + 6.0;
            let zAtk = Math.max(targetZ * p.dirZ, zAtkMin);

            // Respeita a linha de impedimento para arrastar a defesa sem ficar impedido
            if (bb.offsideLimitDir !== null && bb.offsideLimitDir !== undefined) {
                zAtk = Math.min(zAtk, bb.offsideLimitDir - 0.8);
            }

            targetZ = zAtk * p.dirZ;

            // Limites do campo
            targetX = THREE.MathUtils.clamp(targetX, -(CAMPO_LARG / 2 - 3.0), (CAMPO_LARG / 2 - 3.0));
            targetZ = THREE.MathUtils.clamp(targetZ, -(CAMPO_COMP / 2 - 2.0), (CAMPO_COMP / 2 - 2.0));
        }

        // `colaNaLinha` (Cross Specialist) vs `cortaParaDentro`.
        //
        // Antes puxava para uma linha ABSOLUTA do campo (alaX+7=22m),
        // ignorando o bloco — que bascula com a bola (ver centroX em
        // team_bt.js). Com o jogo do lado oposto, o bloco desliza para
        // lá e o lateral ficava esticado até aos 22m absolutos, bem fora
        // do rectângulo encolhido/deslocado (anéis do PositionBT saíam
        // do TeamBT). Agora o tecto é o próprio limite do bloco, não o
        // campo inteiro.
        if (est.colaNaLinha && bb && bb.isAttacking) {
            const ladoEst = Math.sign(p.baseTarget.x) || 1;
            let tectoAla = CrossModel.alaX + 7;
            if (bb.bloco) {
                const bordaBloco = ladoEst > 0 ? bb.bloco.x1 : -bb.bloco.x0;
                tectoAla = Math.min(tectoAla, Math.max(bordaBloco, 0));
            }
            targetX = ladoEst * Math.max(Math.abs(targetX), tectoAla);
        }

        /*
        `fechaComBolaCentral` (Roaming Flank): pedido explícito (2ª
        correcção) — fica na PONTA por padrão, só busca o meio quando não
        consegue prosseguir pelo lado (corredor tapado por um adversário
        à frente), não só porque a bola está central. A 1ª versão fechava
        proporcional a |ballX|, agressiva de mais — fechava mesmo com o
        corredor livre. Mesma checagem de "corredor livre" do
        attackFullBack.
        */
        if (est.fechaComBolaCentral && bb && bb.isAttacking) {
            const ladoEst = Math.sign(p.baseTarget.x) || 1;
            let tapado = false;
            for (const opp of (bb.opp || [])) {
                if (opp.role === 'gk') continue;
                const noFlanco = (Math.sign(opp.model.position.x) === ladoEst && Math.abs(opp.model.position.x) > 10.0);
                const aFrente = (opp.model.position.z * p.dirZ > p.model.position.z * p.dirZ) &&
                    (opp.model.position.z * p.dirZ < p.model.position.z * p.dirZ + 12.0);
                if (noFlanco && aFrente) { tapado = true; break; }
            }
            
            const bolaLongeOuOposta = (Math.sign(bb.bolaXSuave) !== ladoEst && Math.abs(bb.bolaXSuave) > 8.0);
            
            if (tapado || bolaLongeOuOposta) {
                // Se o corredor estiver tapado, ou a bola no flanco oposto, fecha para o meio
                targetX = ladoEst * Math.abs(targetX) * (bolaLongeOuOposta ? 0.50 : 0.70);
            }
        }

        // `amplitudeZ`: estica ou encolhe o afastamento ao meio do bloco.
        if (est.amplitudeZ !== 1.0 && bb && bb.bloco) {
            const centro = (bb.bloco.z0 + bb.bloco.z1) / 2 * bb.dir;
            targetZ = centro + (targetZ - centro) * est.amplitudeZ;
        }

    return { x: targetX, z: targetZ };
}

/*
`travaNaEntradaArea` (Box-to-Box): "da entrada de uma área até a entrada da
outra" — pedido explícito. Sem tecto, o amplitudeZ (1.5x) esticava o alvo para
BEM DENTRO da área adversária, um meio-campo a jogar de ponta-de-lança.

Vive à parte, e não no fim de aplicarEstiloPosicional, porque tem de ser o
ÚLTIMO a falar. Estava lá dentro, e a marcação posicional — que corre depois —
voltava a empurrá-lo para dentro da área: no terço de ataque o desvio de
marcação chega a 10 m, muito mais do que os 2.5 m de folga que este tecto dá.

Corta só o excesso: nunca empurra para trás quem já estava aquém do tecto.
*/
function aplicarTectoDoEstilo(p, targetZ) {
    if (typeof estiloAtivoDe !== 'function') return targetZ;
    const est = estiloAtivoDe(p);
    
    const zAtaque = targetZ * p.dirZ;

    if (est && est.travaNaEntradaArea) {
        // Linha da grande área: CAMPO_COMP / 2 (53) - 16.5 = 36.5.
        // 10 metros antes disso: 26.5.
        const lim = 26.5; 
        if (zAtaque > lim) return lim * p.dirZ;
        if (zAtaque < -lim) return -lim * p.dirZ;
    }

    if (est && est.travaNaIntermediaria) {
        // Intermediária ofensiva: ~ 15m à frente do meio campo.
        // Impede que o jogador avance muito além disso para organizar o jogo de trás.
        const limIntermediaria = 15.0; 
        if (zAtaque > limIntermediaria) return limIntermediaria * p.dirZ;
    }

    return targetZ;
}
