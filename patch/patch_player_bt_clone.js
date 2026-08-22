const fs = require('fs');
let code = fs.readFileSync('js/bt/player_bt.js', 'utf8');

code = code.replace(/opp\.model\.position\.clone\(\)\.setY\(0\)/g,
  "_v2.copy(opp.model.position).setY(0)");

fs.writeFileSync('js/bt/player_bt.js', code);
console.log("Patched player_bt clone!");
