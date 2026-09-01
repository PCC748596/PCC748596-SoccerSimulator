/*
O QUE ACONTECE NUM CANTO depois de a bola sair do pé.

Mede, para cada canto: onde estão os defensores quando o cruzamento chega à
área, se ainda estão colados aos atacantes, e quantos saltam à bola.

Uso: node tools/headless/canto_marcacao.js [segundos]
*/
require('./harness.js');

const segundos = Number(process.argv[2] || 900);
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

let cantos = 0, medidos = 0;
let emCanto = false, equipaAtacante = null, cronometro = 0;
const somaDist = [], defsNaArea = [], saltos = [], saltosDisputa = [];
const estadosDef = {};

const naArea = (p, dirAtaque) => {
    const linha = dirAtaque * (CAMPO_COMP / 2);
    const dz = (linha - p.model.position.z) * dirAtaque;
    return dz >= 0 && dz <= 16.5 && Math.abs(p.model.position.x) <= 20.16;
};

for (let i = 0; i < Math.round(segundos / dt); i++) {
    const antes = Match.state;
    Match.update(dt);

    if (Match.state === 'CORNER_KICK' && antes !== 'CORNER_KICK') {
        cantos++;
        emCanto = true;
        equipaAtacante = Match.setPieceTaker ? Match.setPieceTaker.team : null;
        cronometro = 0;
    }

    if (emCanto) {
        cronometro += dt;
        // A bola saiu do pé: o Match volta a PLAY e a bola vai no ar.
        if (Match.state === 'PLAY' && Match.ball.position.y > 1.5) {
            const atacantes = (equipaAtacante === 'TeamA') ? Match.players : Match.opponents;
            const defensores = (equipaAtacante === 'TeamA') ? Match.opponents : Match.players;
            const dirAtaque = atacantes[1] ? atacantes[1].dirZ : 1;

            // Espera a bola chegar perto da área para tirar o retrato.
            const dz = (dirAtaque * (CAMPO_COMP / 2) - Match.ball.position.z) * dirAtaque;
            if (dz < 14 && dz > 0) {
                medidos++;
                let dentro = 0;
                for (const d of defensores) {
                    if (d.role === 'gk') continue;
                    if (naArea(d, dirAtaque)) dentro++;
                    const e = d.fsm.currentState;
                    estadosDef[e] = (estadosDef[e] || 0) + 1;
                }
                defsNaArea.push(dentro);

                // Para cada atacante na área, a que distância está o defensor
                // mais próximo (a "marcação").
                for (const a of atacantes) {
                    if (a.role === 'gk' || !naArea(a, dirAtaque)) continue;
                    let melhor = 99;
                    for (const d of defensores) {
                        if (d.role === 'gk') continue;
                        const dd = d.model.position.distanceTo(a.model.position);
                        if (dd < melhor) melhor = dd;
                    }
                    if (melhor < 90) somaDist.push(melhor);
                }

                // Saltos: quantos estão no ar, e quantos pares de equipas
                // OPOSTAS saltam ao mesmo tempo perto um do outro.
                const noAr = Match.players.concat(Match.opponents)
                    .filter(p => p.role !== 'gk' && (p.jumpTimer || 0) > 0);
                saltos.push(noAr.length);
                let disputa = 0;
                for (const a of noAr) for (const b of noAr) {
                    if (a === b || a.team === b.team) continue;
                    if (a.model.position.distanceTo(b.model.position) < 2.5) disputa++;
                }
                saltosDisputa.push(disputa / 2);
                emCanto = false;
            }
        }
        if (cronometro > 25) emCanto = false;
    }
}

const media = a => a.length ? (a.reduce((s, v) => s + v, 0) / a.length) : 0;
const mediana = a => { if (!a.length) return 0; const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };

console.log(`cantos: ${cantos}  |  retratos tirados (cruzamento a chegar): ${medidos}`);
console.log(`defensores DENTRO da área nesse instante: media ${media(defsNaArea).toFixed(1)} de 10  (mediana ${mediana(defsNaArea)})`);
console.log(`distancia do defensor mais proximo a cada atacante da area: media ${media(somaDist).toFixed(2)} m (mediana ${mediana(somaDist).toFixed(2)})`);
console.log(`jogadores NO AR nesse instante: media ${media(saltos).toFixed(2)}  (maximo ${Math.max(0, ...saltos)})`);
console.log(`DISPUTAS aereas (dois de equipas opostas a saltar a <2.5 m): total ${saltosDisputa.reduce((s, v) => s + v, 0)}`);
console.log('estado dos defensores: ' + Object.entries(estadosDef).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' '));
