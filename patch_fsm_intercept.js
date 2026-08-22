const fs = require('fs');
let code = fs.readFileSync('js/fsm.js', 'utf8');

const matchDribble = `if (newState === 'SLIDE_TACKLE') this.p.showActionBanner('S.TACKLE');`;
const replaceDribble = `if (newState === 'SLIDE_TACKLE') this.p.showActionBanner('S.TACKLE');
        if (newState === 'INTERCEPT') this.p.showActionBanner('INTERCEPT');`;
code = code.replace(matchDribble, replaceDribble);

fs.writeFileSync('js/fsm.js', code);
console.log("Patched fsm.js intercept");
