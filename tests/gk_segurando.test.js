/*
Guarda-redes com a bola na mão: deixa de ficar estátua.

Ficava imóvel os 5 a 8 segundos todos — a FSM não corre neste estado (só é
chamada no ramo 'idle') e a velocidade era zerada no fim do updateGK. Agora
anda até gkAlvoSegurando e pode relançar mais cedo se aparecer linha.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const CONFIG = fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8');
const PLAYER = fs.readFileSync(path.join(raiz, 'js', 'player.js'), 'utf8');

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
        'const ALTURA_CABECA = 1.6;\nconst LARGURA_BALIZA = 7.32;\n' +
        recortarConst(CONFIG, 'GoalkeeperPose') + '\n' +
        recortarFuncao(CONFIG, 'gkAlvoSegurando') + '\n' +
        recortarFuncao(CONFIG, 'gkPodeLancar') + '\n' +
        'this.P = GoalkeeperPose; this.alvo = gkAlvoSegurando;' +
        'this.podeLancar = gkPodeLancar;', sandbox);
    return sandbox;
}

// TeamA defende em z = -53 e ataca para +z; TeamB o contrário.
const GOL_A = -53, DIR_A = 1;
const GOL_B = 53, DIR_B = -1;

test('as constantes do segurar existem e são coerentes', () => {
    const s = montar();
    for (const k of ['segurarAvanco', 'segurarVel', 'segurarMinimo', 'segurarDur']) {
        assert.strictEqual(typeof s.P[k], 'number', k + ' em falta');
        assert.ok(s.P[k] > 0, k + ' devia ser positivo');
    }
    assert.ok(s.P.segurarMinimo < s.P.segurarDur,
        'não pode exigir mais tempo do que o que ele segura');
});

test('nunca sai da grande área com a bola na mão', () => {
    // 16.5 m é a linha da grande área. Com a bola na mão, fora dela é falta.
    const s = montar();
    assert.ok(s.P.segurarAvanco < 16.5,
        'avança ' + s.P.segurarAvanco + ' m, e a área tem 16.5');
});

test('o alvo fica à frente da própria baliza, à distância pedida', () => {
    const s = montar();
    const a = s.alvo(GOL_A, DIR_A);
    assert.strictEqual(a.x, 0, 'vai para o eixo');
    assert.ok(Math.abs((a.z - GOL_A) * DIR_A - s.P.segurarAvanco) < 1e-9,
        'avanço = ' + ((a.z - GOL_A) * DIR_A));
});

test('espelha para a equipa que ataca ao contrário', () => {
    const s = montar();
    const a = s.alvo(GOL_A, DIR_A);
    const b = s.alvo(GOL_B, DIR_B);
    assert.ok(a.z < 0 && b.z > 0, 'a=' + a.z + ' b=' + b.z);
    assert.ok(Math.abs((a.z - GOL_A) * DIR_A - (b.z - GOL_B) * DIR_B) < 1e-9,
        'os dois deviam avançar o mesmo');
});

test('não lança antes da folga mínima, mesmo com alvo à vista', () => {
    const s = montar();
    assert.strictEqual(s.podeLancar(0, true), false);
    assert.strictEqual(s.podeLancar(s.P.segurarMinimo - 0.01, true), false,
        'é a folga para as equipas saírem da área');
});

test('lança depois da folga, se houver alvo', () => {
    const s = montar();
    assert.strictEqual(s.podeLancar(s.P.segurarMinimo, true), true);
    assert.strictEqual(s.podeLancar(s.P.segurarDur, true), true);
});

test('sem alvo não lança, por muito que espere', () => {
    const s = montar();
    // Não o prende: ao fim de segurarDur o relançamento sai à mesma, pelo
    // outro ramo do updateGK.
    assert.strictEqual(s.podeLancar(s.P.segurarDur * 2, false), false);
    assert.strictEqual(s.podeLancar(s.P.segurarDur * 2, null), false);
});

test('o alvo nulo não passa por verdadeiro', () => {
    const s = montar();
    assert.strictEqual(s.podeLancar(5, undefined), false);
    assert.strictEqual(s.podeLancar(5, 0), false);
});

/* ---------------------------------------------------------------- */

test('o ramo segurando mexe mesmo na posição', () => {
    /*
    Era este o defeito: nenhuma das duas vias que movem um jogador chega a este
    estado. A FSM só é chamada no ramo 'idle', e o fim do updateGK zera a
    velocidade para qualquer estado que não seja 'idle'.
    */
    const i = PLAYER.indexOf("} else if (this.gkEstado === 'segurando') {");
    assert.ok(i >= 0, 'ramo segurando nao encontrado');
    const bloco = PLAYER.slice(i, PLAYER.indexOf("} else if (this.gkEstado === 'chutando')", i));

    assert.ok(bloco.indexOf('gkAlvoSegurando') >= 0, 'devia usar o alvo');
    assert.ok(/gkCorpo\.position\.z \+=/.test(bloco), 'devia mexer na posição');
});

test('a procura de linha não corre a cada frame', () => {
    // findPassTarget percorre companheiros e linhas de passe; nada disso muda
    // de frame para frame.
    const i = PLAYER.indexOf("} else if (this.gkEstado === 'segurando') {");
    const bloco = PLAYER.slice(i, PLAYER.indexOf("} else if (this.gkEstado === 'chutando')", i));
    assert.ok(bloco.indexOf('gkProcuraTimer') >= 0, 'devia ter throttle');
});

test('o estado da procura é reposto ao agarrar a bola', () => {
    // Sem isto, a segunda defesa herdava o gkTemLinha da primeira e ele
    // relançava à cabeça.
    assert.ok(/this\.gkTemLinha = false/.test(PLAYER), 'gkTemLinha devia ser reposto');
    assert.ok(/this\.gkProcuraTimer = 0/.test(PLAYER), 'gkProcuraTimer devia ser reposto');
});
