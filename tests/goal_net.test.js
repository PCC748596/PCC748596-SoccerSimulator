/*
Ondulação da rede da baliza. A matemática vive em js/goal_net.js (script de
browser, sem exports) e as constantes em js/config.js, por isso são recortadas
dos ficheiros e avaliadas num sandbox. Nada disto usa THREE, de propósito.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const CONFIG = fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8');
const NET = fs.readFileSync(path.join(raiz, 'js', 'goal_net.js'), 'utf8');

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

// Recorta um método escrito como `nome: function (...) { ... }`.
function recortarMetodo(src, nome) {
    const i = src.indexOf('    ' + nome + ': function (');
    assert.ok(i >= 0, 'metodo ' + nome + ' nao encontrado');
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
        recortarConst(CONFIG, 'GoalNet') + '\n' +
        'const NetWave = {\n' +
        recortarMetodo(NET, 'deslocamento') + ',\n' +
        recortarMetodo(NET, 'amplitudeDoImpacto') + '\n' +
        '};\n' +
        'this.W = NetWave; this.G = GoalNet;', sandbox);
    return sandbox;
}

test('as constantes da onda existem', () => {
    const s = montar();
    for (const k of ['segmentosU', 'segmentosV', 'segmentosLateralU',
                     'duracaoOnda', 'amplitudeMax', 'frequencia',
                     'ondasPorPano', 'velocidadeCheia']) {
        assert.strictEqual(typeof s.G[k], 'number', k + ' em falta');
        assert.ok(s.G[k] > 0, k + ' devia ser positivo');
    }
});

test('a física da bola ficou intacta', () => {
    const s = montar();
    assert.strictEqual(s.G.restituicao, 0.12);
    assert.strictEqual(s.G.atrito, 0.72);
    assert.strictEqual(s.G.profTopo, 0.8);
    assert.strictEqual(s.G.profBase, 2.0);
});

test('a rede parte do repouso: deslocamento nulo em t=0', () => {
    const s = montar();
    for (const u of [0, 0.3, 0.7, 1]) {
        for (const v of [0, 0.5, 1]) {
            assert.ok(Math.abs(s.W.deslocamento(0, u, v, 1.0)) < 1e-9,
                'u=' + u + ' v=' + v + ' deu ' + s.W.deslocamento(0, u, v, 1.0));
        }
    }
});

test('a envolvente decai com o tempo', () => {
    const s = montar();
    // Máximo de |desloc| numa janela, varrendo t finamente.
    const pico = (t0, t1) => {
        let m = 0;
        for (let t = t0; t <= t1; t += 0.005) {
            m = Math.max(m, Math.abs(s.W.deslocamento(t, 0.5, 0.5, 1.0)));
        }
        return m;
    };
    const cedo = pico(0.2, 1.0);
    const tarde = pico(3.0, 3.8);
    assert.ok(tarde < cedo, 'cedo=' + cedo + ' tarde=' + tarde);
});

test('no fim da duração já quase não se mexe', () => {
    const s = montar();
    const d = Math.abs(s.W.deslocamento(s.G.duracaoOnda, 0.5, 0.5, 1.0));
    assert.ok(d < 0.02 * s.G.amplitudeMax,
        'ainda ' + d + ' aos ' + s.G.duracaoOnda + 's');
});

test('o deslocamento é linear na amplitude', () => {
    const s = montar();
    const a = s.W.deslocamento(0.4, 0.3, 0.6, 0.5);
    const b = s.W.deslocamento(0.4, 0.3, 0.6, 1.0);
    assert.ok(Math.abs(b - 2 * a) < 1e-9, 'a=' + a + ' b=' + b);
});

/*
É isto que faz o pano ONDULAR em vez de subir e descer em bloco: pontos
diferentes do pano estão em fases diferentes no mesmo instante.
*/
test('pontos diferentes do pano estão em fases diferentes', () => {
    const s = montar();
    const t = 0.35;
    const perto = s.W.deslocamento(t, 0.0, 0.0, 1.0);
    const longe = s.W.deslocamento(t, 1.0, 1.0, 1.0);
    assert.ok(Math.abs(perto - longe) > 1e-3,
        'os dois cantos moviam-se juntos: ' + perto + ' vs ' + longe);
});

test('amplitude cresce com a velocidade do impacto e satura em 1', () => {
    const s = montar();
    const meio = s.W.amplitudeDoImpacto(s.G.velocidadeCheia / 2);
    const cheio = s.W.amplitudeDoImpacto(s.G.velocidadeCheia);
    const acima = s.W.amplitudeDoImpacto(s.G.velocidadeCheia * 3);
    assert.ok(meio > 0 && meio < cheio, 'meio=' + meio + ' cheio=' + cheio);
    assert.strictEqual(cheio, 1);
    assert.strictEqual(acima, 1);
});

test('impacto sem velocidade não abana a rede, e nunca dá negativo', () => {
    const s = montar();
    assert.strictEqual(s.W.amplitudeDoImpacto(0), 0);
    assert.ok(s.W.amplitudeDoImpacto(-5) >= 0, 'devia ser 0, não negativo');
});

/* ------------------------------------------------------------------
   A grelha bilinear que substitui o quad de quatro vértices.
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

function montarGrelha() {
    const sandbox = { Math: Math, Float32Array: Float32Array };
    vm.createContext(sandbox);
    vm.runInContext(
        recortarConst(CONFIG, 'GoalNet') + '\n' +
        recortarFuncao(NET, 'gerarGrelhaRede') + '\n' +
        'this.gerar = gerarGrelhaRede; this.G = GoalNet;', sandbox);
    return sandbox;
}

// Os quatro cantos do pano de trás de uma baliza, como em match.js.
const P1 = [-3.66, 2.44, 0.8];   // u=0, v=0
const P2 = [3.66, 2.44, 0.8];    // u=1, v=0
const P3 = [-3.66, 0, 2.0];      // u=0, v=1
const P4 = [3.66, 0, 2.0];       // u=1, v=1

function vertice(g, i) {
    return [g.posicoes[i * 3], g.posicoes[i * 3 + 1], g.posicoes[i * 3 + 2]];
}

test('a grelha tem o número certo de vértices e índices', () => {
    const s = montarGrelha();
    const nu = 4, nv = 3;
    const g = s.gerar(P1, P2, P3, P4, 30, 10, nu, nv);
    assert.strictEqual(g.posicoes.length, (nu + 1) * (nv + 1) * 3);
    assert.strictEqual(g.uvs.length, (nu + 1) * (nv + 1) * 2);
    assert.strictEqual(g.indices.length, nu * nv * 6);
});

test('os quatro cantos ficam exactamente onde estavam', () => {
    const s = montarGrelha();
    const nu = 4, nv = 3;
    const g = s.gerar(P1, P2, P3, P4, 30, 10, nu, nv);

    const idx = (iu, iv) => iv * (nu + 1) + iu;
    const perto = (a, b, onde) => {
        for (let k = 0; k < 3; k++) {
            assert.ok(Math.abs(a[k] - b[k]) < 1e-6,
                onde + ' componente ' + k + ': ' + a[k] + ' != ' + b[k]);
        }
    };

    perto(vertice(g, idx(0, 0)), P1, 'p1');
    perto(vertice(g, idx(nu, 0)), P2, 'p2');
    perto(vertice(g, idx(0, nv)), P3, 'p3');
    perto(vertice(g, idx(nu, nv)), P4, 'p4');
});

test('um ponto interior cai dentro da envolvente dos cantos', () => {
    const s = montarGrelha();
    const nu = 4, nv = 4;
    const g = s.gerar(P1, P2, P3, P4, 30, 10, nu, nv);
    const meio = vertice(g, 2 * (nu + 1) + 2);

    const eixos = [[P1[0], P2[0], P3[0], P4[0]],
                   [P1[1], P2[1], P3[1], P4[1]],
                   [P1[2], P2[2], P3[2], P4[2]]];
    for (let k = 0; k < 3; k++) {
        const lo = Math.min(...eixos[k]), hi = Math.max(...eixos[k]);
        assert.ok(meio[k] >= lo - 1e-6 && meio[k] <= hi + 1e-6,
            'componente ' + k + ' = ' + meio[k] + ' fora de [' + lo + ',' + hi + ']');
    }
});

test('o centro da grelha é a média dos quatro cantos', () => {
    const s = montarGrelha();
    // Com nu e nv pares, o vértice do meio está em u=v=0.5.
    const nu = 2, nv = 2;
    const g = s.gerar(P1, P2, P3, P4, 30, 10, nu, nv);
    const meio = vertice(g, 1 * (nu + 1) + 1);
    for (let k = 0; k < 3; k++) {
        const esperado = (P1[k] + P2[k] + P3[k] + P4[k]) / 4;
        assert.ok(Math.abs(meio[k] - esperado) < 1e-6,
            'componente ' + k + ': ' + meio[k] + ' != ' + esperado);
    }
});

test('as UVs vão de 0 às repetições pedidas', () => {
    const s = montarGrelha();
    const nu = 3, nv = 2, repX = 30, repY = 10;
    const g = s.gerar(P1, P2, P3, P4, repX, repY, nu, nv);
    const idx = (iu, iv) => iv * (nu + 1) + iu;

    assert.strictEqual(g.uvs[idx(0, 0) * 2], 0);
    assert.strictEqual(g.uvs[idx(0, 0) * 2 + 1], 0);
    assert.strictEqual(g.uvs[idx(nu, 0) * 2], repX);
    assert.strictEqual(g.uvs[idx(0, nv) * 2 + 1], repY);
});

test('todos os índices apontam para vértices que existem', () => {
    const s = montarGrelha();
    const nu = 5, nv = 4;
    const g = s.gerar(P1, P2, P3, P4, 30, 10, nu, nv);
    const nVertices = (nu + 1) * (nv + 1);
    for (const i of g.indices) {
        assert.ok(Number.isInteger(i) && i >= 0 && i < nVertices, 'índice ' + i);
    }
});

test('a grelha mais fina que existe é um único quad', () => {
    const s = montarGrelha();
    const g = s.gerar(P1, P2, P3, P4, 30, 10, 1, 1);
    assert.strictEqual(g.posicoes.length, 4 * 3);
    assert.strictEqual(g.indices.length, 6);
});
