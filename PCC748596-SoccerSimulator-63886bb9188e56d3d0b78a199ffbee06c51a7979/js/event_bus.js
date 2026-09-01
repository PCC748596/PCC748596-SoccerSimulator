/*
=============================================================================
EventBus — pub/sub simples para o jogo
=============================================================================
Objectivo: sistemas reagem a EVENTOS ("GK_CATCH_BALL") em vez de todo o
lado ficar a fazer polling directo de estado interno de outro sistema
(gk.gkEstado === 'apanhar' || 'segurando', espalhado por vários ficheiros).
Migração faseada, por partes — ver plano combinado: GK primeiro, depois CBs,
depois RB/LB, depois GOAL_KICK, etc. Cada parte troca só o polling desse
sistema por um evento, testa, e passa para a próxima.
=============================================================================
*/
const EventBus = {
    _listeners: {},

    on: function (evento, fn) {
        if (!this._listeners[evento]) this._listeners[evento] = [];
        this._listeners[evento].push(fn);
    },

    off: function (evento, fn) {
        const lista = this._listeners[evento];
        if (!lista) return;
        const i = lista.indexOf(fn);
        if (i >= 0) lista.splice(i, 1);
    },

    emit: function (evento, dados) {
        const lista = this._listeners[evento];
        if (!lista) return;
        // Cópia: um listener a fazer off() de si próprio ou de outro durante
        // o emit não pode desalinhar o índice dos que faltam correr.
        for (const fn of lista.slice()) fn(dados);
    }
};
