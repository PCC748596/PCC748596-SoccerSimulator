const fs = require('fs');
const file = 'js/bt/team_bt.js';
let content = fs.readFileSync(file, 'utf8');
const search = `    const targetOffsetZ = bb.isAttacking ? 5.0 : -5.0;`;
const replace = `    let targetOffsetZ = bb.isAttacking ? 5.0 : -5.0;

    // Pedido: Na T.ofensive e Offensive no setor defensivo, o centro do retângulo de defesa 
    // tem que se manter uns 5 metros a frente da bola para puxar o time a frente.
    if (!bb.isAttacking && typeof Tatics !== 'undefined' && 
        (Tatics.estilo === 'ataque' || Tatics.estilo === 'muito_ofensiva')) {
        if (bb.bolaZSuave * bb.dir < 0) {
            targetOffsetZ = 5.0;
        }
    }`;
content = content.replace(search, replace);
fs.writeFileSync(file, content);
console.log("Patch applied.");
