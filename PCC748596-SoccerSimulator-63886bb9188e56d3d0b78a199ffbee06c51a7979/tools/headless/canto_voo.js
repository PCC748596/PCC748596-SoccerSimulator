/*
A TRAJECTÓRIA DO CANTO, frame a frame: onde é que a bola muda de velocidade
sem ninguém por perto.

Uso: node tools/headless/canto_voo.js [quantos]
*/
require('./harness.js');

const quantos = Number(process.argv[2] || 20);
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

let cortes = 0;
for (let n = 0; n < quantos; n++) {
    Match.setupSetPiece('CORNER_KICK', (n % 2 === 0) ? 'TeamA' : 'TeamB');
    let saiu = false, vAnt = null, mostrou = 0;
    for (let i = 0; i < Math.round(10 / dt); i++) {
        const antesPos = Match.ball.position.clone();
        Match.update(dt);
        const v = Match.ballVel.clone();
        if (!saiu && Match.state === 'PLAY' && v.y > 2) { saiu = true; vAnt = v.clone(); continue; }
        if (!saiu) continue;
        if (Match.ball.position.y < 0.5) break;

        // Variação esperada num frame: só a gravidade e o arrasto.
        const esperado = BallPhysics.gravidade * dt + BallPhysics.kArrasto * vAnt.lengthSq() * dt;
        const real = v.clone().sub(vAnt).length();
        if (real > esperado * 2.5 + 0.05) {
            let perto = 99, quem = null;
            for (const p of Match.players.concat(Match.opponents)) {
                const d = p.model.position.distanceTo(Match.ball.position);
                if (d < perto) { perto = d; quem = p; }
            }
            if (mostrou < 3) {
                mostrou++; cortes++;
                console.log(`canto ${n}: CORTE dv=${real.toFixed(2)} (esperado ${esperado.toFixed(2)}) | bola=(${antesPos.x.toFixed(1)},${antesPos.y.toFixed(2)},${antesPos.z.toFixed(1)}) -> (${Match.ball.position.x.toFixed(1)},${Match.ball.position.y.toFixed(2)},${Match.ball.position.z.toFixed(1)}) | v ${vAnt.length().toFixed(1)} -> ${v.length().toFixed(1)} | mais perto: ${quem.team} ${quem.pos} a ${perto.toFixed(2)} m | carrier=${Match.ballCarrier ? Match.ballCarrier.pos : '-'}`);
            }
        }
        vAnt = v.clone();
    }
}
console.log(`cortes detectados: ${cortes} em ${quantos} cantos`);
