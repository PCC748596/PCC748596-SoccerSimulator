const fs = require('fs');
let code = fs.readFileSync('js/config.js', 'utf8');
code = code.replace(
    /function recuoDaUltimaLinha\([^]*?return z;\n}/,
    `function recuoDaUltimaLinha(z0Dir, maisRecuadoDir, distancia, pisoDir, tectoDir) {
    let z = z0Dir;
    if (maisRecuadoDir !== null && maisRecuadoDir !== undefined) {
        const atrasDoHomem = maisRecuadoDir - distancia;
        if (z < atrasDoHomem) z = atrasDoHomem;
    }
    if (tectoDir !== null && tectoDir !== undefined && z > tectoDir) z = tectoDir;
    if (z < pisoDir) z = pisoDir;
    return z;
}`
);
fs.writeFileSync('js/config.js', code);
