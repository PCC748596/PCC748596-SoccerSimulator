const fs = require('fs');
let code = fs.readFileSync('js/bt/player_bt.js', 'utf8');

code = code.replace(
    /const limite = \(typeof CarryModel\.conduzirSoAcimaDe === 'number'\)\s*\? CarryModel\.conduzirSoAcimaDe : -Infinity;/,
    `// MODIFICADO: Se for avançado ou extremo e não houver ninguém à frente até a baliza, OBRIGA a conduzir (vai pro gol!)
                    const p = ctx.p;
                    if ((p.pos === 'CF' || p.pos === 'ST' || p.pos === 'SS' || p.pos === 'LW' || p.pos === 'RW' || p.pos === 'AM') && ctx.livreAFrente10m20g && ctx.zoneAhead > 0) {
                        return true; 
                    }
                    
                    const limite = (typeof CarryModel.conduzirSoAcimaDe === 'number')
                        ? CarryModel.conduzirSoAcimaDe : -Infinity;`
);

fs.writeFileSync('js/bt/player_bt.js', code);
console.log('Patched ConduzirEmEspaco to force attackers to carry when free');
