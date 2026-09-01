/*
A FORÇA DO CANTO — o cruzamento caía metros antes do alvo.

Como estava: o `case 'SET_PIECE_TAKER'` da FSM fixava `vy` e resolvia a
horizontal por `vHoriz = d / tVoo`, que é a fórmula do tiro NO VÁCUO. A física
da bola trava as três componentes com arrasto quadrático
(`BallPhysics.kArrasto`, ver match_physics.js), e a ~19 m/s isso são ~5 m/s²
durante os ~2 s de voo.

Medido com a física real: um canto apontado à marca de penálti (35 m) caía aos
26.7 m — 8.3 m curto, ou seja à entrada da área. É o "falta força" que se vê.

Este teste refaz o voo com o MESMO integrador do `updateBall` e exige que a
bola caia onde foi apontada. Fixa também que o canto usa o
`velocidadeParaAlcance`, que é o solver com arrasto que o resto do jogo já usa.

Corre com: node --test tests/canto_forca.test.js
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcFsm = semCR(fs.readFileSync(path.join(raiz, 'js', 'fsm.js'), 'utf8'));
const srcCross = semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'shooting.js'), 'utf8'));

function extrairObjecto(src, nome) {
    const cabeca = `const ${nome} = {`;
    const ini = src.indexOf(cabeca);
    if (ini < 0) throw new Error(`${nome} não encontrado`);
    const fim = src.indexOf(LF + '};', ini);
    return new Function(`${src.slice(ini, fim + 3)}; return ${nome};`)();
}

const CC = extrairObjecto(srcCross, 'CrossModel').canto;

// BallPhysics, com o kArrasto derivado como em js/config/physics.js.
const B = { massa: 0.430, raio: 0.11, gravidade: 9.81, densidadeAr: 1.225, cd: 0.25 };
B.kArrasto = 0.5 * B.densidadeAr * B.cd * (Math.PI * B.raio * B.raio) / B.massa;

// O MESMO integrador do updateBall: arrasto quadrático nas três componentes.
function voo(v, elev) {
    let x = 0, y = B.raio, vx = v * Math.cos(elev), vy = v * Math.sin(elev);
    const dt = 1 / 120;
    for (let i = 0; i < 2000; i++) {
        const s = Math.hypot(vx, vy);
        if (s > 0.001) { const dv = B.kArrasto * s * s * dt; vx -= vx / s * dv; vy -= vy / s * dv; }
        if (y > B.raio + 0.001) vy -= B.gravidade * dt;
        x += vx * dt; y += vy * dt;
        if (y <= B.raio && vy < 0) return { x, t: i * dt };
    }
    return { x, t: 99 };
}

// A mesma bissecção do velocidadeParaAlcance (utils.js).
function velocidadeParaAlcance(dist, elev) {
    let lo = 0, hi = Math.sqrt(dist * B.gravidade / Math.max(0.05, Math.sin(2 * elev))) * 2 + 10;
    for (let i = 0; i < 40; i++) {
        const m = (lo + hi) / 2;
        if (voo(m, elev).x < dist) lo = m; else hi = m;
    }
    return (lo + hi) / 2;
}

test('a conta do vácuo deixava o canto curto (a razão desta correcção)', () => {
    // O que havia: vy fixo de ~9.8 e vHoriz = d / (2·vy/g).
    const d = 35.0;
    const vy = 9.8, tVoo = 2 * vy / B.gravidade, vh = d / tVoo;
    const alcance = voo(Math.hypot(vh, vy), Math.atan2(vy, vh)).x;
    assert.ok(d - alcance > 5.0,
        `a conta antiga só ficava ${(d - alcance).toFixed(1)} m curta — o defeito era outro`);
});

test('o canto cai ONDE FOI APONTADO, em toda a gama de distâncias', () => {
    const elev = CC.elevacao * Math.PI / 180;
    for (const d of [28, 31, 34, 37, 40]) {
        const v = velocidadeParaAlcance(d, elev) * (CC.forca || 1.0);
        const alcance = voo(v, elev).x;
        assert.ok(Math.abs(alcance - d) < 1.5,
            `canto de ${d} m cai a ${alcance.toFixed(1)} m — ${(d - alcance).toFixed(1)} m de erro`);
    }
});

test('a variação da elevação não estraga o cruzamento', () => {
    const d = 35.0;
    for (const sinal of [-1, 1]) {
        const elev = (CC.elevacao + sinal * CC.variacaoElev) * Math.PI / 180;
        const v = velocidadeParaAlcance(d, elev) * (CC.forca || 1.0);
        const r = voo(v, elev);
        assert.ok(Math.abs(r.x - d) < 1.5,
            `com elevação ${(elev * 180 / Math.PI).toFixed(1)}° o canto cai a ${r.x.toFixed(1)} m`);
        assert.ok(r.t > 1.4 && r.t < 3.0,
            `tempo de voo de ${r.t.toFixed(2)} s: um canto tem de dar tempo de atacar a bola`);
    }
});

test('a elevação mantém o canto um CRUZAMENTO e não um passe rasteiro', () => {
    assert.ok(CC.elevacao >= 20 && CC.elevacao <= 45,
        `${CC.elevacao}° não é a trajectória de um canto`);
});

test('a FSM usa o solver com arrasto e não a conta do vácuo', () => {
    const ini = srcFsm.indexOf("case 'SET_PIECE_TAKER':");
    assert.ok(ini > 0, "case SET_PIECE_TAKER não encontrado");
    const ramo = srcFsm.slice(ini, ini + 6000);
    assert.ok(/velocidadeParaAlcance\(/.test(ramo),
        'o canto voltou a resolver a balística sem arrasto — cai curto outra vez');
    assert.ok(/CrossModel\.canto/.test(ramo),
        'a força do canto deixou de sair da config');
    assert.ok(!/const vHoriz = d \/ tVoo;/.test(ramo),
        'a conta do vácuo (d / tVoo) está de volta');
});
