const fs = require('fs');
let code = fs.readFileSync('js/bt/player_bt.js', 'utf8');

code = code.replace(
    /if \(this\.zoneAhead <= CarryModel\.zonaLivre\) return false;/,
    `// Se o jogador estiver isolado em direçao ao gol (já rompeu a linha adversaria),
        // ele DEVE continuar a conduzir para a baliza, sem ser limitado pelo orçamento nem pela vel max.
        const oppLine = this.oppBB.defLineDir;
        if (oppLine !== undefined && oppLine !== null) {
            const linhaNoNosso = -oppLine;
            // Se ele estiver à frente da linha defensiva adversária e tiver caminho para a baliza:
            if (this.zoneAhead > linhaNoNosso + 1.0 && this.livreAFrente10m20g) return true;
        }

        if (this.zoneAhead <= CarryModel.zonaLivre) return false;`
);

fs.writeFileSync('js/bt/player_bt.js', code);
console.log('Patched campoAberto');
