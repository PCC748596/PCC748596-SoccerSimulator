const fs = require('fs');
let code = fs.readFileSync('js/fsm.js', 'utf8');
code = code.replace("if (newState === 'BLOCKING') this.p.showActionBanner('BLOCK');", "if (newState === 'BLOCKING') this.p.showActionBanner('BLOCK');\n        if (newState === 'CHEST_CONTROL') this.p.showActionBanner('CHEST');");
fs.writeFileSync('js/fsm.js', code);
