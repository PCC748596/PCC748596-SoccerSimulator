const fs = require('fs');
let code = fs.readFileSync('js/config.js', 'utf8');

const target = `const SupportModel = {
    maxPorLado: 1,`;

const replacement = `const SupportModel = {
    maxPorLado: 0, // Desabilitado a pedido do utilizador (era 1)`;

if(code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync('js/config.js', code);
    console.log("Patched config.js successfully!");
} else {
    console.log("Target not found in config.js!");
}
