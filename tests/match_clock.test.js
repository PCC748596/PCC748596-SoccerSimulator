const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const configCode = fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8');

function carregarConfig() {
    const sandbox = {
        window: {},
        document: { getElementById: () => null },
        console,
        Math,
        THREE: {
            MathUtils: { clamp: (v, min, max) => Math.min(Math.max(v, min), max), degToRad: (d) => d * Math.PI / 180 },
            Vector3: class {
                constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
                set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
                clone() { return new sandbox.THREE.Vector3(this.x, this.y, this.z); }
            },
            Matrix4: class { makeRotationFromEuler() { return this; } multiply() { return this; } },
            Euler: class { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } },
            Quaternion: class {
                constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; }
                setFromAxisAngle() { return this; }
            },
            Line3: class {
                constructor(start, end) { this.start = start; this.end = end; }
                closestPointToPointParameter() { return 0.5; }
            },
            BoxGeometry: class { toNonIndexed() { return this; } translate() { return this; } },
            MeshBasicMaterial: class {}
        }
    };
    vm.createContext(sandbox);
    vm.runInContext(configCode, sandbox);
    return sandbox;
}

test('MatchDuration está configurado para 45 minutos de jogo a cada 10 minutos reais', () => {
    const sb = carregarConfig();
    const MatchDuration = vm.runInContext('MatchDuration', sb);
    const GAME_SPEED = vm.runInContext('GAME_SPEED', sb);

    assert.ok(MatchDuration, 'MatchDuration deve existir');
    assert.strictEqual(MatchDuration.halfGameMinutes, 45);
    assert.strictEqual(MatchDuration.halfRealMinutes, 10);
    assert.strictEqual(MatchDuration.gameSecondsPerRealSecond, 4.5);

    // 10 minutos reais (600s) a velocidade normal (1.0x) devem avançar 2700s (45 mins)
    const realSeconds = 600;
    const simDt = realSeconds * GAME_SPEED;
    const gameSecondsPassed = simDt * MatchDuration.timeScale;

    assert.ok(
        Math.abs(gameSecondsPassed - 2700) < 0.001,
        `600 segundos reais devem resultar em exatamente 2700 segundos de jogo (45 mins), obteve ${gameSecondsPassed}`
    );
});
