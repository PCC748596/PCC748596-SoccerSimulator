const fs = require('fs');
let code = fs.readFileSync('js/utils.js', 'utf8');

const target = `    const alvo = (k * vAlvo * vAlvo + atrito) * Math.exp(2 * k * dist) - atrito;
    // Tecto: acima disto o passe rasteiro vira disparo.
    return Math.min(18.5, Math.sqrt(Math.max(0, alvo / k)));`;

const replacement = `    const alvo = (k * vAlvo * vAlvo + atrito) * Math.exp(2 * k * dist) - atrito;
    // Aumento global de 10% na velocidade do passe rasteiro
    let initialSpeed = Math.sqrt(Math.max(0, alvo / k)) * 1.10;
    // Tecto também ajustado em 10% para não cortar passes longos rápidos
    return Math.min(20.35, initialSpeed);`;

if(code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync('js/utils.js', code);
    console.log("Patched utils.js successfully!");
} else {
    console.log("Target not found!");
}
