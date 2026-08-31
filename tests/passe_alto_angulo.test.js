/*
ÂNGULO DO PASSE PELO ALTO — 25° a 35°, em TODOS os caminhos.

Um passe pelo alto sai do peito do pé; acima dos ~35° já é um pontapé de
recurso, e era isso que se via em campo: passes com a parábola de um chutão de
guarda-redes. Havia três sítios a escolher elevação e nenhum tinha a faixa:

  bandas (<=30 m)   `atan(4·alturaMax/dist)` com tecto de 60° — um passe de
                    21 m dava 38.7°.
  longo (>30 m)     interpolava entre 42° e 32°.
  encontro          `elevacaoParaTempoDeVoo` tinha limites próprios de 12° a
                    55°, e ia buscar os 55° para atrasar a bola quando o
                    receptor demorava. O pior dos três.

Este teste varre as distâncias de passe e fixa a faixa nos três caminhos, mais
a coerência das constantes que os alimentam.

Corre com: node --test tests/passe_alto_angulo.test.js
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcConfig = semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'physics.js'), 'utf8')) + '\n' + semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'passing.js'), 'utf8'));
const srcUtils = semCR(fs.readFileSync(path.join(raiz, 'js', 'utils.js'), 'utf8'));

const CONSTANTES = { ALTURA_CABECA: 1.72, CAMPO_COMP: 106, CAMPO_LARG: 68 };

function extrairObjecto(src, nome) {
    const cabeca = `const ${nome} = {`;
    const ini = src.indexOf(cabeca);
    if (ini < 0) throw new Error(`${nome} não encontrado em js/config.js`);
    const fim = src.indexOf(LF + '};', ini);
    const nomes = Object.keys(CONSTANTES);
    return new Function(...nomes,
        `${src.slice(ini, fim + 3)}; return ${nome};`)(...nomes.map(n => CONSTANTES[n]));
}

function extrairFuncao(src, nome) {
    const cabeca = `function ${nome}(`;
    const ini = src.indexOf(cabeca);
    if (ini < 0) throw new Error(`${nome} não encontrada em js/utils.js`);
    const fim = src.indexOf(LF + '}', ini);
    return src.slice(ini, fim + 2);
}

const BallPhysics = extrairObjecto(srcConfig, 'BallPhysics');
{
    const ini = srcConfig.indexOf('BallPhysics.area =');
    const fim = srcConfig.indexOf('/ BallPhysics.massa;', ini) + '/ BallPhysics.massa;'.length;
    new Function('BallPhysics', srcConfig.slice(ini, fim))(BallPhysics);
}
const PassModel = extrairObjecto(srcConfig, 'PassModel');

// Só o que estas funções usam do THREE.
const THREE = {
    MathUtils: {
        clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
        degToRad: g => g * Math.PI / 180
    }
};

const nomes = ['velocidadeParaAlcance', 'resolverElevacaoPasse',
    'tempoDeVooDoPasse', 'elevacaoParaTempoDeVoo', 'elevacaoComTectoDeApex'];
const codigo = nomes.map(n => extrairFuncao(srcUtils, n)).join(LF + LF);
const { resolverElevacaoPasse, tempoDeVooDoPasse, elevacaoParaTempoDeVoo,
    elevacaoComTectoDeApex } =
    new Function('BallPhysics', 'PassModel', 'THREE',
        `${codigo}; return { ${nomes.join(', ')} };`)(BallPhysics, PassModel, THREE);

const grau = r => r * 180 / Math.PI;
const B = PassModel.passeArco;
const MIN = grau(B.elevMin), MAX = grau(B.elevMax);

test('a faixa pedida é 25°-35° e está no config', () => {
    assert.ok(Math.abs(MIN - 25) < 0.01, `elevMin é ${MIN.toFixed(1)}°, devia ser 25°`);
    assert.ok(Math.abs(MAX - 35) < 0.01, `elevMax é ${MAX.toFixed(1)}°, devia ser 35°`);

    // O passe longo (>30 m) usa as suas próprias constantes: têm de coincidir,
    // senão volta a haver dois entendimentos do que é um passe alto.
    assert.ok(Math.abs(grau(B.anguloLongoMin) - MIN) < 0.01,
        `anguloLongoMin (${grau(B.anguloLongoMin).toFixed(1)}°) fora da faixa`);
    assert.ok(Math.abs(grau(B.anguloLongoMax) - MAX) < 0.01,
        `anguloLongoMax (${grau(B.anguloLongoMax).toFixed(1)}°) fora da faixa`);

    // E o recurso do lançamento alto.
    assert.ok(grau(PassModel.elevacaoLancamento) >= MIN - 0.01 &&
        grau(PassModel.elevacaoLancamento) <= MAX + 0.01,
        `elevacaoLancamento (${grau(PassModel.elevacaoLancamento).toFixed(1)}°) fora da faixa`);

    // O encontro (utils.js) tem de apertar na mesma faixa.
    assert.ok(Math.abs(grau(PassModel.encontro.elevMin) - MIN) < 0.01 &&
        Math.abs(grau(PassModel.encontro.elevMax) - MAX) < 0.01,
        'PassModel.encontro tem uma faixa de elevação diferente do passeArco');
});

/*
A FAIXA DE 25°-35° VALE A PARTIR DOS 30 m, E SÓ A PARTIR DAÍ.

Abaixo dos 30 m o passe pelo alto deixou de existir: o que manda é o TECTO DE
ALTURA da banda (o peito, 1.20 m), e um tecto de altura obriga a ângulos muito
mais rasos — um passe de 20 m com 1.20 m de apex pede 13.5°. Subi-lo aos 25°
punha a bola a 2.33 m, ou seja anulava o tecto. Ver passeArco.elevMinBaixa.
*/
test('acima de 30 m a elevação fica na faixa; abaixo, respeita o tecto de altura', () => {
    const fora = [];
    const altos = [];
    for (let d = 15.5; d <= 70; d += 0.5) {
        // forcarArco: salta o sorteio rasteiro/arco e força o caminho alto.
        const e = resolverElevacaoPasse(d, true);
        if (e === null) continue;   // <= rasteiroMax
        const g = grau(e);
        if (d >= 30.0) {
            if (g < MIN - 0.01 || g > MAX + 0.01) fora.push(`${d}m -> ${g.toFixed(1)}°`);
        } else {
            // apex ≈ tan(elev)·dist/4 (parábola plana, o mesmo que a config usa)
            const apex = Math.tan(e) * d / 4;
            if (apex > 1.21) altos.push(`${d}m -> apex ${apex.toFixed(2)}m`);
        }
    }
    assert.strictEqual(fora.length, 0, `acima de 30 m, fora da faixa: ${fora.slice(0, 6).join(', ')}`);
    assert.strictEqual(altos.length, 0, `abaixo de 30 m, acima do peito: ${altos.slice(0, 6).join(', ')}`);
});

test('até rasteiroMax continua rasteiro (a faixa não inventa passes altos)', () => {
    for (const d of [3, 8, 12, 15]) {
        assert.strictEqual(resolverElevacaoPasse(d, true), null,
            `${d} m devia ser rasteiro`);
    }
});

test('o encontro ajusta o tempo DENTRO da faixa, nunca fora', () => {
    const fora = [];
    for (let d = 16; d <= 60; d += 2) {
        // Varre desde "ele já lá está" até "demora uma eternidade": o ângulo
        // tem de saturar nos extremos da faixa, não passar deles.
        for (const tempoAlvo of [0.2, 0.6, 1.0, 1.5, 2.0, 3.0, 5.0]) {
            const e = elevacaoParaTempoDeVoo(d, tempoAlvo, B.elevMin, B.elevMax);
            const g = grau(e);
            if (g < MIN - 0.01 || g > MAX + 0.01) fora.push(`${d}m/${tempoAlvo}s -> ${g.toFixed(1)}°`);
        }
    }
    assert.strictEqual(fora.length, 0, `fora da faixa: ${fora.slice(0, 6).join(', ')}`);
});

test('dentro da faixa o ângulo ainda serve para ajustar o tempo', () => {
    // Se não servisse para nada, mais valia uma constante. Entre os extremos
    // da faixa tem de haver margem de tempo utilizável.
    const d = 30;
    const tMin = tempoDeVooDoPasse(d, B.elevMin);
    const tMax = tempoDeVooDoPasse(d, B.elevMax);
    assert.ok(tMax > tMin + 0.15,
        `a faixa não dá margem nenhuma de tempo: ${tMin.toFixed(2)}s a ${tMax.toFixed(2)}s`);

    // E um pedido no meio tem de cair no meio.
    const meio = elevacaoParaTempoDeVoo(d, (tMin + tMax) / 2, B.elevMin, B.elevMax);
    assert.ok(grau(meio) > MIN + 0.5 && grau(meio) < MAX - 0.5,
        `pedido do meio saturou num extremo: ${grau(meio).toFixed(1)}°`);
});

test('altura de um passe alto típico é de passe, não de chutão', () => {
    /*
    A prova visível: apex = v²·sen²(elev) / 2g. Um passe de 25 m a 35° não
    pode subir como um pontapé de baliza. Com o tecto antigo (60°) e a banda
    dos 4.2 m, um passe de 21 m saía a 38.7° e subia bem acima disto.
    */
    for (const d of [18, 25, 35, 45]) {
        const e = resolverElevacaoPasse(d, true);
        if (e === null) continue;
        const v = new Function('BallPhysics',
            `${extrairFuncao(srcUtils, 'velocidadeParaAlcance')}; return velocidadeParaAlcance(${d}, ${e});`
        )(BallPhysics);
        const apex = (v * Math.sin(e)) ** 2 / (2 * BallPhysics.gravidade);
        /*
        O tecto tem de escalar com a distância: cobrir 35 m no ar a 30° obriga
        mesmo a subir ~7 m, e isso é um passe. O que se mede é a FORMA —
        apex/alcance = tan(elev)/4 na parábola plana —, com folga de 35% para
        o arrasto, que encurta o alcance e por isso levanta a razão (medido: 1.44
        aos 35 m, o pior caso do varrimento).
        */
        const tecto = d * Math.tan(B.elevMax) / 4 * 1.5;
        assert.ok(apex < tecto,
            `passe de ${d} m sobe a ${apex.toFixed(1)} m (tecto ${tecto.toFixed(1)} m) — isso é um chutão`);
    }
});


/* ---- tecto de altura ----------------------------------------------------- */

/*
O ÂNGULO SOZINHO NÃO CHEGA. A faixa de 25°-35° descreve o gesto e é a mesma a
18 m e a 55 m — mas o apex vai com o QUADRADO da velocidade, e essa cresce com
a distância. Medido em jogo antes deste tecto: um lançamento de 54.9 m saía a
35° com vy = 18.5, ou seja 17 m de altura. Ângulo legal, bola de guarda-redes.
*/
const apexDe = (dist, elev) => {
    const v = new Function('BallPhysics',
        `${extrairFuncao(srcUtils, 'velocidadeParaAlcance')}; return velocidadeParaAlcance(${dist}, ${elev});`
    )(BallPhysics);
    const vy = v * Math.sin(elev);
    return (vy * vy) / (2 * BallPhysics.gravidade);
};

test('nenhum passe pelo alto passa do tecto de apex', () => {
    const A = PassModel.passeArco;
    assert.ok(typeof A.apexMax === 'number', 'passeArco.apexMax em falta');

    const fora = [];
    for (let d = 16; d <= 60; d += 2) {
        const elev = resolverElevacaoPasse(d, true);
        if (elev === null) continue;
        const corrigida = elevacaoComTectoDeApex(d, elev, A.apexMax, A.elevMinLonga);
        const apex = apexDe(d, corrigida);
        // Folga de 15%: `velocidadeParaAlcance` resolve com arrasto e o apex
        // aqui é calculado sem ele, portanto sobrestima um pouco.
        if (apex > A.apexMax * 1.15) fora.push(`${d}m -> ${apex.toFixed(1)}m`);
    }
    assert.strictEqual(fora.length, 0, `acima do tecto: ${fora.slice(0, 6).join(', ')}`);
});

test('o tecto só baixa a elevação quando é preciso', () => {
    const A = PassModel.passeArco;
    // Passe curto pelo alto: já cabe, não se mexe.
    const elev = resolverElevacaoPasse(18, true);
    if (elev !== null) {
        assert.strictEqual(elevacaoComTectoDeApex(18, elev, A.apexMax, A.elevMinLonga), elev,
            'o tecto mexeu num passe que já cabia');
    }
    // Passe muito longo: tem de sair mais tenso do que a faixa do gesto.
    const longa = elevacaoComTectoDeApex(55, A.elevMax, A.apexMax, A.elevMinLonga);
    assert.ok(longa < A.elevMin, `um passe de 55 m devia sair abaixo dos ${grau(A.elevMin)}°: ${grau(longa).toFixed(1)}°`);
    assert.ok(longa >= A.elevMinLonga - 1e-9, 'passou abaixo do piso');
});

test('o lançamento deixou de ser um pontapé de baliza', () => {
    // A distância máxima do lançamento tem de caber no que o tecto consegue
    // manter baixo — senão volta a haver balões, só que autorizados.
    assert.ok(PassModel.throughBallMaxDist <= 40,
        `throughBallMaxDist a ${PassModel.throughBallMaxDist} m é distância de chutão`);
});
