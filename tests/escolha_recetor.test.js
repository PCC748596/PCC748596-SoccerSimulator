/*
Escolha de quem recebe o passe. O PassTypeModel vive em js/config.js (script de
browser, sem exports), por isso é recortado do ficheiro e avaliado; o PassTypes
já exporta em Node.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const CONFIG = fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8');

global.CAMPO_COMP = 105;

function recortarConst(src, nome) {
    const i = src.indexOf('const ' + nome + ' = {');
    assert.ok(i >= 0, 'const ' + nome + ' nao encontrado');
    let nivel = 0;
    for (let k = src.indexOf('{', i); k < src.length; k++) {
        if (src[k] === '{') nivel++;
        else if (src[k] === '}' && --nivel === 0) return src.slice(i, k + 1) + ';';
    }
    assert.fail('chavetas desequilibradas em ' + nome);
}

const sandbox = { CAMPO_COMP: 105, Math };
vm.createContext(sandbox);
vm.runInContext(recortarConst(CONFIG, 'PassTypeModel') + '\nthis.M = PassTypeModel;', sandbox);
global.PassTypeModel = sandbox.M;

// O leque real, para maxPontosLeque não ser um 49 à mão.
global.PassCandidates = { arcos: 7, pontosPorArco: 7 };

const { PassTypes } = require('../js/pass_types.js');
const E = () => PassTypeModel.escolha;

test('as constantes da escolha existem', () => {
    for (const k of ['bonusSugerido', 'progressoRef', 'distanciaMax',
                     'raioPressao', 'notaMinima', 'tecnicaDrible', 'raioRecuo']) {
        assert.strictEqual(typeof E()[k], 'number', k + ' em falta');
    }
    for (const conj of ['pesosSemPressao', 'pesosSobPressao']) {
        for (const k of ['progresso', 'espaco', 'distancia']) {
            assert.strictEqual(typeof E()[conj][k], 'number', conj + '.' + k);
        }
    }
});

test('os pesos antigos desapareceram', () => {
    // Ficavam numa escala incomparável com a nova e voltariam a desequilibrar.
    for (const k of ['pesoProgresso', 'pesoEspaco', 'pesoDistancia']) {
        assert.strictEqual(E()[k], undefined, k + ' devia ter sido removido');
    }
});

test('maxPontosLeque sai do PassCandidates, não de um 49 à mão', () => {
    assert.strictEqual(PassTypes.maxPontosLeque(), 49);
    const antes = PassCandidates.arcos;
    PassCandidates.arcos = 3;
    assert.strictEqual(PassTypes.maxPontosLeque(), 21, 'devia acompanhar os arcos');
    PassCandidates.arcos = antes;
});

test('pressão é 1 com o adversário em cima e 0 no limite do raio', () => {
    assert.strictEqual(PassTypes.pressaoSobrePortador(0, 8), 1);
    assert.strictEqual(PassTypes.pressaoSobrePortador(8, 8), 0);
    assert.strictEqual(PassTypes.pressaoSobrePortador(40, 8), 0);
});

test('a pressão desce à medida que o adversário se afasta', () => {
    let anterior = Infinity;
    for (let d = 0; d <= 10; d += 0.5) {
        const p = PassTypes.pressaoSobrePortador(d, 8);
        assert.ok(p <= anterior + 1e-9, 'subiu em d=' + d);
        assert.ok(p >= 0 && p <= 1, 'fora de [0,1] em d=' + d);
        anterior = p;
    }
});

test('sem adversário à vista não há pressão', () => {
    assert.strictEqual(PassTypes.pressaoSobrePortador(Infinity, 8), 0);
});

test('os pesos nos extremos são os dois conjuntos declarados', () => {
    assert.deepStrictEqual(
        Object.assign({}, PassTypes.pesosPorPressao(0)),
        Object.assign({}, E().pesosSemPressao));
    assert.deepStrictEqual(
        Object.assign({}, PassTypes.pesosPorPressao(1)),
        Object.assign({}, E().pesosSobPressao));
});

test('a meia pressão os pesos são a média dos dois conjuntos', () => {
    const meio = PassTypes.pesosPorPressao(0.5);
    for (const k of ['progresso', 'espaco', 'distancia']) {
        const esperado = (E().pesosSemPressao[k] + E().pesosSobPressao[k]) / 2;
        assert.ok(Math.abs(meio[k] - esperado) < 1e-9, k + ': ' + meio[k]);
    }
});

test('sob pressão o espaço passa a pesar mais que o progresso', () => {
    const semP = PassTypes.pesosPorPressao(0);
    const sobP = PassTypes.pesosPorPressao(1);
    assert.ok(semP.progresso > semP.espaco, 'livre devia procurar progresso');
    assert.ok(sobP.espaco > sobP.progresso, 'pressionado devia procurar espaço');
});

test('a nota é monótona em cada termo', () => {
    const w = PassTypes.pesosPorPressao(0.5);
    let ant = -Infinity;
    for (let g = 0; g <= 1.0001; g += 0.1) {
        const n = PassTypes.notaCandidato(Math.min(g, 1), 0.5, 0.5, w);
        assert.ok(n >= ant - 1e-9, 'progresso desceu em ' + g);
        ant = n;
    }
    ant = -Infinity;
    for (let e = 0; e <= 1.0001; e += 0.1) {
        const n = PassTypes.notaCandidato(0.5, Math.min(e, 1), 0.5, w);
        assert.ok(n >= ant - 1e-9, 'espaço desceu em ' + e);
        ant = n;
    }
    ant = Infinity;
    for (let d = 0; d <= 1.0001; d += 0.1) {
        const n = PassTypes.notaCandidato(0.5, 0.5, Math.min(d, 1), w);
        assert.ok(n <= ant + 1e-9, 'distância subiu em ' + d);
        ant = d === 0 ? n : Math.min(ant, n);
    }
});

/*
O bug relatado: o portador na lateral toca ainda mais para a lateral, para um
companheiro isolado, tendo alguém à frente. O isolado ganhava porque o termo do
espaço era a CONTAGEM de pontos vivos do leque (até 49), e o progresso raramente
passava de 40 — escalas incomparáveis.

Frente marcado: 20 m de progresso, 10 pontos vivos, a 20 m.
Lateral isolado: 0 m de progresso, 49 pontos vivos, a 20 m.
*/
const frente = { g: 20 / 30, e: 10 / 49, d: 20 / 45 };
const lateral = { g: 0, e: 49 / 49, d: 20 / 45 };

test('regressão: sem pressão o passe à frente ganha ao isolado na lateral', () => {
    const w = PassTypes.pesosPorPressao(0);
    const nf = PassTypes.notaCandidato(frente.g, frente.e, frente.d, w);
    const nl = PassTypes.notaCandidato(lateral.g, lateral.e, lateral.d, w);
    assert.ok(nf > nl, 'frente=' + nf.toFixed(3) + ' lateral=' + nl.toFixed(3));
});

test('sob pressão o isolado volta a ganhar', () => {
    const w = PassTypes.pesosPorPressao(1);
    const nf = PassTypes.notaCandidato(frente.g, frente.e, frente.d, w);
    const nl = PassTypes.notaCandidato(lateral.g, lateral.e, lateral.d, w);
    assert.ok(nl > nf, 'frente=' + nf.toFixed(3) + ' lateral=' + nl.toFixed(3));
});
