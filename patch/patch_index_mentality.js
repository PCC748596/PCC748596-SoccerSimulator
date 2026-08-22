const fs = require('fs');
let index = fs.readFileSync('index.html', 'utf8');
index = index.replace('<option value="muito_defensiva">Muito Defensiva (-7m recuo)</option>', '<option value="muito_defensiva">Muito Defensiva (-10m)</option>');
index = index.replace('<option value="defesa">Defensiva (-7m recuo)</option>', '<option value="defesa">Defensiva (-5m)</option>');
fs.writeFileSync('index.html', index);
