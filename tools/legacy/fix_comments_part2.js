const fs = require('fs');
let code = fs.readFileSync('js/crowd.js', 'utf8');

code = code.replace(/sítio; mais vale gritar aqui do que descobrir no ecrã\.\n               \n                if/g, 'sítio; mais vale gritar aqui do que descobrir no ecrã.\n                */\n                if');
code = code.replace(/slots do hardware, e este era o mais fácil de dispensar\.\n               \n                if/g, 'slots do hardware, e este era o mais fácil de dispensar.\n                */\n                if');
code = code.replace(/e é aí que as duas claques se misturam\.\n   \n    claqueEm/g, 'e é aí que as duas claques se misturam.\n    */\n    claqueEm');

fs.writeFileSync('js/crowd.js', code);
