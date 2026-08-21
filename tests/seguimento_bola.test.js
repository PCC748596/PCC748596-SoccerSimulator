/*
Seguimento da bola no eixo Z (comprimento) — não é "momentum".

MOMENTUM é o lado do campo onde o jogo está a acontecer: eixo X, largura,
sectores Left/Right/Center. Chamava-se "momentumZ" a outra coisa — a posição
longitudinal da bola suavizada, que dá o centro do bloco — e por baixo do nome
tinha constantes de tempo de MOMENTUM (2.5 s a defender, 4.0 s com a bola a
recuar). Um seguimento com 2.5 s de constante fica 25 m atrás de uma bola a
10 m/s: era isso que punha os dois rectângulos do TeamBT atrás da jogada.

Aqui fixa-se o que o seguimento tem de fazer: seguir depressa, e saltar quando
a bola é REPOSTA (golo, canto, lançamento) em vez de deslizar pelo campo.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const UTILS = fs.readFileSync(path.join(raiz, 'js', 'utils.js'), 'utf8');

function recortarFuncao(src, nome) {
    const i = src.indexOf('function ' + nome + '(');
    assert.ok(i >= 0, 'funcao ' + nome + ' nao encontrada em utils.js');
    let nivel = 0;
    for (let k = src.indexOf('{', i); k < src.length; k++) {
        if (src[k] === '{') nivel++;
        else if (src[k] === '}' && --nivel === 0) return src.slice(i, k + 1);
    }
    assert.fail('chavetas desequilibradas em ' + nome);
}

const sandbox = { Math: Math };
vm.createContext(sandbox);
vm.runInContext(recortarFuncao(UTILS, 'seguirBola') + '\nthis.f = seguirBola;', sandbox);
const seguirBola = sandbox.f;

const K = 3.0;      // constante de tempo 1/3 s
const DT = 1 / 60;

test('bola reposta: o centro salta lá, não desliza', () => {
    assert.strictEqual(seguirBola(-40, 0, K, DT, true), 0);
});

test('um passo aproxima do alvo sem o ultrapassar', () => {
    const novo = seguirBola(0, 10, K, DT, false);
    assert.ok(novo > 0 && novo < 10);
});

test('meio segundo chega a mais de metade do caminho', () => {
    let z = 0;
    for (let i = 0; i < 30; i++) z = seguirBola(z, 20, K, DT, false);
    assert.ok(z > 10, 'seguimento demasiado lento: ' + z.toFixed(1) + ' m de 20');
});

test('o atraso a velocidade constante é o esperado para a constante', () => {
    // Bola a 10 m/s durante 3 s: o atraso estabiliza em v/k = 3.33 m.
    let z = 0, bola = 0;
    for (let i = 0; i < 180; i++) {
        bola += 10 * DT;
        z = seguirBola(z, bola, K, DT, false);
    }
    const atraso = bola - z;
    assert.ok(atraso > 2.5 && atraso < 4.0, 'atraso fora do esperado: ' + atraso.toFixed(2) + ' m');
});

test('segue igual nos dois sentidos', () => {
    // A assimetria antiga (4 s a recuar, 0.67 s a progredir) fazia o bloco
    // colar-se ao ataque e arrastar-se no recuo.
    const paraFrente = seguirBola(0, 10, K, DT, false) - 0;
    const paraTras = 0 - seguirBola(0, -10, K, DT, false);
    assert.ok(Math.abs(paraFrente - paraTras) < 1e-9);
});

test('dt enorme (aba em segundo plano) não faz o valor explodir', () => {
    const z = seguirBola(-40, 20, K, 5.0, false);
    assert.ok(z > 19 && z <= 20);
});
