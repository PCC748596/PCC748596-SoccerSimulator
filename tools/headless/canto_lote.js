/*
LOTE DE CANTOS forçados: mede a marcação e a disputa aérea sem esperar que o
jogo produza cantos (produz 0.2 por jogo — ver "Problemas conhecidos").

Uso: node tools/headless/canto_lote.js [quantos]
*/
require('./harness.js');

const quantos = Number(process.argv[2] || 40);
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const naArea = (p, dirAtaque) => {
    const linha = dirAtaque * (CAMPO_COMP / 2);
    const dz = (linha - p.model.position.z) * dirAtaque;
    return dz >= -0.5 && dz <= 16.5 && Math.abs(p.model.position.x) <= 20.16;
};
const media = a => a.length ? (a.reduce((s, v) => s + v, 0) / a.length) : 0;

const distNoCruzamento = [], defsDentro = [], saltosMax = [], disputas = [];
const estadosDef = {};
let comDisputa = 0, tocouAlguem = 0, golos = 0;
const alturasNaArea = [];
const linhaTempo = {};

for (let n = 0; n < quantos; n++) {
    const equipa = (n % 2 === 0) ? 'TeamA' : 'TeamB';
    Match.setupSetPiece('CORNER_KICK', equipa);
    const atacantes = (equipa === 'TeamA') ? Match.players : Match.opponents;
    const defensores = (equipa === 'TeamA') ? Match.opponents : Match.players;
    const dirAtaque = atacantes.find(p => p.role !== 'gk').dirZ;

    let saiu2 = false, tSaida = 0;
    let saiu = false, maxNoAr = 0, disputaMax = 0, medido = false, quemTocou = null;
    for (let i = 0; i < Math.round(14 / dt); i++) {
        Match.update(dt);
        if (!saiu && Match.state === 'PLAY' && Match.ball.position.y > 1.0) saiu = true;
        if (!saiu) continue;

        const noAr = Match.players.concat(Match.opponents)
            .filter(p => p.role !== 'gk' && (p.jumpTimer || 0) > 0);
        if (noAr.length > maxNoAr) maxNoAr = noAr.length;
        let d = 0;
        for (const a of noAr) for (const b of noAr) {
            if (a === b || a.team === b.team) continue;
            if (a.model.position.distanceTo(b.model.position) < 2.5) d++;
        }
        if (d / 2 > disputaMax) disputaMax = d / 2;

        // Retrato no instante em que a bola entra na área, pelo ar.
        const dz = (dirAtaque * (CAMPO_COMP / 2) - Match.ball.position.z) * dirAtaque;
        if (!medido && dz < 14 && dz > 0 && Match.ball.position.y > 1.0) {
            medido = true;
            let dentro = 0;
            for (const dd of defensores) {
                if (dd.role === 'gk') continue;
                if (naArea(dd, dirAtaque)) dentro++;
                estadosDef[dd.fsm.currentState] = (estadosDef[dd.fsm.currentState] || 0) + 1;
            }
            defsDentro.push(dentro);
            for (const a of atacantes) {
                if (a.role === 'gk' || !naArea(a, dirAtaque)) continue;
                let melhor = 99;
                for (const dd of defensores) {
                    if (dd.role === 'gk') continue;
                    const x = dd.model.position.distanceTo(a.model.position);
                    if (x < melhor) melhor = x;
                }
                if (melhor < 90) distNoCruzamento.push(melhor);
            }
        }
        {
            const dzA = (dirAtaque * (CAMPO_COMP / 2) - Match.ball.position.z) * dirAtaque;
            if (saiu && dzA > 3 && dzA < 12 && Math.abs(Match.ball.position.x) < 12) {
                alturasNaArea.push(Match.ball.position.y);
            }
        }
        if (saiu) {
            const passo = Math.round((i * dt - tSaida) * 2) / 2;   // meio segundo
            if (passo >= 0 && passo <= 6) {
                let dentroT = 0;
                for (const dd of defensores) { if (dd.role !== 'gk' && naArea(dd, dirAtaque)) dentroT++; }
                (linhaTempo[passo] = linhaTempo[passo] || []).push(dentroT);
            }
        }
        if (!saiu2 && saiu) { saiu2 = true; tSaida = i * dt; }
        if (!quemTocou && Match.lastTouchedPlayer && Match.lastTouchedPlayer !== Match.setPieceTaker) {
            quemTocou = Match.lastTouchedPlayer;
        }
        if (Match.state === 'GOAL') { golos++; break; }
        if (Match.state !== 'PLAY' && saiu) break;
    }
    saltosMax.push(maxNoAr);
    disputas.push(disputaMax);
    if (disputaMax >= 1) comDisputa++;
    if (quemTocou) tocouAlguem++;
}

console.log(`cantos simulados: ${quantos}`);
console.log(`defensores dentro da area quando o cruzamento chega: media ${media(defsDentro).toFixed(1)} de 10`);
console.log(`defensor mais proximo de cada atacante da area: media ${media(distNoCruzamento).toFixed(2)} m`);
const dist = {};
saltosMax.forEach(v => { dist[v] = (dist[v] || 0) + 1; });
console.log(`maximo de jogadores NO AR ao mesmo tempo: media ${media(saltosMax).toFixed(2)}, maximo ${Math.max(0, ...saltosMax)}`);
console.log('  distribuicao: ' + Object.keys(dist).sort((a,b)=>a-b).map(k => `${k}=>${dist[k]}`).join(' '));
console.log(`golos de canto: ${golos} de ${quantos}`);
console.log(`cantos COM disputa aerea (dois adversarios a saltar a <2.5 m): ${comDisputa} de ${quantos}`);
console.log(`cantos em que alguem (que nao o batedor) tocou na bola: ${tocouAlguem} de ${quantos}`);
console.log(`altura da bola ao passar sobre o miolo da area: media ${media(alturasNaArea).toFixed(2)} m, maximo ${Math.max(0, ...alturasNaArea).toFixed(2)} m, amostras ${alturasNaArea.length}`);
console.log('defensores dentro da area, por segundo depois do cruzamento:');
for (const k of Object.keys(linhaTempo).map(Number).sort((a,b)=>a-b)) {
    console.log(`  +${k.toFixed(1)}s: ${media(linhaTempo[k]).toFixed(1)} de 10`);
}
console.log('estado dos defensores no cruzamento: ' + Object.entries(estadosDef).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' '));
