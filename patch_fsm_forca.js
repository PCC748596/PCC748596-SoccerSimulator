const fs = require('fs');
let code = fs.readFileSync('js/fsm.js', 'utf8');

const targetStr = `    // O erro (Skill do passador) já foi aplicado na distToTarget lá em cima,
    // para não quebrar a escala não-linear da balística.
    if (!usouBalistica) {
        forcaPasse *= 1.0 + ((TeamSkills[p.team].mid - 50) / 100) * 0.4;
    }`;

const replaceStr = `    // Redução de 15% da força pedida: lançamentos longos e lançamentos para as laterais
    if (ehLancamento) {
        let isLongo = distToTarget > 20.0;
        let isLateral = Math.abs(dirX) > Math.abs(dirZ);
        if (isLongo || isLateral) {
            forcaPasse *= 0.85;
            Match.ballVel.y *= 0.85;
        }
    }

    // O erro (Skill do passador) já foi aplicado na distToTarget lá em cima,
    // para não quebrar a escala não-linear da balística.
    if (!usouBalistica) {
        forcaPasse *= 1.0 + ((TeamSkills[p.team].mid - 50) / 100) * 0.4;
    }`;

code = code.replace(targetStr, replaceStr);
fs.writeFileSync('js/fsm.js', code);
console.log("Patched pass power in fsm.js");
