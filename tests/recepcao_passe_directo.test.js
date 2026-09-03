/*
ESPERAR O PASSE DIRECTO QUIETO, VIRADO PARA A BOLA.

Relato: "os jogadores estão a tremer na posição quando estão a aguardar o passe
chegar". O alvo do destinatário era o `interceptionPoint`, recalculado a cada
frame e a andar ao encontro dele enquanto a bola rola — a histerese de 0.8 m
era atravessada frame sim frame não e ele dava micro-arranques.

Regra: com a bola a vir dentro do corredor `PassModel.recepcao.desvioDirecto`
dele, fica em IDLE virado para a bola até ela chegar a `distIniciaMovimento`.

Corre com: node --test tests/recepcao_passe_directo.test.js
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcBT = semCR(fs.readFileSync(path.join(raiz, 'js', 'bt', 'player_bt.js'), 'utf8'));
const srcPass = semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'passing.js'), 'utf8'));

function extrairObjecto(src, nome, extras) {
    const ini = src.indexOf(`const ${nome} = {`);
    if (ini < 0) throw new Error(`${nome} não encontrado`);
    const fim = src.indexOf(LF + '};', ini);
    const nomes = Object.keys(extras || {});
    return new Function(...nomes, `${src.slice(ini, fim + 3)}; return ${nome};`)
        (...nomes.map(n => extras[n]));
}
function extrairFuncao(src, nome) {
    const ini = src.indexOf(`function ${nome}(`);
    if (ini < 0) throw new Error(`${nome} não encontrada`);
    const fim = src.indexOf(LF + '}' + LF, ini);
    return src.slice(ini, fim + 3);
}

const ALTURA_CABECA = 1.72;   // js/config/physics.js
const PassModel = extrairObjecto(srcPass, 'PassModel', { Math, ALTURA_CABECA });
const R = PassModel.recepcao;

const ALTURA_BASE_Y = 0.9, ALTURA_TESTA = 0.8;
const BallPhysics = { raio: 0.11 };

// Estado partilhado, reposto por cenário.
let Match, olhouParaBola;

function correr({ bolaX, bolaZ, velX, velZ, jogX, jogZ, estadoInicial }) {
    olhouParaBola = false;
    const p = {
        model: { position: { x: jogX, y: ALTURA_BASE_Y, z: jogZ } },
        velocity: { x: 1, y: 0, z: 1, set(a, b, c) { this.x = a; this.y = b; this.z = c; } },
        dynamicTarget: { x: 0, y: 0, z: 0, set(a, b, c) { this.x = a; this.y = b; this.z = c; },
            copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; } },
        blackboard: { ball: { interceptionPoint: null } },
        speedMult: 0,
        fsm: { currentState: estadoInicial || 'MOVE_TO_POS',
            changeState(s) { this.currentState = s; } }
    };
    Match = {
        ball: { position: { x: bolaX, y: BallPhysics.raio, z: bolaZ } },
        ballVel: { x: velX, y: 0, z: velZ,
            lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; } },
        intendedReceiver: p, lastTouchedPlayer: null, passTargetPos: null,
        counterAttackTeam: null
    };
    // O ponto de intercepção que a percepção daria: a bola daqui a pouco. É o
    // alvo que provocava o tremor.
    p.blackboard.ball.interceptionPoint = { x: bolaX + velX * 0.3, z: bolaZ + velZ * 0.3 };

    const stubs = {
        Match, PassModel, BallPhysics, ALTURA_BASE_Y, ALTURA_TESTA,
        preverBolaEmAltura: () => null,
        preverQuedaDaBola: () => ({ x: bolaX, z: bolaZ }),
        lookAtBola: () => { olhouParaBola = true; },
        tempoDoJogadorAte: (d, v, vmax) => d / Math.max(vmax, 0.1),
        tempoRasteiroDaBola: () => 1.0
    };
    const fn = new Function(...Object.keys(stubs),
        extrairFuncao(srcBT, 'actReceivePass') + '; return actReceivePass;')(...Object.values(stubs));
    fn({ p, skillSpeed: 50 });
    return p;
}

test('os três números vivem no config', () => {
    for (const k of ['desvioDirecto', 'distIniciaMovimento', 'velMinDirecto']) {
        assert.strictEqual(typeof R[k], 'number', `${k} em falta em PassModel.recepcao`);
    }
});

test('passe a vir direito a ele: fica quieto e olha para a bola', () => {
    // Bola em z=-10 a rolar para +z; jogador em z=0, em cima da linha dela.
    const p = correr({ bolaX: 0, bolaZ: -10, velX: 0, velZ: 8, jogX: 0, jogZ: 0 });
    assert.strictEqual(p.fsm.currentState, 'IDLE');
    assert.strictEqual(p.velocity.x, 0);
    assert.strictEqual(p.velocity.z, 0);
    assert.ok(olhouParaBola, 'tinha de ficar virado para a bola');
});

test('fica quieto mesmo desalinhado dentro do corredor', () => {
    const dentro = R.desvioDirecto * 0.9;
    const p = correr({ bolaX: 0, bolaZ: -10, velX: 0, velZ: 8, jogX: dentro, jogZ: 0 });
    assert.strictEqual(p.fsm.currentState, 'IDLE');
});

test('fora do corredor vai buscar a bola', () => {
    const fora = R.desvioDirecto + 1.5;
    const p = correr({ bolaX: 0, bolaZ: -10, velX: 0, velZ: 8, jogX: fora, jogZ: 0 });
    assert.notStrictEqual(p.fsm.currentState, 'IDLE');
});

test('com a bola já perto, inicia o movimento', () => {
    const perto = R.distIniciaMovimento * 0.5;
    const p = correr({ bolaX: 0, bolaZ: -perto, velX: 0, velZ: 8, jogX: 0, jogZ: 0 });
    assert.notStrictEqual(p.fsm.currentState, 'IDLE',
        'a esta distância já é o passo para dominar, não a espera');
});

test('bola a AFASTAR-SE dele não é passe directo', () => {
    // Mesma linha, mas ele está ATRÁS da bola: ela vai-se embora.
    const p = correr({ bolaX: 0, bolaZ: -10, velX: 0, velZ: 8, jogX: 0, jogZ: -20 });
    assert.notStrictEqual(p.fsm.currentState, 'IDLE');
});

test('bola quase parada não conta como passe a caminho', () => {
    const lenta = R.velMinDirecto * 0.5;
    const p = correr({ bolaX: 0, bolaZ: -10, velX: 0, velZ: lenta, jogX: 0, jogZ: 0 });
    assert.notStrictEqual(p.fsm.currentState, 'IDLE',
        'bola morta vai-se buscar, não se espera por ela');
});
