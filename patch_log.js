const fs = require('fs');
let code = fs.readFileSync('js/bt/player_bt.js', 'utf8');

code = code.replace(
    /p\.fsm\.changeState\('RUN_INTO_SPACE'\);/,
    `p.fsm.changeState('RUN_INTO_SPACE');
        console.log(p.pos + ' (' + p.id + ') is infiltrating! Target Z: ' + (avancoDestino * p.dirZ).toFixed(1));`
);

fs.writeFileSync('js/bt/player_bt.js', code);
console.log('Patched for logging');
