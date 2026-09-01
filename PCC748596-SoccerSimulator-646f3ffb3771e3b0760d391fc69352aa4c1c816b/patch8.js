const fs = require('fs');
const file = 'js/bt/team_bt.js';
let content = fs.readFileSync(file, 'utf8');

const search = `    let zMidBase = z0 + (z1 - z0) / 3;
    let zAtkBase = z0 + 2 * (z1 - z0) / 3;

    // Pedido: O centro do retângulo médio tem que ficar uns 10 metros a frente da bola no setor de meio de campo.
    // Consideramos o "setor de meio de campo" do campo entre -17.5m e +17.5m, ou apenas a linha dos médios.
    // Vamos garantir que a linha média fique uns 10m à frente da bola.
    let zMidAlvo = bolaZDir + 10.0;
    
    // Se a bola estiver no setor de meio-campo (entre as intermediárias, aprox -18 a 18)
    let bZ = bb.ballZ || 0;
    if (Math.abs(bZ) < 20.0) {
        zMidBase = Math.max(z0 + 2.0, Math.min(zMidAlvo, zAtkBase - 2.0));
    } else {
        // Interpola suavemente nas pontas para não dar salto brusco
        let distanceToMid = Math.abs(Math.abs(bZ) - 20.0);
        let factor = Math.max(0, 1.0 - (distanceToMid / 10.0));
        let clampedAlvo = Math.max(z0 + 2.0, Math.min(zMidAlvo, zAtkBase - 2.0));
        zMidBase = zMidBase * (1 - factor) + clampedAlvo * factor;
    }

    bb.bloco = {
        x0: x0,
        x1: x1,
        z0: z0,
        z1: z1,
        zDef: z0,
        zMid: zMidBase,
        zAtk: zAtkBase,
        modo: modo
    };`;

const replace = `    bb.bloco = {
        x0: x0,
        x1: x1,
        z0: z0,
        z1: z1,
        zDef: z0,
        zMid: z0 + (z1 - z0) / 3,
        zAtk: z0 + 2 * (z1 - z0) / 3,
        modo: modo
    };`;

content = content.replace(search, replace);
fs.writeFileSync(file, content);
console.log("Patch 8 applied.");
