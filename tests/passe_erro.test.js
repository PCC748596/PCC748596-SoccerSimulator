/*
Erro de execucao do passe.

Antes disto o passe saia SEMPRE na direccao exacta do alvo: o unico erro era
no peso (erroPesoMax, uniforme). Nenhuma bola se perdia por ter saido torta,
e as perdas de posse vinham so de decisao ma ou de dominio falhado — parte
de porque o jogo parecia mecanico.

A aleatoriedade e INJECTADA: `amostraGaussiana(rnd)` recebe a fonte de
numeros. E o que permite testar a forma da distribuicao em vez de esperar
que ela se porte bem.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const CONFIG = fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8');
const UTILS = fs.readFileSync(path.join(raiz, 'js', 'utils.js'), 'utf8');

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

function montar() {
    const sandbox = { Math: Math };
    vm.createContext(sandbox);
    vm.runInContext(
        recortarConst(CONFIG, 'PassErrorModel') + '\n' +
        recortarFuncao(UTILS, 'sigmaDePasse') + '\n' +
        recortarFuncao(UTILS, 'amostraGaussiana') + '\n' +
        recortarFuncao(UTILS, 'rodarNoPlano') + '\n' +
        'this.M = PassErrorModel;' +
        'this.sigma = sigmaDePasse;' +
        'this.gauss = amostraGaussiana;' +
        'this.rodar = rodarNoPlano;', sandbox);
    return sandbox;
}

const semPressao = (extra) => Object.assign({
    passSkill: 50, tecSkill: 50, distAdversario: Infinity, cosCorpo: 1
}, extra || {});

/* --- sigma por atributos ------------------------------------------------ */

test('mais skill de passe, menos dispersão', () => {
    const s = montar();
    const bom = s.sigma(semPressao({ passSkill: 90 }));
    const mau = s.sigma(semPressao({ passSkill: 20 }));
    assert.ok(bom < mau, 'bom=' + bom.toFixed(4) + ' mau=' + mau.toFixed(4));
});

test('a técnica também conta', () => {
    const s = montar();
    const bom = s.sigma(semPressao({ tecSkill: 90 }));
    const mau = s.sigma(semPressao({ tecSkill: 20 }));
    assert.ok(bom < mau, 'a TEC devia reduzir a dispersao');
});

test('nem o melhor passador do mundo é perfeito', () => {
    const s = montar();
    assert.ok(s.sigma(semPressao({ passSkill: 100, tecSkill: 100 })) > 0,
        'sigma zero faz o passe voltar a ser exacto');
});

test('sigma fica dentro de limites sãos', () => {
    const s = montar();
    for (const skill of [0, 25, 50, 75, 100]) {
        const v = s.sigma(semPressao({ passSkill: skill, tecSkill: skill }));
        assert.ok(v > 0 && v < 0.35,
            'sigma de ' + v.toFixed(4) + ' rad em skill ' + skill + ' (0.35 rad = 20 graus)');
    }
});

/* --- a amostra ---------------------------------------------------------- */

test('a gaussiana tem média perto de zero e desvio perto de 1', () => {
    const s = montar();
    // PRNG semeado: o teste tem de dar sempre o mesmo.
    let x = 12345 >>> 0;
    const rnd = () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };

    const amostras = [];
    for (let i = 0; i < 20000; i++) amostras.push(s.gauss(rnd));
    const media = amostras.reduce((a, b) => a + b, 0) / amostras.length;
    const dp = Math.sqrt(amostras.reduce((a, b) => a + (b - media) * (b - media), 0) / amostras.length);

    assert.ok(Math.abs(media) < 0.05, 'media=' + media.toFixed(3));
    assert.ok(Math.abs(dp - 1) < 0.05, 'desvio=' + dp.toFixed(3));
});

test('a gaussiana tem cauda: valores grandes acontecem, e são raros', () => {
    const s = montar();
    let x = 999 >>> 0;
    const rnd = () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };

    let acima2 = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) if (Math.abs(s.gauss(rnd)) > 2) acima2++;
    const frac = acima2 / n;
    // Numa normal, P(|z| > 2) ~ 4.6%. E a diferenca para uma uniforme, onde
    // seria 0% — a cauda e o que faz o passe ocasionalmente desastroso.
    assert.ok(frac > 0.02 && frac < 0.08, 'fraccao acima de 2 sigma: ' + frac.toFixed(3));
});

/* --- rotação ------------------------------------------------------------ */

test('rodar zero não mexe', () => {
    const s = montar();
    const r = s.rodar(3, 4, 0);
    assert.ok(Math.abs(r.x - 3) < 1e-9 && Math.abs(r.z - 4) < 1e-9);
});

test('rodar preserva o comprimento', () => {
    const s = montar();
    const r = s.rodar(3, 4, 0.4);
    assert.ok(Math.abs(Math.hypot(r.x, r.z) - 5) < 1e-9,
        'comprimento ' + Math.hypot(r.x, r.z).toFixed(6));
});

test('rodar 90 graus troca os eixos', () => {
    const s = montar();
    const r = s.rodar(1, 0, Math.PI / 2);
    assert.ok(Math.abs(r.x) < 1e-9 && Math.abs(r.z + 1) < 1e-9,
        'deu (' + r.x.toFixed(3) + ', ' + r.z.toFixed(3) + ')');
});

/* ------------------------------------------------------------------
   Pressao e angulo do corpo.
   ------------------------------------------------------------------ */

function montarForca() {
    const sandbox = { Math: Math };
    vm.createContext(sandbox);
    vm.runInContext(
        recortarConst(CONFIG, 'PassErrorModel') + '\n' +
        recortarFuncao(UTILS, 'fatorForcaSobPressao') + '\n' +
        'this.forca = fatorForcaSobPressao;', sandbox);
    return sandbox.forca;
}

test('adversário em cima aumenta a dispersão', () => {
    const s = montar();
    const livre = s.sigma(semPressao());
    const apertado = s.sigma(semPressao({ distAdversario: 0.8 }));
    assert.ok(apertado > livre * 1.4,
        'livre=' + livre.toFixed(4) + ' apertado=' + apertado.toFixed(4));
});

test('a pressão desaparece gradualmente com a distância', () => {
    const s = montar();
    const perto = s.sigma(semPressao({ distAdversario: 1.0 }));
    const medio = s.sigma(semPressao({ distAdversario: 2.5 }));
    const longe = s.sigma(semPressao({ distAdversario: 10.0 }));
    assert.ok(perto > medio && medio > longe, 'nao e gradual');
    assert.ok(Math.abs(longe - s.sigma(semPressao())) < 1e-9,
        'fora do raio de pressao devia ser igual a estar livre');
});

test('passar de costas dispersa mais do que passar de frente', () => {
    const s = montar();
    const frente = s.sigma(semPressao({ cosCorpo: 1 }));
    const lado = s.sigma(semPressao({ cosCorpo: 0 }));
    const costas = s.sigma(semPressao({ cosCorpo: -1 }));
    assert.ok(costas > lado && lado > frente,
        'frente=' + frente.toFixed(4) + ' lado=' + lado.toFixed(4) + ' costas=' + costas.toFixed(4));
});

test('pressão e costas somam-se', () => {
    const s = montar();
    const so_costas = s.sigma(semPressao({ cosCorpo: -1 }));
    const ambos = s.sigma(semPressao({ cosCorpo: -1, distAdversario: 0.8 }));
    assert.ok(ambos > so_costas, 'o pior caso devia ser o pior de todos');
});

test('nem no pior caso a dispersão fica absurda', () => {
    const s = montar();
    const pior = s.sigma({ passSkill: 0, tecSkill: 0, distAdversario: 0, cosCorpo: -1 });
    assert.ok(pior <= 0.35 + 1e-9, 'sigma de ' + pior.toFixed(3) + ' rad devia respeitar o sigmaTecto (0.35 rad)');
});

test('a força cai sob pressão, e nunca abaixo do mínimo', () => {
    const forca = montarForca();
    assert.strictEqual(forca(Infinity), 1.0);
    assert.strictEqual(forca(10.0), 1.0);
    const apertado = forca(0.5);
    assert.ok(apertado < 1.0, 'sob pressao a forca devia cair');
    assert.ok(apertado >= 0.85 - 1e-9, 'caiu abaixo do minimo: ' + apertado);
});
