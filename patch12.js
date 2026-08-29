const fs = require('fs');
const file = 'js/bt/team_bt.js';
let content = fs.readFileSync(file, 'utf8');

const search = `    // Pedido: O centro do retângulo médio tem que ficar uns 10 metros a frente da bola no setor de meio de campo.
    // O "centro do retângulo médio" é matematicamente igual ao centro do bloco (centroZ).
    // Ajustado para respeitar a geometria do bloco: se o offset for muito grande, a bola "cai" para o terço defensivo.
    let maxOffset = (profundidade / 6) - 0.5;
    let bZ = bb.ballZ || 0;
    if (bb.isAttacking) {
        let desiredOffset = Math.min(10.0, maxOffset);
        if (Math.abs(bZ) < 20.0) {
            targetOffsetZ = desiredOffset;
        } else {
            let distanceToMid = Math.abs(Math.abs(bZ) - 20.0);
            let factor = Math.max(0, 1.0 - (distanceToMid / 10.0));
            targetOffsetZ = targetOffsetZ * (1 - factor) + desiredOffset * factor;
        }
    }`;

const replace = `    // Pedido: O centro do retângulo médio tem que ficar uns 10 metros a frente da bola no setor de meio de campo.
    // O "centro do retângulo médio" é matematicamente igual ao centro do bloco (centroZ).
    let bZ = bb.ballZ || 0;
    if (bb.isAttacking) {
        if (Math.abs(bZ) < 20.0) {
            targetOffsetZ = 10.0;
        } else {
            let distanceToMid = Math.abs(Math.abs(bZ) - 20.0);
            let factor = Math.max(0, 1.0 - (distanceToMid / 10.0));
            targetOffsetZ = targetOffsetZ * (1 - factor) + 10.0 * factor;
        }
    }`;

content = content.replace(search, replace);
fs.writeFileSync(file, content);
console.log("Patch 12 applied.");
