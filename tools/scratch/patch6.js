const fs = require('fs');
const file = 'js/bt/team_bt.js';
let content = fs.readFileSync(file, 'utf8');

const search = `    let zMidAlvo = bolaZDir + 10.0;
    
    // Suaviza a transição garantindo que zMid fica entre zDef e zAtk
    zMidBase = Math.max(z0 + 2.0, Math.min(zMidAlvo, zAtkBase - 2.0));`;

const replace = `    let zMidAlvo = bolaZDir + 10.0;
    
    // Se a bola estiver no setor de meio-campo (entre as intermediárias, aprox -18 a 18)
    if (Math.abs(bb.ballZ) < 20.0) {
        zMidBase = Math.max(z0 + 2.0, Math.min(zMidAlvo, zAtkBase - 2.0));
    } else {
        // Interpola suavemente nas pontas para não dar salto brusco
        let distanceToMid = Math.abs(Math.abs(bb.ballZ) - 20.0);
        let factor = Math.max(0, 1.0 - (distanceToMid / 10.0));
        let clampedAlvo = Math.max(z0 + 2.0, Math.min(zMidAlvo, zAtkBase - 2.0));
        zMidBase = zMidBase * (1 - factor) + clampedAlvo * factor;
    }`;

content = content.replace(search, replace);
fs.writeFileSync(file, content);
console.log("Patch 6 applied.");
