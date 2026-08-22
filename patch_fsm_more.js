const fs = require('fs');
let code = fs.readFileSync('js/fsm.js', 'utf8');

const matchDribble = `if (newState === 'INTERCEPT') this.p.showActionBanner('INTERCEPT');`;
const replaceDribble = `if (newState === 'INTERCEPT') this.p.showActionBanner('INTERCEPT');
        if (newState === 'BLOCKING') this.p.showActionBanner('BLOCK');
        if (newState === 'RUN_INTO_SPACE') this.p.showActionBanner('RUN');`;
code = code.replace(matchDribble, replaceDribble);

fs.writeFileSync('js/fsm.js', code);
console.log("Patched fsm.js more");
