const profundidade = 30; // short
let bloco = {
    z0: -20,
    z1: 10,
    zDef: -20,
    zMid: -5,
    zAtk: 10
};
let CAMPO_COMP = 106;
let CAMPO_LARG = 68;

function calc(pos, v, u, bolaZDir, dir) {
    let targetZRaw;
    if (v < 0.5) {
        targetZRaw = bloco.zDef + (v / 0.5) * (bloco.zMid - bloco.zDef);
    } else {
        targetZRaw = bloco.zMid + ((v - 0.5) / 0.5) * (bloco.zAtk - bloco.zMid);
    }
    
    let zTarget = (targetZRaw) * dir;
    let zAlvoDir = zTarget * dir;
    let distTras = 15;
    
    if (zAlvoDir < bolaZDir - distTras) {
        zAlvoDir = bolaZDir - distTras;
    }
    
    if (pos === 'CB') {
        const limiteCirculo = 0.0;
        const zMidDir = bloco.z0 + 0.45 * (bloco.z1 - bloco.z0);
        const zDefTeto = zMidDir - 3.5;
        const zCBAcompanha = Math.min(limiteCirculo, zDefTeto);
        if (zAlvoDir > zCBAcompanha) {
            zAlvoDir = zCBAcompanha;
        }
    }
    return zAlvoDir;
}

console.log("CB 1:", calc('CB', 0, 0.3, 20, 1));
console.log("CB 2:", calc('CB', 0, 0.7, 20, 1));
