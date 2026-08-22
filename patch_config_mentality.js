const fs = require('fs');

// Patch index.html
let index = fs.readFileSync('index.html', 'utf8');
index = index.replace('<option value="muito_defensiva">Muito Defensiva (-10m)</option>', '<option value="muito_defensiva">Muito Defensiva (-7m)</option>');
index = index.replace('<option value="defesa">Defensiva (-5m)</option>', '<option value="defesa">Defensiva (-7m)</option>');
fs.writeFileSync('index.html', index);

// Patch config.js
let config = fs.readFileSync('js/config.js', 'utf8');
config = config.replace(/muito_defensiva:\s*\{\s*agressao:\s*0\.20,\s*blocoZ:\s*-10\.0/, 'muito_defensiva: {\n        agressao: 0.20,\n        blocoZ: -7.0');
config = config.replace(/defesa:\s*\{\s*agressao:\s*0\.35,\s*blocoZ:\s*-5\.0/, 'defesa: {\n        agressao: 0.35,\n        blocoZ: -7.0');
fs.writeFileSync('js/config.js', config);

console.log("Patched!");
