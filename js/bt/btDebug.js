/*
=============================================================================
BT DEBUG — instrumentação do PlayerBT (flickering + tempo até decisão)
=============================================================================
Adaptado ao player.js real. NÃO edita player_bt.js nem fsm.js — observa de
fora, via monkey-patch em FootballPlayer.prototype.update e em Sim.run.
Fica inerte (custo ~zero) se Config.DEBUG_BT_LOGGING não estiver true.

DECISÕES DE DESENHO (por que dá pra fazer isto de fora):
  - player.fsm.currentState já é a "folha" mostrada no label de debug
    (window.showPlayerBT) — comparar frame a frame detecta flickering sem
    tocar na árvore.
  - player.decisionTimer já mede o tempo desde o início da posse contínua
    (com graça pro touch do carry) — é exactamente o "tempo até decisão"
    que eu preciso, sem cronómetro paralelo.
  - Passe/Cruzamento/Lançamento entram todos no estado 'PASS', distinguidos
    por player.isCross / player.isThroughBall. Remate é 'SHOOT'.
    (ADAPTAR estes dois literais se os nomes de estado no teu fsm.js forem
    outros — confirma com window.showPlayerBT ligado em jogo normal.)
  - GK é ignorado por omissão: só corre o PlayerBT quando tem bola
    (ver updateGK -> if (this.hasBall) { runBehaviorTree... }), então o
    conceito de "tempo até decisão" não se aplica da mesma forma.

INCLUIR este ficheiro DEPOIS de player.js e do ficheiro do Sim.
=============================================================================
*/

const BTDebug = {
    // ---- config ----
    PRESSURE_DIST_THRESHOLD: 6.0, // metros; ADAPTAR se quiseres alinhar com MarkingModel/CadenceModel.posseSobPressao

    // ---- estado bruto ----
    flickerLog: [],       // [{t, playerId, team, from, to, x, z}]
    decisionLog: [],      // [{t, playerId, team, elapsed, decision, underPressure, resolved, endReason?}]
    _lastStateByPlayer: new Map(),       // playerId -> último fsm.currentState visto
    _possessionStartByPlayer: new Map(), // playerId -> Match.time de início de posse (informativo)
    _decisionLoggedByPlayer: new Map(),  // playerId -> bool (já logou decisão desta posse)

    enabled: function () {
        return typeof Config !== 'undefined' && Config.DEBUG_BT_LOGGING === true;
    },

    reset: function () {
        this.flickerLog = [];
        this.decisionLog = [];
        this._lastStateByPlayer.clear();
        this._possessionStartByPlayer.clear();
        this._decisionLoggedByPlayer.clear();
    },

    // Chamar entre jogos (ver patch de Sim.run mais abaixo) para não vazar
    // "última folha" / "posse em curso" de um jogo pro cronómetro do seguinte.
    resetAllPlayerState: function () {
        this._lastStateByPlayer.clear();
        this._possessionStartByPlayer.clear();
        this._decisionLoggedByPlayer.clear();
    },

    _nearestOpponentDist: function (player) {
        const opponents = (player.team === 'TeamA') ? Match.opponents : Match.players;
        let min = Infinity;
        for (const opp of opponents) {
            if (opp.role === 'gk') continue;
            const d = player.model.position.distanceTo(opp.model.position);
            if (d < min) min = d;
        }
        return min;
    },

    // Chamado uma vez por jogador por frame, DEPOIS do update() original ter
    // corrido (ver patch no fim do ficheiro).
    // hadBallBefore / stateBefore são o estado ANTES deste update(), capturados
    // pelo patch antes de chamar o original.
    observe: function (player, hadBallBefore, stateBefore) {
        if (player.role === 'gk') return;
        if (!player.fsm) return;

        const stateAfter = player.fsm.currentState;
        const t = Match.time;

        // ---------- 1) flickering ----------
        const lastState = this._lastStateByPlayer.get(player.id);
        if (lastState !== undefined && lastState !== stateAfter) {
            this.flickerLog.push({
                t, playerId: player.id, team: player.team,
                from: lastState, to: stateAfter,
                x: player.model.position.x, z: player.model.position.z,
            });
        }
        this._lastStateByPlayer.set(player.id, stateAfter);

        // ---------- 2) início de posse ----------
        if (!hadBallBefore && player.hasBall) {
            this._possessionStartByPlayer.set(player.id, t);
            this._decisionLoggedByPlayer.set(player.id, false);
        }

        // ---------- 3) decisão real (transição p/ PASS ou SHOOT vindo de posse) ----------
        // ADAPTAR: troca 'PASS'/'SHOOT' se os literais do teu fsm.js forem outros.
        const ehDecisaoReal = (stateAfter === 'PASS' || stateAfter === 'SHOOT');
        if (ehDecisaoReal && stateAfter !== stateBefore && hadBallBefore) {
            if (!this._decisionLoggedByPlayer.get(player.id)) {
                let tipo;
                if (stateAfter === 'SHOOT') tipo = 'Rematar';
                else if (player.isCross) tipo = 'Cruzar';
                else if (player.isThroughBall) tipo = 'Lancar';
                else tipo = 'Passar';

                const pressao = this._nearestOpponentDist(player) < this.PRESSURE_DIST_THRESHOLD;

                this.decisionLog.push({
                    t, playerId: player.id, team: player.team,
                    elapsed: player.decisionTimer,
                    decision: tipo,
                    underPressure: pressao,
                    resolved: true,
                });
                this._decisionLoggedByPlayer.set(player.id, true);
            }
        }

        // ---------- 4) posse perdida sem decisão (desarmado, bola cortada, etc.) ----------
        if (hadBallBefore && !player.hasBall && !ehDecisaoReal) {
            if (!this._decisionLoggedByPlayer.get(player.id)) {
                this.decisionLog.push({
                    t, playerId: player.id, team: player.team,
                    elapsed: player.decisionTimer,
                    decision: null,
                    underPressure: null,
                    resolved: false,
                    endReason: stateAfter,
                });
            }
        }

        // limpa o estado de posse quando ela termina, decidida ou não
        if (hadBallBefore && !player.hasBall) {
            this._possessionStartByPlayer.delete(player.id);
            this._decisionLoggedByPlayer.delete(player.id);
        }
    },

    // ---- agregação ----
    summarize: function () {
        return {
            flickering: this._summarizeFlicker(),
            tempoDecisao: this._summarizeDecisions(),
        };
    },

    _summarizeFlicker: function () {
        const porJogador = new Map();
        const porPar = new Map();

        for (const entry of this.flickerLog) {
            porJogador.set(entry.playerId, (porJogador.get(entry.playerId) || 0) + 1);
            const par = `${entry.from} -> ${entry.to}`;
            porPar.set(par, (porPar.get(par) || 0) + 1);
        }

        const paresOrdenados = Array.from(porPar.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([par, count]) => ({ par, count }));

        return {
            totalTrocas: this.flickerLog.length,
            trocasPorJogador: Array.from(porJogador.entries()).map(([id, count]) => ({ playerId: id, count })),
            paresMaisFrequentes: paresOrdenados.slice(0, 15),
        };
    },

    _summarizeDecisions: function () {
        const resolvidas = this.decisionLog.filter(d => d.resolved);
        const naoResolvidas = this.decisionLog.filter(d => !d.resolved);

        const comPressao = resolvidas.filter(d => d.underPressure).map(d => d.elapsed);
        const semPressao = resolvidas.filter(d => !d.underPressure).map(d => d.elapsed);

        return {
            amostrasResolvidas: resolvidas.length,
            amostrasNaoResolvidas: naoResolvidas.length,
            comPressao: this._stats(comPressao),
            semPressao: this._stats(semPressao),
            porTipoDecisao: this._porTipo(resolvidas),
        };
    },

    _stats: function (arr) {
        if (arr.length === 0) return { n: 0, media: null, mediana: null, p90: null, max: null };
        const sorted = [...arr].sort((a, b) => a - b);
        const media = sorted.reduce((s, v) => s + v, 0) / sorted.length;
        const mediana = sorted[Math.floor(sorted.length / 2)];
        const p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))];
        const max = sorted[sorted.length - 1];
        return { n: sorted.length, media: +media.toFixed(3), mediana: +mediana.toFixed(3), p90: +p90.toFixed(3), max: +max.toFixed(3) };
    },

    _porTipo: function (resolvidas) {
        const grupos = new Map();
        for (const d of resolvidas) {
            if (!grupos.has(d.decision)) grupos.set(d.decision, []);
            grupos.get(d.decision).push(d.elapsed);
        }
        const out = {};
        for (const [tipo, vals] of grupos.entries()) out[tipo] = this._stats(vals);
        return out;
    },

    exportData: function () {
        return {
            resumo: this.summarize(),
            bruto: { flickerLog: this.flickerLog, decisionLog: this.decisionLog },
        };
    },
};


/*
=============================================================================
PATCH 1 — observa cada jogador depois do seu update() original
=============================================================================
*/
(function patchPlayerUpdate() {
    if (typeof FootballPlayer === 'undefined') {
        console.error('BTDebug: FootballPlayer não encontrado — confirma a ordem de <script> (bt_debug.js depois de player.js).');
        return;
    }

    const updateOriginal = FootballPlayer.prototype.update;
    FootballPlayer.prototype.update = function (dt) {
        const loggingLigado = BTDebug.enabled();
        const hadBallBefore = this.hasBall;
        const stateBefore = (this.fsm) ? this.fsm.currentState : null;

        updateOriginal.call(this, dt);

        if (loggingLigado) {
            BTDebug.observe(this, hadBallBefore, stateBefore);
        }
    };
})();


/*
=============================================================================
PATCH 2 — anexa os dados ao relatório final do Sim, e limpa estado por
jogador entre jogos (via wrapper de Match.resetPlay)
=============================================================================
*/
(function integrarComSim() {
    if (typeof Sim === 'undefined') {
        console.warn('BTDebug: objeto Sim não encontrado — integração automática saltada.');
        return;
    }

    const runOriginal = Sim.run.bind(Sim);

    Sim.run = async function (opts) {
        const loggingLigado = BTDebug.enabled();
        if (loggingLigado) BTDebug.reset();

        const resetPlayOriginal = (typeof Match !== 'undefined' && Match.resetPlay) ? Match.resetPlay.bind(Match) : null;
        if (resetPlayOriginal) {
            Match.resetPlay = function (...args) {
                const r = resetPlayOriginal(...args);
                if (loggingLigado) BTDebug.resetAllPlayerState();
                return r;
            };
        }

        const relatorio = await runOriginal(opts);

        if (resetPlayOriginal) Match.resetPlay = resetPlayOriginal;

        if (relatorio && loggingLigado) {
            relatorio.btDebug = BTDebug.exportData();
        }
        return relatorio;
    };
})();


/*
=============================================================================
CENÁRIO CONTROLADO — jogador parado na fronteira de uma condição
=============================================================================
Dá a posse directamente replicando o que grabBall() faz internamente
(hasBall, Match.ballCarrier, Match.possessionTeam) — não inventa nenhuma
API nova. Posiciona o jogador perto do limite de shootingRange() (método já
existente na instância) como fronteira de teste por omissão; ajusta a
função de posicionamento se quiseres testar outra fronteira (ex: |x| perto
de CrossModel.alaX, se esse global existir no teu config.js).
=============================================================================
*/
const BTDebugScenarios = {
    testarFronteira: async function (opts) {
        opts = opts || {};
        const duracaoSeg = opts.duracaoSeg || 10;
        const dt = opts.dt || 1 / 60;

        if (typeof Config !== 'undefined') Config.DEBUG_BT_LOGGING = true;
        BTDebug.reset();

        Match.resetPlay();
        BTDebug.resetAllPlayerState();

        const jogador = opts.jogador || Match.players.find(p => p.role !== 'gk');
        if (!jogador) {
            console.error('BTDebugScenarios: não encontrei um jogador de campo.');
            return null;
        }

        // Posiciona na fronteira de emZonaDeRemate: distância à baliza ==
        // shootingRange() do próprio jogador, x centrado (mais fácil de
        // prever o ângulo). ADAPTAR para outra fronteira se preferires.
        if (typeof opts.posicionar === 'function') {
            opts.posicionar(jogador);
        } else {
            const alcance = jogador.shootingRange();
            jogador.model.position.x = 0;
            jogador.model.position.z = jogador.targetGoalZ - jogador.dirZ * alcance;
        }

        // Dá-lhe a posse (mesmo padrão usado internamente em grabBall()).
        jogador.hasBall = true;
        Match.ballCarrier = jogador;
        Match.possessionTeam = jogador.team;
        if (typeof Match.possessionTimer !== 'undefined') Match.possessionTimer = 0;
        BTDebug.observe(jogador, false, jogador.fsm ? jogador.fsm.currentState : null); // regista início de posse

        const totalPassos = Math.round(duracaoSeg / dt);
        for (let i = 0; i < totalPassos; i++) {
            Match.update(dt);
        }

        const flickerDoJogador = BTDebug.flickerLog.filter(e => e.playerId === jogador.id);
        const rapidas = [];
        for (let i = 1; i < flickerDoJogador.length; i++) {
            const dtEntreTrocas = flickerDoJogador[i].t - flickerDoJogador[i - 1].t;
            if (dtEntreTrocas < 0.3) rapidas.push({ ...flickerDoJogador[i], dtEntreTrocas });
        }

        return {
            jogadorId: jogador.id,
            posicaoInicial: { x: jogador.model.position.x, z: jogador.model.position.z },
            flickerLog: flickerDoJogador,
            trocasRapidas: rapidas,
            temFlickering: rapidas.length > 0,
        };
    },
};