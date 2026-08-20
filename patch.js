const fs = require('fs');
let code = fs.readFileSync('js/match.js', 'utf8');

code = code.replace(/ \/\/ clean\s*/, '');

fs.writeFileSync('js/match.js', code);
