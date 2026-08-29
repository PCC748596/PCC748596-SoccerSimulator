const fs = require('fs');
let code = fs.readFileSync('js/crowd.js', 'utf8');
code = code.replace(/\*\/\s*\*\//g, '*/');
fs.writeFileSync('js/crowd.js', code);
