/*
O `actionState` PENDURADO — o encrave que parava o jogador para sempre.

O QUE SE MEDIU. Lote de 20 jogos, sete encraves, todos com a mesma assinatura:

    portador "TeamA LB"   fsm: "SET_PIECE_WAIT"   hasBall: true
    decisionTimer: ~25    Match.state: "PLAY"

Um jogador com a bola nos pes, em estado de bola parada, com o jogo a correr.

A CAUSA. O `actionState` so era limpo DENTRO dos `case 'PASS'` e `case 'SHOOT'`
da FSM — os unicos que o consomem. Se alguem mudar o estado de fora, e o
`tratarBolaParada` faz isso (`changeState('SET_PIECE_WAIT')` assim que o jogo
para), esses cases nunca mais correm e o `actionState` fica pendurado.

O custo e total, porque a primeira linha do `PlayerAI.tick` e:

    if (player.actionState || s === "PASS" || ...) return;

O jogador NUNCA MAIS DECIDE NADA. Nem conduzir, nem passar, nem largar a bola.

A REGRA: o `actionState` morre com o estado que o usa, e a limpeza vive no
`changeState` — o unico sitio por onde TODAS as saidas passam, incluindo as que
vierem a ser escritas.

Corre com: node tests/actionstate_pendurado.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const srcFsm = ler('js/fsm.js');
const srcBt = ler('js/bt/player_bt.js');

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

// O changeState real, com um jogador falso.
const iCS = srcFsm.indexOf('    changeState(newState) {');
if (iCS < 0) throw new Error('changeState nao encontrado');
const corpo = srcFsm.slice(srcFsm.indexOf('{', iCS) + 1, srcFsm.indexOf(LF + '    }', iCS));

const novoFSM = (estado, comAction) => {
    const p = {
        actionState: comAction ? { falso: true } : null,
        resetBonesToDefault() {},
        showActionBanner() {},
        tackleResolvido: null
    };
    const fsm = {
        p: p,
        currentState: estado,
        timer: 5,
        enterSlideTackle() {},
        cornerBolaSubiu: null
    };
    fsm.changeState = new Function('newState', 'TeamAI', 'Match',
        corpo)  // sem this-binding ainda
        .bind(fsm);
    // Reconstruir com o ambiente que o corpo usa.
    fsm.changeState = new Function('TeamAI', 'Match',
        'return function (newState) {' + corpo + '};')(
        { get: () => null },
        { ball: { position: { x: 0, y: 0, z: 0 } } }
    ).bind(fsm);
    return fsm;
};

console.log(LF + '1 — sair de um gesto limpa o actionState');
{
    /*
    O CASO MEDIDO: um jogador a meio de um passe e o jogo para. O
    `tratarBolaParada` manda-o para SET_PIECE_WAIT e o `case PASS` nunca mais
    corre para limpar.
    */
    const fsm = novoFSM('PASS', true);
    fsm.changeState('SET_PIECE_WAIT');
    if (fsm.p.actionState !== null) {
        erro('PASS -> SET_PIECE_WAIT deixou o actionState pendurado — o jogador nunca mais decide');
    } else ok('PASS -> SET_PIECE_WAIT: limpo');

    for (const destino of ['IDLE', 'CARRY', 'MOVE_TO_POS', 'MARKING', 'INTERCEPT']) {
        const f = novoFSM('SHOOT', true);
        f.changeState(destino);
        if (f.p.actionState !== null) erro(`SHOOT -> ${destino} deixou o actionState pendurado`);
    }
    ok('SHOOT -> qualquer estado normal: limpo');
}

console.log(LF + '2 — mas NAO limpa ao entrar no gesto');
{
    /*
    O `initiatePass`/`initiateShoot` criam o ActionState ANTES de chamar o
    changeState. Limpar na entrada apagava-o no mesmo instante, e o gesto ficava
    sem dados — trocava um encrave por um remate que nunca sai.
    */
    for (const destino of ['PASS', 'SHOOT', 'CROSS']) {
        const f = novoFSM('IDLE', true);
        f.changeState(destino);
        if (f.p.actionState === null) {
            erro(`entrar em ${destino} apagou o actionState acabado de criar`);
        }
    }
    ok('PASS, SHOOT e CROSS mantem o actionState');
}

console.log(LF + '3 — a mudanca para o MESMO estado nao mexe em nada');
{
    const f = novoFSM('PASS', true);
    f.changeState('PASS');
    if (f.p.actionState === null) erro('mudar para o mesmo estado apagou o actionState');
    else ok('mesmo estado: no-op, como sempre foi');
}

console.log(LF + '4 — o tick continua a travar em quem TEM um gesto a decorrer');
{
    /*
    A guarda do tick nao muda: quem esta MESMO a meio de um passe nao pode
    voltar a decidir. O que muda e que o actionState deixa de sobreviver ao
    estado que o justificava.
    */
    const i = srcBt.indexOf('    tick: function (player, dt) {');
    // A guarda ganhou um `fechar()` antes do return (o resolvedor de alvos,
    // js/bt/alvo.js) e o bloco de cima cresceu — daí a janela maior.
    const bloco = srcBt.slice(i, i + 1600);
    if (!/if \(player\.actionState \|\|/.test(bloco)) {
        erro('a guarda do tick desapareceu — um gesto pode agora ser interrompido a meio');
    } else ok('a guarda do tick continua la');
}

console.log(LF + '5 — a limpeza vive no changeState, e nao espalhada');
{
    const iCS2 = srcFsm.indexOf('    changeState(newState) {');
    const corpoCS = srcFsm.slice(iCS2, srcFsm.indexOf(LF + '    }', iCS2));
    if (!/this\.p\.actionState = null/.test(corpoCS)) {
        erro('a limpeza nao esta no changeState');
    } else ok('no changeState: apanha TODAS as saidas, incluindo as futuras');
}

console.log(LF + (falhas === 0
    ? 'actionstate_pendurado: tudo bem.'
    : `actionstate_pendurado: ${falhas} falha(s).`));
process.exit(falhas === 0 ? 0 : 1);
