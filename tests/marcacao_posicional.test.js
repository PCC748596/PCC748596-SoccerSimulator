/*
Marcação posicional e o tecto do bloco. As constantes e as funções puras vivem
em js/config.js (script de browser, sem exports), por isso são recortadas do
ficheiro e avaliadas num sandbox.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const CONFIG = fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8');

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

function montarMentalidade() {
    const sandbox = { Math: Math };
    vm.createContext(sandbox);
    vm.runInContext(
        'const CAMPO_COMP = 106;\n' +
        recortarConst(CONFIG, 'MentalidadeModel') + '\n' +
        'this.M = MentalidadeModel;', sandbox);
    return sandbox.M;
}

const ORDEM = ['muito_defensiva', 'defesa', 'balanceado', 'ataque', 'muito_ofensiva'];

test('as cinco mentalidades têm tectoBloco', () => {
    const M = montarMentalidade();
    for (const nome of ORDEM) {
        assert.ok(M[nome], 'falta a mentalidade ' + nome);
        assert.strictEqual(typeof M[nome].tectoBloco, 'number', nome + '.tectoBloco');
    }
});

test('o tecto cresce da mais defensiva para a mais ofensiva', () => {
    const M = montarMentalidade();
    for (let i = 1; i < ORDEM.length; i++) {
        assert.ok(M[ORDEM[i]].tectoBloco > M[ORDEM[i - 1]].tectoBloco,
            ORDEM[i] + ' devia ser maior que ' + ORDEM[i - 1]);
    }
});

test('equilibrado trava exactamente no meio-campo', () => {
    const M = montarMentalidade();
    assert.strictEqual(M.balanceado.tectoBloco, 0,
        'era este o pedido: bloco médio, a partir do meio-campo');
});

test('o tecto acompanha o sinal do blocoZ', () => {
    const M = montarMentalidade();
    for (const nome of ORDEM) {
        const b = M[nome].blocoZ, t = M[nome].tectoBloco;
        if (b === 0) assert.strictEqual(t, 0, nome);
        else assert.ok(Math.sign(b) === Math.sign(t), nome + ': blocoZ ' + b + ', tecto ' + t);
    }
});

test('o TeamShape já não tem pressaoLineCap', () => {
    // Se voltar, há dois donos do mesmo tecto e voltam a divergir. Testa-se a
    // DEFINIÇÃO, não a string: o comentário do MentalidadeModel menciona-o de
    // propósito, para registar de onde veio o tecto.
    const sandbox = { Math: Math };
    vm.createContext(sandbox);
    vm.runInContext(
        'const CAMPO_COMP = 106;\nconst CAMPO_LARG = 68;\n' +
        recortarConst(CONFIG, 'TeamShape') + '\nthis.T = TeamShape;', sandbox);
    assert.strictEqual(sandbox.T.pressaoLineCap, undefined);
});

test('ninguém em js/ ainda lê o pressaoLineCap', () => {
    const alvos = ['config.js', 'bt/team_bt.js'];
    for (const f of alvos) {
        const src = fs.readFileSync(path.join(raiz, 'js', f), 'utf8');
        // Uma LEITURA é `pressaoLineCap[` ou `pressaoLineCap.`; as menções em
        // comentário não têm nem uma coisa nem outra a seguir.
        assert.ok(!/pressaoLineCap\s*[\[.]/.test(src), f + ' ainda lê o pressaoLineCap');
    }
});

/* ------------------------------------------------------------------
   Funções puras da marcação posicional.
   ------------------------------------------------------------------ */

function recortarFuncao(src, nome) {
    const i = src.indexOf('function ' + nome + '(');
    assert.ok(i >= 0, 'function ' + nome + ' nao encontrada');
    let nivel = 0;
    for (let k = src.indexOf('{', i); k < src.length; k++) {
        if (src[k] === '{') nivel++;
        else if (src[k] === '}' && --nivel === 0) return src.slice(i, k + 1);
    }
    assert.fail('chavetas desequilibradas em ' + nome);
}

function montarMarcacao() {
    const sandbox = { Math: Math };
    vm.createContext(sandbox);
    vm.runInContext(
        'const CAMPO_COMP = 106;\n' +
        recortarConst(CONFIG, 'MarkingModel') + '\n' +
        recortarFuncao(CONFIG, 'pontoDeMarcacao') + '\n' +
        'this.M = MarkingModel;' +
        'this.ponto = pontoDeMarcacao;', sandbox);
    return sandbox;
}

const adv = (x, z, id) => ({ id: id, model: { position: { x: x, z: z } } });

test('as constantes da marcação existem', () => {
    const s = montarMarcacao();
    assert.strictEqual(typeof s.M.raioSetor, 'number');
    assert.strictEqual(typeof s.M.histerese, 'number');
    for (const k of ['low', 'balanced', 'high']) {
        assert.strictEqual(typeof s.M.distanciaPorPressao[k], 'number', k);
    }
});

test('mais pressão é marcar mais perto', () => {
    const s = montarMarcacao();
    const d = s.M.distanciaPorPressao;
    assert.ok(d.high < d.balanced, 'high devia ser menor que balanced');
    assert.ok(d.balanced < d.low, 'balanced devia ser menor que low');
});

test('o ponto fica entre o adversário e a própria baliza', () => {
    const s = montarMarcacao();
    // Baliza própria em z = -53; adversário em z = 0; slot em cima dele.
    const pt = s.ponto(0, 0, 0, 0.0001, -53, 3.0, 10.0);
    assert.ok(pt.z < 0.0001, 'devia estar do lado da própria baliza: z = ' + pt.z);
});

test('o ponto fica à distância pedida do adversário', () => {
    const s = montarMarcacao();
    const dist = 3.0;
    const pt = s.ponto(0, -10, 0, 0, -53, dist, 50.0);
    const d = Math.hypot(pt.x - 0, pt.z - 0);
    assert.ok(Math.abs(d - dist) < 1e-6, 'distância ao homem = ' + d);
});

test('nunca desloca mais do que biasMax a partir do slot', () => {
    const s = montarMarcacao();
    const biasMax = 4.0;
    // Adversário a 30 m do slot: sem o limite, o jogador saltava para lá.
    const pt = s.ponto(0, 0, 0, 30, -53, 3.0, biasMax);
    const desvio = Math.hypot(pt.x - 0, pt.z - 0);
    assert.ok(desvio <= biasMax + 1e-6, 'desviou ' + desvio + ', limite ' + biasMax);
});

test('com biasMax zero devolve o slot intacto', () => {
    const s = montarMarcacao();
    const pt = s.ponto(5, -7, 20, 10, -53, 3.0, 0);
    assert.ok(Math.abs(pt.x - 5) < 1e-9, 'x = ' + pt.x);
    assert.ok(Math.abs(pt.z - (-7)) < 1e-9, 'z = ' + pt.z);
});

test('adversário em cima do slot não dá NaN', () => {
    const s = montarMarcacao();
    const pt = s.ponto(4, 4, 4, 4, -53, 3.0, 10.0);
    assert.ok(Number.isFinite(pt.x), 'x = ' + pt.x);
    assert.ok(Number.isFinite(pt.z), 'z = ' + pt.z);
});

test('menos pressão deixa o ponto mais longe do homem', () => {
    const s = montarMarcacao();
    const D = s.M.distanciaPorPressao;
    const alto = s.ponto(0, -10, 0, 0, -53, D.high, 50.0);
    const baixo = s.ponto(0, -10, 0, 0, -53, D.low, 50.0);
    const dAlto = Math.hypot(alto.x, alto.z);
    const dBaixo = Math.hypot(baixo.x, baixo.z);
    assert.ok(dBaixo > dAlto, 'low=' + dBaixo + ' devia ser maior que high=' + dAlto);
});
