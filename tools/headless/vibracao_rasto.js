/*
O RASTO de um jogador que vibra à espera da bola: posição, alvo e velocidade,
frame a frame, para ver o que oscila primeiro.

Uso: node tools/headless/vibracao_rasto.js [segundos]
*/
require('./harness.js');

const segundos = Number(process.argv[2] || 400);
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const hist = new Map();
for (const p of Match.players.concat(Match.opponents)) hist.set(p, []);
let feito = false;

for (let i = 0; i < Math.round(segundos / dt) && !feito; i++) {
    Match.update(dt);

    for (const p of Match.players.concat(Match.opponents)) {
        if (p.role === 'gk') continue;
        const h = hist.get(p);
        h.push({
            t: i * dt,
            x: p.model.position.x, z: p.model.position.z,
            vx: p.velocity.x, vz: p.velocity.z,
            ax: p.dynamicTarget.x, az: p.dynamicTarget.z,
            tx: p.tacticalTarget ? p.tacticalTarget.x : null,
            tz: p.tacticalTarget ? p.tacticalTarget.z : null,
            fsm: p.fsm.currentState,
            recv: Match.intendedReceiver === p,
            espera: !!p.__esperou
        });
        if (h.length > 60) h.shift();

        /*
        Critério: quase parado durante um segundo inteiro (deslocação líquida
        < 0.6 m) mas com o alvo LONGE (> 1.5 m). Quem está no alvo pode estar
        parado com razão; quem tem o alvo a três metros e não anda, não.
        */
        if (h.length === 60 && !feito) {
            const a = h[0], b = h[h.length - 1];
            const liquido = Math.hypot(b.x - a.x, b.z - a.z);
            const distAlvo = Math.hypot(b.ax - b.x, b.az - b.z);
            let inversoes = 0;
            for (let k = 1; k < h.length; k++) {
                const d = h[k].vx * h[k - 1].vx + h[k].vz * h[k - 1].vz;
                if (d < 0) inversoes++;
            }
            if (liquido < 0.6 && distAlvo > 1.5 && inversoes >= 12) {
                feito = true;
                console.log(`=== ${p.team} ${p.pos} | liquido ${liquido.toFixed(2)} m em 1 s, ` +
                    `alvo a ${distAlvo.toFixed(2)} m, ${inversoes} inversões ===`);
                h.forEach(o => console.log(
                    `t=${o.t.toFixed(2)} pos=(${o.x.toFixed(2)},${o.z.toFixed(2)}) ` +
                    `v=(${o.vx.toFixed(2)},${o.vz.toFixed(2)}) ` +
                    `alvo=(${o.ax.toFixed(2)},${o.az.toFixed(2)}) ` +
                    `tact=(${o.tx === null ? '-' : o.tx.toFixed(2)},${o.tz === null ? '-' : o.tz.toFixed(2)}) ` +
                    `${o.fsm}${o.recv ? ' RECV' : ''}`));
            }
        }
    }
}
if (!feito) console.log('nenhum caso encontrado');
