const fs = require('fs');
let code = fs.readFileSync('js/bt/team_bt.js', 'utf8');

// Insert after profMaxG logic
code = code.replace(
/if \(z1 - z0 > profMaxG\) z0 = z1 - profMaxG;\n    \}/g,
`if (z1 - z0 > profMaxG) z0 = z1 - profMaxG;
    }
    
    // Hard cap: a traseira do bloco nunca ultrapassa a Linha Defensiva configurada
    const tectoAbsoluto = TeamShape.linhaDefensiva[Tatics.linhaDefensiva] ?? TeamShape.linhaDefensiva.medium;
    if (z0 > tectoAbsoluto) {
        z0 = tectoAbsoluto;
        if (z1 - z0 < profMinG) z1 = z0 + profMinG;
    }`
);

fs.writeFileSync('js/bt/team_bt.js', code);
