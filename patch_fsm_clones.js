const fs = require('fs');
let code = fs.readFileSync('js/fsm.js', 'utf8');

code = code.replace(/Match\.ball\.position\.clone\(\)/g, "_v1.copy(Match.ball.position)");
code = code.replace(/Match\.cornerAlvo\.clone\(\)/g, "_v1.copy(Match.cornerAlvo)");
code = code.replace(/p\.velocity\.clone\(\)\.normalize\(\)/g, "_v1.copy(p.velocity).normalize()");
code = code.replace(/carrier\.velocity\.clone\(\)\.normalize\(\)/g, "_v1.copy(carrier.velocity).normalize()");
code = code.replace(/carrierSlide\.velocity\.clone\(\)\.normalize\(\)/g, "_v1.copy(carrierSlide.velocity).normalize()");

fs.writeFileSync('js/fsm.js', code);
console.log("Patched fsm clones!");
