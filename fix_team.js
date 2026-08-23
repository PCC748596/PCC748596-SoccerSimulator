const fs = require('fs');
let code = fs.readFileSync('js/bt/team_bt.js', 'utf8');
code = code.replace(
    /if \(Math\.abs\(bb\[keyOffset\]\) > 0\.05\) {[\s\S]*?z1 = z0 \+ profundidade;\n        } else {\n            bb\[keyOffset\] = 0;\n        }/,
    `if (Math.abs(bb[keyOffset]) > 0.05) {
            z0 += bb[keyOffset];
        } else {
            bb[keyOffset] = 0;
        }
        // Permite que o bloco estique (quando a defesa segura a linha), mas NUNCA encolhe.
        z1 = Math.max(z1, z0 + profundidade);`
);
fs.writeFileSync('js/bt/team_bt.js', code);
