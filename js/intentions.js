/*
=============================================================================
INTENÇÕES DE JOGADA — contratos entre passador e recetor
=============================================================================
Ver docs/superpowers/specs/2026-08-22-intencoes-de-jogada-design.md.

O PROBLEMA. O passador adivinha onde o colega vai estar: o `alvoDePasse`
extrapola a velocidade dele e mira aí. Medido, isso é PIOR do que não
extrapolar nada (63.2% de acerto sem lead contra 59.3% com o lead geométrico
correcto) — porque o colega não se comprometeu com rota nenhuma, e as árvores
mudam-lhe o destino a qualquer frame.

A SAÍDA. O recetor ANUNCIA a rota — "vou nesta direcção, a esta velocidade,
durante estes segundos" — e cumpre-a. O passador projecta o encontro sobre uma
promessa em vez de sobre um palpite. É a diferença entre prever e combinar.

Três acções, que são a API deste módulo:

    Ball_Request        o recetor cria o contrato e arranca
    Long_Ball_Inform    o passador serve-o, e fixa o ponto de encontro
    Intent_Cancel       qualquer um quebra, com motivo

A projecção do encontro é GEOMETRIA PURA, sem erro. A execução do passe leva o
erro de sempre (PassErrorModel): a bola pode não cair no ponto combinado, como
na vida real. O contrato governa a intenção, nunca a física.
=============================================================================
*/
const Intentions = {
    // Contratos vivos, por equipa. Reutilizado entre frames.
    porEquipa: { TeamA: [], TeamB: [] },

    /*
    Relógio próprio, em segundos SIMULADOS. O `Match.tempoDeJogo` vem
    multiplicado pelo MatchDuration.timeScale (4.5x) e não serve para medir
    durações de corrida — o mesmo motivo por que o MatchStats tem o seu.
    */
    relogio: 0,
    _proximoId: 1,

    lista: function (equipa) {
        if (!this.porEquipa[equipa]) this.porEquipa[equipa] = [];
        return this.porEquipa[equipa];
    },

    /* --- consultas ------------------------------------------------------- */

    // O que o passador lê: contratos ainda por servir.
    abertos: function (equipa) {
        return this.lista(equipa).filter(c => c.estado === 'aberto');
    },

    doJogador: function (p) {
        if (!p) return null;
        return this.lista(p.team).find(
            c => c.jogador === p && (c.estado === 'aberto' || c.estado === 'servido')) || null;
    },

    /*
    Onde o dono do contrato promete estar no instante `t`. É uma função pura do
    tempo, e é isto que permite ao passador projectar sem adivinhar.
    */
    posicaoEm: function (c, t) {
        const dt = Math.max(0, t - c.tPedido);
        return {
            x: c.origem.x + c.dir.x * c.velocidade * dt,
            z: c.origem.z + c.dir.z * c.velocidade * dt
        };
    },

    /* --- acções ---------------------------------------------------------- */

    /*
    Ball_Request — o recetor pede a bola e arranca. Pedir implica arrancar: o
    contrato descreve o que ele está mesmo a fazer, não uma promessa
    condicional (senão haveria jogadores a anunciar corridas que nunca fazem).
    */
    pedir: function (p, dir, velocidade, duracao) {
        if (!IntentModel.ativo || !p || !dir) return null;
        if (this.doJogador(p)) return null;                       // um por jogador
        if (this.abertos(p.team).length >= IntentModel.maxPorEquipa) return null;
        if ((p.intentCooldown || 0) > 0) return null;

        const n = Math.hypot(dir.x, dir.z);
        if (!(n > 0.001)) return null;

        const c = {
            id: this._proximoId++,
            equipa: p.team,
            jogador: p,
            origem: { x: p.model.position.x, z: p.model.position.z },
            dir: { x: dir.x / n, z: dir.z / n },
            velocidade: velocidade,
            duracao: THREE.MathUtils.clamp(duracao, IntentModel.duracaoMin, IntentModel.duracaoMax),
            tPedido: this.relogio,
            estado: 'aberto',
            motivo: null,
            passador: null, pontoEncontro: null, tempoVoo: null
        };
        c.tExpira = c.tPedido + c.duracao;
        this.lista(p.team).push(c);

        if (typeof EventBus !== 'undefined') EventBus.emit('BALL_REQUEST', { contrato: c });
        return c;
    },

    /*
    Long_Ball_Inform — o passador serve o contrato. Só aceita um contrato
    ABERTO e fecha-o na mesma chamada: dois passadores não podem servir o
    mesmo no mesmo frame.
    */
    servir: function (c, passador, pontoEncontro, tempoVoo) {
        if (!c || c.estado !== 'aberto') return false;
        c.estado = 'servido';
        c.passador = passador;
        c.pontoEncontro = { x: pontoEncontro.x, z: pontoEncontro.z };
        c.tempoVoo = tempoVoo;
        if (typeof EventBus !== 'undefined') EventBus.emit('LONG_BALL_INFORM', { contrato: c });
        if (typeof MatchStats !== 'undefined') MatchStats.registarContrato('servidos', c.equipa);
        return true;
    },

    /*
    Intent_Cancel — quebra. Com a bola já no ar isto NÃO trava nada: o chuto
    está dado. Marca-se como falhado e o jogador volta a decidir livremente.
    */
    cancelar: function (c, motivo) {
        if (!c || c.estado === 'cancelado' || c.estado === 'cumprido') return;
        const eraServido = (c.estado === 'servido');
        c.estado = eraServido ? 'falhado' : 'cancelado';
        c.motivo = motivo;
        if (c.jogador) c.jogador.intentCooldown = IntentModel.cooldown;
        if (typeof EventBus !== 'undefined') EventBus.emit('INTENT_CANCEL', { contrato: c, motivo: motivo });
        if (typeof MatchStats !== 'undefined') MatchStats.registarContrato('cancelados', c.equipa, motivo);
    },

    cumprir: function (c) {
        if (!c || c.estado === 'cumprido') return;
        c.estado = 'cumprido';
        if (c.jogador) c.jogador.intentCooldown = IntentModel.cooldown;
        if (typeof MatchStats !== 'undefined') MatchStats.registarContrato('cumpridos', c.equipa);
    },

    /* --- projecção do encontro ------------------------------------------- */

    /*
    Onde a bola e o dono do contrato se cruzam, a partir de `origemBola`.

    Duas passagens chegam: o ponto muda a distância, a distância muda o tempo
    de voo, o tempo de voo muda o ponto. `tempoDeVoo` (utils.js) devolve o
    tempo que a física do passe já determina — não é uma estimativa nova.

    Devolve null se o encontro cair para lá do fim do contrato: é este filtro
    que impede lançamentos para onde o colega já não vai estar.
    */
    projetarEncontro: function (c, origemBola) {
        if (!c || c.estado !== 'aberto') return null;

        const agora = this.relogio;
        let t = Math.hypot(
            c.jogador.model.position.x - origemBola.x,
            c.jogador.model.position.z - origemBola.z) / IntentModel.velocidadeInicial;

        let ponto = null;
        for (let i = 0; i < 2; i++) {
            ponto = this.posicaoEm(c, agora + t);
            const d = Math.hypot(ponto.x - origemBola.x, ponto.z - origemBola.z);
            t = tempoDeVoo(d);
        }

        if (agora + t > c.tExpira) return null;

        const dist = Math.hypot(ponto.x - origemBola.x, ponto.z - origemBola.z);
        if (dist < IntentModel.distMin || dist > IntentModel.distMax) return null;

        return { ponto: ponto, tempoVoo: t, dist: dist };
    },

    /* --- ciclo ----------------------------------------------------------- */

    /*
    Uma passagem por frame, depois do nível 1 (precisa da posse já apurada).
    Expira, revalida as três quebras, e fecha o que acabou.
    */
    tick: function (dt) {
        if (!IntentModel.ativo) return;
        this.relogio += dt;

        for (const equipa of ['TeamA', 'TeamB']) {
            const lista = this.lista(equipa);
            const bb = (typeof TeamAI !== 'undefined') ? TeamAI.blackboards[equipa] : null;

            for (const c of lista) {
                if (c.estado !== 'aberto' && c.estado !== 'servido') continue;

                // 1. posse perdida — caem todos os contratos da equipa
                if (bb && !bb.isAttacking) { this.cancelar(c, 'posse'); continue; }

                // 2. expirou sem ninguém o servir
                if (this.relogio > c.tExpira) {
                    if (c.estado === 'aberto') { this.cancelar(c, 'expirou'); continue; }
                }

                // 3. fora-de-jogo: a rota deixou de ser legal
                if (bb && typeof avancoLegalDeCorrida === 'function') {
                    const destino = this.posicaoEm(c, Math.min(this.relogio + 1.0, c.tExpira));
                    const limite = (typeof bb.offsideLimitDir === 'number') ? bb.offsideLimitDir : null;
                    if (limite !== null) {
                        // Devolve o avanco JA CORTADO pela linha, nao um booleano.
                        const avancoDestino = destino.z * c.jogador.dirZ;
                        const cortado = avancoLegalDeCorrida(avancoDestino, limite);
                        if (cortado < avancoDestino - 0.1) { this.cancelar(c, 'impedimento'); continue; }
                    }
                }

                /*
                4. rota fechada por um adversário — mas SÓ enquanto o contrato
                está aberto. Depois de servido a bola já vai a caminho, e
                cancelar ali só faz o jogador desistir de a ir buscar: quem
                ganha com isso é o adversário. A partir do Long_Ball_Inform,
                só a perda de posse quebra.
                */
                const idade = this.relogio - c.tPedido;
                if (c.estado === 'aberto' && idade > IntentModel.graca &&
                    bb && this._rotaFechada(c, bb)) {
                    this.cancelar(c, 'rotaFechada');
                    continue;
                }

                // 5. chegou ao ponto combinado
                if (c.estado === 'servido' && c.pontoEncontro) {
                    const d = Math.hypot(
                        c.jogador.model.position.x - c.pontoEncontro.x,
                        c.jogador.model.position.z - c.pontoEncontro.z);
                    if (d < IntentModel.raioChegada) { this.cumprir(c); continue; }
                }
            }

            // Limpeza: o que já fechou sai da lista.
            this.porEquipa[equipa] = lista.filter(
                c => c.estado === 'aberto' || c.estado === 'servido');
        }

        // Arrefecimento por jogador, para ninguém voltar a pedir no frame
        // seguinte a um contrato fechar.
        for (const lista of [Match.players, Match.opponents]) {
            if (!lista) continue;
            for (const p of lista) {
                if (p.intentCooldown > 0) p.intentCooldown = Math.max(0, p.intentCooldown - dt);
            }
        }
    },

    /*
    Um adversário fecha a rota se chegar ao ponto de destino antes do dono do
    contrato. Comparação de tempos, não de distâncias: um defesa mais longe mas
    a correr já naquele sentido chega primeiro.
    */
    _rotaFechada: function (c, bb) {
        /*
        A rota so esta fechada se um adversario chegar ao ponto com VANTAGEM
        CLARA e estiver mesmo no caminho.

        A primeira versao comparava tempos sem mais nada, e como o ponto de
        destino esta a frente — logo do lado da linha defensiva adversaria —
        havia sempre um defesa mais perto dele do que o proprio dono. Medido:
        14 de 19 contratos morriam por "rotaFechada" e nenhum chegava a ser
        servido. Um defesa a cobrir a zona nao e a mesma coisa que uma rota
        fechada; se fosse, nunca se lancava para nada.
        */
        const alvo = this.posicaoEm(c, Math.min(this.relogio + 1.0, c.tExpira));
        const dDono = Math.hypot(
            c.jogador.model.position.x - alvo.x, c.jogador.model.position.z - alvo.z);
        const tDono = dDono / Math.max(1.0, c.velocidade);

        for (const o of (bb.opp || [])) {
            if (!o || o.role === 'gk') continue;
            const d = Math.hypot(o.model.position.x - alvo.x, o.model.position.z - alvo.z);
            // Longe do ponto nao fecha nada, por muito depressa que corra.
            if (d > IntentModel.raioRota) continue;
            const vO = Math.max(1.0, (typeof o.velMedia === 'number') ? o.velMedia : 6.0);
            if (d / vO < tDono - IntentModel.margemRota) return true;
        }
        return false;
    },

    /*
    Recomeço de jogo, ou troca de posse abrupta: nada do que estava combinado
    sobrevive. Chamado do resetPlay.
    */
    limpar: function () {
        for (const equipa of ['TeamA', 'TeamB']) {
            for (const c of this.lista(equipa)) this.cancelar(c, 'reset');
            this.porEquipa[equipa] = [];
        }
    }
};
