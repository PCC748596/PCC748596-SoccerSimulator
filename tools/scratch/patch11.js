const fs = require('fs');
const file = 'js/bt/team_bt.js';
let content = fs.readFileSync(file, 'utf8');

const search = `        if (zAlvoDir < bolaZDir - distTras) {
            zAlvoDir = bolaZDir - distTras;
        }

        if (role === 'def') {
            const limiteCirculo = (typeof TeamShape !== 'undefined' && typeof TeamShape.limiteSaidaCirculoCentral === 'number')
                ? TeamShape.limiteSaidaCirculoCentral : 0.0;
            const zMidDir = bloco.z0 + 0.45 * (bloco.z1 - bloco.z0);
            const zDefTeto = zMidDir - 3.5;
            
            const zLatAcompanha = Math.min(limiteCirculo, zDefTeto + 1.5);
            const zCBAcompanha = Math.min(limiteCirculo, zDefTeto);
            
            if (pos === 'CB' && zAlvoDir > zCBAcompanha) {
                zAlvoDir = zCBAcompanha;
            } else if ((pos === 'LB' || pos === 'RB') && zAlvoDir > zLatAcompanha) {
                zAlvoDir = zLatAcompanha;
            }
        }

        const minZDef = -(CAMPO_COMP / 2 - 1.5);
        if (zAlvoDir < minZDef) zAlvoDir = minZDef;`;

const replace = `        if (zAlvoDir < bolaZDir - distTras) {
            zAlvoDir = bolaZDir - distTras;
        }

        const isEstiloOfensivo = typeof Tatics !== 'undefined' && 
            (Tatics.estilo === 'ataque' || Tatics.estilo === 'muito_ofensiva');
        const isWideRole = pos === 'LB' || pos === 'RB' || pos === 'LM' || pos === 'RM';
        let forceOffensiveWide = isEstiloOfensivo && isWideRole;

        if (forceOffensiveWide) {
            // Pedido: laterais e meias pelas laterais sempre uns 5 metros a frente da linha da bola
            zAlvoDir = Math.max(zAlvoDir, bolaZDir + 5.0);
        }

        if (role === 'def') {
            const limiteCirculo = (typeof TeamShape !== 'undefined' && typeof TeamShape.limiteSaidaCirculoCentral === 'number')
                ? TeamShape.limiteSaidaCirculoCentral : 0.0;
            const zMidDir = bloco.z0 + 0.45 * (bloco.z1 - bloco.z0);
            const zDefTeto = zMidDir - 3.5;
            
            const zLatAcompanha = Math.min(limiteCirculo, zDefTeto + 1.5);
            const zCBAcompanha = Math.min(limiteCirculo, zDefTeto);
            
            if (pos === 'CB' && zAlvoDir > zCBAcompanha) {
                zAlvoDir = zCBAcompanha;
            } else if ((pos === 'LB' || pos === 'RB') && zAlvoDir > zLatAcompanha && !forceOffensiveWide) {
                zAlvoDir = zLatAcompanha;
            }
        }

        const minZDef = -(CAMPO_COMP / 2 - 1.5);
        if (zAlvoDir < minZDef) zAlvoDir = minZDef;
        const maxZAtk = (CAMPO_COMP / 2 - 1.5);
        if (zAlvoDir > maxZAtk) zAlvoDir = maxZAtk;`;

content = content.replace(search, replace);
fs.writeFileSync(file, content);
console.log("Patch 11 applied.");
