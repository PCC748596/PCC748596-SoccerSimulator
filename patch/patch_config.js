const fs = require('fs');
let code = fs.readFileSync('js/config.js', 'utf8');

const target = `    amplitude: {
        short: 0.60,          // 60%
        median: 0.70,         // 70%
        large: 0.80           // 80%
    },`;

const replacement = `    amplitude: {
        short: 0.60,          // 60%
        median: 0.70,         // 70%
        large: 0.80           // 80%
    },

    /*
    Basculação do bloco: que fracção da posição lateral da bola o centro do 
    bloco acompanha (reduz o "magnetismo" para ancorar a equipa no centro).
    Amarrado ao Width Compactness a pedido do utilizador.
    */
    basculacao: {
        short: 0.60,
        median: 0.70,
        large: 0.80
    },`;

if(code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync('js/config.js', code);
    console.log("Patched config.js successfully!");
} else {
    console.log("Target not found in config.js!");
}
