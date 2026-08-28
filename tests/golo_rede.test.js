/*
Regressão: depois de um GOLO a bola não pode ser congelada em cima da linha,
fora da baliza.

O defeito: a bola entra, escorrega pelo pano de trás e desliza para o lado até
encostar ao pano lateral. `colidirComRede` fixa-a em |x| = LARGURA_BALIZA/2 - raio
(3.55), mas corre DEPOIS do bloco da linha de fundo — e esse bloco tratava
qualquer |x| >= LARGURA_BALIZA/2 - 0.1 (3.56) como "fora do vão", teleportando a
bola para z = CAMPO_COMP/2 e parando-a. A faixa entre 3.56 e 3.66 é, no entanto,
o interior da baliza: é lá que a bola descansa contra a rede lateral.

O teste corre a física real da bola (mesma integração do `updateBall`) contra a
`colidirComRede` extraída do `match.js`, e replica o ramo do bloco da linha de
fundo que congela a bola.
*/
const fs = require('fs');
const path = require('path');

const src = ['js/match/match_state.js', 'js/match/match_setup.js', 'js/match/match_physics.js', 'js/match/match_setpieces.js', 'js/match/match_loop.js', 'js/match/match_ui.js'].map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');

const LARGURA_BALIZA = 7.32, ALTURA_BALIZA = 2.44, CAMPO_COMP = 106;
const BallPhysics = {
    massa: 0.430, raio: 0.11, gravidade: 9.81, densidadeAr: 1.225, cd: 0.25,
    restituicao: 0.60, atritoRessalto: 0.75, atritoRolamento: 0.38,
    vMinRessalto: 0.6, vMinRolar: 0.25
};
BallPhysics.kArrasto = 0.5 * BallPhysics.densidadeAr * BallPhysics.cd *
    (Math.PI * BallPhysics.raio ** 2) / BallPhysics.massa;
const GoalNet = { profTopo: 0.8, profBase: 2.0, restituicao: 0.02, atrito: 0.35 };

// Extrai colidirComRede do match.js, para o teste correr o código de produção.
function extrair(nome) {
    const cabeca = `    ${nome}: function (zSinal) {`;
    const ini = src.indexOf(cabeca);
    if (ini < 0) throw new Error(`${nome} não encontrado em match`);
    const fim = src.indexOf('\n    },', ini);
    return src.slice(ini + cabeca.length, fim);
}

const colidirComRede = new Function('zSinal', `
    const LARGURA_BALIZA = ${LARGURA_BALIZA}, ALTURA_BALIZA = ${ALTURA_BALIZA};
    const CAMPO_COMP = ${CAMPO_COMP};
    const BallPhysics = this.BP, GoalNet = this.GN, NetWave = undefined;
    ${extrair('colidirComRede')}
`);

const B = BallPhysics;
const meiaLarg = LARGURA_BALIZA / 2;

function simularRemate({ dt, vz, vx, vy, x0, y0 }) {
    const M = {
        BP: B, GN: GoalNet, delta: dt,
        ball: { position: { x: x0, y: y0, z: CAMPO_COMP / 2 - 3.0 } },
        ballVel: { x: vx, y: vy, z: vz }
    };
    let golo = null, congelou = null;

    for (let i = 0; i < 900; i++) {
        const v = Math.hypot(M.ballVel.x, M.ballVel.y, M.ballVel.z);
        if (v > 0.001) {
            const dv = Math.min(v, B.kArrasto * v * v * dt);
            M.ballVel.x -= M.ballVel.x * dv / v;
            M.ballVel.y -= M.ballVel.y * dv / v;
            M.ballVel.z -= M.ballVel.z * dv / v;
        }
        if (M.ball.position.y > B.raio + 0.001) M.ballVel.y -= B.gravidade * dt;
        M.ball.position.x += M.ballVel.x * dt;
        M.ball.position.y += M.ballVel.y * dt;
        M.ball.position.z += M.ballVel.z * dt;

        if (M.ball.position.y <= B.raio) {
            M.ball.position.y = B.raio;
            if (M.ballVel.y < 0) {
                if (-M.ballVel.y > B.vMinRessalto) {
                    M.ballVel.y *= -B.restituicao;
                    M.ballVel.x *= B.atritoRessalto;
                    M.ballVel.z *= B.atritoRessalto;
                } else M.ballVel.y = 0;
            }
            const vh = Math.hypot(M.ballVel.x, M.ballVel.z);
            if (vh > 0.0001) {
                const dvh = Math.min(vh, B.atritoRolamento * B.gravidade * dt);
                M.ballVel.x -= M.ballVel.x / vh * dvh;
                M.ballVel.z -= M.ballVel.z / vh * dvh;
                if (Math.hypot(M.ballVel.x, M.ballVel.z) < B.vMinRolar && M.ballVel.y === 0) {
                    M.ballVel.x = 0; M.ballVel.z = 0;
                }
            }
        }

        if (Math.abs(M.ball.position.z) - B.raio > CAMPO_COMP / 2) {
            const noVao = Math.abs(M.ball.position.x) < meiaLarg - 0.1 &&
                M.ball.position.y < ALTURA_BALIZA;
            if (golo === null) golo = noVao;

            // Ramo real de match.js: jogo parado e a bola passa a linha fora do
            // vão -> teleporta para a linha e pára. Só deve disparar quando a
            // bola está mesmo fora da armação.
            if (golo === true && !noVao && !dentroDaArmacao(M) && congelou === null) {
                congelou = { x: M.ball.position.x, y: M.ball.position.y, frame: i };
                M.ball.position.z = (CAMPO_COMP / 2) * Math.sign(M.ball.position.z);
                M.ballVel.x = 0; M.ballVel.y = 0; M.ballVel.z = 0;
            }
            colidirComRede.call(M, Math.sign(M.ball.position.z) || 1);
        }
    }
    return { golo, congelou, x: M.ball.position.x, y: M.ball.position.y,
             d: Math.abs(M.ball.position.z) - CAMPO_COMP / 2 };
}

/*
A guarda que o match.js passa a usar, corrida a partir do próprio ficheiro: sem
ela (código antes do fix) o teste vê `false` e a bola é congelada, como era.
*/
const temGuarda = /^    dentroDaArmacao: function \(zSinal\) \{/m.test(src);
const guardaReal = temGuarda ? new Function('zSinal', `
    const LARGURA_BALIZA = ${LARGURA_BALIZA}, ALTURA_BALIZA = ${ALTURA_BALIZA};
    const CAMPO_COMP = ${CAMPO_COMP};
    const BallPhysics = this.BP, GoalNet = this.GN;
    ${extrair('dentroDaArmacao')}
`) : null;

function dentroDaArmacao(M) {
    if (!guardaReal) return false;
    return guardaReal.call(M, Math.sign(M.ball.position.z) || 1);
}

let golos = 0, presos = 0;
const exemplos = [];
for (const dt of [1 / 60, 1 / 30])
    for (const vz of [12, 18, 25, 32, 40])
        for (const vx of [-10, -6, -3, 0, 3, 6, 10])
            for (const x0 of [-3, -1.5, 0, 1.5, 3])
                for (const [y0, vy] of [[0.11, 0], [0.8, 1], [1.8, -2], [2.2, -1]]) {
                    const r = simularRemate({ dt, vz, vx, vy, x0, y0 });
                    if (r.golo !== true) continue;
                    golos++;
                    if (r.congelou) {
                        presos++;
                        if (exemplos.length < 5) exemplos.push(
                            `vz=${vz} vx=${vx} x0=${x0} y0=${y0} -> congelou em ` +
                            `x=${r.congelou.x.toFixed(2)} y=${r.congelou.y.toFixed(2)}`);
                    }
                }

console.log(`golos simulados: ${golos}`);
console.log(`bolas congeladas na linha depois do golo: ${presos}`);
exemplos.forEach(e => console.log('  ' + e));

if (presos > 0) {
    console.error(`\nFALHOU: ${presos} de ${golos} golos (${(100 * presos / golos).toFixed(1)}%) ` +
        `acabam com a bola parada em cima da linha, fora da baliza.`);
    process.exit(1);
}

// A bola tem de acabar dentro da armação em todos os golos.
let foraDaArmacao = 0;
for (const dt of [1 / 60, 1 / 30])
    for (const vz of [12, 25, 40])
        for (const vx of [-10, 0, 10])
            for (const x0 of [-3, 0, 3])
                for (const [y0, vy] of [[0.11, 0], [1.8, -2]]) {
                    const r = simularRemate({ dt, vz, vx, vy, x0, y0 });
                    if (r.golo !== true) continue;
                    if (Math.abs(r.x) > meiaLarg + 0.05 || r.d > GoalNet.profBase + 0.3 || r.d < 0) {
                        foraDaArmacao++;
                    }
                }
if (foraDaArmacao > 0) {
    console.error(`FALHOU: ${foraDaArmacao} golos acabam com a bola fora da armação.`);
    process.exit(1);
}

console.log('OK: nenhuma bola de golo fica presa em cima da linha.');
