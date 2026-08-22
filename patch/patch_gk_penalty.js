const fs = require('fs');

let code = fs.readFileSync('js/player.js', 'utf8');

const targetStr = `            } else {
                // Marcado de perto (distMarcador < 2.5). Penalização severa.
                if (inDefensiveZone || isDefender) {
                    score -= 550; // Erro fatal na defesa (aumentada em 10%)
                } else {
                    score -= 165; // Aumentada em 10%
                }
            }`;

const replaceStr = `            } else {
                // Marcado de perto (distMarcador < 2.5). Penalização severa.
                if (this.role === 'gk') {
                    score -= 605; // Erro fatal do goleiro (aumentada em mais 10%)
                } else if (inDefensiveZone || isDefender) {
                    score -= 550; // Erro fatal na defesa (aumentada em 10%)
                } else {
                    score -= 165; // Aumentada em 10%
                }
            }`;

if (code.includes(targetStr)) {
    code = code.replace(targetStr, replaceStr);
    fs.writeFileSync('js/player.js', code);
    console.log("Patched GK pass penalty!");
} else {
    console.log("Target not found!");
}
