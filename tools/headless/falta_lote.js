/*
LOTE DE FALTAS forçadas: mede a distância da barreira à bola ao longo do lance
e o que o batedor decide fazer, por posição no campo.

Uso: node tools/headless/falta_lote.js [quantas]
*/
require('./harness.js');

const quantas = Number(process.argv[2] || 60);
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const media = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
const decisoes = {};
const distNoSetup = [], distNaBatida = [], minNaBatida = [];
let violacoes = 0, comBarreira = 0, remates = 0;
const desfecho = { golo: 0, fora: 0, canto: 0, emJogo: 0 };
const alvos = {};
let golosCruz = 0;
const porZona = {};

for (let n = 0; n < quantas; n++) {
    const equipa = (n % 2 === 0) ? 'TeamA' : 'TeamB';
    const atac = (equipa === 'TeamA') ? Match.players : Match.opponents;
    const dir = atac.find(p => p.role !== 'gk').dirZ;

    // Espalha as faltas pelo terço ofensivo: distâncias e ângulos variados.
    const distGol = 14 + (n % 6) * 5;               // 14 .. 39 m
    const lateral = ((n % 7) - 3) * 6;              // -18 .. +18 m
    const z = dir * (CAMPO_COMP / 2) - dir * distGol;
    Match.ball.position.set(lateral, BallPhysics.raio, z);
    Match.ballVel.set(0, 0, 0);
    Match.state = 'PLAY';
    Match.setupSetPiece('FREE_KICK', equipa);

    const def = (equipa === 'TeamA') ? Match.opponents : Match.players;
    const bola = { x: lateral, z: z };
    const naBarreira = def.filter(p => p.role !== 'gk')
        .sort((a, b) => a.model.position.distanceTo(Match.ball.position) - b.model.position.distanceTo(Match.ball.position))
        .slice(0, 4);

    const dSetup = media(naBarreira.map(p => Math.hypot(p.model.position.x - bola.x, p.model.position.z - bola.z)));
    distNoSetup.push(dSetup);

    let decidiu = null, medidoNaBatida = false;
    const origRemate = FootballPlayer.prototype.initiateShoot;
    for (let i = 0; i < Math.round(8 / dt); i++) {
        const antes = Match.state;
        Match.update(dt);
        // A batida: o Match.state passa a PLAY no contactTime do gesto.
        if (!medidoNaBatida && antes === 'FREE_KICK' && Match.state === 'PLAY') {
            medidoNaBatida = true;
            const ds = naBarreira.map(p => Math.hypot(p.model.position.x - bola.x, p.model.position.z - bola.z));
            distNaBatida.push(media(ds));
            const menor = Math.min(...def.filter(p => p.role !== 'gk')
                .map(p => Math.hypot(p.model.position.x - bola.x, p.model.position.z - bola.z)));
            minNaBatida.push(menor);
            if (menor < 9.15 - 0.5) violacoes++;
            comBarreira++;
        }
        if (!decidiu && Match.setPieceTaker) {
            const s = Match.setPieceTaker.fsm.currentState;
            if (medidoNaBatida && (s === 'SHOOT' || s === 'PASS' || s === 'CROSS')) decidiu = s;
        }
        if (medidoNaBatida && Match.state !== 'PLAY') break;
    }
    // Desfecho, só nas que são batida directa.
    const dPre = (typeof decisaoDeFalta === 'function') ? decisaoDeFalta(bola.x, bola.z, dir) : '?';

    // Que cruzamento saiu, e o que deu.
    if (dPre === 'cruzamento') {
        for (let i = 0; i < Math.round(6 / dt); i++) {
            Match.update(dt);
            if (Match.state === 'GOAL') break;
        }
        const nome = Match.ultimoCruzamentoDeFalta || '?';
        alvos[nome] = (alvos[nome] || 0) + 1;
        if (Match.state === 'GOAL') golosCruz++;
    }
    if (dPre === 'remate') {
        remates++;
        const linha = dir * (CAMPO_COMP / 2);
        // Deixa o lance correr mais um pouco para o desfecho assentar.
        for (let i = 0; i < Math.round(4 / dt); i++) {
            Match.update(dt);
            if (Match.state === 'GOAL') break;
        }
        if (Match.state === 'GOAL') desfecho.golo++;
        else if (Match.state === 'GOAL_KICK') desfecho.fora++;
        else if (Match.state === 'CORNER_KICK') desfecho.canto++;
        else desfecho.emJogo++;
    }
    const d = dPre;
    decisoes[d] = (decisoes[d] || 0) + 1;
    const chave = `${distGol}m/|x|=${Math.abs(lateral)}`;
    porZona[chave] = d;
}

console.log(`faltas: ${quantas}  (batidas medidas: ${comBarreira})`);
console.log(`barreira: ${media(distNoSetup).toFixed(2)} m no setup  ->  ${media(distNaBatida).toFixed(2)} m na batida`);
console.log(`defensor MAIS PERTO na batida: media ${media(minNaBatida).toFixed(2)} m  (minimo ${Math.min(...minNaBatida).toFixed(2)} m)`);
console.log(`batidas com alguem a menos de 9.15 m: ${violacoes} de ${comBarreira}`);
console.log(`desfecho das ${remates} batidas directas: golo=${desfecho.golo} fora/tiro-de-meta=${desfecho.fora} canto=${desfecho.canto} bola em jogo=${desfecho.emJogo}`);
console.log(`cruzamentos por alvo: ${JSON.stringify(alvos)} | golos directos deles: ${golosCruz}`);
console.log('decisao do batedor: ' + Object.entries(decisoes).map(([k, v]) => `${k}=${v}`).join(' '));
console.log('\nmapa (distancia ao golo / afastamento lateral -> decisao):');
for (const k of Object.keys(porZona)) console.log(`  ${k.padEnd(14)} ${porZona[k]}`);
