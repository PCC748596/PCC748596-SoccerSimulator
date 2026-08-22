const fs = require('fs');
let code = fs.readFileSync('js/player.js', 'utf8');

code = code.replace(/Match\.ball\.position\.lerp\(this\.model\.position\.clone\(\)\.add\(maoOffset\)\.setY\(maoY\), 0\.5\);/g,
  "Match.ball.position.lerp(_v3.copy(this.model.position).add(maoOffset).setY(maoY), 0.5);");

code = code.replace(/Match\.ball\.position\.lerp\(this\.model\.position\.clone\(\)\.add\(footOffset\), 0\.5\);/g,
  "Match.ball.position.lerp(_v3.copy(this.model.position).add(footOffset), 0.5);");

fs.writeFileSync('js/player.js', code);
console.log("Patched player.js clones!");
