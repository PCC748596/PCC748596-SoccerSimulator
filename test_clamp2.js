const BlockShape = { seguimentoBola: 1.0 };
function seguirBola(actual, alvo, k, dt, reposta) {
    if (reposta || dt >= 1) return alvo;
    const passo = 1 - Math.exp(-k * dt);
    return actual + (alvo - actual) * passo;
}
let bb = { team: 'TeamA', possessionTime: 0 };
let z0 = 15;
let z0Novo = -18.25;
let dtMatch = 0.016;
let reposta = false;

const keyOffset = 'z0ClampOffset' + bb.team;

for(let i=0; i<60; i++) {
    const offsetAlvo = z0Novo - z0;
    if (bb[keyOffset] === undefined || bb.possessionTime === 0) {
        bb[keyOffset] = 0;
    }
    bb[keyOffset] = seguirBola(bb[keyOffset], offsetAlvo, BlockShape.seguimentoBola, dtMatch, reposta);
    bb.possessionTime += dtMatch;
}
console.log("After 1s offset:", bb[keyOffset]);
