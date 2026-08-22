const fs = require('fs');

let code = fs.readFileSync('js/bt/team_bt.js', 'utf8');
code = code.replace(/stateOffset = 7\.0;/, 'stateOffset = -7.0;');
fs.writeFileSync('js/bt/team_bt.js', code);

let index = fs.readFileSync('index.html', 'utf8');
index = index.replace(/0\.0585/g, '0.0586');
// Update index UI label so the user understands
index = index.replace('<option value="muito_defensiva">Muito Defensiva (+7m)</option>', '<option value="muito_defensiva">Muito Defensiva (-7m recuo)</option>');
index = index.replace('<option value="defesa">Defensiva (+7m)</option>', '<option value="defesa">Defensiva (-7m recuo)</option>');
fs.writeFileSync('index.html', index);
