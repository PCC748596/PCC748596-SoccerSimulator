/*
O LATERAL CHEGA AO PÉ OU AO PEITO DO RECEPTOR — medido com arrasto.

A pontaria em altura já existia (ThrowInModel.distanciaAosPes: curto no pé,
longo no peito), mas a força saía do `velocidadeDeLancamento`, que é a
parábola SEM ARRASTO. Com arrasto a bola chega mais baixa e mais curta do que
a conta diz: mirava-se o peito e ela chegava pelos joelhos, ou morria antes.

O `lancarLateral` (js/player.js) passou a resolver a força com o
`velocidadeParaAlturaNoAlvo` (utils.js), que bissecta na MESMA integração com
arrasto do updateBall. Este teste refaz essa integração e mede a altura da
bola quando ela passa pelo receptor.

Corre com: node --test tests/lateral_altura_chegada.test.js
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const srcUtils = semCR(fs.readFileSync(path.join(raiz, 'js', 'utils.js'), 'utf8'));
const srcFisica = semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'physics.js'), 'utf8'));
const srcComport = semCR(fs.readFileSync(path.join(raiz, 'js', 'config', 'player_behavior.js'), 'utf8'));
const srcPlayer = semCR(fs.readFileSync(path.join(raiz, 'js', 'player.js'), 'utf8'));

function extrairObjecto(src, nome) {
    const ini = src.indexOf(`const ${nome} = {`);
    if (ini < 0) throw new Error(`${nome} não encontrado`);
    const fim = src.indexOf(LF + '};', ini);
    return new Function(`${src.slice(ini, fim + 3)}; return ${nome};`)();
}

function extrairFuncao(src, nome) {
    const ini = src.indexOf(`function ${nome}(`);
    if (ini < 0) throw new Error(`${nome} não encontrada`);
    const fim = src.indexOf(LF + '}' + LF, ini);
    return src.slice(ini, fim + 3);
}

const BallPhysics = extrairObjecto(srcFisica, 'BallPhysics');
{
    const ini = srcFisica.indexOf('BallPhysics.area =');
    const fim = srcFisica.indexOf('/ BallPhysics.massa;', ini) + '/ BallPhysics.massa;'.length;
    new Function('BallPhysics', srcFisica.slice(ini, fim))(BallPhysics);
}
const ThrowInModel = extrairObjecto(srcComport, 'ThrowInModel');
const BallControl = extrairObjecto(srcComport, 'BallControl');

const velocidadeParaAlturaNoAlvo = new Function('BallPhysics',
    `${extrairFuncao(srcUtils, 'velocidadeParaAlturaNoAlvo')}; return velocidadeParaAlturaNoAlvo;`
)(BallPhysics);

// Mesma integração do updateBall/utils: altura da bola ao passar por `dist`.
function alturaEm(dist, v, elev, y0) {
    const g = BallPhysics.gravidade, k = BallPhysics.kArrasto;
    let x = 0, y = y0, vx = v * Math.cos(elev), vy = v * Math.sin(elev);
    const dt = 1 / 120;
    for (let i = 0; i < 900; i++) {
        const s = Math.hypot(vx, vy);
        if (s > 0.001) { const dv = k * s * s * dt; vx -= vx / s * dv; vy -= vy / s * dv; }
        vy -= g * dt;
        const xAnt = x, yAnt = y;
        x += vx * dt; y += vy * dt;
        if (x >= dist) {
            const f = (dist - xAnt) / Math.max(1e-6, x - xAnt);
            return yAnt + (y - yAnt) * f;
        }
        if (y < -2) return -Infinity;
    }
    return -Infinity;
}

const ALT_MAOS = 2.0;   // a bola sai de cima da cabeça
const T = ThrowInModel;

test('o lancarLateral resolve a força com arrasto, não com a parábola seca', () => {
    const ini = srcPlayer.indexOf('lancarLateral() {');
    const fim = srcPlayer.indexOf(LF + '    }' + LF, ini);
    const corpo = srcPlayer.slice(ini, fim);
    assert.ok(corpo.includes('velocidadeParaAlturaNoAlvo'),
        'lancarLateral já não usa o solver com arrasto');
    assert.ok(corpo.includes('BallControl.peitoAltura'),
        'a altura do peito tem de ser a MESMA que a recepção usa');
});

test('lateral curto chega rasteiro, ao pé do receptor', () => {
    const fora = [];
    for (let d = 4; d <= T.distanciaAosPes; d += 0.5) {
        for (const elev of [T.elevMin, (T.elevMin + T.elevMax) / 2, T.elevMax]) {
            const v = velocidadeParaAlturaNoAlvo(d, elev, BallPhysics.raio, ALT_MAOS);
            assert.ok(v !== null, `sem solução a ${d} m`);
            const h = alturaEm(d, v, elev, ALT_MAOS);
            // Pé: no chão, com a tolerância da bissecção.
            if (Math.abs(h - BallPhysics.raio) > 0.15) {
                fora.push(`${d}m -> ${h.toFixed(2)}m`);
            }
        }
    }
    assert.strictEqual(fora.length, 0, `fora do pé: ${fora.slice(0, 6).join(', ')}`);
});

test('lateral longo chega dentro da janela do peito (dispara o controlarNoPeito)', () => {
    const fora = [];
    for (let d = T.distanciaAosPes + 0.5; d <= T.alcanceMaxForte; d += 0.5) {
        for (const elev of [T.elevMin, (T.elevMin + T.elevMax) / 2, T.elevMax]) {
            const v = velocidadeParaAlturaNoAlvo(d, elev, BallControl.peitoAltura, ALT_MAOS);
            assert.ok(v !== null, `sem solução a ${d} m`);
            const h = alturaEm(d, v, elev, ALT_MAOS);
            if (h < BallControl.peitoYMin || h > BallControl.peitoYMax) {
                fora.push(`${d}m/${(elev * 180 / Math.PI).toFixed(0)}° -> ${h.toFixed(2)}m`);
            }
        }
    }
    assert.strictEqual(fora.length, 0, `fora da janela do peito: ${fora.slice(0, 6).join(', ')}`);
});

test('a altura mirada é a que a recepção no peito espera', () => {
    assert.ok(BallControl.peitoAltura >= BallControl.peitoYMin - 0.06 &&
        BallControl.peitoAltura <= BallControl.peitoYMax,
        `peitoAltura (${BallControl.peitoAltura}) fora da janela peitoYMin/peitoYMax`);
});

test('com receptor, o piso do alcanceMin já não atira por cima dele', () => {
    const ini = srcPlayer.indexOf('lancarLateral() {');
    const fim = srcPlayer.indexOf(LF + '    }' + LF, ini);
    const corpo = srcPlayer.slice(ini, fim);
    assert.ok(corpo.includes('temReceptor'),
        'o alcance apontado tem de distinguir "há receptor" de "não há"');
});
