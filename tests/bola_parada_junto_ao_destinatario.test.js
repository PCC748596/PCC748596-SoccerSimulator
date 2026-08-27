/*
BOLA PARADA JUNTO AO DESTINATÁRIO — o passe tem de caducar na mesma.

O `passeMorreuParaODestinatario` (utils.js) começava assim:

    if (Math.hypot(dx, dz) <= o.distPerdido) return false;

Perto do destinatário o passe contava como entregue e o resto do teste nem
corria. Só que "perto dele" (4 m) não é "no pé dele": a bola pode parar a três
metros e ele não lhe tocar — ficou à espera da queda, o alvo dele era outro
ponto, um adversário meteu-se pelo meio.

E aí ninguém a ia buscar. O `bolaSolta` do `deveMandarChaser` (team_bt.js)
exige `!Match.intendedReceiver`, portanto a equipa não designa perseguidor; e o
destinatário já tinha parado. Bola quieta no relvado com gente à volta — o que
se via junto à linha lateral.

Este teste fixa as duas metades: o passe que ainda está vivo NÃO caduca, e o
que está parado há mais do que o prazo caduca mesmo.

Corre com: node --test tests/bola_parada_junto_ao_destinatario.test.js
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcConfig = semCR(fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8'));
const srcUtils = semCR(fs.readFileSync(path.join(raiz, 'js', 'utils.js'), 'utf8'));
const srcMatch = semCR(fs.readFileSync(path.join(raiz, 'js', 'match.js'), 'utf8'));

function extrairObjecto(src, nome) {
    const cabeca = `const ${nome} = {`;
    const ini = src.indexOf(cabeca);
    if (ini < 0) throw new Error(`${nome} não encontrado`);
    const fim = src.indexOf(LF + '};', ini);
    return new Function(`${src.slice(ini, fim + 3)}; return ${nome};`)();
}
function extrairFuncao(src, nome) {
    const cabeca = `function ${nome}(`;
    const ini = src.indexOf(cabeca);
    if (ini < 0) throw new Error(`${nome} não encontrada`);
    const fim = src.indexOf(LF + '}', ini);
    return src.slice(ini, fim + 2);
}

const PerceptionModel = extrairObjecto(srcConfig, 'PerceptionModel');
const passeMorreu = new Function(
    `${extrairFuncao(srcUtils, 'passeMorreuParaODestinatario')}; return passeMorreuParaODestinatario;`)();

const PRAZO = PerceptionModel.prazoBolaParada;
const DIST = PerceptionModel.passePerdidoDist;

// Bola a 2.5 m do destinatário — dentro do raio de "entregue".
const perto = (extra) => Object.assign({
    bolaX: 2.5, bolaZ: 0, alvoX: 0, alvoZ: 0,
    velX: 0, velZ: 0, velY: 0,
    distPerdido: DIST, paradaV2: 0.5,
    prazoParada: PRAZO
}, extra);

test('o prazo existe e é curto o suficiente para não travar o jogo', () => {
    assert.ok(typeof PRAZO === 'number', 'PerceptionModel.prazoBolaParada em falta');
    assert.ok(PRAZO >= 0.5 && PRAZO <= 3.0,
        `prazo de ${PRAZO}s: abaixo de 0.5 rouba bolas que ele ia mesmo apanhar, ` +
        'acima de 3 o jogo fica à espera');
});

test('bola parada junto a ele, passado o prazo: o passe caduca', () => {
    assert.strictEqual(passeMorreu(perto({ tempoParada: PRAZO + 0.1 })), true,
        'a bola ficou presa ao destinatário — ninguém a vai buscar');
});

test('mas antes do prazo, não: ele ainda a vai apanhar', () => {
    assert.strictEqual(passeMorreu(perto({ tempoParada: PRAZO - 0.1 })), false,
        'caducou cedo de mais: tirava-lhe bolas que ele ia mesmo receber');
    assert.strictEqual(passeMorreu(perto({ tempoParada: 0 })), false);
});

test('bola ainda a MEXER junto a ele nunca caduca, por muito tempo que passe', () => {
    // Chega-lhe a rolar: é um passe a ser entregue, não um passe morto.
    assert.strictEqual(
        passeMorreu(perto({ velX: -3.0, tempoParada: PRAZO + 5 })), false,
        'matou um passe que estava a chegar');
});

test('sem o tempo, o comportamento é o antigo', () => {
    // Quem chamar sem `tempoParada` (código antigo, ou outro sítio) não muda
    // de comportamento — a mudança é aditiva.
    assert.strictEqual(passeMorreu(perto({})), false);
});

test('longe dele continua a valer o teste de sempre', () => {
    const longe = {
        bolaX: 12, bolaZ: 0, alvoX: 0, alvoZ: 0,
        distPerdido: DIST, paradaV2: 0.5, velY: 0
    };
    // Parada longe: morto.
    assert.strictEqual(passeMorreu(Object.assign({ velX: 0, velZ: 0 }, longe)), true);
    // A afastar-se dele: morto.
    assert.strictEqual(passeMorreu(Object.assign({ velX: 5, velZ: 0 }, longe)), true);
    // A ir na direcção dele: vivo.
    assert.strictEqual(passeMorreu(Object.assign({ velX: -5, velZ: 0 }, longe)), false);
});

test('o match.js alimenta mesmo o relógio da bola parada', () => {
    assert.ok(srcMatch.includes('tempoBolaParada'),
        'o Match não conta o tempo com a bola parada — o prazo nunca dispara');
    assert.ok(srcMatch.includes('prazoParada: PerceptionModel.prazoBolaParada'),
        'o Match não passa o prazo ao passeMorreuParaODestinatario');
});
