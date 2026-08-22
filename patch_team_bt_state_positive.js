const fs = require('fs');

let code = fs.readFileSync('js/bt/team_bt.js', 'utf8');
code = code.replace(/stateOffset = -7\.0;/, 'stateOffset = 7.0;');
fs.writeFileSync('js/bt/team_bt.js', code);

let index = fs.readFileSync('index.html', 'utf8');
index = index.replace(/0\.0584/g, '0.0585');
fs.writeFileSync('index.html', index);

console.log("Patched to +7.0!");
