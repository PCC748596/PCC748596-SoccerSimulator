const fs = require('fs');
let code = fs.readFileSync('js/player.js', 'utf8');

code = code.replace(/this\.model\.position\.add\(this\.velocity\.clone\(\)\.multiplyScalar\(dt\)\);/g,
  "this.model.position.addScaledVector(this.velocity, dt);");

fs.writeFileSync('js/player.js', code);
console.log("Patched movement clone!");
