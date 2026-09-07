const fs = require('fs');
let code = fs.readFileSync('js/bt/player_bt.js', 'utf8');

code = code.replace(
    /const p = ctx\.p;\s*if \(\(p\.pos === 'CF'/g,
    `if ((p.pos === 'CF'`
);

fs.writeFileSync('js/bt/player_bt.js', code);
console.log('Fixed syntax in player_bt.js');
