const fs = require('fs');
const file = 'js/bt/team_bt.js';
let content = fs.readFileSync(file, 'utf8');

const search = `    bb.bloco = {
        x0: x0,
        x1: x1,
        z0: z0,
        z1: z1,
        zDef: z0,
        zMid: z0 + (z1 - z0) / 3,
        zAtk: z0 + 2 * (z1 - z0) / 3,
        modo: modo
    };`;

const replace = `    let zMidBase = z0 + (z1 - z0) / 3;
    let zAtkBase = z0 + 2 * (z1 - z0) / 3;

    // Pedido: O centro do retângulo médio tem que ficar uns 10 metros a frente da bola no setor de meio de campo.
    // Consideramos o "setor de meio de campo" do campo entre -17.5m e +17.5m, ou apenas a linha dos médios.
    // Vamos garantir que a linha média fique uns 10m à frente da bola.
    let zMidAlvo = bolaZDir + 10.0;
    
    // Suaviza a transição garantindo que zMid fica entre zDef e zAtk
    zMidBase = Math.max(z0 + 2.0, Math.min(zMidAlvo, zAtkBase - 2.0));

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

content = content.replace(search, replace);
fs.writeFileSync(file, content);
console.log("Patch 5 applied.");
