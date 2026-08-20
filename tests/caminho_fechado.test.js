/*
Caminho fechado: com 2+ adversários no corredor à frente, o portador joga
para o lado ou para trás em vez de insistir na frente.
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

// O PassModel refere constantes globais do config (altura da cabeca, etc.).
const sandbox = { Math, ALTURA_CABECA: 1.72 };
vm.createContext(sandbox);
vm.runInContext(
    recortarConst(CONFIG, 'PassModel') + '\n' +
    recortarFuncao(BT, 'adversariosAFrente') + '\n' +
    recortarFuncao(BT, 'caminhoFechadoAFrente') +
    '\nthis.contar = adversariosAFrente; this.fechado = caminhoFechadoAFrente;' +
    'this.M = PassModel;', sandbox);

const M = sandbox.M;

// Portador na origem, a atacar +Z. Adversários dados em [x, z].
function ctxCom(posicoes, dirZ) {
    return {
        p: { dirZ: dirZ === undefined ? 1 : dirZ, model: { position: { x: 0, z: 0 } } },
        opponents: posicoes.map(q => ({ role: 'mid', model: { position: { x: q[0], z: q[1] } } }))
    };
}

test('os limiares são 2 adversários, 14m, 6m de meia-largura', () => {
    assert.strictEqual(M.bloqueioMin, 2);
    assert.strictEqual(M.bloqueioDist, 14.0);
    assert.strictEqual(M.bloqueioLargura, 6.0);
});

test('dois adversários no corredor fecham o caminho', () => {
    assert.strictEqual(sandbox.contar(ctxCom([[0, 5], [2, 9]])), 2);
    assert.strictEqual(sandbox.fechado(ctxCom([[0, 5], [2, 9]])), true);
});

test('um só adversário não fecha nada', () => {
    assert.strictEqual(sandbox.fechado(ctxCom([[0, 5]])), false);
});

test('adversários ATRÁS não contam', () => {
    assert.strictEqual(sandbox.contar(ctxCom([[0, -5], [1, -9]])), 0);
});

test('adversários ao LADO, fora do corredor, não contam', () => {
    assert.strictEqual(sandbox.contar(ctxCom([[9, 5], [-8, 6]])), 0);
});

test('adversários longe demais não contam', () => {
    assert.strictEqual(sandbox.contar(ctxCom([[0, 20], [1, 30]])), 0);
});

test('o guarda-redes não fecha o caminho', () => {
    const ctx = ctxCom([[0, 5], [1, 8]]);
    ctx.opponents[1].role = 'gk';
    assert.strictEqual(sandbox.contar(ctx), 1);
});

test('vale igual para quem ataca no sentido oposto', () => {
    // A atacar -Z: "à frente" é z negativo.
    assert.strictEqual(sandbox.contar(ctxCom([[0, -5], [2, -9]], -1)), 2);
    assert.strictEqual(sandbox.contar(ctxCom([[0, 5], [2, 9]], -1)), 0);
});

test('as fronteiras do corredor são exactas', () => {
    assert.strictEqual(sandbox.contar(ctxCom([[6.0, 5]])), 1, '6m ainda conta');
    assert.strictEqual(sandbox.contar(ctxCom([[6.1, 5]])), 0, '6.1m ja nao');
    assert.strictEqual(sandbox.contar(ctxCom([[0, 14.0]])), 1, '14m ainda conta');
    assert.strictEqual(sandbox.contar(ctxCom([[0, 14.1]])), 0, '14.1m ja nao');
});

test('o ramo vem antes do drible e do passe para a frente', () => {
    const iFechado = BT.indexOf("seq('CaminhoFechado'");
    const iDriblar = BT.indexOf("seq('Driblar'");
    const iFrente = BT.indexOf("seq('PassarFrente'");
    assert.ok(iFechado > 0 && iDriblar > 0 && iFrente > 0);
    assert.ok(iFechado < iDriblar, 'devia vir antes do drible');
    assert.ok(iFechado < iFrente, 'devia vir antes do passe para a frente');
});

test('o ramo tenta o lado primeiro e depois trás', () => {
    const i = BT.indexOf("seq('CaminhoFechado'");
    const corpo = BT.slice(i, i + 600);
    assert.ok(/findPassSide\(ctx\)\s*\|\|\s*findPassBack\(ctx\)/.test(corpo),
        'devia tentar o lado e so depois tras');
});
