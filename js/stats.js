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

    reset: function () {
        this.TeamA = novoContadorEquipa();
        this.TeamB = novoContadorEquipa();
        this._pendingPassType = null;
        this._pendingPassTeam = null;
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
    registarPasseIniciado: function (team, tipo) {
        const s = this[team];
        if (!s) return;
        if (tipo === 'lancamento') s.lancamentos.tentados++;
        else if (tipo === 'cruzamento') s.cruzamentos.tentados++;
        else s.passes.tentados++;

        this._pendingPassType = tipo;
        this._pendingPassTeam = team;
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

        if (!dominou) {
            s.disputasFalhadas++;
            return;
        }

        if (jogador.team === equipaPasse) {
            const bucket = (tipo === 'lancamento') ? s.lancamentos
                : (tipo === 'cruzamento') ? s.cruzamentos
                    : s.passes;
            bucket.certos++;
        } else {
            const outra = this[jogador.team];
            if (outra) outra.cortes++;
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
