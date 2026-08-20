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
