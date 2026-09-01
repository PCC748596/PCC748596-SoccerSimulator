/*
PASSE CURTO RASANTE — abaixo de 30 m a bola não passa de 1 m do chão.

Pedido explícito: só passes acima de 30 m sobem mais de um metro. Um passe de
18 m saía com 3-4 m de apex — pelo ar sem nada no caminho que o justificasse.

O tecto vive em PassModel.passeArco.apexMaxCurto/distanciaAlto/elevMinCurto, e
é aplicado em js/fsm.js (ramo do passe pelo alto), que escolhe o par
tecto/piso conforme o alcance. Este teste espelha essa escolha e varre as
distâncias.

Corre com: node --test tests/passe_curto_rasante.test.js

(cabeçalho de carregamento igual ao de passe_alto_angulo.test.js)

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
const { velocidadeParaAlcance, resolverElevacaoPasse, tempoDeVooDoPasse,
    elevacaoParaTempoDeVoo, elevacaoComTectoDeApex } =
    new Function('BallPhysics', 'PassModel', 'THREE',
        `${codigo}; return { ${nomes.join(', ')} };`)(BallPhysics, PassModel, THREE);


const grau = r => r * 180 / Math.PI;
const B = PassModel.passeArco;

// Mesma escolha que js/fsm.js faz no ramo do passe pelo alto.
function elevacaoDoPasse(alcance, elevPedida) {
    const curto = alcance < B.distanciaAlto;
    return elevacaoComTectoDeApex(alcance, elevPedida,
        curto ? B.apexMaxCurto : B.apexMax,
        curto ? B.elevMinCurto : B.elevMinLonga);
}

function apexDe(alcance, elev) {
    const v = velocidadeParaAlcance(alcance, elev);
    const vy = v * Math.sin(elev);
    return (vy * vy) / (2 * BallPhysics.gravidade);
}

test('as constantes do tecto curto estão no config', () => {
    assert.strictEqual(B.apexMaxCurto, 1.0, 'apexMaxCurto devia ser 1 m');
    assert.strictEqual(B.distanciaAlto, 30.0, 'distanciaAlto devia ser 30 m');
    assert.ok(B.elevMinCurto < B.elevMinLonga,
        'elevMinCurto tem de ser mais baixo que elevMinLonga, senão o tecto de 1 m não cabe');
});

test('nenhum passe abaixo de 30 m passa de 1 m de altura', () => {
    const altos = [];
    for (let d = B.rasteiroMax + 0.5; d < B.distanciaAlto; d += 0.25) {
        // A elevação pedida pior possível: o topo da faixa do gesto.
        const e = elevacaoDoPasse(d, B.elevMax);
        const apex = apexDe(d, e);
        if (apex > B.apexMaxCurto + 0.02) {
            altos.push(`${d.toFixed(1)}m -> ${apex.toFixed(2)}m a ${grau(e).toFixed(1)}°`);
        }
    }
    assert.strictEqual(altos.length, 0, `passes curtos altos: ${altos.slice(0, 6).join(', ')}`);
});

test('o mesmo com a elevação que o encontro pede (o caminho mais alto)', () => {
    const altos = [];
    for (let d = B.rasteiroMax + 0.5; d < B.distanciaAlto; d += 0.5) {
        for (let t = 0.6; t <= 3.0; t += 0.2) {
            const pedida = elevacaoParaTempoDeVoo(d, t,
                PassModel.encontro.elevMin, PassModel.encontro.elevMax);
            const apex = apexDe(d, elevacaoDoPasse(d, pedida));
            if (apex > B.apexMaxCurto + 0.02) {
                altos.push(`${d.toFixed(1)}m/${t.toFixed(1)}s -> ${apex.toFixed(2)}m`);
            }
        }
    }
    assert.strictEqual(altos.length, 0, `encontro curto alto: ${altos.slice(0, 6).join(', ')}`);
});

test('acima de 30 m o passe continua a poder subir (o tecto largo é outro)', () => {
    const apex = apexDe(40, elevacaoDoPasse(40, B.elevMax));
    assert.ok(apex > B.apexMaxCurto,
        `passe de 40 m ficou por ${apex.toFixed(2)}m — o tecto curto está a apanhar os longos`);
    assert.ok(apex <= B.apexMax + 0.02,
        `passe de 40 m subiu ${apex.toFixed(2)}m, acima do apexMax`);
});
