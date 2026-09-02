/*
=============================================================================
ESTATÍSTICAS DA PARTIDA
=============================================================================
Contadores puros, sem influência nenhuma no jogo — só leitura de eventos que
já acontecem nos outros ficheiros. Cada ponto de instrumentação está
protegido com `typeof MatchStats !== 'undefined'`, ao estilo do resto do
código (ver Match/Tatics), por isso este ficheiro pode ser removido do
index.html sem partir nada.

Pensado para a simulação sem ecrã: correr N jogos de seguida e comparar
números em vez de ficar a ver. `trocasChaser`/`trocasMarcacao`/
`trocasSupportMid` são o número directo para validar a histerese da Fase 1
— se voltarem a subir muito, os saltos voltaram.

Não reinicia sozinho em cada resetPlay() (golo) — um resetPlay é só o
reinício da jogada, não do jogo. Quem corre a simulação em lote chama
MatchStats.reset() a abrir cada "jogo".
=============================================================================
*/
function novoContadorEquipa() {
    return {
        passes: { tentados: 0, certos: 0 },
        lancamentos: { tentados: 0, certos: 0 },   // passe para o espaço (through ball)
        cruzamentos: { tentados: 0, certos: 0 },
        /*
        `noAlvo` conta o que ia MESMO à baliza: golo ou defesa do guarda-redes.
        Postes e travessões ficam de fora, como nos fornecedores de estatística
        — a bola não entrava sem o desvio da madeira. Um remate `furado` (gesto
        sem bola no pé) e um bloqueado também não contam.
        */
        remates: { tentados: 0, golos: 0, furados: 0, noAlvo: 0 },

        // Soma do xG de cada remate (ver XGModel em config.js e xgDoRemate em
        // utils.js). É a qualidade das oportunidades, não o número delas.
        xg: 0,

        /*
        ATAQUES — sequências de posse, e não jogadas de bola parada.

        Uma sequência começa quando a equipa ganha a posse e acaba quando a
        perde. Conta como ATAQUE se em algum momento levou a bola ao meio-campo
        adversário; como PERIGOSO se chegou ao último terço ou acabou em
        remate. É a definição dos fornecedores de estatística e, mais
        importante, é a única que se consegue medir com o que o jogo já regista
        por frame (ver registarZona).
        */
        ataques: { totais: 0, perigosos: 0 },

        /*
        IMPEDIMENTOS — fica sempre a ZERO, e de propósito.

        Não há regra de fora-de-jogo no jogo: o `offsideLimitDir` do TeamBT
        limita onde os atacantes se PÕEM, mas nada marca a infracção. O
        contador existe para o painel poder dizer "sem regra" em vez de mostrar
        um zero que se lê como "a equipa nunca está em fora-de-jogo".
        */
        impedimentos: 0,
        desarmes: { tentados: 0, sucesso: 0 },      // TACKLE (de pé)
        carrinhos: { tentados: 0, sucesso: 0 },     // SLIDE_TACKLE
        dribles: { tentados: 0, sucesso: 0 },       // 1x1 (DRIBBLE)
        cortes: 0,             // intercepções de passes/lançamentos/cruzamentos adversários
        disputasFalhadas: 0,   // bola disputada mas ninguém a controla (deflectBall)
        perdasDePosse: 0,      // bola fugiu do pé sem ser passe (afastou-se demasiado)
        cantos: 0,
        pontapesBaliza: 0,
        /*
        Faltas e disciplina (ver js/officials.js). `cometidas` e `sofridas`
        são as duas faces do mesmo lance, guardadas nas duas equipas: sem as
        duas não se sabe se uma equipa faz muitas faltas ou se apenas sofre
        um adversário faltoso.
        */
        faltas: { cometidas: 0, sofridas: 0 },
        // Bolas jogadas de primeira, sem domínio (ver FirstTouchModel).
        primeiraTocada: 0,
        // Jogadas combinadas (ver JogadasCombinadas em config.js).
        caraACara: 0, tabelinhas: 0, overlaps: 0,
        cartoes: { amarelos: 0, vermelhos: 0 },
        penaltis: 0,
        posseSegundos: 0,
        // Segundos de posse por terço do campo, no referencial de ataque da
        // equipa (def = perto da própria baliza, atk = perto da baliza
        // adversária). Serve para localizar ONDE a construção fica presa,
        // em vez de só saber que a bola foi pouco à baliza.
        tercoSegundos: { def: 0, mid: 0, atk: 0 },
        distanciaPercorrida: 0,
        // Churn dos alvos com histerese (Fase 1) — quantas vezes por jogo o
        // chaser/a marcação/o apoio na construção TROCARAM de jogador.
        /*
        =====================================================================
        FICHA DE JOGO COMPLETA — o que se acrescentou, e o que cada um quer
        dizer. As definições estão aqui e não num documento à parte porque é
        aqui que se contam: uma métrica sem definição escrita é uma métrica
        que muda de sentido à segunda leitura.
        =====================================================================
        */

        // --- FINALIZAÇÃO -------------------------------------------------
        // `bloqueados`: o remate foi tocado por um jogador de linha da equipa
        // que defende antes de chegar à baliza. Não conta como `noAlvo`.
        remateBloqueados: 0,
        // Remates com xG acima de `StatsModel.limiarGrandeChance`.
        grandesChances: 0,
        // Quantas dessas acabaram em golo. Sem este contador a
        // `conversaoDeChances` era golos/grandesChances — todos os golos a
        // dividir pelas grandes chances — e dava valores impossiveis (200%
        // com dois golos e uma grande chance).
        grandesChancesConvertidas: 0,

        // --- ATAQUE ------------------------------------------------------
        // Sequências de posse que ENTRARAM no último terço (uma por sequência,
        // não uma por frame). Ver seguirAtaque.
        entradasUltimoTerco: 0,
        // Toques de um atacante DENTRO da grande área adversária.
        toquesNaArea: 0,
        // Metros ganhos na direcção da baliza adversária com a bola no pé.
        progressaoComBolaM: 0,

        // --- PASSE -------------------------------------------------------
        /*
        `progressivos`: passe CERTO que aproxima a bola da linha de fundo
        adversária em pelo menos `StatsModel.progressivoMin` metros.
        `noTercoFinal`: passe certo que ACABA no último terço.
        `quebraLinhas`: passe certo que deixa para trás pelo menos um
        adversário — alguém que estava entre a origem e o destino, dentro do
        corredor do passe.
        `sobPressao`: no instante do contacto havia um adversário a menos de
        `StatsModel.raioPressao` de quem passou.
        `paraFinalizacao`: foi o último passe certo da equipa antes de um
        remate dela (dentro de `StatsModel.janelaChave` segundos).
        `assistencias`: o mesmo, mas o remate foi golo.
        */
        passesProgressivos: 0,
        passesNoTercoFinal: 0,
        passesQuebraLinhas: 0,
        passesSobPressao: 0,
        passesParaFinalizacao: 0,
        assistencias: 0,

        // --- DEFESA ------------------------------------------------------
        /*
        `duelos`: desarmes, carrinhos e disputas de bola dividida, ganhos e
        perdidos. `duelosAereos` são os do ar (dois a saltar pela mesma bola).
        `recuperacoes`: a posse mudou para esta equipa. `recuperacoesAtaque`
        são as que aconteceram no terço ofensivo dela.
        `pressoes`: um adversário entrou no raio de pressão do portador — é o
        acto de pressionar, ganhe-se a bola ou não.
        `perdasZonaPerigosa`: perdeu-se a bola no PRÓPRIO terço defensivo.
        `errosQueGeraramRemate`: perda de posse seguida de remate adversário
        dentro de `StatsModel.janelaErro` segundos.
        */
        duelos: { ganhos: 0, perdidos: 0 },
        duelosAereos: { ganhos: 0, perdidos: 0 },
        recuperacoes: 0,
        recuperacoesAtaque: 0,
        pressoes: 0,
        perdasZonaPerigosa: 0,
        errosQueGeraramRemate: 0,
        // Afastamentos: bola mandada para longe sem destinatário (alívios).
        afastamentos: 0,

        // --- GUARDA-REDES -------------------------------------------------
        /*
        `defesas` é o número de vezes que o guarda-redes IMPEDIU o golo — a
        chamada `MatchStats.registarDefesa` já existia espalhada pelo código e
        a função nunca tinha sido escrita, por isso a estatística mais visível
        de um jogo estava sempre a zero.
        */
        defesas: 0,
        golosSofridos: 0,
        saidasDoGolo: 0,
        cruzamentosCortadosGK: 0,

        // --- CONTROLO -----------------------------------------------------
        // Domínios de bola (primeiro toque com sucesso). Estava a ser criado à
        // mão no player.js, fora do contador; agora é do esquema.
        dominios: 0,

        trocasChaser: 0,
        trocasMarcacao: 0,
        trocasSupportMid: 0
    };
}

const MatchStats = {
    TeamA: novoContadorEquipa(),
    TeamB: novoContadorEquipa(),

    _pendingPassType: null,
    _pendingPassTeam: null,
    _pendingSample: null,

    /*
    Zera o jogo, NÃO a telemetria de passes: o Sim chama isto entre jogos do
    lote e as amostras têm de somar o lote inteiro para as medianas serem
    estáveis. Quem limpa as amostras é o Sim.run, no arranque.
    */
    reset: function () {
        this.TeamA = novoContadorEquipa();
        this.TeamB = novoContadorEquipa();
        this._pendingPassType = null;
        this._pendingPassTeam = null;
        this._pendingSample = null;
        // Sem isto, a primeira sequência do jogo seguinte herdava a equipa e o
        // "já passou o meio" do jogo anterior.
        this._ataque = null;
        this._pendingPasseCtx = null;
        this._zAnterior = null;
        this._arrefArea = null;
        this._arrefPressao = null;
        this._ultimoPasseCerto = null;
        this._remateArmado = null;
        this._grandeChancePendente = null;
        this._remateEmVoo = null;
        this._ultimaPerda = null;
    },

    /*
    Chamado uma vez por frame em Match.updatePossession() enquanto alguém
    tem a bola — `zoneAhead` já vem calculado no referencial de ataque
    (posição.z * dirZ, tal como PlayerContext.zoneAhead). Limiares a 1/6 e
    3/6 do comprimento do campo dividem-no em três terços iguais.
    */
    /*
    =========================================================================
    OS REGISTADORES DA FICHA COMPLETA
    =========================================================================
    Cada um é chamado de UM sítio do jogo, no instante do evento. Nenhum deles
    lê o mundo por si: recebe o que já foi calculado onde o evento acontece.
    =========================================================================
    */

    /*
    A DEFESA DO GUARDA-REDES. Esta função era CHAMADA em dois sítios
    (match_loop.js e player.js) e nunca tinha sido escrita — como as chamadas
    estão protegidas com `&&`, falhavam em silêncio e o contador ficava a
    zero. É a estatística mais visível de um jogo.
    */
    /*
    Ha remates que nao passam pelo `registarRemateNaFicha` — livre directo,
    penalti e cabeceamento resolvem-se por caminhos proprios. Sem isto, uma
    defesa nesses lances nao contava (o `registarDefesa` exige um remate a
    caminho).
    */
    marcarRemateEmVoo: function (team) {
        this._remateEmVoo = { equipa: team, t: this.relogio };
    },

    registarDefesa: function (team) {
        const s = this[team];
        if (!s) return;
        /*
        DEFESA E UM REMATE IMPEDIDO, nao "o guarda-redes tocou na bola". Isto
        e chamado no gesto de maos e no mergulho, que tambem apanham cruzamentos
        e passes atrasados — e por isso o lote dava 6 a 9 defesas por jogo com
        2 remates enquadrados, o que e impossivel numa ficha.

        So conta se houver um remate da OUTRA equipa a caminho, dentro da mesma
        janela que confirma a assistencia. O remate e consumido: uma bola so se
        defende uma vez.
        */
        const M = (typeof StatsModel !== 'undefined') ? StatsModel : null;
        const r = this._remateEmVoo;
        if (!M || !r || r.equipa === team) return;
        if ((this.relogio - r.t) > M.janelaChave) return;
        this._remateEmVoo = null;
        s.defesas++;
    },

    /*
    A ASSISTENCIA confirma-se no GOLO. `janelaChave` conta do remate ao golo:
    a bola pode demorar a entrar, mas nao um lance inteiro.
    */
    registarAssistencia: function (team) {
        const s = this[team];
        const M = (typeof StatsModel !== 'undefined') ? StatsModel : null;
        const r = this._remateArmado;
        if (!s || !M || !r || r.equipa !== team) return;
        if ((this.relogio - r.t) > M.janelaChave) return;
        s.assistencias++;
        this._remateArmado = null;
    },

    /*
    Golo entrou: se o remate que o fez era uma grande chance, ela conta como
    convertida. A janela e a mesma do passe-chave — entre o remate e a bola na
    baliza passam frames, nao segundos.
    */
    confirmarGrandeChance: function (team) {
        const s = this[team];
        const M = (typeof StatsModel !== 'undefined') ? StatsModel : null;
        const g = this._grandeChancePendente;
        if (!s || !M || !g || g.equipa !== team) return;
        if ((this.relogio - g.t) > M.janelaChave) return;
        s.grandesChancesConvertidas++;
        this._grandeChancePendente = null;
    },

    registarGoloSofrido: function (team) {
        const s = this[team];
        if (s) s.golosSofridos++;
    },

    registarSaidaDoGolo: function (team) {
        const s = this[team];
        if (s) s.saidasDoGolo++;
    },

    registarCruzamentoCortadoGK: function (team) {
        const s = this[team];
        if (s) s.cruzamentosCortadosGK++;
    },

    registarRemateBloqueado: function (team) {
        const s = this[team];
        if (s) s.remateBloqueados++;
    },

    registarAfastamento: function (team) {
        const s = this[team];
        if (s) s.afastamentos++;
    },

    /*
    DUELOS. `aereo` separa a disputa no ar da disputa no chão; `ganhou` diz de
    que lado fica o ponto. Chamado uma vez por duelo, pela equipa de quem
    ganhou — a outra leva o perdido.
    */
    registarDuelo: function (teamGanhou, teamPerdeu, aereo) {
        const g = this[teamGanhou], p = this[teamPerdeu];
        if (g) { g.duelos.ganhos++; if (aereo) g.duelosAereos.ganhos++; }
        if (p) { p.duelos.perdidos++; if (aereo) p.duelosAereos.perdidos++; }
    },

    /*
    PRESSÃO: um adversário entrou no raio de pressão do portador. Conta o
    ACTO, não o resultado — quem pressiona é quem se aproxima.
    */
    registarPressao: function (team) {
        const s = this[team];
        if (s) s.pressoes++;
    },

    /*
    RECUPERAÇÃO e PERDA. Chamadas do `updatePossession`, no frame em que a
    posse muda de dono. `zoneAhead` é do ponto de vista de QUEM RECUPERA.
    */
    registarRecuperacao: function (team, zoneAhead) {
        const s = this[team];
        if (!s) return;
        s.recuperacoes++;
        if (zoneAhead > (CAMPO_COMP / 6)) s.recuperacoesAtaque++;
    },

    /*
    A perda conta-se no terço defensivo de quem perdeu — é a que dói.
    Guarda-se também o instante, para o `errosQueGeraramRemate`.
    */
    registarPerda: function (team, zoneAhead) {
        const s = this[team];
        if (!s) return;
        if (zoneAhead < -(CAMPO_COMP / 6)) s.perdasZonaPerigosa++;
        /*
        PERDA DE POSSE: a bola mudou de dono SEM ser num passe. O contador
        antigo vivia no match_loop e nunca disparava — exigia `ballCarrier`
        posto com a bola ja a 2 m, e o toque de conducao limpa o portador no
        instante em que a solta. Aqui sabe-se as duas coisas: que a posse
        mudou, e se havia passe em curso quando mudou.
        */
        if (!this._pendingPassType) s.perdasDePosse++;
        this._ultimaPerda = { equipa: team, t: this.relogio };
    },

    registarToqueNaArea: function (team) {
        const s = this[team];
        if (s) s.toquesNaArea++;
    },

    registarProgressao: function (team, metros) {
        const s = this[team];
        if (s && metros > 0) s.progressaoComBolaM += metros;
    },

    /*
    O PASSE CERTO, com a qualidade dele. Chamado do `registarRecepcao` quando
    a bola chega mesmo a um companheiro: é aí que se sabe que o passe valeu.

    `origem`/`destino` são {x, z}; `dirZ` é o sentido de ataque de quem passou;
    `adversarios` é a lista de {x, z} do adversário, para o teste das linhas.
    */
    registarPasseCerto: function (team, ctx) {
        const s = this[team];
        if (!s || !ctx || !ctx.origem || !ctx.destino) return;
        const M = (typeof StatsModel !== 'undefined') ? StatsModel : null;
        if (!M) return;

        const dir = ctx.dirZ || 1;
        const fundo = (typeof LINHA_FUNDO !== 'undefined') ? LINHA_FUNDO : 53;

        // PROGRESSIVO: aproximou-se da linha de fundo adversária.
        const antes = fundo - ctx.origem.z * dir;
        const depois = fundo - ctx.destino.z * dir;
        if (antes - depois >= M.progressivoMin) s.passesProgressivos++;

        // NO TERÇO FINAL: acabou lá.
        if (ctx.destino.z * dir > (CAMPO_COMP / 6)) s.passesNoTercoFinal++;

        // SOB PRESSÃO: havia alguém em cima de quem passou.
        if (typeof ctx.distAdversario === 'number' &&
            ctx.distAdversario < M.raioPressao) s.passesSobPressao++;

        // QUEBRA LINHAS: deixou alguém para trás, dentro do corredor do passe.
        if (ctx.adversarios && ctx.adversarios.length &&
            this.contarUltrapassados(ctx, M.corredorLinha) >= 1) s.passesQuebraLinhas++;

        // E fica guardado para a assistência / passe para finalização.
        this._ultimoPasseCerto = { equipa: team, t: this.relogio };
    },

    /*
    QUANTOS ADVERSÁRIOS FICARAM PARA TRÁS. Conta quem estava entre a origem e
    o destino no eixo do passe e dentro de `largura` da linha dele — a conta
    de "passe que quebra linhas" sem precisar de saber onde estão as linhas.
    */
    contarUltrapassados: function (ctx, largura) {
        const dx = ctx.destino.x - ctx.origem.x;
        const dz = ctx.destino.z - ctx.origem.z;
        const comp = Math.hypot(dx, dz);
        if (comp < 1e-3) return 0;
        const ux = dx / comp, uz = dz / comp;
        let n = 0;
        for (const o of ctx.adversarios) {
            if (!o) continue;
            const rx = o.x - ctx.origem.x, rz = o.z - ctx.origem.z;
            const aoLongo = rx * ux + rz * uz;
            if (aoLongo <= 0 || aoLongo >= comp) continue;
            if (Math.abs(rx * (-uz) + rz * ux) <= largura) n++;
        }
        return n;
    },

    /*
    O REMATE, para o que depende dele: grande chance, passe para finalização e
    assistência. Chamado no instante do remate, com o xG já calculado.
    */
    registarRemateNaFicha: function (team, xg, foiGolo) {
        const s = this[team];
        if (!s) return;
        const M = (typeof StatsModel !== 'undefined') ? StatsModel : null;
        /*
        No instante do remate ainda nao se sabe se ele entrou (o `foiGolo` da
        chamada e sempre false — a bola so cruza a linha frames depois), por
        isso a chance fica PENDENTE e e o golo que a confirma, exactamente como
        a assistencia aqui em baixo.
        */
        // Remate a caminho: e o que autoriza a contar uma DEFESA do outro lado.
        this._remateEmVoo = { equipa: team, t: this.relogio };

        if (M && xg >= M.limiarGrandeChance) {
            s.grandesChances++;
            this._grandeChancePendente = { equipa: team, t: this.relogio };
        }
        if (foiGolo) this.confirmarGrandeChance(team);

        /*
        No instante do remate ainda nao se sabe se ele vai ser golo, por isso
        a ASSISTENCIA nao se pode decidir aqui: marca-se que este remate teve
        um passe a arma-lo, e e o golo que depois a confirma (registarAssistencia).
        */
        this._remateArmado = null;
        const ult = this._ultimoPasseCerto;
        if (M && ult && ult.equipa === team && (this.relogio - ult.t) <= M.janelaChave) {
            s.passesParaFinalizacao++;
            this._remateArmado = { equipa: team, t: this.relogio };
        }

        /*
        E o ERRO que gerou o remate: se a posse tinha mudado há pouco, quem a
        perdeu leva a marca. É a leitura de "sofremos por nossa causa".
        */
        const perda = this._ultimaPerda;
        if (M && perda && perda.equipa !== team && (this.relogio - perda.t) <= M.janelaErro) {
            const q = this[perda.equipa];
            if (q) q.errosQueGeraramRemate++;
            this._ultimaPerda = null;
        }
    },

    /*
    =========================================================================
    O QUE SE MEDE POR FRAME, COM A BOLA NO PÉ DE ALGUÉM
    =========================================================================
    Três coisas que não têm evento próprio e por isso se lêem do estado:

      PRESSÃO      um adversário entrou no raio do portador. Conta o ACTO, uma
                   vez por par enquanto ele lá estiver (`arrefecimentoPressao`)
                   — sem isso, um defensor colado somava sessenta pressões por
                   segundo.
      TOQUE NA ÁREA  o portador está dentro da grande área adversária. Também
                   com arrefecimento: é um toque, não um frame.
      PROGRESSÃO   metros ganhos na direcção da baliza adversária com a bola.

    Chamado uma vez por frame do `updatePossession`, que é onde o portador já
    está identificado.
    =========================================================================
    */
    medirComBola: function (portador, dt) {
        if (!portador || !portador.model || typeof StatsModel === 'undefined') return;
        const M = StatsModel;
        const s = this[portador.team];
        if (!s) return;

        const pos = portador.model.position;
        const zAtaque = pos.z * portador.dirZ;

        // --- PROGRESSÃO: só o que avança conta.
        if (this._zAnterior && this._zAnterior.p === portador) {
            this.registarProgressao(portador.team, zAtaque - this._zAnterior.z);
        }
        this._zAnterior = { p: portador, z: zAtaque };

        // --- TOQUE NA ÁREA
        if (!this._arrefArea) this._arrefArea = new Map();
        const tArea = this._arrefArea.get(portador) || 0;
        const linhaFundo = portador.dirZ * ((typeof LINHA_FUNDO !== 'undefined') ? LINHA_FUNDO : 53);
        const naArea = (typeof Area !== 'undefined' && Area.contem)
            ? Area.contem(pos.x, pos.z, linhaFundo) : false;
        if (naArea && this.relogio - tArea > M.arrefecimentoPressao) {
            this._arrefArea.set(portador, this.relogio);
            this.registarToqueNaArea(portador.team);
        }

        // --- PRESSÃO sobre ele
        if (!this._arrefPressao) this._arrefPressao = new Map();
        const adversarios = (portador.team === 'TeamA')
            ? (Match.opponents || []) : (Match.players || []);
        for (const o of adversarios) {
            if (!o || o.role === 'gk' || !o.model) continue;
            const d = Math.hypot(o.model.position.x - pos.x, o.model.position.z - pos.z);
            if (d > M.raioPressao) continue;
            const chave = o.id + ':' + portador.id;
            const t = this._arrefPressao.get(chave) || -999;
            if (this.relogio - t > M.arrefecimentoPressao) {
                this._arrefPressao.set(chave, this.relogio);
                this.registarPressao(o.team);
            }
        }
    },

    registarZona: function (team, zoneAhead, dt) {
        const s = this[team];
        if (!s) return;
        const terco = (CAMPO_COMP / 6);
        if (zoneAhead < -terco) s.tercoSegundos.def += dt;
        else if (zoneAhead > terco) s.tercoSegundos.atk += dt;
        else s.tercoSegundos.mid += dt;

        this.seguirAtaque(team, zoneAhead);
    },

    /*
    A SEQUÊNCIA DE ATAQUE EM CURSO — de quem é a bola, e até onde ela já foi.

    Vive aqui e não no Match porque é alimentada pelo `registarZona`, que já é
    chamado uma vez por frame com a posse e com o `zoneAhead` no referencial de
    ataque de quem tem a bola. Não é preciso ler estado nenhum do jogo outra
    vez, e não há um segundo sítio a decidir de quem é a posse.

    `null` entre sequências (ninguém com a bola).
    */
    _ataque: null,

    /*
    Fecha a sequência em curso e credita-a. Chamada quando a posse muda de
    equipa, quando a bola sai de jogo e no fim do jogo — uma sequência aberta
    que nunca fecha é uma que nunca conta, e o último ataque de cada jogo é
    precisamente o que ficaria de fora.
    */
    fecharAtaque: function () {
        const a = this._ataque;
        this._ataque = null;
        if (!a) return;

        const s = this[a.team];
        if (!s) return;

        // Um ataque que nunca saiu do próprio meio-campo não é um ataque:
        // é a equipa a segurar a bola atrás.
        if (!a.passouOMeio) return;
        s.ataques.totais++;
        if (a.chegouAoTerco || a.rematou) s.ataques.perigosos++;
    },

    seguirAtaque: function (team, zoneAhead) {
        if (!this._ataque || this._ataque.team !== team) {
            this.fecharAtaque();
            this._ataque = {
                team: team, passouOMeio: false,
                chegouAoTerco: false, rematou: false
            };
        }
        const a = this._ataque;
        if (zoneAhead > 0) a.passouOMeio = true;
        /*
        ENTRADA NO ULTIMO TERCO: uma por SEQUENCIA e nao uma por frame — e a
        sequencia que entra no terco, nao a bola que la esta.
        */
        if (zoneAhead > CAMPO_COMP / 6) {
            if (!a.chegouAoTerco) {
                const s = this[team];
                if (s) s.entradasUltimoTerco++;
            }
            a.chegouAoTerco = true;
        }
    },

    /*
    Um remate torna PERIGOSA a sequência em curso, mesmo que tenha saído de
    trás do meio-campo — e torna-a um ataque, ponto. Um remate de 40 m não
    passou o meio-campo com a bola no pé, mas foi uma ida à baliza.
    */
    registarRemateNoAtaque: function (team) {
        if (!this._ataque || this._ataque.team !== team) return;
        this._ataque.rematou = true;
        this._ataque.passouOMeio = true;
    },

    // Chamado no instante em que a bola sai do pé (fsm.js, case PASS).
    registarPasseIniciado: function (team, tipo, dados) {
        const s = this[team];
        if (!s) return;
        if (tipo === 'lancamento') s.lancamentos.tentados++;
        else if (tipo === 'cruzamento') s.cruzamentos.tentados++;
        else s.passes.tentados++;

        /*
        Um passe pendente ainda aberto quando o seguinte arranca é um passe
        que NINGUÉM tocou — morreu sozinho no relvado ou saiu pela linha.
        Sem isto esses passes desapareciam da contabilidade: não eram certos,
        não eram corte, não eram disputa falhada.
        */
        if (this._pendingSample) this.fecharAmostraPasse('ninguem');

        this._pendingPassType = tipo;
        this._pendingPassTeam = team;
        // O CONTEXTO do passe fica guardado: a qualidade dele (progressivo,
        // quebra-linhas, sob pressao) so se pode contar quando a bola chegar.
        this._pendingPasseCtx = (dados && dados.origem) ? {
            origem: dados.origem, destino: dados.destino, dirZ: dados.dirZ,
            distAdversario: dados.distAdversario, adversarios: dados.adversarios
        } : null;

        if (dados) {
            this._pendingSample = {
                equipa: team,
                tipo: tipo,
                dist: Math.round(dados.dist * 10) / 10,
                alto: !!dados.alto,
                vSaida: Math.round(Math.hypot(dados.vx, dados.vz) * 10) / 10,
                t0: this.relogio,
                desfecho: null, tVoo: null, vChegada: null
            };
        } else {
            this._pendingSample = null;
        }
    },

    /*
    TELEMETRIA DO PASSE — uma amostra por passe, para se poder afinar com
    números em vez de impressões. Guarda distância, tipo, velocidade de saída
    e de chegada, tempo de voo e desfecho.

    Cap de amostras: um lote de 10 jogos passa das 3000, e o JSON exportado
    não precisa de as ter todas para as medianas serem estáveis.
    */
    amostrasPasse: [],
    maxAmostrasPasse: 4000,

    /*
    Relógio em segundos SIMULADOS, contados aqui. `Match.tempoDeJogo` não
    serve: vem multiplicado pelo MatchDuration.timeScale (4.5x), e um tempo
    de voo medido nessa escala não se compara com nada da física.
    */
    relogio: 0,
    tick: function (dt) { this.relogio += dt; },

    fecharAmostraPasse: function (desfecho, vChegada) {
        const a = this._pendingSample;
        this._pendingSample = null;
        if (!a) return;
        a.desfecho = desfecho;
        if (typeof vChegada === 'number') a.vChegada = Math.round(vChegada * 10) / 10;
        a.tVoo = Math.round((this.relogio - a.t0) * 100) / 100;
        delete a.t0;
        if (this.amostrasPasse.length < this.maxAmostrasPasse) this.amostrasPasse.push(a);
    },

    /*
    Resumo das amostras: medianas por faixa de distância e repartição dos
    desfechos. É isto que diz se o problema do passe é pontaria, peso, ou a
    bola chegar tão devagar que dá tempo de a cortar.
    */
    resumoPasses: function () {
        const faixas = [
            { nome: '0-8m', min: 0, max: 8 },
            { nome: '8-15m', min: 8, max: 15 },
            { nome: '15-25m', min: 15, max: 25 },
            { nome: '25m+', min: 25, max: Infinity }
        ];
        const mediana = (arr) => {
            if (!arr.length) return null;
            const o = arr.slice().sort((x, y) => x - y);
            const m = Math.floor(o.length / 2);
            return Math.round((o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2) * 10) / 10;
        };
        const linhas = [];
        for (const f of faixas) {
            const amostra = this.amostrasPasse.filter(a => a.dist >= f.min && a.dist < f.max);
            if (!amostra.length) continue;
            const conta = (d) => amostra.filter(a => a.desfecho === d).length;
            linhas.push({
                faixa: f.nome,
                n: amostra.length,
                pctAlto: Math.round(100 * amostra.filter(a => a.alto).length / amostra.length),
                vSaidaMediana: mediana(amostra.map(a => a.vSaida)),
                vChegadaMediana: mediana(amostra.filter(a => a.vChegada !== null).map(a => a.vChegada)),
                tVooMediano: mediana(amostra.filter(a => a.tVoo !== null).map(a => a.tVoo)),
                pctCerto: Math.round(100 * conta('certo') / amostra.length),
                pctCortado: Math.round(100 * conta('corte') / amostra.length),
                pctDominioFalhado: Math.round(100 * conta('falhou') / amostra.length),
                pctNinguemTocou: Math.round(100 * conta('ninguem') / amostra.length)
            });
        }
        return linhas;
    },

    /*
    Chamado em Match.resolveBallContact() assim que alguém disputa uma bola
    solta — sucesso ou falha. Só o PRIMEIRO contacto depois de um passe é
    atribuído a esse passe; disputas seguintes (ressaltos, segunda bola) já
    não têm passe pendente e não contam para nenhum bucket de passe.
    */
    registarRecepcao: function (jogador, dominou) {
        const tipo = this._pendingPassType;
        const equipaPasse = this._pendingPassTeam;
        this._pendingPassType = null;
        this._pendingPassTeam = null;
        const ctxPasse = this._pendingPasseCtx;
        this._pendingPasseCtx = null;

        if (!tipo || !equipaPasse) return;
        const s = this[equipaPasse];
        if (!s) return;

        const vChegada = (typeof Match !== 'undefined' && Match.ballVel)
            ? Match.ballVel.length() : undefined;

        if (!dominou) {
            s.disputasFalhadas++;
            this.fecharAmostraPasse('falhou', vChegada);
            return;
        }

        if (jogador.team === equipaPasse) {
            const bucket = (tipo === 'lancamento') ? s.lancamentos
                : (tipo === 'cruzamento') ? s.cruzamentos
                    : s.passes;
            bucket.certos++;
            // E a QUALIDADE do passe, agora que se sabe que ele chegou.
            this.registarPasseCerto(equipaPasse, ctxPasse);
            this.fecharAmostraPasse('certo', vChegada);
        } else {
            const outra = this[jogador.team];
            if (outra) {
                outra.cortes++;
                // Um cruzamento cortado pelo GUARDA-REDES e uma estatistica
                // propria dele numa ficha de jogo.
                if (jogador.role === 'gk' && tipo === 'cruzamento') outra.cruzamentosCortadosGK++;
            }
            this.fecharAmostraPasse('corte', vChegada);
        }
    },

    // Resumo simples para consola/JSON — usado pela simulação em lote.
    /*
    =========================================================================
    ESTATÍSTICA POR JOGO — o painel de calibração
    =========================================================================
    Os contadores são absolutos e o relógio de jogo anda enquanto se joga, por
    isso qualquer leitura a meio de um jogo é uma FRACÇÃO de jogo. Aqui
    escala-se tudo para 90 minutos, que é a única forma de comparar com os
    alvos sem esperar pelo apito final.

        porJogo = valor * (5400 / segundosJogados)

    `Match.tempoDeJogo` já vem em segundos de RELÓGIO DE JOGO (o `update`
    multiplica-o pelo `MatchDuration.timeScale`), portanto não se volta a
    escalar aqui — foi esse o erro que já invalidou uma calibração inteira
    (ver "O ERRO QUE INVALIDAVA TODA A CALIBRAÇÃO" no filesSummary).

    **As duas equipas somam.** Os alvos são de JOGO (2,52 golos por jogo são os
    golos dos dois lados juntos), não de equipa.

    As percentagens NÃO são escaladas: uma razão já é independente do tempo.

    `segundosJogados` abaixo de `MINIMO_PARA_ESCALAR` devolve `null` em vez de
    um número: aos 10 segundos de jogo, um único canto extrapola para 540 por
    jogo, e um painel a mostrar isso é pior do que um painel a dizer que ainda
    não sabe.
    =========================================================================
    */
    MINIMO_PARA_ESCALAR: 60,
    SEGUNDOS_DE_UM_JOGO: 90 * 60,

    porJogo: function (segundosJogados) {
        const A = this.TeamA, B = this.TeamB;
        const soma = (f) => f(A) + f(B);

        const remates = soma(s => s.remates.tentados);
        const passesT = soma(s => s.passes.tentados);
        const passesC = soma(s => s.passes.certos);
        const noAlvo = soma(s => s.remates.noAlvo);

        // As razões valem sempre — não dependem do tempo decorrido.
        const pct = (parte, total) => (total > 0) ? (100 * parte / total) : null;
        const razoes = {
            pctPassesCertos: pct(passesC, passesT),
            pctRematesNoAlvo: pct(noAlvo, remates),
            xgPorRemate: (remates > 0) ? soma(s => s.xg) / remates : null
        };

        if (!(segundosJogados > this.MINIMO_PARA_ESCALAR)) {
            return Object.assign({
                segundosJogados: segundosJogados || 0, escalado: false,
                golos: null, remates: null, cantos: null, amarelos: null,
                vermelhos: null, faltas: null, impedimentos: null,
                ataquesPerigosos: null, ataquesTotais: null, xg: null
            }, razoes);
        }

        const k = this.SEGUNDOS_DE_UM_JOGO / segundosJogados;
        return Object.assign({
            segundosJogados: segundosJogados, escalado: true,
            golos: soma(s => s.remates.golos) * k,
            remates: remates * k,
            cantos: soma(s => s.cantos) * k,
            amarelos: soma(s => s.cartoes.amarelos) * k,
            vermelhos: soma(s => s.cartoes.vermelhos) * k,
            faltas: soma(s => s.faltas.cometidas) * k,
            impedimentos: soma(s => s.impedimentos) * k,
            ataquesPerigosos: soma(s => s.ataques.perigosos) * k,
            ataquesTotais: soma(s => s.ataques.totais) * k,
            xg: soma(s => s.xg) * k
        }, razoes);
    },

    /*
    =========================================================================
    A FICHA DE JOGO
    =========================================================================
    Organizada por categoria, como uma ficha a sério, e com os DERIVADOS
    calculados aqui — percentagens, eficiências e médias não se guardam,
    calculam-se, senão ficam desactualizadas à primeira alteração.

    O que é derivado e de onde:

        posse %              posseSegundos / (posse das duas equipas)
        foraDoAlvo           tentados - noAlvo - bloqueados - furados
        qualidadeDasChances  xg / remates tentados     (xG por remate)
        xgPorAtaque          xg / ataques totais
        eficienciaRemate     golos / remates tentados
        eficienciaPasse      passes certos / tentados
        eficienciaDefensiva  duelos ganhos / duelos disputados
        conversaoDeChances   golos / grandes chances

    `impedimentos` fica de fora da ficha de propósito: não há regra de
    fora-de-jogo no jogo (ver a nota no contador), e um zero ali lê-se como
    "nunca esteve em fora-de-jogo" em vez de "não é medido".
    =========================================================================
    */
    resumo: function () {
        const pct = (a, b) => b > 0 ? Math.round((a / b) * 1000) / 10 : 0;
        const r2 = (v) => Math.round(v * 100) / 100;
        const posseTotal = this.TeamA.posseSegundos + this.TeamB.posseSegundos;

        const porEquipa = (s, adversario) => {
            const remForaDoAlvo = Math.max(0,
                s.remates.tentados - s.remates.noAlvo - s.remateBloqueados - s.remates.furados);
            const duelosTotais = s.duelos.ganhos + s.duelos.perdidos;
            const aereosTotais = s.duelosAereos.ganhos + s.duelosAereos.perdidos;

            return {
                // --- RESULTADO
                golos: s.remates.golos,
                golosSofridos: s.golosSofridos,

                // --- FINALIZAÇÃO
                remates: s.remates.tentados,
                rematesNoAlvo: s.remates.noAlvo,
                rematesForaDoAlvo: remForaDoAlvo,
                rematesBloqueados: s.remateBloqueados,
                rematesFurados: s.remates.furados,
                xg: r2(s.xg),
                grandesChances: s.grandesChances,

                // --- ATAQUE
                ataques: s.ataques.totais,
                ataquesPerigosos: s.ataques.perigosos,
                entradasUltimoTerco: s.entradasUltimoTerco,
                toquesNaArea: s.toquesNaArea,
                cruzamentos: s.cruzamentos.tentados + '/' + s.cruzamentos.certos,
                passesParaFinalizacao: s.passesParaFinalizacao,
                progressaoComBola: Math.round(s.progressaoComBolaM) + 'm',

                // --- PASSE
                passes: s.passes.tentados + '/' + s.passes.certos +
                    ' (' + pct(s.passes.certos, s.passes.tentados) + '%)',
                lancamentos: s.lancamentos.tentados + '/' + s.lancamentos.certos,
                passesProgressivos: s.passesProgressivos,
                passesNoTercoFinal: s.passesNoTercoFinal,
                passesQuebraLinhas: s.passesQuebraLinhas,
                passesSobPressao: s.passesSobPressao,
                assistencias: s.assistencias,
                primeiraTocada: s.primeiraTocada,
                dominios: s.dominios,

                // --- DEFESA
                desarmes: s.desarmes.tentados + '/' + s.desarmes.sucesso,
                carrinhos: s.carrinhos.tentados + '/' + s.carrinhos.sucesso,
                intercecoes: s.cortes,
                afastamentos: s.afastamentos,
                bloqueios: s.remateBloqueados,
                duelos: s.duelos.ganhos + '/' + duelosTotais,
                duelosAereos: s.duelosAereos.ganhos + '/' + aereosTotais,
                recuperacoes: s.recuperacoes,
                recuperacoesNoAtaque: s.recuperacoesAtaque,
                pressoes: s.pressoes,
                perdasZonaPerigosa: s.perdasZonaPerigosa,
                errosQueGeraramRemate: s.errosQueGeraramRemate,
                disputasFalhadas: s.disputasFalhadas,
                perdasDePosse: s.perdasDePosse,

                // --- GUARDA-REDES
                defesas: s.defesas,
                saidasDoGolo: s.saidasDoGolo,
                cruzamentosCortadosGK: s.cruzamentosCortadosGK,

                // --- CONTROLO
                posse: pct(s.posseSegundos, posseTotal) + '%',
                posseSegundos: Math.round(s.posseSegundos * 10) / 10,
                tercoSegundos: {
                    def: Math.round(s.tercoSegundos.def * 10) / 10,
                    mid: Math.round(s.tercoSegundos.mid * 10) / 10,
                    atk: Math.round(s.tercoSegundos.atk * 10) / 10
                },
                cantos: s.cantos,
                pontapesBaliza: s.pontapesBaliza,
                faltas: s.faltas.cometidas + ' (sofridas ' + s.faltas.sofridas + ')',
                cartoes: s.cartoes.amarelos + 'A/' + s.cartoes.vermelhos + 'V',
                penaltis: s.penaltis,
                dribles: s.dribles.tentados + '/' + s.dribles.sucesso,
                tabelinhas: s.tabelinhas,
                caraACara: s.caraACara,
                overlaps: s.overlaps,
                distanciaPercorrida: Math.round(s.distanciaPercorrida) + 'm',

                // --- EFICIÊNCIAS (derivadas)
                qualidadeDasChances: r2(s.remates.tentados ? s.xg / s.remates.tentados : 0),
                xgPorAtaque: r2(s.ataques.totais ? s.xg / s.ataques.totais : 0),
                eficienciaRemate: pct(s.remates.golos, s.remates.tentados) + '%',
                eficienciaPasse: pct(s.passes.certos, s.passes.tentados) + '%',
                eficienciaDefensiva: pct(s.duelos.ganhos, duelosTotais) + '%',
                conversaoDeChances: pct(s.grandesChancesConvertidas, s.grandesChances) + '%',

                // --- CHURN DOS ALVOS (calibração, não é ficha de jogo)
                trocasChaser: s.trocasChaser,
                trocasMarcacao: s.trocasMarcacao,
                trocasSupportMid: s.trocasSupportMid
            };
        };
        return {
            placar: (typeof Match !== 'undefined')
                ? (Match.placarA + '-' + Match.placarB) : null,
            TeamA: porEquipa(this.TeamA, this.TeamB),
            TeamB: porEquipa(this.TeamB, this.TeamA)
        };
    }
};
