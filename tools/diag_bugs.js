/*
Diagnostico dos bugs reportados. Corre o jogo em headless com semente fixa e
mede cada queixa, em vez de a procurar a olho:

  1. INTERCEPT a mais — quantos jogadores por equipa e por frame estao em
     INTERCEPT, separando a equipa COM posse da equipa SEM posse
  2. Corpo virado ao lado do movimento — angulo entre a frente do modelo e a
     direccao da velocidade
  3. Centrais a trocar de marcacao — com que frequencia cada CB tem como
     marcado o adversario que estava MAIS PERTO do outro CB
  4. Player_Pass_Points — se alguem chega a ter debugPoints escritos
  5. Extra Frontman — quanto tempo passa no ataque

Uso: node tools/diag_bugs.js [sementes] [segundos]
*/
const path = require('path');
const vm = require('vm');
const raiz = path.join(__dirname, '..');
const { ctx } = require(path.join(raiz, 'tests', 'headless.js'));

const SEMENTES = Number(process.argv[2] || 4);
const SEGUNDOS = Number(process.argv[3] || 90);
const DT = 0.016;
const FRAMES = Math.round(SEGUNDOS / DT);

function mulberry32(a) {
    return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function correr(semente) {
    ctx.Math.random = mulberry32(semente);
    vm.runInContext(`
        EventBus._listeners = {};
        Match.players.length = 0;
        Match.opponents.length = 0;
        Match.ballCarrier = null;
        Match.setPieceTaker = null;
        Match.init(new THREE.Scene());
        Match.delta = ${DT};
        window.showPlayerPoints = true;   // bug 4: ligar o botao do painel
        for (let i = 0; i < 120; i++) Match.update(${DT});

        globalThis.__r = {
            intercept: { comPosse: {}, semPosse: {}, presos: 0, framesComIntercetor: 0 },
            angulo: { n: 0, soma: 0, mau60: 0, mau90: 0, amostras: [] },
            cb: { n: 0, trocado: 0 },
            pontos: { jogadoresComPontos: 0, chaves: {} },
            frontman: { n: 0, noAtaque: 0, estiloOn: 0 }
        };
        globalThis.R = globalThis.__r;

        for (let i = 0; i < ${FRAMES}; i++) {
            Match.update(${DT});
            if (i % 3) continue;

            for (const lado of [['TeamA', Match.players], ['TeamB', Match.opponents]]) {
                const bb = TeamAI.blackboards[lado[0]] || null;
                if (!bb) continue;
                const comPosse = !!bb.isAttacking;
                const emIntercept = lado[1].filter(p => p.fsm && p.fsm.currentState === 'INTERCEPT');
                const balde = comPosse ? R.intercept.comPosse : R.intercept.semPosse;
                balde[emIntercept.length] = (balde[emIntercept.length] || 0) + 1;
                // "Preso": esta em INTERCEPT mas nao e o intercetor que o
                // nivel 1 escolheu neste frame.
                for (const p of emIntercept) if (bb.intercetor !== p) R.intercept.presos++;
                if (bb.intercetor) R.intercept.framesComIntercetor++;

                for (const p of lado[1]) {
                    if (p.role === 'gk') continue;

                    // --- 2. corpo vs movimento ---
                    const v = p.velocity;
                    if (v) {
                        const vel = Math.hypot(v.x, v.z);
                        if (vel > 1.5) {
                            const f = new THREE.Vector3(0, 0, 1).applyQuaternion(p.model.quaternion);
                            const cos = (f.x * v.x + f.z * v.z) / (vel * (Math.hypot(f.x, f.z) || 1));
                            const ang = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
                            R.angulo.n++; R.angulo.soma += ang;
                            if (ang > 60) R.angulo.mau60++;
                            if (ang > 90) {
                                R.angulo.mau90++;
                                if (R.angulo.amostras.length < 12) {
                                    R.angulo.amostras.push({
                                        pos: p.pos, estado: p.fsm.currentState,
                                        ang: Math.round(ang), vel: Math.round(vel * 10) / 10
                                    });
                                }
                            }
                        }
                    }

                    // --- 4. pontos de passe ---
                    if (p.debugPoints) {
                        for (const k of Object.keys(p.debugPoints)) {
                            R.pontos.chaves[k] = (R.pontos.chaves[k] || 0) + 1;
                        }
                    }

                    // --- 5. extra frontman ---
                    if (p.playingStyle === 'extra_frontman') {
                        R.frontman.n++;
                        if (p.styleAtivo) R.frontman.estiloOn++;
                        if (p.model.position.z * p.dirZ > 0) R.frontman.noAtaque++;
                    }
                }

                // --- 3. centrais a trocar de marcacao ---
                const cbs = lado[1].filter(p => p.pos === 'CB');
                if (cbs.length === 2 && cbs[0].marcRef && cbs[1].marcRef
                    && cbs[0].marcRef !== cbs[1].marcRef) {
                    R.cb.n++;
                    const d = (a, b) => a.model.position.distanceTo(b.model.position);
                    // Trocado: cada um estaria mais perto do marcado do outro.
                    if (d(cbs[0], cbs[1].marcRef) < d(cbs[0], cbs[0].marcRef)
                        && d(cbs[1], cbs[0].marcRef) < d(cbs[1], cbs[1].marcRef)) {
                        R.cb.trocado++;
                    }
                }
            }
        }
        // Quantos jogadores acabaram com pontos escritos
        for (const lista of [Match.players, Match.opponents]) {
            for (const p of lista) if (p.debugPoints && Object.keys(p.debugPoints).length) {
                R.pontos.jogadoresComPontos++;
            }
        }
        globalThis.__out = JSON.stringify(R);
    `, ctx);
    return JSON.parse(vm.runInContext('globalThis.__out', ctx));
}

const T = {
    intercept: { comPosse: {}, semPosse: {}, presos: 0, framesComIntercetor: 0 },
    angulo: { n: 0, soma: 0, mau60: 0, mau90: 0, amostras: [] },
    cb: { n: 0, trocado: 0 },
    pontos: { jogadoresComPontos: 0, chaves: {} },
    frontman: { n: 0, noAtaque: 0, estiloOn: 0 }
};
for (let s = 1; s <= SEMENTES; s++) {
    const r = correr(s * 7919);
    for (const fase of ['comPosse', 'semPosse']) {
        for (const k of Object.keys(r.intercept[fase])) {
            T.intercept[fase][k] = (T.intercept[fase][k] || 0) + r.intercept[fase][k];
        }
    }
    T.intercept.presos += r.intercept.presos;
    T.intercept.framesComIntercetor += r.intercept.framesComIntercetor;
    T.angulo.n += r.angulo.n; T.angulo.soma += r.angulo.soma;
    T.angulo.mau60 += r.angulo.mau60; T.angulo.mau90 += r.angulo.mau90;
    if (T.angulo.amostras.length < 12) T.angulo.amostras.push(...r.angulo.amostras);
    T.cb.n += r.cb.n; T.cb.trocado += r.cb.trocado;
    T.pontos.jogadoresComPontos += r.pontos.jogadoresComPontos;
    for (const k of Object.keys(r.pontos.chaves)) {
        T.pontos.chaves[k] = (T.pontos.chaves[k] || 0) + r.pontos.chaves[k];
    }
    T.frontman.n += r.frontman.n;
    T.frontman.noAtaque += r.frontman.noAtaque;
    T.frontman.estiloOn += r.frontman.estiloOn;
    process.stderr.write(`semente ${s} ok\n`);
}

const pc = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '-';

console.log('\n1. INTERCEPT por equipa e por frame');
for (const fase of ['comPosse', 'semPosse']) {
    const d = T.intercept[fase];
    const tot = Object.values(d).reduce((a, b) => a + b, 0);
    const linha = Object.keys(d).sort().map(k => `${k}: ${pc(d[k], tot)}`).join('   ');
    console.log(`  equipa ${fase === 'comPosse' ? 'COM' : 'SEM'} posse -> ${linha}`);
}
console.log(`  jogadores em INTERCEPT que NAO sao o intercetor do frame: ${T.intercept.presos}`);

console.log('\n2. Corpo vs direccao do movimento (so acima de 1.5 m/s)');
console.log(`  angulo medio ${(T.angulo.soma / T.angulo.n).toFixed(1)} graus   ` +
    `>60 graus ${pc(T.angulo.mau60, T.angulo.n)}   >90 graus ${pc(T.angulo.mau90, T.angulo.n)}`);
for (const a of T.angulo.amostras.slice(0, 8)) {
    console.log(`    ${a.pos.padEnd(3)} ${a.estado.padEnd(14)} ${a.ang} graus a ${a.vel} m/s`);
}

console.log('\n3. Centrais com a marcacao trocada');
console.log(`  ${pc(T.cb.trocado, T.cb.n)} dos frames com os dois CB a marcar homens diferentes (n=${T.cb.n})`);

console.log('\n4. Player_Pass_Points (window.showPlayerPoints = true)');
console.log(`  jogadores com debugPoints no fim: ${T.pontos.jogadoresComPontos}`);
console.log(`  chaves escritas: ${JSON.stringify(T.pontos.chaves)}`);

console.log('\n5. Extra Frontman');
console.log(`  estilo ligado ${pc(T.frontman.estiloOn, T.frontman.n)} do tempo; ` +
    `no meio-campo atacante ${pc(T.frontman.noAtaque, T.frontman.n)} do tempo`);
