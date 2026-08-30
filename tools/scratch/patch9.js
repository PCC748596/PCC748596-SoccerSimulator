const fs = require('fs');
const file = 'js/bt/team_bt.js';
let content = fs.readFileSync(file, 'utf8');

const search = `    // Pedido: Na T.ofensive e Offensive no setor defensivo, o centro do retângulo de defesa 
    // tem que se manter uns 5 metros a frente da bola para puxar o time a frente.
    if (!bb.isAttacking && typeof Tatics !== 'undefined' && 
        (Tatics.estilo === 'ataque' || Tatics.estilo === 'muito_ofensiva')) {
        if (bb.bolaZSuave * bb.dir < 0) {
            targetOffsetZ = 5.0;
        }
    }`;

const replace = `    // Pedido: Na T.ofensive e Offensive no setor defensivo, o centro do retângulo de defesa 
    // tem que se manter uns 5 metros a frente da bola para puxar o time a frente.
    if (!bb.isAttacking && typeof Tatics !== 'undefined' && 
        (Tatics.estilo === 'ataque' || Tatics.estilo === 'muito_ofensiva')) {
        if (bb.bolaZSuave * bb.dir < 0) {
            targetOffsetZ = 5.0;
        }
    }

    // Pedido: O centro do retângulo médio tem que ficar uns 10 metros a frente da bola no setor de meio de campo.
    // O "centro do retângulo médio" é matematicamente igual ao centro do bloco (centroZ).
    let bZ = bb.ballZ || 0;
    if (Math.abs(bZ) < 20.0) {
        targetOffsetZ = 10.0;
    } else {
        let distanceToMid = Math.abs(Math.abs(bZ) - 20.0);
        let factor = Math.max(0, 1.0 - (distanceToMid / 10.0));
        targetOffsetZ = targetOffsetZ * (1 - factor) + 10.0 * factor;
    }`;

content = content.replace(search, replace);
fs.writeFileSync(file, content);
console.log("Patch 9 applied.");
