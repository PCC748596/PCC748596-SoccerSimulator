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
        remates: { tentados: 0, golos: 0 },
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
    },

    /*
    Chamado uma vez por frame em Match.updatePossession() enquanto alguém
    tem a bola — `zoneAhead` já vem calculado no referencial de ataque
    (posição.z * dirZ, tal como PlayerContext.zoneAhead). Limiares a 1/6 e
    3/6 do comprimento do campo dividem-no em três terços iguais.
    */
    registarZona: function (team, zoneAhead, dt) {
        const s = this[team];
        if (!s) return;
        const terco = (CAMPO_COMP / 6);
        if (zoneAhead < -terco) s.tercoSegundos.def += dt;
        else if (zoneAhead > terco) s.tercoSegundos.atk += dt;
        else s.tercoSegundos.mid += dt;
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
            this.fecharAmostraPasse('certo', vChegada);
        } else {
            const outra = this[jogador.team];
            if (outra) outra.cortes++;
            this.fecharAmostraPasse('corte', vChegada);
        }
    },

    // Resumo simples para consola/JSON — usado pela simulação em lote.
    resumo: function () {
        const pct = (a, b) => b > 0 ? Math.round((a / b) * 1000) / 10 : 0;
        const porEquipa = (s) => ({
            passes: s.passes.tentados + '/' + s.passes.certos + ' (' + pct(s.passes.certos, s.passes.tentados) + '%)',
            lancamentos: s.lancamentos.tentados + '/' + s.lancamentos.certos,
            cruzamentos: s.cruzamentos.tentados + '/' + s.cruzamentos.certos,
            remates: s.remates.tentados + ' (' + s.remates.golos + ' golos)',
            desarmes: s.desarmes.tentados + '/' + s.desarmes.sucesso,
            carrinhos: s.carrinhos.tentados + '/' + s.carrinhos.sucesso,
            dribles: s.dribles.tentados + '/' + s.dribles.sucesso,
            cortes: s.cortes,
            disputasFalhadas: s.disputasFalhadas,
            perdasDePosse: s.perdasDePosse,
            cantos: s.cantos,
            pontapesBaliza: s.pontapesBaliza,
            faltas: s.faltas.cometidas + ' (sofridas ' + s.faltas.sofridas + ')',
            cartoes: s.cartoes.amarelos + 'A/' + s.cartoes.vermelhos + 'V',
            penaltis: s.penaltis,
            posseSegundos: Math.round(s.posseSegundos * 10) / 10,
            tercoSegundos: {
                def: Math.round(s.tercoSegundos.def * 10) / 10,
                mid: Math.round(s.tercoSegundos.mid * 10) / 10,
                atk: Math.round(s.tercoSegundos.atk * 10) / 10
            },
            distanciaPercorrida: Math.round(s.distanciaPercorrida) + 'm',
            trocasChaser: s.trocasChaser,
            trocasMarcacao: s.trocasMarcacao,
            trocasSupportMid: s.trocasSupportMid
        });
        return { TeamA: porEquipa(this.TeamA), TeamB: porEquipa(this.TeamB) };
    }
};
