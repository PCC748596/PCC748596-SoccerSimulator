const fs = require('fs');
const file = 'js/bt/team_bt.js';
let content = fs.readFileSync(file, 'utf8');

const search = `        let isGkHolding = typeof Match !== 'undefined' && Match.gkHoldingBall && Match.gkHoldingBall[p.team];
        let isGkCarrier = bb.carrier && bb.carrier.role === 'gk' && bb.carrier.team === p.team;
        let gkComBola = isGkHolding || isGkCarrier;
        let portadorBloqueado = false;
        
        if (bb.carrier && bb.carrier.team === p.team && !gkComBola) {`;

const replace = `        let isGkHolding = typeof Match !== 'undefined' && Match.gkHoldingBall && Match.gkHoldingBall[bb.team];
        let isGkCarrier = bb.carrier && bb.carrier.role === 'gk' && bb.carrier.team === bb.team;
        let gkComBola = isGkHolding || isGkCarrier;
        let portadorBloqueado = false;
        
        if (bb.carrier && bb.carrier.team === bb.team && !gkComBola) {`;

content = content.replace(search, replace);
fs.writeFileSync(file, content);
console.log("Patch 4 applied.");
