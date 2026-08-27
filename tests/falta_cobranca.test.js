/*
COBRANÇA DA FALTA — o batedor afasta-se, corre e bate.

Como estava: `FreeKickModel.recuoBatedor` de 1.4 m (praticamente em cima da
bola) e o `baterFalta` a executar tudo no mesmo frame — sem corrida e sem
gesto. O que se via era a bola a saltar sozinha para o pé do batedor.

Agora são três tempos: espera a `recuoBatedor`, caminha até `arranqueDoGesto`
durante o fim da espera regulamentar, e o `ActionState` cobre os últimos metros
com a bola a partir no `contactTime` do clip.

Este teste fixa a geometria (que há espaço para correr, e que a corrida final é
uma corrida e não um teletransporte) e as três ligações no código.

Corre com: node --test tests/falta_cobranca.test.js
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcConfig = semCR(fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8'));
const srcPlayer = semCR(fs.readFileSync(path.join(raiz, 'js', 'player.js'), 'utf8'));
const srcMatch = semCR(fs.readFileSync(path.join(raiz, 'js', 'match.js'), 'utf8'));
const srcBt = semCR(fs.readFileSync(path.join(raiz, 'js', 'bt', 'player_bt.js'), 'utf8'));

function extrairObjecto(src, nome) {
    const cabeca = `const ${nome} = {`;
    const ini = src.indexOf(cabeca);
    if (ini < 0) throw new Error(`${nome} não encontrado`);
    const fim = src.indexOf(LF + '};', ini);
    return new Function(`${src.slice(ini, fim + 3)}; return ${nome};`)();
}

const F = extrairObjecto(srcConfig, 'FreeKickModel');

// contactTime do ShotClip, que é o que a corrida final tem para acontecer.
const CONTACT_TIME = 7 / 11;
const DURACAO_CLIP = 0.8;

test('o batedor espera LONGE da bola', () => {
    assert.ok(F.recuoBatedor >= 3.0,
        `recuoBatedor a ${F.recuoBatedor} m é estar em cima da bola — não há cobrança para ver`);
    assert.ok(F.recuoBatedor <= 8.0,
        `recuoBatedor a ${F.recuoBatedor} m é um penálti de râguebi`);
});

test('a aproximação andada existe e deixa corrida para o gesto', () => {
    assert.ok(typeof F.arranqueDoGesto === 'number', 'arranqueDoGesto em falta');
    assert.ok(F.arranqueDoGesto < F.recuoBatedor,
        'o arranque do gesto tinha de ser mais perto da bola do que a espera');
    assert.ok(F.arranqueDoGesto > F.paragemNoContacto + 1.0,
        'não sobra corrida nenhuma entre o arranque do gesto e o contacto');

    // E a caminhada tem de caber no tempo que lhe é dado (o último terço da
    // espera regulamentar, 3 s).
    const distAndada = F.recuoBatedor - F.arranqueDoGesto;
    const tempoDisponivel = 3.0 / 3;
    assert.ok(distAndada <= F.velocidadeAproximacao * tempoDisponivel + 0.01,
        `${distAndada.toFixed(1)} m a ${F.velocidadeAproximacao} m/s não cabem em ` +
        `${tempoDisponivel.toFixed(2)} s de espera`);
});

test('a corrida final é uma corrida, não um teletransporte', () => {
    const dist = F.arranqueDoGesto - F.paragemNoContacto;
    const velocidade = dist / (CONTACT_TIME * DURACAO_CLIP);
    assert.ok(velocidade < 9.0,
        `os últimos ${dist.toFixed(1)} m em ${(CONTACT_TIME * DURACAO_CLIP).toFixed(2)} s ` +
        `dão ${velocidade.toFixed(1)} m/s — isso é um teletransporte com pose de remate`);
    assert.ok(velocidade > 1.5,
        `${velocidade.toFixed(1)} m/s não é uma corrida, é um passeio`);
});

test('a bola só parte no CONTACTO, e o jogo só abre aí', () => {
    const ini = srcPlayer.indexOf('baterFalta() {');
    assert.ok(ini > 0, 'baterFalta não encontrado');
    const corpo = srcPlayer.slice(ini, ini + 3000);

    assert.ok(corpo.includes('new ActionState('),
        'o baterFalta não cria gesto nenhum — voltou a executar no mesmo frame');
    assert.ok(corpo.includes('onPrepare'), 'sem onPrepare não há corrida');
    assert.ok(/onContact[\s\S]{0,200}Match\.state = 'PLAY'/.test(corpo),
        "o jogo tem de abrir no CONTACTO: `Match.state = 'PLAY'` dentro do onContact");
    assert.ok(/onContact[\s\S]{0,300}executarFalta/.test(corpo),
        'o contacto não chama o executarFalta');

    // E a decisão continua a ser as três: tocar, cruzar ou rematar.
    const exec = srcPlayer.indexOf('executarFalta(decisao) {');
    assert.ok(exec > 0, 'executarFalta não encontrado');
    const corpoExec = srcPlayer.slice(exec, exec + 2500);
    for (const caso of ['remate', 'cruzamento']) {
        assert.ok(corpoExec.includes(`decisao === '${caso}'`), `falta o caso ${caso}`);
    }
    assert.ok(corpoExec.includes('initiatePass'), 'falta o passe curto');
});

test('as duas ligações que fazem a cobrança acontecer', () => {
    // 1. A caminhada, no ramo faltaPendente do Match.update.
    assert.ok(srcMatch.includes('arranqueDoGesto'),
        'o match.js não faz a aproximação andada');

    // 2. E o batedor a meio do gesto não pode ser mandado para SET_PIECE_WAIT:
    // o changeState limpa o actionState e a falta nunca era batida.
    assert.ok(/setPieceTaker && p\.actionState/.test(srcBt),
        'o tratarBolaParada volta a matar o gesto do batedor');
});
