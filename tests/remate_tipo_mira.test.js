/*
REMATE — tipo, mira e erro, agora que o desfecho deixou de ser sorteado.

Antes o `executeShotGameplay` sorteava o RESULTADO (GOL, TRAVE_CAMPO,
TRAVESSAO_FORA, GOLEIRO_DEFENDE_*) por pesos e depois escolhia um ponto que o
produzisse. Não havia remate colocado nem rasteiro — havia potência cheia com
`alvoY = random() > 0.5 ? 2.0 : 0.4` — e o canto saía de `random()`, sem olhar
para o guarda-redes. Pior: o desfecho escrevia `forcedGKDelay = 1.0` nos
remates marcados como golo, ou seja desligava o guarda-redes.

Agora escolhe-se tipo e mira, soma-se um erro gaussiano, e a bola voa. Este
teste fixa as três funções puras (utils.js) e a CALIBRAÇÃO da precisão por
distância, que é o que substitui a tabela de desfechos.

Corre com: node --test tests/remate_tipo_mira.test.js
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcConfig = semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'shooting.js'), 'utf8')) + '\n' + semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'physics.js'), 'utf8'));
const srcUtils = semCR(fs.readFileSync(path.join(raiz, 'js', 'utils.js'), 'utf8'));
const srcFsm = semCR(fs.readFileSync(path.join(raiz, 'js', 'fsm.js'), 'utf8'));

const LARGURA_BALIZA = 7.32, ALTURA_BALIZA = 2.44;
const RAIO_POSTE = 0.06, RAIO_BOLA = 0.11;

function extrairObjecto(src, nome) {
    const cabeca = `const ${nome} = {`;
    const ini = src.indexOf(cabeca);
    if (ini < 0) throw new Error(`${nome} não encontrado em js/config.js`);
    const fim = src.indexOf(LF + '};', ini);
    return new Function('LARGURA_BALIZA', 'ALTURA_BALIZA',
        `${src.slice(ini, fim + 3)}; return ${nome};`)(LARGURA_BALIZA, ALTURA_BALIZA);
}

function extrairFuncao(src, nome) {
    const cabeca = `function ${nome}(`;
    const ini = src.indexOf(cabeca);
    if (ini < 0) throw new Error(`${nome} não encontrada`);
    const fim = src.indexOf(LF + '}', ini);
    return src.slice(ini, fim + 2);
}

const ShotModel = extrairObjecto(srcConfig, 'ShotModel');
const nomes = ['tipoDeRemate', 'miraDeRemate', 'sigmaDeRemate', 'amostraGaussiana'];
const codigo = nomes.map(n => extrairFuncao(srcUtils, n)).join(LF + LF);
const { tipoDeRemate, miraDeRemate, sigmaDeRemate, amostraGaussiana } =
    new Function('ShotModel', 'LARGURA_BALIZA',
        `${codigo}; return { ${nomes.join(', ')} };`)(ShotModel, LARGURA_BALIZA);

/* ---- o desfecho deixou de ser sorteado ---------------------------------- */

test('o sorteio de desfechos e o forcedGKDelay saíram do código', () => {
    for (const morto of ['TRAVE_CAMPO', 'TRAVESSAO_FORA', 'GOLEIRO_DEFENDE_VOLTA',
        'forcedGKDelay', 'attackRatio']) {
        assert.ok(!srcFsm.includes(morto),
            `js/fsm.js ainda tem \`${morto}\` — o desfecho voltou a ser imposto`);
    }
    // E o remate passa mesmo pelas funções novas.
    for (const vivo of ['tipoDeRemate', 'miraDeRemate', 'sigmaDeRemate']) {
        assert.ok(srcFsm.includes(vivo), `js/fsm.js não usa ${vivo}`);
    }
});

/* ---- tipos --------------------------------------------------------------- */

// Distribuição de tipos varrendo o sorteio inteiro.
function tipos(o) {
    const c = { forca: 0, colocado: 0, rasteiro: 0, chapeu: 0 };
    const N = 1000;
    for (let i = 0; i < N; i++) c[tipoDeRemate(Object.assign({ rnd: i / N }, o))]++;
    for (const k of Object.keys(c)) c[k] /= N;
    return c;
}

test('existem os quatro tipos, e cada um aparece onde deve', () => {
    const perto = tipos({ dist: 8, tec: 50, distAdversario: 6, gkAdiantado: 0 });
    assert.ok(perto.rasteiro > 0.2, `rasteiro raro de perto: ${perto.rasteiro}`);
    assert.ok(perto.colocado > 0.2, `colocado raro de perto: ${perto.colocado}`);
    assert.ok(perto.chapeu === 0, 'chapéu com o guarda-redes na linha');

    const longe = tipos({ dist: 26, tec: 50, distAdversario: 6, gkAdiantado: 0 });
    assert.ok(longe.colocado === 0, 'ninguém coloca de 26 m');
    assert.ok(longe.forca > 0.7, `de 26 m devia bater-se: ${longe.forca}`);

    const gkFora = tipos({ dist: 14, tec: 50, distAdversario: 6, gkAdiantado: 6 });
    assert.ok(gkFora.chapeu > 0.2, `chapéu não aparece com o GK adiantado: ${gkFora.chapeu}`);
});

test('a pressão tira o remate colocado', () => {
    const livre = tipos({ dist: 12, tec: 50, distAdversario: 6, gkAdiantado: 0 });
    const apertado = tipos({ dist: 12, tec: 50, distAdversario: 1.5, gkAdiantado: 0 });
    assert.ok(livre.colocado > 0.2 && apertado.colocado === 0,
        'colocar sob pressão não devia ser opção');
});

test('a técnica faz o colocado ser mais opção', () => {
    const fraco = tipos({ dist: 12, tec: 15, distAdversario: 6 });
    const forte = tipos({ dist: 12, tec: 90, distAdversario: 6 });
    assert.ok(forte.colocado > fraco.colocado + 0.1,
        `a TEC não muda a escolha: ${fraco.colocado} vs ${forte.colocado}`);
});

test('o colocado troca potência por precisão', () => {
    const T = ShotModel.tipos;
    assert.ok(T.colocado.potencia < T.forca.potencia, 'colocado devia sair mais fraco');
    assert.ok(T.colocado.sigma < T.forca.sigma, 'colocado devia ser mais preciso');
    assert.ok(T.rasteiro.potencia < T.forca.potencia);
});

/* ---- mira ---------------------------------------------------------------- */

test('mira ao canto CONTRÁRIO ao guarda-redes', () => {
    for (const gkX of [1.5, 2.5, -1.5, -3.0]) {
        for (const r of [0.1, 0.4, 0.9]) {
            const m = miraDeRemate({ tipo: 'forca', gkX: gkX, rnd: r });
            assert.strictEqual(Math.sign(m.x), -Math.sign(gkX),
                `com o GK em x=${gkX} mirou o mesmo lado`);
        }
    }
    // GK ao meio: os dois lados aparecem.
    const lados = new Set();
    for (let i = 0; i < 100; i++) lados.add(Math.sign(miraDeRemate({ tipo: 'forca', gkX: 0, rnd: i / 100 }).x));
    assert.strictEqual(lados.size, 2, 'com o GK ao meio devia variar de lado');
});

test('o ponto mirado é sempre golo — o que decide é o erro', () => {
    for (const tipo of ['forca', 'colocado', 'rasteiro']) {
        for (const r of [0.2, 0.8]) {
            const m = miraDeRemate({ tipo: tipo, gkX: 1.0, rnd: r });
            assert.ok(Math.abs(m.x) < LARGURA_BALIZA / 2 - RAIO_POSTE,
                `${tipo}: mira fora dos postes (${m.x.toFixed(2)})`);
            assert.ok(m.y > 0 && m.y < ALTURA_BALIZA,
                `${tipo}: mira fora da altura (${m.y.toFixed(2)})`);
        }
    }
});

test('rasteiro é mesmo rasteiro', () => {
    const m = miraDeRemate({ tipo: 'rasteiro', gkX: 1.0, rnd: 0.5 });
    assert.ok(m.y < 0.5, `rasteiro a ${m.y.toFixed(2)} m do chão`);
});

/* ---- erro e calibração --------------------------------------------------- */

test('o sigma responde à distância, à técnica, à pressão e ao ângulo', () => {
    const base = { dist: 15, tec: 50, distAdversario: 9, angulo: 0.1, tipo: 'forca' };
    const s = (o) => sigmaDeRemate(Object.assign({}, base, o)).lateral;

    assert.ok(s({ dist: 25 }) > s({ dist: 8 }), 'a distância não pesa');
    assert.ok(s({ tec: 90 }) < s({ tec: 20 }), 'a técnica não pesa');
    assert.ok(s({ distAdversario: 1.0 }) > s({}), 'a pressão não pesa');
    assert.ok(s({ angulo: 1.2 }) > s({}), 'o ângulo fechado não pesa');
    assert.ok(sigmaDeRemate(base).vertical < sigmaDeRemate(base).lateral,
        'errar a altura devia ser menos comum do que errar o lado');
});

/*
CALIBRAÇÃO. Sem tabela de desfechos, a precisão é o que define o jogo — por
isso é medida aqui. Monte Carlo sobre a mira + erro, com um rematador médio.

"Madeira" é a bola a cair na banda de um raio de bola em torno do poste ou do
travessão; nem toda ela bate mesmo (parte passa rente), por isso o número real
de bolas na madeira é bastante menor do que este.
*/
function distribuicao(dist, tec) {
    const N = 30000;
    let dentro = 0, madeira = 0, fora = 0;
    const banda = RAIO_POSTE + RAIO_BOLA;
    for (let i = 0; i < N; i++) {
        const tipo = tipoDeRemate({ dist, tec, distAdversario: 6, gkAdiantado: 0 });
        const m = miraDeRemate({ tipo, gkX: 1.0 });
        const s = sigmaDeRemate({ dist, tec, distAdversario: 6, angulo: 0.2, tipo });
        const x = m.x + s.lateral * amostraGaussiana(Math.random);
        const y = Math.max(0.08, m.y + s.vertical * amostraGaussiana(Math.random));

        if (Math.abs(Math.abs(x) - LARGURA_BALIZA / 2) < banda ||
            Math.abs(y - ALTURA_BALIZA) < banda) madeira++;
        else if (Math.abs(x) < LARGURA_BALIZA / 2 && y < ALTURA_BALIZA) dentro++;
        else fora++;
    }
    return { dentro: dentro / N, madeira: madeira / N, fora: fora / N };
}

test('precisão por distância, com um rematador médio', () => {
    const faixas = [
        { dist: 6, min: 0.55, max: 0.75 },
        { dist: 12, min: 0.44, max: 0.64 },
        { dist: 18, min: 0.33, max: 0.53 },
        { dist: 25, min: 0.22, max: 0.42 }
    ];
    for (const f of faixas) {
        const d = distribuicao(f.dist, 50);
        console.log(`  ${String(f.dist).padStart(2)} m: no alvo ${(d.dentro * 100).toFixed(0)}%  ` +
            `perto da madeira ${(d.madeira * 100).toFixed(0)}%  fora ${(d.fora * 100).toFixed(0)}%`);
        assert.ok(d.dentro > f.min && d.dentro < f.max,
            `${f.dist} m: ${(d.dentro * 100).toFixed(0)}% no alvo, fora da faixa ` +
            `${(f.min * 100).toFixed(0)}-${(f.max * 100).toFixed(0)}%`);
    }
});

test('a precisão cai com a distância e sobe com a técnica', () => {
    const perto = distribuicao(8, 50).dentro;
    const longe = distribuicao(24, 50).dentro;
    assert.ok(perto > longe + 0.1, `a distância não muda nada: ${perto} vs ${longe}`);

    const fraco = distribuicao(16, 20).dentro;
    const craque = distribuicao(16, 90).dentro;
    assert.ok(craque > fraco + 0.08, `a técnica não muda nada: ${fraco} vs ${craque}`);
});

test('a escala global é a única manípula, e está neutra', () => {
    assert.ok(Math.abs(ShotModel.erro.escalaGlobal - 1.0) < 1e-9,
        'a escala global saiu de 1.0 — a calibração acima deixou de valer');
});
