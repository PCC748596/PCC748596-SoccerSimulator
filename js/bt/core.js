/*
=============================================================================
BEHAVIOR TREE — MOTOR BASE
=============================================================================
Motor minimalista de Behavior Trees partilhado pelos 3 níveis de decisão:

    Nível 1  TeamBT      (js/bt/team_bt.js)      → o plano colectivo
    Nível 2  PositionBT  (js/bt/position_bt.js)  → onde cada posição se coloca
    Nível 3  PlayerBT    (js/player.js)          → o que este jogador faz

O BT é o CÉREBRO: decide. Quem EXECUTA ao longo do tempo é sempre a
PlayerFSM (js/fsm.js). Um nó de BT nunca deve conter lógica que dure vários
frames — deve mudar de estado na FSM e devolver SUCCESS.

Estados devolvidos por um tick:
    SUCCESS  o nó cumpriu
    FAILURE  o nó não se aplica / não conseguiu
    RUNNING  o nó continua activo no próximo tick (usado pouco aqui, porque
             a duração vive na FSM)
=============================================================================
*/

const BT = {
    SUCCESS: 'SUCCESS',
    FAILURE: 'FAILURE',
    RUNNING: 'RUNNING',

    /*
    Ligado por omissão: grava o caminho percorrido na árvore (nome do nó +
    resultado) em bb.trace / ctx.trace a cada tick — consumido pelo painel
    "PlayerBT Debug" (ver main.js updatePainelPlayerBT). Custo é só uns
    pushes de string num array que é limpo todos os frames; desliga aqui se
    algum dia pesar.
    */
    debug: true
};

class BTNode {
    constructor(name) {
        this.name = name || this.constructor.name;
    }

    tick(bb) {
        return BT.FAILURE;
    }

    // Regista o nó no rasto de debug do blackboard.
    trace(bb, status) {
        if (BT.debug && bb && bb.trace) bb.trace.push(this.name + ':' + status);
        return status;
    }
}

/* --- Compostos ---------------------------------------------------------- */

// Corre os filhos por ordem. Falha no primeiro FAILURE. É o "E" lógico.
class Sequence extends BTNode {
    constructor(name, children) {
        super(name);
        this.children = children || [];
    }

    tick(bb) {
        for (const child of this.children) {
            const status = child.tick(bb);
            if (status !== BT.SUCCESS) return this.trace(bb, status);
        }
        return this.trace(bb, BT.SUCCESS);
    }
}

// Corre os filhos por ordem. Devolve no primeiro que não falhe. É o "OU".
// É este nó que dá prioridade: o filho mais à esquerda ganha sempre.
class Selector extends BTNode {
    constructor(name, children) {
        super(name);
        this.children = children || [];
    }

    tick(bb) {
        for (const child of this.children) {
            const status = child.tick(bb);
            if (status !== BT.FAILURE) return this.trace(bb, status);
        }
        return this.trace(bb, BT.FAILURE);
    }
}

/* --- Decoradores -------------------------------------------------------- */

// Inverte SUCCESS <-> FAILURE.
class Inverter extends BTNode {
    constructor(name, child) {
        super(name);
        this.child = child;
    }

    tick(bb) {
        const status = this.child.tick(bb);
        if (status === BT.RUNNING) return this.trace(bb, status);
        return this.trace(bb, status === BT.SUCCESS ? BT.FAILURE : BT.SUCCESS);
    }
}

// Converte FAILURE em SUCCESS: usa-se para ramos opcionais dentro de uma
// Sequence que não devem abortar a sequência.
class Succeeder extends BTNode {
    constructor(name, child) {
        super(name);
        this.child = child;
    }

    tick(bb) {
        const status = this.child.tick(bb);
        if (status === BT.RUNNING) return this.trace(bb, status);
        return this.trace(bb, BT.SUCCESS);
    }
}

/* --- Folhas ------------------------------------------------------------- */

// Teste booleano. Não altera nada — só decide se o ramo continua.
class Condition extends BTNode {
    constructor(name, fn) {
        super(name);
        this.fn = fn;
    }

    tick(bb) {
        return this.trace(bb, this.fn(bb) ? BT.SUCCESS : BT.FAILURE);
    }
}

// Acção. Se a função não devolver nada, assume-se SUCCESS.
class Action extends BTNode {
    constructor(name, fn) {
        super(name);
        this.fn = fn;
    }

    tick(bb) {
        const status = this.fn(bb);
        return this.trace(bb, status === undefined ? BT.SUCCESS : status);
    }
}

/* --- Açúcar sintáctico para montar árvores legíveis ---------------------- */

function seq(name, ...children) { return new Sequence(name, children); }
function sel(name, ...children) { return new Selector(name, children); }
function cond(name, fn) { return new Condition(name, fn); }
function act(name, fn) { return new Action(name, fn); }
function not(name, child) { return new Inverter(name, child); }
function opt(name, child) { return new Succeeder(name, child); }
