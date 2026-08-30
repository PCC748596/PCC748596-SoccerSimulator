const fs = require('fs');
const file = 'js/bt/team_bt.js';
let content = fs.readFileSync(file, 'utf8');

const search = `        let gkComBola = bb.ballCarrier && bb.ballCarrier.role === 'gk' && bb.ballCarrier.team === p.team;
        let portadorBloqueado = false;
        
        if (bb.ballCarrier && bb.ballCarrier.team === p.team && !gkComBola) {
            const oppCarrier = bb.oppCarrier;
            if (oppCarrier && bb.ballCarrier.model.position.distanceTo(oppCarrier.model.position) < 4.0) {`;

const replace = `        let isGkHolding = typeof Match !== 'undefined' && Match.gkHoldingBall && Match.gkHoldingBall[p.team];
        let isGkCarrier = bb.carrier && bb.carrier.role === 'gk' && bb.carrier.team === p.team;
        let gkComBola = isGkHolding || isGkCarrier;
        let portadorBloqueado = false;
        
        if (bb.carrier && bb.carrier.team === p.team && !gkComBola) {
            const oppCarrier = bb.oppCarrier;
            if (oppCarrier && bb.carrier.model.position.distanceTo(oppCarrier.model.position) < 4.0) {`;

content = content.replace(search, replace);
fs.writeFileSync(file, content);
console.log("Patch 2 applied.");
