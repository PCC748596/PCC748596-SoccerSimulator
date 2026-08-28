/*
COBRANÇA DO PENÁLTI — o batedor CORRE para a bola, não desliza até ela.

Como estava: o batedor esperava em `recuoBatedor` (4.6 m) e o `onPrepare` do
`baterPenalti` interpolava a posição até junto da bola dentro do `contactTime`
do ShotClip (~0.32 s) — ~13 m/s. Pior: o ramo do freeze em `player.update`
corria só o `fsm.update` e fazia `return`, sem `animateBones`, portanto o corpo
ficava congelado na pose do remate enquanto a posição avançava. O que se via era
o jogador a DESLIZAR sobre a perna de apoio até chegar à bola e chutar.

Agora são os mesmos três tempos da falta: espera em `recuoBatedor`, CAMINHA até
`arranqueDoGesto` durante o último terço da espera regulamentar (com o
`animateBones` a desenhar o passo), e o `ActionState` cobre a última passada com
a bola a partir no `contactTime`.

Corre com: node --test tests/penalti_corrida.test.js
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcConfig = semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'shooting.js'), 'utf8'));
const srcPlayer = semCR(fs.readFileSync(path.join(raiz, 'js', 'player.js'), 'utf8'));
const srcLoop = semCR(fs.readFileSync(path.join(raiz, 'js', 'match', 'match_loop.js'), 'utf8'));

function extrairObjecto(src, nome) {
    const cabeca = `const ${nome} = {`;
    const ini = src.indexOf(cabeca);
    if (ini < 0) throw new Error(`${nome} não encontrado`);
    const fim = src.indexOf(LF + '};', ini);
    return new Function(`${src.slice(ini, fim + 3)}; return ${nome};`)();
}

const PM = extrairObjecto(srcConfig, 'PenaltyModel');

// contactTime do ShotClip, que é o que a última passada tem para acontecer.
const CONTACT_TIME = 7 / 11;
const ESPERA = 3.0;   // ESPERA_APOS_REPOSICAO

test('a aproximação andada existe e deixa passada para o gesto', () => {
    assert.ok(typeof PM.arranqueDoGesto === 'number', 'arranqueDoGesto em falta');
    assert.ok(typeof PM.velocidadeAproximacao === 'number', 'velocidadeAproximacao em falta');
    assert.ok(typeof PM.paragemNoContacto === 'number', 'paragemNoContacto em falta');

    assert.ok(PM.arranqueDoGesto < PM.recuoBatedor,
        'o arranque do gesto tinha de ser mais perto da bola do que a espera');
    assert.ok(PM.arranqueDoGesto > PM.paragemNoContacto + 0.8,
        'não sobra passada nenhuma entre o arranque do gesto e o contacto');
});

test('a caminhada cabe no tempo que lhe é dado', () => {
    const distAndada = PM.recuoBatedor - PM.arranqueDoGesto;
    const tempo = ESPERA / 3;
    assert.ok(distAndada <= PM.velocidadeAproximacao * tempo,
        `${distAndada.toFixed(2)} m a ${PM.velocidadeAproximacao} m/s não cabem em ${tempo.toFixed(2)} s`);
});

test('a última passada é uma passada e não um teletransporte', () => {
    const dist = PM.arranqueDoGesto - PM.paragemNoContacto;
    const v = dist / CONTACT_TIME;
    assert.ok(v < 8.0,
        `${v.toFixed(1)} m/s na corrida final é um teletransporte com pose de remate`);
});

test('o freeze do PENALTY anima o batedor em vez de o congelar', () => {
    /*
    A causa do deslize: o ramo do batedor fazia `fsm.update(dt); return;` sem
    `animateBones`. É o `animateBones` que desenha o passo — sem ele o corpo
    fica na pose do clip enquanto a posição avança.
    */
    const ini = srcPlayer.indexOf("Match.state === 'PENALTY' && this === Match.setPieceTaker");
    assert.ok(ini > 0, 'a excepção do batedor no freeze do PENALTY desapareceu');
    const ramo = srcPlayer.slice(ini, ini + 900);
    assert.ok(/animateBones\(dt\)/.test(ramo),
        'o batedor do penálti volta a estar congelado: sem animateBones não há passo, há deslize');
    assert.ok(/addScaledVector\(this\.velocity, dt\)/.test(ramo),
        'sem integrar a velocidade a caminhada não desloca ninguém');
});

test('a excepção vem ANTES de a velocidade ser zerada', () => {
    /*
    Quem põe a velocidade da caminhada é o ramo `penaltiPendente` do
    Match.update. O freeze zerava-a no topo, todos os frames — o batedor ficava
    parado no recuo até o gesto o teletransportar.
    */
    const topo = srcPlayer.indexOf("if (Match.kickoffActive || Match.state === 'PENALTY') {");
    assert.ok(topo > 0, 'o freeze do kickoff/penálti desapareceu');
    const excepcao = srcPlayer.indexOf("Match.state === 'PENALTY' && this === Match.setPieceTaker", topo);
    const zera = srcPlayer.indexOf('this.velocity.set(0, 0, 0);', topo);
    assert.ok(excepcao > 0 && zera > 0);
    assert.ok(excepcao < zera,
        'a excepção do batedor está depois do velocity.set(0,0,0) — a caminhada é apagada todos os frames');
});

test('o Match.update conduz a caminhada do batedor do penálti', () => {
    const ini = srcLoop.indexOf("if (this.state === 'PENALTY')");
    assert.ok(ini > 0, "ramo PENALTY do Match.update não encontrado");
    const ramo = srcLoop.slice(ini, ini + 2600);
    assert.ok(/arranqueDoGesto/.test(ramo),
        'o ramo PENALTY não usa o arranqueDoGesto: não há aproximação andada');
    assert.ok(/velocidadeAproximacao/.test(ramo),
        'o ramo PENALTY não põe velocidade de caminhada no batedor');
    assert.ok(/ESPERA_APOS_REPOSICAO \/ 3/.test(ramo),
        'a caminhada tem de acontecer no último terço da espera, como na falta');
});

test('o onPrepare do baterPenalti move x e z, e parte de onde ele está', () => {
    const ini = srcPlayer.indexOf('baterPenalti()');
    assert.ok(ini > 0, 'baterPenalti não encontrado');
    const corpo = srcPlayer.slice(ini, ini + 2600);
    assert.ok(/paragemNoContacto/.test(corpo),
        'o gesto ainda usa o 0.5 fixo em vez do paragemNoContacto');
    assert.ok(/this\.model\.position\.x = /.test(corpo),
        'o onPrepare só interpolava o z — o batedor entrava de lado na bola');
    assert.ok(/this\.velocity\.set\(0, 0, 0\)/.test(corpo),
        'sem zerar a velocidade o animateBones escreve a passada por cima da pose do remate');
});
