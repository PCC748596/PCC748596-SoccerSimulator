const fs = require('fs');
let code = fs.readFileSync('js/player.js', 'utf8');

code = code.replace(
    /let priorityBonus = 0;/,
    `let priorityBonus = 0;
            // Bónus MASSIVO para jogadores a infiltrar (desmarcação / corridas)
            if (opt.fsm && opt.fsm.currentState === 'RUN_INTO_SPACE') {
                priorityBonus += 400; 
            }`
);

fs.writeFileSync('js/player.js', code);
console.log('Patched player.js with pass bonus for infiltration');
