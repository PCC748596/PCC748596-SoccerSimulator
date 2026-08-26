/*
CONDUZIR NÃO É CORRER SEM BOLA.

O QUE SE VIA: "os Carry estão disparando demais com a bola".

A CAUSA. O `actCarry` era isto, e só isto:

    function actCarry(ctx) {
        ctx.p.fsm.changeState('CARRY');
    }

Não escreve `speedMult` nenhum — o portador FICA COM O QUE TINHA. E o que ele
tinha era a velocidade da folha que correu antes, que num jogador que acabou de
ganhar a bola é sempre uma das rápidas:

    actTackle          8.0 * 1.125 = 9.00 m/s   ("velocidade máxima SEM bola")
    actRunIntoSpace    7.0 * 1.125 = 7.88 m/s   (sprint a atacar o espaço)
    actChaseBall       5.8 * 1.125 = 6.53 m/s   e +25% em contra-ataque

Ou seja: quem desarmava e ficava com a bola saía a conduzir a 9 m/s — mais
depressa do que o sprint sem bola de quem quer que fosse. O estado CARRY até
multiplica por 0.95, o que não chega perto de compensar.

A CONDUÇÃO TEM DE TER VELOCIDADE PRÓPRIA, e abaixo da corrida sem bola: leva-se
a bola no pé, dá-se o toque à frente e corre-se atrás dela.

Corre com: node tests/velocidade_de_conducao.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const srcConfig = ler('js/config.js');
const srcPlayer = ler('js/bt/player_bt.js');

function extrairObjecto(src, nome) {
    const i = src.indexOf(`const ${nome} = {`);
    if (i < 0) throw new Error(`${nome} não encontrado`);
    const f = src.indexOf(LF + '};', i);
    // O CarryModel refere o GaitModel (velMaxLivre); só esse valor é preciso.
    return new Function(`const GaitModel = { correr: { vel: 8.0 } };
        ${src.slice(i, f + 3)}; return ${nome};`)();
}

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

const C = extrairObjecto(srcConfig, 'CarryModel');

const i = srcPlayer.indexOf('function actCarry(');
const actCarry = new Function('CarryModel', 'Match',
    srcPlayer.slice(i, srcPlayer.indexOf(LF + '}', i) + 2) + '; return actCarry;'
)(C, { counterAttackTeam: null });

const ctxDe = (skillSpeed, extra) => ({
    skillSpeed,
    p: Object.assign({
        team: 'TeamA',
        speedMult: 9.0,          // o lixo que vinha da folha anterior
        fsm: { changeState(s) { this.currentState = s; } }
    }, extra || {})
});

/* =====================================================================
   1 — A CONDUÇÃO ESCREVE A SUA VELOCIDADE
   ===================================================================== */
console.log(LF + '1 — o portador deixa de herdar a velocidade de quem correu antes');
{
    const ctx = ctxDe(50);
    actCarry(ctx);

    if (ctx.p.speedMult === 9.0) {
        erro('ficou com os 9 m/s do actTackle — sai a conduzir mais depressa ' +
            'do que qualquer sprint sem bola');
    } else ok(`escreve velocidade própria: ${ctx.p.speedMult.toFixed(2)} m/s`);

    if (ctx.p.fsm.currentState !== 'CARRY') erro('deixou de mudar para CARRY');
    else ok('continua a mudar para CARRY');
}

/* =====================================================================
   2 — ABAIXO DA CORRIDA SEM BOLA
   ===================================================================== */
console.log(LF + '2 — com bola anda-se mais devagar do que sem ela');
{
    // As três velocidades sem bola que existem hoje na árvore.
    const semBolaTackle = 8.0 * 1.25 * 0.9;
    const semBolaSprint = 7.0 * 1.25 * 0.9;
    const semBolaChase = 5.8 * 1.25 * 0.9;

    const ctx = ctxDe(50);
    actCarry(ctx);
    const comBola = ctx.p.speedMult;

    if (comBola >= semBolaTackle) erro(`conduz a ${comBola.toFixed(2)}, o desarme corre a ${semBolaTackle.toFixed(2)}`);
    else ok(`abaixo do desarme (${semBolaTackle.toFixed(2)} m/s)`);

    if (comBola >= semBolaSprint) erro(`conduz a ${comBola.toFixed(2)}, o sprint sem bola vai a ${semBolaSprint.toFixed(2)}`);
    else ok(`abaixo do sprint sem bola (${semBolaSprint.toFixed(2)} m/s)`);

    if (comBola >= semBolaChase) {
        erro(`conduz a ${comBola.toFixed(2)}, mais do que quem corre para a bola (${semBolaChase.toFixed(2)})`);
    } else ok(`abaixo de quem persegue a bola (${semBolaChase.toFixed(2)} m/s)`);

    // Mas não pode ser um passeio: ainda é uma corrida com bola.
    if (comBola < 4.0) erro(`${comBola.toFixed(2)} m/s é passo de caminhada`);
    else ok('continua a ser uma corrida');
}

/* =====================================================================
   3 — A VELOCIDADE DO JOGADOR CONTA
   ===================================================================== */
console.log(LF + '3 — quem é mais rápido conduz mais depressa');
{
    const lento = ctxDe(20); actCarry(lento);
    const rapido = ctxDe(90); actCarry(rapido);

    if (!(rapido.p.speedMult > lento.p.speedMult)) {
        erro(`SPEED 90 devia conduzir mais depressa do que SPEED 20: ` +
            `${rapido.p.speedMult.toFixed(2)} vs ${lento.p.speedMult.toFixed(2)}`);
    } else ok(`SPEED 20: ${lento.p.speedMult.toFixed(2)} m/s, ` +
        `SPEED 90: ${rapido.p.speedMult.toFixed(2)} m/s`);

    // Sem skill nenhum no ctx não pode dar NaN — há chamadas assim na árvore.
    const semSkill = { p: { fsm: { changeState() { } } } };
    actCarry(semSkill);
    if (!isFinite(semSkill.p.speedMult)) erro('sem skill no ctx deu NaN');
    else ok('sem skill no ctx: valor finito');
}

/* =====================================================================
   4 — RECUAR COM A BOLA É MAIS LENTO AINDA
   ===================================================================== */
console.log(LF + '4 — o recuo não é uma arrancada');
{
    const frente = ctxDe(50); actCarry(frente);
    const recuo = ctxDe(50, { carryRecuo: true }); actCarry(recuo);

    if (!(recuo.p.speedMult < frente.p.speedMult)) {
        erro(`recuar devia ser mais lento: ${recuo.p.speedMult.toFixed(2)} vs ` +
            `${frente.p.speedMult.toFixed(2)}`);
    } else ok(`recuo a ${recuo.p.speedMult.toFixed(2)} m/s`);
}

/* =====================================================================
   5 — O CONTRA-ATAQUE CONTINUA A VALER
   ===================================================================== */
console.log(LF + '5 — em contra-ataque acelera-se, como nas outras folhas');
{
    const actCarryCA = new Function('CarryModel', 'Match',
        srcPlayer.slice(i, srcPlayer.indexOf(LF + '}', i) + 2) + '; return actCarry;'
    )(C, { counterAttackTeam: 'TeamA' });

    const normal = ctxDe(50); actCarry(normal);
    const ca = ctxDe(50); actCarryCA(ca);

    if (!(ca.p.speedMult > normal.p.speedMult)) {
        erro('o contra-ataque deixou de acelerar o portador');
    } else ok(`contra-ataque: ${ca.p.speedMult.toFixed(2)} m/s`);
}

console.log(LF + (falhas ? `FALHOU: ${falhas}` : 'OK'));
process.exit(falhas ? 1 : 0);
