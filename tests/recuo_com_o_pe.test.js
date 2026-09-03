/*
RECUO PARA O GUARDA-REDES (Lei 12) — e o que ele faz quando não pode pegar.

A metade que já existia: um passe DELIBERADO com o PÉ de um companheiro marca
`Match.recuoParaGR`, e `maosProibidasNoRecuo` impede as mãos. A cabeçada e a
matada no peito não passam pelo `executePassGameplay`, portanto não marcam nada
— é exactamente a distinção que a regra faz.

O que este teste fixa é a metade que faltava: com as mãos proibidas e um
adversário a menos de `GkRecuoModel.distPressao`, o guarda-redes CHUTA para a
frente em vez de ficar em cima da bola.

Corre com: node tests/recuo_com_o_pe.test.js
*/
const fs = require('fs');
const path = require('path');
const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const raiz = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(raiz, f), 'utf8').split(CR + LF).join(LF);

let falhas = 0;
const ok = m => console.log('  . ' + m);
const erro = m => { console.log('  X ' + m); falhas++; };

/* =====================================================================
   1 — A REGRA DAS MÃOS: só o passe com o PÉ as proíbe
   ===================================================================== */
console.log('1 — quem marca o recuo é o passe com o pé');
{
    const src = ler('js/utils.js');
    const m = src.match(/function maosProibidasNoRecuo[\s\S]*?\n\}/);
    if (!m) {
        erro('não encontrei maosProibidasNoRecuo em utils.js');
    } else {
        const fn = (new Function(m[0] + '\nreturn maosProibidasNoRecuo;'))();
        if (fn('TeamA', 'TeamA') !== true) erro('recuo da própria equipa devia proibir as mãos');
        else ok('recuo do próprio companheiro: mãos proibidas');
        if (fn('TeamB', 'TeamA') !== false) erro('recuo da OUTRA equipa não proíbe nada');
        else ok('bola vinda do adversário: mãos livres');
        if (fn(null, 'TeamA') !== false) erro('sem recuo não há proibição');
        else ok('sem recuo: mãos livres');
    }

    /*
    E a marca só é escrita no caminho do PASSE — o `executePassGameplay`. Se
    aparecesse no caminho da cabeçada ou da matada no peito, a regra estaria
    errada.
    */
    const fsmSrc = ler('js/fsm.js');
    const bloco = fsmSrc.match(/Match\.recuoParaGR = p\.team;/g) || [];
    if (bloco.length !== 1) {
        erro('`Match.recuoParaGR` devia ser escrito num sítio só (o passe com o pé), está em ' + bloco.length);
    } else ok('a marca é escrita só no passe com o pé');

    const headerSrc = ler('js/player.js');
    if (/executeHeader[\s\S]{0,3000}recuoParaGR = /.test(headerSrc)) {
        erro('a cabeçada não pode marcar recuo — a regra permite pegar nela');
    } else ok('a cabeçada não marca recuo (pode ser agarrada)');
}

/* =====================================================================
   2 — COM AS MÃOS PROIBIDAS E UM ADVERSÁRIO EM CIMA: CHUTA
   ===================================================================== */
console.log('');
console.log('2 — recuo com o pé e adversário perto: chuta como no tiro de meta');
{
    const src = ler('js/player.js');

    const mAperta = src.match(/adversarioAperta\(\) \{[\s\S]*?\n    \}/);
    const mChuta = src.match(/chutarRecuoDeUrgencia\(\) \{[\s\S]*?\n    \}/);
    if (!mAperta || !mChuta) {
        erro('faltam adversarioAperta / chutarRecuoDeUrgencia em player.js');
    } else {
        // Ambiente mínimo para correr os dois métodos isolados.
        const GkRecuoModel = { distPressao: 5.0, distToque: 1.4 };
        const chamadas = [];
        let contacto = null;
        const ActionState = function (nome, opts) { chamadas.push(nome); contacto = opts.onContact; };

        const jogador = (team, x, z, role) => ({
            team, role: role || 'cf', model: { position: { x, z } }
        });
        const Match = {
            ball: { position: { x: 0, z: 50, distanceTo() { return 0; } } },
            players: [], opponents: [],
            recuoParaGR: 'TeamA'
        };

        /*
        Os dois métodos são de classe (`nome() { ... }`), portanto embrulham-se
        num objecto literal para poderem ser avaliados fora dela.
        */
        const proto = (new Function('GkRecuoModel', 'Match', 'ActionState',
            'return {' + mAperta[0] + ',' + mChuta[0] + '};'
        ))(GkRecuoModel, Match, ActionState);

        const gk = {
            team: 'TeamA', role: 'gk',
            model: { position: { x: 0, z: 52, distanceTo: () => 0.8 } },
            gkKickAction: null, gkEstado: 'normal',
            kickFromGround() { chamadas.push('kickFromGround'); }
        };
        Object.assign(gk, proto);

        // Sem ninguém por perto: não há aperto.
        Match.opponents = [jogador('TeamB', 0, 20)];
        if (gk.adversarioAperta()) erro('adversário a 30 m não aperta ninguém');
        else ok('adversário longe: sem aperto');

        // Adversário a 3 m da bola: aperta.
        Match.opponents = [jogador('TeamB', 0, 47)];
        if (!gk.adversarioAperta()) erro('adversário a 3 m devia apertar');
        else ok('adversário a 3 m: aperta');

        // O guarda-redes adversário não conta — ele está na outra baliza.
        Match.opponents = [jogador('TeamB', 0, 47, 'gk')];
        if (gk.adversarioAperta()) erro('o guarda-redes adversário não é pressão');
        else ok('o guarda-redes adversário não conta');

        // E o chute: mesmo gesto do tiro de meta, e o recuo acaba no contacto.
        Match.opponents = [jogador('TeamB', 0, 47)];
        gk.chutarRecuoDeUrgencia();
        if (chamadas[0] !== 'gkPuntChao') {
            erro('devia usar o clip do tiro de meta (gkPuntChao), usou ' + chamadas[0]);
        } else ok('usa o gesto do tiro de meta');
        if (gk.gkEstado !== 'chutando') erro('devia ficar no estado chutando');
        else ok('estado chutando');

        contacto();
        if (chamadas.indexOf('kickFromGround') < 0) {
            erro('no contacto devia resolver com a balística do tiro de meta');
        } else ok('no contacto, a mesma balística do tiro de meta');
        if (Match.recuoParaGR !== null) erro('a bola saiu do pé dele: o recuo acabou');
        else ok('o recuo termina quando a bola sai');

        // Não dispara duas vezes.
        const antes = chamadas.length;
        gk.chutarRecuoDeUrgencia();
        if (chamadas.length !== antes) erro('não pode iniciar um segundo chute a meio do primeiro');
        else ok('não repete o gesto enquanto o primeiro corre');
    }
}

console.log('');
console.log(falhas ? 'FALHOU: ' + falhas : 'OK: recuo com o pé, mãos proibidas e chutão sob pressão.');
process.exit(falhas ? 1 : 0);
