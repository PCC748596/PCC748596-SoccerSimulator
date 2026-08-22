const fs = require('fs');
let code = fs.readFileSync('js/fsm.js', 'utf8');

const matchDribble = "this.currentState = newState; this.timer = 0;";
const replaceDribble = `this.currentState = newState; this.timer = 0;
        if (newState === 'DRIBBLE') this.p.showActionBanner('DRIBBLE');
        if (newState === 'TACKLE') this.p.showActionBanner('TACKLE');
        if (newState === 'SLIDE_TACKLE') this.p.showActionBanner('S.TACKLE');`;
code = code.replace(matchDribble, replaceDribble);

fs.writeFileSync('js/fsm.js', code);
console.log("Patched fsm.js");
