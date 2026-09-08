/*
NÃO SE MIRA SEMPRE O CANTO.

Medido em 3000 remates: o `miraDeRemate` devolvia `maxC` — o mesmo ponto, a
0.85 m do poste — em 100% deles. Duas consequências, as duas visíveis nos
lotes: o que ficava no alvo era bola de canto e o guarda-redes não lá chegava
(52% dos enquadrados acabavam em golo, real ~32%), e o que se desviava um pouco
saía pela linha (só 15-22% dos remates ficavam enquadrados, real ~33%).

`ShotModel.mira.fraccaoCanto` é a AMBIÇÃO da pontaria, por tipo de remate.

Corre com: node --test tests/remate_mira_ambicao.test.js
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcUtils = semCR(fs.readFileSync(path.join(raiz, 'js', 'utils.js'), 'utf8'));
const srcShoot = semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'shooting.js'), 'utf8'));

const LARGURA_BALIZA = 7.32, ALTURA_BALIZA = 2.44, ALTURA_CABECA = 1.72;
const Area = { profundidade: 16.5, meiaLargura: 20.16 };

function extrairObjecto(src, nome, extras) {
    const ini = src.indexOf(`const ${nome} = {`);
    if (ini < 0) throw new Error(`${nome} não encontrado`);
    const fim = src.indexOf(LF + '};', ini);
    const nomes = Object.keys(extras || {});
    return new Function(...nomes, `${src.slice(ini, fim + 3)}; return ${nome};`)
        (...nomes.map(n => extras[n]));
}
function extrairFuncao(src, nome) {
    const ini = src.indexOf(`function ${nome}(`);
    if (ini < 0) throw new Error(`${nome} não encontrada`);
    const fim = src.indexOf(LF + '}' + LF, ini);
    return src.slice(ini, fim + 3);
}

const ShotModel = extrairObjecto(srcShoot, 'ShotModel',
    { LARGURA_BALIZA, ALTURA_BALIZA, Area, ALTURA_CABECA, Math });
const stubs = { ShotModel, LARGURA_BALIZA, Math };
const miraDeRemate = new Function(...Object.keys(stubs),
    extrairFuncao(srcUtils, 'miraDeRemate') + '; return miraDeRemate;')(...Object.values(stubs));

const maxC = (LARGURA_BALIZA / 2) - ShotModel.mira.margemPoste;

test('a ambição da pontaria vive no config, e é uma faixa por tipo', () => {
    const F = ShotModel.mira.fraccaoCanto;
    assert.ok(F, 'fraccaoCanto desapareceu');
    for (const tipo of ['forca', 'colocado', 'rasteiro', 'chapeu']) {
        assert.ok(F[tipo], `${tipo} sem fracção de canto`);
        assert.ok(F[tipo].min >= 0 && F[tipo].max <= 1.0 && F[tipo].min < F[tipo].max,
            `${tipo}: a faixa tem de ser uma faixa dentro de [0, 1]`);
    }
    assert.ok(F.colocado.min > F.forca.min,
        'quem COLOCA procura mais o canto do que quem bate com força — é essa a troca');
    assert.ok(F.chapeu.max < F.forca.max, 'o chapéu passa por CIMA do guarda-redes, não pelo lado');
});

test('a mira já não é sempre o mesmo ponto', () => {
    const vistos = new Set();
    for (let i = 0; i <= 20; i++) {
        const m = miraDeRemate({ tipo: 'forca', gkX: 2.0, rnd: 0.9, rndX: i / 20 });
        vistos.add(Math.round(Math.abs(m.x) * 100));
    }
    assert.ok(vistos.size > 10,
        `só ${vistos.size} pontos diferentes em 21 remates — a pontaria voltou a ser um ponto só`);
});

test('o ponto mirado fica sempre DENTRO da baliza', () => {
    for (const tipo of ['forca', 'colocado', 'rasteiro', 'chapeu']) {
        for (let i = 0; i <= 10; i++) {
            const m = miraDeRemate({ tipo, gkX: 1.0, rnd: 0.3, rndX: i / 10 });
            assert.ok(Math.abs(m.x) <= maxC + 1e-9,
                `${tipo}: mirou ${m.x.toFixed(2)}, fora do ponto útil (${maxC.toFixed(2)})`);
            assert.ok(m.y > 0 && m.y <= ALTURA_BALIZA + 0.01, `${tipo}: altura ${m.y} fora da moldura`);
        }
    }
});

test('continua a mirar o lado CONTRÁRIO ao guarda-redes', () => {
    for (let i = 0; i <= 10; i++) {
        assert.ok(miraDeRemate({ tipo: 'colocado', gkX: 2.0, rnd: 0.2, rndX: i / 10 }).x < 0,
            'com o GK à direita, o remate tem de ir para a esquerda');
        assert.ok(miraDeRemate({ tipo: 'colocado', gkX: -2.0, rnd: 0.2, rndX: i / 10 }).x > 0,
            'e o simétrico');
    }
});

test('o sorteio do lado e o da ambição são independentes', () => {
    /*
    Se fossem o mesmo número, o remate ao canto esquerdo seria sempre também o
    mais ambicioso — e a mira ficava com um padrão em vez de variedade.
    */
    const corpo = extrairFuncao(srcUtils, 'miraDeRemate');
    assert.ok(corpo.includes('o.rndX'),
        'a fracção do canto voltou a usar o mesmo sorteio do lado e da altura');
});
