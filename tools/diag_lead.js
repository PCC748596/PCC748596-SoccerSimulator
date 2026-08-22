/*
"O sistema calcula que o recebedor vai a uma velocidade e ele vai mais devagar."

Mede, por passe, o que o passador ASSUMIU contra o que ACONTECEU:

  velocidade do recetor   assumida (|p.velocity| * 0.85, do alvoDePasse)
                          contra a media real durante o voo
  tempo de voo            assumido (distancia / vBall = 14 m/s)
                          contra o tempo real ate alguem tocar ou a bola parar
  ponto de lead           contra onde o recetor estava mesmo quando a bola
                          chegou a distancia do ponto

Separa as duas causas possiveis de o passe sair "rapido demais ou longo demais":
o erro na velocidade do recetor e o erro no tempo de voo.

Uso: node tools/diag_lead.js [sementes] [segundos]
*/
const path = require('path');
const vm = require('vm');
const raiz = path.join(__dirname, '..');
const { ctx } = require(path.join(raiz, 'tests', 'headless.js'));

const SEMENTES = Number(process.argv[2] || 5);
const SEGUNDOS = Number(process.argv[3] || 150);
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
        for (let i = 0; i < 120; i++) Match.update(${DT});

        globalThis.__r = { amostras: [] };
        globalThis.R = globalThis.__r;
        globalThis.__voo = null;

        if (!globalThis.__patchedLead) {
            globalThis.__patchedLead = true;
            const execOrig = executePassGameplay;
            globalThis.executePassGameplay = function (p) {
                const alvo = p.passTarget;
                const bx = Match.ball.position.x, bz = Match.ball.position.z;
                const r = execOrig(p);
                if (!alvo || !alvo.model) return r;

                // O que o alvoDePasse assumiu, reproduzido aqui.
                const vRec = alvo.velocity ? Math.hypot(alvo.velocity.x, alvo.velocity.z) : 0;
                const vAssumida = vRec * 0.85;
                const dist = Math.hypot(alvo.model.position.x - bx, alvo.model.position.z - bz);
                /*
                O t que o alvoDePasse usou nao e dist/14: e a raiz da
                interceccao quadratica. Recupera-se do proprio lead que ele
                produziu — lead = vAssumida * t — que e o unico numero que
                interessa comparar com o caminho real.
                */
                const leadPedido = Math.hypot(
                    p.passTargetPos.x - alvo.model.position.x,
                    p.passTargetPos.z - alvo.model.position.z);
                const tAssumido = (vAssumida > 0.3) ? (leadPedido / vAssumida) : (dist / 14.0);

                globalThis.__voo = {
                    alvo: alvo,
                    t0: 0,
                    bx: bx, bz: bz,
                    dist: dist,
                    vAssumida: vAssumida,
                    tAssumido: tAssumido,
                    // Ponto de lead que o passe mirou.
                    leadX: p.passTargetPos.x, leadZ: p.passTargetPos.z,
                    recX0: alvo.model.position.x, recZ0: alvo.model.position.z,
                    percorrido: 0,
                    ultimoX: alvo.model.position.x, ultimoZ: alvo.model.position.z,
                    vSaida: Math.hypot(Match.ballVel.x, Match.ballVel.z)
                };
                return r;
            };
        }

        for (let i = 0; i < ${FRAMES}; i++) {
            Match.update(${DT});

            const v = globalThis.__voo;
            if (v) {
                v.t0 += ${DT};
                // Caminho REAL andado pelo recetor durante o voo.
                const ax = v.alvo.model.position.x, az = v.alvo.model.position.z;
                v.percorrido += Math.hypot(ax - v.ultimoX, az - v.ultimoZ);
                v.ultimoX = ax; v.ultimoZ = az;

                /*
                O voo REAL acaba quando alguem toca — mas para julgar o lead
                interessa o caminho que o recetor faz durante o tempo que o
                passador ASSUMIU. Por isso segue-se ate tAssumido, mesmo
                depois de a bola ja ter sido tocada.
                */
                if (v.percorridoAssumido === undefined) v.percorridoAssumido = 0;
                if (v.t0 <= v.tAssumido) {
                    v.percorridoAssumido = v.percorrido;
                    v.posAssumidaX = ax; v.posAssumidaZ = az;
                }
                if (v.tFim === undefined) {
                    const parouJa = Math.hypot(Match.ballVel.x, Match.ballVel.z) < 0.5;
                    if (parouJa || Match.ballCarrier) v.tFim = v.t0;
                }

                if (v.t0 > Math.max(v.tAssumido, v.tFim === undefined ? 0 : v.tFim) || v.t0 > 5) {
                    const parou = true, dono = false;
                    R.amostras.push({
                        dist: Math.round(v.dist * 10) / 10,
                        vAssumida: Math.round(v.vAssumida * 100) / 100,
                        // Media real = caminho andado a dividir pelo tempo de voo.
                        vReal: Math.round((v.percorrido / Math.max(0.05, v.t0)) * 100) / 100,
                        tAssumido: Math.round(v.tAssumido * 100) / 100,
                        tReal: Math.round((v.tFim === undefined ? v.t0 : v.tFim) * 100) / 100,
                        andouNoTempoAssumido: Math.round(v.percorridoAssumido * 10) / 10,
                        vSaida: Math.round(v.vSaida * 10) / 10,
                        // Erro do lead: distancia entre o ponto mirado e onde o
                        // recetor estava mesmo no fim do voo.
                        erroLead: Math.round(Math.hypot(
                            v.leadX - v.alvo.model.position.x,
                            v.leadZ - v.alvo.model.position.z) * 10) / 10,
                        // Quanto o lead adiantou o ponto, e quanto ele andou.
                        leadPedido: Math.round(Math.hypot(
                            v.leadX - v.recX0, v.leadZ - v.recZ0) * 10) / 10,
                        andouReal: Math.round(v.percorrido * 10) / 10,
                        /*
                        Deslocamento em LINHA RECTA no tempo assumido, contra o
                        caminho andado. O alvoDePasse extrapola a velocidade
                        instantanea em linha recta; se o recetor curva, o ponto
                        extrapolado afasta-se muito do sitio onde ele acaba.
                        */
                        deslocReto: Math.round(Math.hypot(
                            (v.posAssumidaX === undefined ? v.ultimoX : v.posAssumidaX) - v.recX0,
                            (v.posAssumidaZ === undefined ? v.ultimoZ : v.posAssumidaZ) - v.recZ0) * 10) / 10
                    });
                    globalThis.__voo = null;
                }
            }
        }
        globalThis.__out = JSON.stringify(R.amostras);
    `, ctx);
    return JSON.parse(vm.runInContext('globalThis.__out', ctx));
}

const todas = [];
for (let s = 1; s <= SEMENTES; s++) {
    todas.push(...correr(s * 7919));
    process.stderr.write(`semente ${s} ok\n`);
}

const med = (lista, sel) => {
    const o = lista.map(sel).sort((a, b) => a - b);
    return o.length ? Math.round(o[Math.floor(o.length / 2)] * 100) / 100 : NaN;
};

console.log(`\nn = ${todas.length} passes com recetor nomeado\n`);

console.log('VELOCIDADE DO RECETOR (a hipotese)');
console.log(`  assumida pelo passador (|v| * 0.85):  ${med(todas, a => a.vAssumida)} m/s`);
console.log(`  media real durante o voo:             ${med(todas, a => a.vReal)} m/s`);
const raz = todas.filter(a => a.vAssumida > 0.5).map(a => a.vReal / a.vAssumida).sort((x, y) => x - y);
if (raz.length) {
    console.log(`  razao real/assumida: mediana ${raz[Math.floor(raz.length / 2)].toFixed(2)}   ` +
        `p10 ${raz[Math.floor(raz.length * 0.1)].toFixed(2)}   p90 ${raz[Math.floor(raz.length * 0.9)].toFixed(2)}`);
    console.log(`  passes em que o recetor foi MAIS DEVAGAR do que o assumido: ` +
        `${(100 * raz.filter(r => r < 1).length / raz.length).toFixed(0)}%`);
}

console.log('\nTEMPO DE VOO (a outra premissa: vBall = 14 m/s constante)');
console.log(`  assumido:  ${med(todas, a => a.tAssumido)} s`);
console.log(`  real:      ${med(todas, a => a.tReal)} s`);
const razT = todas.filter(a => a.tAssumido > 0.05).map(a => a.tReal / a.tAssumido).sort((x, y) => x - y);
if (razT.length) {
    console.log(`  razao real/assumido: mediana ${razT[Math.floor(razT.length / 2)].toFixed(2)}   ` +
        `p90 ${razT[Math.floor(razT.length * 0.9)].toFixed(2)}`);
}

console.log('\nCURVAS: o alvoDePasse extrapola em linha recta');
console.log(`  caminho andado no tempo assumido:   ${med(todas, a => a.andouNoTempoAssumido)} m`);
console.log(`  deslocamento em linha recta:        ${med(todas, a => a.deslocReto)} m`);
{
    const r = todas.filter(a => a.andouNoTempoAssumido > 1)
        .map(a => a.deslocReto / a.andouNoTempoAssumido).sort((x, y) => x - y);
    if (r.length) {
        console.log(`  razao recta/caminho: mediana ${r[Math.floor(r.length / 2)].toFixed(2)}   ` +
            `p10 ${r[Math.floor(r.length * 0.1)].toFixed(2)}`);
        console.log('  (1.00 = correu a direito; 0.5 = metade do caminho foi curva)');
    }
}

console.log('\nLEAD');
console.log(`  adiantamento pedido:      ${med(todas, a => a.leadPedido)} m`);
console.log(`  caminho real do recetor:  ${med(todas, a => a.andouReal)} m`);
console.log(`  erro final (ponto mirado -> onde ele estava): ${med(todas, a => a.erroLead)} m`);

const porFaixa = [[0, 10], [10, 20], [20, 60]];
console.log('\npor distancia de passe:');
for (const [lo, hi] of porFaixa) {
    const sub = todas.filter(a => a.dist >= lo && a.dist < hi);
    if (sub.length < 5) continue;
    console.log(`  ${lo}-${hi}m  n=${String(sub.length).padStart(4)}  ` +
        `vAssum ${String(med(sub, a => a.vAssumida)).padStart(5)}  vReal ${String(med(sub, a => a.vReal)).padStart(5)}  ` +
        `tAssum ${String(med(sub, a => a.tAssumido)).padStart(5)}  tReal ${String(med(sub, a => a.tReal)).padStart(5)}  ` +
        `erroLead ${String(med(sub, a => a.erroLead)).padStart(5)} m`);
}
