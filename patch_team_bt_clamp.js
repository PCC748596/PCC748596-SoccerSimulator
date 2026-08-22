const fs = require('fs');
let code = fs.readFileSync('js/bt/team_bt.js', 'utf8');

// The offset is currently -7.0 from the previous patch. That is correct!
// We just need to stop the opponent striker from pulling the block forward.
const target = "const z0Novo = recuoDaUltimaLinha(z0, maisRecuadoDirSuave, distMarca, pisoDir, tectoDir);";
const replacement = "const z0Novo = recuoDaUltimaLinha(z0, null, distMarca, pisoDir, tectoDir); // Ignore opponent striker pull";

code = code.replace(target, replacement);
fs.writeFileSync('js/bt/team_bt.js', code);

let index = fs.readFileSync('index.html', 'utf8');
index = index.replace(/0\.0586/g, '0.0587');
fs.writeFileSync('index.html', index);

console.log("Patched clamp!");
