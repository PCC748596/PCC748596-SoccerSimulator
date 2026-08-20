/*
Colisão da bola com postes e travessão.

Corre o colidirComBaliza real (método de Match, script de browser) num
sandbox com as constantes do config.
*/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const CONFIG = fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8');
const MATCH = fs.readFileSync(path.join(raiz, 'js', 'match.js'), 'utf8');

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

// Recorta `nome: function () { ... },` de dentro do objecto Match.
function recortarMetodo(src, nome) {
    const i = src.indexOf('    ' + nome + ': function (');
    assert.ok(i >= 0, 'metodo ' + nome + ' nao encontrado');
    let nivel = 0;
    for (let k = src.indexOf('{', i); k < src.length; k++) {
        if (src[k] === '{') nivel++;
        else if (src[k] === '}' && --nivel === 0) {
            return 'function ' + nome + '() ' +
                src.slice(src.indexOf('{', i), k + 1);
        }
    }
    assert.fail('chavetas desequilibradas em ' + nome);
}

const CAMPO_COMP = 105;
const LARGURA_BALIZA = 7.32;
const ALTURA_BALIZA = 2.44;

function montar(pos, vel) {
    const sandbox = {
        Math,
        CAMPO_COMP, LARGURA_BALIZA, ALTURA_BALIZA,
        ctx: null
    };
    vm.createContext(sandbox);
    vm.runInContext(
        recortarConst(CONFIG, 'BallPhysics') + '\n' +
        recortarConst(CONFIG, 'GoalFrame') + '\n' +
        recortarMetodo(MATCH, 'colidirComBaliza') +
        '\nthis.f = colidirComBaliza; this.GF = GoalFrame; this.BP = BallPhysics;', sandbox);

    const estado = {
        ball: { position: { x: pos[0], y: pos[1], z: pos[2] } },
        ballVel: { x: vel[0], y: vel[1], z: vel[2] }
    };
    sandbox.f.call(estado);
    return { estado, GF: sandbox.GF, BP: sandbox.BP };
}

// Plano da armação e raios, calculados como no código.
function geo() {
    const { GF, BP } = montar([0, 0, 0], [0, 0, 0]);
    return {
        rP: GF.raioPoste,
        rB: BP.raio,
        soma: GF.raioPoste + BP.raio,
        zG: CAMPO_COMP / 2 - GF.raioPoste,
        rest: GF.restituicao
    };
}

test('a bola no meio do campo não toca em nada', () => {
    const { estado } = montar([0, 0.5, 0], [0, 0, 10]);
    assert.strictEqual(estado.ball.position.z, 0);
    assert.strictEqual(estado.ballVel.z, 10);
});

test('bola a entrar limpa pelo meio da baliza não é tocada', () => {
    const g = geo();
    const { estado } = montar([0, 1.0, g.zG], [0, 0, 12]);
    assert.strictEqual(estado.ballVel.z, 12, 'nao devia ressaltar no ar livre do vao');
});

test('travessão: bola a subir contra a trave inverte o z', () => {
    const g = geo();
    // mesma altura do eixo do travessão, a chegar de dentro do campo
    const barY = ALTURA_BALIZA + g.rP;
    const { estado } = montar([0, barY, g.zG - g.soma * 0.5], [0, 0, 15]);
    assert.ok(estado.ballVel.z < 0, 'devia voltar para o campo, veio ' + estado.ballVel.z);
});

test('travessão: o ressalto perde energia (restituição < 1)', () => {
    const g = geo();
    const barY = ALTURA_BALIZA + g.rP;
    const { estado } = montar([0, barY, g.zG - g.soma * 0.5], [0, 0, 15]);
    assert.ok(Math.abs(estado.ballVel.z) < 15, 'saiu mais rapido do que entrou');
});

test('travessão: a bola é empurrada para fora do cilindro', () => {
    const g = geo();
    const barY = ALTURA_BALIZA + g.rP;
    const { estado } = montar([0, barY, g.zG - g.soma * 0.5], [0, 0, 15]);
    const b = estado.ball.position;
    const d = Math.hypot(b.y - barY, b.z - g.zG);
    assert.ok(Math.abs(d - g.soma) < 1e-9, 'ficou a ' + d + ', esperado ' + g.soma);
});

test('travessão: bater por baixo manda a bola para baixo', () => {
    const g = geo();
    const barY = ALTURA_BALIZA + g.rP;
    // ligeiramente abaixo do eixo, a subir
    const { estado } = montar([0, barY - g.soma * 0.7, g.zG], [0, 12, 0]);
    assert.ok(estado.ballVel.y < 0, 'devia descer, veio ' + estado.ballVel.y);
});

test('poste: bola contra o poste direito volta para dentro', () => {
    const g = geo();
    const px = LARGURA_BALIZA / 2;
    const { estado } = montar([px - g.soma * 0.6, 0.5, g.zG], [8, 0, 0]);
    assert.ok(estado.ballVel.x < 0, 'devia ressaltar para dentro, veio ' + estado.ballVel.x);
});

test('poste: a bola é empurrada para fora do cilindro', () => {
    const g = geo();
    const px = -LARGURA_BALIZA / 2;
    const { estado } = montar([px + g.soma * 0.3, 0.5, g.zG + g.soma * 0.2], [-6, 0, 3]);
    const b = estado.ball.position;
    const d = Math.hypot(b.x - px, b.z - g.zG);
    assert.ok(Math.abs(d - g.soma) < 1e-9, 'ficou a ' + d);
});

test('poste: só conta abaixo do travessão', () => {
    const g = geo();
    const px = LARGURA_BALIZA / 2;
    // bem acima da trave, à altura de um cruzamento alto
    const { estado } = montar([px, 5.0, g.zG], [5, 0, 0]);
    assert.strictEqual(estado.ballVel.x, 5, 'nao ha poste a 5m de altura');
});

test('travessão: só conta dentro da largura da baliza', () => {
    const g = geo();
    const barY = ALTURA_BALIZA + g.rP;
    const foraX = LARGURA_BALIZA / 2 + g.rP + 1.0;
    const { estado } = montar([foraX, barY, g.zG], [0, 0, 10]);
    assert.strictEqual(estado.ballVel.z, 10);
});

test('a baliza do outro lado também colide', () => {
    const g = geo();
    const px = LARGURA_BALIZA / 2;
    const { estado } = montar([px - g.soma * 0.6, 0.5, -g.zG], [8, 0, 0]);
    assert.ok(estado.ballVel.x < 0, 'o lado negativo tambem tem postes');
});

test('bola parada encostada ao poste não ganha velocidade', () => {
    const g = geo();
    const px = LARGURA_BALIZA / 2;
    const { estado } = montar([px - g.soma * 0.5, 0.5, g.zG], [0, 0, 0]);
    assert.strictEqual(estado.ballVel.x, 0);
    assert.strictEqual(estado.ballVel.z, 0);
});

test('bola já a afastar-se do poste não é reflectida outra vez', () => {
    const g = geo();
    const px = LARGURA_BALIZA / 2;
    // sobreposta, mas com velocidade a sair: nao pode inverter para dentro
    const { estado } = montar([px - g.soma * 0.5, 0.5, g.zG], [-9, 0, 0]);
    assert.strictEqual(estado.ballVel.x, -9, 'nao devia re-reflectir quem ja sai');
});
