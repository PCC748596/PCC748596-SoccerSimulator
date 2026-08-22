const fs = require('fs');
let code = fs.readFileSync('js/match.js', 'utf8');

code = code.replace(/EventBus\.on\('CM_HAS_BALL'/g, "if (!this._eventBusBoundCM) { this._eventBusBoundCM = true; EventBus.on('CM_HAS_BALL'");
code = code.replace(/aplicar\(mesmoB, 10\);\n            \}\);\n/g, "aplicar(mesmoB, 10);\n            }); }\n");

fs.writeFileSync('js/match.js', code);
console.log("Patched match cm!");
