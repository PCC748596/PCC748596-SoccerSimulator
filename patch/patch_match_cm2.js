const fs = require('fs');
let code = fs.readFileSync('js/match.js', 'utf8');

const bad = `                aplicar(mesmoM, 5);
                aplicar(mesmoB, 10);
                aplicar(outroCM, -4);
                aplicar(opostoM, 3);
            });
        }`;

const good = `                aplicar(mesmoM, 5);
                aplicar(mesmoB, 10);
                aplicar(outroCM, -4);
                aplicar(opostoM, 3);
            }); }`;

code = code.replace(bad, good);
fs.writeFileSync('js/match.js', code);
console.log("Patched CM properly!");
