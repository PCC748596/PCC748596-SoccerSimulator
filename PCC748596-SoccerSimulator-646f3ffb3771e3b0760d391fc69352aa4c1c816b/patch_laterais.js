const fs = require('fs');
const file = 'js/bt/team_bt.js';
let content = fs.readFileSync(file, 'utf8');

const search = `        const isEstiloOfensivo = typeof Tatics !== 'undefined' && 
            (Tatics.estilo === 'ataque' || Tatics.estilo === 'muito_ofensiva');
        const isWideRole = pos === 'LB' || pos === 'RB' || pos === 'LM' || pos === 'RM';
        let forceOffensiveWide = isEstiloOfensivo && isWideRole;

        if (forceOffensiveWide) {
            // Pedido: laterais e meias pelas laterais sempre uns 5 metros a frente da linha da bola
            zAlvoDir = Math.max(zAlvoDir, bolaZDir + 5.0);
        }`;

const replace = `        const isWideRole = pos === 'LB' || pos === 'RB' || pos === 'LM' || pos === 'RM';
        let forceOffensiveWide = isWideRole; // Aplica-se na T.Ofensiva e Ofensiva (que é bb.isAttacking)

        if (forceOffensiveWide) {
            // Pedido: laterais e meias pelas laterais tem que se projetar uns 7 metros a frente da posição do teamsBT
            zAlvoDir += 7.0;
        }`;

content = content.replace(search, replace);
fs.writeFileSync(file, content);
console.log("Patch applied for laterais.");
