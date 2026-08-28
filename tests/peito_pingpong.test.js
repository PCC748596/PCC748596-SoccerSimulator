/*
O PING-PONG DA MATADA NO PEITO.

O ENCRAVE, medido. Num lote de 5 jogos o vigia apanhou este retrato:

    bola: { x: 20.1, y: 1.35, z: 26.3 }   bolaVel: 0
    aerialHeaderCount: 0
    TeamA CF  peitoTimer 0.10  peitoCola 0.06  touchLock 0.45  dist 1.2
    TeamB CB  peitoTimer 0.37  peitoCola 0.00  touchLock 0.18  dist 1.3

A bola PARADA NO AR a 1.35 m — que é o próprio `peitoYMax` — com velocidade
zero, entre dois jogadores a 1.2 m dela, ambos a meio do gesto.

O mecanismo: `colarBolaAoPeito` prende a bola e zera-lhe a velocidade enquanto
o `peitoCola` durar; ao largar, ela sai a `peitoVelYBoa`, que à TEC dos
jogadores reais é ~-0.19 m/s. Cai tão devagar que não sai da faixa
`peitoYMin`..`peitoYMax` antes de o outro a matar no peito outra vez. E
enquanto o gesto dura, o BT trata os dois como ocupados — ninguém a vai
buscar.

O anti ping-pong aéreo já existia para a CABEÇA e não contava peitos: o
`aerialHeaderCount: 0` do retrato é a prova de que a sequência passava toda ao
lado dele.

Corre com: node tests/peito_pingpong.test.js
*/
const fs = require('fs');
const path = require('path');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const srcConfig = ler('js/config/player_behavior.js') + '\n' + ler('js/config/physics.js') + '\n' + ler('js/config/shooting.js');
const srcMatch = ['js/match/match_state.js', 'js/match/match_setup.js', 'js/match/match_physics.js', 'js/match/match_setpieces.js', 'js/match/match_loop.js', 'js/match/match_ui.js'].map(ler).join('\n');

function extrairObjecto(src, nome) {
    const i = src.indexOf(`const ${nome} = {`);
    const f = src.indexOf(LF + '};', i);
    return new Function(`const CAMPO_COMP = 106;
        ${src.slice(i, f + 3)}; return ${nome};`)();
}
const BallControl = extrairObjecto(srcConfig, 'BallControl');
const BallPhysics = extrairObjecto(srcConfig, 'BallPhysics');
const HeaderModel = extrairObjecto(srcConfig, 'HeaderModel');

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = m => console.log('  . ' + m);

/* ===================================================================== */
console.log(LF + '1 — a constante existe e é simétrica à da cabeça');
{
    const n = BallControl.maxPeitosSeguidos;
    if (typeof n !== 'number') {
        erro('falta BallControl.maxPeitosSeguidos');
    } else if (n < 1) {
        erro(`maxPeitosSeguidos a ${n} desligava a matada no peito`);
    } else ok(`maxPeitosSeguidos = ${n} (cabeça: ${HeaderModel.maxHeadersSeguidos})`);
}

/*
2 — A CONTA QUE EXPLICA O CICLO.

Não é um teste do código, é a verificação do raciocínio: com a velocidade de
saída real, a bola fica dentro da faixa do peito tempo mais que suficiente
para o jogador ao lado a apanhar. Se um dia estes números mudarem ao ponto de
a bola sair depressa da faixa, o limite deixa de ser a única defesa — e é bom
saber isso por aqui e não por um encrave.
*/
console.log(LF + '2 — porque é que o ciclo se fecha sozinho');
{
    const g = BallPhysics.gravidade;
    const TEC = 63;                         // o mais baixo dos player_skills
    const frac = Math.max(0, Math.min(1, TEC / 100));
    const vy = BallControl.peitoVelYMa + (BallControl.peitoVelYBoa - BallControl.peitoVelYMa) * frac;

    // Quanto tempo a bola leva a sair da faixa do peito, largada de peitoAltura.
    const queda = BallControl.peitoAltura - BallControl.peitoYMin;
    // y(t) = y0 + vy*t - g t^2/2, resolvido para y0 - queda.
    const t = (vy + Math.sqrt(vy * vy + 2 * g * queda)) / g;

    console.log(`  TEC ${TEC}: sai do peito a ${vy.toFixed(2)} m/s, ` +
        `leva ${(t * 1000).toFixed(0)} ms a descer os ${(queda * 100).toFixed(0)} cm da faixa`);

    if (vy > 0) {
        erro('a bola sairia do peito A SUBIR — voltava à faixa de certeza');
    } else ok('sai a descer, mas devagar: a janela chega para o jogador ao lado');
}

/*
3 — O LIMITE ESTÁ NO CAMINHO QUE DECIDE O PEITO, e não noutro sítio qualquer.
*/
console.log(LF + '3 — o limite corta a sequência');
{
    const i = srcMatch.indexOf('const maxPeitos');
    const bloco = i < 0 ? '' : srcMatch.slice(i, i + 1600);

    if (!bloco) {
        erro('o limite não está no resolveBallContact');
    } else {
        if (!/this\.peitosSeguidos\s*<\s*maxPeitos/.test(bloco)) {
            erro('a condição do peito não consulta o contador');
        } else ok('o contador entra na condição que dispara o gesto');

        if (!/this\.peitosSeguidos\+\+/.test(bloco)) {
            erro('o contador não é incrementado — nunca chegaria ao limite');
        } else ok('cada matada no peito conta');
    }
}

/*
4 — E ZERA NOS SÍTIOS CERTOS.

O que faz este contador ser seguro é onde ele volta a zero. Sem o zero no
CHÃO, ele esgotava-se uma vez e a matada no peito desaparecia do resto do
jogo — um defeito pior do que o encrave, e silencioso.
*/
console.log(LF + '4 — onde o contador volta a zero');
{
    const zeraNoChao = /Bola tocou no chão[\s\S]{0,400}?this\.peitosSeguidos\s*=\s*0/.test(srcMatch);
    if (!zeraNoChao) {
        erro('o contador não zera quando a bola assenta — o peito morria no jogo todo');
    } else ok('zera quando a bola toca o relvado (a sequência é "sem assentar")');

    const zeraAoDominar = /best\.hasBall = true[\s\S]{0,600}?this\.peitosSeguidos\s*=\s*0/.test(srcMatch);
    if (!zeraAoDominar) erro('não zera quando alguém domina a bola');
    else ok('zera quando alguém domina mesmo');

    // Uma vez por jogada nova, senão um jogo herdava a contagem do anterior.
    const zeraNoReset = (srcMatch.match(/this\.peitosSeguidos\s*=\s*0/g) || []).length;
    if (zeraNoReset < 3) {
        erro(`só ${zeraNoReset} sítios zeram o contador; faltam o chão, o domínio e o reset`);
    } else ok(`${zeraNoReset} sítios zeram o contador`);
}

/*
5 — SIMULAÇÃO DO CICLO. Uma máquina mínima com a mesma regra: dois jogadores
a devolver a bola à faixa do peito um ao outro, sem parar. Sem o limite, isto
não termina; com ele, termina no número esperado.
*/
console.log(LF + '5 — o ciclo termina');
{
    const max = BallControl.maxPeitosSeguidos;

    const correr = (comLimite) => {
        let peitos = 0, gestos = 0;
        // 200 oportunidades: a bola volta sempre à faixa do peito, que é
        // exactamente o que o encrave mostrava.
        for (let i = 0; i < 200; i++) {
            const podeMatar = comLimite ? (peitos < max) : true;
            if (!podeMatar) break;
            peitos++; gestos++;
        }
        return gestos;
    };

    const semLimite = correr(false);
    const comLimite = correr(true);

    if (semLimite !== 200) erro('a simulação do ciclo não está a reproduzir o encrave');
    else ok(`sem limite: ${semLimite} matadas seguidas (não terminava)`);

    if (comLimite !== max) erro(`com limite deviam ser ${max}, foram ${comLimite}`);
    else ok(`com limite: pára às ${comLimite} e a bola cai`);
}

console.log(LF + (falhas === 0
    ? 'peito_pingpong: tudo bem.'
    : `peito_pingpong: ${falhas} falha(s).`));
process.exit(falhas === 0 ? 0 : 1);
