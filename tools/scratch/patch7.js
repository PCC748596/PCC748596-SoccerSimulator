const fs = require('fs');
const file = 'js/bt/team_bt.js';
let content = fs.readFileSync(file, 'utf8');

const search = `    // Se a bola estiver no setor de meio-campo (entre as intermediárias, aprox -18 a 18)
    if (Math.abs(bb.ballZ) < 20.0) {
        zMidBase = Math.max(z0 + 2.0, Math.min(zMidAlvo, zAtkBase - 2.0));
    } else {
        // Interpola suavemente nas pontas para não dar salto brusco
        let distanceToMid = Math.abs(Math.abs(bb.ballZ) - 20.0);`;

const replace = `    // Se a bola estiver no setor de meio-campo (entre as intermediárias, aprox -18 a 18)
    let bZ = bb.ballZ || 0;
    if (Math.abs(bZ) < 20.0) {
        zMidBase = Math.max(z0 + 2.0, Math.min(zMidAlvo, zAtkBase - 2.0));
    } else {
        // Interpola suavemente nas pontas para não dar salto brusco
        let distanceToMid = Math.abs(Math.abs(bZ) - 20.0);`;

content = content.replace(search, replace);
fs.writeFileSync(file, content);
console.log("Patch 7 applied.");
