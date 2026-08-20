/*
Saída de bola do guarda-redes: 80% pelos laterais, 20% chutão.

Corre as funções reais do player_bt.js num sandbox — são globais de browser,
por isso são recortadas do ficheiro em vez de importadas.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const CONFIG = fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8');
const BT = fs.readFileSync(path.join(raiz, 'js', 'bt', 'player_bt.js'), 'utf8');

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

// Sandbox com Math.random controlado.
function montar(valoresAleatorios) {
    let i = 0;
    const rnd = () => {
        const v = valoresAleatorios[i % valoresAleatorios.length];
        i++;
        return v;
    };
    const sandbox = { Math: Object.create(Math) };
    sandbox.Math.random = rnd;
    vm.createContext(sandbox);
    vm.runInContext(
        recortarConst(CONFIG, 'GoalkeeperDistribution') + '\n' +
        recortarFuncao(BT, 'decidirSaidaGK') + '\n' +
        recortarFuncao(BT, 'limparSaidaGK') + '\n' +
        recortarFuncao(BT, 'acharLateralParaSaida') + '\n' +
        'this.decidir = decidirSaidaGK; this.limpar = limparSaidaGK;' +
        'this.achar = acharLateralParaSaida; this.G = GoalkeeperDistribution;', sandbox);
    return sandbox;
}

const gk = () => ({ role: 'gk', hasBall: true, gkSaida: null });

test('a distribuição é 80/20', () => {
    const s = montar([0]);
    assert.strictEqual(s.G.laterais, 0.8);
    assert.strictEqual(s.G.chuteFrente, 0.2);
    assert.ok(Math.abs(s.G.laterais + s.G.chuteFrente - 1) < 1e-9);
});

test('abaixo de 0.8 sai pelos laterais, acima chuta', () => {
    const s = montar([0]);
    const casos = [[0, 'laterais'], [0.5, 'laterais'], [0.79, 'laterais'],
                   [0.8, 'chuteFrente'], [0.95, 'chuteFrente']];
    for (const [r, esperado] of casos) {
        s.Math.random = () => r;
        assert.strictEqual(s.decidir(gk()), esperado, 'random=' + r);
    }
});

test('varrendo [0,1) dá exactamente 80/20', () => {
    const s = montar([0]);
    const conta = { laterais: 0, chuteFrente: 0 };
    for (let i = 0; i < 1000; i++) {
        s.Math.random = () => i / 1000;
        conta[s.decidir(gk())]++;
    }
    assert.strictEqual(conta.laterais, 800);
    assert.strictEqual(conta.chuteFrente, 200);
});

test('a decisão é sorteada UMA vez por posse, não por frame', () => {
    const s = montar([0]);
    const p = gk();
    s.Math.random = () => 0.1;          // laterais
    assert.strictEqual(s.decidir(p), 'laterais');
    // frames seguintes: mesmo que o dado mude, a decisão mantém-se
    s.Math.random = () => 0.99;         // daria chuteFrente
    for (let f = 0; f < 50; f++) assert.strictEqual(s.decidir(p), 'laterais');
});

test('perder a bola limpa a decisão; a posse seguinte sorteia de novo', () => {
    const s = montar([0]);
    const p = gk();
    s.Math.random = () => 0.1;
    assert.strictEqual(s.decidir(p), 'laterais');

    p.hasBall = false;
    s.limpar(p);
    assert.strictEqual(p.gkSaida, null);

    p.hasBall = true;
    s.Math.random = () => 0.99;
    assert.strictEqual(s.decidir(p), 'chuteFrente');
});

test('com a bola na mão a decisão não é limpa', () => {
    const s = montar([0]);
    const p = gk();
    s.Math.random = () => 0.1;
    s.decidir(p);
    s.limpar(p);   // hasBall continua true
    assert.strictEqual(p.gkSaida, 'laterais');
});

/* ---------------------------------------------------------------- */

function jogador(pos, x, z) {
    return {
        pos,
        role: pos === 'GK' ? 'gk' : 'def',
        model: {
            position: {
                x, y: 0, z,
                distanceTo(o) { return Math.hypot(this.x - o.x, this.y - o.y, this.z - o.z); }
            }
        }
    };
}

function ctxCom(laterais, adversarios) {
    const p = jogador('GK', 0, -50);
    return { p, teammates: [p].concat(laterais), opponents: adversarios || [] };
}

test('escolhe o lateral, nunca um central', () => {
    const s = montar([0]);
    const lb = jogador('LB', -20, -30);
    const cb = jogador('CB', 0, -35);
    const achado = s.achar(ctxCom([lb, cb]));
    assert.strictEqual(achado, lb);
});

test('entre os dois laterais fica o mais desmarcado', () => {
    const s = montar([0]);
    const lb = jogador('LB', -20, -30);
    const rb = jogador('RB', 20, -30);
    // adversário colado ao LB
    const adv = jogador('CF', -22, -30);
    assert.strictEqual(s.achar(ctxCom([lb, rb], [adv])), rb);
});

test('lateral com adversário dentro da folga mínima não serve', () => {
    const s = montar([0]);
    const lb = jogador('LB', -20, -30);
    const adv = jogador('CF', -20, -27);   // 3m, abaixo dos 4 de folga
    assert.strictEqual(s.achar(ctxCom([lb], [adv])), null);
});

test('lateral fora do alcance não serve', () => {
    const s = montar([0]);
    const lb = jogador('LB', -20, 20);     // >45m do GK em -50
    assert.strictEqual(s.achar(ctxCom([lb])), null);
});

test('sem laterais no campo devolve null (cai no chutão)', () => {
    const s = montar([0]);
    assert.strictEqual(s.achar(ctxCom([jogador('CB', 0, -35)])), null);
});

test('o guarda-redes adversário não conta para a folga', () => {
    const s = montar([0]);
    const lb = jogador('LB', -20, -30);
    const gkAdv = jogador('GK', -20, -29);  // colado, mas é guarda-redes
    assert.strictEqual(s.achar(ctxCom([lb], [gkAdv])), lb);
});
