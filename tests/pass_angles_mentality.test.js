const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function carregarSandbox() {
    const configSrc = fs.readFileSync(path.join(__dirname, '../js/config.js'), 'utf8');
    const btCoreSrc = fs.readFileSync(path.join(__dirname, '../js/bt/core.js'), 'utf8');
    const playerSrc = fs.readFileSync(path.join(__dirname, '../js/player.js'), 'utf8');
    const playerBtSrc = fs.readFileSync(path.join(__dirname, '../js/bt/player_bt.js'), 'utf8');

    const sandbox = {
        console,
        Math,
        window: {},
        Tatics: { estilo: 'balanceado', setores: ['cen'] },
        THREE: {
            MathUtils: { clamp: (v, min, max) => Math.min(Math.max(v, min), max), degToRad: (d) => d * Math.PI / 180 },
            Matrix4: class {
                makeRotationFromEuler() { return this; }
                multiply() { return this; }
            },
            Euler: class {
                constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
            },
            Line3: class {
                constructor(start, end) { this.start = start; this.end = end; }
                closestPointToPointParameter() { return 0.5; }
            },
            Box3: class {},
            Ray: class {},
            Sphere: class {},
            Quaternion: class {
                constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; }
                setFromAxisAngle() { return this; }
            },
            Vector3: class {
                constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
                set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
                clone() { return new sandbox.THREE.Vector3(this.x, this.y, this.z); }
                subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
                distanceTo(o) { return Math.hypot(this.x - o.x, this.y - o.y, this.z - o.z); }
                lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
                normalize() {
                    const l = Math.hypot(this.x, this.y, this.z);
                    if (l > 0.0001) { this.x /= l; this.y /= l; this.z /= l; }
                    return this;
                }
                applyQuaternion() { return this; }
                angleTo(v) {
                    const dot = (this.x * v.x + this.y * v.y + this.z * v.z);
                    return Math.acos(Math.max(-1, Math.min(1, dot)));
                }
            }
        },
        TeamA: { defLineDir: 1, offsideZ: 20 },
        TeamB: { defLineDir: -1, offsideZ: -20 },
        Match: { players: [], opponents: [], ball: { position: { x: 0, y: 0, z: 0 } }, delta: 1 / 60 },
        alvoDePasse: (p) => p.model.position,
        Config: { usePlayingStyles: false },
        SpatialGrid: { cells: null },
        CAMPO_LARG: 68,
        CAMPO_COMP: 105,
        ALTURA_BASE_Y: 0
    };

    vm.createContext(sandbox);
    vm.runInContext(configSrc, sandbox);
    vm.runInContext(btCoreSrc, sandbox);
    vm.runInContext(playerSrc, sandbox);
    vm.runInContext(playerBtSrc, sandbox);
    return sandbox;
}

test('MentalidadeModel.balanceado define a distribuição exata de ângulos', () => {
    const sb = carregarSandbox();
    const MentalidadeModel = vm.runInContext('MentalidadeModel', sb);
    const ment = MentalidadeModel.balanceado;

    assert.ok(ment, 'MentalidadeModel.balanceado deve existir');
    assert.strictEqual(ment.passAngulos.ate45, 0.40, '40% dos passes até 45 graus para cada lado');
    assert.strictEqual(ment.passAngulos.entre45_90, 0.30, '30% dos passes entre 45 e 90 graus');
    assert.strictEqual(ment.passAngulos.entre90_100, 0.20, '20% dos passes entre 90 e 100 graus');
    assert.strictEqual(ment.passAngulos.atras100, 0.10, '10% dos passes para trás (>100 graus)');
});

test('getPassAngleDeg mede ângulos em relação ao vetor frontal', () => {
    const sb = carregarSandbox();
    const getPassAngleDeg = vm.runInContext('getPassAngleDeg', sb);

    const player = {
        dirZ: 1,
        model: {
            position: { x: 0, y: 0, z: 0 }
        }
    };

    // Alvo à frente (0°)
    const ang0 = getPassAngleDeg(player, { x: 0, y: 0, z: 10 });
    assert.ok(Math.abs(ang0 - 0) < 0.1, 'Alvo à frente deve ter 0°');

    // Alvo a 45° para a direita
    const ang45Dir = getPassAngleDeg(player, { x: 10, y: 0, z: 10 });
    assert.ok(Math.abs(ang45Dir - 45) < 0.1, 'Alvo a 45° direita deve ter 45°');

    // Alvo a 45° para a esquerda
    const ang45Esq = getPassAngleDeg(player, { x: -10, y: 0, z: 10 });
    assert.ok(Math.abs(ang45Esq - 45) < 0.1, 'Alvo a 45° esquerda deve ter 45°');

    // Alvo lateral (90°)
    const ang90 = getPassAngleDeg(player, { x: 10, y: 0, z: 0 });
    assert.ok(Math.abs(ang90 - 90) < 0.1, 'Alvo lateral deve ter 90°');

    // Alvo a 100°
    const rad100 = 100 * Math.PI / 180;
    const ang100 = getPassAngleDeg(player, { x: Math.sin(rad100) * 10, y: 0, z: Math.cos(rad100) * 10 });
    assert.ok(Math.abs(ang100 - 100) < 0.2, 'Alvo a 100° deve ter 100°');
});

test('findPassByMentality amostra e seleciona alvos nos cones de ângulo corretos', () => {
    const sb = carregarSandbox();
    const findPassByMentality = vm.runInContext('findPassByMentality', sb);

    // Mock player com passer em (0,0,0)
    const passer = {
        id: 1,
        team: 'TeamA',
        role: 'def',
        dirZ: 1,
        model: { position: { x: 0, y: 0, z: 0 } },
        skillFor: () => 80,
        findPassTarget: function(filter) {
            if (typeof filter === 'object') {
                if (filter.minAngle === 0 && filter.maxAngle === 45) return { id: 2, pos: 'front45' };
                if (filter.minAngle === 45 && filter.maxAngle === 90) return { id: 3, pos: 'side45_90' };
                if (filter.minAngle === 90 && filter.maxAngle === 100) return { id: 4, pos: 'side90_100' };
                if (filter.minAngle === 100 && filter.maxAngle === 180) return { id: 5, pos: 'back100' };
            }
            return null;
        },
        findPassTargetRelaxed: () => null,
        findPassTargetDesperate: () => null
    };

    const ctx = {
        p: passer,
        teammates: [],
        opponents: [],
        oppBB: { defLineDir: 1 },
        underPressure: false
    };

    const zoneCounts = { ate45: 0, entre45_90: 0, entre90_100: 0, atras100: 0 };
    const N = 20000;

    for (let i = 0; i < N; i++) {
        const choice = findPassByMentality(ctx);
        assert.ok(choice, 'Deve encontrar opção');
        zoneCounts[choice.zone]++;
    }

    const p45 = zoneCounts.ate45 / N;
    const p45_90 = zoneCounts.entre45_90 / N;
    const p90_100 = zoneCounts.entre90_100 / N;
    const pAtras = zoneCounts.atras100 / N;

    // Margem estatística de +/- 1.5%
    assert.ok(Math.abs(p45 - 0.40) < 0.015, `ate45 (${p45}) deve estar perto de 0.40`);
    assert.ok(Math.abs(p45_90 - 0.30) < 0.015, `entre45_90 (${p45_90}) deve estar perto de 0.30`);
    assert.ok(Math.abs(p90_100 - 0.20) < 0.015, `entre90_100 (${p90_100}) deve estar perto de 0.20`);
    assert.ok(Math.abs(pAtras - 0.10) < 0.015, `atras100 (${pAtras}) deve estar perto de 0.10`);
});
