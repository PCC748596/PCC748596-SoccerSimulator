const BlockShape = { seguimentoBola: 1.0 };
function seguirBola(actual, alvo, k, dt, reposta) {
    if (reposta || dt >= 1) return alvo;
    const passo = 1 - Math.exp(-k * dt);
    return actual + (alvo - actual) * passo;
}
let bb = { team: 'TeamA', possessionTime: 0, z0ClampOffsetTeamA: undefined };
let z0 = 15;
let z0Novo = -18.25;
let dtMatch = 0.016;
let reposta = false;

const offsetAlvo = z0Novo - z0;
const keyOffset = 'z0ClampOffset' + bb.team;

if (bb[keyOffset] === undefined || bb.possessionTime === 0) {
    if (bb.possessionTime === 0) {
        bb[keyOffset] = 0;
    } else {
        bb[keyOffset] = offsetAlvo;
    }
}
console.log("Frame 1 offset:", bb[keyOffset]);
bb[keyOffset] = seguirBola(bb[keyOffset], offsetAlvo, BlockShape.seguimentoBola, dtMatch, reposta);
console.log("Frame 1 smoothed:", bb[keyOffset]);
