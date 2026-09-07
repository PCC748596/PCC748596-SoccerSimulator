const fs = require('fs');
let code = fs.readFileSync('js/fsm.js', 'utf8');

code = code.replace(
    /if \(newState === 'RUN_INTO_SPACE'\) this\.p\.showActionBanner\('RUN'\);/,
    `if (newState === 'RUN_INTO_SPACE') this.p.showActionBanner('INFILTRA 🏃');`
);

fs.writeFileSync('js/fsm.js', code);
console.log('Patched fsm.js banner');
